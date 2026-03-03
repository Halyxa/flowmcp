#!/usr/bin/env npx tsx
/**
 * stress-profile.ts — Memory and CPU profiler for all 25 FlowMCP tools
 *
 * Profiles handler functions directly (no MCP protocol overhead):
 * 1. Memory leak detection (50 iterations per tool)
 * 2. CPU hot path timing at increasing input sizes (100, 500, 1000, 5000 rows)
 * 3. Peak RSS per tool at 5000 rows
 * 4. Concurrent execution of top-5 CPU-intensive tools
 * 5. GC pressure analysis (with vs without forced GC)
 *
 * Run: npx tsx scripts/stress-profile.ts
 * (use --expose-gc for GC pressure tests)
 */

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
  flowAnomalyDetect,
  flowTimeSeriesAnimate,
  flowMergeDatasets,
  flowNlpToViz,
  flowGeoEnhance,
  flowExportFormats,
  _injectCatalogForTesting,
} from "../src/index.js";

import { flowSemanticSearch } from "../src/tools-search.js";

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// CSV generators — produce synthetic data at configurable row counts
// ---------------------------------------------------------------------------

function generateCSV(rows: number, cols: number = 5): string {
  const headers = Array.from({ length: cols }, (_, i) => `col_${i}`);
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    const vals = headers.map((_, i) =>
      i === 0 ? `row_${r}` : String(Math.random() * 1000)
    );
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

function generateNetworkCSV(rows: number): string {
  const lines = ["source,target,weight"];
  for (let r = 0; r < rows; r++) {
    const src = `node_${r % Math.max(Math.floor(rows / 3), 2)}`;
    const tgt = `node_${(r + 1) % Math.max(Math.floor(rows / 3), 2)}`;
    lines.push(`${src},${tgt},${(Math.random() * 10).toFixed(2)}`);
  }
  return lines.join("\n");
}

function generateTimeCSV(rows: number): string {
  const headers = ["date,value,category"];
  const lines = [headers.join("")];
  const baseDate = new Date("2020-01-01").getTime();
  for (let r = 0; r < rows; r++) {
    const d = new Date(baseDate + r * 86400000).toISOString().split("T")[0];
    lines.push(`${d},${(Math.random() * 100).toFixed(2)},cat_${r % 5}`);
  }
  return lines.join("\n");
}

function generateGeoCSV(rows: number): string {
  const cities = ["New York", "London", "Tokyo", "Paris", "Berlin", "Sydney", "Toronto", "Mumbai", "Beijing", "Cairo"];
  const lines = ["name,city,value"];
  for (let r = 0; r < rows; r++) {
    lines.push(`item_${r},${cities[r % cities.length]},${(Math.random() * 100).toFixed(2)}`);
  }
  return lines.join("\n");
}

function generateNodes(count: number): Array<{ id: string; label?: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }));
}

function generateEdges(nodeCount: number, edgeMultiplier: number = 2): Array<{ source: string; target: string; weight?: number }> {
  const edges: Array<{ source: string; target: string; weight?: number }> = [];
  const edgeCount = Math.min(nodeCount * edgeMultiplier, 10000);
  for (let i = 0; i < edgeCount; i++) {
    const s = `n${i % nodeCount}`;
    const t = `n${(i * 7 + 3) % nodeCount}`;
    if (s !== t) edges.push({ source: s, target: t, weight: Math.random() });
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Tool definitions — how to call each tool at a given row count
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  category: "sync" | "async_local" | "async_network";
  invoke: (rows: number) => any;
}

// Inject mock catalog for semantic search so it doesn't hit the network
_injectCatalogForTesting(
  Array.from({ length: 200 }, (_, i) => ({
    selector: `sel${i}`,
    title: `Flow ${i}: ${["climate", "network", "finance", "health", "energy"][i % 5]} visualization`,
    description: `A ${["scatter", "network", "map", "chart", "swarm"][i % 5]} visualization of ${["temperature", "connections", "revenue", "patients", "output"][i % 5]} data.`,
    categories: [["science", "business", "health", "tech", "geo"][i % 5]],
    view_count: Math.floor(Math.random() * 10000),
    creator: `user_${i % 20}`,
    template_type: ["scatter", "network", "map", "timeseries", "comparison"][i % 5],
  }))
);

const TOOLS: ToolDef[] = [
  // --- SYNC tools (pure computation) ---
  {
    name: "analyze_data_for_flow",
    category: "sync",
    invoke: (rows) => analyzeDataForFlow({
      data_description: "Financial data with transactions, accounts, and timestamps spanning multiple years",
      column_names: ["id", "amount", "date", "category", "lat", "lon"],
      row_count: rows,
      use_case: "visualize transaction networks and geographic patterns",
    }),
  },
  {
    name: "validate_csv_for_flow",
    category: "sync",
    invoke: (rows) => validateCsvForFlow({ csv_content: generateCSV(rows), visualization_type: "auto" }),
  },
  {
    name: "transform_to_network_graph",
    category: "sync",
    invoke: (rows) => transformToNetworkGraph({
      source_column: "source",
      target_column: "target",
      sample_data: generateNetworkCSV(rows),
    }),
  },
  {
    name: "generate_flow_python_code",
    category: "sync",
    invoke: (_rows) => generateFlowPythonCode({
      data_type: "dataframe",
      dataset_title: "Stress Test Dataset",
      columns: ["id", "value", "category", "lat", "lon"],
    }),
  },
  {
    name: "suggest_flow_visualization",
    category: "sync",
    invoke: (rows) => suggestFlowVisualization({
      columns: [
        { name: "x", type: "numeric", cardinality: rows },
        { name: "y", type: "numeric", cardinality: rows },
        { name: "z", type: "numeric", cardinality: rows },
        { name: "cat", type: "categorical", cardinality: 10 },
        { name: "date", type: "date" },
        { name: "lat", type: "geographic" },
      ],
      row_count: rows,
      relationships: "nodes connected by edges",
    }),
  },
  {
    name: "get_flow_template",
    category: "sync",
    invoke: (_rows) => getFlowTemplate({ template_name: "network_force" }),
  },
  {
    name: "flow_extract_from_text",
    category: "sync",
    invoke: (rows) => {
      // Generate text proportional to row count
      const sentences = Array.from({ length: Math.min(rows, 2000) }, (_, i) =>
        `${["Apple Inc", "Microsoft", "Google", "Amazon", "Meta"][i % 5]} reported $${(Math.random() * 100).toFixed(1)}B revenue in ${["New York", "London", "Tokyo", "Berlin", "Paris"][i % 5]} on ${new Date(2020, i % 12, (i % 28) + 1).toISOString().split("T")[0]}. CEO ${["Tim Cook", "Satya Nadella", "Sundar Pichai", "Andy Jassy", "Mark Zuckerberg"][i % 5]} announced a partnership with ${["OpenAI", "Anthropic", "DeepMind", "xAI", "Mistral"][i % 5]}.`
      );
      return extractFromText({ text: sentences.join("\n"), output_mode: "auto", source_type: "article" });
    },
  },
  {
    name: "flow_precompute_force_layout",
    category: "sync",
    invoke: (rows) => {
      const nodeCount = Math.min(rows, 500); // Cap for reasonable run time
      return precomputeForceLayout({
        nodes: generateNodes(nodeCount),
        edges: generateEdges(nodeCount, 2),
        iterations: 50, // Reduced iterations for profiling speed
        dimensions: 3,
      });
    },
  },
  {
    name: "flow_scale_dataset",
    category: "sync",
    invoke: (rows) => scaleDataset({
      csv_content: generateCSV(rows, 6),
      target_rows: Math.floor(rows / 2),
      strategy: "sample",
    }),
  },
  {
    name: "flow_compute_graph_metrics",
    category: "sync",
    invoke: (rows) => {
      const nodeCount = Math.min(rows, 500);
      return computeGraphMetrics({
        nodes: generateNodes(nodeCount),
        edges: generateEdges(nodeCount, 2),
        metrics: ["degree", "pagerank", "component", "clustering"],
      });
    },
  },
  {
    name: "flow_anomaly_detect",
    category: "sync",
    invoke: (rows) => flowAnomalyDetect({
      csv_content: generateCSV(rows, 4),
      method: "auto",
      threshold: 2.5,
    }),
  },
  {
    name: "flow_time_series_animate",
    category: "sync",
    invoke: (rows) => flowTimeSeriesAnimate({
      csv_content: generateTimeCSV(rows),
      time_column: "date",
      frame_count: 50,
      interpolation: "linear",
      aggregation: "mean",
    }),
  },
  {
    name: "flow_merge_datasets",
    category: "sync",
    invoke: (rows) => {
      const halfRows = Math.floor(rows / 2);
      return flowMergeDatasets({
        datasets: [
          { csv_content: generateCSV(halfRows, 4), label: "ds1" },
          { csv_content: generateCSV(halfRows, 4), label: "ds2" },
        ],
        join_type: "concatenate",
        add_source_column: true,
      });
    },
  },
  {
    name: "flow_geo_enhance",
    category: "sync",
    invoke: (rows) => flowGeoEnhance({
      csv_content: generateGeoCSV(rows),
      location_columns: ["city"],
      location_format: "city",
    }),
  },
  {
    name: "flow_nlp_to_viz",
    category: "sync",
    invoke: (rows) => flowNlpToViz({
      prompt: "Show me a 3D network of technology companies and their partnerships",
      data_source: "generate",
      complexity: "medium",
      row_count: Math.min(rows, 5000),
      style: "business",
    }),
  },
  {
    name: "flow_export_formats",
    category: "sync",
    invoke: (rows) => flowExportFormats({
      csv_content: generateCSV(rows, 5),
      format: "json",
      title: "Stress Test Export",
    }),
  },
  // --- ASYNC LOCAL tools (no network, but async) ---
  {
    name: "flow_semantic_search",
    category: "async_local",
    invoke: async (_rows) => {
      return await flowSemanticSearch({
        query: "climate temperature scatter",
        max_results: 10,
        sort_by: "relevance",
      });
    },
  },
  // --- NETWORK tools (skipped for profiling — marked for reference) ---
  // flow_authenticate, flow_upload_data, flow_browse_flows, flow_get_flow,
  // flow_list_templates, flow_list_categories, flow_extract_from_url, flow_query_graph
];

// Names of network tools we can't profile without live API
const NETWORK_TOOLS = [
  "flow_authenticate",
  "flow_upload_data",
  "flow_browse_flows",
  "flow_get_flow",
  "flow_list_templates",
  "flow_list_categories",
  "flow_extract_from_url",
  "flow_query_graph",
];

// ---------------------------------------------------------------------------
// Profiling utilities
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(times: number[]): { mean_ms: number; p50_ms: number; p95_ms: number; p99_ms: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    mean_ms: Math.round(mean * 100) / 100,
    p50_ms: Math.round(percentile(sorted, 50) * 100) / 100,
    p95_ms: Math.round(percentile(sorted, 95) * 100) / 100,
    p99_ms: Math.round(percentile(sorted, 99) * 100) / 100,
  };
}

const hasGC = typeof globalThis.gc === "function";

function forceGC() {
  if (hasGC) {
    globalThis.gc!();
  }
}

// ---------------------------------------------------------------------------
// 1. Memory leak detection
// ---------------------------------------------------------------------------

interface MemoryProfile {
  tool: string;
  iterations: number;
  heap_before_mb: number;
  heap_after_mb: number;
  heap_delta_mb: number;
  heap_growth_pct: number;
  leak_suspected: boolean;
}

async function profileMemoryLeaks(): Promise<MemoryProfile[]> {
  const results: MemoryProfile[] = [];
  const ITERATIONS = 50;
  const INPUT_ROWS = 500;

  for (const tool of TOOLS) {
    forceGC();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const result = tool.invoke(INPUT_ROWS);
        if (result instanceof Promise) await result;
      } catch { /* swallow errors for profiling */ }
    }

    forceGC();
    const heapAfter = process.memoryUsage().heapUsed;
    const delta = heapAfter - heapBefore;
    const growthPct = heapBefore > 0 ? (delta / heapBefore) * 100 : 0;

    results.push({
      tool: tool.name,
      iterations: ITERATIONS,
      heap_before_mb: Math.round(heapBefore / 1024 / 1024 * 100) / 100,
      heap_after_mb: Math.round(heapAfter / 1024 / 1024 * 100) / 100,
      heap_delta_mb: Math.round(delta / 1024 / 1024 * 100) / 100,
      heap_growth_pct: Math.round(growthPct * 100) / 100,
      leak_suspected: growthPct > 20,
    });

    process.stderr.write(`  [memory] ${tool.name}: ${growthPct > 20 ? "LEAK?" : "OK"} (${Math.round(growthPct)}% growth)\n`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. CPU hot path timing at scale
// ---------------------------------------------------------------------------

interface ScaleProfile {
  tool: string;
  scale: number;
  runs: number;
  mean_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

async function profileCPUScale(): Promise<ScaleProfile[]> {
  const results: ScaleProfile[] = [];
  const SCALES = [100, 500, 1000, 5000];
  const RUNS = 10;

  for (const tool of TOOLS) {
    for (const scale of SCALES) {
      // Some tools cap at small sizes — skip large scales for constant-time tools
      if (tool.name === "generate_flow_python_code" && scale > 100) continue;
      if (tool.name === "get_flow_template" && scale > 100) continue;
      if (tool.name === "flow_semantic_search" && scale > 100) continue;

      const times: number[] = [];

      for (let r = 0; r < RUNS; r++) {
        forceGC();
        const start = performance.now();
        try {
          const result = tool.invoke(scale);
          if (result instanceof Promise) await result;
        } catch { /* swallow */ }
        times.push(performance.now() - start);
      }

      const s = stats(times);
      results.push({
        tool: tool.name,
        scale,
        runs: RUNS,
        ...s,
      });

      process.stderr.write(`  [cpu] ${tool.name} @ ${scale} rows: ${s.mean_ms.toFixed(1)}ms mean\n`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Peak RSS at 5000 rows
// ---------------------------------------------------------------------------

interface PeakRSSProfile {
  tool: string;
  peak_rss_mb: number;
  rss_before_mb: number;
  rss_after_mb: number;
}

async function profilePeakRSS(): Promise<PeakRSSProfile[]> {
  const results: PeakRSSProfile[] = [];

  for (const tool of TOOLS) {
    forceGC();
    const rssBefore = process.memoryUsage().rss;

    try {
      const result = tool.invoke(5000);
      if (result instanceof Promise) await result;
    } catch { /* swallow */ }

    const rssAfter = process.memoryUsage().rss;
    const peakRSS = Math.max(rssBefore, rssAfter);

    results.push({
      tool: tool.name,
      peak_rss_mb: Math.round(peakRSS / 1024 / 1024 * 100) / 100,
      rss_before_mb: Math.round(rssBefore / 1024 / 1024 * 100) / 100,
      rss_after_mb: Math.round(rssAfter / 1024 / 1024 * 100) / 100,
    });

    process.stderr.write(`  [rss] ${tool.name}: ${Math.round(rssAfter / 1024 / 1024)}MB\n`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. Concurrent execution
// ---------------------------------------------------------------------------

interface ConcurrencyProfile {
  tools: string[];
  sequential_ms: number;
  parallel_ms: number;
  speedup: number;
  efficiency_pct: number;
}

async function profileConcurrency(cpuResults: ScaleProfile[]): Promise<ConcurrencyProfile> {
  // Find the 5 slowest tools at scale 1000
  const at1000 = cpuResults
    .filter(r => r.scale === 1000)
    .sort((a, b) => b.mean_ms - a.mean_ms)
    .slice(0, 5);

  const toolNames = at1000.map(r => r.tool);
  const toolDefs = toolNames.map(name => TOOLS.find(t => t.name === name)!).filter(Boolean);

  process.stderr.write(`  [concurrency] Top 5 slowest: ${toolNames.join(", ")}\n`);

  // Sequential
  const seqStart = performance.now();
  for (const tool of toolDefs) {
    try {
      const result = tool.invoke(1000);
      if (result instanceof Promise) await result;
    } catch { /* swallow */ }
  }
  const seqTime = performance.now() - seqStart;

  // Parallel
  const parStart = performance.now();
  await Promise.all(toolDefs.map(async (tool) => {
    try {
      const result = tool.invoke(1000);
      if (result instanceof Promise) await result;
    } catch { /* swallow */ }
  }));
  const parTime = performance.now() - parStart;

  const speedup = seqTime / parTime;
  const efficiency = (speedup / toolDefs.length) * 100;

  process.stderr.write(`  [concurrency] Seq: ${seqTime.toFixed(1)}ms, Par: ${parTime.toFixed(1)}ms, Speedup: ${speedup.toFixed(2)}x\n`);

  return {
    tools: toolNames,
    sequential_ms: Math.round(seqTime * 100) / 100,
    parallel_ms: Math.round(parTime * 100) / 100,
    speedup: Math.round(speedup * 100) / 100,
    efficiency_pct: Math.round(efficiency * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 5. GC pressure analysis
// ---------------------------------------------------------------------------

interface GCPressureProfile {
  tool: string;
  heap_growth_no_gc_mb: number;
  heap_growth_with_gc_mb: number;
  gc_reclaimed_mb: number;
  gc_available: boolean;
}

async function profileGCPressure(): Promise<GCPressureProfile[]> {
  const results: GCPressureProfile[] = [];
  const ITERATIONS = 30;
  const INPUT_ROWS = 1000;

  for (const tool of TOOLS) {
    // Without forced GC
    const heapStart1 = process.memoryUsage().heapUsed;
    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const result = tool.invoke(INPUT_ROWS);
        if (result instanceof Promise) await result;
      } catch { /* swallow */ }
    }
    const heapEnd1 = process.memoryUsage().heapUsed;
    const growthNoGC = heapEnd1 - heapStart1;

    // With forced GC between runs
    forceGC();
    const heapStart2 = process.memoryUsage().heapUsed;
    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const result = tool.invoke(INPUT_ROWS);
        if (result instanceof Promise) await result;
      } catch { /* swallow */ }
      forceGC();
    }
    const heapEnd2 = process.memoryUsage().heapUsed;
    const growthWithGC = heapEnd2 - heapStart2;

    const reclaimed = growthNoGC - growthWithGC;

    results.push({
      tool: tool.name,
      heap_growth_no_gc_mb: Math.round(growthNoGC / 1024 / 1024 * 100) / 100,
      heap_growth_with_gc_mb: Math.round(growthWithGC / 1024 / 1024 * 100) / 100,
      gc_reclaimed_mb: Math.round(reclaimed / 1024 / 1024 * 100) / 100,
      gc_available: hasGC,
    });

    process.stderr.write(`  [gc] ${tool.name}: no-gc=${Math.round(growthNoGC / 1024 / 1024)}MB, with-gc=${Math.round(growthWithGC / 1024 / 1024)}MB\n`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(
  memory: MemoryProfile[],
  cpu: ScaleProfile[],
  rss: PeakRSSProfile[],
  concurrency: ConcurrencyProfile,
  gc: GCPressureProfile[],
): string {
  const lines: string[] = [];
  lines.push("# FlowMCP Stress Profile Report");
  lines.push(`\nGenerated: ${new Date().toISOString()}`);
  lines.push(`Node: ${process.version}`);
  lines.push(`Platform: ${process.platform} ${process.arch}`);
  lines.push(`GC exposed: ${hasGC}`);
  lines.push(`Tools profiled: ${TOOLS.length} (sync/local) + ${NETWORK_TOOLS.length} (network, skipped)`);

  // Memory leak table
  lines.push("\n## 1. Memory Leak Detection (50 iterations @ 500 rows)");
  lines.push("\n| Tool | Heap Before (MB) | Heap After (MB) | Delta (MB) | Growth % | Status |");
  lines.push("|------|------------------|-----------------|------------|----------|--------|");
  for (const m of memory) {
    const status = m.leak_suspected ? "**LEAK?**" : "OK";
    lines.push(`| ${m.tool} | ${m.heap_before_mb} | ${m.heap_after_mb} | ${m.heap_delta_mb} | ${m.heap_growth_pct}% | ${status} |`);
  }

  // CPU timing tables
  lines.push("\n## 2. CPU Timing at Scale");
  for (const scale of [100, 500, 1000, 5000]) {
    const scaleResults = cpu.filter(r => r.scale === scale);
    if (scaleResults.length === 0) continue;
    lines.push(`\n### ${scale} rows`);
    lines.push("\n| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |");
    lines.push("|------|-----------|----------|----------|----------|");
    for (const r of scaleResults.sort((a, b) => b.mean_ms - a.mean_ms)) {
      lines.push(`| ${r.tool} | ${r.mean_ms} | ${r.p50_ms} | ${r.p95_ms} | ${r.p99_ms} |`);
    }
  }

  // Slowest tools ranking
  const at5000 = cpu.filter(r => r.scale === 5000).sort((a, b) => b.mean_ms - a.mean_ms);
  if (at5000.length > 0) {
    lines.push("\n### Slowest Tools @ 5000 rows (ranked)");
    lines.push("\n| Rank | Tool | Mean (ms) |");
    lines.push("|------|------|-----------|");
    at5000.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.tool} | ${r.mean_ms} |`);
    });
  }

  // Peak RSS
  lines.push("\n## 3. Peak RSS at 5000 rows");
  lines.push("\n| Tool | RSS Before (MB) | RSS After (MB) | Peak RSS (MB) |");
  lines.push("|------|-----------------|----------------|---------------|");
  for (const r of rss.sort((a, b) => b.peak_rss_mb - a.peak_rss_mb)) {
    lines.push(`| ${r.tool} | ${r.rss_before_mb} | ${r.rss_after_mb} | ${r.peak_rss_mb} |`);
  }

  // Concurrency
  lines.push("\n## 4. Concurrent Execution (Top 5 slowest @ 1000 rows)");
  lines.push(`\n- **Tools**: ${concurrency.tools.join(", ")}`);
  lines.push(`- **Sequential**: ${concurrency.sequential_ms}ms`);
  lines.push(`- **Parallel**: ${concurrency.parallel_ms}ms`);
  lines.push(`- **Speedup**: ${concurrency.speedup}x`);
  lines.push(`- **Efficiency**: ${concurrency.efficiency_pct}%`);
  lines.push(`\nNote: Node.js is single-threaded, so CPU-bound sync tools show ~1x speedup.`);
  lines.push(`Async tools (I/O-bound) benefit from Promise.all concurrency.`);

  // GC pressure
  lines.push("\n## 5. GC Pressure (30 iterations @ 1000 rows)");
  lines.push("\n| Tool | No GC (MB) | With GC (MB) | Reclaimed (MB) |");
  lines.push("|------|------------|--------------|----------------|");
  for (const g of gc.sort((a, b) => b.gc_reclaimed_mb - a.gc_reclaimed_mb)) {
    lines.push(`| ${g.tool} | ${g.heap_growth_no_gc_mb} | ${g.heap_growth_with_gc_mb} | ${g.gc_reclaimed_mb} |`);
  }
  if (!hasGC) {
    lines.push("\n> **Note**: --expose-gc flag not set. GC comparison uses natural collection only.");
    lines.push("> Re-run with: `node --expose-gc $(npx -y tsx --tsconfig tsconfig.json scripts/stress-profile.ts)` for accurate GC data.");
  }

  // Network tools note
  lines.push("\n## 6. Network Tools (Not Profiled)");
  lines.push("\nThe following tools require live API access and were excluded:");
  for (const t of NETWORK_TOOLS) {
    lines.push(`- ${t}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error("=== FlowMCP Stress Profiler ===");
  console.error(`Tools: ${TOOLS.length} local + ${NETWORK_TOOLS.length} network (skipped)`);
  console.error(`GC exposed: ${hasGC}\n`);

  console.error("Phase 1: Memory leak detection...");
  const memory = await profileMemoryLeaks();

  console.error("\nPhase 2: CPU timing at scale...");
  const cpu = await profileCPUScale();

  console.error("\nPhase 3: Peak RSS...");
  const rss = await profilePeakRSS();

  console.error("\nPhase 4: Concurrent execution...");
  const concurrency = await profileConcurrency(cpu);

  console.error("\nPhase 5: GC pressure...");
  const gc = await profileGCPressure();

  // Build full report JSON
  const report = {
    generated: new Date().toISOString(),
    node_version: process.version,
    platform: `${process.platform} ${process.arch}`,
    gc_exposed: hasGC,
    tools_profiled: TOOLS.length,
    tools_skipped: NETWORK_TOOLS.length,
    memory_leak_detection: memory,
    cpu_timing: cpu,
    peak_rss: rss,
    concurrency,
    gc_pressure: gc,
    network_tools_skipped: NETWORK_TOOLS,
  };

  // Ensure output directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write JSON report
  const jsonPath = path.join(dataDir, "profile-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.error(`\nJSON report: ${jsonPath}`);

  // Write markdown summary
  const mdPath = path.join(dataDir, "profile-summary.md");
  const md = generateMarkdownReport(memory, cpu, rss, concurrency, gc);
  fs.writeFileSync(mdPath, md);
  console.error(`Markdown report: ${mdPath}`);

  // Quick summary to stdout
  const leaks = memory.filter(m => m.leak_suspected);
  const slowest = cpu.filter(r => r.scale === 5000).sort((a, b) => b.mean_ms - a.mean_ms);

  console.log("\n=== SUMMARY ===");
  console.log(`Memory leaks suspected: ${leaks.length > 0 ? leaks.map(l => l.tool).join(", ") : "NONE"}`);
  if (slowest.length > 0) {
    console.log(`Slowest tool @ 5000 rows: ${slowest[0].tool} (${slowest[0].mean_ms}ms)`);
    console.log(`Fastest tool @ 5000 rows: ${slowest[slowest.length - 1].tool} (${slowest[slowest.length - 1].mean_ms}ms)`);
  }
  console.log(`Concurrency speedup: ${concurrency.speedup}x (${concurrency.efficiency_pct}% efficiency)`);
  console.log(`Reports saved to: data/profile-report.json, data/profile-summary.md`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
