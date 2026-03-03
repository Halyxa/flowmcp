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
