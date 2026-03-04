import { describe, it, expect } from "vitest";
import { flowExplorerProfile } from "./tools-explorer.js";
import type { ExplorationAction } from "./tools-explorer.js";

// ============================================================================
// Test action sets
// ============================================================================

const ANOMALY_HUNTER_ACTIONS: ExplorationAction[] = [
  { tool: "flow_anomaly_detect", columns: ["revenue"], finding: "3 outliers found" },
  { tool: "flow_anomaly_explain", columns: ["revenue"], finding: "outlier caused by data entry error" },
  { tool: "flow_near_miss_detector", finding: "2 near-miss patterns" },
  { tool: "flow_outlier_fence", columns: ["price"], finding: "IQR fence at 150" },
  { tool: "flow_visor_mode", finding: "anomaly visor reveals cluster of outliers" },
];

const CORRELATION_SPOTTER_ACTIONS: ExplorationAction[] = [
  { tool: "flow_correlation_matrix", columns: ["revenue", "employees", "growth"] },
  { tool: "flow_regression_analysis", columns: ["revenue", "employees"], finding: "R²=0.87" },
  { tool: "flow_pca_reduce", columns: ["revenue", "employees", "growth"], finding: "2 components explain 95%" },
  { tool: "flow_visor_mode", finding: "relational visor shows strong correlations" },
];

const NETWORK_NAVIGATOR_ACTIONS: ExplorationAction[] = [
  { tool: "flow_compute_graph_metrics", finding: "density=0.3, clustering=0.6" },
  { tool: "flow_precompute_force_layout", finding: "layout converged in 2s" },
  { tool: "flow_query_graph", finding: "found 5 hub nodes" },
  { tool: "flow_famous_network", finding: "loaded Karate Club network" },
];

const MIXED_ACTIONS: ExplorationAction[] = [
  { tool: "flow_describe_dataset", finding: "10 columns, 500 rows" },
  { tool: "flow_anomaly_detect", finding: "5 anomalies" },
  { tool: "flow_correlation_matrix", finding: "3 strong correlations" },
];

const ALL_ARCHETYPES = [
  "anomaly_hunter",
  "correlation_spotter",
  "causal_reasoner",
  "network_navigator",
  "pattern_seeker",
  "detail_diver",
  "big_picture_thinker",
  "creative_connector",
];

// ============================================================================
// Tests
// ============================================================================

describe("flowExplorerProfile", () => {
  // --- Archetype detection ---

  it("detects anomaly hunter from anomaly-focused actions", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.dominant_archetype).toBe("Anomaly Hunter");
    expect(result.archetype_scores.anomaly_hunter).toBe(1);
  });

  it("detects correlation spotter from correlation-focused actions", () => {
    const result = flowExplorerProfile({ exploration_actions: CORRELATION_SPOTTER_ACTIONS });
    expect(result.dominant_archetype).toBe("Correlation Spotter");
    expect(result.archetype_scores.correlation_spotter).toBe(1);
  });

  it("detects network navigator from graph-focused actions", () => {
    const result = flowExplorerProfile({ exploration_actions: NETWORK_NAVIGATOR_ACTIONS });
    expect(result.dominant_archetype).toBe("Network Navigator");
    expect(result.archetype_scores.network_navigator).toBe(1);
  });

  // --- Mixed actions ---

  it("produces balanced scores for mixed actions (no single archetype > 0.9 dominance gap)", () => {
    const result = flowExplorerProfile({ exploration_actions: MIXED_ACTIONS });
    const scores = Object.values(result.archetype_scores);
    const maxScore = Math.max(...scores);
    const minNonZero = Math.min(...scores.filter((s) => s > 0));
    // Mixed use should not have a single overwhelming archetype
    // At least 2 archetypes should score above 0.3
    const aboveThreshold = scores.filter((s) => s >= 0.3);
    expect(aboveThreshold.length).toBeGreaterThanOrEqual(2);
  });

  // --- All 8 archetypes present ---

  it("includes all 8 archetypes in scores", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    for (const archetype of ALL_ARCHETYPES) {
      expect(result.archetype_scores).toHaveProperty(archetype);
    }
  });

  // --- Scores in range ---

  it("all scores are between 0 and 1", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    for (const score of Object.values(result.archetype_scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("all scores are between 0 and 1 for mixed actions", () => {
    const result = flowExplorerProfile({ exploration_actions: MIXED_ACTIONS });
    for (const score of Object.values(result.archetype_scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  // --- DNA string ---

  it("produces a truthy DNA string", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.dna_string).toBeTruthy();
    expect(typeof result.dna_string).toBe("string");
    expect(result.dna_string.length).toBeGreaterThan(0);
  });

  it("produces different DNA strings for different profiles", () => {
    const anomaly = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    const network = flowExplorerProfile({ exploration_actions: NETWORK_NAVIGATOR_ACTIONS });
    expect(anomaly.dna_string).not.toBe(network.dna_string);
  });

  // --- Strengths ---

  it("returns at least 1 strength", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.strengths.length).toBeGreaterThanOrEqual(1);
  });

  it("strengths reflect top archetypes for anomaly hunter", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    const joined = result.strengths.join(" ").toLowerCase();
    expect(joined).toContain("anomal");
  });

  // --- Blind spots ---

  it("returns at least 1 blind spot", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.blind_spots.length).toBeGreaterThanOrEqual(1);
  });

  it("blind spots reflect bottom archetypes (not the dominant one)", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    const joined = result.blind_spots.join(" ").toLowerCase();
    // Blind spots should NOT mention anomaly since that's the top
    expect(joined).not.toContain("sharp eye for anomalies");
  });

  // --- Recommended tools ---

  it("suggests tools the user has not used", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    const usedTools = new Set(ANOMALY_HUNTER_ACTIONS.map((a) => a.tool));
    for (const rec of result.recommended_tools) {
      expect(usedTools.has(rec)).toBe(false);
    }
  });

  it("returns at least 1 recommended tool", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.recommended_tools.length).toBeGreaterThanOrEqual(1);
  });

  // --- Exploration summary ---

  it("summary includes action count and dominant archetype", () => {
    const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
    expect(result.exploration_summary).toContain("5 exploration actions");
    expect(result.exploration_summary).toContain("Anomaly Hunter");
  });

  // --- Edge cases ---

  it("handles single action", () => {
    const result = flowExplorerProfile({
      exploration_actions: [{ tool: "flow_anomaly_detect" }],
    });
    expect(result.dominant_archetype).toBeTruthy();
    expect(result.archetype_scores.anomaly_hunter).toBe(1);
    expect(result.exploration_summary).toContain("1 exploration action");
    // All 8 archetypes still present
    for (const archetype of ALL_ARCHETYPES) {
      expect(result.archetype_scores).toHaveProperty(archetype);
    }
  });

  it("handles empty actions array", () => {
    const result = flowExplorerProfile({ exploration_actions: [] });
    expect(result.dominant_archetype).toBe("Curious Beginner");
    expect(result.dna_string).toBeTruthy();
    // All scores equal
    const scores = Object.values(result.archetype_scores);
    expect(scores.every((s) => s === 0.125)).toBe(true);
  });

  it("handles action with missing fields gracefully", () => {
    const result = flowExplorerProfile({
      exploration_actions: [
        { tool: "" },
        { tool: "flow_anomaly_detect" },
        {} as ExplorationAction,
      ],
    });
    expect(result.dominant_archetype).toBeTruthy();
    expect(result.archetype_scores.anomaly_hunter).toBe(1);
    // Should not throw
  });
});
