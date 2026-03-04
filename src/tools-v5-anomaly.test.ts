/**
 * Tests for flow_anomaly_explain (Tool 64) in tools-v5.ts
 *
 * Anomaly explanation tool: takes anomalous data points and explains WHY they're
 * anomalous by comparing to nearest neighbors, computing feature contributions,
 * detecting micro-clusters, and generating detective-story narratives.
 */

import { describe, it, expect } from "vitest";
import { flowAnomalyExplain } from "./tools-v5.js";
import type { AnomalyExplainInput, AnomalyExplainResult } from "./tools-v5.js";

// ============================================================================
// Test datasets
// ============================================================================

/** 10-row dataset with a clear outlier at row 3 (Delta Co: very low revenue, employees, growth) */
const AE_BASIC_DATASET = [
  "name,revenue,employees,growth",
  "Acme Corp,5000000,250,12.5",
  "Beta Inc,4800000,230,11.0",
  "Gamma LLC,5200000,260,13.5",
  "Delta Co,100000,5,0.2",
  "Epsilon Ltd,4900000,245,12.0",
  "Zeta Corp,5100000,255,14.0",
  "Eta Inc,4700000,220,10.5",
  "Theta Co,5300000,270,15.0",
  "Iota Ltd,4600000,210,9.8",
  "Kappa Inc,5050000,248,11.5",
].join("\n");

/** Dataset with two outliers sharing similar deviation pattern (micro-cluster) */
const AE_MICRO_CLUSTER_DATASET = [
  "id,revenue,costs,margin",
  "A,1000,500,50",
  "B,1100,550,50",
  "C,950,475,50",
  "D,5000,100,98",
  "E,1050,525,50",
  "F,4800,120,97.5",
  "G,980,490,50",
  "H,1020,510,50",
  "I,1080,540,50",
  "J,990,495,50",
].join("\n");

/** Dataset where a target row is not actually anomalous */
const AE_NORMAL_DATASET = [
  "name,score,level",
  "A,50,5",
  "B,52,5",
  "C,48,5",
  "D,51,5",
  "E,49,5",
  "F,50,5",
  "G,53,5",
  "H,47,5",
].join("\n");

/** All-numeric dataset (no ID/text column) */
const AE_ALL_NUMERIC = [
  "x,y,z",
  "10,20,30",
  "11,19,31",
  "9,21,29",
  "100,200,300",
  "10,20,30",
  "12,18,32",
].join("\n");

/** Mixed numeric/categorical dataset */
const AE_MIXED = [
  "name,category,revenue,employees",
  "Alpha,tech,5000,250",
  "Beta,tech,4800,230",
  "Gamma,finance,5100,260",
  "Delta,tech,100,5",
  "Epsilon,finance,4900,245",
  "Zeta,health,5050,248",
].join("\n");

/** Single numeric column dataset */
const AE_SINGLE_COL = [
  "value",
  "10",
  "11",
  "9",
  "100",
  "10",
  "12",
].join("\n");

// ============================================================================
// Tests for flow_anomaly_explain
// ============================================================================

describe("flow_anomaly_explain", () => {

  // TEST 1: Basic explanation for a single outlier row
  it("should explain a single outlier row with complete explanation structure", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
    });

    expect(result.explanations).toHaveLength(1);
    const exp = result.explanations[0];
    expect(exp.row_index).toBe(3);
    expect(exp.surprise_score).toBeGreaterThan(1.0);
    expect(exp.driving_features.length).toBeGreaterThan(0);
    expect(exp.nearest_neighbors.length).toBeGreaterThanOrEqual(1);
    expect(exp.narrative).toBeTruthy();
    expect(exp.investigation_leads.length).toBeGreaterThan(0);
  });

  // TEST 2: Nearest neighbor computation
  it("should find correct nearest neighbors sorted by distance ascending", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
    });

    const exp = result.explanations[0];
    expect(exp.nearest_neighbors).toHaveLength(3);
    for (let i = 0; i < exp.nearest_neighbors.length - 1; i++) {
      expect(exp.nearest_neighbors[i].distance).toBeLessThanOrEqual(
        exp.nearest_neighbors[i + 1].distance
      );
    }
    for (const nn of exp.nearest_neighbors) {
      expect(nn.row_index).not.toBe(3);
      expect(nn.distance).toBeGreaterThanOrEqual(0);
    }
  });

  // TEST 3: Feature contribution breakdown sums to ~100%
  it("should produce driving features that sum to approximately 100%", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
    });

    const exp = result.explanations[0];
    expect(exp.driving_features.length).toBeGreaterThan(0);

    const totalContribution = exp.driving_features.reduce(
      (sum, f) => sum + f.contribution_pct, 0
    );
    expect(totalContribution).toBeGreaterThan(95);
    expect(totalContribution).toBeLessThan(105);

    for (const feat of exp.driving_features) {
      expect(feat.contribution_pct).toBeGreaterThanOrEqual(0);
      expect(feat.contribution_pct).toBeLessThanOrEqual(100);
      expect(feat.column).toBeTruthy();
    }
  });

  // TEST 4: Multiple target rows
  it("should explain multiple target rows independently", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_MICRO_CLUSTER_DATASET,
      target_rows: [3, 5],
    });

    expect(result.explanations).toHaveLength(2);
    expect(result.explanations[0].row_index).toBe(3);
    expect(result.explanations[1].row_index).toBe(5);
    expect(result.explanations[0].surprise_score).toBeGreaterThan(1.0);
    expect(result.explanations[1].surprise_score).toBeGreaterThan(1.0);
  });

  // TEST 5: Micro-cluster detection
  it("should detect micro-clusters when target rows share similar deviation patterns", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_MICRO_CLUSTER_DATASET,
      target_rows: [3, 5],
    });

    const hasMicroCluster = result.explanations.some(
      (exp) => exp.micro_cluster !== null && exp.micro_cluster.cluster_size >= 2
    );
    expect(hasMicroCluster).toBe(true);
  });

  // TEST 6: Detective style narrative
  it("should generate detective-style narrative with row-specific details", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
      style: "detective",
    });

    const narrative = result.explanations[0].narrative;
    expect(narrative.length).toBeGreaterThan(50);
    expect(narrative).toMatch(/row|Row|delta|Delta/i);
  });

  // TEST 7: Scientific style
  it("should generate scientific-style narrative with statistical language", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
      style: "scientific",
    });

    const narrative = result.explanations[0].narrative;
    expect(narrative.length).toBeGreaterThan(50);
    expect(narrative).toMatch(/standard deviation|z-score|sigma|deviation|statistic/i);
  });

  // TEST 8: Casual style
  it("should generate casual-style narrative that is conversational", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
      style: "casual",
    });

    const narrative = result.explanations[0].narrative;
    expect(narrative.length).toBeGreaterThan(50);
    expect(narrative).toBeTruthy();
  });

  // TEST 9: Investigation leads
  it("should suggest investigation leads based on driving features", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
    });

    const leads = result.explanations[0].investigation_leads;
    expect(leads.length).toBeGreaterThan(0);
    for (const lead of leads) {
      expect(typeof lead).toBe("string");
      expect(lead.length).toBeGreaterThan(10);
    }
  });

  // TEST 10: Target row that is NOT anomalous
  it("should produce a low surprise score for a non-anomalous row", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_NORMAL_DATASET,
      target_rows: [0],
    });

    const exp = result.explanations[0];
    expect(exp.surprise_score).toBeLessThan(1.0);
  });

  // TEST 11: All-numeric dataset
  it("should handle all-numeric dataset with no text columns", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_ALL_NUMERIC,
      target_rows: [3],
    });

    expect(result.explanations).toHaveLength(1);
    const exp = result.explanations[0];
    expect(exp.surprise_score).toBeGreaterThan(1.0);
    expect(exp.driving_features.length).toBe(3);
  });

  // TEST 12: Mixed numeric/categorical dataset
  it("should use only numeric columns for distance computation in mixed datasets", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_MIXED,
      target_rows: [3],
    });

    const exp = result.explanations[0];
    const featureColumns = exp.driving_features.map((f) => f.column);
    expect(featureColumns).not.toContain("name");
    expect(featureColumns).not.toContain("category");
    expect(featureColumns).toContain("revenue");
    expect(featureColumns).toContain("employees");
  });

  // TEST 13: Single-column dataset
  it("should handle single numeric column dataset", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_SINGLE_COL,
      target_rows: [3],
    });

    expect(result.explanations).toHaveLength(1);
    const exp = result.explanations[0];
    expect(exp.surprise_score).toBeGreaterThan(1.0);
    expect(exp.driving_features).toHaveLength(1);
    expect(exp.driving_features[0].column).toBe("value");
    expect(exp.driving_features[0].contribution_pct).toBeCloseTo(100, 0);
  });

  // TEST 14: Surprise score is RMS of z-scores
  it("should compute surprise score as RMS of z-scores", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_ALL_NUMERIC,
      target_rows: [3],
    });

    const exp = result.explanations[0];
    expect(exp.surprise_score).toBeGreaterThan(2.0);
    expect(typeof exp.surprise_score).toBe("number");
    expect(Number.isFinite(exp.surprise_score)).toBe(true);
  });

  // TEST 15: ID column support
  it("should use id_column to label rows when provided", () => {
    const result = flowAnomalyExplain({
      csv_data: AE_BASIC_DATASET,
      target_rows: [3],
      id_column: "name",
    });

    const exp = result.explanations[0];
    expect(exp.row_id).toBe("Delta Co");
  });

});
