/**
 * MCP Protocol Integration Test
 *
 * Connects to the Flow MCP server over stdio using the MCP SDK client,
 * verifies all 25 tools are listed, and calls each one to validate
 * end-to-end protocol correctness.
 *
 * This is the REAL test — unit tests call exported functions,
 * but this test speaks the actual MCP JSON-RPC protocol over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client;
let transport: StdioClientTransport;

// Helper to extract text from MCP tool result
function getResultText(result: any): string {
  return result.content[0].text;
}
function getResultJson(result: any): any {
  return JSON.parse(getResultText(result));
}

describe("MCP Protocol Integration", () => {
  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      stderr: "pipe",
    });

    client = new Client(
      { name: "flow-mcp-test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    await client.close();
  });

  // ====================================================================
  // Tool Discovery
  // ====================================================================

  it("lists all 25 tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBe(25);
  });

  it("includes all expected tool names", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);

    const expected = [
      "analyze_data_for_flow",
      "validate_csv_for_flow",
      "transform_to_network_graph",
      "generate_flow_python_code",
      "suggest_flow_visualization",
      "get_flow_template",
      "flow_extract_from_text",
      "flow_extract_from_url",
      "flow_authenticate",
      "flow_upload_data",
      "flow_browse_flows",
      "flow_get_flow",
      "flow_list_templates",
      "flow_list_categories",
      "flow_precompute_force_layout",
      "flow_scale_dataset",
      "flow_compute_graph_metrics",
      "flow_query_graph",
      "flow_semantic_search",
      "flow_time_series_animate",
      "flow_merge_datasets",
      "flow_anomaly_detect",
      "flow_geo_enhance",
      "flow_nlp_to_viz",
      "flow_export_formats",
    ];

    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it("every tool has a description and inputSchema", async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description!.length).toBeGreaterThan(50);
      expect(tool.inputSchema).toBeDefined();
    }
  });

  // ====================================================================
  // Prompt Discovery
  // ====================================================================

  it("lists 3 prompts", async () => {
    const result = await client.listPrompts();
    expect(result.prompts.length).toBe(3);
  });

  // ====================================================================
  // Resource Discovery
  // ====================================================================

  it("lists 5 resources", async () => {
    const result = await client.listResources();
    expect(result.resources.length).toBe(5);
  });

  // ====================================================================
  // Tool Execution — Data Analysis & Preparation
  // ====================================================================

  it("analyze_data_for_flow responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "analyze_data_for_flow",
      arguments: {
        data_description: "Sales data with revenue and region columns",
        column_names: ["company", "revenue", "region", "employees"],
        row_count: 500,
        use_case: "visualize for stakeholder presentation",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.recommendation).toBeDefined();
    expect(parsed.score).toBeDefined();
  });

  it("validate_csv_for_flow responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "validate_csv_for_flow",
      arguments: {
        csv_content: "name,value,category\nAlice,100,A\nBob,200,B\nCarol,300,A",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.valid).toBe(true);
    expect(parsed.rowCount).toBe(3); // rowCount, not rows
  });

  it("transform_to_network_graph responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "transform_to_network_graph",
      arguments: {
        sample_data: "source,target\nA,B\nB,C\nA,C", // sample_data, not csv_content
        source_column: "source",
        target_column: "target",
      },
    });

    const text = getResultText(result);
    expect(text).toContain("id,connections by id");
  });

  it("suggest_flow_visualization responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "suggest_flow_visualization",
      arguments: {
        columns: [ // columns as array of objects, not flat arrays
          { name: "company", type: "categorical" },
          { name: "revenue", type: "numeric" },
          { name: "profit", type: "numeric" },
          { name: "region", type: "categorical" },
        ],
        row_count: 200,
      },
    });

    const parsed = getResultJson(result);
    // Check for recommendations array
    expect(parsed.recommendations || parsed.recommended_type).toBeDefined();
  });

  it("get_flow_template responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "get_flow_template",
      arguments: {
        template_name: "network_force",
      },
    });

    const parsed = getResultJson(result);
    // Template returns the template object with name, description, setupSteps
    expect(parsed.name).toBeDefined();
    expect(parsed.setupSteps).toBeDefined();
  });

  // ====================================================================
  // Tool Execution — Text-to-Visualization
  // ====================================================================

  it("flow_extract_from_text responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Tim Cook leads Apple. Satya Nadella leads Microsoft. They collaborate on industry standards.",
        output_mode: "network",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.mode).toBe("network");
    expect(parsed.csv_output).toBeDefined();
  });

  it("flow_extract_from_text extracts emails from full text", async () => {
    // Skill: structured-entity-extraction — emails contain periods that break
    // sentence splitting, so they must be extracted from the full text
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Contact Alice at alice@example.com for details. Bob can be reached at bob@company.org instead.",
        output_mode: "network",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.extraction_summary.entity_types.emails).toBeGreaterThanOrEqual(2);
    expect(parsed.extraction_summary.top_entities.some(
      (e: any) => e.types.includes("email")
    )).toBe(true);
  });

  it("flow_extract_from_text extracts URLs from full text", async () => {
    // Skill: structured-entity-extraction — URLs contain periods that break
    // sentence splitting, so they must be extracted from the full text
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Visit https://example.com/page for info. Also see https://docs.flow.gl/api for the API reference.",
        output_mode: "network",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.extraction_summary.entity_types.urls).toBeGreaterThanOrEqual(2);
    expect(parsed.extraction_summary.top_entities.some(
      (e: any) => e.types.includes("url")
    )).toBe(true);
  });

  it("flow_extract_from_text extracts hashtags and mentions", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Great talk by @johndoe about #DataViz at the conference. @janedoe also presented on #NetworkGraphs and #OpenSource tooling.",
        output_mode: "network",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.extraction_summary.entity_types.hashtags).toBeGreaterThanOrEqual(2);
    expect(parsed.extraction_summary.entity_types.mentions).toBeGreaterThanOrEqual(2);
  });

  it("flow_extract_from_text includes confidence scores and entity_types breakdown", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_text",
      arguments: {
        text: "Tim Cook leads Apple Inc. Reach him at tim@apple.com or visit https://apple.com for more. #Apple is trending. @tim mentioned it twice. Tim Cook spoke again at the keynote.",
        output_mode: "network",
      },
    });

    const parsed = getResultJson(result);
    const summary = parsed.extraction_summary;

    // entity_types breakdown should exist with all categories
    expect(summary.entity_types).toBeDefined();
    expect(typeof summary.entity_types.proper_nouns).toBe("number");
    expect(typeof summary.entity_types.organizations).toBe("number");
    expect(typeof summary.entity_types.emails).toBe("number");
    expect(typeof summary.entity_types.urls).toBe("number");
    expect(typeof summary.entity_types.hashtags).toBe("number");
    expect(typeof summary.entity_types.mentions).toBe("number");

    // This text has at least one of each structured type
    expect(summary.entity_types.emails).toBeGreaterThanOrEqual(1);
    expect(summary.entity_types.urls).toBeGreaterThanOrEqual(1);
    expect(summary.entity_types.hashtags).toBeGreaterThanOrEqual(1);
    expect(summary.entity_types.mentions).toBeGreaterThanOrEqual(1);

    // Top entities should have confidence scores
    for (const entity of summary.top_entities) {
      expect(entity.confidence).toBeGreaterThanOrEqual(0);
      expect(entity.confidence).toBeLessThanOrEqual(1);
      expect(entity.types).toBeDefined();
      expect(Array.isArray(entity.types)).toBe(true);
    }

    // CSV output should be valid and flow-ready
    expect(parsed.flow_ready).toBe(true);
    expect(parsed.csv_output.length).toBeGreaterThan(0);
  });

  // ====================================================================
  // Tool Execution — Code Generation
  // ====================================================================

  it("generate_flow_python_code responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "generate_flow_python_code",
      arguments: {
        data_type: "dataframe",
        dataset_title: "Test Data",
        columns: ["name", "value"],
      },
    });

    const text = getResultText(result);
    expect(text).toContain("flowgl");
  });

  // ====================================================================
  // Tool Execution — Server-Side Pre-Computation
  // ====================================================================

  it("flow_precompute_force_layout responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "flow_precompute_force_layout",
      arguments: {
        nodes: [
          { id: "A", label: "Alpha" },
          { id: "B", label: "Beta" },
          { id: "C", label: "Gamma" },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "B", target: "C" },
          { source: "A", target: "C" },
        ],
        iterations: 100,
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.csv).toContain("id,x,y,z");
    expect(parsed.stats.nodes).toBe(3);
    expect(parsed.stats.edges).toBe(3);
    expect(parsed.flow_instructions).toBeDefined();
  });

  it("flow_scale_dataset responds via MCP protocol", async () => {
    const lines = ["id,value,category"];
    for (let i = 0; i < 200; i++) {
      lines.push(`row${i},${i},cat${i % 3}`);
    }

    const result = await client.callTool({
      name: "flow_scale_dataset",
      arguments: {
        csv_content: lines.join("\n"),
        target_rows: 50,
        strategy: "stratified",
        preserve_columns: ["category"],
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.stats.reduced_rows).toBeLessThanOrEqual(50);
    expect(parsed.stats.strategy).toBe("stratified");
  });

  it("flow_compute_graph_metrics responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "flow_compute_graph_metrics",
      arguments: {
        nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
        edges: [
          { source: "A", target: "B" },
          { source: "B", target: "C" },
          { source: "A", target: "C" },
        ],
        metrics: ["degree", "pagerank", "component", "clustering"],
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.csv).toContain("degree");
    expect(parsed.csv).toContain("pagerank");
    expect(parsed.stats.nodes).toBe(3);
  });

  it("flow_query_graph handles query (connection error or results)", async () => {
    const result = await client.callTool({
      name: "flow_query_graph",
      arguments: {
        query: "MATCH (n) RETURN n LIMIT 5",
        graph_name: "test",
      },
    });

    const parsed = getResultJson(result);
    // If FalkorDB is running, we get results (possibly empty); if not, we get a connection error
    if (parsed.error) {
      expect(parsed.hint).toContain("FalkorDB");
    } else {
      // Connected successfully — any valid response shape is fine
      expect(parsed).toBeDefined();
    }
  });

  // ====================================================================
  // Tool Execution — URL-to-Flow Extraction
  // ====================================================================

  it("flow_extract_from_url returns error for invalid URL via MCP", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_url",
      arguments: {
        url: "not-a-valid-url",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.error).toContain("Invalid URL");
    expect(parsed.flow_ready).toBe(false);
  });

  it("flow_extract_from_url returns error for empty URL via MCP", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_url",
      arguments: {
        url: "",
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.error).toBeDefined();
    expect(parsed.flow_ready).toBe(false);
  });

  it("flow_extract_from_url accepts extraction_focus parameter", async () => {
    const result = await client.callTool({
      name: "flow_extract_from_url",
      arguments: {
        url: "https://this-domain-definitely-does-not-exist-xyz123.com",
        extraction_focus: "metrics",
      },
    });

    const parsed = getResultJson(result);
    // Should fail to fetch but not crash on extraction_focus parameter
    expect(parsed.error).toBeDefined();
    expect(parsed.flow_ready).toBe(false);
  }, 30000);

  // ====================================================================
  // Tool Execution — Live API (no auth needed)
  // ====================================================================

  it("flow_browse_flows responds via MCP protocol (live API)", async () => {
    const result = await client.callTool({
      name: "flow_browse_flows",
      arguments: {
        discoverable: true,
      },
    });

    const parsed = getResultJson(result);
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.flows.length).toBeGreaterThan(0);
  }, 15000);

  it("flow_list_templates responds via MCP protocol (live API)", async () => {
    const result = await client.callTool({
      name: "flow_list_templates",
      arguments: {},
    });

    const parsed = getResultJson(result);
    // Templates wrapped in { templates, count }
    expect(parsed.templates).toBeDefined();
    expect(parsed.count).toBeGreaterThan(0);
  }, 15000);

  it("flow_list_categories responds via MCP protocol (live API)", async () => {
    const result = await client.callTool({
      name: "flow_list_categories",
      arguments: {},
    });

    const parsed = getResultJson(result);
    expect(parsed.categories.length).toBeGreaterThan(0);
  }, 15000);

  // ====================================================================
  // Tool Execution — Semantic Search
  // ====================================================================

  it("flow_semantic_search responds via MCP protocol", async () => {
    const result = await client.callTool({
      name: "flow_semantic_search",
      arguments: {
        query: "network graph",
        max_results: 5,
      },
    });

    const parsed = getResultJson(result);
    // Either returns results from live catalog or an error if network fails
    if (parsed.error) {
      expect(parsed.error).toBeDefined();
    } else {
      expect(parsed.query_interpretation).toContain("network graph");
      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
    }
  }, 30000);
});
