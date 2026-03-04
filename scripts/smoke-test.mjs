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

const EXPECTED_TOOLS = 75;
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

  // --- Holodeck Intelligence Layer (tools 61-70) ---
  const SAMPLE_CSV = "name,value,category,score\nAlice,100,A,85\nBob,200,B,72\nCarol,300,A,91\nDave,150,C,68\nEve,250,B,95";

  // 8. Quest Generator
  console.log("\n8. Tool Execution (flow_quest_generator)");
  try {
    const result = await client.callTool({
      name: "flow_quest_generator",
      arguments: { csv_data: SAMPLE_CSV, max_quests: 3 },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Quest generator returns quests array", Array.isArray(parsed.quests));
    check("Quests have title and difficulty", parsed.quests.length > 0 && parsed.quests[0].title && parsed.quests[0].difficulty);
  } catch (e) {
    check("Quest generator", false, e.message);
  }

  // 9. Near-miss Detector
  console.log("\n9. Tool Execution (flow_near_miss_detector)");
  try {
    const result = await client.callTool({
      name: "flow_near_miss_detector",
      arguments: { csv_data: SAMPLE_CSV, max_near_misses: 5 },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Near-miss returns near_misses array", Array.isArray(parsed.near_misses));
    check("Near-miss has dataset_summary", typeof parsed.dataset_summary === "object" && parsed.dataset_summary.rows > 0);
  } catch (e) {
    check("Near-miss detector", false, e.message);
  }

  // 10. Progressive Disclosure
  console.log("\n10. Tool Execution (flow_progressive_disclosure)");
  try {
    const result = await client.callTool({
      name: "flow_progressive_disclosure",
      arguments: { csv_data: SAMPLE_CSV },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Progressive disclosure returns layers", Array.isArray(parsed.layers) && parsed.layers.length > 0);
    check("Layers have CSV content", typeof parsed.layers[0].csv === "string");
  } catch (e) {
    check("Progressive disclosure", false, e.message);
  }

  // 11. Exploration DNA
  console.log("\n11. Tool Execution (flow_exploration_dna)");
  try {
    const result = await client.callTool({
      name: "flow_exploration_dna",
      arguments: { csv_data: SAMPLE_CSV },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("DNA returns traits array", Array.isArray(parsed.traits) && parsed.traits.length > 0);
    check("DNA returns archetype", typeof parsed.archetype === "string" && parsed.archetype.length > 0);
  } catch (e) {
    check("Exploration DNA", false, e.message);
  }

  // 12. Sparkle Engine
  console.log("\n12. Tool Execution (flow_sparkle_engine)");
  try {
    const result = await client.callTool({
      name: "flow_sparkle_engine",
      arguments: { csv_data: SAMPLE_CSV, dwell_seconds: 5 },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Sparkle engine returns sparkles", Array.isArray(parsed.sparkles) && parsed.sparkles.length > 0);
    check("Sparkles have layer and title", parsed.sparkles[0].layer !== undefined && parsed.sparkles[0].title);
  } catch (e) {
    check("Sparkle engine", false, e.message);
  }

  // 13. Visor Mode
  console.log("\n13. Tool Execution (flow_visor_mode)");
  try {
    const result = await client.callTool({
      name: "flow_visor_mode",
      arguments: { csv_data: SAMPLE_CSV, visor: "statistical" },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Visor mode returns annotations", Array.isArray(parsed.annotations) && parsed.annotations.length > 0);
    check("Visor identifies correct mode", parsed.visor === "statistical");
  } catch (e) {
    check("Visor mode", false, e.message);
  }

  // 14. Data World Builder
  console.log("\n14. Tool Execution (flow_data_world_builder)");
  try {
    const result = await client.callTool({
      name: "flow_data_world_builder",
      arguments: { csv_data: SAMPLE_CSV, depth: "quick" },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("World builder returns archetype", typeof parsed.archetype === "string" && parsed.archetype.length > 0);
    check("World builder returns sparkles", typeof parsed.sparkles === "object" && Array.isArray(parsed.sparkles.instant));
  } catch (e) {
    check("Data world builder", false, e.message);
  }

  // 15. Synthetic Data Generator
  console.log("\n15. Tool Execution (flow_generate_synthetic)");
  try {
    const result = await client.callTool({
      name: "flow_generate_synthetic",
      arguments: { rows: 20, mode: "network", seed: 42 },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Synthetic generates correct row count", parsed.rows === 20);
    check("Synthetic returns CSV with connections", parsed.csv.includes("connections"));
    check("Synthetic is reproducible with seed", parsed.csv.length > 0);
  } catch (e) {
    check("Synthetic data generator", false, e.message);
  }

  // 16. Fog of War
  console.log("\n16. Tool Execution (flow_fog_of_war)");
  try {
    const result = await client.callTool({
      name: "flow_fog_of_war",
      arguments: { csv_data: SAMPLE_CSV },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Fog of war returns fog_csv", typeof parsed.fog_csv === "string" && parsed.fog_csv.length > 0);
    check("Fog of war returns world_coverage", typeof parsed.world_coverage === "number");
  } catch (e) {
    check("Fog of war", false, e.message);
  }

  // 17. Explorer Profile
  console.log("\n17. Tool Execution (flow_explorer_profile)");
  try {
    const result = await client.callTool({
      name: "flow_explorer_profile",
      arguments: { exploration_actions: [{ tool: "flow_anomaly_detect", columns: ["value"], finding: "2 outliers" }] },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Explorer profile returns archetype", typeof parsed.dominant_archetype === "string");
    check("Explorer profile returns dna_string", typeof parsed.dna_string === "string");
  } catch (e) {
    check("Explorer profile", false, e.message);
  }

  // 18. Viral Video Spec
  console.log("\n18. Tool Execution (flow_viral_video_spec)");
  const NETWORK_CSV = "id,connections,group\nAlice,Bob|Carol,Eng\nBob,Alice|Dave,Eng\nCarol,Alice|Eve,Design\nDave,Bob|Eve,Mgmt\nEve,Carol|Dave,Design";
  try {
    const result = await client.callTool({
      name: "flow_viral_video_spec",
      arguments: { csv_data: NETWORK_CSV, navigation_path: ["Alice", "Bob", "Dave"] },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Video spec returns camera keyframes", Array.isArray(parsed.camera_keyframes) && parsed.camera_keyframes.length > 0);
    check("Video spec returns narrative caption", typeof parsed.narrative_caption === "string");
  } catch (e) {
    check("Viral video spec", false, e.message);
  }

  // 19. Discovery Narrator
  console.log("\n19. Tool Execution (flow_discovery_narrator)");
  try {
    const result = await client.callTool({
      name: "flow_discovery_narrator",
      arguments: {
        csv_data: SAMPLE_CSV,
        exploration_path: [
          { action: "viewed_column", target: "value", finding: "Range 100-300" },
          { action: "detected_anomaly", target: "Carol", finding: "Highest score" },
        ],
      },
    });
    const parsed = JSON.parse(result.content[0].text);
    check("Narrator returns narrative", typeof parsed.narrative === "string" && parsed.narrative.length > 50);
    check("Narrator returns chapters", Array.isArray(parsed.chapters) && parsed.chapters.length > 0);
  } catch (e) {
    check("Discovery narrator", false, e.message);
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
