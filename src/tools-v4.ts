import { csvEscapeField, parseCSVLine } from "./csv-utils.js";

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

// ============================================================================
// TOOL 27: flow_correlation_matrix — PAIRWISE PEARSON CORRELATIONS
// ============================================================================

export interface CorrelationMatrixInput {
  csv_content: string;
  /** Specific columns to correlate. If omitted, all numeric columns are used. */
  columns?: string[];
}

export interface CorrelationPair {
  column_a: string;
  column_b: string;
  correlation: number;
}

export interface CorrelationMatrixResult {
  matrix_csv: string;
  matrix: number[][];
  columns: string[];
  strongest_correlations: CorrelationPair[];
  rows_analyzed: number;
}

function parseCsvToRows(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return { headers: parseCSVLine(lines[0] || ""), rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCSVLine(line));
  return { headers, rows };
}

function identifyNumericColumns(headers: string[], rows: string[][]): string[] {
  return headers.filter((_, colIdx) => {
    let numericCount = 0;
    let total = 0;
    for (const row of rows) {
      const val = row[colIdx]?.trim();
      if (val === undefined || val === "") continue;
      total++;
      if (!isNaN(Number(val))) numericCount++;
    }
    // Column is numeric if >50% of non-empty values parse as numbers
    return total > 0 && numericCount / total > 0.5;
  });
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  // Pair up values, skip where either is NaN
  const pairs: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) {
      pairs.push([xs[i], ys[i]]);
    }
  }
  const n = pairs.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0;
  for (const [x, y] of pairs) { sumX += x; sumY += y; }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0, varX = 0, varY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

export function flowCorrelationMatrix(input: CorrelationMatrixInput): CorrelationMatrixResult {
  const { headers, rows } = parseCsvToRows(input.csv_content);

  // Determine which columns to use
  const allNumeric = identifyNumericColumns(headers, rows);
  const selectedColumns = input.columns
    ? input.columns.filter((c) => allNumeric.includes(c))
    : allNumeric;

  if (selectedColumns.length === 0) {
    throw new Error("No numeric columns found in CSV data");
  }

  // Extract numeric data arrays
  const colIndices = selectedColumns.map((c) => headers.indexOf(c));
  const data: number[][] = colIndices.map((ci) =>
    rows.map((row) => {
      const val = row[ci]?.trim();
      return val === undefined || val === "" ? NaN : Number(val);
    })
  );

  // Compute correlation matrix
  const n = selectedColumns.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const r = pearsonCorrelation(data[i], data[j]);
      const rounded = Math.round(r * 10000) / 10000;
      matrix[i][j] = rounded;
      matrix[j][i] = rounded;
    }
  }

  // Build matrix CSV
  const matrixHeader = ["column", ...selectedColumns].join(",");
  const matrixRows = selectedColumns.map((col, i) =>
    [csvEscapeField(col), ...matrix[i].map(String)].join(",")
  );
  const matrixCsv = [matrixHeader, ...matrixRows].join("\n");

  // Find strongest correlations (off-diagonal)
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({
        column_a: selectedColumns[i],
        column_b: selectedColumns[j],
        correlation: matrix[i][j],
      });
    }
  }
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    matrix_csv: matrixCsv,
    matrix,
    columns: selectedColumns,
    strongest_correlations: pairs.slice(0, 10),
    rows_analyzed: rows.length,
  };
}

// ============================================================================
// TOOL 28: flow_cluster_data — K-MEANS CLUSTERING
// ============================================================================

export interface ClusterDataInput {
  csv_content: string;
  /** Number of clusters. If omitted, auto-selected via silhouette scoring (2-8). */
  k?: number;
  /** Columns to use for clustering. If omitted, all numeric columns are used. */
  columns?: string[];
  /** Maximum iterations for k-means (default 100). */
  max_iterations?: number;
}

export interface ClusterCentroid {
  cluster: number;
  size: number;
  center: Record<string, number>;
}

export interface ClusterDataResult {
  csv: string;
  k: number;
  rows: number;
  columns_used: string[];
  centroids: ClusterCentroid[];
  silhouette_score: number;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function kMeans(
  data: number[][],
  k: number,
  maxIter: number
): { assignments: number[]; centroids: number[][] } {
  const n = data.length;
  const dims = data[0].length;

  // Initialize centroids using k-means++ style (spread out initial picks)
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  // First centroid: random
  let idx = Math.floor(Math.random() * n);
  centroids.push([...data[idx]]);
  usedIndices.add(idx);

  // Remaining centroids: pick point farthest from existing centroids
  for (let c = 1; c < k; c++) {
    let maxDist = -1;
    let bestIdx = 0;
    for (let i = 0; i < n; i++) {
      if (usedIndices.has(i)) continue;
      let minDistToCentroid = Infinity;
      for (const centroid of centroids) {
        const d = euclideanDistance(data[i], centroid);
        if (d < minDistToCentroid) minDistToCentroid = d;
      }
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        bestIdx = i;
      }
    }
    centroids.push([...data[bestIdx]]);
    usedIndices.add(bestIdx);
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDistance(data[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Recompute centroids
    const sums: number[][] = Array.from({ length: k }, () => new Array(dims).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dims; d++) {
        sums[c][d] += data[i][d];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  return { assignments, centroids };
}

function silhouetteScore(data: number[][], assignments: number[], k: number): number {
  if (k <= 1 || data.length <= k) return 0;

  const n = data.length;
  let totalScore = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];

    // a(i) = mean distance to points in same cluster
    let aSum = 0, aCount = 0;
    for (let j = 0; j < n; j++) {
      if (j !== i && assignments[j] === myCluster) {
        aSum += euclideanDistance(data[i], data[j]);
        aCount++;
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;

    // b(i) = min mean distance to points in other clusters
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      let bSum = 0, bCount = 0;
      for (let j = 0; j < n; j++) {
        if (assignments[j] === c) {
          bSum += euclideanDistance(data[i], data[j]);
          bCount++;
        }
      }
      if (bCount > 0) {
        const meanDist = bSum / bCount;
        if (meanDist < b) b = meanDist;
      }
    }
    if (b === Infinity) b = 0;

    const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
    totalScore += s;
  }

  return totalScore / n;
}

export function flowClusterData(input: ClusterDataInput): ClusterDataResult {
  const { headers, rows } = parseCsvToRows(input.csv_content);
  const maxIter = input.max_iterations ?? 100;

  // Determine columns
  const allNumeric = identifyNumericColumns(headers, rows);
  const selectedColumns = input.columns
    ? input.columns.filter((c) => headers.includes(c))
    : allNumeric;

  if (selectedColumns.length === 0) {
    throw new Error("No valid numeric columns found for clustering");
  }

  // Check requested columns are numeric
  if (input.columns) {
    for (const col of input.columns) {
      if (!headers.includes(col)) {
        throw new Error(`Column "${col}" not found in CSV`);
      }
    }
  }

  const colIndices = selectedColumns.map((c) => headers.indexOf(c));

  // Extract numeric data, handling missing values
  const validRowIndices: number[] = [];
  const data: number[][] = [];

  for (let r = 0; r < rows.length; r++) {
    const point: number[] = [];
    let valid = true;
    for (const ci of colIndices) {
      const val = rows[r][ci]?.trim();
      if (val === undefined || val === "" || isNaN(Number(val))) {
        valid = false;
        break;
      }
      point.push(Number(val));
    }
    if (valid) {
      validRowIndices.push(r);
      data.push(point);
    }
  }

  if (data.length < 2) {
    throw new Error("Need at least 2 valid data points for clustering");
  }

  // Normalize data for clustering (z-score per column)
  const dims = selectedColumns.length;
  const means = new Array(dims).fill(0);
  const stds = new Array(dims).fill(0);

  for (const point of data) {
    for (let d = 0; d < dims; d++) means[d] += point[d];
  }
  for (let d = 0; d < dims; d++) means[d] /= data.length;

  for (const point of data) {
    for (let d = 0; d < dims; d++) stds[d] += (point[d] - means[d]) ** 2;
  }
  for (let d = 0; d < dims; d++) stds[d] = Math.sqrt(stds[d] / data.length) || 1;

  const normalizedData = data.map((point) =>
    point.map((val, d) => (val - means[d]) / stds[d])
  );

  // Determine k
  let bestK = input.k ?? 2;
  let bestScore = -1;

  if (input.k === undefined) {
    // Auto-select k using silhouette scoring
    const maxK = Math.min(8, Math.floor(data.length / 2));
    for (let tryK = 2; tryK <= maxK; tryK++) {
      const { assignments } = kMeans(normalizedData, tryK, maxIter);
      const score = silhouetteScore(normalizedData, assignments, tryK);
      if (score > bestScore) {
        bestScore = score;
        bestK = tryK;
      }
    }
  }

  // Final clustering with best k
  const { assignments, centroids: normalizedCentroids } = kMeans(normalizedData, bestK, maxIter);

  // Denormalize centroids
  const centroids = normalizedCentroids.map((c) =>
    c.map((val, d) => val * stds[d] + means[d])
  );

  // Compute distances to centroids (in original space)
  const distances: number[] = [];
  for (let i = 0; i < data.length; i++) {
    distances.push(euclideanDistance(data[i], centroids[assignments[i]]));
  }

  // Build output CSV: original columns + _cluster + _distance_to_centroid
  const outHeaders = [...headers, "_cluster", "_distance_to_centroid"];
  const outLines = [outHeaders.join(",")];

  // Map valid rows back to original row indices
  const clusterMap = new Map<number, { cluster: number; distance: number }>();
  for (let i = 0; i < validRowIndices.length; i++) {
    clusterMap.set(validRowIndices[i], {
      cluster: assignments[i],
      distance: Math.round(distances[i] * 10000) / 10000,
    });
  }

  for (let r = 0; r < rows.length; r++) {
    const info = clusterMap.get(r);
    if (info) {
      const escapedFields = rows[r].map((f) => csvEscapeField(f));
      outLines.push([...escapedFields, String(info.cluster), String(info.distance)].join(","));
    }
  }

  // Build centroid metadata
  const centroidMeta: ClusterCentroid[] = [];
  for (let c = 0; c < bestK; c++) {
    const size = assignments.filter((a) => a === c).length;
    const center: Record<string, number> = {};
    for (let d = 0; d < dims; d++) {
      center[selectedColumns[d]] = Math.round(centroids[c][d] * 10000) / 10000;
    }
    centroidMeta.push({ cluster: c, size, center });
  }

  // Compute final silhouette score
  const finalSilhouette = bestK > 1
    ? silhouetteScore(normalizedData, assignments, bestK)
    : 0;

  return {
    csv: outLines.join("\n"),
    k: bestK,
    rows: validRowIndices.length,
    columns_used: selectedColumns,
    centroids: centroidMeta,
    silhouette_score: Math.round(finalSilhouette * 10000) / 10000,
  };
}

// ============================================================================
// TOOL 29: flow_hierarchical_data — FLAT DATA → TREE STRUCTURE
// ============================================================================

export interface HierarchicalDataInput {
  csv_content: string;
  /** Columns defining the hierarchy levels (e.g. ["continent", "country", "city"]). Order = depth order. */
  hierarchy_columns: string[];
  /** Column to aggregate as node value (sum at parent levels). Optional. */
  value_column?: string;
  /** Name for the root node (default "Root"). */
  root_name?: string;
}

export interface HierarchicalDataResult {
  csv: string;
  total_nodes: number;
  depth: number;
  suggested_template: string;
}

export function flowHierarchicalData(input: HierarchicalDataInput): HierarchicalDataResult {
  if (!input.hierarchy_columns || input.hierarchy_columns.length === 0) {
    throw new Error("hierarchy_columns must be a non-empty array");
  }

  const { headers, rows } = parseCsvToRows(input.csv_content);

  // Validate columns exist
  for (const col of input.hierarchy_columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found in CSV. Available: ${headers.join(", ")}`);
    }
  }

  const colIndices = input.hierarchy_columns.map((c) => headers.indexOf(c));
  const valueIdx = input.value_column ? headers.indexOf(input.value_column) : -1;
  const rootName = input.root_name ?? "Root";

  // Build tree structure
  // Each node: { id, parentId, children: Set<string>, value }
  interface TreeNode {
    id: string;
    parentId: string | null;
    children: Set<string>;
    value: number;
    level: number;
    label: string;
  }

  const nodes = new Map<string, TreeNode>();

  // Create root
  nodes.set(rootName, {
    id: rootName,
    parentId: null,
    children: new Set(),
    value: 0,
    level: 0,
    label: rootName,
  });

  // Process each row
  for (const row of rows) {
    let parentId = rootName;

    for (let level = 0; level < colIndices.length; level++) {
      const rawValue = row[colIndices[level]]?.trim() || "Unknown";
      // Create unique node ID by prefixing with parent path to handle duplicates
      const nodeId = level === 0 ? rawValue : `${parentId}/${rawValue}`;
      const displayLabel = rawValue;

      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          parentId,
          children: new Set(),
          value: 0,
          level: level + 1,
          label: displayLabel,
        });
        // Add to parent's children
        const parent = nodes.get(parentId);
        if (parent) parent.children.add(nodeId);
      }

      // Add value at leaf level (deepest hierarchy column)
      if (level === colIndices.length - 1 && valueIdx >= 0) {
        const val = Number(row[valueIdx]?.trim());
        if (!isNaN(val)) {
          const node = nodes.get(nodeId)!;
          node.value += val;
        }
      }

      parentId = nodeId;
    }
  }

  // Aggregate values bottom-up (leaf values sum to parents)
  if (valueIdx >= 0) {
    const maxLevel = input.hierarchy_columns.length;
    for (let level = maxLevel; level >= 0; level--) {
      for (const node of nodes.values()) {
        if (node.level === level && node.children.size > 0) {
          let childSum = 0;
          for (const childId of node.children) {
            const child = nodes.get(childId);
            if (child) childSum += child.value;
          }
          node.value = childSum;
        }
      }
    }
  }

  // Build output CSV in Flow network format: id, connections, label, level, value
  const outHeaders = ["id", "connections", "label", "level"];
  if (valueIdx >= 0) outHeaders.push("value");

  const outLines = [outHeaders.join(",")];

  // Sort nodes by level then by id for consistent output
  const sortedNodes = Array.from(nodes.values()).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.id.localeCompare(b.id);
  });

  for (const node of sortedNodes) {
    const connections = node.children.size > 0
      ? Array.from(node.children).join("|")
      : "";

    const fields = [
      csvEscapeField(node.id),
      csvEscapeField(connections),
      csvEscapeField(node.label),
      String(node.level),
    ];
    if (valueIdx >= 0) fields.push(String(node.value));

    outLines.push(fields.join(","));
  }

  const depth = input.hierarchy_columns.length + 1; // +1 for root

  return {
    csv: outLines.join("\n"),
    total_nodes: nodes.size,
    depth,
    suggested_template: "3D Network Graph",
  };
}

// ============================================================================
// TOOL 30: flow_compare_datasets — SIDE-BY-SIDE DATASET COMPARISON
// ============================================================================

export interface CompareDataInput {
  csv_a: string;
  csv_b: string;
  /** Column to use as row key for matching. If omitted, first column is used. */
  key_column?: string;
}

export interface ColumnDelta {
  column: string;
  mean_a: number;
  mean_b: number;
  delta: number;
  delta_pct: number;
}

export interface CompareDataResult {
  csv: string;
  key_column: string;
  total_rows_a: number;
  total_rows_b: number;
  added_rows: number;
  removed_rows: number;
  changed_rows: number;
  unchanged_rows: number;
  column_deltas: ColumnDelta[];
  summary: string;
}

export function flowCompareDatasets(input: CompareDataInput): CompareDataResult {
  const parsedA = parseCsvToRows(input.csv_a);
  const parsedB = parseCsvToRows(input.csv_b);

  // Determine key column
  const keyCol = input.key_column ?? parsedA.headers[0];
  const keyIdxA = parsedA.headers.indexOf(keyCol);
  const keyIdxB = parsedB.headers.indexOf(keyCol);

  if (keyIdxA < 0) {
    throw new Error(`Key column "${keyCol}" not found in dataset A. Available: ${parsedA.headers.join(", ")}`);
  }
  if (keyIdxB < 0) {
    throw new Error(`Key column "${keyCol}" not found in dataset B. Available: ${parsedB.headers.join(", ")}`);
  }

  // Build lookup maps by key
  const mapA = new Map<string, string[]>();
  for (const row of parsedA.rows) {
    const key = row[keyIdxA]?.trim() ?? "";
    mapA.set(key, row);
  }

  const mapB = new Map<string, string[]>();
  for (const row of parsedB.rows) {
    const key = row[keyIdxB]?.trim() ?? "";
    mapB.set(key, row);
  }

  // Find common columns (excluding key)
  const commonCols = parsedA.headers.filter(
    (h) => h !== keyCol && parsedB.headers.includes(h)
  );

  // Classify rows
  let added = 0, removed = 0, changed = 0, unchanged = 0;

  type DiffRow = { key: string; status: string; values: string[] };
  const diffRows: DiffRow[] = [];

  // Check A rows
  for (const [key, rowA] of mapA) {
    const rowB = mapB.get(key);
    if (!rowB) {
      removed++;
      diffRows.push({ key, status: "removed", values: rowA });
    } else {
      // Compare common columns
      let hasChange = false;
      for (const col of commonCols) {
        const idxA = parsedA.headers.indexOf(col);
        const idxB = parsedB.headers.indexOf(col);
        if ((rowA[idxA]?.trim() ?? "") !== (rowB[idxB]?.trim() ?? "")) {
          hasChange = true;
          break;
        }
      }
      if (hasChange) {
        changed++;
        diffRows.push({ key, status: "changed", values: rowB });
      } else {
        unchanged++;
        diffRows.push({ key, status: "unchanged", values: rowA });
      }
    }
  }

  // Check B-only rows (added)
  for (const [key, rowB] of mapB) {
    if (!mapA.has(key)) {
      added++;
      diffRows.push({ key, status: "added", values: rowB });
    }
  }

  // Build output CSV using A's headers + _diff_status
  const outHeaders = [...parsedA.headers, "_diff_status"];
  const outLines = [outHeaders.join(",")];

  for (const dr of diffRows) {
    // For added rows, map B columns to A headers
    const fields: string[] = [];
    for (const header of parsedA.headers) {
      if (dr.status === "added") {
        const bIdx = parsedB.headers.indexOf(header);
        fields.push(csvEscapeField(bIdx >= 0 ? (dr.values[bIdx] ?? "") : ""));
      } else {
        const aIdx = parsedA.headers.indexOf(header);
        if (dr.status === "changed") {
          // Use B's values for changed rows
          const bIdx = parsedB.headers.indexOf(header);
          fields.push(csvEscapeField(bIdx >= 0 ? (mapB.get(dr.key)?.[bIdx] ?? dr.values[aIdx] ?? "") : (dr.values[aIdx] ?? "")));
        } else {
          fields.push(csvEscapeField(dr.values[aIdx] ?? ""));
        }
      }
    }
    fields.push(dr.status);
    outLines.push(fields.join(","));
  }

  // Compute numeric column deltas
  const numericCols = identifyNumericColumns(parsedA.headers, parsedA.rows);
  const commonNumeric = numericCols.filter((c) => c !== keyCol && parsedB.headers.includes(c));

  const columnDeltas: ColumnDelta[] = [];
  for (const col of commonNumeric) {
    const idxA = parsedA.headers.indexOf(col);
    const idxB = parsedB.headers.indexOf(col);

    const valsA = parsedA.rows.map(r => Number(r[idxA]?.trim())).filter(v => !isNaN(v));
    const valsB = parsedB.rows.map(r => Number(r[idxB]?.trim())).filter(v => !isNaN(v));

    if (valsA.length === 0 && valsB.length === 0) continue;

    const meanA = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : 0;
    const meanB = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : 0;
    const delta = meanB - meanA;
    const deltaPct = meanA !== 0 ? (delta / meanA) * 100 : 0;

    columnDeltas.push({
      column: col,
      mean_a: Math.round(meanA * 100) / 100,
      mean_b: Math.round(meanB * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      delta_pct: Math.round(deltaPct * 100) / 100,
    });
  }

  const total = added + removed + changed + unchanged;
  const summary = `Compared ${parsedA.rows.length} rows (A) vs ${parsedB.rows.length} rows (B) on key "${keyCol}". ` +
    `${unchanged} unchanged, ${changed} changed, ${added} added, ${removed} removed. ` +
    `${total} total unique keys.` +
    (columnDeltas.length > 0
      ? ` Numeric deltas: ${columnDeltas.map(d => `${d.column} ${d.delta >= 0 ? "+" : ""}${d.delta} (${d.delta_pct >= 0 ? "+" : ""}${d.delta_pct}%)`).join(", ")}.`
      : "");

  return {
    csv: outLines.join("\n"),
    key_column: keyCol,
    total_rows_a: parsedA.rows.length,
    total_rows_b: parsedB.rows.length,
    added_rows: added,
    removed_rows: removed,
    changed_rows: changed,
    unchanged_rows: unchanged,
    column_deltas: columnDeltas,
    summary,
  };
}

// ============================================================================
// TOOL 31: flow_pivot_table — GROUP BY + AGGREGATE FOR 3D VISUALIZATION
// ============================================================================

export interface PivotTableInput {
  csv_content: string;
  /** Columns to group by */
  group_by: string[];
  /** Column → aggregation function mapping */
  aggregations: Record<string, "sum" | "avg" | "count" | "min" | "max">;
}

export interface PivotTableResult {
  csv: string;
  row_count: number;
  group_columns: string[];
  aggregated_columns: string[];
  summary: string;
}

export function flowPivotTable(input: PivotTableInput): PivotTableResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  // Validate group_by columns exist
  for (const col of input.group_by) {
    if (!headers.includes(col)) {
      throw new Error(`Group-by column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  // Validate aggregation columns exist
  const aggEntries = Object.entries(input.aggregations);
  for (const [col] of aggEntries) {
    if (!headers.includes(col)) {
      throw new Error(`Aggregation column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  // Build groups
  const groups = new Map<string, number[][]>();
  const groupByIndices = input.group_by.map(c => headers.indexOf(c));
  const aggIndices = aggEntries.map(([col]) => headers.indexOf(col));

  for (const row of rows) {
    const key = groupByIndices.map(i => row[i]).join("\x00");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.map((v, i) => {
      if (aggIndices.includes(i)) return [Number(v)];
      return [v];
    }).flat() as any);
  }

  // Compute aggregations per group
  const aggColNames = aggEntries.map(([col, fn]) => `${col}_${fn}`);
  const outHeaders = [...input.group_by, ...aggColNames, "_group_size"];
  const outRows: string[][] = [];

  for (const [key, groupRows] of groups) {
    const keyParts = key.split("\x00");
    const aggValues: number[] = [];

    for (let a = 0; a < aggEntries.length; a++) {
      const [col, fn] = aggEntries[a];
      const colIdx = headers.indexOf(col);
      const values = groupRows.map(r => Number((r as any)[colIdx])).filter(v => !isNaN(v));

      switch (fn) {
        case "sum":
          aggValues.push(values.reduce((s, v) => s + v, 0));
          break;
        case "avg":
          aggValues.push(values.length > 0 ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10000) / 10000 : 0);
          break;
        case "count":
          aggValues.push(values.length);
          break;
        case "min":
          aggValues.push(values.length > 0 ? Math.min(...values) : 0);
          break;
        case "max":
          aggValues.push(values.length > 0 ? Math.max(...values) : 0);
          break;
      }
    }

    outRows.push([...keyParts, ...aggValues.map(String), String(groupRows.length)]);
  }

  const csvLines = [outHeaders.join(","), ...outRows.map(r => r.map(v => csvEscapeField(v)).join(","))];

  const summary = `Pivoted ${rows.length} rows into ${outRows.length} groups by ${input.group_by.join(", ")}. ` +
    `Aggregations: ${aggEntries.map(([col, fn]) => `${fn}(${col})`).join(", ")}.`;

  return {
    csv: csvLines.join("\n"),
    row_count: outRows.length,
    group_columns: input.group_by,
    aggregated_columns: aggColNames,
    summary,
  };
}

// ============================================================================
// TOOL 32: flow_regression_analysis — LINEAR REGRESSION FOR TREND VISUALIZATION
// ============================================================================

export interface RegressionAnalysisInput {
  csv_content: string;
  x_column: string;
  y_column: string;
}

export interface RegressionAnalysisResult {
  csv: string;
  slope: number;
  intercept: number;
  r_squared: number;
  equation: string;
  n_points: number;
  p_value: number;
  summary: string;
}

export function flowRegressionAnalysis(input: RegressionAnalysisInput): RegressionAnalysisResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  const xIdx = headers.indexOf(input.x_column);
  const yIdx = headers.indexOf(input.y_column);

  if (xIdx === -1) throw new Error(`Column "${input.x_column}" not found. Available: ${headers.join(", ")}`);
  if (yIdx === -1) throw new Error(`Column "${input.y_column}" not found. Available: ${headers.join(", ")}`);

  // Parse x and y values, filtering non-numeric
  const points: { x: number; y: number; rowIdx: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const x = Number(rows[i][xIdx]);
    const y = Number(rows[i][yIdx]);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y, rowIdx: i });
    }
  }

  if (points.length < 2) {
    throw new Error(`Need at least 2 numeric data points. Found ${points.length} valid pairs in columns "${input.x_column}" and "${input.y_column}".`);
  }

  // Check if x column is actually numeric (not names)
  const xNonNumeric = rows.filter(r => isNaN(Number(r[xIdx]))).length;
  if (xNonNumeric > rows.length / 2) {
    throw new Error(`Column "${input.x_column}" is not numeric (${xNonNumeric}/${rows.length} values are non-numeric).`);
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Slope and intercept (least squares)
  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = meanY - slope * meanX;

  // R² (coefficient of determination)
  const ssRes = points.reduce((s, p) => {
    const predicted = slope * p.x + intercept;
    return s + (p.y - predicted) ** 2;
  }, 0);
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const r_squared = ssTot !== 0 ? 1 - ssRes / ssTot : 1;

  // p-value approximation using t-test on slope
  // t = slope / SE(slope), SE(slope) = sqrt(MSE / sum((xi - mean_x)^2))
  const mse = ssRes / (n - 2);
  const sumXDevSq = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const seSlope = sumXDevSq > 0 && n > 2 ? Math.sqrt(mse / sumXDevSq) : 0;
  const tStat = seSlope > 0 ? Math.abs(slope / seSlope) : Infinity;

  // Approximate p-value from t-distribution using approximation
  // For large n, use normal approximation; for small n, use rough beta approximation
  const df = n - 2;
  let pValue: number;
  if (df <= 0 || !isFinite(tStat)) {
    pValue = 0;
  } else {
    // Approximation: p ≈ 2 * (1 - Φ(t * √(df/(df + t²))))
    // This is the normal approximation for the t-distribution
    const z = tStat * Math.sqrt(df / (df + tStat * tStat));
    // Standard normal CDF approximation (Abramowitz & Stegun)
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * Math.abs(z));
    const phi = 1 - (a1 * t + a2 * t ** 2 + a3 * t ** 3 + a4 * t ** 4 + a5 * t ** 5) * Math.exp(-z * z / 2);
    pValue = 2 * (1 - phi);
    pValue = Math.max(0, Math.min(1, pValue));
  }

  // Build output CSV with _predicted and _residual columns
  const outHeaders = [...headers, "_predicted", "_residual"];
  const outLines = [outHeaders.join(",")];

  for (let i = 0; i < rows.length; i++) {
    const x = Number(rows[i][xIdx]);
    const y = Number(rows[i][yIdx]);
    const predicted = !isNaN(x) ? Math.round((slope * x + intercept) * 10000) / 10000 : "";
    const residual = !isNaN(x) && !isNaN(y) ? Math.round((y - (slope * x + intercept)) * 10000) / 10000 : "";
    outLines.push([...rows[i].map(v => csvEscapeField(v)), String(predicted), String(residual)].join(","));
  }

  const roundSlope = Math.round(slope * 10000) / 10000;
  const roundIntercept = Math.round(intercept * 10000) / 10000;
  const sign = roundIntercept >= 0 ? "+" : "-";
  const equation = `y = ${roundSlope}x ${sign} ${Math.abs(roundIntercept)}`;

  const strength = r_squared > 0.9 ? "very strong" : r_squared > 0.7 ? "strong" : r_squared > 0.5 ? "moderate" : r_squared > 0.3 ? "weak" : "very weak";
  const direction = slope > 0 ? "positive" : slope < 0 ? "negative" : "flat";
  const summary = `Linear regression: ${equation} (R²=${Math.round(r_squared * 10000) / 10000}). ` +
    `${strength} ${direction} relationship between ${input.x_column} and ${input.y_column} across ${n} data points.`;

  return {
    csv: outLines.join("\n"),
    slope: Math.round(slope * 10000) / 10000,
    intercept: Math.round(intercept * 10000) / 10000,
    r_squared: Math.round(r_squared * 10000) / 10000,
    equation,
    n_points: n,
    p_value: Math.round(pValue * 10000) / 10000,
    summary,
  };
}

// ============================================================================
// TOOL 33: flow_normalize_data — SCALE NUMERIC COLUMNS FOR VISUALIZATION
// ============================================================================

export interface NormalizeDataInput {
  csv_content: string;
  /** Columns to normalize (optional — auto-detects numeric columns if omitted) */
  columns?: string[];
  /** Normalization method: min_max scales to [0,1], z_score centers around mean=0 */
  method: "min_max" | "z_score";
}

export interface NormalizeDataResult {
  csv: string;
  row_count: number;
  columns_normalized: string[];
  method: string;
  summary: string;
}

export function flowNormalizeData(input: NormalizeDataInput): NormalizeDataResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  // Determine columns to normalize
  let columns = input.columns;
  if (!columns || columns.length === 0) {
    columns = identifyNumericColumns(headers, rows);
  }

  // Validate columns exist
  for (const col of columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  // Compute stats per column
  const colStats = new Map<string, { values: number[]; mean: number; std: number; min: number; max: number }>();
  for (const col of columns) {
    const idx = headers.indexOf(col);
    const values: number[] = [];
    for (const row of rows) {
      const v = Number(row[idx]);
      if (!isNaN(v)) values.push(v);
    }
    const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const variance = values.length > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length : 0;
    const std = Math.sqrt(variance);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    colStats.set(col, { values, mean, std, min, max });
  }

  // Build output CSV with _normalized columns
  const newHeaders = [...headers, ...columns.map(c => `${c}_normalized`)];
  const outLines = [newHeaders.join(",")];

  for (const row of rows) {
    const normalizedValues: string[] = [];
    for (const col of columns) {
      const idx = headers.indexOf(col);
      const v = Number(row[idx]);
      const stats = colStats.get(col)!;

      if (isNaN(v)) {
        normalizedValues.push("");
        continue;
      }

      let normalized: number;
      if (input.method === "min_max") {
        const range = stats.max - stats.min;
        normalized = range > 0 ? (v - stats.min) / range : 0;
      } else {
        normalized = stats.std > 0 ? (v - stats.mean) / stats.std : 0;
      }
      normalizedValues.push(String(Math.round(normalized * 10000) / 10000));
    }
    outLines.push([...row.map(v => csvEscapeField(v)), ...normalizedValues].join(","));
  }

  const summary = `Normalized ${columns.length} column(s) using ${input.method === "min_max" ? "min-max [0,1]" : "z-score (mean=0, std=1)"} method across ${rows.length} rows. ` +
    `Columns: ${columns.join(", ")}.`;

  return {
    csv: outLines.join("\n"),
    row_count: rows.length,
    columns_normalized: columns,
    method: input.method,
    summary,
  };
}

// ============================================================================
// TOOL 34: flow_deduplicate_rows — REMOVE DUPLICATE ROWS FOR CLEAN VISUALIZATION
// ============================================================================

export interface DeduplicateRowsInput {
  csv_content: string;
  /** Columns to check for duplicates (optional — uses all columns if omitted) */
  columns?: string[];
  /** Case-insensitive comparison for string columns */
  case_insensitive?: boolean;
}

export interface DeduplicateRowsResult {
  csv: string;
  unique_rows: number;
  duplicates_removed: number;
  total_rows: number;
  summary: string;
}

export function flowDeduplicateRows(input: DeduplicateRowsInput): DeduplicateRowsResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  // Determine which columns to check
  let columns = input.columns;
  if (!columns || columns.length === 0) {
    columns = [...headers];
  }

  // Validate columns exist
  for (const col of columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const colIndices = columns.map(c => headers.indexOf(c));
  const seen = new Set<string>();
  const uniqueRows: string[][] = [];
  let removed = 0;

  for (const row of rows) {
    let key = colIndices.map(i => row[i] ?? "").join("\x00");
    if (input.case_insensitive) {
      key = key.toLowerCase();
    }

    if (seen.has(key)) {
      removed++;
    } else {
      seen.add(key);
      uniqueRows.push(row);
    }
  }

  const outLines = [headers.join(","), ...uniqueRows.map(r => r.map(v => csvEscapeField(v)).join(","))];

  const summary = `Deduplicated ${rows.length} rows → ${uniqueRows.length} unique rows (${removed} duplicates removed). ` +
    `Checked columns: ${columns.join(", ")}${input.case_insensitive ? " (case-insensitive)" : ""}.`;

  return {
    csv: outLines.join("\n"),
    unique_rows: uniqueRows.length,
    duplicates_removed: removed,
    total_rows: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 35: flow_bin_data — HISTOGRAM BINNING FOR BAR CHART VISUALIZATION
// ============================================================================

export interface BinDataInput {
  csv_content: string;
  column: string;
  /** Number of bins (optional — auto-selects using Sturges' rule if omitted) */
  bins?: number;
}

export interface BinDataResult {
  csv: string;
  bin_count: number;
  total_values: number;
  min_value: number;
  max_value: number;
  summary: string;
}

export function flowBinData(input: BinDataInput): BinDataResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  const colIdx = headers.indexOf(input.column);
  if (colIdx === -1) {
    throw new Error(`Column "${input.column}" not found. Available: ${headers.join(", ")}`);
  }

  // Extract numeric values
  const values: number[] = [];
  for (const row of rows) {
    const v = Number(row[colIdx]);
    if (!isNaN(v)) values.push(v);
  }

  if (values.length === 0) {
    throw new Error(`Column "${input.column}" has no numeric values.`);
  }

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  // Determine bin count: use Sturges' rule if not specified
  const binCount = input.bins ?? Math.max(1, Math.ceil(Math.log2(values.length) + 1));

  // Create bins
  const range = maxVal - minVal;
  const binWidth = range > 0 ? range / binCount : 1;

  const bins: { min: number; max: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      min: Math.round((minVal + i * binWidth) * 10000) / 10000,
      max: Math.round((minVal + (i + 1) * binWidth) * 10000) / 10000,
      count: 0,
    });
  }

  // Assign values to bins
  for (const v of values) {
    let idx = range > 0 ? Math.floor((v - minVal) / binWidth) : 0;
    if (idx >= binCount) idx = binCount - 1; // max value goes in last bin
    bins[idx].count++;
  }

  // Build output CSV
  const outHeaders = ["bin_label", "bin_min", "bin_max", "count", "frequency"];
  const outLines = [outHeaders.join(",")];
  for (const bin of bins) {
    const freq = Math.round((bin.count / values.length) * 10000) / 10000;
    const label = `${bin.min}-${bin.max}`;
    outLines.push([csvEscapeField(label), String(bin.min), String(bin.max), String(bin.count), String(freq)].join(","));
  }

  const summary = `Binned ${values.length} values from column "${input.column}" into ${binCount} bins. ` +
    `Range: ${minVal} to ${maxVal} (width: ${Math.round(binWidth * 10000) / 10000}).`;

  return {
    csv: outLines.join("\n"),
    bin_count: binCount,
    total_values: values.length,
    min_value: minVal,
    max_value: maxVal,
    summary,
  };
}

// ============================================================================
// TOOL 36: flow_transpose_data — SWAP ROWS AND COLUMNS
// ============================================================================

export interface TransposeDataInput {
  csv_content: string;
  /** Column to use as new column headers (optional — defaults to first column) */
  header_column?: string;
}

export interface TransposeDataResult {
  csv: string;
  row_count: number;
  column_count: number;
  summary: string;
}

export function flowTransposeData(input: TransposeDataInput): TransposeDataResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  const headerCol = input.header_column ?? headers[0];
  const headerIdx = headers.indexOf(headerCol);
  if (headerIdx === -1) {
    throw new Error(`Column "${headerCol}" not found. Available: ${headers.join(", ")}`);
  }

  // Get the row labels from the header column
  const rowLabels = rows.map(r => r[headerIdx]);

  // Get data columns (everything except the header column)
  const dataCols = headers.filter((_, i) => i !== headerIdx);
  const dataColIndices = dataCols.map(c => headers.indexOf(c));

  // Transpose: each data column becomes a row, each original row becomes a column
  const newHeaders = ["metric", ...rowLabels];
  const outLines = [newHeaders.map(h => csvEscapeField(h)).join(",")];

  for (let c = 0; c < dataCols.length; c++) {
    const colIdx = dataColIndices[c];
    const rowValues = rows.map(r => r[colIdx]);
    outLines.push([csvEscapeField(dataCols[c]), ...rowValues.map(v => csvEscapeField(v))].join(","));
  }

  const summary = `Transposed ${rows.length} rows × ${dataCols.length} data columns → ${dataCols.length} rows × ${rows.length + 1} columns. ` +
    `Used "${headerCol}" as column headers.`;

  return {
    csv: outLines.join("\n"),
    row_count: dataCols.length,
    column_count: rows.length + 1, // +1 for the "metric" column
    summary,
  };
}

// ============================================================================
// TOOL 37: flow_sample_data — SMART SAMPLING FOR LARGE DATASETS
// ============================================================================

export interface SampleDataInput {
  csv_content: string;
  /** Number of rows to sample */
  n: number;
  /** Sampling method */
  method: "random" | "first" | "every_nth" | "stratified";
  /** Column to stratify by (required for stratified method) */
  stratify_column?: string;
}

export interface SampleDataResult {
  csv: string;
  sampled_rows: number;
  total_rows: number;
  method: string;
  summary: string;
}

export function flowSampleData(input: SampleDataInput): SampleDataResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  const n = Math.min(input.n, rows.length);

  let sampled: string[][];

  switch (input.method) {
    case "first":
      sampled = rows.slice(0, n);
      break;

    case "every_nth": {
      const step = Math.max(1, Math.floor(rows.length / n));
      sampled = [];
      for (let i = 0; i < rows.length && sampled.length < n; i += step) {
        sampled.push(rows[i]);
      }
      break;
    }

    case "stratified": {
      const stratCol = input.stratify_column;
      if (!stratCol || !headers.includes(stratCol)) {
        throw new Error(`Stratify column "${stratCol}" not found. Available: ${headers.join(", ")}`);
      }
      const colIdx = headers.indexOf(stratCol);
      const groups = new Map<string, string[][]>();
      for (const row of rows) {
        const key = row[colIdx];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      // Proportional sampling per group
      sampled = [];
      const groupCount = groups.size;
      for (const [, groupRows] of groups) {
        const groupN = Math.max(1, Math.round((groupRows.length / rows.length) * n));
        // Random sample within group
        const shuffled = [...groupRows].sort(() => Math.random() - 0.5);
        sampled.push(...shuffled.slice(0, groupN));
      }
      if (sampled.length > n) sampled = sampled.slice(0, n);
      break;
    }

    case "random":
    default: {
      const shuffled = [...rows].sort(() => Math.random() - 0.5);
      sampled = shuffled.slice(0, n);
      break;
    }
  }

  const outLines = [headers.join(","), ...sampled.map(r => r.map(v => csvEscapeField(v)).join(","))];

  const summary = `Sampled ${sampled.length} of ${rows.length} rows using ${input.method} method` +
    (input.method === "stratified" ? ` (stratified by "${input.stratify_column}")` : "") + ".";

  return {
    csv: outLines.join("\n"),
    sampled_rows: sampled.length,
    total_rows: rows.length,
    method: input.method,
    summary,
  };
}

// ============================================================================
// TOOL 38: flow_column_stats — DESCRIPTIVE STATISTICS PER COLUMN
// ============================================================================

export interface ColumnStatsInput {
  csv_content: string;
  /** Columns to compute stats for (optional — auto-detects numeric columns) */
  columns?: string[];
}

export interface ColumnStat {
  column: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1?: number;
  q3?: number;
  range: number;
  missing: number;
}

export interface ColumnStatsResult {
  csv: string;
  stats: ColumnStat[];
  summary: string;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function flowColumnStats(input: ColumnStatsInput): ColumnStatsResult {
  const parsed = parseCsvToRows(input.csv_content);
  const { headers, rows } = parsed;

  let columns = input.columns;
  if (!columns || columns.length === 0) {
    columns = identifyNumericColumns(headers, rows);
  }

  for (const col of columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const stats: ColumnStat[] = [];

  for (const col of columns) {
    const colIdx = headers.indexOf(col);
    const values: number[] = [];
    let missing = 0;

    for (const row of rows) {
      const v = Number(row[colIdx]);
      if (isNaN(v) || row[colIdx] === "" || row[colIdx] === undefined) {
        missing++;
      } else {
        values.push(v);
      }
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((s, v) => s + v, 0);
    const mean = count > 0 ? Math.round((sum / count) * 10000) / 10000 : 0;
    const variance = count > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1) : 0;
    const std = Math.round(Math.sqrt(variance) * 10000) / 10000;
    const min = count > 0 ? sorted[0] : 0;
    const max = count > 0 ? sorted[count - 1] : 0;
    const median = count > 0 ? Math.round(quantile(sorted, 0.5) * 10000) / 10000 : 0;
    const q1 = count > 0 ? Math.round(quantile(sorted, 0.25) * 10000) / 10000 : 0;
    const q3 = count > 0 ? Math.round(quantile(sorted, 0.75) * 10000) / 10000 : 0;

    stats.push({
      column: col,
      count,
      mean,
      median,
      std,
      min,
      max,
      q1,
      q3,
      range: Math.round((max - min) * 10000) / 10000,
      missing,
    });
  }

  // Build CSV output
  const csvHeaders = ["column", "count", "mean", "median", "std", "min", "max", "q1", "q3", "range", "missing"];
  const csvLines = [csvHeaders.join(",")];
  for (const s of stats) {
    csvLines.push([
      csvEscapeField(s.column), String(s.count), String(s.mean), String(s.median),
      String(s.std), String(s.min), String(s.max), String(s.q1), String(s.q3),
      String(s.range), String(s.missing),
    ].join(","));
  }

  const summary = `Computed statistics for ${stats.length} column(s) across ${rows.length} rows. ` +
    stats.map(s => `${s.column}: mean=${s.mean}, std=${s.std}, range=[${s.min}, ${s.max}]`).join("; ") + ".";

  return {
    csv: csvLines.join("\n"),
    stats,
    summary,
  };
}

// ============================================================================
// TOOL 39: flow_computed_columns — ADD CALCULATED COLUMNS USING FORMULAS
// ============================================================================

export interface ComputedColumnExpression {
  name: string;
  formula: string;
}

export interface ComputedColumnsInput {
  csv_content: string;
  expressions: ComputedColumnExpression[];
}

export interface ComputedColumnsResult {
  csv: string;
  row_count: number;
  columns_added: number;
  summary: string;
}

/**
 * Safe arithmetic expression calculator.
 * Supports: +, -, *, /, parentheses, numeric literals, and column references.
 * Uses a recursive descent parser — NO code execution of any kind.
 * This is a pure math expression parser, not a code evaluator.
 */
function calculateFormula(formula: string, vars: Record<string, number>): number {
  let pos = 0;
  const expr = formula.replace(/\s+/g, "");

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < expr.length && (expr[pos] === "+" || expr[pos] === "-")) {
      const op = expr[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < expr.length && (expr[pos] === "*" || expr[pos] === "/")) {
      const op = expr[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseFactor(): number {
    // Unary minus
    if (expr[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    // Parentheses
    if (expr[pos] === "(") {
      pos++;
      const result = parseExpr();
      if (expr[pos] === ")") pos++;
      return result;
    }
    // Number literal
    const numMatch = expr.slice(pos).match(/^(\d+\.?\d*)/);
    if (numMatch) {
      pos += numMatch[1].length;
      return Number(numMatch[1]);
    }
    // Variable (column name)
    const varMatch = expr.slice(pos).match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (varMatch) {
      pos += varMatch[1].length;
      const name = varMatch[1];
      if (name in vars) return vars[name];
      return 0; // Unknown variable → 0
    }
    return 0;
  }

  return parseExpr();
}

export function flowComputedColumns(input: ComputedColumnsInput): ComputedColumnsResult {
  const { csv_content, expressions } = input;
  if (!expressions || expressions.length === 0) {
    throw new Error("At least one expression is required");
  }

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  const newHeaders = [...headers, ...expressions.map(e => e.name)];
  const resultLines = [newHeaders.map(h => csvEscapeField(h)).join(",")];

  for (const row of rows) {
    // Build variable map from column values
    const vars: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const val = Number(row[i]);
      if (!isNaN(val)) vars[headers[i]] = val;
    }

    const newValues = [...row];
    for (const expr of expressions) {
      const result = calculateFormula(expr.formula, vars);
      const rounded = Math.round(result * 1e10) / 1e10; // Avoid floating point noise
      newValues.push(String(rounded));
      // Make computed columns available for subsequent expressions
      vars[expr.name] = rounded;
    }

    resultLines.push(newValues.map(v => csvEscapeField(v)).join(","));
  }

  const summary = `Added ${expressions.length} computed column(s) (${expressions.map(e => e.name).join(", ")}) to ${rows.length} rows.`;

  return {
    csv: resultLines.join("\n"),
    row_count: rows.length,
    columns_added: expressions.length,
    summary,
  };
}

// ============================================================================
// TOOL 40: flow_parse_dates — EXTRACT DATE COMPONENTS FOR TEMPORAL VISUALIZATION
// ============================================================================

export type DateComponent = "year" | "month" | "day" | "day_of_week" | "quarter" | "epoch_days";

export interface ParseDatesInput {
  csv_content: string;
  date_column: string;
  output_components: DateComponent[];
}

export interface ParseDatesResult {
  csv: string;
  parsed_count: number;
  failed_count: number;
  components_added: number;
  summary: string;
}

export function flowParseDates(input: ParseDatesInput): ParseDatesResult {
  const { csv_content, date_column, output_components } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const dateIdx = headers.indexOf(date_column);
  if (dateIdx === -1) throw new Error(`Date column "${date_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Build new headers
  const componentHeaders = output_components.map(c => `${date_column}_${c}`);
  const newHeaders = [...headers, ...componentHeaders];

  const resultLines = [newHeaders.map(h => csvEscapeField(h)).join(",")];
  let parsed = 0;
  let failed = 0;

  // Epoch reference: 1970-01-01
  const EPOCH = new Date("1970-01-01T00:00:00Z").getTime();
  const MS_PER_DAY = 86400000;

  for (const row of rows) {
    const dateStr = row[dateIdx] || "";
    const d = new Date(dateStr);
    const valid = !isNaN(d.getTime()) && dateStr.trim() !== "";

    if (valid) parsed++;
    else failed++;

    const newValues = [...row];
    for (const comp of output_components) {
      if (!valid) {
        newValues.push("");
        continue;
      }
      switch (comp) {
        case "year":
          newValues.push(String(d.getUTCFullYear()));
          break;
        case "month":
          newValues.push(String(d.getUTCMonth() + 1));
          break;
        case "day":
          newValues.push(String(d.getUTCDate()));
          break;
        case "day_of_week":
          // 0=Sunday in JS, convert to 1=Monday, 7=Sunday (ISO 8601)
          newValues.push(String(d.getUTCDay() === 0 ? 7 : d.getUTCDay()));
          break;
        case "quarter":
          newValues.push(String(Math.ceil((d.getUTCMonth() + 1) / 3)));
          break;
        case "epoch_days":
          newValues.push(String(Math.floor((d.getTime() - EPOCH) / MS_PER_DAY)));
          break;
      }
    }

    resultLines.push(newValues.map(v => csvEscapeField(v)).join(","));
  }

  const summary = `Parsed ${parsed} date(s) from "${date_column}", extracted ${output_components.length} component(s): ${output_components.join(", ")}.` +
    (failed > 0 ? ` ${failed} row(s) had unparseable dates.` : "");

  return {
    csv: resultLines.join("\n"),
    parsed_count: parsed,
    failed_count: failed,
    components_added: output_components.length,
    summary,
  };
}

// ============================================================================
// TOOL 41: flow_string_transform — TEXT CLEANUP AND TRANSFORMATION
// ============================================================================

export interface StringTransformInput {
  csv_content: string;
  columns: string[];
  transform: "uppercase" | "lowercase" | "trim" | "title_case" | "replace";
  /** Required for "replace" transform */
  find?: string;
  /** Required for "replace" transform */
  replace_with?: string;
}

export interface StringTransformResult {
  csv: string;
  row_count: number;
  columns_transformed: number;
  summary: string;
}

export function flowStringTransform(input: StringTransformInput): StringTransformResult {
  const { csv_content, columns, transform, find, replace_with } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);

  // Validate columns exist
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).map(l => parseCSVLine(l));
  const resultLines = [headers.map(h => csvEscapeField(h)).join(",")];

  for (const row of rows) {
    const newRow = [...row];
    for (const idx of colIndices) {
      let val = newRow[idx] || "";
      switch (transform) {
        case "uppercase":
          val = val.toUpperCase();
          break;
        case "lowercase":
          val = val.toLowerCase();
          break;
        case "trim":
          val = val.trim();
          break;
        case "title_case":
          val = val.replace(/\b\w/g, c => c.toUpperCase());
          break;
        case "replace":
          if (find !== undefined) {
            val = val.split(find).join(replace_with || "");
          }
          break;
      }
      newRow[idx] = val;
    }
    resultLines.push(newRow.map(v => csvEscapeField(v)).join(","));
  }

  const summary = `Applied ${transform} to ${columns.length} column(s) (${columns.join(", ")}) across ${rows.length} rows.`;

  return {
    csv: resultLines.join("\n"),
    row_count: rows.length,
    columns_transformed: columns.length,
    summary,
  };
}

// ============================================================================
// TOOL 42: flow_validate_rules — DATA QUALITY VALIDATION
// ============================================================================

export interface ValidationRule {
  column: string;
  rule: "not_null" | "min" | "max" | "unique" | "pattern" | "in_set";
  value?: number;
  pattern?: string;
  allowed_values?: string[];
}

export interface Violation {
  column: string;
  rule: string;
  row?: number;
  value?: string;
  message: string;
}

export interface ValidateRulesInput {
  csv_content: string;
  rules: ValidationRule[];
}

export interface ValidateRulesResult {
  pass: boolean;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  total_violations: number;
  violations: Violation[];
  summary: string;
}

export function flowValidateRules(input: ValidateRulesInput): ValidateRulesResult {
  const { csv_content, rules } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate that all rule columns exist
  for (const rule of rules) {
    if (!headers.includes(rule.column)) {
      throw new Error(`Column "${rule.column}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const violations: Violation[] = [];
  const violatedRows = new Set<number>();

  for (const rule of rules) {
    const colIdx = headers.indexOf(rule.column);

    switch (rule.rule) {
      case "not_null": {
        for (let r = 0; r < rows.length; r++) {
          const val = (rows[r][colIdx] || "").trim();
          if (val === "") {
            violations.push({
              column: rule.column,
              rule: "not_null",
              row: r + 1,
              value: val,
              message: `Row ${r + 1}: "${rule.column}" is empty/null`,
            });
            violatedRows.add(r);
          }
        }
        break;
      }
      case "min": {
        const minVal = rule.value ?? 0;
        for (let r = 0; r < rows.length; r++) {
          const num = Number(rows[r][colIdx]);
          if (!isNaN(num) && num < minVal) {
            violations.push({
              column: rule.column,
              rule: "min",
              row: r + 1,
              value: rows[r][colIdx],
              message: `Row ${r + 1}: "${rule.column}" value ${num} < minimum ${minVal}`,
            });
            violatedRows.add(r);
          }
        }
        break;
      }
      case "max": {
        const maxVal = rule.value ?? 0;
        for (let r = 0; r < rows.length; r++) {
          const num = Number(rows[r][colIdx]);
          if (!isNaN(num) && num > maxVal) {
            violations.push({
              column: rule.column,
              rule: "max",
              row: r + 1,
              value: rows[r][colIdx],
              message: `Row ${r + 1}: "${rule.column}" value ${num} > maximum ${maxVal}`,
            });
            violatedRows.add(r);
          }
        }
        break;
      }
      case "unique": {
        const seen = new Map<string, number>();
        for (let r = 0; r < rows.length; r++) {
          const val = rows[r][colIdx] || "";
          if (seen.has(val)) {
            violations.push({
              column: rule.column,
              rule: "unique",
              row: r + 1,
              value: val,
              message: `Row ${r + 1}: "${rule.column}" value "${val}" is duplicate (first at row ${seen.get(val)})`,
            });
            violatedRows.add(r);
          } else {
            seen.set(val, r + 1);
          }
        }
        break;
      }
      case "pattern": {
        const re = new RegExp(rule.pattern || ".*");
        for (let r = 0; r < rows.length; r++) {
          const val = rows[r][colIdx] || "";
          if (val.trim() !== "" && !re.test(val)) {
            violations.push({
              column: rule.column,
              rule: "pattern",
              row: r + 1,
              value: val,
              message: `Row ${r + 1}: "${rule.column}" value "${val}" doesn't match pattern /${rule.pattern}/`,
            });
            violatedRows.add(r);
          }
        }
        break;
      }
      case "in_set": {
        const allowed = new Set(rule.allowed_values || []);
        for (let r = 0; r < rows.length; r++) {
          const val = rows[r][colIdx] || "";
          if (val.trim() !== "" && !allowed.has(val)) {
            violations.push({
              column: rule.column,
              rule: "in_set",
              row: r + 1,
              value: val,
              message: `Row ${r + 1}: "${rule.column}" value "${val}" not in allowed set`,
            });
            violatedRows.add(r);
          }
        }
        break;
      }
    }
  }

  const invalidRows = violatedRows.size;
  const validRows = rows.length - invalidRows;
  const summary = violations.length === 0
    ? `All ${rows.length} rows pass ${rules.length} validation rule(s).`
    : `${violations.length} violation(s) found across ${invalidRows} row(s). ${validRows}/${rows.length} rows are valid.`;

  return {
    pass: violations.length === 0,
    total_rows: rows.length,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    total_violations: violations.length,
    violations,
    summary,
  };
}

// ============================================================================
// TOOL 43: flow_fill_missing — IMPUTE MISSING VALUES
// ============================================================================

export interface FillMissingInput {
  csv_content: string;
  /** Columns to fill (optional — fills all columns if omitted) */
  columns?: string[];
  method: "constant" | "mean" | "median" | "mode" | "forward";
  /** Value to use for constant fill method */
  fill_value?: string;
}

export interface FillMissingResult {
  csv: string;
  filled_count: number;
  row_count: number;
  summary: string;
}

export function flowFillMissing(input: FillMissingInput): FillMissingResult {
  const { csv_content, method, fill_value } = input;

  const allLines = csv_content.trim().split("\n");
  // Find the header (first non-empty line)
  const headerIdx = allLines.findIndex(l => l.trim() !== "");
  if (headerIdx === -1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(allLines[headerIdx]);
  // Keep ALL lines after header — empty lines represent rows with missing values
  const rows = allLines.slice(headerIdx + 1).map(l => {
    if (l.trim() === "") return headers.map(() => "");
    return parseCSVLine(l);
  });

  // Determine which columns to fill
  const targetCols = input.columns || [...headers];
  const colIndices: number[] = [];
  for (const col of targetCols) {
    const idx = headers.indexOf(col);
    if (idx !== -1) colIndices.push(idx);
  }

  // Pre-compute fill values per column for mean/median/mode
  const fillValues = new Map<number, string>();
  if (method === "mean" || method === "median" || method === "mode") {
    for (const idx of colIndices) {
      const values = rows
        .map(r => r[idx] || "")
        .filter(v => v.trim() !== "");

      if (method === "mean") {
        const nums = values.map(Number).filter(n => !isNaN(n));
        if (nums.length > 0) {
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          fillValues.set(idx, String(Math.round(mean * 1e10) / 1e10));
        }
      } else if (method === "median") {
        const nums = values.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length > 0) {
          const mid = Math.floor(nums.length / 2);
          const med = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
          fillValues.set(idx, String(med));
        }
      } else if (method === "mode") {
        const counts = new Map<string, number>();
        for (const v of values) {
          counts.set(v, (counts.get(v) || 0) + 1);
        }
        let maxCount = 0;
        let modeVal = "";
        for (const [v, c] of counts) {
          if (c > maxCount) { maxCount = c; modeVal = v; }
        }
        if (modeVal) fillValues.set(idx, modeVal);
      }
    }
  }

  let filled = 0;

  for (let r = 0; r < rows.length; r++) {
    for (const idx of colIndices) {
      const val = (rows[r][idx] || "").trim();
      if (val === "") {
        let replacement = "";
        switch (method) {
          case "constant":
            replacement = fill_value || "";
            break;
          case "mean":
          case "median":
          case "mode":
            replacement = fillValues.get(idx) || "";
            break;
          case "forward":
            // Look backwards for last non-empty value
            for (let prev = r - 1; prev >= 0; prev--) {
              const prevVal = (rows[prev][idx] || "").trim();
              if (prevVal !== "") { replacement = prevVal; break; }
            }
            break;
        }
        if (replacement !== "") {
          rows[r][idx] = replacement;
          filled++;
        }
      }
    }
  }

  const resultLines = [headers.map(h => csvEscapeField(h)).join(",")];
  for (const row of rows) {
    resultLines.push(row.map(v => csvEscapeField(v)).join(","));
  }

  const summary = filled > 0
    ? `Filled ${filled} missing value(s) using ${method} method across ${targetCols.length} column(s).`
    : `No missing values found in ${targetCols.length} column(s) across ${rows.length} rows.`;

  return {
    csv: resultLines.join("\n"),
    filled_count: filled,
    row_count: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 44: flow_rename_columns — RENAME AND REORDER COLUMNS
// ============================================================================

export interface RenameColumnsInput {
  csv_content: string;
  /** Map of old_name → new_name */
  renames?: Record<string, string>;
  /** Desired column order (after renames applied) */
  order?: string[];
}

export interface RenameColumnsResult {
  csv: string;
  columns_renamed: number;
  columns_reordered: boolean;
  final_columns: string[];
  summary: string;
}

export function flowRenameColumns(input: RenameColumnsInput): RenameColumnsResult {
  const { csv_content, renames, order } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate rename keys exist
  const renameMap = renames || {};
  for (const oldName of Object.keys(renameMap)) {
    if (!headers.includes(oldName)) {
      throw new Error(`Column "${oldName}" not found. Available: ${headers.join(", ")}`);
    }
  }

  // Apply renames
  const renamedHeaders = headers.map(h => renameMap[h] || h);
  const columnsRenamed = Object.keys(renameMap).length;

  // Apply reordering if specified
  let finalHeaders = renamedHeaders;
  let finalRows = rows;

  if (order && order.length > 0) {
    const newOrder: number[] = [];
    for (const col of order) {
      const idx = renamedHeaders.indexOf(col);
      if (idx !== -1) newOrder.push(idx);
    }
    // Add any columns not in order at the end
    for (let i = 0; i < renamedHeaders.length; i++) {
      if (!newOrder.includes(i)) newOrder.push(i);
    }

    finalHeaders = newOrder.map(i => renamedHeaders[i]);
    finalRows = rows.map(row => newOrder.map(i => row[i] || ""));
  }

  const resultLines = [finalHeaders.map(h => csvEscapeField(h)).join(",")];
  for (const row of finalRows) {
    resultLines.push(row.map(v => csvEscapeField(v)).join(","));
  }

  const parts: string[] = [];
  if (columnsRenamed > 0) parts.push(`Renamed ${columnsRenamed} column(s)`);
  if (order) parts.push(`Reordered to [${finalHeaders.join(", ")}]`);
  const summary = parts.join(". ") + `. ${rows.length} rows preserved.`;

  return {
    csv: resultLines.join("\n"),
    columns_renamed: columnsRenamed,
    columns_reordered: !!order,
    final_columns: finalHeaders,
    summary,
  };
}

// ============================================================================
// TOOL 45: flow_filter_rows — FILTER/SELECT ROWS BY CONDITIONS
// ============================================================================

export interface FilterCondition {
  column: string;
  operator: "equals" | "not_equals" | "greater_than" | "less_than" | "contains" | "not_contains";
  value: string;
}

export interface FilterRowsInput {
  csv_content: string;
  conditions: FilterCondition[];
}

export interface FilterRowsResult {
  csv: string;
  total_rows: number;
  matched_rows: number;
  removed_rows: number;
  summary: string;
}

export function flowFilterRows(input: FilterRowsInput): FilterRowsResult {
  const { csv_content, conditions } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate columns exist
  for (const cond of conditions) {
    if (!headers.includes(cond.column)) {
      throw new Error(`Column "${cond.column}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const matchedRows = rows.filter(row => {
    return conditions.every(cond => {
      const colIdx = headers.indexOf(cond.column);
      const val = row[colIdx] || "";
      const cmpVal = cond.value;

      switch (cond.operator) {
        case "equals":
          return val === cmpVal;
        case "not_equals":
          return val !== cmpVal;
        case "greater_than": {
          const a = Number(val), b = Number(cmpVal);
          return !isNaN(a) && !isNaN(b) && a > b;
        }
        case "less_than": {
          const a = Number(val), b = Number(cmpVal);
          return !isNaN(a) && !isNaN(b) && a < b;
        }
        case "contains":
          return val.includes(cmpVal);
        case "not_contains":
          return !val.includes(cmpVal);
        default:
          return true;
      }
    });
  });

  const resultLines = [headers.map(h => csvEscapeField(h)).join(",")];
  for (const row of matchedRows) {
    resultLines.push(row.map(v => csvEscapeField(v)).join(","));
  }

  const summary = `Filtered ${rows.length} rows → ${matchedRows.length} matched (${rows.length - matchedRows.length} removed). ` +
    `Conditions: ${conditions.map(c => `${c.column} ${c.operator} "${c.value}"`).join(" AND ")}.`;

  return {
    csv: resultLines.join("\n"),
    total_rows: rows.length,
    matched_rows: matchedRows.length,
    removed_rows: rows.length - matchedRows.length,
    summary,
  };
}

// ============================================================================
// TOOL 46: flow_split_dataset — SPLIT CSV BY COLUMN VALUES
// ============================================================================

export interface SplitDatasetInput {
  csv_content: string;
  split_column: string;
}

export interface DatasetSplit {
  value: string;
  csv: string;
  row_count: number;
}

export interface SplitDatasetResult {
  splits: DatasetSplit[];
  total_rows: number;
  total_groups: number;
  summary: string;
}

export function flowSplitDataset(input: SplitDatasetInput): SplitDatasetResult {
  const { csv_content, split_column } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(split_column);
  if (colIdx === -1) throw new Error(`Column "${split_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Group rows by split column value
  const groups = new Map<string, string[][]>();
  for (const row of rows) {
    const key = row[colIdx] || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const splits: DatasetSplit[] = [];

  for (const [value, groupRows] of groups) {
    const csvLines = [headerLine];
    for (const row of groupRows) {
      csvLines.push(row.map(v => csvEscapeField(v)).join(","));
    }
    splits.push({
      value,
      csv: csvLines.join("\n"),
      row_count: groupRows.length,
    });
  }

  const summary = `Split ${rows.length} rows into ${groups.size} group(s) by "${split_column}": ` +
    splits.map(s => `${s.value} (${s.row_count} rows)`).join(", ") + ".";

  return {
    splits,
    total_rows: rows.length,
    total_groups: groups.size,
    summary,
  };
}

// ============================================================================
// TOOL 47: flow_select_columns — PICK OR DROP COLUMNS
// ============================================================================

export interface SelectColumnsInput {
  csv_content: string;
  columns: string[];
  /** "include" keeps only specified columns, "exclude" removes them (default: include) */
  mode?: "include" | "exclude";
}

export interface SelectColumnsResult {
  csv: string;
  selected_count: number;
  row_count: number;
  summary: string;
}

export function flowSelectColumns(input: SelectColumnsInput): SelectColumnsResult {
  const { csv_content, columns, mode = "include" } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate columns exist
  for (const col of columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  let selectedIndices: number[];
  let selectedHeaders: string[];

  if (mode === "exclude") {
    const excludeSet = new Set(columns);
    selectedIndices = headers.map((_, i) => i).filter(i => !excludeSet.has(headers[i]));
    selectedHeaders = selectedIndices.map(i => headers[i]);
  } else {
    // Include mode — preserve the order specified by user
    selectedIndices = columns.map(c => headers.indexOf(c));
    selectedHeaders = columns;
  }

  const resultLines = [selectedHeaders.map(h => csvEscapeField(h)).join(",")];
  for (const row of rows) {
    resultLines.push(selectedIndices.map(i => csvEscapeField(row[i] || "")).join(","));
  }

  const summary = mode === "exclude"
    ? `Excluded ${columns.length} column(s), kept ${selectedHeaders.length} column(s) across ${rows.length} rows.`
    : `Selected ${selectedHeaders.length} column(s) from ${headers.length} total across ${rows.length} rows.`;

  return {
    csv: resultLines.join("\n"),
    selected_count: selectedHeaders.length,
    row_count: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 48: flow_sort_rows — SORT CSV ROWS BY COLUMN
// ============================================================================

export interface SortRowsInput {
  csv_content: string;
  sort_by: string;
  order?: "asc" | "desc";
}

export interface SortRowsResult {
  csv: string;
  row_count: number;
  sort_column: string;
  sort_order: string;
  summary: string;
}

export function flowSortRows(input: SortRowsInput): SortRowsResult {
  const { csv_content, sort_by, order = "asc" } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(sort_by);
  if (colIdx === -1) throw new Error(`Column "${sort_by}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Sort: try numeric first, fall back to string comparison
  rows.sort((a, b) => {
    const va = a[colIdx] || "";
    const vb = b[colIdx] || "";
    const na = Number(va);
    const nb = Number(vb);

    let cmp: number;
    if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") {
      cmp = na - nb;
    } else {
      cmp = va.localeCompare(vb);
    }

    return order === "desc" ? -cmp : cmp;
  });

  const resultLines = [headers.map(h => csvEscapeField(h)).join(",")];
  for (const row of rows) {
    resultLines.push(row.map(v => csvEscapeField(v)).join(","));
  }

  const summary = `Sorted ${rows.length} rows by "${sort_by}" in ${order}ending order.`;

  return {
    csv: resultLines.join("\n"),
    row_count: rows.length,
    sort_column: sort_by,
    sort_order: order,
    summary,
  };
}

// ============================================================================
// TOOL 49: flow_unpivot — MELT WIDE FORMAT TO LONG FORMAT
// ============================================================================

export interface UnpivotInput {
  csv_content: string;
  id_columns: string[];
  value_columns: string[];
  variable_name?: string;
  value_name?: string;
}

export interface UnpivotResult {
  csv: string;
  row_count: number;
  id_columns: string[];
  variable_name: string;
  value_name: string;
  summary: string;
}

export function flowUnpivot(input: UnpivotInput): UnpivotResult {
  const { csv_content, id_columns, value_columns, variable_name = "variable", value_name = "value" } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);

  // Validate id columns exist
  for (const col of id_columns) {
    if (!headers.includes(col)) {
      throw new Error(`ID column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  // Validate value columns exist
  for (const col of value_columns) {
    if (!headers.includes(col)) {
      throw new Error(`Value column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const idIndices = id_columns.map(c => headers.indexOf(c));
  const valIndices = value_columns.map(c => headers.indexOf(c));

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Build output: for each row, for each value column, emit one long-format row
  const outputHeader = [...id_columns, variable_name, value_name].map(h => csvEscapeField(h)).join(",");
  const outputRows: string[] = [];

  for (const row of rows) {
    const idValues = idIndices.map(i => row[i] || "");
    for (let vi = 0; vi < value_columns.length; vi++) {
      const valColName = value_columns[vi];
      const cellValue = row[valIndices[vi]] || "";
      const outRow = [...idValues, valColName, cellValue].map(v => csvEscapeField(v)).join(",");
      outputRows.push(outRow);
    }
  }

  const rowCount = outputRows.length;
  const summary = `Unpivoted ${rows.length} rows × ${value_columns.length} value columns → ${rowCount} long-format rows.`;

  return {
    csv: [outputHeader, ...outputRows].join("\n"),
    row_count: rowCount,
    id_columns,
    variable_name,
    value_name,
    summary,
  };
}

// ============================================================================
// TOOL 50: flow_join_datasets — SQL-STYLE JOINS BETWEEN TWO CSVs (below)
// ============================================================================

export interface JoinDatasetsInput {
  left_csv: string;
  right_csv: string;
  join_key: string;
  join_type?: "inner" | "left" | "right" | "full";
}

export interface JoinDatasetsResult {
  csv: string;
  row_count: number;
  matched_rows: number;
  join_type: string;
  join_key: string;
  left_columns: string[];
  right_columns: string[];
  summary: string;
}

export function flowJoinDatasets(input: JoinDatasetsInput): JoinDatasetsResult {
  const { left_csv, right_csv, join_key, join_type = "inner" } = input;

  // Parse left CSV
  const leftLines = left_csv.trim().split("\n").filter(l => l.trim());
  if (leftLines.length < 1) throw new Error("Left CSV must have at least a header row");
  const leftHeaders = parseCSVLine(leftLines[0]);
  if (!leftHeaders.includes(join_key)) {
    throw new Error(`Join key "${join_key}" not found in left CSV. Available: ${leftHeaders.join(", ")}`);
  }
  const leftKeyIdx = leftHeaders.indexOf(join_key);
  const leftRows = leftLines.slice(1).map(l => parseCSVLine(l));

  // Parse right CSV
  const rightLines = right_csv.trim().split("\n").filter(l => l.trim());
  if (rightLines.length < 1) throw new Error("Right CSV must have at least a header row");
  const rightHeaders = parseCSVLine(rightLines[0]);
  if (!rightHeaders.includes(join_key)) {
    throw new Error(`Join key "${join_key}" not found in right CSV. Available: ${rightHeaders.join(", ")}`);
  }
  const rightKeyIdx = rightHeaders.indexOf(join_key);
  const rightRows = rightLines.slice(1).map(l => parseCSVLine(l));

  // Build right non-key columns (exclude join key from right to avoid duplication)
  const rightNonKeyIndices: number[] = [];
  const rightNonKeyNames: string[] = [];
  for (let i = 0; i < rightHeaders.length; i++) {
    if (i !== rightKeyIdx) {
      let name = rightHeaders[i];
      // Handle name collisions with left columns
      if (leftHeaders.includes(name)) {
        name = name + "_right";
      }
      rightNonKeyNames.push(name);
      rightNonKeyIndices.push(i);
    }
  }

  // Build output header: all left columns + right non-key columns
  const outHeaders = [...leftHeaders, ...rightNonKeyNames];

  // Index right rows by key for O(n) lookup
  const rightIndex = new Map<string, string[][]>();
  for (const row of rightRows) {
    const key = row[rightKeyIdx] || "";
    if (!rightIndex.has(key)) rightIndex.set(key, []);
    rightIndex.get(key)!.push(row);
  }

  const outputRows: string[][] = [];
  let matched = 0;
  const matchedRightKeys = new Set<string>();

  // Process left rows
  for (const leftRow of leftRows) {
    const key = leftRow[leftKeyIdx] || "";
    const rightMatches = rightIndex.get(key);

    if (rightMatches && rightMatches.length > 0) {
      // Matched rows
      for (const rightRow of rightMatches) {
        const rightVals = rightNonKeyIndices.map(i => rightRow[i] || "");
        outputRows.push([...leftRow, ...rightVals]);
        matched++;
      }
      matchedRightKeys.add(key);
    } else if (join_type === "left" || join_type === "full") {
      // Left row with no right match
      const emptyRight = rightNonKeyIndices.map(() => "");
      outputRows.push([...leftRow, ...emptyRight]);
    }
    // For inner join, unmatched left rows are skipped
  }

  // For right and full joins, add unmatched right rows
  if (join_type === "right" || join_type === "full") {
    for (const rightRow of rightRows) {
      const key = rightRow[rightKeyIdx] || "";
      if (!matchedRightKeys.has(key)) {
        // Build left-side empty values, but fill in the join key at the right position
        const leftVals = leftHeaders.map((_, i) => {
          if (i === leftKeyIdx) return key;
          return "";
        });
        const rightVals = rightNonKeyIndices.map(i => rightRow[i] || "");
        outputRows.push([...leftVals, ...rightVals]);
      }
    }
  }

  // Build CSV output
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = outputRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const rowCount = outputRows.length;
  const summary = `${join_type.toUpperCase()} JOIN on "${join_key}": ${rowCount} result rows, ${matched} matched.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rowCount,
    matched_rows: matched,
    join_type,
    join_key,
    left_columns: leftHeaders,
    right_columns: rightHeaders,
    summary,
  };
}

// ============================================================================
// TOOL 51: flow_cross_tabulate — CONTINGENCY TABLE / CROSSTAB
// ============================================================================

export interface CrossTabulateInput {
  csv_content: string;
  row_column: string;
  col_column: string;
  value_column?: string;
  aggregation?: "count" | "sum" | "mean";
}

export interface CrossTabulateResult {
  csv: string;
  row_count: number;
  row_column: string;
  col_column: string;
  aggregation: string;
  summary: string;
}

export function flowCrossTabulate(input: CrossTabulateInput): CrossTabulateResult {
  const { csv_content, row_column, col_column, value_column, aggregation = "count" } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);

  const rowIdx = headers.indexOf(row_column);
  if (rowIdx === -1) throw new Error(`Row column "${row_column}" not found. Available: ${headers.join(", ")}`);

  const colIdx = headers.indexOf(col_column);
  if (colIdx === -1) throw new Error(`Column column "${col_column}" not found. Available: ${headers.join(", ")}`);

  let valIdx = -1;
  if (value_column) {
    valIdx = headers.indexOf(value_column);
    if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);
  }

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Collect unique row/col values (sorted alphabetically)
  const rowValues = [...new Set(rows.map(r => r[rowIdx] || ""))].sort();
  const colValues = [...new Set(rows.map(r => r[colIdx] || ""))].sort();

  // Build accumulator: rowVal -> colVal -> values[]
  const accum = new Map<string, Map<string, number[]>>();
  for (const rv of rowValues) {
    const colMap = new Map<string, number[]>();
    for (const cv of colValues) {
      colMap.set(cv, []);
    }
    accum.set(rv, colMap);
  }

  for (const row of rows) {
    const rv = row[rowIdx] || "";
    const cv = row[colIdx] || "";
    const colMap = accum.get(rv);
    if (colMap) {
      const arr = colMap.get(cv);
      if (arr) {
        if (aggregation === "count") {
          arr.push(1);
        } else {
          const val = valIdx >= 0 ? Number(row[valIdx]) : 0;
          if (!isNaN(val)) arr.push(val);
        }
      }
    }
  }

  // Aggregate
  function aggregate(values: number[]): string {
    if (values.length === 0) return "0";
    if (aggregation === "count") return String(values.length);
    if (aggregation === "sum") return String(values.reduce((a, b) => a + b, 0));
    // mean
    const sum = values.reduce((a, b) => a + b, 0);
    return String(sum / values.length);
  }

  // Build output CSV
  const outHeader = [row_column, ...colValues].map(h => csvEscapeField(h)).join(",");
  const outRows: string[] = [];
  for (const rv of rowValues) {
    const colMap = accum.get(rv)!;
    const cells = [rv];
    for (const cv of colValues) {
      cells.push(aggregate(colMap.get(cv)!));
    }
    outRows.push(cells.map(c => csvEscapeField(c)).join(","));
  }

  const summary = `Cross-tabulation of "${row_column}" × "${col_column}": ${rowValues.length} rows × ${colValues.length} columns, ${aggregation} aggregation.`;

  return {
    csv: [outHeader, ...outRows].join("\n"),
    row_count: rowValues.length,
    row_column,
    col_column,
    aggregation,
    summary,
  };
}

// ============================================================================
// TOOL 52: flow_window_functions — ROLLING/SLIDING WINDOW AGGREGATIONS
// ============================================================================

export interface WindowFunctionsInput {
  csv_content: string;
  value_column: string;
  window_size: number;
  functions: ("mean" | "sum" | "min" | "max")[];
}

export interface WindowFunctionsResult {
  csv: string;
  row_count: number;
  value_column: string;
  window_size: number;
  functions_applied: string[];
  summary: string;
}

export function flowWindowFunctions(input: WindowFunctionsInput): WindowFunctionsResult {
  const { csv_content, value_column, window_size, functions } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const valIdx = headers.indexOf(value_column);
  if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Extract numeric values from the value column
  const values = rows.map(r => {
    const v = Number(r[valIdx]);
    return isNaN(v) ? null : v;
  });

  // Compute window functions
  const newColumns: Map<string, string[]> = new Map();

  for (const fn of functions) {
    const colName = `${value_column}_${fn}_${window_size}`;
    const computed: string[] = [];

    for (let i = 0; i < values.length; i++) {
      // Collect window values (trailing window: from i-window_size+1 to i)
      const windowStart = Math.max(0, i - window_size + 1);
      const windowVals: number[] = [];
      for (let j = windowStart; j <= i; j++) {
        if (values[j] !== null) windowVals.push(values[j]!);
      }

      // Only compute if we have a full window
      if (i < window_size - 1 || windowVals.length === 0) {
        computed.push("");
      } else {
        let result: number;
        switch (fn) {
          case "mean":
            result = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
            break;
          case "sum":
            result = windowVals.reduce((a, b) => a + b, 0);
            break;
          case "min":
            result = Math.min(...windowVals);
            break;
          case "max":
            result = Math.max(...windowVals);
            break;
        }
        computed.push(String(result));
      }
    }

    newColumns.set(colName, computed);
  }

  // Build output CSV
  const newColNames = [...newColumns.keys()];
  const outHeaders = [...headers, ...newColNames];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const outRows: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const originalCells = rows[i].map(v => csvEscapeField(v));
    const newCells = newColNames.map(cn => csvEscapeField(newColumns.get(cn)![i]));
    outRows.push([...originalCells, ...newCells].join(","));
  }

  const summary = `Applied ${functions.join(", ")} with window size ${window_size} to "${value_column}" (${rows.length} rows).`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: rows.length,
    value_column,
    window_size,
    functions_applied: [...functions],
    summary,
  };
}

// ============================================================================
// TOOL 53: flow_encode_categorical — LABEL OR ONE-HOT ENCODING
// ============================================================================

export interface EncodeCategoricalInput {
  csv_content: string;
  columns: string[];
  method?: "label" | "onehot";
}

export interface EncodeCategoricalResult {
  csv: string;
  row_count: number;
  method: string;
  columns_encoded: string[];
  mappings: Record<string, Record<string, number>>;
  summary: string;
}

export function flowEncodeCategorical(input: EncodeCategoricalInput): EncodeCategoricalResult {
  const { csv_content, columns, method = "label" } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);

  // Validate columns exist
  for (const col of columns) {
    if (!headers.includes(col)) {
      throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    }
  }

  const rows = lines.slice(1).map(l => parseCSVLine(l));
  const mappings: Record<string, Record<string, number>> = {};

  if (method === "label") {
    // For each column, get sorted unique values and assign numeric codes
    const colIndices = columns.map(c => headers.indexOf(c));
    const colMaps: Map<string, number>[] = [];

    for (let ci = 0; ci < columns.length; ci++) {
      const colName = columns[ci];
      const idx = colIndices[ci];
      const uniqueVals = [...new Set(rows.map(r => r[idx] || ""))].sort();
      const mapping: Record<string, number> = {};
      const codeMap = new Map<string, number>();
      uniqueVals.forEach((v, i) => {
        mapping[v] = i;
        codeMap.set(v, i);
      });
      mappings[colName] = mapping;
      colMaps.push(codeMap);
    }

    // Build output: original columns + encoded columns appended after each
    const outHeaders = [...headers];
    for (const col of columns) {
      const insertIdx = outHeaders.indexOf(col) + 1;
      outHeaders.splice(insertIdx, 0, `${col}_encoded`);
    }

    const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
    const outRows: string[] = [];

    for (const row of rows) {
      const outRow: string[] = [];
      let colOffset = 0;
      for (let i = 0; i < headers.length; i++) {
        outRow.push(row[i] || "");
        const colIdx = columns.indexOf(headers[i]);
        if (colIdx >= 0) {
          const code = colMaps[colIdx].get(row[i] || "") ?? 0;
          outRow.push(String(code));
          colOffset++;
        }
      }
      outRows.push(outRow.map(v => csvEscapeField(v)).join(","));
    }

    const summary = `Label-encoded ${columns.length} column(s): ${columns.join(", ")} (${rows.length} rows).`;

    return {
      csv: [outHeaderLine, ...outRows].join("\n"),
      row_count: rows.length,
      method,
      columns_encoded: columns,
      mappings,
      summary,
    };
  } else {
    // One-hot encoding
    const colIndices = columns.map(c => headers.indexOf(c));

    // Collect unique values per column (sorted)
    const colUniqueVals: string[][] = [];
    for (let ci = 0; ci < columns.length; ci++) {
      const idx = colIndices[ci];
      const uniqueVals = [...new Set(rows.map(r => r[idx] || ""))].sort();
      colUniqueVals.push(uniqueVals);
      const mapping: Record<string, number> = {};
      uniqueVals.forEach((v, i) => { mapping[v] = i; });
      mappings[columns[ci]] = mapping;
    }

    // Build output headers: original (minus encoded columns) + one-hot columns
    const outHeaders = headers.filter(h => !columns.includes(h));
    for (let ci = 0; ci < columns.length; ci++) {
      for (const val of colUniqueVals[ci]) {
        outHeaders.push(`${columns[ci]}_${val}`);
      }
    }

    const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
    const outRows: string[] = [];

    for (const row of rows) {
      const outRow: string[] = [];
      // Non-encoded columns
      for (let i = 0; i < headers.length; i++) {
        if (!columns.includes(headers[i])) {
          outRow.push(row[i] || "");
        }
      }
      // One-hot columns
      for (let ci = 0; ci < columns.length; ci++) {
        const val = row[colIndices[ci]] || "";
        for (const uv of colUniqueVals[ci]) {
          outRow.push(val === uv ? "1" : "0");
        }
      }
      outRows.push(outRow.map(v => csvEscapeField(v)).join(","));
    }

    const summary = `One-hot encoded ${columns.length} column(s): ${columns.join(", ")} (${rows.length} rows, ${outHeaders.length - headers.length + columns.length} new columns).`;

    return {
      csv: [outHeaderLine, ...outRows].join("\n"),
      row_count: rows.length,
      method,
      columns_encoded: columns,
      mappings,
      summary,
    };
  }
}

// ============================================================================
// TOOL 54: flow_cumulative — RUNNING CUMULATIVE AGGREGATIONS
// ============================================================================

export interface CumulativeInput {
  csv_content: string;
  value_column: string;
  functions: ("sum" | "min" | "max" | "count")[];
}

export interface CumulativeResult {
  csv: string;
  row_count: number;
  value_column: string;
  functions_applied: string[];
  summary: string;
}

export function flowCumulative(input: CumulativeInput): CumulativeResult {
  const { csv_content, value_column, functions } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const valIdx = headers.indexOf(value_column);
  if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Extract numeric values
  const values = rows.map(r => {
    const v = Number(r[valIdx]);
    return isNaN(v) ? null : v;
  });

  // Compute cumulative functions
  const newColumns: Map<string, string[]> = new Map();

  for (const fn of functions) {
    const colName = `${value_column}_cum${fn}`;
    const computed: string[] = [];

    let cumSum = 0;
    let cumMin = Infinity;
    let cumMax = -Infinity;
    let cumCount = 0;

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v !== null) {
        cumSum += v;
        cumMin = Math.min(cumMin, v);
        cumMax = Math.max(cumMax, v);
        cumCount++;
      }

      switch (fn) {
        case "sum":
          computed.push(String(cumSum));
          break;
        case "min":
          computed.push(cumCount > 0 ? String(cumMin) : "");
          break;
        case "max":
          computed.push(cumCount > 0 ? String(cumMax) : "");
          break;
        case "count":
          computed.push(String(cumCount));
          break;
      }
    }

    newColumns.set(colName, computed);
  }

  // Build output CSV
  const newColNames = [...newColumns.keys()];
  const outHeaders = [...headers, ...newColNames];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const outRows: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const originalCells = rows[i].map(v => csvEscapeField(v));
    const newCells = newColNames.map(cn => csvEscapeField(newColumns.get(cn)![i]));
    outRows.push([...originalCells, ...newCells].join(","));
  }

  const summary = `Applied cumulative ${functions.join(", ")} to "${value_column}" (${rows.length} rows).`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: rows.length,
    value_column,
    functions_applied: [...functions],
    summary,
  };
}

// ============================================================================
// TOOL 55: flow_percentile_rank — PERCENTILE RANKING PER ROW
// ============================================================================

export interface PercentileRankInput {
  csv_content: string;
  value_column: string;
}

export interface PercentileRankResult {
  csv: string;
  row_count: number;
  value_column: string;
  summary: string;
}

export function flowPercentileRank(input: PercentileRankInput): PercentileRankResult {
  const { csv_content, value_column } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const valIdx = headers.indexOf(value_column);
  if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));
  const n = rows.length;

  // Extract numeric values
  const values = rows.map(r => {
    const v = Number(r[valIdx]);
    return isNaN(v) ? null : v;
  });

  // Compute percentile ranks using average rank method for ties
  // percentile_rank = (number of values below + 0.5 * number of ties) / total * 100
  const percentiles: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null) {
      percentiles.push("");
      continue;
    }
    let below = 0;
    let equal = 0;
    for (let j = 0; j < n; j++) {
      if (values[j] === null) continue;
      if (values[j]! < v) below++;
      else if (values[j]! === v) equal++;
    }
    // Percentile rank = (below + 0.5 * (equal - 1)) / (n_valid - 1) * 100
    // But simpler: (below + 0.5 * equal) / n_valid * 100
    const nValid = values.filter(x => x !== null).length;
    const pct = nValid > 1 ? ((below + 0.5 * (equal - 1)) / (nValid - 1)) * 100 : 50;
    percentiles.push(String(Math.round(pct * 100) / 100));
  }

  // Build output
  const outHeaders = [...headers, `${value_column}_percentile`];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const outRows = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), csvEscapeField(percentiles[i])].join(",");
  });

  const summary = `Computed percentile ranks for "${value_column}" (${n} rows).`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: n,
    value_column,
    summary,
  };
}

// ============================================================================
// TOOL 56: flow_coalesce_columns — FIRST NON-EMPTY VALUE ACROSS COLUMNS
// ============================================================================

export interface CoalesceColumnsInput {
  csv_content: string;
  columns: string[];
  output_column: string;
}

export interface CoalesceColumnsResult {
  csv: string;
  row_count: number;
  output_column: string;
  filled_count: number;
  summary: string;
}

export function flowCoalesceColumns(input: CoalesceColumnsInput): CoalesceColumnsResult {
  const { csv_content, columns, output_column } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);

  // Validate columns
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Coalesce: first non-empty value from specified columns
  const coalesced: string[] = [];
  let filledCount = 0;

  for (const row of rows) {
    let value = "";
    for (const idx of colIndices) {
      const v = (row[idx] || "").trim();
      if (v !== "") {
        value = v;
        break;
      }
    }
    coalesced.push(value);
    if (value !== "") filledCount++;
  }

  // Build output: original columns + coalesced column
  const outHeaders = [...headers, output_column];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const outRows = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), csvEscapeField(coalesced[i])].join(",");
  });

  const summary = `Coalesced ${columns.length} columns into "${output_column}": ${filledCount}/${rows.length} rows have a value.`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: rows.length,
    output_column,
    filled_count: filledCount,
    summary,
  };
}

// ============================================================================
// TOOL 57: flow_describe_dataset — COMPREHENSIVE DATASET PROFILING
// ============================================================================

export interface DescribeDatasetInput {
  csv_content: string;
}

export interface ColumnProfile {
  name: string;
  type: "numeric" | "text";
  null_count: number;
  unique_count: number;
  sample_values: string[];
}

export interface DescribeDatasetResult {
  rows: number;
  columns: number;
  column_profiles: ColumnProfile[];
  summary: string;
}

export function flowDescribeDataset(input: DescribeDatasetInput): DescribeDatasetResult {
  const { csv_content } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  const profiles: ColumnProfile[] = [];

  for (let c = 0; c < headers.length; c++) {
    const colName = headers[c];
    const values = rows.map(r => (r[c] || "").trim());
    const nonEmpty = values.filter(v => v !== "");

    // Determine type: if >50% of non-empty values are numeric, it's numeric
    const numericCount = nonEmpty.filter(v => !isNaN(Number(v))).length;
    const isNumeric = nonEmpty.length > 0 && numericCount / nonEmpty.length > 0.5;

    const nullCount = values.filter(v => v === "").length;
    const uniqueCount = new Set(nonEmpty).size;

    // Sample: up to 5 unique values
    const uniqueVals = [...new Set(nonEmpty)];
    const sampleValues = uniqueVals.slice(0, 5);

    profiles.push({
      name: colName,
      type: isNumeric ? "numeric" : "text",
      null_count: nullCount,
      unique_count: uniqueCount,
      sample_values: sampleValues,
    });
  }

  const numericCols = profiles.filter(p => p.type === "numeric").length;
  const textCols = profiles.filter(p => p.type === "text").length;
  const summary = `Dataset: ${rows.length} rows × ${headers.length} columns (${numericCols} numeric, ${textCols} text).`;

  return {
    rows: rows.length,
    columns: headers.length,
    column_profiles: profiles,
    summary,
  };
}

// ============================================================================
// TOOL 58: flow_lag_lead — SHIFT COLUMN VALUES BY N ROWS
// ============================================================================

export interface LagLeadInput {
  csv_content: string;
  value_column: string;
  shift: number; // negative = lag (look back), positive = lead (look forward)
}

export interface LagLeadResult {
  csv: string;
  row_count: number;
  value_column: string;
  shift: number;
  new_column: string;
  summary: string;
}

export function flowLagLead(input: LagLeadInput): LagLeadResult {
  const { csv_content, value_column, shift } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const valIdx = headers.indexOf(value_column);
  if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));
  const values = rows.map(r => r[valIdx] || "");

  const absShift = Math.abs(shift);
  const direction = shift < 0 ? "lag" : "lead";
  const newColName = `${value_column}_${direction}${absShift}`;

  // Compute shifted values
  const shifted: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    // For lag (shift < 0): look at i + shift (i.e., earlier rows)
    // For lead (shift > 0): look at i + shift (i.e., later rows)
    const sourceIdx = i + shift;
    if (sourceIdx >= 0 && sourceIdx < rows.length) {
      shifted.push(values[sourceIdx]);
    } else {
      shifted.push("");
    }
  }

  // Build output
  const outHeaders = [...headers, newColName];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const outRows = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), csvEscapeField(shifted[i])].join(",");
  });

  const summary = `Created ${direction} column "${newColName}" with shift of ${absShift} (${rows.length} rows).`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: rows.length,
    value_column,
    shift,
    new_column: newColName,
    summary,
  };
}

// ============================================================================
// TOOL 59: flow_group_aggregate — SQL-STYLE GROUP BY + AGGREGATE
// ============================================================================

export interface GroupAggregateInput {
  csv_content: string;
  group_by: string;
  value_column: string;
  aggregation: "sum" | "mean" | "count" | "min" | "max";
}

export interface GroupAggregateResult {
  csv: string;
  group_count: number;
  group_by: string;
  value_column: string;
  aggregation: string;
  summary: string;
}

export function flowGroupAggregate(input: GroupAggregateInput): GroupAggregateResult {
  const { csv_content, group_by, value_column, aggregation } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const groupIdx = headers.indexOf(group_by);
  if (groupIdx === -1) throw new Error(`Group column "${group_by}" not found. Available: ${headers.join(", ")}`);

  const valIdx = headers.indexOf(value_column);
  if (valIdx === -1) throw new Error(`Value column "${value_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Group values
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = row[groupIdx] || "";
    if (!groups.has(key)) groups.set(key, []);
    if (aggregation === "count") {
      groups.get(key)!.push(1);
    } else {
      const v = Number(row[valIdx]);
      if (!isNaN(v)) groups.get(key)!.push(v);
    }
  }

  // Aggregate
  const outColName = `${value_column}_${aggregation}`;
  const outHeader = [group_by, outColName].map(h => csvEscapeField(h)).join(",");
  const sortedKeys = [...groups.keys()].sort();
  const outRows: string[] = [];

  for (const key of sortedKeys) {
    const vals = groups.get(key)!;
    let result: number;
    switch (aggregation) {
      case "count": result = vals.length; break;
      case "sum": result = vals.reduce((a, b) => a + b, 0); break;
      case "mean": result = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
      case "min": result = vals.length > 0 ? Math.min(...vals) : 0; break;
      case "max": result = vals.length > 0 ? Math.max(...vals) : 0; break;
    }
    outRows.push([csvEscapeField(key), csvEscapeField(String(result))].join(","));
  }

  const summary = `Grouped by "${group_by}", ${aggregation} of "${value_column}": ${sortedKeys.length} groups.`;

  return {
    csv: [outHeader, ...outRows].join("\n"),
    group_count: sortedKeys.length,
    group_by,
    value_column,
    aggregation,
    summary,
  };
}

// ============================================================================
// TOOL 60: flow_row_number — SEQUENTIAL ROW NUMBERING
// ============================================================================

export interface RowNumberInput {
  csv_content: string;
  column_name?: string;
  group_by?: string;
}

export interface RowNumberResult {
  csv: string;
  row_count: number;
  column_name: string;
  summary: string;
}

export function flowRowNumber(input: RowNumberInput): RowNumberResult {
  const { csv_content, column_name = "row_number", group_by } = input;

  const lines = csv_content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 1) throw new Error("CSV must have at least a header row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  let rowNumbers: number[];

  if (group_by) {
    const groupIdx = headers.indexOf(group_by);
    if (groupIdx === -1) throw new Error(`Group column "${group_by}" not found. Available: ${headers.join(", ")}`);

    // Number within groups
    const groupCounters = new Map<string, number>();
    rowNumbers = [];
    for (const row of rows) {
      const key = row[groupIdx] || "";
      const current = (groupCounters.get(key) || 0) + 1;
      groupCounters.set(key, current);
      rowNumbers.push(current);
    }
  } else {
    // Simple sequential numbering
    rowNumbers = rows.map((_, i) => i + 1);
  }

  // Build output
  const outHeaders = [...headers, column_name];
  const outHeaderLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const outRows = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), String(rowNumbers[i])].join(",");
  });

  const groupSuffix = group_by ? ` within groups by "${group_by}"` : "";
  const summary = `Added row numbers${groupSuffix} (${rows.length} rows).`;

  return {
    csv: [outHeaderLine, ...outRows].join("\n"),
    row_count: rows.length,
    column_name,
    summary,
  };
}

// ============================================================================
// TOOL 61: flow_type_cast — CONVERT COLUMN DATA TYPES
// ============================================================================

export interface TypeCastInput {
  csv_content: string;
  /** Column to cast */
  column: string;
  /** Target type: number, string, or boolean */
  target_type: "number" | "string" | "boolean";
}

export interface TypeCastResult {
  csv: string;
  row_count: number;
  converted_count: number;
  failed_count: number;
  summary: string;
}

export function flowTypeCast(input: TypeCastInput): TypeCastResult {
  const { csv_content, column, target_type } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  let convertedCount = 0;
  let failedCount = 0;

  const castRows = rows.map(row => {
    const newRow = [...row];
    const val = row[colIdx] ?? "";

    if (target_type === "number") {
      const num = Number(val);
      if (val.trim() !== "" && !isNaN(num)) {
        newRow[colIdx] = String(num);
        convertedCount++;
      } else {
        newRow[colIdx] = "";
        failedCount++;
      }
    } else if (target_type === "boolean") {
      const lower = val.trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(lower)) {
        newRow[colIdx] = "true";
        convertedCount++;
      } else if (["false", "0", "no", "n", "off", ""].includes(lower)) {
        newRow[colIdx] = "false";
        convertedCount++;
      } else {
        newRow[colIdx] = "false";
        failedCount++;
      }
    } else {
      // string — just keep the value as-is
      newRow[colIdx] = val;
      convertedCount++;
    }

    return newRow;
  });

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = castRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const summary = `Cast column "${column}" to ${target_type}: ${convertedCount} converted, ${failedCount} failed (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    converted_count: convertedCount,
    failed_count: failedCount,
    summary,
  };
}

// ============================================================================
// TOOL 62: flow_concat_rows — VERTICALLY STACK TWO CSVS
// ============================================================================

export interface ConcatRowsInput {
  csv_content_1: string;
  csv_content_2: string;
  /** Add _source column identifying origin dataset (default false) */
  add_source?: boolean;
}

export interface ConcatRowsResult {
  csv: string;
  row_count: number;
  column_count: number;
  summary: string;
}

export function flowConcatRows(input: ConcatRowsInput): ConcatRowsResult {
  const { csv_content_1, csv_content_2, add_source = false } = input;

  const lines1 = csv_content_1.trim().split("\n");
  const lines2 = csv_content_2.trim().split("\n");

  const headers1 = parseCSVLine(lines1[0]);
  const headers2 = parseCSVLine(lines2[0]);

  // Union of all columns, preserving order (dataset 1 first, then new from dataset 2)
  const allHeaders: string[] = [...headers1];
  for (const h of headers2) {
    if (!allHeaders.includes(h)) {
      allHeaders.push(h);
    }
  }

  if (add_source) {
    allHeaders.push("_source");
  }

  // Parse rows from both datasets
  const rows1 = lines1.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));
  const rows2 = lines2.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  // Map rows to unified column set
  function mapRow(row: string[], srcHeaders: string[], source: string): string[] {
    const mapped: string[] = allHeaders.map(h => {
      if (add_source && h === "_source") return source;
      const idx = srcHeaders.indexOf(h);
      return idx >= 0 && idx < row.length ? row[idx] : "";
    });
    return mapped;
  }

  const mappedRows1 = rows1.map(r => mapRow(r, headers1, "dataset_1"));
  const mappedRows2 = rows2.map(r => mapRow(r, headers2, "dataset_2"));
  const allRows = [...mappedRows1, ...mappedRows2];

  const headerLine = allHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = allRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const totalRows = allRows.length;
  const summary = `Concatenated ${rows1.length} + ${rows2.length} = ${totalRows} rows across ${allHeaders.length} columns.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: totalRows,
    column_count: allHeaders.length,
    summary,
  };
}

// ============================================================================
// TOOL 63: flow_value_counts — COUNT UNIQUE VALUE OCCURRENCES
// ============================================================================

export interface ValueCountsInput {
  csv_content: string;
  /** Column to count values in */
  column: string;
  /** Return only top N values (default: all) */
  top_n?: number;
}

export interface ValueCountsResult {
  csv: string;
  unique_count: number;
  total_count: number;
  summary: string;
}

export function flowValueCounts(input: ValueCountsInput): ValueCountsResult {
  const { csv_content, column, top_n } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  // Count occurrences
  const counts = new Map<string, number>();
  for (const row of rows) {
    const val = row[colIdx] ?? "";
    counts.set(val, (counts.get(val) || 0) + 1);
  }

  // Sort by count descending
  let sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (top_n !== undefined && top_n > 0) {
    sorted = sorted.slice(0, top_n);
  }

  const total = rows.length;
  const outLines = sorted.map(([value, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    return `${csvEscapeField(value)},${count},${pct}`;
  });

  const headerLine = "value,count,percentage";
  const summary = `Column "${column}": ${counts.size} unique values across ${total} rows.`;

  return {
    csv: [headerLine, ...outLines].join("\n"),
    unique_count: counts.size,
    total_count: total,
    summary,
  };
}

// ============================================================================
// TOOL 64: flow_date_diff — CALCULATE DATE DIFFERENCES
// ============================================================================

export interface DateDiffInput {
  csv_content: string;
  /** Column with start dates */
  start_column: string;
  /** Column with end dates */
  end_column: string;
  /** Unit: days, months, or years */
  unit: "days" | "months" | "years";
  /** Custom output column name (default: _date_diff) */
  output_column?: string;
}

export interface DateDiffResult {
  csv: string;
  row_count: number;
  computed_count: number;
  failed_count: number;
  summary: string;
}

export function flowDateDiff(input: DateDiffInput): DateDiffResult {
  const { csv_content, start_column, end_column, unit, output_column = "_date_diff" } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const startIdx = headers.indexOf(start_column);
  const endIdx = headers.indexOf(end_column);

  if (startIdx === -1) throw new Error(`Start column "${start_column}" not found. Available: ${headers.join(", ")}`);
  if (endIdx === -1) throw new Error(`End column "${end_column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  let computedCount = 0;
  let failedCount = 0;

  const diffs: string[] = rows.map(row => {
    const startStr = row[startIdx] ?? "";
    const endStr = row[endIdx] ?? "";

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      failedCount++;
      return "";
    }

    computedCount++;
    const msPerDay = 86400000;

    if (unit === "days") {
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
      return String(diffDays);
    } else if (unit === "months") {
      const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                     (endDate.getMonth() - startDate.getMonth());
      return String(months);
    } else {
      // years
      const years = endDate.getFullYear() - startDate.getFullYear();
      return String(years);
    }
  });

  const outHeaders = [...headers, output_column];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), diffs[i]].join(",");
  });

  const summary = `Calculated ${unit} difference between "${start_column}" and "${end_column}": ${computedCount} computed, ${failedCount} failed (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    computed_count: computedCount,
    failed_count: failedCount,
    summary,
  };
}

// ============================================================================
// TOOL 65: flow_outlier_fence — TUKEY'S FENCES OUTLIER DETECTION
// ============================================================================

export interface OutlierFenceInput {
  csv_content: string;
  /** Numeric column to check for outliers */
  column: string;
  /** IQR multiplier (default: 1.5 for standard, 3.0 for extreme) */
  multiplier?: number;
}

export interface OutlierFenceResult {
  csv: string;
  row_count: number;
  outlier_count: number;
  lower_fence: number;
  upper_fence: number;
  q1: number;
  q3: number;
  iqr: number;
  summary: string;
}

export function flowOutlierFence(input: OutlierFenceInput): OutlierFenceResult {
  const { csv_content, column, multiplier = 1.5 } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  // Extract numeric values with indices
  const numericValues: number[] = [];
  for (const row of rows) {
    const val = Number(row[colIdx] ?? "");
    if (!isNaN(val)) numericValues.push(val);
  }

  // Calculate Q1, Q3, IQR
  const sorted = [...numericValues].sort((a, b) => a - b);
  const n = sorted.length;

  function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }

  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lowerFence = q1 - multiplier * iqr;
  const upperFence = q3 + multiplier * iqr;

  let outlierCount = 0;

  const outHeaders = [...headers, "_is_outlier", "_fence_distance"];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const dataLines = rows.map(row => {
    const val = Number(row[colIdx] ?? "");
    let isOutlier = "false";
    let distance = "0";

    if (!isNaN(val)) {
      if (val < lowerFence) {
        isOutlier = "true";
        distance = String(+(lowerFence - val).toFixed(4));
        outlierCount++;
      } else if (val > upperFence) {
        isOutlier = "true";
        distance = String(+(val - upperFence).toFixed(4));
        outlierCount++;
      }
    }

    return [...row.map(v => csvEscapeField(v)), isOutlier, distance].join(",");
  });

  const summary = `Tukey fence (${multiplier}×IQR) on "${column}": ${outlierCount} outliers found. Fences: [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}], IQR=${iqr.toFixed(2)}.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    outlier_count: outlierCount,
    lower_fence: lowerFence,
    upper_fence: upperFence,
    q1,
    q3,
    iqr,
    summary,
  };
}

// ============================================================================
// TOOL 66: flow_moving_average — SIMPLE AND EXPONENTIAL MOVING AVERAGE
// ============================================================================

export interface MovingAverageInput {
  csv_content: string;
  /** Numeric column to smooth */
  column: string;
  /** Window size for moving average */
  window: number;
  /** Method: simple or exponential */
  method: "simple" | "exponential";
}

export interface MovingAverageResult {
  csv: string;
  row_count: number;
  summary: string;
}

export function flowMovingAverage(input: MovingAverageInput): MovingAverageResult {
  const { csv_content, column, window: windowSize, method } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  const suffix = method === "simple" ? "_sma" : "_ema";
  const outColName = `${column}${suffix}`;

  const values: (number | null)[] = rows.map(row => {
    const val = Number(row[colIdx] ?? "");
    return isNaN(val) ? null : val;
  });

  const result: string[] = [];

  if (method === "simple") {
    for (let i = 0; i < values.length; i++) {
      if (i < windowSize - 1) {
        result.push("");
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let j = i - windowSize + 1; j <= i; j++) {
        if (values[j] !== null) {
          sum += values[j]!;
          count++;
        }
      }
      if (count === windowSize) {
        result.push(String(+(sum / count).toFixed(4)));
      } else {
        result.push("");
      }
    }
  } else {
    // Exponential moving average
    const alpha = 2 / (windowSize + 1);
    let ema: number | null = null;

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (val === null) {
        result.push(ema !== null ? String(+ema.toFixed(4)) : "");
        continue;
      }
      if (ema === null) {
        ema = val;
      } else {
        ema = alpha * val + (1 - alpha) * ema;
      }
      result.push(String(+ema.toFixed(4)));
    }
  }

  const outHeaders = [...headers, outColName];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), result[i]].join(",");
  });

  const summary = `${method === "simple" ? "Simple" : "Exponential"} moving average (window=${windowSize}) on "${column}" (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 67: flow_entropy — SHANNON ENTROPY FOR CATEGORICAL COLUMNS
// ============================================================================

export interface EntropyInput {
  csv_content: string;
  /** Column to calculate entropy for */
  column: string;
}

export interface EntropyResult {
  entropy: number;
  max_entropy: number;
  normalized_entropy: number;
  unique_count: number;
  total_count: number;
  summary: string;
}

export function flowEntropy(input: EntropyInput): EntropyResult {
  const { csv_content, column } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  // Count value frequencies
  const counts = new Map<string, number>();
  for (const row of rows) {
    const val = row[colIdx] ?? "";
    counts.set(val, (counts.get(val) || 0) + 1);
  }

  const total = rows.length;
  const uniqueCount = counts.size;

  // Shannon entropy: H = -Σ p(x) * log2(p(x))
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  const maxEntropy = uniqueCount > 1 ? Math.log2(uniqueCount) : 0;
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  const summary = `Shannon entropy for "${column}": ${entropy.toFixed(4)} bits (normalized: ${(normalizedEntropy * 100).toFixed(1)}%, ${uniqueCount} unique values, ${total} rows).`;

  return {
    entropy: +entropy.toFixed(6),
    max_entropy: +maxEntropy.toFixed(6),
    normalized_entropy: +normalizedEntropy.toFixed(6),
    unique_count: uniqueCount,
    total_count: total,
    summary,
  };
}

// ============================================================================
// TOOL 68: flow_standardize — ROBUST AND STANDARD STANDARDIZATION
// ============================================================================

export interface StandardizeInput {
  csv_content: string;
  /** Columns to standardize */
  columns: string[];
  /** Method: standard (mean/std) or robust (median/MAD) */
  method: "standard" | "robust";
}

export interface StandardizeResult {
  csv: string;
  row_count: number;
  columns_standardized: number;
  summary: string;
}

export function flowStandardize(input: StandardizeInput): StandardizeResult {
  const { csv_content, columns, method } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  // Extract numeric values per column
  const colValues: number[][] = colIndices.map(idx =>
    rows.map(row => Number(row[idx] ?? "")).filter(v => !isNaN(v))
  );

  // Calculate center and scale per column
  const params: { center: number; scale: number }[] = colValues.map(vals => {
    if (vals.length === 0) return { center: 0, scale: 1 };

    if (method === "standard") {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      return { center: mean, scale: std === 0 ? 1 : std };
    } else {
      // Robust: median and MAD
      const sorted = [...vals].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      const deviations = vals.map(v => Math.abs(v - median)).sort((a, b) => a - b);
      const mad = deviations.length % 2 === 0
        ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
        : deviations[Math.floor(deviations.length / 2)];
      return { center: median, scale: mad === 0 ? 1 : mad };
    }
  });

  // Build output with standardized columns appended
  const newHeaders = columns.map(c => `${c}_standardized`);
  const outHeaders = [...headers, ...newHeaders];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const dataLines = rows.map(row => {
    const standardized = colIndices.map((colIdx, i) => {
      const val = Number(row[colIdx] ?? "");
      if (isNaN(val)) return "";
      const result = (val - params[i].center) / params[i].scale;
      return String(+result.toFixed(6));
    });
    return [...row.map(v => csvEscapeField(v)), ...standardized].join(",");
  });

  const methodLabel = method === "standard" ? "mean/std" : "median/MAD";
  const summary = `Standardized ${columns.length} column(s) using ${methodLabel} (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    columns_standardized: columns.length,
    summary,
  };
}

// ============================================================================
// TOOL 69: flow_ratio_columns — CALCULATE RATIOS BETWEEN COLUMNS
// ============================================================================

export interface RatioColumnsInput {
  csv_content: string;
  /** Numerator column */
  numerator: string;
  /** Denominator column */
  denominator: string;
  /** Custom output column name (default: {numerator}_per_{denominator}) */
  output_column?: string;
}

export interface RatioColumnsResult {
  csv: string;
  row_count: number;
  computed_count: number;
  zero_denominator_count: number;
  summary: string;
}

export function flowRatioColumns(input: RatioColumnsInput): RatioColumnsResult {
  const { csv_content, numerator, denominator, output_column } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const numIdx = headers.indexOf(numerator);
  const denIdx = headers.indexOf(denominator);

  if (numIdx === -1) throw new Error(`Numerator column "${numerator}" not found. Available: ${headers.join(", ")}`);
  if (denIdx === -1) throw new Error(`Denominator column "${denominator}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  const colName = output_column || `${numerator}_per_${denominator}`;
  let computedCount = 0;
  let zeroDenCount = 0;

  const ratios: string[] = rows.map(row => {
    const numVal = Number(row[numIdx] ?? "");
    const denVal = Number(row[denIdx] ?? "");

    if (isNaN(numVal) || isNaN(denVal)) return "";

    if (denVal === 0) {
      zeroDenCount++;
      return "";
    }

    computedCount++;
    return String(+(numVal / denVal).toFixed(6));
  });

  const outHeaders = [...headers, colName];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), ratios[i]].join(",");
  });

  const summary = `Ratio "${numerator}" / "${denominator}": ${computedCount} computed, ${zeroDenCount} zero-denominator (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    computed_count: computedCount,
    zero_denominator_count: zeroDenCount,
    summary,
  };
}

// ============================================================================
// TOOL 70: flow_discretize — CONVERT CONTINUOUS TO CATEGORICAL BINS
// ============================================================================

export interface DiscretizeInput {
  csv_content: string;
  /** Numeric column to discretize */
  column: string;
  /** Binning method */
  method: "equal_width" | "quantile" | "custom";
  /** Number of bins (for equal_width and quantile methods) */
  bins?: number;
  /** Custom breakpoints (for custom method) */
  breakpoints?: number[];
}

export interface DiscretizeResult {
  csv: string;
  row_count: number;
  bin_count: number;
  summary: string;
}

export function flowDiscretize(input: DiscretizeInput): DiscretizeResult {
  const { csv_content, column, method, bins = 4, breakpoints } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  const values: number[] = rows
    .map(row => Number(row[colIdx] ?? ""))
    .filter(v => !isNaN(v));

  // Determine bin edges
  let edges: number[];

  if (method === "custom" && breakpoints && breakpoints.length > 0) {
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    edges = [minVal, ...breakpoints.sort((a, b) => a - b), maxVal + 0.001];
  } else if (method === "quantile") {
    const sorted = [...values].sort((a, b) => a - b);
    edges = [sorted[0]];
    for (let i = 1; i <= bins; i++) {
      const idx = Math.min(Math.floor((i / bins) * sorted.length), sorted.length - 1);
      const val = sorted[idx];
      if (val !== edges[edges.length - 1]) {
        edges.push(val);
      }
    }
    if (edges[edges.length - 1] <= sorted[sorted.length - 1]) {
      edges[edges.length - 1] = sorted[sorted.length - 1] + 0.001;
    }
  } else {
    // equal_width
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const width = (maxVal - minVal) / bins;
    edges = [];
    for (let i = 0; i <= bins; i++) {
      edges.push(minVal + i * width);
    }
    edges[edges.length - 1] = maxVal + 0.001; // Include max
  }

  // Create bin labels
  const binLabels: string[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    binLabels.push(`[${edges[i].toFixed(1)}, ${edges[i + 1].toFixed(1)})`);
  }

  // Assign bins
  const binAssignments: string[] = rows.map(row => {
    const val = Number(row[colIdx] ?? "");
    if (isNaN(val)) return "";

    for (let i = 0; i < edges.length - 1; i++) {
      if (val >= edges[i] && val < edges[i + 1]) {
        return binLabels[i];
      }
    }
    // Edge case: value equals max edge
    return binLabels[binLabels.length - 1] || "";
  });

  const binColName = `${column}_bin`;
  const outHeaders = [...headers, binColName];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((row, i) => {
    return [...row.map(v => csvEscapeField(v)), csvEscapeField(binAssignments[i])].join(",");
  });

  const actualBins = new Set(binAssignments.filter(b => b)).size;
  const summary = `Discretized "${column}" into ${actualBins} bins using ${method} method (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    bin_count: actualBins,
    summary,
  };
}

// ============================================================================
// TOOL 71: flow_abs_values — ABSOLUTE VALUES FOR NUMERIC COLUMNS
// ============================================================================

export interface AbsValuesInput {
  csv_content: string;
  /** Columns to take absolute values of */
  columns: string[];
}

export interface AbsValuesResult {
  csv: string;
  row_count: number;
  converted_count: number;
  summary: string;
}

export function flowAbsValues(input: AbsValuesInput): AbsValuesResult {
  const { csv_content, columns } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));
  let convertedCount = 0;

  const outRows = rows.map(row => {
    const newRow = [...row];
    for (const idx of colIndices) {
      const val = Number(row[idx] ?? "");
      if (!isNaN(val) && val < 0) {
        newRow[idx] = String(Math.abs(val));
        convertedCount++;
      }
    }
    return newRow;
  });

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = outRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const summary = `Absolute values on ${columns.length} column(s): ${convertedCount} negative values converted (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    converted_count: convertedCount,
    summary,
  };
}

// ============================================================================
// TOOL 72: flow_round_values — ROUND NUMERIC COLUMNS
// ============================================================================

export interface RoundValuesInput {
  csv_content: string;
  /** Columns to round */
  columns: string[];
  /** Number of decimal places */
  decimals: number;
}

export interface RoundValuesResult {
  csv: string;
  row_count: number;
  summary: string;
}

export function flowRoundValues(input: RoundValuesInput): RoundValuesResult {
  const { csv_content, columns, decimals } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  const factor = Math.pow(10, decimals);

  const outRows = rows.map(row => {
    const newRow = [...row];
    for (const idx of colIndices) {
      const val = Number(row[idx] ?? "");
      if (!isNaN(val) && row[idx] !== undefined && row[idx].trim() !== "") {
        const rounded = Math.round(val * factor) / factor;
        newRow[idx] = decimals === 0 ? String(Math.round(val)) : String(rounded);
      }
    }
    return newRow;
  });

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = outRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const summary = `Rounded ${columns.length} column(s) to ${decimals} decimal places (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 73: flow_clamp_values — CLAMP NUMERIC VALUES TO MIN/MAX RANGE
// ============================================================================

export interface ClampValuesInput {
  csv_content: string;
  /** Column to clamp */
  column: string;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
}

export interface ClampValuesResult {
  csv: string;
  row_count: number;
  clamped_count: number;
  summary: string;
}

export function flowClampValues(input: ClampValuesInput): ClampValuesResult {
  const { csv_content, column, min, max } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));
  let clampedCount = 0;

  const outRows = rows.map(row => {
    const newRow = [...row];
    const val = Number(row[colIdx] ?? "");
    if (!isNaN(val)) {
      let clamped = val;
      if (min !== undefined && val < min) { clamped = min; clampedCount++; }
      else if (max !== undefined && val > max) { clamped = max; clampedCount++; }
      newRow[colIdx] = String(clamped);
    }
    return newRow;
  });

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = outRows.map(row => row.map(v => csvEscapeField(v)).join(","));

  const range = [min !== undefined ? `min=${min}` : "", max !== undefined ? `max=${max}` : ""].filter(Boolean).join(", ");
  const summary = `Clamped "${column}" to [${range}]: ${clampedCount} values clamped (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    clamped_count: clampedCount,
    summary,
  };
}

// ============================================================================
// TOOL 74: flow_string_split — SPLIT STRING COLUMN BY DELIMITER
// ============================================================================

export interface StringSplitInput {
  csv_content: string;
  /** Column to split */
  column: string;
  /** Delimiter to split on */
  delimiter: string;
  /** Names for the new columns */
  new_columns: string[];
}

export interface StringSplitResult {
  csv: string;
  row_count: number;
  columns_created: number;
  summary: string;
}

export function flowStringSplit(input: StringSplitInput): StringSplitResult {
  const { csv_content, column, delimiter, new_columns } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found. Available: ${headers.join(", ")}`);

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));

  const outHeaders = [...headers, ...new_columns];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const dataLines = rows.map(row => {
    const val = row[colIdx] ?? "";
    const parts = val.split(delimiter);
    const newVals = new_columns.map((_, i) => parts[i] ?? "");
    return [...row.map(v => csvEscapeField(v)), ...newVals.map(v => csvEscapeField(v))].join(",");
  });

  const summary = `Split "${column}" by "${delimiter}" into ${new_columns.length} columns: ${new_columns.join(", ")} (${rows.length} rows).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    columns_created: new_columns.length,
    summary,
  };
}

// ============================================================================
// TOOL 75: flow_pca_reduce — PRINCIPAL COMPONENT ANALYSIS
// ============================================================================

export interface PcaReduceInput {
  csv_content: string;
  /** Numeric columns to reduce */
  columns: string[];
  /** Number of output components (2 or 3) */
  n_components: number;
}

export interface PcaReduceResult {
  csv: string;
  row_count: number;
  components: number;
  explained_variance: number[];
  summary: string;
}

export function flowPcaReduce(input: PcaReduceInput): PcaReduceResult {
  const { csv_content, columns, n_components } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);
  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));
  const n = rows.length;
  const d = columns.length;

  // Extract numeric matrix and center it
  const matrix: number[][] = rows.map(row =>
    colIndices.map(idx => Number(row[idx] ?? 0) || 0)
  );

  // Compute column means
  const means: number[] = Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) means[j] += matrix[i][j];
    means[j] /= n;
  }

  // Center the data
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      matrix[i][j] -= means[j];
    }
  }

  // Compute covariance matrix (d x d)
  const cov: number[][] = Array(d).fill(null).map(() => Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += matrix[k][i] * matrix[k][j];
      cov[i][j] = sum / (n - 1 || 1);
      cov[j][i] = cov[i][j];
    }
  }

  // Power iteration to find top eigenvectors
  const components = Math.min(n_components, d);
  const eigenvectors: number[][] = [];
  const eigenvalues: number[] = [];
  const covWork = cov.map(row => [...row]);

  for (let c = 0; c < components; c++) {
    // Random initial vector
    let v: number[] = Array(d).fill(0).map((_, i) => (i === c ? 1 : 0.1));
    const norm = (vec: number[]) => Math.sqrt(vec.reduce((s, x) => s + x * x, 0));

    // Power iteration (100 steps)
    for (let iter = 0; iter < 100; iter++) {
      const newV = Array(d).fill(0);
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          newV[i] += covWork[i][j] * v[j];
        }
      }
      const n2 = norm(newV);
      if (n2 > 0) v = newV.map(x => x / n2);
    }

    // Eigenvalue = v^T * A * v
    const Av = Array(d).fill(0);
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        Av[i] += covWork[i][j] * v[j];
      }
    }
    const eigenvalue = v.reduce((s, vi, i) => s + vi * Av[i], 0);

    eigenvectors.push(v);
    eigenvalues.push(eigenvalue);

    // Deflate: remove this component from covariance matrix
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        covWork[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  // Project data onto eigenvectors
  const projected: number[][] = matrix.map(row =>
    eigenvectors.map(ev =>
      +(row.reduce((s, x, j) => s + x * ev[j], 0).toFixed(6))
    )
  );

  // Compute explained variance ratios
  const totalVariance = eigenvalues.reduce((s, v) => s + Math.abs(v), 0) || 1;
  const explainedVariance = eigenvalues.map(ev => +((Math.abs(ev) / totalVariance) * 100).toFixed(2));

  // Non-selected columns to preserve
  const nonSelectedHeaders = headers.filter((_, i) => !colIndices.includes(i));
  const nonSelectedIndices = headers.map((_, i) => i).filter(i => !colIndices.includes(i));

  const pcHeaders = Array.from({ length: components }, (_, i) => `pc${i + 1}`);
  const outHeaders = [...nonSelectedHeaders, ...pcHeaders];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");

  const dataLines = rows.map((row, i) => {
    const preserved = nonSelectedIndices.map(idx => csvEscapeField(row[idx] ?? ""));
    const pcVals = projected[i].map(v => String(v));
    return [...preserved, ...pcVals].join(",");
  });

  const varStr = explainedVariance.map((v, i) => `PC${i + 1}: ${v}%`).join(", ");
  const summary = `PCA reduced ${d} columns to ${components} components (${n} rows). Variance: ${varStr}.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: n,
    components,
    explained_variance: explainedVariance,
    summary,
  };
}

// ============================================================================
// TOOL 76: flow_distance_matrix — PAIRWISE EUCLIDEAN DISTANCE
// ============================================================================

export interface DistanceMatrixInput {
  csv_content: string;
  /** Numeric columns to compute distances from */
  columns: string[];
  /** Column to use as row/column labels */
  id_column: string;
}

export interface DistanceMatrixResult {
  csv: string;
  size: number;
  summary: string;
}

export function flowDistanceMatrix(input: DistanceMatrixInput): DistanceMatrixResult {
  const { csv_content, columns, id_column } = input;

  const lines = csv_content.trim().split("\n");
  if (lines.length < 1) throw new Error("CSV content is empty");

  const headers = parseCSVLine(lines[0]);

  const idIdx = headers.indexOf(id_column);
  if (idIdx === -1) throw new Error(`ID column "${id_column}" not found. Available: ${headers.join(", ")}`);

  const colIndices: number[] = [];
  for (const col of columns) {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
    colIndices.push(idx);
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l));
  const n = rows.length;

  const ids = rows.map(row => row[idIdx] ?? "");
  const vectors: number[][] = rows.map(row =>
    colIndices.map(idx => Number(row[idx] ?? 0) || 0)
  );

  // Compute pairwise Euclidean distances
  const distMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sumSq = 0;
      for (let k = 0; k < colIndices.length; k++) {
        sumSq += (vectors[i][k] - vectors[j][k]) ** 2;
      }
      const dist = +Math.sqrt(sumSq).toFixed(4);
      distMatrix[i][j] = dist;
      distMatrix[j][i] = dist;
    }
  }

  // Build output CSV
  const outHeaders = ["id", ...ids];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((_, i) => {
    return [csvEscapeField(ids[i]), ...distMatrix[i].map(d => String(d))].join(",");
  });

  const summary = `Euclidean distance matrix: ${n}×${n} (${columns.length} dimensions).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    size: n,
    summary,
  };
}

// ============================================================================
// TOOL 77: flow_interpolate_missing — FILL GAPS IN NUMERIC DATA
// ============================================================================

export interface InterpolateMissingInput {
  csv_content: string;
  columns: string[];
  method: "linear" | "nearest" | "zero";
}

export interface InterpolateMissingResult {
  csv: string;
  row_count: number;
  filled_count: number;
  summary: string;
}

export function flowInterpolateMissing(input: InterpolateMissingInput): InterpolateMissingResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least one row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate columns exist
  for (const col of input.columns) {
    if (!headers.includes(col)) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
  }

  let totalFilled = 0;

  for (const col of input.columns) {
    const colIdx = headers.indexOf(col);
    const values: (number | null)[] = rows.map(r => {
      const v = r[colIdx]?.trim();
      if (v === "" || v === undefined || v === null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    });

    if (input.method === "zero") {
      for (let i = 0; i < values.length; i++) {
        if (values[i] === null) {
          values[i] = 0;
          totalFilled++;
        }
      }
    } else if (input.method === "linear") {
      // Linear interpolation between known values
      // Leading/trailing nulls: fill with nearest known value
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) continue;

        // Find previous known
        let prevIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (values[j] !== null) { prevIdx = j; break; }
        }

        // Find next known
        let nextIdx = -1;
        for (let j = i + 1; j < values.length; j++) {
          if (values[j] !== null) { nextIdx = j; break; }
        }

        if (prevIdx >= 0 && nextIdx >= 0) {
          // Interpolate
          const ratio = (i - prevIdx) / (nextIdx - prevIdx);
          values[i] = values[prevIdx]! + ratio * (values[nextIdx]! - values[prevIdx]!);
        } else if (prevIdx >= 0) {
          values[i] = values[prevIdx]!;
        } else if (nextIdx >= 0) {
          values[i] = values[nextIdx]!;
        }
        // else: all null, leave as null (won't count as filled)

        if (values[i] !== null) totalFilled++;
      }
    } else if (input.method === "nearest") {
      // Use original values snapshot so filled values don't contaminate
      const origValues = [...values];
      for (let i = 0; i < values.length; i++) {
        if (origValues[i] !== null) continue;

        // Find nearest known value by distance (from originals only)
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let j = 0; j < origValues.length; j++) {
          if (origValues[j] !== null && Math.abs(j - i) < bestDist) {
            bestDist = Math.abs(j - i);
            bestIdx = j;
          }
        }

        if (bestIdx >= 0) {
          values[i] = origValues[bestIdx]!;
          totalFilled++;
        }
      }
    }

    // Write back
    for (let i = 0; i < rows.length; i++) {
      if (values[i] !== null) {
        rows[i][colIdx] = String(values[i]);
      }
    }
  }

  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map(r => r.map(v => csvEscapeField(v)).join(","));

  const summary = `Interpolated ${totalFilled} missing value(s) across ${input.columns.length} column(s) using ${input.method} method.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    filled_count: totalFilled,
    summary,
  };
}

// ============================================================================
// TOOL 78: flow_rank_values — RANK NUMERIC VALUES
// ============================================================================

export interface RankValuesInput {
  csv_content: string;
  column: string;
  method: "dense" | "ordinal" | "min" | "max";
  ascending?: boolean;
  output_column?: string;
}

export interface RankValuesResult {
  csv: string;
  row_count: number;
  summary: string;
}

export function flowRankValues(input: RankValuesInput): RankValuesResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least one row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  const colIdx = headers.indexOf(input.column);
  if (colIdx < 0) throw new Error(`Column "${input.column}" not found. Available: ${headers.join(", ")}`);

  const ascending = input.ascending !== false; // default true
  const outCol = input.output_column || `${input.column}_rank`;

  // Extract numeric values with original indices
  const indexed: { idx: number; val: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = Number(rows[i][colIdx]);
    indexed.push({ idx: i, val: isNaN(v) ? (ascending ? Infinity : -Infinity) : v });
  }

  // Sort
  indexed.sort((a, b) => ascending ? a.val - b.val : b.val - a.val);

  // Assign ranks based on method
  const ranks = new Array(rows.length).fill(0);

  if (input.method === "ordinal") {
    for (let i = 0; i < indexed.length; i++) {
      ranks[indexed[i].idx] = i + 1;
    }
  } else if (input.method === "dense") {
    let rank = 1;
    ranks[indexed[0].idx] = rank;
    for (let i = 1; i < indexed.length; i++) {
      if (indexed[i].val !== indexed[i - 1].val) rank++;
      ranks[indexed[i].idx] = rank;
    }
  } else if (input.method === "min") {
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length && indexed[j].val === indexed[i].val) j++;
      const minRank = i + 1;
      for (let k = i; k < j; k++) {
        ranks[indexed[k].idx] = minRank;
      }
      i = j;
    }
  } else if (input.method === "max") {
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length && indexed[j].val === indexed[i].val) j++;
      const maxRank = j;
      for (let k = i; k < j; k++) {
        ranks[indexed[k].idx] = maxRank;
      }
      i = j;
    }
  }

  const outHeaders = [...headers, outCol];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((r, i) => [...r.map(v => csvEscapeField(v)), String(ranks[i])].join(","));

  const summary = `Ranked ${rows.length} rows by "${input.column}" (${input.method}, ${ascending ? "ascending" : "descending"}).`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    summary,
  };
}

// ============================================================================
// TOOL 79: flow_running_total — CUMULATIVE SUM FOR TIME-SERIES
// ============================================================================

export interface RunningTotalInput {
  csv_content: string;
  column: string;
  output_column?: string;
}

export interface RunningTotalResult {
  csv: string;
  row_count: number;
  final_total: number;
  summary: string;
}

export function flowRunningTotal(input: RunningTotalInput): RunningTotalResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least one row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  const colIdx = headers.indexOf(input.column);
  if (colIdx < 0) throw new Error(`Column "${input.column}" not found. Available: ${headers.join(", ")}`);

  const outCol = input.output_column || `${input.column}_running_total`;

  let total = 0;
  const totals: number[] = [];
  for (const row of rows) {
    const v = Number(row[colIdx]);
    if (!isNaN(v)) total += v;
    totals.push(total);
  }

  const outHeaders = [...headers, outCol];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((r, i) => [...r.map(v => csvEscapeField(v)), String(totals[i])].join(","));

  const summary = `Running total of "${input.column}": final total = ${total} across ${rows.length} rows.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    final_total: total,
    summary,
  };
}

// ============================================================================
// TOOL 80: flow_zscore — Z-SCORE STANDARDIZATION
// ============================================================================

export interface ZscoreInput {
  csv_content: string;
  columns: string[];
}

export interface ZscoreResult {
  csv: string;
  row_count: number;
  summary: string;
}

export function flowZscore(input: ZscoreInput): ZscoreResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least one row");

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Validate columns
  for (const col of input.columns) {
    if (!headers.includes(col)) throw new Error(`Column "${col}" not found. Available: ${headers.join(", ")}`);
  }

  // Compute z-scores per column
  const zScores: Map<string, number[]> = new Map();

  for (const col of input.columns) {
    const colIdx = headers.indexOf(col);
    const values = rows.map(r => Number(r[colIdx]));
    const validValues = values.filter(v => !isNaN(v));

    const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    const variance = validValues.reduce((a, b) => a + (b - mean) ** 2, 0) / validValues.length;
    const std = Math.sqrt(variance);

    const zs = values.map(v => {
      if (isNaN(v) || std === 0) return 0;
      return Math.round(((v - mean) / std) * 10000) / 10000;
    });

    zScores.set(col, zs);
  }

  const outHeaders = [...headers, ...input.columns.map(c => `${c}_zscore`)];
  const headerLine = outHeaders.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map((r, i) => {
    const base = r.map(v => csvEscapeField(v));
    const zCols = input.columns.map(c => String(zScores.get(c)![i]));
    return [...base, ...zCols].join(",");
  });

  const summary = `Z-scores computed for ${input.columns.length} column(s) across ${rows.length} rows.`;

  return {
    csv: [headerLine, ...dataLines].join("\n"),
    row_count: rows.length,
    summary,
  };
}
