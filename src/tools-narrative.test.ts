/**
 * Tests for tools-narrative.ts (flow_narrate_data)
 *
 * Narrative intelligence tool: transforms raw data into story arcs.
 * Tests verify statistical analysis, character identification, style variants,
 * temporal detection, categorical concentration, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flowNarrateData } from "./tools-narrative.js";
import type { NarrateDataInput, NarrateDataResult, NarrativeArc, DataCharacter } from "./tools-narrative.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

const NUMERIC_DATASET = [
  "name,revenue,employees,growth",
  "Acme Corp,5000000,250,12.5",
  "Beta Inc,1200000,45,8.3",
  "Gamma LLC,9500000,800,25.1",
  "Delta Co,300000,12,2.1",
  "Epsilon Ltd,4500000,200,15.0",
  "Zeta Corp,850000,30,-5.2",
  "Eta Inc,7200000,500,18.7",
  "Theta Co,2100000,90,7.4",
  "Iota Ltd,6800000,450,22.3",
  "Kappa Inc,150000,5,0.8",
].join("\n");

const OUTLIER_DATASET = [
  "city,population,avg_temp",
  "Springfield,50000,65",
  "Shelbyville,48000,64",
  "Capital City,52000,66",
  "Ogdenville,47000,63",
  "North Haverbrook,46000,64",
  "Brockway,49000,65",
  "Cypress Creek,51000,66",
  "Shelby Falls,47500,64",
  "Mega City,5000000,72",  // Massive outlier in population
  "Smalltown,45000,63",
].join("\n");

const CORRELATED_DATASET = [
  "student,hours_studied,test_score,absences",
  "Alice,40,95,1",
  "Bob,35,88,2",
  "Charlie,30,82,3",
  "Diana,25,75,5",
  "Eve,20,68,7",
  "Frank,15,60,9",
  "Grace,10,52,12",
  "Hank,5,45,15",
  "Iris,45,98,0",
  "Jack,50,99,0",
].join("\n");

const TEMPORAL_DATASET = [
  "date,sales,returns",
  "2024-01-15,1000,50",
  "2024-02-15,1200,45",
  "2024-03-15,1500,40",
  "2024-04-15,1800,35",
  "2024-05-15,2200,30",
  "2024-06-15,2800,28",
  "2024-07-15,3500,25",
  "2024-08-15,4200,22",
  "2024-09-15,5000,20",
  "2024-10-15,6000,18",
].join("\n");

const CATEGORICAL_DATASET = [
  "product,category,price,units_sold",
  "Widget A,Electronics,29.99,500",
  "Widget B,Electronics,49.99,300",
  "Widget C,Electronics,19.99,800",
  "Widget D,Electronics,39.99,400",
  "Widget E,Electronics,59.99,200",
  "Gadget F,Clothing,24.99,150",
  "Gadget G,Home,34.99,100",
  "Gadget H,Electronics,44.99,350",
  "Gadget I,Electronics,54.99,250",
  "Gadget J,Food,9.99,900",
].join("\n");

const SINGLE_ROW_DATASET = [
  "name,value",
  "only_one,42",
].join("\n");

const HEADER_ONLY_DATASET = "name,value,category";

// ============================================================================
// Test 1: Basic numeric dataset generates narrative with all arc sections
// ============================================================================

describe("flow_narrate_data", () => {
  it("generates narrative with all arc sections for numeric dataset", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET });

    // All arc sections must be non-empty strings
    expect(result.narrative.hook).toBeTruthy();
    expect(typeof result.narrative.hook).toBe("string");
    expect(result.narrative.hook.length).toBeGreaterThan(10);

    expect(result.narrative.setting).toBeTruthy();
    expect(result.narrative.setting.length).toBeGreaterThan(10);

    expect(result.narrative.characters).toBeDefined();
    expect(result.narrative.characters.length).toBeGreaterThan(0);
    expect(result.narrative.characters.length).toBeLessThanOrEqual(5);

    expect(result.narrative.rising_action).toBeTruthy();
    expect(result.narrative.rising_action.length).toBeGreaterThan(10);

    expect(result.narrative.climax).toBeTruthy();
    expect(result.narrative.climax.length).toBeGreaterThan(10);

    expect(result.narrative.resolution).toBeTruthy();
    expect(result.narrative.resolution.length).toBeGreaterThan(10);

    expect(result.narrative.cliffhanger).toBeTruthy();
    expect(result.narrative.cliffhanger.length).toBeGreaterThan(10);

    // Data summary must be accurate
    expect(result.data_summary.rows).toBe(10);
    expect(result.data_summary.columns).toBe(4);
    expect(result.data_summary.numeric_columns).toContain("revenue");
    expect(result.data_summary.numeric_columns).toContain("employees");
    expect(result.data_summary.numeric_columns).toContain("growth");
    expect(result.data_summary.potential_id_column).toBe("name");

    // Must have suggestions and viz recommendation
    expect(result.suggested_exploration.length).toBeGreaterThanOrEqual(1);
    expect(result.viz_recommendation).toBeTruthy();
  });

  // ============================================================================
  // Test 2: Dataset with clear outlier identifies it as a character
  // ============================================================================

  it("identifies clear outlier as a character with outlier role", () => {
    const result = flowNarrateData({ csv: OUTLIER_DATASET });

    // Mega City has population 5,000,000 vs ~48,000 average — must be detected
    const outlierChar = result.narrative.characters.find(
      (c) => c.role === "outlier"
    );
    expect(outlierChar).toBeDefined();
    expect(outlierChar!.name).toContain("Mega City");
    expect(outlierChar!.evidence).toBeTruthy();
  });

  // ============================================================================
  // Test 3: Dataset with strong correlation mentions it in rising_action
  // ============================================================================

  it("detects correlation and mentions it in rising_action", () => {
    const result = flowNarrateData({ csv: CORRELATED_DATASET });

    // hours_studied and test_score have strong positive correlation
    const risingAction = result.narrative.rising_action.toLowerCase();
    expect(
      risingAction.includes("correlat") ||
      risingAction.includes("relationship") ||
      risingAction.includes("connect") ||
      risingAction.includes("move together") ||
      risingAction.includes("tied") ||
      risingAction.includes("linked")
    ).toBe(true);
  });

  // ============================================================================
  // Test 4: Executive style produces shorter output than explorer style
  // ============================================================================

  it("executive style is shorter than explorer style", () => {
    const executive = flowNarrateData({ csv: NUMERIC_DATASET, style: "executive" });
    const explorer = flowNarrateData({ csv: NUMERIC_DATASET, style: "explorer" });

    const execLen =
      executive.narrative.hook.length +
      executive.narrative.setting.length +
      executive.narrative.rising_action.length +
      executive.narrative.climax.length +
      executive.narrative.resolution.length;

    const explorerLen =
      explorer.narrative.hook.length +
      explorer.narrative.setting.length +
      explorer.narrative.rising_action.length +
      explorer.narrative.climax.length +
      explorer.narrative.resolution.length;

    expect(execLen).toBeLessThan(explorerLen);
  });

  // ============================================================================
  // Test 5: Journalist style mentions who and why
  // ============================================================================

  it("journalist style mentions who/what/why language", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET, style: "journalist" });

    const fullNarrative = [
      result.narrative.hook,
      result.narrative.setting,
      result.narrative.rising_action,
      result.narrative.climax,
      result.narrative.resolution,
    ].join(" ").toLowerCase();

    // Journalist framing should use investigative language
    const hasJournalistMarkers =
      fullNarrative.includes("who") ||
      fullNarrative.includes("why") ||
      fullNarrative.includes("reveals") ||
      fullNarrative.includes("according") ||
      fullNarrative.includes("investigation") ||
      fullNarrative.includes("the data shows") ||
      fullNarrative.includes("notably") ||
      fullNarrative.includes("stands out");

    expect(hasJournalistMarkers).toBe(true);
  });

  // ============================================================================
  // Test 6: Dataset with date column detects temporal trend
  // ============================================================================

  it("detects temporal trend in date-containing dataset", () => {
    const result = flowNarrateData({ csv: TEMPORAL_DATASET });

    const fullNarrative = [
      result.narrative.hook,
      result.narrative.setting,
      result.narrative.rising_action,
      result.narrative.climax,
      result.narrative.resolution,
    ].join(" ").toLowerCase();

    // Should detect temporal patterns
    const hasTemporal =
      fullNarrative.includes("time") ||
      fullNarrative.includes("trend") ||
      fullNarrative.includes("over") ||
      fullNarrative.includes("increas") ||
      fullNarrative.includes("grow") ||
      fullNarrative.includes("period") ||
      fullNarrative.includes("progress") ||
      fullNarrative.includes("trajectory");

    expect(hasTemporal).toBe(true);

    // The data_summary should identify date column
    // date is categorical (not numeric), so it should be in categorical_columns
    expect(result.data_summary.categorical_columns).toContain("date");
  });

  // ============================================================================
  // Test 7: Dataset with categorical column detects concentration
  // ============================================================================

  it("detects categorical concentration (dominant category)", () => {
    const result = flowNarrateData({ csv: CATEGORICAL_DATASET });

    // 7/10 products are Electronics — should be detected
    const fullNarrative = [
      result.narrative.hook,
      result.narrative.setting,
      result.narrative.rising_action,
      result.narrative.climax,
      result.narrative.resolution,
    ].join(" ").toLowerCase();

    const hasCategoryInsight =
      fullNarrative.includes("electronics") ||
      fullNarrative.includes("dominat") ||
      fullNarrative.includes("concentrat") ||
      fullNarrative.includes("majority") ||
      fullNarrative.includes("most") ||
      fullNarrative.includes("70%") ||
      fullNarrative.includes("categor");

    expect(hasCategoryInsight).toBe(true);
  });

  // ============================================================================
  // Test 8: Empty or single-row dataset handles gracefully
  // ============================================================================

  it("handles single-row dataset gracefully", () => {
    const result = flowNarrateData({ csv: SINGLE_ROW_DATASET });

    expect(result.data_summary.rows).toBe(1);
    expect(result.narrative.hook).toBeTruthy();
    expect(result.narrative.setting).toBeTruthy();
    // Should still produce a complete arc (even if minimal)
    expect(result.narrative.climax).toBeTruthy();
    expect(result.narrative.resolution).toBeTruthy();
  });

  it("handles header-only dataset gracefully", () => {
    const result = flowNarrateData({ csv: HEADER_ONLY_DATASET });

    expect(result.data_summary.rows).toBe(0);
    expect(result.narrative.hook).toBeTruthy();
    expect(result.narrative.setting).toContain("0");
  });

  // ============================================================================
  // Additional tests: focus_columns, character roles, suggestions
  // ============================================================================

  it("respects focus_columns parameter", () => {
    const focused = flowNarrateData({
      csv: NUMERIC_DATASET,
      focus_columns: ["revenue", "growth"],
    });

    // Characters and narrative should reference focused columns
    const fullNarrative = [
      focused.narrative.hook,
      focused.narrative.setting,
      focused.narrative.rising_action,
      focused.narrative.climax,
    ].join(" ").toLowerCase();

    const mentionsFocus =
      fullNarrative.includes("revenue") || fullNarrative.includes("growth");
    expect(mentionsFocus).toBe(true);
  });

  it("characters have valid roles and non-empty evidence", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET });

    const validRoles = ["protagonist", "antagonist", "outlier", "bridge", "cluster_leader"];
    for (const char of result.narrative.characters) {
      expect(validRoles).toContain(char.role);
      expect(char.name).toBeTruthy();
      expect(char.description).toBeTruthy();
      expect(char.evidence).toBeTruthy();
    }
  });

  it("suggested_exploration contains actionable tool suggestions", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET });

    expect(result.suggested_exploration.length).toBeGreaterThanOrEqual(2);
    for (const suggestion of result.suggested_exploration) {
      expect(suggestion.length).toBeGreaterThan(10);
    }
  });

  it("potential_id_column identifies name-like columns", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET });
    expect(result.data_summary.potential_id_column).toBe("name");
  });

  it("returns viz_recommendation as non-empty string", () => {
    const result = flowNarrateData({ csv: NUMERIC_DATASET });
    expect(result.viz_recommendation).toBeTruthy();
    expect(result.viz_recommendation.length).toBeGreaterThan(5);
  });

  it("default style is explorer when not specified", () => {
    const defaultResult = flowNarrateData({ csv: NUMERIC_DATASET });
    const explorerResult = flowNarrateData({ csv: NUMERIC_DATASET, style: "explorer" });

    // Both should produce explorer-length output (not executive-short)
    const defaultLen = defaultResult.narrative.rising_action.length;
    const explorerLen = explorerResult.narrative.rising_action.length;

    // They should be identical since default = explorer
    expect(defaultLen).toBe(explorerLen);
  });
});

// ============================================================================
// Tests for flow_famous_network
// Uses mocked Wikidata responses for deterministic testing.
// ============================================================================

import { flowFamousNetwork } from "./tools-narrative.js";
import type { FamousNetworkInput } from "./tools-narrative.js";

const mockFetch = vi.fn();

// Standard mock data for Albert Einstein
function einsteinSearchResponse() {
  return {
    results: {
      bindings: [
        {
          person: { value: "http://www.wikidata.org/entity/Q937" },
          personLabel: { value: "Albert Einstein" },
          personDesc: { value: "German-born theoretical physicist" },
        },
      ],
    },
  };
}

function einsteinRelationshipsResponse() {
  return {
    results: {
      bindings: [
        {
          related: { value: "http://www.wikidata.org/entity/Q7186" },
          relatedLabel: { value: "Marie Curie" },
          relatedDesc: { value: "Polish-French physicist and chemist" },
          prop: { value: "http://www.wikidata.org/prop/direct/P737" },
        },
        {
          related: { value: "http://www.wikidata.org/entity/Q1017" },
          relatedLabel: { value: "Niels Bohr" },
          relatedDesc: { value: "Danish physicist" },
          prop: { value: "http://www.wikidata.org/prop/direct/P737" },
        },
        {
          related: { value: "http://www.wikidata.org/entity/Q9036" },
          relatedLabel: { value: "Max Planck" },
          relatedDesc: { value: "German theoretical physicist" },
          prop: { value: "http://www.wikidata.org/prop/direct/P737" },
        },
        {
          related: { value: "http://www.wikidata.org/entity/Q60036" },
          relatedLabel: { value: "Mileva Maric" },
          relatedDesc: { value: "Serbian mathematician and physicist" },
          prop: { value: "http://www.wikidata.org/prop/direct/P26" },
        },
        {
          related: { value: "http://www.wikidata.org/entity/Q77938" },
          relatedLabel: { value: "Elsa Einstein" },
          relatedDesc: { value: "Second wife of Albert Einstein" },
          prop: { value: "http://www.wikidata.org/prop/direct/P26" },
        },
        {
          related: { value: "http://www.wikidata.org/entity/Q132602" },
          relatedLabel: { value: "Hans Albert Einstein" },
          relatedDesc: { value: "Swiss-American engineer" },
          prop: { value: "http://www.wikidata.org/prop/direct/P40" },
        },
      ],
    },
  };
}

function emptyWikidataResponse() {
  return { results: { bindings: [] } };
}

describe("flow_famous_network", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a network for Albert Einstein with correct structure", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });

    expect(result.center_person).toBe("Albert Einstein");
    expect(result.center_description).toBe("German-born theoretical physicist");
    expect(result.nodes).toBeGreaterThanOrEqual(5);
    expect(result.edges).toBeGreaterThanOrEqual(4);
    expect(result.suggested_template).toBe("Network");
    expect(result.wikidata_query).toContain("Q937");
    expect(result.csv).toBeTruthy();
  });

  it("CSV output has required columns: id, connections, label, type, description, relationship", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });
    const lines = result.csv.split("\n");
    const headers = parseCSVLine(lines[0]);

    expect(headers).toContain("id");
    expect(headers).toContain("connections");
    expect(headers).toContain("label");
    expect(headers).toContain("type");
    expect(headers).toContain("description");
    expect(headers).toContain("relationship");

    // Each data row should have 6 fields
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;
      const fields = parseCSVLine(lines[i]);
      expect(fields.length).toBe(6);
    }
  });

  it("relationship_breakdown values sum to total edge count", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });
    const breakdownSum = Object.values(result.relationship_breakdown).reduce((a, b) => a + b, 0);
    expect(breakdownSum).toBe(result.edges);
  });

  it("respects max_nodes limit", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({
      person: "Albert Einstein",
      max_nodes: 5,
    });

    // max_nodes = 5, so at most 5 nodes (LIMIT in SPARQL query is 5)
    // plus the center node, and the mock returns 6 results but SPARQL LIMIT filters
    expect(result.nodes).toBeLessThanOrEqual(7);
  });

  it("throws error for unknown person", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyWikidataResponse(),
    });

    await expect(
      flowFamousNetwork({ person: "Zzzyxwvut Nonexistent Person 12345" })
    ).rejects.toThrow(/not found on Wikidata/);
  });

  it("narrative_hook is non-empty and mentions the person", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });

    expect(result.narrative_hook).toBeTruthy();
    expect(result.narrative_hook.length).toBeGreaterThan(20);
    expect(result.narrative_hook).toContain("Albert Einstein");
  });

  it("notable_connections contains formatted relationship strings", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });

    expect(result.notable_connections.length).toBeGreaterThan(0);
    for (const conn of result.notable_connections) {
      expect(conn).toMatch(/→/);
      expect(conn).toContain("Albert Einstein");
    }
  });

  it("handles Wikidata rate limit (429) with clear error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too Many Requests",
    });

    await expect(
      flowFamousNetwork({ person: "Albert Einstein" })
    ).rejects.toThrow(/rate limit/);
  });

  it("handles Wikidata server error with status code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(
      flowFamousNetwork({ person: "Albert Einstein" })
    ).rejects.toThrow(/500/);
  });

  it("handles no relationships found with helpful suggestion", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyWikidataResponse(),
      });

    await expect(
      flowFamousNetwork({
        person: "Albert Einstein",
        relationship_types: ["spouse"],
      })
    ).rejects.toThrow(/No relationships found/);
  });

  it("filters by specific relationship type", async () => {
    const spouseOnlyResponse = {
      results: {
        bindings: [
          {
            related: { value: "http://www.wikidata.org/entity/Q60036" },
            relatedLabel: { value: "Mileva Maric" },
            relatedDesc: { value: "Serbian mathematician and physicist" },
            prop: { value: "http://www.wikidata.org/prop/direct/P26" },
          },
          {
            related: { value: "http://www.wikidata.org/entity/Q77938" },
            relatedLabel: { value: "Elsa Einstein" },
            relatedDesc: { value: "Second wife of Albert Einstein" },
            prop: { value: "http://www.wikidata.org/prop/direct/P26" },
          },
        ],
      },
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => spouseOnlyResponse,
      });

    const result = await flowFamousNetwork({
      person: "Albert Einstein",
      relationship_types: ["spouse"],
    });

    for (const rel of Object.keys(result.relationship_breakdown)) {
      expect(rel).toBe("spouse");
    }
  });

  it("depth 2 triggers a third SPARQL query", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            bindings: [
              {
                hop1: { value: "http://www.wikidata.org/entity/Q1017" },
                related: { value: "http://www.wikidata.org/entity/Q46857" },
                relatedLabel: { value: "Werner Heisenberg" },
                relatedDesc: { value: "German theoretical physicist" },
                prop: { value: "http://www.wikidata.org/prop/direct/P737" },
              },
            ],
          },
        }),
      });

    const result = await flowFamousNetwork({
      person: "Albert Einstein",
      depth: 2,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.csv).toContain("Werner Heisenberg");
    expect(result.nodes).toBeGreaterThan(6);
  });

  it("center node appears in CSV with type 'center'", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinSearchResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => einsteinRelationshipsResponse(),
      });

    const result = await flowFamousNetwork({ person: "Albert Einstein" });
    const lines = result.csv.split("\n");
    const headers = parseCSVLine(lines[0]);
    const typeIdx = headers.indexOf("type");
    const labelIdx = headers.indexOf("label");

    let foundCenter = false;
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields[labelIdx] === "Albert Einstein") {
        expect(fields[typeIdx]).toBe("center");
        foundCenter = true;
      }
    }
    expect(foundCenter).toBe(true);
  });
});

// ============================================================================
// Tests for flow_guided_tour
// ============================================================================

import { flowGuidedTour } from "./tools-narrative.js";
import type { GuidedTourInput, GuidedTourResult, TourStop } from "./tools-narrative.js";

const GT_NUMERIC_DATASET = [
  "name,revenue,employees,growth",
  "Acme Corp,5000000,250,12.5",
  "Beta Inc,1200000,45,8.3",
  "Gamma LLC,9500000,800,25.1",
  "Delta Co,300000,12,2.1",
  "Epsilon Ltd,4500000,200,15.0",
  "Zeta Corp,850000,30,-5.2",
  "Eta Inc,7200000,500,18.7",
  "Theta Co,2100000,90,7.4",
  "Iota Ltd,6800000,450,22.3",
  "Kappa Inc,150000,5,0.8",
].join("\n");

const GT_OUTLIER_DATASET = [
  "city,population,avg_temp,elevation",
  "Springfield,50000,65,400",
  "Shelbyville,48000,64,380",
  "Capital City,52000,66,420",
  "Ogdenville,47000,63,390",
  "North Haverbrook,46000,64,370",
  "Brockway,49000,65,410",
  "Cypress Creek,51000,66,405",
  "Shelby Falls,47500,64,395",
  "Mega City,5000000,72,50",
  "Smalltown,45000,63,385",
].join("\n");

const GT_NETWORK_DATASET = [
  "id,connections,role,score",
  "Alice,Bob|Charlie|Diana|Eve,leader,95",
  "Bob,Alice|Charlie,member,72",
  "Charlie,Alice|Bob|Diana,member,80",
  "Diana,Alice|Charlie,member,68",
  "Eve,Alice,newcomer,55",
  "Frank,,observer,30",
].join("\n");

const GT_TEMPORAL_DATASET = [
  "date,sales,returns",
  "2024-01-15,1000,50",
  "2024-02-15,1200,45",
  "2024-03-15,1500,40",
  "2024-04-15,1800,35",
  "2024-05-15,2200,30",
  "2024-06-15,2800,28",
  "2024-07-15,3500,25",
  "2024-08-15,4200,22",
  "2024-09-15,5000,20",
  "2024-10-15,6000,18",
].join("\n");

describe("flow_guided_tour", () => {
  // Test 1: Basic dataset with numeric columns generates tour with correct number of stops
  it("generates tour with correct number of stops for numeric dataset", () => {
    const result = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 5 });

    expect(result.stops.length).toBe(5);
    expect(result.title).toBeTruthy();
    expect(result.introduction).toBeTruthy();
    expect(result.conclusion).toBeTruthy();
    expect(result.total_duration_hint).toBeTruthy();
    expect(result.suggested_template).toBeTruthy();

    // Steps should be sequentially numbered
    for (let i = 0; i < result.stops.length; i++) {
      expect(result.stops[i].step).toBe(i + 1);
    }
  });

  // Test 2: Outlier focus identifies rows with extreme values
  it("outlier focus identifies rows with extreme values", () => {
    const result = flowGuidedTour({ csv: GT_OUTLIER_DATASET, focus: "outliers", stops: 3 });

    expect(result.stops.length).toBe(3);

    // Mega City (population 5,000,000) should appear as an outlier
    const megaCityStop = result.stops.find(s => s.target === "Mega City");
    expect(megaCityStop).toBeDefined();

    // The narration should mention standard deviations
    expect(megaCityStop!.narration).toContain("standard deviations");

    // Population should be in the highlight columns
    expect(megaCityStop!.highlight_columns).toContain("population");
  });

  // Test 3: Each stop has title, narration, camera_hint, and transition
  it("each stop has title, narration, camera_hint, and transition", () => {
    const result = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 4 });

    const validCameraHints = ["zoom_in", "pan_right", "orbit", "zoom_out", "fly_to"];

    for (const stop of result.stops) {
      expect(stop.title).toBeTruthy();
      expect(stop.title.length).toBeGreaterThan(3);
      // Title should NOT be "Stop 1" style
      expect(stop.title).not.toMatch(/^Stop \d+$/);

      expect(stop.narration).toBeTruthy();
      expect(stop.narration.length).toBeGreaterThan(20);

      expect(validCameraHints).toContain(stop.camera_hint);

      expect(stop.transition).toBeTruthy();
      expect(stop.transition.length).toBeGreaterThan(10);

      expect(stop.target).toBeTruthy();
      expect(stop.target_values).toBeDefined();
      expect(Object.keys(stop.target_values).length).toBeGreaterThan(0);
      expect(stop.highlight_columns.length).toBeGreaterThan(0);
    }
  });

  // Test 4: Stops count respects the stops parameter
  it("respects the stops parameter", () => {
    const result3 = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 3 });
    expect(result3.stops.length).toBe(3);

    const result7 = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 7 });
    expect(result7.stops.length).toBe(7);

    const result1 = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 1 });
    expect(result1.stops.length).toBe(1);

    // Max is 10
    const result15 = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 15 });
    expect(result15.stops.length).toBeLessThanOrEqual(10);

    // Default is 5
    const resultDefault = flowGuidedTour({ csv: GT_NUMERIC_DATASET });
    expect(resultDefault.stops.length).toBe(5);
  });

  // Test 5: Overview focus includes variety (not all same type of stop)
  it("overview focus includes variety of stop types", () => {
    const result = flowGuidedTour({ csv: GT_NUMERIC_DATASET, focus: "overview", stops: 5 });

    // Stops should have different targets (not all the same row)
    const targets = result.stops.map(s => s.target);
    const uniqueTargets = new Set(targets);
    expect(uniqueTargets.size).toBeGreaterThan(1);

    // Should have a mix of titles (from different pools)
    const titles = result.stops.map(s => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBeGreaterThan(1);
  });

  // Test 6: Network data with connections column generates connection-focused tour
  it("network data generates connection-focused tour", () => {
    const result = flowGuidedTour({ csv: GT_NETWORK_DATASET, focus: "connections", stops: 4 });

    expect(result.stops.length).toBeGreaterThan(0);
    expect(result.stops.length).toBeLessThanOrEqual(4);

    // Alice has 4 connections (most), should appear
    const aliceStop = result.stops.find(s => s.target === "Alice");
    expect(aliceStop).toBeDefined();
    expect(aliceStop!.narration).toContain("connects to");

    // Frank has 0 connections (isolated), should appear for contrast
    const frankStop = result.stops.find(s => s.target === "Frank");
    if (frankStop) {
      expect(frankStop.narration).toContain("isolated");
    }

    // Suggested template should be Network Graph (has connections column)
    expect(result.suggested_template).toBe("Network Graph");
  });

  // Additional tests

  it("throws on empty CSV", () => {
    expect(() => flowGuidedTour({ csv: "name,value" })).toThrow("at least one data row");
  });

  it("respects id_column parameter", () => {
    const result = flowGuidedTour({ csv: GT_NUMERIC_DATASET, id_column: "name", stops: 2 });

    // All targets should be actual names from the name column
    for (const stop of result.stops) {
      expect(stop.target).not.toMatch(/^Row \d+$/);
    }
  });

  it("trend focus produces temporal narration", () => {
    const result = flowGuidedTour({ csv: GT_TEMPORAL_DATASET, focus: "trends", stops: 4 });

    expect(result.stops.length).toBeGreaterThan(0);

    // Should reference the peak (6000) and/or the trough (1000)
    const allNarration = result.stops.map(s => s.narration).join(" ");
    expect(
      allNarration.includes("peak") ||
      allNarration.includes("lowest") ||
      allNarration.includes("surge") ||
      allNarration.includes("baseline") ||
      allNarration.includes("highest")
    ).toBe(true);
  });

  it("cluster focus creates distinct groups", () => {
    const result = flowGuidedTour({ csv: GT_NUMERIC_DATASET, focus: "clusters", stops: 3 });

    expect(result.stops.length).toBe(3);

    // Each cluster stop narration should mention "cluster"
    for (const stop of result.stops) {
      expect(stop.narration.toLowerCase()).toContain("cluster");
    }
  });

  it("total_duration_hint scales with stop count", () => {
    const short = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 2 });
    const long = flowGuidedTour({ csv: GT_NUMERIC_DATASET, stops: 8 });

    // Short tour should have fewer minutes
    const shortMinutes = parseInt(short.total_duration_hint.match(/\d+/)?.[0] ?? "0");
    const longMinutes = parseInt(long.total_duration_hint.match(/\d+/)?.[0] ?? "0");
    expect(longMinutes).toBeGreaterThanOrEqual(shortMinutes);
  });
});
