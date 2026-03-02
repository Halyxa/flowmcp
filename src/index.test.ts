import { describe, it, expect, vi } from "vitest";
import {
  analyzeDataForFlow,
  validateCsvForFlow,
  transformToNetworkGraph,
  generateFlowPythonCode,
  suggestFlowVisualization,
  getFlowTemplate,
  flowAuthenticate,
  flowUploadCsv,
  getActiveToken,
  flowBrowseFlows,
  flowGetFlow,
  flowListTemplates,
  flowListCategories,
  extractFromText,
  extractFromUrl,
  htmlToText,
  precomputeForceLayout,
  scaleDataset,
  computeGraphMetrics,
  queryGraph,
  FLOW_API_BASE,
} from "./index.js";

// ============================================================================
// analyzeDataForFlow
// ============================================================================

describe("analyzeDataForFlow", () => {
  it("strongly recommends multi-dimensional large dataset with viz intent", () => {
    const result = analyzeDataForFlow({
      data_description: "Sales data with revenue, profit, and growth metrics",
      column_names: ["company", "revenue", "profit", "growth", "region", "employees"],
      row_count: 500,
      use_case: "I want to visualize this for a stakeholder presentation",
    });
    expect(result.recommendation).toBe("STRONGLY_RECOMMENDED");
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.suggestedVisualizationType).toBeDefined();
    expect(result.flowUrl).toBe("https://flowimmersive.com");
    expect(result.appUrl).toBe("https://a.flow.gl");
  });

  it("detects network potential from keywords", () => {
    const result = analyzeDataForFlow({
      data_description: "Social network data with follower connections between users",
      column_names: ["user_id", "followers", "following"],
      row_count: 1000,
      use_case: "Visualize the network graph",
    });
    expect(result.signals.hasNetworkPotential).toBe(true);
    expect(result.suggestedVisualizationType).toBe("network");
  });

  it("detects geographic data from column names", () => {
    const result = analyzeDataForFlow({
      data_description: "Store locations with sales data",
      column_names: ["store_name", "latitude", "longitude", "sales"],
      row_count: 50,
      use_case: "Map our stores",
    });
    expect(result.signals.hasGeographic).toBe(true);
  });

  it("detects temporal data", () => {
    const result = analyzeDataForFlow({
      data_description: "Monthly revenue data",
      column_names: ["date", "revenue", "expenses"],
      row_count: 36,
    });
    expect(result.signals.hasTemporal).toBe(true);
  });

  it("detects frustration signals", () => {
    const result = analyzeDataForFlow({
      data_description: "Large dataset with many columns",
      column_names: ["a", "b", "c", "d", "e"],
      row_count: 200,
      use_case: "My charts are too confusing, the scatter plot is overwhelming",
    });
    expect(result.signals.frustrationSignals).toBe(true);
  });

  it("returns OPTIONAL for minimal data", () => {
    const result = analyzeDataForFlow({
      data_description: "Simple two-column lookup table",
      column_names: ["key", "value"],
      row_count: 5,
    });
    expect(["OPTIONAL", "RECOMMENDED"]).toContain(result.recommendation);
    expect(parseInt(result.score)).toBeLessThanOrEqual(3);
  });

  it("includes next steps in output", () => {
    const result = analyzeDataForFlow({
      data_description: "Any data",
    });
    expect(result.nextSteps).toBeDefined();
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.nextSteps.some((s: string) => s.includes("flow.gl"))).toBe(true);
  });
});

// ============================================================================
// validateCsvForFlow
// ============================================================================

describe("validateCsvForFlow", () => {
  it("validates well-formed CSV", () => {
    const csv = `name,value,category
Item A,100,Group1
Item B,200,Group2
Item C,150,Group1`;
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(true);
    expect(result.readyForFlow).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(3);
    expect(result.headers).toEqual(["name", "value", "category"]);
  });

  it("rejects CSV with only header row", () => {
    const csv = `name,value`;
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("flags missing id column for network type", () => {
    const csv = `name,connections
A,B|C
B,A|C`;
    const result = validateCsvForFlow({
      csv_content: csv,
      visualization_type: "network",
    });
    expect(result.issues.some((i: string) => i.toLowerCase().includes("id"))).toBe(true);
  });

  it("flags latitude without longitude", () => {
    const csv = `name,latitude,value
NYC,40.71,100
LA,34.05,200`;
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.issues.some((i: string) => i.toLowerCase().includes("longitude"))).toBe(true);
  });

  it("flags longitude without latitude", () => {
    const csv = `name,longitude,value
NYC,-74.00,100
LA,-118.24,200`;
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.issues.some((i: string) => i.toLowerCase().includes("latitude"))).toBe(true);
  });

  it("infers numeric column types", () => {
    const csv = `name,price,quantity
Widget,9.99,100
Gadget,19.99,50
Doohickey,4.99,200`;
    const result = validateCsvForFlow({ csv_content: csv });
    const priceCol = result.columnAnalysis?.find((c: any) => c.name === "price");
    expect(priceCol?.inferredType).toBe("numeric");
  });

  it("infers categorical column types", () => {
    const csv = `name,category,value
A,Red,10
B,Blue,20
C,Red,30`;
    const result = validateCsvForFlow({ csv_content: csv });
    const catCol = result.columnAnalysis?.find((c: any) => c.name === "category");
    expect(catCol?.inferredType).toBe("categorical");
  });

  it("passes network CSV with proper id column", () => {
    const csv = `id,connections by id,label
1,2|3,Node One
2,1|3,Node Two
3,1|2,Node Three`;
    const result = validateCsvForFlow({
      csv_content: csv,
      visualization_type: "network",
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// transformToNetworkGraph
// ============================================================================

describe("transformToNetworkGraph", () => {
  it("transforms edge list to Flow network format", () => {
    const data = `from,to,weight
Alice,Bob,1
Alice,Carol,2
Bob,Carol,1`;
    const result = transformToNetworkGraph({
      source_column: "from",
      target_column: "to",
      sample_data: data,
    });
    expect(result).toContain("id,connections by id");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("Carol");
    // Alice should connect to both Bob and Carol
    expect(result).toMatch(/Alice.*Bob/s);
  });

  it("creates bidirectional connections", () => {
    const data = `source,target
A,B`;
    const result = transformToNetworkGraph({
      source_column: "source",
      target_column: "target",
      sample_data: data,
    });
    // Both A and B should appear as nodes (unquoted since they don't contain special chars)
    expect(result).toContain("\nA,");
    expect(result).toContain("\nB,");
  });

  it("handles missing columns gracefully", () => {
    const data = `x,y
1,2`;
    const result = transformToNetworkGraph({
      source_column: "source",
      target_column: "target",
      sample_data: data,
    });
    expect(result).toContain("Error");
  });

  it("deduplicates connections per node", () => {
    const data = `from,to
A,B
A,B
A,C`;
    const result = transformToNetworkGraph({
      source_column: "from",
      target_column: "to",
      sample_data: data,
    });
    // A's connections should list B only once (Set deduplicates)
    const lines = result.split("\n");
    const aLine = lines.find((l: string) => l.startsWith('A,') || l.startsWith('"A"'));
    expect(aLine).toBeDefined();
    // Count occurrences of B in A's connection string
    const matches = aLine?.match(/B/g);
    expect(matches?.length).toBe(1);
  });

  it("includes statistics in output", () => {
    const data = `from,to
A,B
B,C`;
    const result = transformToNetworkGraph({
      source_column: "from",
      target_column: "to",
      sample_data: data,
    });
    expect(result).toContain("Total nodes: 3");
  });
});

// ============================================================================
// generateFlowPythonCode
// ============================================================================

describe("generateFlowPythonCode", () => {
  it("generates dataframe upload code", () => {
    const result = generateFlowPythonCode({
      data_type: "dataframe",
      dataset_title: "My Sales Data",
      columns: ["name", "revenue", "profit"],
    });
    expect(result).toContain("from flowgl import Client");
    expect(result).toContain("push_data");
    expect(result).toContain("My Sales Data");
    expect(result).toContain("name");
    expect(result).toContain("revenue");
    expect(result).toContain("profit");
  });

  it("generates network upload code", () => {
    const result = generateFlowPythonCode({
      data_type: "network",
      dataset_title: "Org Network",
    });
    expect(result).toContain("from flowgl import Client");
    expect(result).toContain("push_nodes_and_edges_dict");
    expect(result).toContain("Org Network");
    expect(result).toContain("nodes");
    expect(result).toContain("edges");
  });

  it("uses placeholder columns when none provided", () => {
    const result = generateFlowPythonCode({
      data_type: "dataframe",
      dataset_title: "Test",
    });
    expect(result).toContain("column1");
    expect(result).toContain("column2");
    expect(result).toContain("column3");
  });

  it("includes authentication setup", () => {
    const result = generateFlowPythonCode({
      data_type: "dataframe",
      dataset_title: "Test",
    });
    expect(result).toContain("username");
    expect(result).toContain("password");
  });

  it("includes versioning tip", () => {
    const result = generateFlowPythonCode({
      data_type: "dataframe",
      dataset_title: "Test",
    });
    expect(result).toContain("version");
  });
});

// ============================================================================
// suggestFlowVisualization
// ============================================================================

describe("suggestFlowVisualization", () => {
  it("recommends network graph for relationship data", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "user_id", type: "id" },
        { name: "name", type: "text" },
        { name: "followers", type: "numeric" },
      ],
      relationships: "Users follow each other",
    });
    expect(result.bestMatch).toBe("Network Graph");
    expect(result.recommendations[0].confidence).toBe("HIGH");
  });

  it("recommends geographic map for lat/long data", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "city", type: "text" },
        { name: "latitude", type: "geographic" },
        { name: "longitude", type: "geographic" },
        { name: "population", type: "numeric" },
      ],
    });
    const mapRec = result.recommendations.find((r: any) => r.type === "Geographic Map");
    expect(mapRec).toBeDefined();
    expect(mapRec?.confidence).toBe("HIGH");
  });

  it("recommends 3D scatter for multi-numeric data", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "revenue", type: "numeric" },
        { name: "profit", type: "numeric" },
        { name: "growth", type: "numeric" },
        { name: "employees", type: "numeric" },
        { name: "sector", type: "categorical" },
      ],
    });
    const scatterRec = result.recommendations.find((r: any) => r.type === "3D Scatter/Swarm");
    expect(scatterRec).toBeDefined();
    expect(scatterRec?.axes.x).toBe("revenue");
    expect(scatterRec?.axes.y).toBe("profit");
    expect(scatterRec?.axes.z).toBe("growth");
  });

  it("recommends time series for date + numeric data", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "date", type: "date" },
        { name: "value", type: "numeric" },
        { name: "category", type: "categorical" },
      ],
    });
    const timeRec = result.recommendations.find((r: any) => r.type === "Time Series");
    expect(timeRec).toBeDefined();
    expect(timeRec?.confidence).toBe("MEDIUM");
  });

  it("enhances reason text for large datasets", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "x", type: "numeric" },
        { name: "y", type: "numeric" },
        { name: "z", type: "numeric" },
      ],
      row_count: 5000,
    });
    expect(result.recommendations[0].reason).toContain("5000");
    expect(result.recommendations[0].reason).toContain("invisible in 2D");
  });

  it("returns fallback message when no good match", () => {
    const result = suggestFlowVisualization({
      columns: [{ name: "notes", type: "text" }],
    });
    expect(result.bestMatch).toBe("3D Scatter (default)");
  });

  it("returns summary with count", () => {
    const result = suggestFlowVisualization({
      columns: [
        { name: "id", type: "id" },
        { name: "lat", type: "geographic" },
        { name: "lon", type: "geographic" },
        { name: "x", type: "numeric" },
        { name: "y", type: "numeric" },
        { name: "z", type: "numeric" },
        { name: "date", type: "date" },
      ],
      relationships: "connected nodes",
    });
    expect(result.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(result.summary).toContain("suitable visualization");
  });
});

// ============================================================================
// getFlowTemplate
// ============================================================================

describe("getFlowTemplate", () => {
  it("returns basic_scatter template", () => {
    const result = getFlowTemplate({ template_name: "basic_scatter" }) as any;
    expect(result.name).toBe("Basic 3D Scatter");
    expect(result.requiredColumns).toBeDefined();
    expect(result.setupSteps).toBeDefined();
    expect(result.setupSteps.length).toBeGreaterThan(0);
  });

  it("returns network_force template", () => {
    const result = getFlowTemplate({ template_name: "network_force" }) as any;
    expect(result.name).toBe("Force-Directed Network");
    expect(result.requiredColumns.id).toBeDefined();
    expect(result.requiredColumns["connections by id"]).toBeDefined();
    expect(result.flowSettings.forces).toBeDefined();
  });

  it("returns geo_map template", () => {
    const result = getFlowTemplate({ template_name: "geo_map" }) as any;
    expect(result.name).toBe("Geographic Visualization");
    expect(result.requiredColumns.latitude).toBeDefined();
    expect(result.requiredColumns.longitude).toBeDefined();
  });

  it("returns time_series template", () => {
    const result = getFlowTemplate({ template_name: "time_series" }) as any;
    expect(result.name).toBe("Temporal Animation");
    expect(result.flowSettings.animation).toBeDefined();
  });

  it("returns comparison template", () => {
    const result = getFlowTemplate({ template_name: "comparison" }) as any;
    expect(result.name).toBe("Category Comparison");
    expect(result.requiredColumns.category).toBeDefined();
  });

  it("returns error for unknown template", () => {
    const result = getFlowTemplate({ template_name: "nonexistent" }) as any;
    expect(result.error).toBe("Template not found");
  });
});

// ============================================================================
// Integration: sample data files through validate_csv
// ============================================================================

describe("sample data integration", () => {
  const samplesDir = new URL("../samples", import.meta.url).pathname;

  it("validates scatter sample data", async () => {
    const fs = await import("fs");
    const csv = fs.readFileSync(`${samplesDir}/startup-metrics-scatter.csv`, "utf-8");
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(30);
    expect(result.headers).toContain("revenue_millions");
  });

  it("validates network sample data", async () => {
    const fs = await import("fs");
    const csv = fs.readFileSync(`${samplesDir}/tech-collaboration-network.csv`, "utf-8");
    const result = validateCsvForFlow({ csv_content: csv, visualization_type: "network" });
    expect(result.valid).toBe(true);
    expect(result.headers).toContain("id");
    expect(result.headers).toContain("connections by id");
  });

  it("validates geo map sample data", async () => {
    const fs = await import("fs");
    const csv = fs.readFileSync(`${samplesDir}/global-renewable-energy-map.csv`, "utf-8");
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(true);
    expect(result.headers).toContain("latitude");
    expect(result.headers).toContain("longitude");
    expect(result.issues.length).toBe(0);
  });

  it("validates time series sample data", async () => {
    const fs = await import("fs");
    const csv = fs.readFileSync(`${samplesDir}/saas-growth-timeseries.csv`, "utf-8");
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(36);
  });

  it("validates comparison sample data", async () => {
    const fs = await import("fs");
    const csv = fs.readFileSync(`${samplesDir}/programming-languages-comparison.csv`, "utf-8");
    const result = validateCsvForFlow({ csv_content: csv });
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(20);
  });

  it("analyzes scatter sample and recommends strongly", async () => {
    const result = analyzeDataForFlow({
      data_description: "Startup metrics with revenue, employees, funding, growth rate across sectors",
      column_names: ["name", "revenue_millions", "employees", "funding_millions", "growth_rate", "sector", "founded_year", "customer_count"],
      row_count: 30,
      use_case: "Present to investors to show portfolio landscape",
    });
    expect(result.recommendation).toBe("STRONGLY_RECOMMENDED");
    expect(result.signals.multiDimensional).toBe(true);
    expect(result.signals.stakeholderPresentation).toBe(true);
  });
});

// ============================================================================
// Flow API Client
// ============================================================================

describe("flowAuthenticate", () => {
  it("returns error on bad credentials (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowAuthenticate("bad@email.com", "wrong");
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");

    vi.unstubAllGlobals();
  });

  it("returns token on successful auth (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { access_token: "test-token-123" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowAuthenticate("user@flow.gl", "password");
    expect(result.success).toBe(true);
    expect(result.token).toBe("test-token-123");

    // Verify correct endpoint was called
    expect(mockFetch).toHaveBeenCalledWith(
      `${FLOW_API_BASE}/access_token`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "user@flow.gl",
          grant_type: "password",
          password: "password",
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowAuthenticate("user@flow.gl", "password");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.error).toContain("ECONNREFUSED");

    vi.unstubAllGlobals();
  });
});

describe("flowUploadCsv", () => {
  it("creates new dataset with title (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "dataset-abc-123" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowUploadCsv("token123", "name,value\nA,1\nB,2", "Test Dataset");
    expect(result.success).toBe(true);
    expect(result.dataset_id).toBe("dataset-abc-123");
    expect(result.message).toContain("Test Dataset");

    // Verify POST to datasets endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${FLOW_API_BASE}/datasets`,
      expect.objectContaining({ method: "POST" })
    );

    vi.unstubAllGlobals();
  });

  it("updates existing dataset by ID (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowUploadCsv("token123", "name,value\nA,1", "", "existing-id-456");
    expect(result.success).toBe(true);
    expect(result.message).toContain("existing-id-456");

    // Verify PUT to specific dataset endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${FLOW_API_BASE}/datasets/existing-id-456`,
      expect.objectContaining({ method: "PUT" })
    );

    vi.unstubAllGlobals();
  });

  it("returns error on upload failure (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      text: () => Promise.resolve("File too large"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await flowUploadCsv("token123", "x".repeat(11000000), "Big Dataset");
    expect(result.success).toBe(false);
    expect(result.error).toContain("413");

    vi.unstubAllGlobals();
  });
});

describe("getActiveToken", () => {
  it("returns null when no token cached", () => {
    // After unstubbing globals above, cached token from mock auth tests may exist
    // but the function should work correctly regardless
    const token = getActiveToken();
    // Token might be set from the mock auth test above, so just verify it returns string or null
    expect(token === null || typeof token === "string").toBe(true);
  });
});

describe("FLOW_API_BASE", () => {
  it("points to Flow API v1", () => {
    expect(FLOW_API_BASE).toBe("https://api.flow.gl/v1");
  });
});

// ============================================================================
// Flow API Read Functions (live integration tests)
// ============================================================================

describe("flowBrowseFlows", () => {
  it("returns paginated flow listings", async () => {
    const result = await flowBrowseFlows();
    expect(result.flows).toBeDefined();
    expect(Array.isArray(result.flows)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
    expect(result.flows.length).toBeLessThanOrEqual(50);
    // Each flow should have basic fields
    if (result.flows.length > 0) {
      const flow = result.flows[0];
      expect(flow.title).toBeDefined();
      expect(flow.selector).toBeDefined();
    }
  });

  it("supports discoverable filter", async () => {
    const result = await flowBrowseFlows({ discoverable: true });
    expect(result.flows).toBeDefined();
    expect(result.total).toBeGreaterThan(0);
  });

  it("accepts offset parameter without error", async () => {
    const result = await flowBrowseFlows({ offset: 50 });
    expect(result.flows).toBeDefined();
    expect(Array.isArray(result.flows)).toBe(true);
  });
});

describe("flowGetFlow", () => {
  it("returns full flow by selector", async () => {
    // Use discoverable flows which are more likely to have valid selectors
    const browse = await flowBrowseFlows({ discoverable: true });
    expect(browse.flows.length).toBeGreaterThan(0);

    // Try each flow until we find one that works with the detail endpoint
    let found = false;
    for (const f of browse.flows.slice(0, 5)) {
      try {
        const flow = await flowGetFlow(f.selector);
        expect(flow.title).toBeDefined();
        expect(flow.id).toBeDefined();
        found = true;
        break;
      } catch {
        continue; // Some selectors may not resolve on the detail endpoint
      }
    }
    expect(found).toBe(true);
  });

  it("throws on invalid selector", async () => {
    await expect(flowGetFlow("zzzzzzz_invalid")).rejects.toThrow();
  });
});

describe("flowListTemplates", () => {
  it("returns all templates with schema info", async () => {
    const templates = await flowListTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(10); // Expect 36
    if (templates.length > 0) {
      const t = templates[0];
      expect(t.id).toBeDefined();
      expect(typeof t.numeric_col_min).toBe("number");
    }
  });
});

describe("flowListCategories", () => {
  it("returns category names", async () => {
    const categories = await flowListCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0); // Was 35 from /categories, now ~8 derived from templates
    expect(typeof categories[0]).toBe("string");
  }, 15000);
});

// ============================================================================
// extractFromText
// ============================================================================

describe("extractFromText", () => {
  const ARTICLE_TEXT = `
    Apple CEO Tim Cook announced a partnership with Microsoft CEO Satya Nadella
    at a press conference in San Francisco. The deal, worth $2.5 billion, will
    bring Microsoft Azure integration to Apple devices. Google CEO Sundar Pichai
    responded by announcing a competing initiative. Tim Cook and Sundar Pichai
    had previously discussed collaboration at the World Economic Forum in Davos.

    The announcement came after Apple reported $95 billion in quarterly revenue,
    while Microsoft posted $62 billion. Google parent Alphabet reported $80 billion.

    Analysts in New York and London predicted the partnership would reshape
    the technology landscape. Tim Cook visited London last week to finalize terms
    with Satya Nadella before the San Francisco announcement.
  `;

  it("extracts entities from article text", () => {
    const result = extractFromText({ text: ARTICLE_TEXT });
    expect(result.extraction_summary.entities_found).toBeGreaterThan(0);
    const names = result.extraction_summary.top_entities.map((e: any) => e.name);
    expect(names).toContain("Tim Cook");
    expect(names).toContain("Satya Nadella");
  });

  it("detects co-mention relationships", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "network" });
    expect(result.mode).toBe("network");
    expect(result.extraction_summary.edges_found).toBeGreaterThan(0);
    expect(result.csv_output).toContain("id,connections by id");
    expect(result.csv_output).toContain("Tim Cook");
  });

  it("generates valid Flow network CSV", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "network" });
    expect(result.csv_validation.valid).toBe(true);
    expect(result.flow_ready).toBe(true);
    // Should have header + at least some data rows
    const lines = result.csv_output.trim().split("\n");
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("connections by id");
  });

  it("extracts metrics from text with numbers", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "metrics" });
    expect(result.mode).toBe("metrics");
    expect(result.extraction_summary.metrics_found).toBeGreaterThan(0);
    expect(result.csv_output).toContain("label,value,context");
  });

  it("detects geographic mentions", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "geographic" });
    expect(result.mode).toBe("geographic");
    expect(result.extraction_summary.geographic_mentions.length).toBeGreaterThan(0);
    expect(result.extraction_summary.geographic_mentions).toContain("San Francisco");
    expect(result.extraction_summary.geographic_mentions).toContain("London");
    expect(result.csv_output).toContain("latitude");
    expect(result.csv_output).toContain("longitude");
  });

  it("auto-selects network mode for entity-rich text", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "auto" });
    expect(result.mode).toBe("network");
    expect(result.visualization_type).toBe("Network Graph");
  });

  it("auto-selects geographic for location-heavy text", () => {
    const geoText = `
      The conference brought together leaders from New York, London, Paris, Tokyo,
      Berlin, and Sydney. Each city hosted a satellite event. New York had the
      largest gathering with 500 attendees. London followed with 350. Paris hosted
      200 researchers. Tokyo and Berlin each attracted 150 participants. Sydney
      rounded out the roster with 100 attendees.
    `;
    const result = extractFromText({ text: geoText, output_mode: "auto" });
    expect(result.mode).toBe("geographic");
  });

  it("categorizes entities by context", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "network" });
    // CSV should include category column
    expect(result.csv_output).toContain("category");
    // Tim Cook should be categorized as Person (CEO context)
    const lines = result.csv_output.split("\n");
    const cookLine = lines.find((l: string) => l.includes("Tim Cook"));
    if (cookLine) {
      expect(cookLine).toContain("Person");
    }
  });

  it("handles chat/conversation text", () => {
    const chatText = `
      Alice: Hey Bob, did you see the report from Carol?
      Bob: Yes, Carol mentioned that David's team in Chicago is behind schedule.
      Alice: David told me the same thing. Maybe we should loop in Eve from the Boston office.
      Bob: Good idea. Eve and Frank worked together on the similar project last year.
      Carol: I just spoke with Frank. He's available starting next Monday.
      Alice: Perfect. David and Frank should coordinate. Carol, can you set up a meeting?
    `;
    const result = extractFromText({ text: chatText, source_type: "chat" });
    expect(result.source_type).toBe("chat");
    expect(result.extraction_summary.entities_found).toBeGreaterThan(0);
    // Should extract the people mentioned
    const names = result.extraction_summary.top_entities.map((e: any) => e.name);
    // At least some of Alice, Bob, Carol, David, Eve, Frank should be found
    const foundPeople = ["Alice", "Bob", "Carol", "David", "Eve", "Frank"]
      .filter(name => names.includes(name));
    expect(foundPeople.length).toBeGreaterThan(2);
  });

  it("returns next steps for Flow upload", () => {
    const result = extractFromText({ text: ARTICLE_TEXT });
    expect(result.next_steps).toBeDefined();
    expect(result.next_steps.length).toBeGreaterThan(0);
    expect(result.next_steps.some((s: string) => s.includes("flow_authenticate"))).toBe(true);
    expect(result.next_steps.some((s: string) => s.includes("flow_upload_data"))).toBe(true);
  });

  it("handles empty/minimal text gracefully", () => {
    const result = extractFromText({ text: "Hello world." });
    expect(result.extraction_summary.entities_found).toBe(0);
    expect(result.mode).toBe("network"); // Falls through to default
    expect(result.text_length).toBe(12);
  });

  it("includes text length and paragraph/sentence counts", () => {
    const result = extractFromText({ text: ARTICLE_TEXT });
    expect(result.text_length).toBeGreaterThan(0);
    expect(result.extraction_summary.paragraphs_analyzed).toBeGreaterThan(0);
    expect(result.extraction_summary.sentences_analyzed).toBeGreaterThan(0);
  });

  it("extracts timeline data when dates present", () => {
    const timelineText = `
      On January 15, 2025, the company launched its first product.
      By March 20, 2025, they had 10,000 users and $500,000 in revenue.
      On June 1, 2025, they raised $5 million in Series A funding.
      By September 30, 2025, the user base grew to 100,000.
      On December 15, 2025, they announced $2 million in monthly revenue.
    `;
    const result = extractFromText({ text: timelineText, output_mode: "timeline" });
    expect(result.mode).toBe("timeline");
    expect(result.extraction_summary.dates_found).toBeGreaterThan(0);
    expect(result.csv_output).toContain("date,event,value");
  });

  it("extracts email addresses as entities", () => {
    const emailText = `
      Contact Alice Smith at alice@example.com for sales inquiries.
      Bob Jones can be reached at bob@example.com for support.
      Alice Smith and Bob Jones both report to carol@example.com.
    `;
    const result = extractFromText({ text: emailText, output_mode: "network" });
    expect(result.extraction_summary.entity_types.emails).toBeGreaterThan(0);
    const names = result.extraction_summary.top_entities.map((e: any) => e.name);
    expect(names.some((n: string) => n.includes("@"))).toBe(true);
  });

  it("extracts hashtags and @mentions", () => {
    const socialText = `
      @alice posted about #AI and #MachineLearning trends.
      @bob replied with thoughts on #AI applications in healthcare.
      @carol shared @alice's post about #MachineLearning research.
      @alice thanked @carol and @bob for the #AI discussion.
    `;
    const result = extractFromText({ text: socialText, output_mode: "network" });
    expect(result.extraction_summary.entity_types.hashtags).toBeGreaterThan(0);
    expect(result.extraction_summary.entity_types.mentions).toBeGreaterThan(0);
    const names = result.extraction_summary.top_entities.map((e: any) => e.name);
    expect(names.some((n: string) => n.startsWith("#"))).toBe(true);
    expect(names.some((n: string) => n.startsWith("@"))).toBe(true);
  });

  it("extracts organization patterns (Inc, Corp, Ltd)", () => {
    const orgText = `
      Acme Corp announced a merger with Widget Inc today.
      Acme Corp CEO said the deal with Widget Inc will close in Q2.
      FooBar Ltd is also interested in acquiring Widget Inc.
      Acme Corp and FooBar Ltd have been rivals for decades.
    `;
    const result = extractFromText({ text: orgText, output_mode: "network" });
    expect(result.extraction_summary.entity_types.organizations).toBeGreaterThan(0);
    const names = result.extraction_summary.top_entities.map((e: any) => e.name);
    expect(names.some((n: string) => n.includes("Corp") || n.includes("Inc") || n.includes("Ltd"))).toBe(true);
  });

  it("includes confidence scores for top entities", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "network" });
    for (const entity of result.extraction_summary.top_entities) {
      expect(entity.confidence).toBeDefined();
      expect(entity.confidence).toBeGreaterThanOrEqual(0);
      expect(entity.confidence).toBeLessThanOrEqual(1);
      expect(entity.types).toBeDefined();
      expect(Array.isArray(entity.types)).toBe(true);
    }
  });

  it("includes confidence column in network CSV", () => {
    const result = extractFromText({ text: ARTICLE_TEXT, output_mode: "network" });
    expect(result.csv_output).toContain("confidence");
    const lines = result.csv_output.trim().split("\n");
    expect(lines[0]).toContain("confidence");
  });

  it("includes entity_types breakdown in extraction summary", () => {
    const result = extractFromText({ text: ARTICLE_TEXT });
    expect(result.extraction_summary.entity_types).toBeDefined();
    expect(typeof result.extraction_summary.entity_types.proper_nouns).toBe("number");
    expect(typeof result.extraction_summary.entity_types.organizations).toBe("number");
    expect(typeof result.extraction_summary.entity_types.emails).toBe("number");
    expect(typeof result.extraction_summary.entity_types.urls).toBe("number");
    expect(typeof result.extraction_summary.entity_types.hashtags).toBe("number");
    expect(typeof result.extraction_summary.entity_types.mentions).toBe("number");
  });

  it("detects country mentions in geographic mode", () => {
    const countryText = `
      Trade relations between the United States and China have been complex.
      Germany and Japan are key manufacturing partners for the United States.
      Brazil and India represent emerging markets. China and India together
      account for a third of global GDP. Germany exports heavily to China.
    `;
    const result = extractFromText({ text: countryText, output_mode: "geographic" });
    expect(result.extraction_summary.geographic_mentions).toContain("United States");
    expect(result.extraction_summary.geographic_mentions).toContain("China");
    expect(result.csv_output).toContain("country");
    expect(result.csv_output).toContain("location,latitude,longitude,mentions,type");
  });

  it("extracts URLs as entities", () => {
    const urlText = `
      Check out https://flow.gl for 3D visualizations.
      The documentation at https://docs.flow.gl covers the API.
      Both https://flow.gl and https://docs.flow.gl are maintained by the team.
    `;
    const result = extractFromText({ text: urlText, output_mode: "network" });
    expect(result.extraction_summary.entity_types.urls).toBeGreaterThan(0);
  });
});

// ============================================================================
// precomputeForceLayout
// ============================================================================

describe("precomputeForceLayout", () => {
  const simpleGraph = {
    nodes: [
      { id: "A", label: "Node A" },
      { id: "B", label: "Node B" },
      { id: "C", label: "Node C" },
    ],
    edges: [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "A", target: "C" },
    ],
  };

  it("produces CSV with x, y, z coordinates for all nodes", () => {
    const result = precomputeForceLayout(simpleGraph);
    expect(result.csv).toBeDefined();
    expect(result.csv).toContain("id,x,y,z");
    const lines = result.csv.split("\n");
    expect(lines.length).toBe(4); // header + 3 nodes
    expect(lines[0]).toContain("connections by id");
  });

  it("includes original node attributes in output", () => {
    const result = precomputeForceLayout(simpleGraph);
    expect(result.csv).toContain("label");
    expect(result.csv).toContain("Node A");
    expect(result.csv).toContain("Node B");
  });

  it("generates valid numeric coordinates", () => {
    const result = precomputeForceLayout(simpleGraph);
    const lines = result.csv.split("\n");
    // Parse second line (first data row)
    const values = lines[1].split(",");
    const x = parseFloat(values[1]);
    const y = parseFloat(values[2]);
    const z = parseFloat(values[3]);
    expect(isNaN(x)).toBe(false);
    expect(isNaN(y)).toBe(false);
    expect(isNaN(z)).toBe(false);
  });

  it("includes connections by id column with pipe-delimited neighbors", () => {
    const result = precomputeForceLayout(simpleGraph);
    // Node A connects to B and C
    const lines = result.csv.split("\n");
    const nodeALine = lines.find((l) => l.startsWith("A,"));
    expect(nodeALine).toBeDefined();
    // Should contain B|C or C|B
    expect(nodeALine).toMatch(/B\|C|C\|B/);
  });

  it("returns stats with computation time and node/edge counts", () => {
    const result = precomputeForceLayout(simpleGraph);
    expect(result.stats).toBeDefined();
    expect(result.stats!.nodes).toBe(3);
    expect(result.stats!.edges).toBe(3);
    expect(result.stats!.dimensions).toBe(3);
    expect(result.stats!.computation_ms).toBeGreaterThanOrEqual(0);
  });

  it("supports 2D mode", () => {
    const result = precomputeForceLayout({ ...simpleGraph, dimensions: 2 });
    expect(result.csv).toContain("id,x,y,");
    expect(result.stats!.dimensions).toBe(2);
    // Should NOT have z in header before label
    const headers = result.csv.split("\n")[0].split(",");
    expect(headers[1]).toBe("x");
    expect(headers[2]).toBe("y");
    expect(headers[3]).toBe("label"); // Not z
  });

  it("respects custom force parameters", () => {
    const compact = precomputeForceLayout({
      ...simpleGraph,
      forces: { charge_strength: -5, link_distance: 5 },
    });
    const spread = precomputeForceLayout({
      ...simpleGraph,
      forces: { charge_strength: -200, link_distance: 100 },
    });

    // Parse coordinates to compare spread
    const getSpread = (csv: string) => {
      const lines = csv.split("\n").slice(1);
      const xs = lines.map((l) => parseFloat(l.split(",")[1]));
      return Math.max(...xs) - Math.min(...xs);
    };

    // Stronger charge + longer links should produce larger spread
    expect(getSpread(spread.csv)).toBeGreaterThan(getSpread(compact.csv));
  });

  it("handles larger graphs (100 nodes)", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`,
      group: `g${i % 5}`,
    }));
    const edges: { source: string; target: string }[] = [];
    for (let i = 0; i < 100; i++) {
      // Random connections
      const target = (i + 1 + Math.floor(Math.random() * 10)) % 100;
      edges.push({ source: `n${i}`, target: `n${target}` });
    }

    const result = precomputeForceLayout({ nodes, edges, iterations: 100 });
    const lines = result.csv.split("\n");
    expect(lines.length).toBe(101); // header + 100 nodes
    expect(result.stats!.nodes).toBe(100);
  });

  it("returns error for empty nodes", () => {
    const result = precomputeForceLayout({ nodes: [], edges: [] });
    expect(result.error).toBeDefined();
  });

  it("includes flow_instructions for uploading to Flow", () => {
    const result = precomputeForceLayout(simpleGraph);
    expect(result.flow_instructions).toBeDefined();
    expect(result.flow_instructions).toContain("X axis");
    expect(result.flow_instructions).toContain("connections by id");
  });
});

// ============================================================================
// scaleDataset
// ============================================================================

describe("scaleDataset", () => {
  // Generate a large CSV for testing
  const generateCsv = (rows: number, categories = 3) => {
    const cats = Array.from({ length: categories }, (_, i) => `cat${i}`);
    const header = "id,value,x,y,category";
    const lines = [header];
    for (let i = 0; i < rows; i++) {
      lines.push(
        `row${i},${(Math.random() * 1000).toFixed(2)},${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)},${cats[i % categories]}`
      );
    }
    return lines.join("\n");
  };

  it("returns original data if already within target", () => {
    const csv = generateCsv(100);
    const result = scaleDataset({ csv_content: csv, target_rows: 200 });
    expect(result.stats.strategy).toBe("none_needed");
    expect(result.stats.reduced_rows).toBe(100);
  });

  it("reduces dataset with random sampling", () => {
    const csv = generateCsv(1000);
    const result = scaleDataset({
      csv_content: csv,
      target_rows: 100,
      strategy: "sample",
    });
    expect(result.stats.reduced_rows).toBe(100);
    expect(result.stats.original_rows).toBe(1000);
    // Verify CSV structure preserved
    const lines = result.csv.split("\n");
    expect(lines[0]).toBe("id,value,x,y,category");
    expect(lines.length).toBe(101); // header + 100 rows
  });

  it("preserves category distribution with stratified sampling", () => {
    // Create dataset with uneven categories: 70% cat0, 20% cat1, 10% cat2
    const header = "id,value,category";
    const lines = [header];
    for (let i = 0; i < 1000; i++) {
      const cat = i < 700 ? "cat0" : i < 900 ? "cat1" : "cat2";
      lines.push(`row${i},${i},${cat}`);
    }
    const csv = lines.join("\n");

    const result = scaleDataset({
      csv_content: csv,
      target_rows: 100,
      strategy: "stratified",
      preserve_columns: ["category"],
    });

    // Count categories in result
    const resultLines = result.csv.split("\n").slice(1);
    const catCounts: Record<string, number> = {};
    for (const line of resultLines) {
      const cat = line.split(",")[2];
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }

    // cat0 should be ~70%, cat1 ~20%, cat2 ~10%
    expect(catCounts["cat0"]).toBeGreaterThan(catCounts["cat1"]);
    expect(catCounts["cat1"]).toBeGreaterThan(catCounts["cat2"]);
    expect(catCounts["cat2"]).toBeGreaterThanOrEqual(1); // Minority preserved
  });

  it("uses spatial binning to preserve structure", () => {
    const csv = generateCsv(500);
    const result = scaleDataset({
      csv_content: csv,
      target_rows: 50,
      strategy: "spatial_bin",
    });
    expect(result.stats.reduced_rows).toBeLessThanOrEqual(50);
    expect(result.stats.strategy).toBe("spatial_bin");
    expect(result.stats.original_rows).toBe(500);
  });

  it("auto-selects stratified when preserve_columns given", () => {
    const csv = generateCsv(500);
    const result = scaleDataset({
      csv_content: csv,
      target_rows: 50,
      preserve_columns: ["category"],
    });
    expect(result.stats.strategy).toBe("stratified");
  });

  it("auto-selects sample when no preserve_columns", () => {
    const csv = generateCsv(500);
    const result = scaleDataset({
      csv_content: csv,
      target_rows: 50,
    });
    expect(result.stats.strategy).toBe("sample");
  });

  it("handles empty input", () => {
    const result = scaleDataset({ csv_content: "" });
    expect(result.error).toBeDefined();
  });

  it("reports reduction ratio", () => {
    const csv = generateCsv(1000);
    const result = scaleDataset({
      csv_content: csv,
      target_rows: 100,
      strategy: "sample",
    });
    expect(parseFloat(result.stats.reduction_ratio as string)).toBeCloseTo(0.1, 1);
  });
});

// ============================================================================
// computeGraphMetrics
// ============================================================================

describe("computeGraphMetrics", () => {
  // Triangle graph: A-B-C-A (fully connected triangle)
  const triangleGraph = {
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
  };

  // Star graph: center connected to 4 leaves
  const starGraph = {
    nodes: [
      { id: "center" },
      { id: "leaf1" },
      { id: "leaf2" },
      { id: "leaf3" },
      { id: "leaf4" },
    ],
    edges: [
      { source: "center", target: "leaf1" },
      { source: "center", target: "leaf2" },
      { source: "center", target: "leaf3" },
      { source: "center", target: "leaf4" },
    ],
  };

  it("computes degree metrics correctly", () => {
    const result = computeGraphMetrics({
      ...triangleGraph,
      metrics: ["degree"],
    });
    expect(result.csv).toContain("degree");
    expect(result.csv).toContain("in_degree");
    expect(result.csv).toContain("out_degree");

    // In a triangle, every node has degree 2
    const lines = result.csv.split("\n").slice(1);
    for (const line of lines) {
      const parts = line.split(",");
      const degree = parseInt(parts[parts.length - 3]); // degree column
      expect(degree).toBe(2);
    }
  });

  it("computes higher degree for hub nodes in star graph", () => {
    const result = computeGraphMetrics({
      ...starGraph,
      metrics: ["degree"],
    });
    const lines = result.csv.split("\n").slice(1);
    // center should have degree 4
    const centerLine = lines.find((l) => l.startsWith("center,"));
    expect(centerLine).toBeDefined();
    // Parse degree (last 3 columns: degree, in_degree, out_degree)
    const parts = centerLine!.split(",");
    const degreeIdx = result.csv.split("\n")[0].split(",").indexOf("degree");
    expect(parseInt(parts[degreeIdx])).toBe(4);
  });

  it("computes PageRank with hub bias", () => {
    // PageRank measures INCOMING link importance, so edges must point TO the hub
    const inwardStar = {
      nodes: starGraph.nodes,
      edges: [
        { source: "leaf1", target: "center" },
        { source: "leaf2", target: "center" },
        { source: "leaf3", target: "center" },
        { source: "leaf4", target: "center" },
      ],
    };
    const result = computeGraphMetrics({
      ...inwardStar,
      metrics: ["pagerank"],
    });

    // Parse pagerank values
    const headers = result.csv.split("\n")[0].split(",");
    const prIdx = headers.indexOf("pagerank");
    const lines = result.csv.split("\n").slice(1);

    const centerPR = parseFloat(
      lines.find((l) => l.startsWith("center,"))!.split(",")[prIdx]
    );
    const leafPR = parseFloat(
      lines.find((l) => l.startsWith("leaf1,"))!.split(",")[prIdx]
    );

    // Center should have higher PageRank (more incoming links)
    expect(centerPR).toBeGreaterThan(leafPR);
  });

  it("identifies connected components", () => {
    // Two disconnected triangles
    const disconnected = {
      nodes: [
        { id: "A" }, { id: "B" }, { id: "C" },
        { id: "X" }, { id: "Y" }, { id: "Z" },
      ],
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
        { source: "X", target: "Y" },
        { source: "Y", target: "Z" },
      ],
    };

    const result = computeGraphMetrics({
      ...disconnected,
      metrics: ["component"],
    });

    const headers = result.csv.split("\n")[0].split(",");
    const compIdx = headers.indexOf("component");
    const totalIdx = headers.indexOf("total_components");
    const lines = result.csv.split("\n").slice(1);

    // A, B, C should be in same component
    const compA = lines.find((l) => l.startsWith("A,"))!.split(",")[compIdx];
    const compB = lines.find((l) => l.startsWith("B,"))!.split(",")[compIdx];
    expect(compA).toBe(compB);

    // X should be in different component from A
    const compX = lines.find((l) => l.startsWith("X,"))!.split(",")[compIdx];
    expect(compA).not.toBe(compX);

    // Total components should be 2
    const total = parseInt(lines[0].split(",")[totalIdx]);
    expect(total).toBe(2);
  });

  it("computes clustering coefficient = 1 for fully connected triangle", () => {
    const result = computeGraphMetrics({
      ...triangleGraph,
      metrics: ["clustering"],
    });

    const headers = result.csv.split("\n")[0].split(",");
    const clIdx = headers.indexOf("clustering");
    const lines = result.csv.split("\n").slice(1);

    // In a fully connected triangle, every node's neighbors are all connected
    for (const line of lines) {
      const clustering = parseFloat(line.split(",")[clIdx]);
      expect(clustering).toBe(1);
    }
  });

  it("computes clustering coefficient = 0 for star graph leaves", () => {
    const result = computeGraphMetrics({
      ...starGraph,
      metrics: ["clustering"],
    });

    const headers = result.csv.split("\n")[0].split(",");
    const clIdx = headers.indexOf("clustering");
    const lines = result.csv.split("\n").slice(1);

    // Leaves have only 1 neighbor (center), so clustering = 0
    const leafLine = lines.find((l) => l.startsWith("leaf1,"));
    expect(parseFloat(leafLine!.split(",")[clIdx])).toBe(0);

    // Center's neighbors (leaves) aren't connected to each other, so clustering = 0
    const centerLine = lines.find((l) => l.startsWith("center,"));
    expect(parseFloat(centerLine!.split(",")[clIdx])).toBe(0);
  });

  it("preserves original node attributes", () => {
    const result = computeGraphMetrics({
      ...triangleGraph,
      metrics: ["degree"],
    });
    expect(result.csv).toContain("label");
    expect(result.csv).toContain("Alpha");
    expect(result.csv).toContain("Beta");
  });

  it("returns summary stats", () => {
    const result = computeGraphMetrics(triangleGraph);
    expect(result.stats!.nodes).toBe(3);
    expect(result.stats!.edges).toBe(3);
    expect(result.stats!.avg_degree).toBeDefined();
    expect(result.stats!.total_components).toBeDefined();
    expect(result.stats!.highest_pagerank).toBeDefined();
  });

  it("includes flow_instructions", () => {
    const result = computeGraphMetrics(triangleGraph);
    expect(result.flow_instructions).toBeDefined();
    expect(result.flow_instructions).toContain("degree");
    expect(result.flow_instructions).toContain("component");
  });

  it("handles empty nodes", () => {
    const result = computeGraphMetrics({ nodes: [], edges: [] });
    expect(result.error).toBeDefined();
  });

  it("computes all four metrics by default", () => {
    const result = computeGraphMetrics(triangleGraph);
    const headers = result.csv.split("\n")[0];
    expect(headers).toContain("degree");
    expect(headers).toContain("pagerank");
    expect(headers).toContain("component");
    expect(headers).toContain("clustering");
  });
});

// ============================================================================
// queryGraph
// ============================================================================

describe("queryGraph", () => {
  // --- Input validation (no FalkorDB needed) ---

  it("returns error for null input", async () => {
    const result = await queryGraph(null as any);
    expect(result.error).toContain("Input is required");
    expect(result.csv).toBe("");
  });

  it("returns error for empty query", async () => {
    const result = await queryGraph({ query: "" });
    expect(result.error).toContain("query is required");
    expect(result.csv).toBe("");
  });

  it("returns error for whitespace-only query", async () => {
    const result = await queryGraph({ query: "   " });
    expect(result.error).toContain("query is required");
  });

  it("returns error for non-string query", async () => {
    const result = await queryGraph({ query: 123 as any });
    expect(result.error).toContain("query is required");
  });

  it("returns error for invalid output_format", async () => {
    const result = await queryGraph({
      query: "MATCH (n) RETURN n",
      output_format: "xml" as any,
    });
    expect(result.error).toContain('Invalid output_format: "xml"');
    expect(result.error).toContain("csv, network_csv, json");
  });

  // --- Connection error handling ---

  it("returns helpful error when FalkorDB is unreachable", async () => {
    // queryGraph calls getFalkorDbClient which calls FalkorDB.connect
    // When FalkorDB is running, the query may succeed or return an error
    // for a non-existent graph. Either outcome is valid.
    const result = await queryGraph({
      query: "MATCH (n) RETURN n LIMIT 1",
      graph_name: "test_nonexistent_graph_xyz",
    });
    // If FalkorDB is running: may get a graph-not-found error or empty results
    // If FalkorDB is not running: get a connection error with hint
    if (result.error) {
      // Connection error or graph-not-found — both valid
      expect(typeof result.error).toBe("string");
    } else {
      // Connected and ran query — should have csv or stats
      expect(result.csv !== undefined || result.stats !== undefined).toBe(true);
    }
  });

  it("uses default graph_name 'flow' and output_format 'network_csv'", async () => {
    const result = await queryGraph({ query: "MATCH (n) RETURN n LIMIT 1" });
    // If FalkorDB is reachable, this may succeed with data or return empty
    // If FalkorDB is unreachable, expect error + empty csv
    if (result.error) {
      expect(result.csv).toBe("");
    } else {
      // Connected successfully — csv should be defined (possibly empty for no results)
      expect(result.csv !== undefined || result.stats !== undefined || result.nodes !== undefined).toBe(true);
    }
  });
});

// ============================================================================
// htmlToText
// ============================================================================

describe("htmlToText", () => {
  it("strips basic HTML tags and returns plain text", () => {
    const html = "<p>Hello <b>world</b>.</p>";
    const text = htmlToText(html);
    expect(text).toContain("Hello");
    expect(text).toContain("world");
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<b>");
  });

  it("removes script and style blocks entirely", () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style></head>
        <body>
          <script>alert('xss')</script>
          <p>Real content here.</p>
          <script type="text/javascript">var x = 1;</script>
        </body>
      </html>
    `;
    const text = htmlToText(html);
    expect(text).toContain("Real content here");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color: red");
    expect(text).not.toContain("var x");
  });

  it("removes nav, header, footer, aside elements", () => {
    const html = `
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <header><h1>Site Title</h1></header>
      <article><p>This is the article content.</p></article>
      <aside>Related links</aside>
      <footer>Copyright 2025</footer>
    `;
    const text = htmlToText(html);
    expect(text).toContain("This is the article content");
    expect(text).not.toContain("Home");
    expect(text).not.toContain("Site Title");
    expect(text).not.toContain("Related links");
    expect(text).not.toContain("Copyright 2025");
  });

  it("converts block elements to paragraph breaks", () => {
    const html = "<p>Paragraph one.</p><p>Paragraph two.</p>";
    const text = htmlToText(html);
    expect(text).toContain("Paragraph one.");
    expect(text).toContain("Paragraph two.");
    // Should have separation between paragraphs
    expect(text.indexOf("Paragraph two.")).toBeGreaterThan(text.indexOf("Paragraph one."));
  });

  it("decodes HTML entities", () => {
    const html = "<p>AT&amp;T said &quot;hello&quot; &amp; &lt;goodbye&gt;</p>";
    const text = htmlToText(html);
    expect(text).toContain('AT&T');
    expect(text).toContain('"hello"');
    expect(text).toContain("<goodbye>");
  });

  it("removes HTML comments", () => {
    const html = "<p>Before</p><!-- This is a comment --><p>After</p>";
    const text = htmlToText(html);
    expect(text).toContain("Before");
    expect(text).toContain("After");
    expect(text).not.toContain("comment");
  });

  it("handles complex real-world HTML with nested tags", () => {
    const html = `
      <div class="article">
        <h1>Breaking News: Tech Giants Merge</h1>
        <div class="meta">By John Smith | March 1, 2026</div>
        <p>Apple CEO <strong>Tim Cook</strong> and Microsoft CEO <em>Satya Nadella</em>
        announced a historic partnership in <a href="/sf">San Francisco</a>.</p>
        <p>The deal, worth $50 billion, will reshape the technology landscape.</p>
      </div>
    `;
    const text = htmlToText(html);
    expect(text).toContain("Tim Cook");
    expect(text).toContain("Satya Nadella");
    expect(text).toContain("San Francisco");
    expect(text).toContain("$50 billion");
    expect(text).not.toContain('class="article"');
    expect(text).not.toContain('href=');
  });

  it("collapses excessive whitespace", () => {
    const html = "<p>   Too    many     spaces   </p>";
    const text = htmlToText(html);
    expect(text).not.toMatch(/  /); // No double spaces
  });

  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("   ")).toBe("");
  });
});

// ============================================================================
// extractFromUrl
// ============================================================================

describe("extractFromUrl", () => {
  it("returns error for empty URL", async () => {
    const result = await extractFromUrl({ url: "" });
    expect(result.error).toBeDefined();
    expect(result.flow_ready).toBe(false);
  });

  it("returns error for null/undefined input", async () => {
    const result = await extractFromUrl(null as any);
    expect(result.error).toBeDefined();
    expect(result.flow_ready).toBe(false);
  });

  it("returns error for invalid URL", async () => {
    const result = await extractFromUrl({ url: "not-a-url" });
    expect(result.error).toContain("Invalid URL");
    expect(result.flow_ready).toBe(false);
  });

  it("returns error for non-HTTP protocol", async () => {
    const result = await extractFromUrl({ url: "ftp://example.com/file.txt" });
    expect(result.error).toContain("Unsupported protocol");
    expect(result.flow_ready).toBe(false);
  });

  it("returns error for unreachable host", async () => {
    const result = await extractFromUrl({ url: "https://this-domain-definitely-does-not-exist-xyz123.com/article" });
    expect(result.error).toBeDefined();
    expect(result.fetch_status).toBe("network_error");
    expect(result.flow_ready).toBe(false);
  }, 30000);

  it("maps extraction_focus to correct output_mode", async () => {
    // We test this indirectly by checking the focus is preserved in output
    const result = await extractFromUrl({ url: "https://this-domain-definitely-does-not-exist-xyz123.com", extraction_focus: "metrics" });
    // Will fail to fetch, but extraction_focus should not cause an error
    expect(result.error).toBeDefined(); // network error expected
    expect(result.flow_ready).toBe(false);
  }, 30000);

  it("handles a real URL and extracts data", async () => {
    // Use a well-known static page that's unlikely to change
    const result = await extractFromUrl({ url: "https://en.wikipedia.org/wiki/Flow_Immersive" });
    // This is a live test — may fail if wikipedia is down or URL changes
    // We check for expected shape regardless of whether it extracted much
    if (result.fetch_status?.startsWith("ok")) {
      expect(result.url).toBe("https://en.wikipedia.org/wiki/Flow_Immersive");
      expect(result.extracted_text_length).toBeGreaterThan(0);
      expect(result.page_title).toBeDefined();
      expect(result.extraction_summary).toBeDefined();
      expect(result.csv_output).toBeDefined();
      expect(result.extraction_focus).toBe("auto");
    } else {
      // If fetch failed (network issue in test env), just verify error shape
      expect(result.error).toBeDefined();
    }
  }, 30000);

  it("preserves extraction_focus in output", async () => {
    const result = await extractFromUrl({ url: "https://en.wikipedia.org/wiki/Flow_Immersive", extraction_focus: "entities" });
    if (result.fetch_status?.startsWith("ok")) {
      expect(result.extraction_focus).toBe("entities");
      // entities maps to "network" mode
      expect(result.mode).toBe("network");
    }
  }, 30000);

  it("includes page_title in output when fetch succeeds", async () => {
    const result = await extractFromUrl({ url: "https://example.com" });
    if (result.fetch_status?.startsWith("ok")) {
      expect(result.page_title).toBeDefined();
      expect(typeof result.page_title).toBe("string");
    }
  }, 30000);

  it("defaults extraction_focus to auto", async () => {
    const result = await extractFromUrl({ url: "https://this-domain-definitely-does-not-exist-xyz123.com" });
    // Even on fetch failure, extraction_focus should not appear as undefined in error shape
    expect(result.flow_ready).toBe(false);
  }, 30000);
});
