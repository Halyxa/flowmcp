import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// TOOL 24: flow_nlp_to_viz — THE CLOSER
// ============================================================================

export interface NlpToVizInput {
  prompt: string;
  data_source?: "generate" | "transform";
  csv_content?: string;
  complexity?: "simple" | "medium" | "rich";
  row_count?: number;
  style?: "scientific" | "business" | "storytelling" | "exploratory";
}

export function flowNlpToViz(input: NlpToVizInput) {
  const rowCount = Math.min(input.row_count ?? 100, 5000);
  const complexity = input.complexity ?? "medium";

  // Step 1: Parse intent from prompt
  const prompt = input.prompt.toLowerCase();
  const intent = detectIntent(prompt);

  // Step 2: Generate or transform data
  let csv: string;
  let columns: string[];
  let description: string;

  if (input.data_source === "transform" && input.csv_content) {
    // Transform mode: reshape provided CSV
    const result = transformForViz(input.csv_content, intent);
    csv = result.csv;
    columns = result.columns;
    description = `Transformed provided data for ${intent.vizType} visualization`;
  } else {
    // Generate mode: create synthetic data
    const result = generateSyntheticData(intent, rowCount, complexity);
    csv = result.csv;
    columns = result.columns;
    description = result.description;
  }

  // Step 3: Template selection
  const template = selectTemplate(intent);

  // Step 4: Column mapping
  const mapping = mapColumns(columns, intent);

  return {
    csv,
    visualization: {
      template,
      title: generateTitle(intent),
      description,
      column_mappings: mapping,
    },
    data_summary: {
      rows: csv.split("\n").length - 1,
      columns,
      generation_method:
        input.data_source === "transform"
          ? "Transformed from provided CSV"
          : "Synthetic data based on prompt",
    },
    flow_setup: {
      upload_instructions: `1. Copy the CSV data\n2. Go to https://a.flow.gl\n3. Click "Create Flow" → "Upload Data"\n4. Paste CSV\n5. Select template: ${template}\n6. Map columns as described`,
      recommended_settings: `Template: ${template}. ${Object.entries(mapping)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`,
    },
    interpretation: description,
  };
}

interface VizIntent {
  domain: string;
  vizType: "scatter" | "network" | "map" | "timeline" | "chart";
  keywords: string[];
  variables: string[];
}

function detectIntent(prompt: string): VizIntent {
  // Network signals
  const networkWords = [
    "network",
    "graph",
    "connection",
    "relationship",
    "social",
    "link",
    "node",
    "edge",
    "hierarchy",
    "org chart",
    "supply chain",
    "dependency",
  ];
  // Geo signals
  const geoWords = [
    "map",
    "geographic",
    "location",
    "city",
    "country",
    "coordinate",
    "lat",
    "lng",
    "globe",
    "spatial",
    "region",
  ];
  // Time signals
  const timeWords = [
    "time",
    "timeline",
    "temporal",
    "trend",
    "over time",
    "quarterly",
    "monthly",
    "annual",
    "year",
    "evolution",
    "animate",
    "growth",
  ];
  // Chart/scatter signals
  const scatterWords = [
    "scatter",
    "distribution",
    "cluster",
    "compare",
    "correlation",
    "dimension",
    "metric",
    "score",
  ];

  const matchCount = (words: string[]) =>
    words.filter((w) => prompt.includes(w)).length;

  const scores = [
    { type: "network" as const, score: matchCount(networkWords) },
    { type: "map" as const, score: matchCount(geoWords) },
    { type: "timeline" as const, score: matchCount(timeWords) },
    { type: "scatter" as const, score: matchCount(scatterWords) },
  ];

  const best = scores.sort((a, b) => b.score - a.score)[0];
  const vizType = best.score > 0 ? best.type : "scatter";

  // Detect domain
  const domains: Record<string, string[]> = {
    finance: [
      "stock",
      "portfolio",
      "market",
      "trading",
      "revenue",
      "profit",
      "financial",
      "investment",
      "fund",
    ],
    science: [
      "research",
      "experiment",
      "molecule",
      "gene",
      "protein",
      "physics",
      "chemistry",
      "biology",
    ],
    social: [
      "social",
      "people",
      "community",
      "influence",
      "follower",
      "friend",
      "user",
    ],
    business: [
      "company",
      "employee",
      "department",
      "customer",
      "sales",
      "product",
      "kpi",
    ],
    technology: [
      "software",
      "api",
      "server",
      "package",
      "dependency",
      "microservice",
      "code",
    ],
  };

  let domain = "general";
  let maxDomainScore = 0;
  for (const [d, words] of Object.entries(domains)) {
    const s = matchCount(words);
    if (s > maxDomainScore) {
      maxDomainScore = s;
      domain = d;
    }
  }

  return {
    domain,
    vizType,
    keywords: prompt.split(/\s+/).filter((w) => w.length > 3),
    variables: [],
  };
}

function generateSyntheticData(
  intent: VizIntent,
  rowCount: number,
  complexity: string,
): { csv: string; columns: string[]; description: string } {
  // Seeded pseudo-random (deterministic for tests)
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const randNormal = () => {
    let u = 0,
      v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

  switch (intent.vizType) {
    case "network": {
      // Generate power-law network
      const nodeCount = Math.min(rowCount, 500);
      const nodes: string[] = [];
      const edges: Map<string, Set<string>> = new Map();
      const categories = ["Team A", "Team B", "Team C", "External"];

      for (let i = 0; i < nodeCount; i++) {
        const id = `node_${i}`;
        nodes.push(id);
        edges.set(id, new Set());
      }

      // Preferential attachment
      for (let i = 1; i < nodeCount; i++) {
        const numEdges = Math.max(1, Math.floor(random() * 3));
        for (let e = 0; e < numEdges; e++) {
          const target = Math.floor(random() * i);
          edges.get(nodes[i])!.add(nodes[target]);
          edges.get(nodes[target])!.add(nodes[i]);
        }
      }

      const columns = ["id", "connections by id", "category", "importance"];
      const csvRows = nodes.map((id) => {
        const conns = Array.from(edges.get(id) || []).join("|");
        return [
          id,
          conns,
          pick(categories),
          (random() * 100).toFixed(1),
        ]
          .map((v) => csvEscapeField(String(v)))
          .join(",");
      });

      return {
        csv: [columns.join(","), ...csvRows].join("\n"),
        columns,
        description: `Generated ${intent.domain} network with ${nodeCount} nodes using preferential attachment. Colored by category, sized by importance.`,
      };
    }

    case "map": {
      const cities = [
        { name: "New York", lat: 40.71, lng: -74.01, country: "US" },
        { name: "London", lat: 51.51, lng: -0.13, country: "UK" },
        { name: "Tokyo", lat: 35.68, lng: 139.69, country: "JP" },
        { name: "Paris", lat: 48.86, lng: 2.35, country: "FR" },
        { name: "Sydney", lat: -33.87, lng: 151.21, country: "AU" },
        { name: "Dubai", lat: 25.2, lng: 55.27, country: "AE" },
        { name: "Singapore", lat: 1.35, lng: 103.82, country: "SG" },
        { name: "Berlin", lat: 52.52, lng: 13.41, country: "DE" },
        { name: "Mumbai", lat: 19.08, lng: 72.88, country: "IN" },
        { name: "São Paulo", lat: -23.55, lng: -46.63, country: "BR" },
        { name: "Toronto", lat: 43.65, lng: -79.38, country: "CA" },
        { name: "Seoul", lat: 37.57, lng: 126.98, country: "KR" },
        { name: "Cairo", lat: 30.04, lng: 31.24, country: "EG" },
        { name: "Mexico City", lat: 19.43, lng: -99.13, country: "MX" },
        { name: "Lagos", lat: 6.52, lng: 3.38, country: "NG" },
      ];

      const columns = [
        "city",
        "country",
        "latitude",
        "longitude",
        "value",
        "category",
      ];
      const categories =
        complexity === "simple"
          ? ["Primary"]
          : ["Primary", "Secondary", "Tertiary"];
      const csvRows: string[] = [];

      for (let i = 0; i < Math.min(rowCount, 200); i++) {
        const city = cities[i % cities.length];
        const jitter = complexity === "simple" ? 0 : (random() - 0.5) * 2;
        csvRows.push(
          [
            city.name +
              (i >= cities.length
                ? ` Branch ${Math.floor(i / cities.length)}`
                : ""),
            city.country,
            (city.lat + jitter * 0.5).toFixed(4),
            (city.lng + jitter * 0.5).toFixed(4),
            (random() * 1000).toFixed(0),
            pick(categories),
          ]
            .map((v) => csvEscapeField(String(v)))
            .join(","),
        );
      }

      return {
        csv: [columns.join(","), ...csvRows].join("\n"),
        columns,
        description: `Generated geographic ${intent.domain} data across ${Math.min(rowCount, 200)} locations worldwide. Sized by value, colored by category.`,
      };
    }

    case "timeline": {
      const groups =
        complexity === "simple"
          ? ["Series A"]
          : ["Series A", "Series B", "Series C"];
      const startYear = 2020;
      const months = Math.min(rowCount, 60);
      const columns = ["date", "group", "value", "growth_rate"];
      const csvRows: string[] = [];

      for (const group of groups) {
        let value = 50 + random() * 50;
        for (let m = 0; m < months; m++) {
          const year = startYear + Math.floor(m / 12);
          const month = (m % 12) + 1;
          const date = `${year}-${String(month).padStart(2, "0")}-01`;
          const growth = (random() - 0.4) * 10;
          value = Math.max(0, value + growth);
          csvRows.push(
            [date, group, value.toFixed(2), growth.toFixed(2)]
              .map((v) => csvEscapeField(String(v)))
              .join(","),
          );
        }
      }

      return {
        csv: [columns.join(","), ...csvRows].join("\n"),
        columns,
        description: `Generated ${intent.domain} time series with ${groups.length} groups across ${months} months. Tracks value evolution and growth rate.`,
      };
    }

    default: {
      // scatter/chart
      const numericCols =
        complexity === "simple" ? 3 : complexity === "medium" ? 5 : 7;
      const catGroups =
        complexity === "simple"
          ? ["A", "B"]
          : ["Alpha", "Beta", "Gamma", "Delta"];
      const colNames = ["label", "category"];
      const possibleCols = [
        "x_value",
        "y_value",
        "z_value",
        "size",
        "intensity",
        "score",
        "weight",
      ];
      for (let i = 0; i < numericCols; i++) {
        colNames.push(possibleCols[i]);
      }

      const csvRows: string[] = [];
      for (let i = 0; i < rowCount; i++) {
        const cat = pick(catGroups);
        const catOffset = catGroups.indexOf(cat) * 20;
        const row: string[] = [`item_${i}`, cat];
        for (let c = 0; c < numericCols; c++) {
          const base = catOffset + randNormal() * 30;
          // Add correlations between first 3 columns
          const correlation =
            c < 3 && csvRows.length > 0
              ? Number(csvRows[csvRows.length - 1].split(",")[2]) * 0.1
              : 0;
          row.push((base + correlation + random() * 10).toFixed(2));
        }
        csvRows.push(row.map((v) => csvEscapeField(String(v))).join(","));
      }

      return {
        csv: [colNames.join(","), ...csvRows].join("\n"),
        columns: colNames,
        description: `Generated ${intent.domain} scatter data with ${rowCount} points across ${numericCols} dimensions. Grouped by ${catGroups.length} categories.`,
      };
    }
  }
}

function transformForViz(
  csvContent: string,
  _intent: VizIntent,
): { csv: string; columns: string[] } {
  // Pass through — the CSV is already usable, just validate it
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2)
    throw new Error("CSV must have header + at least 1 data row");
  const headers = parseCSVLine(lines[0]);
  return { csv: csvContent, columns: headers };
}

function selectTemplate(intent: VizIntent): string {
  const templates: Record<string, string> = {
    network: "Network Graph",
    map: "Globe / Map",
    timeline: "Time Series",
    scatter: "3D Scatter",
    chart: "Bar Chart",
  };
  return templates[intent.vizType] || "3D Scatter";
}

function generateTitle(intent: VizIntent): string {
  const domainTitles: Record<string, string> = {
    finance: "Financial Analysis",
    science: "Research Data Visualization",
    social: "Social Network Analysis",
    business: "Business Intelligence View",
    technology: "Technology Landscape",
    general: "3D Data Exploration",
  };
  const vizTitles: Record<string, string> = {
    network: "Network Graph",
    map: "Geographic Distribution",
    timeline: "Temporal Evolution",
    scatter: "Multi-Dimensional Analysis",
  };
  return `${domainTitles[intent.domain] || "Data"} — ${vizTitles[intent.vizType] || "Visualization"}`;
}

function mapColumns(
  columns: string[],
  intent: VizIntent,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lower = columns.map((c) => c.toLowerCase());

  if (intent.vizType === "network") {
    mapping.id = columns[lower.indexOf("id")] || columns[0];
    const connIdx = lower.findIndex((c) => c.includes("connection"));
    if (connIdx >= 0) mapping.connections = columns[connIdx];
  } else if (intent.vizType === "map") {
    const latIdx = lower.findIndex((c) => c.includes("lat"));
    const lngIdx = lower.findIndex(
      (c) => c.includes("lon") || c.includes("lng"),
    );
    if (latIdx >= 0) mapping.latitude = columns[latIdx];
    if (lngIdx >= 0) mapping.longitude = columns[lngIdx];
  }

  // Find numeric columns for x, y, z
  const skipCols = [
    "id",
    "label",
    "name",
    "category",
    "group",
    "connections by id",
  ];
  const numericCols = columns.filter(
    (_c, i) => !skipCols.includes(lower[i]),
  );
  if (numericCols[0]) mapping.x_axis = numericCols[0];
  if (numericCols[1]) mapping.y_axis = numericCols[1];
  if (numericCols[2]) mapping.z_axis = numericCols[2];

  // Find category column for color
  const catIdx = lower.findIndex(
    (c) =>
      c.includes("category") || c.includes("group") || c.includes("type"),
  );
  if (catIdx >= 0) mapping.color = columns[catIdx];

  return mapping;
}

// ============================================================================
// TOOL 23: flow_geo_enhance — GEOGRAPHIC ENRICHMENT
// ============================================================================

export interface GeoEnhanceInput {
  csv_content: string;
  location_columns: string[];
  location_format?: "city" | "country" | "city_country" | "coordinates" | "auto";
  combine_columns?: boolean;
  fallback_coordinates?: { lat: number; lng: number };
}

export interface GeoEnhanceResult {
  csv: string;
  stats: {
    total_rows: number;
    resolved: number;
    unresolved: number;
    resolution_rate: number;
    confidence_breakdown: Record<string, number>;
  };
  unresolved_locations: string[];
}

// Built-in gazetteer: top cities worldwide
const CITIES_GAZETTEER: Array<{
  name: string;
  alt: string[];
  lat: number;
  lng: number;
  country: string;
  pop: number;
}> = [
  // North America
  { name: "New York", alt: ["nyc", "new york city", "manhattan"], lat: 40.7128, lng: -74.006, country: "US", pop: 8336817 },
  { name: "Los Angeles", alt: ["la", "los angeles"], lat: 34.0522, lng: -118.2437, country: "US", pop: 3979576 },
  { name: "Chicago", alt: ["chi-town"], lat: 41.8781, lng: -87.6298, country: "US", pop: 2693976 },
  { name: "Houston", alt: [], lat: 29.7604, lng: -95.3698, country: "US", pop: 2320268 },
  { name: "Phoenix", alt: [], lat: 33.4484, lng: -112.074, country: "US", pop: 1680992 },
  { name: "Philadelphia", alt: ["philly"], lat: 39.9526, lng: -75.1652, country: "US", pop: 1584064 },
  { name: "San Antonio", alt: [], lat: 29.4241, lng: -98.4936, country: "US", pop: 1547253 },
  { name: "San Diego", alt: [], lat: 32.7157, lng: -117.1611, country: "US", pop: 1423851 },
  { name: "Dallas", alt: [], lat: 32.7767, lng: -96.797, country: "US", pop: 1343573 },
  { name: "San Jose", alt: [], lat: 37.3382, lng: -121.8863, country: "US", pop: 1021795 },
  { name: "Austin", alt: [], lat: 30.2672, lng: -97.7431, country: "US", pop: 978908 },
  { name: "San Francisco", alt: ["sf", "san fran"], lat: 37.7749, lng: -122.4194, country: "US", pop: 873965 },
  { name: "Seattle", alt: [], lat: 47.6062, lng: -122.3321, country: "US", pop: 737015 },
  { name: "Denver", alt: [], lat: 39.7392, lng: -104.9903, country: "US", pop: 727211 },
  { name: "Washington", alt: ["dc", "washington dc", "washington d.c."], lat: 38.9072, lng: -77.0369, country: "US", pop: 689545 },
  { name: "Nashville", alt: [], lat: 36.1627, lng: -86.7816, country: "US", pop: 689447 },
  { name: "Boston", alt: [], lat: 42.3601, lng: -71.0589, country: "US", pop: 675647 },
  { name: "Atlanta", alt: ["atl"], lat: 33.749, lng: -84.388, country: "US", pop: 498715 },
  { name: "Miami", alt: [], lat: 25.7617, lng: -80.1918, country: "US", pop: 467963 },
  { name: "Portland", alt: [], lat: 45.5152, lng: -122.6784, country: "US", pop: 652503 },
  { name: "Las Vegas", alt: ["vegas"], lat: 36.1699, lng: -115.1398, country: "US", pop: 641903 },
  { name: "Toronto", alt: [], lat: 43.6532, lng: -79.3832, country: "CA", pop: 2930000 },
  { name: "Montreal", alt: [], lat: 45.5017, lng: -73.5673, country: "CA", pop: 1780000 },
  { name: "Vancouver", alt: [], lat: 49.2827, lng: -123.1207, country: "CA", pop: 675218 },
  { name: "Mexico City", alt: ["cdmx", "ciudad de mexico"], lat: 19.4326, lng: -99.1332, country: "MX", pop: 9209944 },
  { name: "Guadalajara", alt: [], lat: 20.6597, lng: -103.3496, country: "MX", pop: 1495189 },
  // Europe
  { name: "London", alt: ["london city"], lat: 51.5074, lng: -0.1278, country: "GB", pop: 8982000 },
  { name: "Paris", alt: [], lat: 48.8566, lng: 2.3522, country: "FR", pop: 2161000 },
  { name: "Berlin", alt: [], lat: 52.52, lng: 13.405, country: "DE", pop: 3748148 },
  { name: "Madrid", alt: [], lat: 40.4168, lng: -3.7038, country: "ES", pop: 3266126 },
  { name: "Rome", alt: ["roma"], lat: 41.9028, lng: 12.4964, country: "IT", pop: 2873000 },
  { name: "Amsterdam", alt: [], lat: 52.3676, lng: 4.9041, country: "NL", pop: 872680 },
  { name: "Vienna", alt: ["wien"], lat: 48.2082, lng: 16.3738, country: "AT", pop: 1911191 },
  { name: "Barcelona", alt: [], lat: 41.3874, lng: 2.1686, country: "ES", pop: 1620343 },
  { name: "Munich", alt: ["muenchen", "munchen"], lat: 48.1351, lng: 11.582, country: "DE", pop: 1471508 },
  { name: "Milan", alt: ["milano"], lat: 45.4642, lng: 9.19, country: "IT", pop: 1396059 },
  { name: "Prague", alt: ["praha"], lat: 50.0755, lng: 14.4378, country: "CZ", pop: 1309000 },
  { name: "Stockholm", alt: [], lat: 59.3293, lng: 18.0686, country: "SE", pop: 975904 },
  { name: "Dublin", alt: [], lat: 53.3498, lng: -6.2603, country: "IE", pop: 544107 },
  { name: "Brussels", alt: ["bruxelles", "brussel"], lat: 50.8503, lng: 4.3517, country: "BE", pop: 1209000 },
  { name: "Lisbon", alt: ["lisboa"], lat: 38.7223, lng: -9.1393, country: "PT", pop: 544851 },
  { name: "Warsaw", alt: ["warszawa"], lat: 52.2297, lng: 21.0122, country: "PL", pop: 1790658 },
  { name: "Budapest", alt: [], lat: 47.4979, lng: 19.0402, country: "HU", pop: 1752286 },
  { name: "Zurich", alt: ["zuerich"], lat: 47.3769, lng: 8.5417, country: "CH", pop: 434008 },
  { name: "Copenhagen", alt: ["kobenhavn"], lat: 55.6761, lng: 12.5683, country: "DK", pop: 794128 },
  { name: "Oslo", alt: [], lat: 59.9139, lng: 10.7522, country: "NO", pop: 697549 },
  { name: "Helsinki", alt: [], lat: 60.1699, lng: 24.9384, country: "FI", pop: 656920 },
  { name: "Athens", alt: ["athina"], lat: 37.9838, lng: 23.7275, country: "GR", pop: 664046 },
  { name: "Moscow", alt: ["moskva"], lat: 55.7558, lng: 37.6173, country: "RU", pop: 12632409 },
  { name: "Istanbul", alt: [], lat: 41.0082, lng: 28.9784, country: "TR", pop: 15462452 },
  // Asia
  { name: "Tokyo", alt: [], lat: 35.6762, lng: 139.6503, country: "JP", pop: 13960000 },
  { name: "Osaka", alt: [], lat: 34.6937, lng: 135.5023, country: "JP", pop: 2753862 },
  { name: "Beijing", alt: ["peking"], lat: 39.9042, lng: 116.4074, country: "CN", pop: 21540000 },
  { name: "Shanghai", alt: [], lat: 31.2304, lng: 121.4737, country: "CN", pop: 24870000 },
  { name: "Shenzhen", alt: [], lat: 22.5431, lng: 114.0579, country: "CN", pop: 12528300 },
  { name: "Guangzhou", alt: ["canton"], lat: 23.1291, lng: 113.2644, country: "CN", pop: 15310000 },
  { name: "Hong Kong", alt: ["hk"], lat: 22.3193, lng: 114.1694, country: "HK", pop: 7482500 },
  { name: "Seoul", alt: [], lat: 37.5665, lng: 126.978, country: "KR", pop: 9776000 },
  { name: "Mumbai", alt: ["bombay"], lat: 19.076, lng: 72.8777, country: "IN", pop: 20411274 },
  { name: "Delhi", alt: ["new delhi"], lat: 28.7041, lng: 77.1025, country: "IN", pop: 16787941 },
  { name: "Bangalore", alt: ["bengaluru"], lat: 12.9716, lng: 77.5946, country: "IN", pop: 8443675 },
  { name: "Chennai", alt: ["madras"], lat: 13.0827, lng: 80.2707, country: "IN", pop: 4681087 },
  { name: "Kolkata", alt: ["calcutta"], lat: 22.5726, lng: 88.3639, country: "IN", pop: 4496694 },
  { name: "Singapore", alt: ["sg"], lat: 1.3521, lng: 103.8198, country: "SG", pop: 5850342 },
  { name: "Bangkok", alt: ["krung thep"], lat: 13.7563, lng: 100.5018, country: "TH", pop: 10539000 },
  { name: "Jakarta", alt: [], lat: -6.2088, lng: 106.8456, country: "ID", pop: 10770487 },
  { name: "Taipei", alt: [], lat: 25.033, lng: 121.5654, country: "TW", pop: 2646204 },
  { name: "Kuala Lumpur", alt: ["kl"], lat: 3.139, lng: 101.6869, country: "MY", pop: 1808000 },
  { name: "Dubai", alt: [], lat: 25.2048, lng: 55.2708, country: "AE", pop: 3331420 },
  { name: "Riyadh", alt: [], lat: 24.7136, lng: 46.6753, country: "SA", pop: 7676654 },
  { name: "Tel Aviv", alt: [], lat: 32.0853, lng: 34.7818, country: "IL", pop: 460613 },
  // South America
  { name: "São Paulo", alt: ["sao paulo", "sp"], lat: -23.5505, lng: -46.6333, country: "BR", pop: 12325232 },
  { name: "Rio de Janeiro", alt: ["rio"], lat: -22.9068, lng: -43.1729, country: "BR", pop: 6748000 },
  { name: "Buenos Aires", alt: [], lat: -34.6037, lng: -58.3816, country: "AR", pop: 3075646 },
  { name: "Lima", alt: [], lat: -12.0464, lng: -77.0428, country: "PE", pop: 10092000 },
  { name: "Bogotá", alt: ["bogota"], lat: 4.711, lng: -74.0721, country: "CO", pop: 7412566 },
  { name: "Santiago", alt: [], lat: -33.4489, lng: -70.6693, country: "CL", pop: 5614000 },
  // Africa
  { name: "Lagos", alt: [], lat: 6.5244, lng: 3.3792, country: "NG", pop: 15388000 },
  { name: "Cairo", alt: ["al-qahirah"], lat: 30.0444, lng: 31.2357, country: "EG", pop: 10230000 },
  { name: "Johannesburg", alt: ["joburg", "jozi"], lat: -26.2041, lng: 28.0473, country: "ZA", pop: 5783000 },
  { name: "Cape Town", alt: [], lat: -33.9249, lng: 18.4241, country: "ZA", pop: 4618000 },
  { name: "Nairobi", alt: [], lat: -1.2921, lng: 36.8219, country: "KE", pop: 4397073 },
  { name: "Casablanca", alt: [], lat: 33.5731, lng: -7.5898, country: "MA", pop: 3360000 },
  { name: "Addis Ababa", alt: [], lat: 9.0222, lng: 38.7469, country: "ET", pop: 3352000 },
  // Oceania
  { name: "Sydney", alt: [], lat: -33.8688, lng: 151.2093, country: "AU", pop: 5312163 },
  { name: "Melbourne", alt: [], lat: -37.8136, lng: 144.9631, country: "AU", pop: 5078193 },
  { name: "Brisbane", alt: [], lat: -27.4698, lng: 153.0251, country: "AU", pop: 2514184 },
  { name: "Auckland", alt: [], lat: -36.8485, lng: 174.7633, country: "NZ", pop: 1657200 },
];

const COUNTRY_CENTROIDS: Array<{
  name: string;
  code: string;
  alt: string[];
  lat: number;
  lng: number;
}> = [
  // G20 + major countries
  { name: "United States", code: "US", alt: ["usa", "america", "united states of america", "us"], lat: 37.0902, lng: -95.7129 },
  { name: "Canada", code: "CA", alt: ["ca"], lat: 56.1304, lng: -106.3468 },
  { name: "Mexico", code: "MX", alt: ["mx", "mejico"], lat: 23.6345, lng: -102.5528 },
  { name: "Brazil", code: "BR", alt: ["br", "brasil"], lat: -14.235, lng: -51.9253 },
  { name: "Argentina", code: "AR", alt: ["ar"], lat: -38.4161, lng: -63.6167 },
  { name: "Colombia", code: "CO", alt: ["co"], lat: 4.5709, lng: -74.2973 },
  { name: "Chile", code: "CL", alt: ["cl"], lat: -35.6751, lng: -71.543 },
  { name: "Peru", code: "PE", alt: ["pe"], lat: -9.19, lng: -75.0152 },
  { name: "United Kingdom", code: "GB", alt: ["uk", "gb", "britain", "great britain", "england"], lat: 55.3781, lng: -3.436 },
  { name: "France", code: "FR", alt: ["fr"], lat: 46.2276, lng: 2.2137 },
  { name: "Germany", code: "DE", alt: ["de", "deutschland"], lat: 51.1657, lng: 10.4515 },
  { name: "Italy", code: "IT", alt: ["it", "italia"], lat: 41.8719, lng: 12.5674 },
  { name: "Spain", code: "ES", alt: ["es", "espana"], lat: 40.4637, lng: -3.7492 },
  { name: "Netherlands", code: "NL", alt: ["nl", "holland"], lat: 52.1326, lng: 5.2913 },
  { name: "Belgium", code: "BE", alt: ["be"], lat: 50.5039, lng: 4.4699 },
  { name: "Switzerland", code: "CH", alt: ["ch", "schweiz", "suisse"], lat: 46.8182, lng: 8.2275 },
  { name: "Austria", code: "AT", alt: ["at", "oesterreich"], lat: 47.5162, lng: 14.5501 },
  { name: "Sweden", code: "SE", alt: ["se", "sverige"], lat: 60.1282, lng: 18.6435 },
  { name: "Norway", code: "NO", alt: ["no", "norge"], lat: 60.472, lng: 8.4689 },
  { name: "Denmark", code: "DK", alt: ["dk", "danmark"], lat: 56.2639, lng: 9.5018 },
  { name: "Finland", code: "FI", alt: ["fi", "suomi"], lat: 61.9241, lng: 25.7482 },
  { name: "Poland", code: "PL", alt: ["pl", "polska"], lat: 51.9194, lng: 19.1451 },
  { name: "Portugal", code: "PT", alt: ["pt"], lat: 39.3999, lng: -8.2245 },
  { name: "Greece", code: "GR", alt: ["gr", "hellas"], lat: 39.0742, lng: 21.8243 },
  { name: "Ireland", code: "IE", alt: ["ie", "eire"], lat: 53.1424, lng: -7.6921 },
  { name: "Czech Republic", code: "CZ", alt: ["cz", "czechia", "cesko"], lat: 49.8175, lng: 15.473 },
  { name: "Hungary", code: "HU", alt: ["hu", "magyarorszag"], lat: 47.1625, lng: 19.5033 },
  { name: "Russia", code: "RU", alt: ["ru", "russian federation"], lat: 61.524, lng: 105.3188 },
  { name: "Turkey", code: "TR", alt: ["tr", "turkiye"], lat: 38.9637, lng: 35.2433 },
  { name: "China", code: "CN", alt: ["cn", "prc", "peoples republic of china"], lat: 35.8617, lng: 104.1954 },
  { name: "Japan", code: "JP", alt: ["jp", "nippon"], lat: 36.2048, lng: 138.2529 },
  { name: "South Korea", code: "KR", alt: ["kr", "korea", "republic of korea"], lat: 35.9078, lng: 127.7669 },
  { name: "India", code: "IN", alt: ["in", "bharat"], lat: 20.5937, lng: 78.9629 },
  { name: "Indonesia", code: "ID", alt: ["id"], lat: -0.7893, lng: 113.9213 },
  { name: "Thailand", code: "TH", alt: ["th", "siam"], lat: 15.87, lng: 100.9925 },
  { name: "Vietnam", code: "VN", alt: ["vn", "viet nam"], lat: 14.0583, lng: 108.2772 },
  { name: "Philippines", code: "PH", alt: ["ph", "pilipinas"], lat: 12.8797, lng: 121.774 },
  { name: "Malaysia", code: "MY", alt: ["my"], lat: 4.2105, lng: 101.9758 },
  { name: "Singapore", code: "SG", alt: ["sg"], lat: 1.3521, lng: 103.8198 },
  { name: "Taiwan", code: "TW", alt: ["tw", "republic of china", "roc"], lat: 23.6978, lng: 120.9605 },
  { name: "Saudi Arabia", code: "SA", alt: ["sa", "ksa", "kingdom of saudi arabia"], lat: 23.8859, lng: 45.0792 },
  { name: "United Arab Emirates", code: "AE", alt: ["ae", "uae", "emirates"], lat: 23.4241, lng: 53.8478 },
  { name: "Israel", code: "IL", alt: ["il"], lat: 31.0461, lng: 34.8516 },
  { name: "Egypt", code: "EG", alt: ["eg", "misr"], lat: 26.8206, lng: 30.8025 },
  { name: "Nigeria", code: "NG", alt: ["ng"], lat: 9.082, lng: 8.6753 },
  { name: "South Africa", code: "ZA", alt: ["za", "rsa"], lat: -30.5595, lng: 22.9375 },
  { name: "Kenya", code: "KE", alt: ["ke"], lat: -0.0236, lng: 37.9062 },
  { name: "Morocco", code: "MA", alt: ["ma", "maroc"], lat: 31.7917, lng: -7.0926 },
  { name: "Ethiopia", code: "ET", alt: ["et"], lat: 9.145, lng: 40.4897 },
  { name: "Australia", code: "AU", alt: ["au", "oz"], lat: -25.2744, lng: 133.7751 },
  { name: "New Zealand", code: "NZ", alt: ["nz", "aotearoa"], lat: -40.9006, lng: 174.886 },
];

// Normalize string for matching
function normalizeLocation(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

interface GeoMatch {
  lat: number;
  lng: number;
  confidence: number;
  match_type: string;
}

// Detect if string looks like coordinates
function detectCoordinates(value: string): { lat: number; lng: number } | null {
  // Decimal degrees: "40.7128, -74.0060" or "40.7128 -74.0060"
  const ddMatch = value.match(
    /^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/,
  );
  if (ddMatch) {
    const lat = parseFloat(ddMatch[1]);
    const lng = parseFloat(ddMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // DMS: 40°42'46"N 74°0'22"W
  const dmsMatch = value.match(
    /(\d+)\s*[°]\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NS])\s*,?\s*(\d+)\s*[°]\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([EW])/i,
  );
  if (dmsMatch) {
    let lat =
      parseInt(dmsMatch[1]) +
      parseInt(dmsMatch[2]) / 60 +
      parseFloat(dmsMatch[3]) / 3600;
    let lng =
      parseInt(dmsMatch[5]) +
      parseInt(dmsMatch[6]) / 60 +
      parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
    if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
    return { lat, lng };
  }

  return null;
}

// Resolve a location string to coordinates
function resolveLocation(
  locationParts: string[],
  _format: string,
): GeoMatch | null {
  const combined = locationParts.join(" ").trim();
  if (!combined) return null;

  // Check if it's coordinates
  const coords = detectCoordinates(combined);
  if (coords) {
    return { lat: coords.lat, lng: coords.lng, confidence: 1.0, match_type: "coordinates" };
  }

  const normalized = normalizeLocation(combined);

  // Exact city match
  for (const city of CITIES_GAZETTEER) {
    if (normalizeLocation(city.name) === normalized) {
      return { lat: city.lat, lng: city.lng, confidence: 1.0, match_type: "exact_city" };
    }
    for (const alt of city.alt) {
      if (normalizeLocation(alt) === normalized) {
        return { lat: city.lat, lng: city.lng, confidence: 1.0, match_type: "exact_city_alt" };
      }
    }
  }

  // City + country match (e.g. "London, UK")
  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    const possibleCity = parts.slice(0, -1).join(" ");
    const possibleCountry = parts[parts.length - 1];
    for (const city of CITIES_GAZETTEER) {
      const cityNorm = normalizeLocation(city.name);
      const countryNorm = normalizeLocation(city.country);
      if (cityNorm === possibleCity && (countryNorm === possibleCountry || city.country.toLowerCase() === possibleCountry)) {
        return { lat: city.lat, lng: city.lng, confidence: 0.8, match_type: "city_country" };
      }
      // Check with country centroids for country part
      for (const country of COUNTRY_CENTROIDS) {
        if (
          cityNorm === possibleCity &&
          (normalizeLocation(country.code) === possibleCountry ||
            normalizeLocation(country.name) === possibleCountry ||
            country.alt.some((a) => normalizeLocation(a) === possibleCountry))
        ) {
          if (city.country === country.code) {
            return { lat: city.lat, lng: city.lng, confidence: 0.8, match_type: "city_country" };
          }
        }
      }
    }
  }

  // Fuzzy city match (Levenshtein distance <= 3)
  let bestFuzzy: { city: typeof CITIES_GAZETTEER[0]; dist: number } | null = null;
  for (const city of CITIES_GAZETTEER) {
    const dist = levenshtein(normalized, normalizeLocation(city.name));
    if (dist <= 3 && dist > 0) {
      if (!bestFuzzy || dist < bestFuzzy.dist || (dist === bestFuzzy.dist && city.pop > bestFuzzy.city.pop)) {
        bestFuzzy = { city, dist };
      }
    }
    for (const alt of city.alt) {
      const altDist = levenshtein(normalized, normalizeLocation(alt));
      if (altDist <= 3 && altDist > 0) {
        if (!bestFuzzy || altDist < bestFuzzy.dist || (altDist === bestFuzzy.dist && city.pop > bestFuzzy.city.pop)) {
          bestFuzzy = { city, dist: altDist };
        }
      }
    }
  }
  if (bestFuzzy) {
    return {
      lat: bestFuzzy.city.lat,
      lng: bestFuzzy.city.lng,
      confidence: 0.6,
      match_type: "fuzzy_city",
    };
  }

  // Exact country match
  for (const country of COUNTRY_CENTROIDS) {
    if (
      normalizeLocation(country.name) === normalized ||
      normalizeLocation(country.code) === normalized ||
      country.alt.some((a) => normalizeLocation(a) === normalized)
    ) {
      return { lat: country.lat, lng: country.lng, confidence: 0.4, match_type: "country" };
    }
  }

  // Fuzzy country match
  let bestCountryFuzzy: { country: typeof COUNTRY_CENTROIDS[0]; dist: number } | null = null;
  for (const country of COUNTRY_CENTROIDS) {
    const dist = levenshtein(normalized, normalizeLocation(country.name));
    if (dist <= 3 && dist > 0) {
      if (!bestCountryFuzzy || dist < bestCountryFuzzy.dist) {
        bestCountryFuzzy = { country, dist };
      }
    }
  }
  if (bestCountryFuzzy) {
    return {
      lat: bestCountryFuzzy.country.lat,
      lng: bestCountryFuzzy.country.lng,
      confidence: 0.3,
      match_type: "fuzzy_country",
    };
  }

  return null;
}

export function flowGeoEnhance(input: GeoEnhanceInput): GeoEnhanceResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV must have header + at least 1 data row");
  }

  const headers = parseCSVLine(lines[0]);
  const format = input.location_format ?? "auto";
  const combineColumns = input.combine_columns ?? (input.location_columns.length > 1);

  // Find column indices
  const colIndices = input.location_columns.map((col) => {
    const idx = headers.findIndex(
      (h) => h.toLowerCase() === col.toLowerCase(),
    );
    if (idx < 0) throw new Error(`Column "${col}" not found in CSV headers: ${headers.join(", ")}`);
    return idx;
  });

  // Append new columns
  const newHeaders = [...headers, "_latitude", "_longitude", "_geo_confidence"];
  const outputRows: string[] = [newHeaders.map((h) => csvEscapeField(h)).join(",")];

  let resolved = 0;
  let unresolved = 0;
  const unresolvedLocations: string[] = [];
  const confidenceBreakdown: Record<string, number> = {};

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length === 0 || (fields.length === 1 && fields[0] === "")) continue;

    // Extract location parts
    const locationParts = colIndices.map((idx) => fields[idx] || "");

    let match: GeoMatch | null;
    if (combineColumns) {
      match = resolveLocation(locationParts, format);
    } else {
      // Try each column independently until match
      match = null;
      for (const part of locationParts) {
        match = resolveLocation([part], format);
        if (match) break;
      }
    }

    if (!match && input.fallback_coordinates) {
      match = {
        lat: input.fallback_coordinates.lat,
        lng: input.fallback_coordinates.lng,
        confidence: 0.0,
        match_type: "fallback",
      };
    }

    const lat = match ? match.lat.toFixed(6) : "";
    const lng = match ? match.lng.toFixed(6) : "";
    const conf = match ? match.confidence.toFixed(2) : "0.00";

    if (match && match.match_type !== "fallback") {
      resolved++;
      const key = match.match_type;
      confidenceBreakdown[key] = (confidenceBreakdown[key] || 0) + 1;
    } else {
      unresolved++;
      const locStr = locationParts.join(", ").trim();
      if (locStr && !unresolvedLocations.includes(locStr)) {
        unresolvedLocations.push(locStr);
      }
    }

    // Build output row
    const outputFields = [...fields];
    // Pad if necessary
    while (outputFields.length < headers.length) outputFields.push("");
    outputFields.push(lat, lng, conf);
    outputRows.push(outputFields.map((f) => csvEscapeField(f)).join(","));
  }

  const total = resolved + unresolved;
  return {
    csv: outputRows.join("\n"),
    stats: {
      total_rows: total,
      resolved,
      unresolved,
      resolution_rate: total > 0 ? Math.round((resolved / total) * 100) / 100 : 0,
      confidence_breakdown: confidenceBreakdown,
    },
    unresolved_locations: unresolvedLocations,
  };
}

// ============================================================================
// TOOL 25: flow_export_formats — PRESENTATION-READY OUTPUTS
// ============================================================================

export interface ExportFormatsInput {
  csv_content: string;
  format: "html_viewer" | "json" | "geojson" | "summary";
  title?: string;
  visualization_type?: string;
  options?: {
    color_column?: string;
    size_column?: string;
    lat_column?: string;
    lng_column?: string;
    x_column?: string;
    y_column?: string;
    z_column?: string;
  };
}

export interface ExportFormatsResult {
  format: string;
  output: string;
  metadata: {
    rows: number;
    columns: string[];
    title: string;
    format_description: string;
  };
}

export function flowExportFormats(input: ExportFormatsInput): ExportFormatsResult {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV must have header + at least 1 data row");
  }

  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const parsed = parseCSVLine(lines[i]);
    if (parsed.length > 0 && !(parsed.length === 1 && parsed[0] === "")) {
      rows.push(parsed);
    }
  }

  const title = input.title || "Flow Visualization Export";

  switch (input.format) {
    case "json":
      return exportJson(headers, rows, title);
    case "geojson":
      return exportGeoJson(headers, rows, title, input.options);
    case "summary":
      return exportSummary(headers, rows, title);
    case "html_viewer":
      return exportHtmlViewer(headers, rows, title, input.options);
    default:
      throw new Error(`Unsupported format: ${input.format}. Supported: json, geojson, summary, html_viewer`);
  }
}

function exportJson(
  headers: string[],
  rows: string[][],
  title: string,
): ExportFormatsResult {
  const objects = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      const val = row[i] ?? "";
      const num = Number(val);
      obj[headers[i]] = val !== "" && !isNaN(num) && isFinite(num) ? num : val;
    }
    return obj;
  });

  return {
    format: "json",
    output: JSON.stringify(objects, null, 2),
    metadata: {
      rows: rows.length,
      columns: headers,
      title,
      format_description: "JSON array of objects, one per row. Numeric values auto-converted.",
    },
  };
}

function exportGeoJson(
  headers: string[],
  rows: string[][],
  title: string,
  options?: ExportFormatsInput["options"],
): ExportFormatsResult {
  const lower = headers.map((h) => h.toLowerCase());

  // Find lat/lng columns
  const latCol =
    options?.lat_column ||
    headers[lower.findIndex((h) => h.includes("lat"))] ||
    null;
  const lngCol =
    options?.lng_column ||
    headers[
      lower.findIndex((h) => h.includes("lon") || h.includes("lng"))
    ] ||
    null;

  if (!latCol || !lngCol) {
    throw new Error(
      `GeoJSON requires latitude and longitude columns. Found headers: ${headers.join(", ")}. ` +
        `Provide lat_column and lng_column in options.`,
    );
  }

  const latIdx = headers.indexOf(latCol);
  const lngIdx = headers.indexOf(lngCol);

  const features = rows
    .map((row) => {
      const lat = parseFloat(row[latIdx] ?? "");
      const lng = parseFloat(row[lngIdx] ?? "");
      if (isNaN(lat) || isNaN(lng)) return null;

      const properties: Record<string, string | number> = {};
      for (let i = 0; i < headers.length; i++) {
        if (i === latIdx || i === lngIdx) continue;
        const val = row[i] ?? "";
        const num = Number(val);
        properties[headers[i]] =
          val !== "" && !isNaN(num) && isFinite(num) ? num : val;
      }

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [lng, lat],
        },
        properties,
      };
    })
    .filter(Boolean);

  const geojson = {
    type: "FeatureCollection" as const,
    features,
  };

  return {
    format: "geojson",
    output: JSON.stringify(geojson, null, 2),
    metadata: {
      rows: features.length,
      columns: headers,
      title,
      format_description: `GeoJSON FeatureCollection with ${features.length} point features. Lat: ${latCol}, Lng: ${lngCol}.`,
    },
  };
}

function exportSummary(
  headers: string[],
  rows: string[][],
  title: string,
): ExportFormatsResult {
  const colStats: string[] = [];

  for (let c = 0; c < headers.length; c++) {
    const values = rows.map((r) => r[c] ?? "").filter(Boolean);
    const numValues = values.map(Number).filter((n) => !isNaN(n) && isFinite(n));

    if (numValues.length > values.length * 0.5 && numValues.length > 0) {
      // Numeric column
      const sorted = numValues.sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mean = sum / sorted.length;
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
      const variance =
        sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
      const stddev = Math.sqrt(variance);

      colStats.push(
        `### ${headers[c]} (numeric)\n` +
          `- Count: ${numValues.length}\n` +
          `- Min: ${min.toFixed(2)}\n` +
          `- Max: ${max.toFixed(2)}\n` +
          `- Mean: ${mean.toFixed(2)}\n` +
          `- Median: ${median.toFixed(2)}\n` +
          `- Std Dev: ${stddev.toFixed(2)}`,
      );
    } else {
      // Categorical column
      const unique = new Set(values);
      const freq: Record<string, number> = {};
      for (const v of values) freq[v] = (freq[v] || 0) + 1;
      const topEntries = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      colStats.push(
        `### ${headers[c]} (categorical)\n` +
          `- Unique values: ${unique.size}\n` +
          `- Non-empty: ${values.length}\n` +
          `- Top values: ${topEntries.map(([k, v]) => `${k} (${v})`).join(", ")}`,
      );
    }
  }

  const summary =
    `# ${title}\n\n` +
    `## Overview\n` +
    `- **Rows**: ${rows.length}\n` +
    `- **Columns**: ${headers.length} (${headers.join(", ")})\n\n` +
    `## Column Statistics\n\n` +
    colStats.join("\n\n");

  return {
    format: "summary",
    output: summary,
    metadata: {
      rows: rows.length,
      columns: headers,
      title,
      format_description: "Statistical summary in markdown format with per-column analysis.",
    },
  };
}

function exportHtmlViewer(
  headers: string[],
  rows: string[][],
  title: string,
  options?: ExportFormatsInput["options"],
): ExportFormatsResult {
  const lower = headers.map((h) => h.toLowerCase());

  // Determine x, y, z columns
  const xCol =
    options?.x_column ||
    headers[lower.findIndex((h) => h.includes("x_value") || h === "x")] ||
    findFirstNumericColumn(headers, rows, 0);
  const yCol =
    options?.y_column ||
    headers[lower.findIndex((h) => h.includes("y_value") || h === "y")] ||
    findFirstNumericColumn(headers, rows, 1);
  const zCol =
    options?.z_column ||
    headers[lower.findIndex((h) => h.includes("z_value") || h === "z")] ||
    findFirstNumericColumn(headers, rows, 2);

  const colorCol = options?.color_column || headers[lower.findIndex((h) => h.includes("category") || h.includes("group"))] || "";

  // Rebuild CSV as embedded data
  const csvEmbedded = [headers.join(","), ...rows.map((r) => r.join(","))].join("\\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; overflow: hidden; background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  #title { position: absolute; top: 16px; left: 16px; color: #fff; font-size: 18px; z-index: 10; }
  #info { position: absolute; bottom: 16px; left: 16px; color: #888; font-size: 12px; z-index: 10; }
  canvas { display: block; }
</style>
</head>
<body>
<div id="title">${escapeHtml(title)}</div>
<div id="info">Drag to rotate. Scroll to zoom. ${rows.length} data points.</div>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const csvText = "${csvEmbedded}";
const lines = csvText.split("\\n");
const headers = lines[0].split(",");
const data = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const vals = lines[i].split(",");
  const row = {};
  headers.forEach((h, j) => row[h] = vals[j] || "");
  data.push(row);
}

const xCol = "${escapeHtml(xCol)}";
const yCol = "${escapeHtml(yCol)}";
const zCol = "${escapeHtml(zCol)}";
const colorCol = "${escapeHtml(colorCol)}";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Color palette
const palette = [0x4285f4, 0xea4335, 0xfbbc04, 0x34a853, 0xff6d01, 0x46bdc6, 0x7b1fa2, 0xc2185b];
const categories = [...new Set(data.map(d => d[colorCol] || "default"))];
const catColors = {};
categories.forEach((c, i) => catColors[c] = palette[i % palette.length]);

// Parse and normalize values
const xVals = data.map(d => parseFloat(d[xCol]) || 0);
const yVals = data.map(d => parseFloat(d[yCol]) || 0);
const zVals = data.map(d => parseFloat(d[zCol]) || 0);

function normalize(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  return arr.map(v => ((v - min) / range - 0.5) * 50);
}
const nx = normalize(xVals);
const ny = normalize(yVals);
const nz = normalize(zVals);

// Create instanced mesh
const geo = new THREE.SphereGeometry(0.3, 8, 6);
const mat = new THREE.MeshPhongMaterial();
const mesh = new THREE.InstancedMesh(geo, mat, data.length);

const dummy = new THREE.Object3D();
const color = new THREE.Color();
for (let i = 0; i < data.length; i++) {
  dummy.position.set(nx[i], ny[i], nz[i]);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  const cat = data[i][colorCol] || "default";
  color.setHex(catColors[cat]);
  mesh.setColorAt(i, color);
}
scene.add(mesh);

// Lights
scene.add(new THREE.AmbientLight(0x404040, 2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(50, 50, 50);
scene.add(dirLight);

camera.position.set(40, 30, 40);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>`;

  return {
    format: "html_viewer",
    output: html,
    metadata: {
      rows: rows.length,
      columns: headers,
      title,
      format_description: `Self-contained HTML with Three.js 3D scatter plot. X: ${xCol}, Y: ${yCol}, Z: ${zCol}. Color: ${colorCol || "none"}.`,
    },
  };
}

function findFirstNumericColumn(
  headers: string[],
  rows: string[][],
  skipCount: number,
): string {
  let skipped = 0;
  for (let c = 0; c < headers.length; c++) {
    const sample = rows.slice(0, Math.min(5, rows.length));
    const numCount = sample.filter((r) => {
      const v = r[c] ?? "";
      const n = Number(v);
      return v !== "" && !isNaN(n) && isFinite(n);
    }).length;
    if (numCount > sample.length * 0.5) {
      if (skipped >= skipCount) return headers[c];
      skipped++;
    }
  }
  return headers[Math.min(skipCount, headers.length - 1)];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
