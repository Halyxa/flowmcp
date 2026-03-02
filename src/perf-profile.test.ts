/**
 * Performance Profiling: Tool Response Times Under Load
 *
 * Measures response time for each local tool at small, medium, and large inputs.
 * Runs each scenario N times to capture p50/p95/max latencies.
 * Detects hot spots and scaling regressions across the tool surface.
 *
 * Excludes API-dependent tools (flow_authenticate, flow_upload_data,
 * flow_browse_flows, flow_get_flow, flow_list_templates, flow_list_categories)
 * since they require live credentials.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeDataForFlow,
  validateCsvForFlow,
  transformToNetworkGraph,
  generateFlowPythonCode,
  suggestFlowVisualization,
  getFlowTemplate,
  extractFromText,
  precomputeForceLayout,
  scaleDataset,
  computeGraphMetrics,
} from "./index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a CSV string with N rows and C columns */
function generateCSV(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `col_${i}`);
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    lines.push(headers.map((_, c) => `val_${r}_${c}`).join(","));
  }
  return lines.join("\n");
}

/** Generate an edge-list CSV for network transforms */
function generateEdgeCSV(edges: number): string {
  const lines = ["source,target,weight"];
  for (let i = 0; i < edges; i++) {
    const s = `node_${i % Math.max(1, Math.floor(edges / 3))}`;
    const t = `node_${(i + 1 + Math.floor(Math.random() * edges / 4)) % Math.max(1, Math.floor(edges / 2))}`;
    lines.push(`${s},${t},${(Math.random() * 10).toFixed(1)}`);
  }
  return lines.join("\n");
}

/** Generate nodes and edges for graph metrics */
function generateGraph(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    group: `g${i % 5}`,
  }));
  const edges: { source: string; target: string; weight?: number }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (i < nodeCount - 1) edges.push({ source: `n${i}`, target: `n${i + 1}` });
    const t = (i + 1 + Math.floor(Math.random() * Math.max(1, nodeCount / 4))) % nodeCount;
    if (t !== i) edges.push({ source: `n${i}`, target: `n${t}`, weight: Math.random() * 5 });
  }
  return { nodes, edges };
}

/** Generate sample text for extraction at various lengths */
function generateText(sentenceCount: number): string {
  const people = ["Alice Johnson", "Bob Smith", "Carol White", "David Chen", "Eve Martinez"];
  const orgs = ["Acme Corp", "Global Tech", "Northern Labs", "Pacific Systems"];
  const sentences: string[] = [];
  for (let i = 0; i < sentenceCount; i++) {
    const person = people[i % people.length];
    const org = orgs[i % orgs.length];
    sentences.push(
      `${person} from ${org} discussed the Q${(i % 4) + 1} results with team@${org.toLowerCase().replace(/ /g, "")}.com and shared https://example.com/report/${i}. #strategy @${person.split(" ")[0].toLowerCase()}`
    );
  }
  return sentences.join("\n\n");
}

/** Run a function N times and return timing stats */
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

// ── Test suites ──────────────────────────────────────────────────────────────

interface ProfileResult {
  tool: string;
  size: string;
  p50: number;
  p95: number;
  max: number;
}

const allResults: ProfileResult[] = [];
const RUNS = 10; // iterations per scenario

describe("Performance Profiling — Tool Response Times", () => {
  // ── analyzeDataForFlow ──
  describe("analyzeDataForFlow", () => {
    const sizes = [
      { label: "5 cols", cols: ["x", "y", "z", "val", "cat"] },
      { label: "20 cols", cols: Array.from({ length: 20 }, (_, i) => `col_${i}`) },
      { label: "50 cols", cols: Array.from({ length: 50 }, (_, i) => `col_${i}`) },
    ];
    for (const { label, cols } of sizes) {
      it(`${label} — responds within 50ms p95`, () => {
        const stats = profile(
          () => analyzeDataForFlow({ data_description: "Network of transactions between companies with geographic coordinates and time series", column_names: cols, row_count: 10000, use_case: "fraud detection" }),
          RUNS,
        );
        allResults.push({ tool: "analyzeDataForFlow", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(50);
      });
    }
  });

  // ── validateCsvForFlow ──
  describe("validateCsvForFlow", () => {
    const sizes = [
      { label: "100 rows", csv: generateCSV(100, 5) },
      { label: "1000 rows", csv: generateCSV(1000, 10) },
      { label: "5000 rows", csv: generateCSV(5000, 10) },
    ];
    for (const { label, csv } of sizes) {
      it(`${label} — responds within 500ms p95`, () => {
        const stats = profile(() => validateCsvForFlow({ csv_content: csv }), RUNS);
        allResults.push({ tool: "validateCsvForFlow", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(500);
      });
    }
  });

  // ── transformToNetworkGraph ──
  describe("transformToNetworkGraph", () => {
    const sizes = [
      { label: "50 edges", csv: generateEdgeCSV(50) },
      { label: "500 edges", csv: generateEdgeCSV(500) },
      { label: "2000 edges", csv: generateEdgeCSV(2000) },
    ];
    for (const { label, csv } of sizes) {
      it(`${label} — responds within 500ms p95`, () => {
        const stats = profile(
          () => transformToNetworkGraph({ source_column: "source", target_column: "target", sample_data: csv }),
          RUNS,
        );
        allResults.push({ tool: "transformToNetworkGraph", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(500);
      });
    }
  });

  // ── generateFlowPythonCode ──
  describe("generateFlowPythonCode", () => {
    it("dataframe — responds within 10ms p95", () => {
      const stats = profile(
        () => generateFlowPythonCode({ data_type: "dataframe", dataset_title: "Sales Data", columns: ["date", "amount", "region"] }),
        RUNS,
      );
      allResults.push({ tool: "generateFlowPythonCode", size: "dataframe", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(10);
    });
    it("network — responds within 10ms p95", () => {
      const stats = profile(
        () => generateFlowPythonCode({ data_type: "network", dataset_title: "Social Graph", columns: ["id", "name", "connections"] }),
        RUNS,
      );
      allResults.push({ tool: "generateFlowPythonCode", size: "network", p50: stats.p50, p95: stats.p95, max: stats.max });
      expect(stats.p95).toBeLessThan(10);
    });
  });

  // ── suggestFlowVisualization ──
  describe("suggestFlowVisualization", () => {
    const sizes = [
      { label: "5 cols", cols: 5 },
      { label: "15 cols", cols: 15 },
      { label: "30 cols", cols: 30 },
    ];
    for (const { label, cols } of sizes) {
      it(`${label} — responds within 50ms p95`, () => {
        const columns = Array.from({ length: cols }, (_, i) => ({
          name: `col_${i}`,
          type: (["numeric", "categorical", "date", "geographic", "id", "text"] as const)[i % 6],
          cardinality: 10 + i,
        }));
        const stats = profile(
          () => suggestFlowVisualization({ columns, row_count: 10000, relationships: "hierarchical tree with geographic nodes" }),
          RUNS,
        );
        allResults.push({ tool: "suggestFlowVisualization", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(50);
      });
    }
  });

  // ── getFlowTemplate ──
  describe("getFlowTemplate", () => {
    const templates = ["network_graph", "geographic_map", "3d_scatter"];
    for (const name of templates) {
      it(`${name} — responds within 5ms p95`, () => {
        const stats = profile(() => getFlowTemplate({ template_name: name }), RUNS);
        allResults.push({ tool: "getFlowTemplate", size: name, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(5);
      });
    }
  });

  // ── extractFromText ──
  describe("extractFromText", () => {
    const sizes = [
      { label: "10 sentences", text: generateText(10) },
      { label: "50 sentences", text: generateText(50) },
      { label: "200 sentences", text: generateText(200) },
    ];
    for (const { label, text } of sizes) {
      it(`${label} — responds within 200ms p95`, () => {
        const stats = profile(() => extractFromText({ text }), RUNS);
        allResults.push({ tool: "extractFromText", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(200);
      });
    }
  });

  // ── scaleDataset ──
  describe("scaleDataset", () => {
    const sizes = [
      { label: "1000→500 rows", csv: generateCSV(1000, 5), target: 500 },
      { label: "5000→1000 rows", csv: generateCSV(5000, 8), target: 1000 },
      { label: "10000→2000 rows", csv: generateCSV(10000, 6), target: 2000 },
    ];
    for (const { label, csv, target } of sizes) {
      it(`${label} — responds within 2000ms p95`, () => {
        const stats = profile(() => scaleDataset({ csv_content: csv, target_rows: target }), RUNS);
        allResults.push({ tool: "scaleDataset", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(2000);
      });
    }
  });

  // ── computeGraphMetrics ──
  describe("computeGraphMetrics", () => {
    const sizes = [
      { label: "50 nodes", ...generateGraph(50) },
      { label: "200 nodes", ...generateGraph(200) },
      { label: "1000 nodes", ...generateGraph(1000) },
    ];
    for (const { label, nodes, edges } of sizes) {
      it(`${label} — responds within 2000ms p95`, () => {
        const stats = profile(() => computeGraphMetrics({ nodes, edges }), RUNS);
        allResults.push({ tool: "computeGraphMetrics", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(2000);
      });
    }
  });

  // ── precomputeForceLayout (small sizes only — large is in benchmark.test.ts) ──
  describe("precomputeForceLayout", () => {
    const sizes = [
      { label: "20 nodes", ...generateGraph(20), iter: 100 },
      { label: "100 nodes", ...generateGraph(100), iter: 100 },
      { label: "500 nodes", ...generateGraph(500), iter: 100 },
    ];
    for (const { label, nodes, edges, iter } of sizes) {
      it(`${label} — responds within 5000ms p95`, () => {
        const stats = profile(() => precomputeForceLayout({ nodes, edges, iterations: iter }), RUNS);
        allResults.push({ tool: "precomputeForceLayout", size: label, p50: stats.p50, p95: stats.p95, max: stats.max });
        expect(stats.p95).toBeLessThan(5000);
      });
    }
  });

  // ── Summary ──
  it("summary — prints performance profile table", () => {
    console.log("\n=== Tool Performance Profile (10 tools, p50/p95/max in ms) ===");
    console.log("Tool                         | Size              | p50     | p95     | max    ");
    console.log("-----------------------------|-------------------|---------|---------|--------");

    let hotSpots = 0;
    for (const r of allResults) {
      const flag = r.p95 > 100 ? " ⚠" : "";
      if (r.p95 > 100) hotSpots++;
      console.log(
        `${r.tool.padEnd(29)}| ${r.size.padEnd(18)}| ${r.p50.toFixed(1).padStart(7)} | ${r.p95.toFixed(1).padStart(7)} | ${r.max.toFixed(1).padStart(6)}${flag}`
      );
    }
    console.log("=============================================================");
    console.log(`Total scenarios: ${allResults.length} | Hot spots (p95 > 100ms): ${hotSpots}`);
    console.log("=============================================================\n");

    expect(allResults.length).toBeGreaterThanOrEqual(20);
  });
});
