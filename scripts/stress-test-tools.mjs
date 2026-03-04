#!/usr/bin/env node
/**
 * FlowMCP Tool Performance Stress Test
 *
 * Benchmarks 8 core tools at increasing dataset scales (100 to 50,000 rows).
 * Connects to the MCP server via stdio and measures wall-clock time, memory,
 * and output size for each tool invocation.
 *
 * Usage: node scripts/stress-test-tools.mjs
 *        node scripts/stress-test-tools.mjs --scales 100,1000,5000
 *        node scripts/stress-test-tools.mjs --tools describe,cluster,stats
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ─── ANSI ────────────────────────────────────────────────────────────────────
const B = "\x1b[1m", G = "\x1b[32m", R = "\x1b[0m", D = "\x1b[2m";
const Y = "\x1b[33m", RED = "\x1b[31m", C = "\x1b[36m", M = "\x1b[35m";

// ─── Configuration ───────────────────────────────────────────────────────────
const DEFAULT_SCALES = [100, 1000, 5000, 10000, 50000];
const CATEGORIES = ["Tech", "Finance", "Health", "Energy", "Retail", "Education", "Media", "Transport"];

const TOOL_REGISTRY = {
  describe:    { name: "flow_describe_dataset",    label: "Describe Dataset",    args: csv => ({ csv_content: csv }) },
  cluster:     { name: "flow_cluster_data",         label: "Cluster (k-means)",   args: csv => ({ csv_content: csv }) },
  stats:       { name: "flow_column_stats",         label: "Column Stats",        args: csv => ({ csv_content: csv }) },
  correlation: { name: "flow_correlation_matrix",   label: "Correlation Matrix",  args: csv => ({ csv_content: csv }) },
  normalize:   { name: "flow_normalize_data",       label: "Normalize (z-score)", args: csv => ({ csv_content: csv, method: "z_score" }) },
  pca:         { name: "flow_pca_reduce",           label: "PCA Reduce (3D)",     args: csv => ({ csv_content: csv, columns: ["value1", "value2", "value3"], n_components: 3 }) },
  regression:  { name: "flow_regression_analysis",  label: "Regression",          args: csv => ({ csv_content: csv, x_column: "value1", y_column: "value2" }) },
  bin:         { name: "flow_bin_data",             label: "Bin Data",            args: csv => ({ csv_content: csv, column: "value1" }) },
};

// ─── CLI Argument Parsing ────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  let scales = DEFAULT_SCALES;
  let toolKeys = Object.keys(TOOL_REGISTRY);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scales" && args[i + 1]) {
      scales = args[++i].split(",").map(Number).filter(n => n > 0);
    } else if (args[i] === "--tools" && args[i + 1]) {
      const requested = args[++i].split(",");
      toolKeys = requested.filter(k => TOOL_REGISTRY[k]);
      const unknown = requested.filter(k => !TOOL_REGISTRY[k]);
      if (unknown.length) console.log(`${Y}Warning: Unknown tools ignored: ${unknown.join(", ")}${R}`);
    } else if (args[i] === "--help") {
      console.log(`Usage: node scripts/stress-test-tools.mjs [options]`);
      console.log(`  --scales 100,1000,5000   Comma-separated row counts`);
      console.log(`  --tools describe,cluster  Comma-separated tool keys`);
      console.log(`  Available tools: ${Object.keys(TOOL_REGISTRY).join(", ")}`);
      process.exit(0);
    }
  }

  return { scales, toolKeys };
}

// ─── Synthetic Data Generator ────────────────────────────────────────────────
function generateCSV(rowCount) {
  const header = "id,name,value1,value2,value3,category,date";
  const lines = [header];

  for (let i = 1; i <= rowCount; i++) {
    const id = i;
    const name = `item_${i}`;
    // Generate correlated numerics for meaningful regression/correlation results
    const v1 = Math.round((Math.random() * 1000 + Math.random() * 500) * 100) / 100;
    const v2 = Math.round((v1 * 0.7 + Math.random() * 300 + (Math.random() - 0.5) * 200) * 100) / 100;
    const v3 = Math.round((Math.random() * 500 + Math.sin(i / 100) * 100) * 100) / 100;
    const category = CATEGORIES[i % CATEGORIES.length];
    // Dates spread across 2020-2025
    const year = 2020 + (i % 6);
    const month = String((i % 12) + 1).padStart(2, "0");
    const day = String((i % 28) + 1).padStart(2, "0");
    const date = `${year}-${month}-${day}`;

    lines.push(`${id},${name},${v1},${v2},${v3},${category},${date}`);
  }

  return lines.join("\n");
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────
function fmtMs(ms) {
  if (ms < 1000) return ms.toFixed(0) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(2) + "s";
  return (ms / 60000).toFixed(1) + "m";
}

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

function fmtNumber(n) {
  return n.toLocaleString("en-US");
}

function statusIcon(status) {
  if (status === "ok") return `${G}PASS${R}`;
  if (status === "error") return `${RED}FAIL${R}`;
  return `${Y}SKIP${R}`;
}

function pad(str, len, align = "right") {
  const s = String(str);
  if (align === "left") return s.padEnd(len);
  return s.padStart(len);
}

// ─── MCP Client ──────────────────────────────────────────────────────────────
async function createClient() {
  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
  const client = new Client({ name: "stress-test", version: "1.0.0" }, {});
  await client.connect(transport);
  return client;
}

async function callTool(client, toolName, args, timeoutMs = 120000) {
  const start = Date.now();
  const memBefore = process.memoryUsage();

  try {
    const result = await Promise.race([
      client.callTool({ name: toolName, arguments: args }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs))
    ]);

    const elapsed = Date.now() - start;
    const memAfter = process.memoryUsage();
    const text = result.content?.[0]?.text || "";
    const parsed = JSON.parse(text);
    const hasError = !!parsed.error;

    return {
      status: hasError ? "error" : "ok",
      time: elapsed,
      memDelta: memAfter.rss - memBefore.rss,
      peakRss: memAfter.rss,
      outputSize: text.length,
      error: hasError ? parsed.error : null,
      result: parsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      status: "error",
      time: elapsed,
      memDelta: 0,
      peakRss: process.memoryUsage().rss,
      outputSize: 0,
      error: err.message,
      result: null,
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { scales, toolKeys } = parseArgs();
  const tools = toolKeys.map(k => ({ key: k, ...TOOL_REGISTRY[k] }));

  console.log(`\n${B}${C}========================================================${R}`);
  console.log(`${B}${C}  FlowMCP Tool Performance Stress Test${R}`);
  console.log(`${B}${C}  ${tools.length} tools x ${scales.length} scales = ${tools.length * scales.length} benchmarks${R}`);
  console.log(`${B}${C}========================================================${R}\n`);

  console.log(`${D}Scales:  ${scales.map(fmtNumber).join(", ")} rows${R}`);
  console.log(`${D}Tools:   ${tools.map(t => t.label).join(", ")}${R}`);
  console.log(`${D}Timeout: 120s per tool call${R}\n`);

  // Pre-generate all datasets
  console.log(`${B}Generating synthetic datasets...${R}`);
  const datasets = {};
  for (const scale of scales) {
    const genStart = Date.now();
    datasets[scale] = generateCSV(scale);
    const genTime = Date.now() - genStart;
    const size = Buffer.byteLength(datasets[scale], "utf8");
    console.log(`  ${G}+${R} ${pad(fmtNumber(scale), 7)} rows  ${pad(fmtBytes(size), 8)}  generated in ${fmtMs(genTime)}`);
  }

  // Connect to MCP server
  console.log(`\n${B}Connecting to MCP server...${R}`);
  let client;
  try {
    client = await createClient();
    console.log(`  ${G}+${R} Connected via stdio\n`);
  } catch (err) {
    console.error(`${RED}Failed to connect to MCP server: ${err.message}${R}`);
    console.error(`${D}Ensure 'npm run build' has been run first.${R}`);
    process.exit(1);
  }

  // Results storage: results[toolKey][scale] = { ... }
  const results = {};
  for (const tool of tools) results[tool.key] = {};

  // Run benchmarks: iterate by scale, then by tool
  const totalStart = Date.now();

  for (const scale of scales) {
    console.log(`${B}${M}--- ${fmtNumber(scale)} rows ---${R}`);
    const csv = datasets[scale];

    for (const tool of tools) {
      const label = `  ${tool.label}`;
      process.stdout.write(`${label}${D}...${R}`);

      const args = tool.args(csv);
      const r = await callTool(client, tool.name, args);
      results[tool.key][scale] = r;

      // Clear the line and print result
      process.stdout.write(`\r${label}: `);
      if (r.status === "ok") {
        console.log(`${G}${fmtMs(r.time)}${R}  ${D}(${fmtBytes(r.outputSize)} output, RSS ${fmtBytes(r.peakRss)})${R}`);
      } else {
        const errMsg = r.error?.length > 60 ? r.error.slice(0, 60) + "..." : r.error;
        console.log(`${RED}FAIL${R} ${fmtMs(r.time)}  ${D}${errMsg}${R}`);
      }
    }
    console.log();
  }

  const totalTime = Date.now() - totalStart;

  // ─── Summary Table ───────────────────────────────────────────────────────
  console.log(`${B}${C}========================================================${R}`);
  console.log(`${B}${C}  Results Summary${R}`);
  console.log(`${B}${C}========================================================${R}\n`);

  // Table header
  const colW = 10;
  const labelW = 22;
  let header = pad("Tool", labelW, "left") + " |";
  for (const s of scales) header += pad(fmtNumber(s), colW) + " |";
  header += pad("Status", 8);

  console.log(`${B}${header}${R}`);
  console.log("-".repeat(header.length));

  // Table rows — time
  for (const tool of tools) {
    let row = pad(tool.label, labelW, "left") + " |";
    let allOk = true;
    let anyRun = false;

    for (const s of scales) {
      const r = results[tool.key][s];
      if (!r) {
        row += pad("-", colW) + " |";
      } else if (r.status === "ok") {
        row += pad(fmtMs(r.time), colW) + " |";
        anyRun = true;
      } else {
        row += `${RED}${pad("FAIL", colW)}${R}` + " |";
        allOk = false;
        anyRun = true;
      }
    }

    row += " " + (anyRun ? (allOk ? `${G}ALL OK${R}` : `${Y}PARTIAL${R}`) : `${D}NONE${R}`);
    console.log(row);
  }

  console.log("-".repeat(header.length));

  // ─── Scaling Analysis ──────────────────────────────────────────────────
  console.log(`\n${B}${C}Scaling Analysis (ms per row)${R}\n`);

  let scHeader = pad("Tool", labelW, "left") + " |";
  for (const s of scales) scHeader += pad(fmtNumber(s), colW) + " |";
  scHeader += pad("Trend", 12);

  console.log(`${B}${scHeader}${R}`);
  console.log("-".repeat(scHeader.length));

  for (const tool of tools) {
    let row = pad(tool.label, labelW, "left") + " |";
    const perRowTimes = [];

    for (const s of scales) {
      const r = results[tool.key][s];
      if (r && r.status === "ok") {
        const perRow = r.time / s;
        perRowTimes.push(perRow);
        row += pad(perRow.toFixed(3), colW) + " |";
      } else {
        perRowTimes.push(null);
        row += pad("-", colW) + " |";
      }
    }

    // Determine scaling trend
    const valid = perRowTimes.filter(x => x !== null);
    let trend = "-";
    if (valid.length >= 2) {
      const ratio = valid[valid.length - 1] / valid[0];
      if (ratio < 0.5) trend = `${G}sub-linear${R}`;
      else if (ratio < 1.5) trend = `${G}linear${R}`;
      else if (ratio < 5) trend = `${Y}super-lin${R}`;
      else trend = `${RED}quadratic+${R}`;
    }
    row += " " + trend;
    console.log(row);
  }

  console.log("-".repeat(scHeader.length));

  // ─── Memory Report ─────────────────────────────────────────────────────
  console.log(`\n${B}${C}Peak RSS by Scale${R}\n`);

  let memHeader = pad("Scale", labelW, "left") + " |" + pad("Peak RSS", 12) + " |" + pad("CSV Size", 12);
  console.log(`${B}${memHeader}${R}`);
  console.log("-".repeat(memHeader.length));

  for (const s of scales) {
    const csvSize = Buffer.byteLength(datasets[s], "utf8");
    let maxRss = 0;
    for (const tool of tools) {
      const r = results[tool.key][s];
      if (r && r.peakRss > maxRss) maxRss = r.peakRss;
    }
    console.log(
      pad(fmtNumber(s) + " rows", labelW, "left") + " |" +
      pad(fmtBytes(maxRss), 12) + " |" +
      pad(fmtBytes(csvSize), 12)
    );
  }

  // ─── Failures Detail ──────────────────────────────────────────────────
  const failures = [];
  for (const tool of tools) {
    for (const s of scales) {
      const r = results[tool.key][s];
      if (r && r.status === "error") {
        failures.push({ tool: tool.label, scale: s, error: r.error, time: r.time });
      }
    }
  }

  if (failures.length > 0) {
    console.log(`\n${B}${RED}Failures (${failures.length})${R}\n`);
    for (const f of failures) {
      console.log(`  ${RED}x${R} ${B}${f.tool}${R} @ ${fmtNumber(f.scale)} rows (${fmtMs(f.time)})`);
      console.log(`    ${D}${f.error}${R}`);
    }
  }

  // ─── Final Summary ────────────────────────────────────────────────────
  const totalBenchmarks = tools.length * scales.length;
  const passCount = Object.values(results).flatMap(r => Object.values(r)).filter(r => r.status === "ok").length;
  const failCount = totalBenchmarks - passCount;

  console.log(`\n${B}${C}========================================================${R}`);
  console.log(`  Total time:   ${B}${fmtMs(totalTime)}${R}`);
  console.log(`  Benchmarks:   ${B}${totalBenchmarks}${R} (${G}${passCount} passed${R}${failCount > 0 ? `, ${RED}${failCount} failed${R}` : ""})`);
  console.log(`  Max scale:    ${B}${fmtNumber(scales[scales.length - 1])} rows${R}`);
  console.log(`  Peak RSS:     ${B}${fmtBytes(process.memoryUsage().rss)}${R}`);
  console.log(`${B}${C}========================================================${R}\n`);

  await client.close();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Stress test failed: ${err.message}${R}`);
  process.exit(1);
});
