import { csvEscapeField } from "./csv-utils.js";

// ============================================================================
// TOOL 26: flow_live_data — REAL-TIME PUBLIC DATA FOR 3D VISUALIZATION
// ============================================================================

export interface LiveDataInput {
  source: "earthquakes" | "weather_stations" | "world_indicators";
  /** For earthquakes: minimum magnitude (default 4.0) */
  min_magnitude?: number;
  /** Time range in days looking back from now (default 7, max 30) */
  days?: number;
  /** For world_indicators: indicator code (e.g., "SP.POP.TOTL") */
  indicator?: string;
  /** Max rows to return (default 500, max 5000) */
  max_rows?: number;
}

export interface LiveDataResult {
  csv: string;
  source: string;
  source_url: string;
  rows: number;
  columns: string[];
  description: string;
  suggested_template: string;
  timestamp: string;
}

const FETCH_TIMEOUT = 15_000;

function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ============================================================================
// USGS Earthquake Data
// ============================================================================

interface USGSFeature {
  properties: {
    mag: number;
    place: string;
    time: number;
    type: string;
    status: string;
    tsunami: number;
    sig: number;
    magType: string;
    title: string;
  };
  geometry: {
    coordinates: [number, number, number]; // [lng, lat, depth]
  };
}

async function fetchEarthquakes(input: LiveDataInput): Promise<LiveDataResult> {
  const days = Math.min(Math.max(input.days ?? 7, 1), 30);
  const minMag = input.min_magnitude ?? 4.0;
  const maxRows = Math.min(input.max_rows ?? 500, 5000);

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startStr}&endtime=${endStr}&minmagnitude=${minMag}&limit=${maxRows}&orderby=magnitude`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`USGS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { features: USGSFeature[]; metadata: { count: number; title: string } };
  const features = data.features;

  if (features.length === 0) {
    return {
      csv: "id,latitude,longitude,magnitude,depth_km,place,time,type\n",
      source: "USGS Earthquake Hazards Program",
      source_url: url,
      rows: 0,
      columns: ["id", "latitude", "longitude", "magnitude", "depth_km", "place", "time", "type"],
      description: `No earthquakes found above magnitude ${minMag} in the last ${days} days.`,
      suggested_template: "3D Geographic Scatter",
      timestamp: new Date().toISOString(),
    };
  }

  const headers = ["id", "latitude", "longitude", "magnitude", "depth_km", "place", "time", "type", "significance", "tsunami_alert"];
  const rows = features.map((f, i) => {
    const p = f.properties;
    const g = f.geometry.coordinates;
    const timeStr = new Date(p.time).toISOString();
    return [
      csvEscapeField(`EQ-${i + 1}`),
      String(g[1]), // lat
      String(g[0]), // lng
      String(p.mag),
      String(g[2]), // depth
      csvEscapeField(p.place || "Unknown"),
      csvEscapeField(timeStr),
      csvEscapeField(p.type || "earthquake"),
      String(p.sig),
      String(p.tsunami),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return {
    csv,
    source: "USGS Earthquake Hazards Program",
    source_url: url,
    rows: features.length,
    columns: headers,
    description: `${features.length} earthquakes (M${minMag}+) from ${startStr} to ${endStr}. Largest: M${features[0]?.properties.mag} ${features[0]?.properties.place}.`,
    suggested_template: "3D Geographic Scatter",
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Open-Meteo Weather Stations (global weather, no API key needed)
// ============================================================================

interface WeatherResponse {
  latitude: number;
  longitude: number;
  current: {
    temperature_2m: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
    weather_code: number;
    precipitation: number;
  };
}

const MAJOR_CITIES = [
  { name: "New York", lat: 40.71, lng: -74.01, country: "US" },
  { name: "London", lat: 51.51, lng: -0.13, country: "UK" },
  { name: "Tokyo", lat: 35.68, lng: 139.69, country: "Japan" },
  { name: "Paris", lat: 48.86, lng: 2.35, country: "France" },
  { name: "Sydney", lat: -33.87, lng: 151.21, country: "Australia" },
  { name: "São Paulo", lat: -23.55, lng: -46.63, country: "Brazil" },
  { name: "Mumbai", lat: 19.08, lng: 72.88, country: "India" },
  { name: "Beijing", lat: 39.90, lng: 116.40, country: "China" },
  { name: "Cairo", lat: 30.04, lng: 31.24, country: "Egypt" },
  { name: "Moscow", lat: 55.76, lng: 37.62, country: "Russia" },
  { name: "Lagos", lat: 6.52, lng: 3.38, country: "Nigeria" },
  { name: "Mexico City", lat: 19.43, lng: -99.13, country: "Mexico" },
  { name: "Istanbul", lat: 41.01, lng: 28.98, country: "Turkey" },
  { name: "Buenos Aires", lat: -34.60, lng: -58.38, country: "Argentina" },
  { name: "Nairobi", lat: -1.29, lng: 36.82, country: "Kenya" },
  { name: "Seoul", lat: 37.57, lng: 126.98, country: "South Korea" },
  { name: "Bangkok", lat: 13.76, lng: 100.50, country: "Thailand" },
  { name: "Jakarta", lat: -6.21, lng: 106.85, country: "Indonesia" },
  { name: "Berlin", lat: 52.52, lng: 13.41, country: "Germany" },
  { name: "Toronto", lat: 43.65, lng: -79.38, country: "Canada" },
  { name: "Dubai", lat: 25.20, lng: 55.27, country: "UAE" },
  { name: "Singapore", lat: 1.35, lng: 103.82, country: "Singapore" },
  { name: "Johannesburg", lat: -26.20, lng: 28.05, country: "South Africa" },
  { name: "Lima", lat: -12.05, lng: -77.04, country: "Peru" },
  { name: "Manila", lat: 14.60, lng: 120.98, country: "Philippines" },
  { name: "Santiago", lat: -33.45, lng: -70.67, country: "Chile" },
  { name: "Riyadh", lat: 24.71, lng: 46.68, country: "Saudi Arabia" },
  { name: "Stockholm", lat: 59.33, lng: 18.07, country: "Sweden" },
  { name: "Oslo", lat: 59.91, lng: 10.75, country: "Norway" },
  { name: "Auckland", lat: -36.85, lng: 174.76, country: "New Zealand" },
];

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
};

async function fetchWeatherStations(input: LiveDataInput): Promise<LiveDataResult> {
  const maxRows = Math.min(input.max_rows ?? 30, MAJOR_CITIES.length);
  const cities = MAJOR_CITIES.slice(0, maxRows);

  // Batch fetch using Open-Meteo (free, no API key)
  const lats = cities.map((c) => c.lat).join(",");
  const lngs = cities.map((c) => c.lng).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&timezone=auto`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as WeatherResponse[];
  const weatherArray = Array.isArray(data) ? data : [data];

  const headers = ["city", "country", "latitude", "longitude", "temperature_c", "humidity_pct", "wind_speed_kmh", "precipitation_mm", "weather_condition"];
  const rows = weatherArray.map((w, i) => {
    const city = cities[i];
    const code = w.current?.weather_code ?? 0;
    return [
      csvEscapeField(city.name),
      csvEscapeField(city.country),
      String(w.latitude ?? city.lat),
      String(w.longitude ?? city.lng),
      String(w.current?.temperature_2m ?? 0),
      String(w.current?.relative_humidity_2m ?? 0),
      String(w.current?.wind_speed_10m ?? 0),
      String(w.current?.precipitation ?? 0),
      csvEscapeField(WEATHER_CODES[code] || `Code ${code}`),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return {
    csv,
    source: "Open-Meteo Weather API",
    source_url: "https://open-meteo.com/",
    rows: weatherArray.length,
    columns: headers,
    description: `Current weather for ${weatherArray.length} major cities worldwide. Temperature, humidity, wind, precipitation, and conditions.`,
    suggested_template: "3D Geographic Scatter",
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// World Bank Development Indicators
// ============================================================================

interface WBIndicatorEntry {
  country: { id: string; value: string };
  date: string;
  value: number | null;
}

const DEFAULT_INDICATOR = "SP.POP.TOTL"; // Total population

async function fetchWorldIndicators(input: LiveDataInput): Promise<LiveDataResult> {
  const indicator = input.indicator ?? DEFAULT_INDICATOR;
  const maxRows = Math.min(input.max_rows ?? 500, 5000);

  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=${maxRows}&date=2020:2024&source=2`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`World Bank API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as [{ total: number; page: number }, WBIndicatorEntry[]];
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
    throw new Error("Unexpected World Bank API response format");
  }

  const entries = data[1].filter((e) => e.value !== null);

  if (entries.length === 0) {
    return {
      csv: "country,country_code,year,value\n",
      source: "World Bank Open Data",
      source_url: url,
      rows: 0,
      columns: ["country", "country_code", "year", "value"],
      description: `No data found for indicator ${indicator}.`,
      suggested_template: "3D Bar Chart",
      timestamp: new Date().toISOString(),
    };
  }

  const headers = ["country", "country_code", "year", "value"];
  const rows = entries.map((e) =>
    [
      csvEscapeField(e.country.value),
      csvEscapeField(e.country.id),
      csvEscapeField(e.date),
      String(e.value),
    ].join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return {
    csv,
    source: "World Bank Open Data",
    source_url: url,
    rows: entries.length,
    columns: headers,
    description: `${entries.length} data points for indicator "${indicator}" (2020-2024). ${entries.length} countries with values.`,
    suggested_template: "3D Bar Chart",
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Main dispatcher
// ============================================================================

export async function flowLiveData(input: LiveDataInput): Promise<LiveDataResult> {
  switch (input.source) {
    case "earthquakes":
      return fetchEarthquakes(input);
    case "weather_stations":
      return fetchWeatherStations(input);
    case "world_indicators":
      return fetchWorldIndicators(input);
    default:
      throw new Error(`Unknown source: ${input.source}. Supported: earthquakes, weather_stations, world_indicators`);
  }
}
