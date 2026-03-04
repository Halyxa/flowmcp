#!/usr/bin/env node
/**
 * FlowMCP 30-Second Demo
 *
 * Runs a complete pipeline demonstrating 6 tools end-to-end.
 * Usage: node scripts/demo-30-second.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "fs";

const B = "\x1b[1m", G = "\x1b[32m", C = "\x1b[36m", D = "\x1b[2m", R = "\x1b[0m";
function step(n, label) { console.log(`\n${B}${C}[${n}]${R} ${label}`); }
function ok(label, value) { console.log(`  ${G}✓${R} ${label}: ${B}${value}${R}`); }
function info(label, value) { console.log(`  ${D}${label}: ${value}${R}`); }

async function call(client, name, args) {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
}

async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════╗${R}`);
  console.log(`${B}║  FlowMCP — 30-Second Pipeline Demo           ║${R}`);
  console.log(`${B}║  71 tools • 1278 tests • 3D data viz         ║${R}`);
  console.log(`${B}╚══════════════════════════════════════════════╝${R}`);

  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
  const client = new Client({ name: "demo", version: "1.0.0" }, {});
  await client.connect(transport);
  const start = Date.now();

  // 1. Load data
  step("1/6", "Load startup funding dataset");
  const csv = readFileSync("samples/global-startup-funding.csv", "utf8");
  const rows = csv.trim().split("\n").length - 1;
  ok("Loaded", `${rows} rows × ${csv.split("\\n")[0].split(",").length} columns`);

  // 2. Profile — uses csv_content arg
  step("2/6", "Profile dataset (flow_describe_dataset)");
  const desc = await call(client, "flow_describe_dataset", { csv_content: csv });
  if (desc.error) { info("Note", desc.error); }
  else { ok("Shape", `${desc.rows} rows × ${desc.columns} columns`);
    info("Types", desc.column_profiles?.map(c => `${c.name}:${c.type}`).slice(0,4).join(", ") || ""); }

  // 3. Cluster — uses csv_content arg
  step("3/6", "K-means clustering (flow_cluster_data)");
  const cl = await call(client, "flow_cluster_data", { csv_content: csv });
  if (cl.error) { info("Note", cl.error); }
  else { ok("Clusters", `k=${cl.k}, silhouette=${cl.silhouette_score?.toFixed(3)}`);
    info("Sizes", cl.cluster_sizes?.join(", ") || ""); }

  // 4. Narrate — uses csv_data arg
  step("4/6", "Generate narrative arc (flow_narrate_data)");
  const narr = await call(client, "flow_narrate_data", { csv: csv, style: "explorer" });
  if (narr.error) { info("Note", narr.error); }
  else { const hook = narr.narrative?.hook || "";
    ok("Hook", hook.length > 70 ? hook.slice(0, 70) + "..." : hook || "Generated"); }

  // 5. Quests — uses csv_data arg
  step("5/6", "Generate exploration quests (flow_quest_generator)");
  const q = await call(client, "flow_quest_generator", { csv_data: csv });
  if (q.error) { info("Note", q.error); }
  else { ok("Quests", `${q.quests?.length || 0} quests`);
    info("Types", [...new Set(q.quests?.map(x => x.type) || [])].join(", ")); }

  // 6. Column stats — returns CSV of stats for all numeric columns
  step("6/6", "Compute column statistics (flow_column_stats)");
  const stats = await call(client, "flow_column_stats", { csv_content: csv });
  if (stats.error) { info("Note", stats.error); }
  else {
    const statLines = (stats.csv || "").trim().split("\n");
    ok("Stats", `${statLines.length - 1} numeric columns profiled`);
    if (statLines.length > 1) info("Columns", statLines.slice(1).map(l => l.split(",")[0]).join(", "));
  }

  // Summary
  const elapsed = Date.now() - start;
  console.log(`\n${B}${G}═══ Pipeline Complete ═══${R}`);
  console.log(`  Time: ${B}${(elapsed / 1000).toFixed(1)}s${R}`);
  console.log(`  Tools: ${B}5 of 71${R} (describe → cluster → narrate → quest → stats)`);
  console.log(`  Input: ${rows} rows of startup data`);
  console.log(`  ${D}All from a single AI assistant conversation.${R}\n`);

  await client.close();
}

main().catch(err => { console.error("Demo failed:", err.message); process.exit(1); });
