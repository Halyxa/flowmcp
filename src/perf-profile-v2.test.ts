/**
 * Performance Profiling v2: Tools 19-25 Response Times Under Load
 *
 * Measures response time for the 7 new tools (flow_semantic_search,
 * flow_time_series_animate, flow_merge_datasets, flow_anomaly_detect,
 * flow_nlp_to_viz, flow_geo_enhance, flow_export_formats) at small,
 * medium, large, and BEYOND inputs.
 *
 * Runs each scenario N times to capture p50/p95/max latencies.
 * Detects hot spots and scaling regressions across the tool surface.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  flowAnomalyDetect,
  flowTimeSeriesAnimate,
  flowMergeDatasets,
} from "./tools-v2.js";
import {
  flowNlpToViz,
  flowGeoEnhance,
  flowExportFormats,
} from "./tools-v3.js";
import {
  scoreMatch,
  _injectCatalogForTesting,
  _clearCatalogCache,
  FlowEntry,
  flowSemanticSearch,
} from "./tools-search.js";

// ── CSV Data Generators ────────────────────────────────────────────────────

/** Generate a time series CSV with N rows and C value columns */
function generateTimeSeries(rows: number, cols: number = 3): string {
  const header = ["date", ...Array.from({ length: cols }, (_, i) => `value_${i + 1}`)].join(",");
  const lines = [header];
  const baseDate = new Date("2020-01-01");
  for (let i = 0; i < rows; i++) {
    const date = new Date(baseDate.getTime() + i * 86400000);
    const values = Array.from({ length: cols }, () => (Math.random() * 1000).toFixed(2));
    lines.push([date.toISOString().split("T")[0], ...values].join(","));
  }
  return lines.join("\n");
}

/** Generate a numeric CSV with N rows and C columns (for anomaly detection) */
function generateNumericCSV(rows: number, cols: number): string {
  const headers = ["id", ...Array.from({ length: cols }, (_, i) => `metric_${i + 1}`)];
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    const values = Array.from({ length: cols }, () => {
      // Mostly normal distribution, with ~2% outliers
      const base = Math.random() * 100 + 50;
      return (Math.random() < 0.02 ? base * 10 : base).toFixed(2);
    });
    lines.push([`row_${r}`, ...values].join(","));
  }
  return lines.join("\n");
}

/** Generate geo data CSV with city names */
function generateGeoData(rows: number): string {
  const cities = [
    "New York", "London", "Tokyo", "Paris", "Sydney",
    "Berlin", "São Paulo", "Mumbai", "Cairo", "Toronto",
    "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia",
    "San Francisco", "Seattle", "Denver", "Boston", "Atlanta",
  ];
  const header = "city,country,population";
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    lines.push(`${cities[i % cities.length]},Country_${i % 20},${Math.floor(Math.random() * 10000000)}`);
  }
  return lines.join("\n");
}

/** Generate geo data with coordinate columns */
function generateGeoDataWithCoords(rows: number): string {
  const cities = [
    "New York", "London", "Tokyo", "Paris", "Sydney",
    "Berlin", "Mumbai", "Cairo", "Toronto", "Seattle",
  ];
  const header = "city,latitude,longitude,population";
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const lat = (Math.random() * 180 - 90).toFixed(4);
    const lng = (Math.random() * 360 - 180).toFixed(4);
    lines.push(`${cities[i % cities.length]},${lat},${lng},${Math.floor(Math.random() * 10000000)}`);
  }
  return lines.join("\n");
}

/** Generate a generic CSV with N rows and C columns for export tests */
function generateCSV(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `col_${i}`);
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    lines.push(headers.map((_, c) => (Math.random() * 1000).toFixed(2)).join(","));
  }
  return lines.join("\n");
}

/** Generate a CSV with lat/lng columns for GeoJSON export */
function generateGeoCSV(rows: number): string {
  const header = "name,latitude,longitude,value";
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const lat = (Math.random() * 180 - 90).toFixed(4);
    const lng = (Math.random() * 360 - 180).toFixed(4);
    lines.push(`point_${i},${lat},${lng},${(Math.random() * 100).toFixed(1)}`);
  }
  return lines.join("\n");
}

/** Generate a mock catalog of FlowEntry objects */
function generateMockCatalog(size: number): FlowEntry[] {
  const categories = ["Business", "Science", "Technology", "Health", "Finance", "Geography", "Education", "Art"];
  const templates = ["network", "scatter", "map", "timeline", "chart"];
  const words = [
    "Network", "Analysis", "Data", "Visualization", "Graph", "Map",
    "Chart", "Timeline", "Distribution", "Cluster", "Flow", "Trend",
    "Supply Chain", "Portfolio", "Research", "Climate", "Population",
    "Trade", "Social", "Neural", "Genome", "Market", "Energy",
  ];
  const catalog: FlowEntry[] = [];
  for (let i = 0; i < size; i++) {
    const w1 = words[i % words.length];
    const w2 = words[(i * 7 + 3) % words.length];
    catalog.push({
      selector: `sel_${i}`,
      title: `${w1} ${w2} ${i}`,
      description: `A ${w2.toLowerCase()} ${w1.toLowerCase()} showing data across multiple dimensions for exploration and insight ${i}`,
      categories: [categories[i % categories.length], categories[(i + 3) % categories.length]],
      view_count: Math.floor(Math.random() * 10000),
      creator: `user_${i % 100}`,
      template_type: templates[i % templates.length],
    });
  }
  return catalog;
}

// ── Profiling Helpers ──────────────────────────────────────────────────────

/** Run a sync function N times and return timing stats */
function profile<T>(fn: () => T, runs: number): { p50: number; p95: number; max: number; min: number; avg: number } {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    min: times[0],
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
    avg: times.reduce((s, t) => s + t, 0) / times.length,
  };
}

/** Run an async function N times and return timing stats */
async function profileAsync<T>(fn: () => Promise<T>, runs: number): Promise<{ p50: number; p95: number; max: number; min: number; avg: number }> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    min: times[0],
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
    avg: times.reduce((s, t) => s + t, 0) / times.length,
  };
}

// ── Test suites ────────────────────────────────────────────────────────────

interface ProfileResult {
  tool: string;
  size: string;
  p50: number;
  p95: number;
  max: number;
}

const allResults: ProfileResult[] = [];
const RUNS = 5; // iterations per scenario

describe("Performance Profiling v2 — Tools 19-25 Response Times", () => {

  // ── flow_time_series_animate (Tool 20) ──
  describe("flow_time_series_animate", () => {
    it("100 rows, 10 frames — responds within 50ms p95", () => {
      const csv = generateTimeSeries(100, 3);
      const stats = profile(
        () => flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", frame_count: 10 }),
        RUNS,
      );
      allResults.push({ tool: "flowTimeSeriesAnimate", size: "100r/10f", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(50);
    });

    it("1000 rows, 50 frames — responds within 200ms p95", () => {
      const csv = generateTimeSeries(1000, 5);
      const stats = profile(
        () => flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", frame_count: 50 }),
        RUNS,
      );
      allResults.push({ tool: "flowTimeSeriesAnimate", size: "1000r/50f", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(200);
    });

    it("5000 rows, 100 frames — responds within 1000ms p95", () => {
      const csv = generateTimeSeries(5000, 5);
      const stats = profile(
        () => flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", frame_count: 100 }),
        RUNS,
      );
      allResults.push({ tool: "flowTimeSeriesAnimate", size: "5000r/100f", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(1000);
    });

    it("10000 rows, 200 frames — BEYOND limits (record only)", () => {
      const csv = generateTimeSeries(10000, 5);
      const stats = profile(
        () => flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", frame_count: 200 }),
        RUNS,
      );
      allResults.push({ tool: "flowTimeSeriesAnimate", size: "10000r/200f BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_merge_datasets (Tool 21) ──
  describe("flow_merge_datasets", () => {
    it("2×100 rows inner join — responds within 100ms p95", () => {
      const csv1 = generateCSV(100, 4);
      // Make a second CSV with a shared first column for joining
      const lines1 = csv1.split("\n");
      const header2 = "col_0,extra_1,extra_2";
      const rows2 = lines1.slice(1).map((line, i) => {
        const firstVal = line.split(",")[0];
        return `${firstVal},${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`;
      });
      const csv2 = [header2, ...rows2].join("\n");

      const stats = profile(
        () => flowMergeDatasets({
          datasets: [{ csv_content: csv1 }, { csv_content: csv2 }],
          join_type: "inner",
          join_columns: ["col_0"],
        }),
        RUNS,
      );
      allResults.push({ tool: "flowMergeDatasets", size: "2×100 inner", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(100);
    });

    it("2×1000 rows outer join — responds within 500ms p95", () => {
      const csv1 = generateCSV(1000, 4);
      const lines1 = csv1.split("\n");
      const header2 = "col_0,extra_a,extra_b";
      const rows2 = lines1.slice(1, 801).map((line) => {
        const firstVal = line.split(",")[0];
        return `${firstVal},${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`;
      });
      const csv2 = [header2, ...rows2].join("\n");

      const stats = profile(
        () => flowMergeDatasets({
          datasets: [{ csv_content: csv1 }, { csv_content: csv2 }],
          join_type: "outer",
          join_columns: ["col_0"],
        }),
        RUNS,
      );
      allResults.push({ tool: "flowMergeDatasets", size: "2×1000 outer", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(500);
    });

    it("3×5000 rows concatenate — responds within 2000ms p95", () => {
      const csv1 = generateCSV(5000, 5);
      const csv2 = generateCSV(5000, 5);
      const csv3 = generateCSV(5000, 5);

      const stats = profile(
        () => flowMergeDatasets({
          datasets: [{ csv_content: csv1 }, { csv_content: csv2 }, { csv_content: csv3 }],
          join_type: "concatenate",
        }),
        RUNS,
      );
      allResults.push({ tool: "flowMergeDatasets", size: "3×5000 concat", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(2000);
    });

    it("2×10000 rows left join — BEYOND limits (record only)", () => {
      const csv1 = generateCSV(10000, 4);
      const lines1 = csv1.split("\n");
      const header2 = "col_0,extra_x,extra_y";
      const rows2 = lines1.slice(1, 5001).map((line) => {
        const firstVal = line.split(",")[0];
        return `${firstVal},${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`;
      });
      const csv2 = [header2, ...rows2].join("\n");

      const stats = profile(
        () => flowMergeDatasets({
          datasets: [{ csv_content: csv1 }, { csv_content: csv2 }],
          join_type: "left",
          join_columns: ["col_0"],
        }),
        RUNS,
      );
      allResults.push({ tool: "flowMergeDatasets", size: "2×10000 left BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_anomaly_detect (Tool 22) ──
  describe("flow_anomaly_detect", () => {
    it("100 rows, 3 columns, zscore — responds within 50ms p95", () => {
      const csv = generateNumericCSV(100, 3);
      const stats = profile(
        () => flowAnomalyDetect({ csv_content: csv, method: "zscore" }),
        RUNS,
      );
      allResults.push({ tool: "flowAnomalyDetect", size: "100r/3c zscore", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(50);
    });

    it("1000 rows, 10 columns, iqr — responds within 200ms p95", () => {
      const csv = generateNumericCSV(1000, 10);
      const stats = profile(
        () => flowAnomalyDetect({ csv_content: csv, method: "iqr" }),
        RUNS,
      );
      allResults.push({ tool: "flowAnomalyDetect", size: "1000r/10c iqr", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(200);
    });

    it("5000 rows, 20 columns, auto — responds within 1000ms p95", () => {
      const csv = generateNumericCSV(5000, 20);
      const stats = profile(
        () => flowAnomalyDetect({ csv_content: csv, method: "auto" }),
        RUNS,
      );
      allResults.push({ tool: "flowAnomalyDetect", size: "5000r/20c auto", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(1000);
    });

    it("10000 rows, 5 columns, zscore — BEYOND limits (record only)", () => {
      const csv = generateNumericCSV(10000, 5);
      const stats = profile(
        () => flowAnomalyDetect({ csv_content: csv, method: "zscore" }),
        RUNS,
      );
      allResults.push({ tool: "flowAnomalyDetect", size: "10000r/5c BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_geo_enhance (Tool 23) ──
  describe("flow_geo_enhance", () => {
    it("50 rows with city names — responds within 50ms p95", () => {
      const csv = generateGeoData(50);
      const stats = profile(
        () => flowGeoEnhance({ csv_content: csv, location_columns: ["city"] }),
        RUNS,
      );
      allResults.push({ tool: "flowGeoEnhance", size: "50r cities", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(50);
    });

    it("500 rows with city names — responds within 200ms p95", () => {
      const csv = generateGeoData(500);
      const stats = profile(
        () => flowGeoEnhance({ csv_content: csv, location_columns: ["city"], location_format: "city" }),
        RUNS,
      );
      allResults.push({ tool: "flowGeoEnhance", size: "500r mixed", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(200);
    });

    it("2000 rows with fuzzy matching — responds within 1000ms p95", () => {
      const csv = generateGeoData(2000);
      const stats = profile(
        () => flowGeoEnhance({ csv_content: csv, location_columns: ["city"], location_format: "auto" }),
        RUNS,
      );
      allResults.push({ tool: "flowGeoEnhance", size: "2000r fuzzy", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(1000);
    });

    it("5000 rows with coordinates + cities — BEYOND limits (record only)", () => {
      const csv = generateGeoDataWithCoords(5000);
      const stats = profile(
        () => flowGeoEnhance({ csv_content: csv, location_columns: ["city"], location_format: "auto" }),
        RUNS,
      );
      allResults.push({ tool: "flowGeoEnhance", size: "5000r coords BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_nlp_to_viz (Tool 24) ──
  describe("flow_nlp_to_viz", () => {
    it("simple prompt, 50 rows — responds within 50ms p95", () => {
      const stats = profile(
        () => flowNlpToViz({ prompt: "show me a scatter plot of sales data", row_count: 50, complexity: "simple" }),
        RUNS,
      );
      allResults.push({ tool: "flowNlpToViz", size: "50r simple", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(50);
    });

    it("medium prompt, 500 rows — responds within 200ms p95", () => {
      const stats = profile(
        () => flowNlpToViz({
          prompt: "visualize a social network showing connections between employees across departments with influence scores",
          row_count: 500,
          complexity: "medium",
        }),
        RUNS,
      );
      allResults.push({ tool: "flowNlpToViz", size: "500r medium", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(200);
    });

    it("rich prompt, 2000 rows — responds within 500ms p95", () => {
      const stats = profile(
        () => flowNlpToViz({
          prompt: "create a geographic map of global supply chain routes between major cities showing trade volume, risk scores, and delivery times over the past 5 years with seasonal patterns",
          row_count: 2000,
          complexity: "rich",
        }),
        RUNS,
      );
      allResults.push({ tool: "flowNlpToViz", size: "2000r rich", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(500);
    });

    it("complex prompt, 5000 rows — BEYOND limits (record only)", () => {
      const stats = profile(
        () => flowNlpToViz({
          prompt: "build an interactive 3D timeline network showing research paper citations across multiple scientific fields with cluster analysis, geographic distribution of authors, funding amounts, impact scores, and animated temporal evolution of citation patterns over decades",
          row_count: 5000,
          complexity: "rich",
          style: "scientific",
        }),
        RUNS,
      );
      allResults.push({ tool: "flowNlpToViz", size: "5000r complex BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_export_formats (Tool 25) ──
  describe("flow_export_formats", () => {
    it("100 rows → JSON export — responds within 50ms p95", () => {
      const csv = generateCSV(100, 5);
      const stats = profile(
        () => flowExportFormats({ csv_content: csv, format: "json", title: "Perf Test" }),
        RUNS,
      );
      allResults.push({ tool: "flowExportFormats", size: "100r json", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(50);
    });

    it("1000 rows → GeoJSON export — responds within 200ms p95", () => {
      const csv = generateGeoCSV(1000);
      const stats = profile(
        () => flowExportFormats({
          csv_content: csv,
          format: "geojson",
          title: "Geo Perf Test",
          options: { lat_column: "latitude", lng_column: "longitude" },
        }),
        RUNS,
      );
      allResults.push({ tool: "flowExportFormats", size: "1000r geojson", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(200);
    });

    it("5000 rows → HTML viewer — responds within 1000ms p95", () => {
      const csv = generateCSV(5000, 6);
      const stats = profile(
        () => flowExportFormats({ csv_content: csv, format: "html_viewer", title: "HTML Perf Test" }),
        RUNS,
      );
      allResults.push({ tool: "flowExportFormats", size: "5000r html", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(1000);
    });

    it("10000 rows → summary stats — BEYOND limits (record only)", () => {
      const csv = generateCSV(10000, 8);
      const stats = profile(
        () => flowExportFormats({ csv_content: csv, format: "summary", title: "Summary Perf Test" }),
        RUNS,
      );
      allResults.push({ tool: "flowExportFormats", size: "10000r summary BEYOND", p50: stats.p50, p95: stats.p95, max: stats.max });
      // No threshold — recording BEYOND limits behavior
      expect(stats.p95).toBeGreaterThan(0);
    });
  });

  // ── flow_semantic_search (Tool 19) — uses mock catalog ──
  describe("flow_semantic_search", () => {
    const smallCatalog = generateMockCatalog(100);
    const mediumCatalog = generateMockCatalog(1000);
    const largeCatalog = generateMockCatalog(5000);

    afterAll(() => {
      _clearCatalogCache();
    });

    it("simple keyword, 100 entries — responds within 20ms p95", async () => {
      _injectCatalogForTesting(smallCatalog);
      const stats = await profileAsync(
        () => flowSemanticSearch({ query: "network analysis" }),
        RUNS,
      );
      allResults.push({ tool: "flowSemanticSearch", size: "100 entries", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(20);
    });

    it("multi-word query with filters, 1000 entries — responds within 100ms p95", async () => {
      _injectCatalogForTesting(mediumCatalog);
      const stats = await profileAsync(
        () => flowSemanticSearch({ query: "supply chain network visualization", category: "Business", max_results: 50 }),
        RUNS,
      );
      allResults.push({ tool: "flowSemanticSearch", size: "1000 entries+filter", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(100);
    });

    it("fuzzy query with category filter, 5000 entries — responds within 500ms p95", async () => {
      _injectCatalogForTesting(largeCatalog);
      const stats = await profileAsync(
        () => flowSemanticSearch({ query: "climate data geographic trends", category: "Science", sort_by: "relevance" }),
        RUNS,
      );
      allResults.push({ tool: "flowSemanticSearch", size: "5000 entries+filter", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(500);
    });

    it("scoreMatch throughput — 10000 entries scored", () => {
      const hugeCatalog = generateMockCatalog(10000);
      const stats = profile(
        () => {
          for (const flow of hugeCatalog) {
            scoreMatch("network analysis visualization data", flow);
          }
        },
        RUNS,
      );
      allResults.push({ tool: "scoreMatch", size: "10000 entries", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(500);
    });
  });

  // ── Summary ──
  it("summary — prints performance profile table for tools 19-25", () => {
    console.log("\n=== Tool Performance Profile v2 (7 tools, p50/p95/max in ms) ===");
    console.log("Tool                         | Size                     | p50     | p95     | max    ");
    console.log("-----------------------------|--------------------------|---------|---------|--------");

    let hotSpots = 0;
    for (const r of allResults) {
      const flag = r.p95 > 100 ? " !!" : "";
      if (r.p95 > 100) hotSpots++;
      console.log(
        `${r.tool.padEnd(29)}| ${r.size.padEnd(25)}| ${r.p50.toFixed(1).padStart(7)} | ${r.p95.toFixed(1).padStart(7)} | ${r.max.toFixed(1).padStart(6)}${flag}`
      );
    }
    console.log("================================================================");
    console.log(`Total scenarios: ${allResults.length} | Hot spots (p95 > 100ms): ${hotSpots}`);
    console.log("================================================================\n");

    expect(allResults.length).toBeGreaterThanOrEqual(25);
  });
});
