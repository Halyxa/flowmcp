#!/usr/bin/env node
/**
 * Standalone MCP Smoke Test
 *
 * Validates the compiled dist/index.js works as a real MCP server:
 * - Spawns the server over stdio
 * - Performs MCP protocol handshake (initialize + initialized)
 * - Lists tools, prompts, resources
 * - Calls one tool to verify end-to-end protocol correctness
 * - Reports pass/fail for each check
 *
 * Usage: node scripts/smoke-test.mjs
 * No dependencies beyond @modelcontextprotocol/sdk (already installed).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = 59;
const EXPECTED_PROMPTS = 3;
const EXPECTED_RESOURCES = 5;

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("Flow MCP Smoke Test");
  console.log("=".repeat(50));
  console.log();

  // 1. Spawn server
  console.log("1. Server Launch");
  let client, transport;
  try {
    transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      stderr: "pipe",
    });

    client = new Client(
      { name: "smoke-test", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    check("Server starts and completes MCP handshake", true);
  } catch (e) {
    check("Server starts and completes MCP handshake", false, e.message);
    console.log("\nFATAL: Cannot continue without server connection.");
    process.exit(1);
  }

  // 2. Tool discovery
  console.log("\n2. Tool Discovery");
  try {
    const tools = await client.listTools();
    check(`Lists ${EXPECTED_TOOLS} tools`, tools.tools.length === EXPECTED_TOOLS,
      `got ${tools.tools.length}`);

    const allHaveDesc = tools.tools.every(t => t.description && t.description.length > 20);
    check("All tools have descriptions (>20 chars)", allHaveDesc);

    const allHaveSchema = tools.tools.every(t => t.inputSchema);
    check("All tools have inputSchema", allHaveSchema);

    const names = tools.tools.map(t => t.name);
    const expectedNames = [
      "analyze_data_for_flow", "validate_csv_for_flow", "transform_to_network_graph",
      "generate_flow_python_code", "suggest_flow_visualization", "get_flow_template",
      "flow_extract_from_text", "flow_authenticate", "flow_upload_data",
      "flow_browse_flows", "flow_get_flow", "flow_list_templates", "flow_list_categories",
      "flow_precompute_force_layout", "flow_scale_dataset", "flow_compute_graph_metrics",
      "flow_query_graph",
    ];
    const allPresent = expectedNames.every(n => names.includes(n));
    check("All expected tool names present", allPresent,
      allPresent ? "" : `missing: ${expectedNames.filter(n => !names.includes(n)).join(", ")}`);
  } catch (e) {
    check("Tool discovery", false, e.message);
  }

  // 3. Prompt discovery
  console.log("\n3. Prompt Discovery");
  try {
    const prompts = await client.listPrompts();
    check(`Lists ${EXPECTED_PROMPTS} prompts`, prompts.prompts.length === EXPECTED_PROMPTS,
      `got ${prompts.prompts.length}`);
  } catch (e) {
    check("Prompt discovery", false, e.message);
  }

  // 4. Resource discovery
  console.log("\n4. Resource Discovery");
  try {
    const resources = await client.listResources();
    check(`Lists ${EXPECTED_RESOURCES} resources`, resources.resources.length === EXPECTED_RESOURCES,
      `got ${resources.resources.length}`);
  } catch (e) {
    check("Resource discovery", false, e.message);
  }

  // 5. Tool execution (offline tool — no network needed)
  console.log("\n5. Tool Execution (validate_csv_for_flow)");
  try {
    const result = await client.callTool({
      name: "validate_csv_for_flow",
      arguments: {
        csv_content: "name,value,category\nAlice,100,A\nBob,200,B\nCarol,300,A",
      },
    });
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    check("Tool returns valid JSON response", true);
    check("CSV validated as valid", parsed.valid === true, `got valid=${parsed.valid}`);
    check("Reports correct row count", parsed.rowCount === 3, `got ${parsed.rowCount}`);
  } catch (e) {
    check("Tool execution", false, e.message);
  }

  // 6. Force layout execution (compute-heavy offline tool)
  console.log("\n6. Tool Execution (flow_precompute_force_layout)");
  try {
    const result = await client.callTool({
      name: "flow_precompute_force_layout",
      arguments: {
        nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
        edges: [{ source: "A", target: "B" }, { source: "B", target: "C" }],
        iterations: 50,
      },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Force layout returns CSV with positions", parsed.csv.includes("id,x,y,z"));
    check("Reports 3 nodes", parsed.stats.nodes === 3, `got ${parsed.stats.nodes}`);
    check("Reports 2 edges", parsed.stats.edges === 2, `got ${parsed.stats.edges}`);
  } catch (e) {
    check("Force layout execution", false, e.message);
  }

  // 7. Text extraction (NLP offline tool)
  console.log("\n7. Tool Execution (flow_extract_from_text)");
  try {
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Apple in Cupertino and Google in Mountain View compete in AI. Tim Cook leads Apple. Sundar Pichai leads Google.",
        output_mode: "network",
      },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Text extraction returns network mode", parsed.mode === "network");
    check("Extracts CSV output", typeof parsed.csv_output === "string" && parsed.csv_output.length > 10);
  } catch (e) {
    check("Text extraction", false, e.message);
  }

  // Cleanup
  await client.close();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    console.log("\nSMOKE TEST FAILED");
    process.exit(1);
  } else {
    console.log("\nALL CHECKS PASSED — server is deployment-ready");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
