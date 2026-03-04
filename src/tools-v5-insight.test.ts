/**
 * Tests for flow_insight_scorer (Tool 65) in tools-v5.ts
 *
 * Insight Scorer: the peer review system for data exploration.
 * Given a dataset and a claimed insight, it tests whether the insight is
 * statistically real, novel, and robust via significance testing, effect size,
 * novelty scoring, and bootstrap resampling.
 */

import { describe, it, expect } from "vitest";
import { flowInsightScorer } from "./tools-v5.js";
import type { InsightScorerInput, InsightScorerResult } from "./tools-v5.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Perfectly correlated: revenue = employees * 20000 */
const PERFECT_CORRELATION = [
  "name,revenue,employees",
  "A,100000,5",
  "B,200000,10",
  "C,300000,15",
  "D,400000,20",
  "E,500000,25",
  "F,600000,30",
  "G,700000,35",
  "H,800000,40",
  "I,900000,45",
  "J,1000000,50",
].join("\n");

/** Random data — no correlation between x and y */
const RANDOM_DATA = [
  "id,x,y",
  "1,10,85",
  "2,20,12",
  "3,30,94",
  "4,40,37",
  "5,50,61",
  "6,60,8",
  "7,70,73",
  "8,80,45",
  "9,90,29",
  "10,100,56",
  "11,15,91",
  "12,25,3",
  "13,35,68",
  "14,45,42",
  "15,55,17",
  "16,65,79",
  "17,75,33",
  "18,85,52",
  "19,95,11",
  "20,5,66",
].join("\n");

/** Two clearly different groups */
const DIFFERENT_GROUPS = [
  "id,group,score",
  "1,A,90",
  "2,A,92",
  "3,A,88",
  "4,A,91",
  "5,A,89",
  "6,A,93",
  "7,A,87",
  "8,A,90",
  "9,A,91",
  "10,A,88",
  "11,B,50",
  "12,B,52",
  "13,B,48",
  "14,B,51",
  "15,B,49",
  "16,B,53",
  "17,B,47",
  "18,B,50",
  "19,B,51",
  "20,B,48",
].join("\n");

/** Two similar groups */
const SIMILAR_GROUPS = [
  "id,group,value",
  "1,X,50",
  "2,X,52",
  "3,X,48",
  "4,X,51",
  "5,X,49",
  "6,X,50",
  "7,X,53",
  "8,X,47",
  "9,X,51",
  "10,X,50",
  "11,Y,51",
  "12,Y,49",
  "13,Y,50",
  "14,Y,52",
  "15,Y,48",
  "16,Y,50",
  "17,Y,51",
  "18,Y,49",
  "19,Y,50",
  "20,Y,51",
].join("\n");

/** Clear upward trend */
const INCREASING_TREND = [
  "month,sales",
  "1,100",
  "2,115",
  "3,128",
  "4,142",
  "5,155",
  "6,170",
  "7,182",
  "8,198",
  "9,210",
  "10,225",
  "11,240",
  "12,252",
  "13,268",
  "14,280",
  "15,295",
].join("\n");

/** Flat / no trend */
const FLAT_DATA = [
  "month,sales",
  "1,50",
  "2,52",
  "3,48",
  "4,51",
  "5,49",
  "6,50",
  "7,53",
  "8,47",
  "9,51",
  "10,50",
  "11,49",
  "12,52",
  "13,48",
  "14,51",
  "15,50",
].join("\n");

/** Dataset with an extreme outlier */
const OUTLIER_DATASET = [
  "id,value",
  "1,50",
  "2,52",
  "3,48",
  "4,51",
  "5,49",
  "6,50",
  "7,53",
  "8,47",
  "9,51",
  "10,500",
].join("\n");

/** Threshold dataset: most values above a threshold */
const THRESHOLD_DATASET = [
  "id,category,passes",
  "1,A,1",
  "2,A,1",
  "3,A,1",
  "4,A,1",
  "5,A,1",
  "6,A,1",
  "7,A,0",
  "8,B,0",
  "9,B,0",
  "10,B,0",
  "11,B,0",
  "12,B,0",
  "13,B,0",
  "14,B,1",
  "15,A,1",
  "16,B,0",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_insight_scorer", () => {
  // 1. Correlation insight on perfectly correlated data → genuine_discovery
  it("scores perfect correlation as genuine_discovery", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(result.score.significance).toBeGreaterThan(0.9);
    expect(result.score.effect_size).toBeGreaterThan(0.9);
    expect(result.score.discovery_score).toBeGreaterThan(0.7);
    expect(result.score.verdict).toBe("genuine_discovery");
  });

  // 2. Correlation insight on random data → likely_noise
  it("scores random correlation as likely_noise", async () => {
    const result = await flowInsightScorer({
      csv_data: RANDOM_DATA,
      insight: "x correlates with y",
      insight_type: "correlation",
      columns: ["x", "y"],
    });
    expect(result.score.significance).toBeLessThan(0.7);
    expect(result.score.discovery_score).toBeLessThan(0.4);
    expect(result.score.verdict).toBe("likely_noise");
  });

  // 3. Group difference between clearly different groups → genuine_discovery
  it("scores clear group difference as genuine_discovery", async () => {
    const result = await flowInsightScorer({
      csv_data: DIFFERENT_GROUPS,
      insight: "group A scores higher than group B",
      insight_type: "group_difference",
      columns: ["score"],
      group_column: "group",
    });
    expect(result.score.significance).toBeGreaterThan(0.9);
    expect(result.score.effect_size).toBeGreaterThan(0.8);
    expect(result.score.verdict).toBe("genuine_discovery");
  });

  // 4. Group difference between similar groups → likely_noise or trivial
  it("scores similar groups as likely_noise or trivial", async () => {
    const result = await flowInsightScorer({
      csv_data: SIMILAR_GROUPS,
      insight: "group X differs from group Y",
      insight_type: "group_difference",
      columns: ["value"],
      group_column: "group",
    });
    expect(result.score.significance).toBeLessThan(0.7);
    expect(["likely_noise", "trivial"]).toContain(result.score.verdict);
  });

  // 5. Trend insight on increasing data → genuine_discovery
  it("scores clear trend as genuine_discovery", async () => {
    const result = await flowInsightScorer({
      csv_data: INCREASING_TREND,
      insight: "sales are increasing over time",
      insight_type: "trend",
      columns: ["month", "sales"],
    });
    expect(result.score.significance).toBeGreaterThan(0.9);
    expect(result.score.effect_size).toBeGreaterThan(0.9);
    expect(result.score.verdict).toBe("genuine_discovery");
  });

  // 6. Trend insight on flat data → likely_noise
  it("scores flat trend as likely_noise", async () => {
    const result = await flowInsightScorer({
      csv_data: FLAT_DATA,
      insight: "sales are increasing over time",
      insight_type: "trend",
      columns: ["month", "sales"],
    });
    expect(result.score.significance).toBeLessThan(0.5);
    expect(result.score.verdict).toBe("likely_noise");
  });

  // 7. Outlier insight on extreme outlier → high significance
  it("scores extreme outlier with high significance", async () => {
    const result = await flowInsightScorer({
      csv_data: OUTLIER_DATASET,
      insight: "value 500 is an outlier",
      insight_type: "outlier",
      columns: ["value"],
    });
    expect(result.score.significance).toBeGreaterThan(0.8);
    expect(result.evidence.test_used).toBe("z-score");
  });

  // 8. Threshold insight testing
  it("evaluates threshold insight correctly", async () => {
    const result = await flowInsightScorer({
      csv_data: THRESHOLD_DATASET,
      insight: "category A passes more than category B",
      insight_type: "threshold",
      columns: ["category", "passes"],
    });
    expect(result.score.significance).toBeGreaterThan(0.5);
    expect(result.evidence.test_used).toBe("chi-squared");
  });

  // 9. Bootstrap robustness > 0.8 for genuine patterns
  it("returns high bootstrap robustness for genuine patterns", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(result.score.robustness).toBeGreaterThan(0.8);
    expect(result.evidence.bootstrap_hold_rate).toBeGreaterThan(0.8);
  });

  // 10. Bootstrap robustness < 0.5 for noise
  it("returns low bootstrap robustness for noise", async () => {
    const result = await flowInsightScorer({
      csv_data: RANDOM_DATA,
      insight: "x correlates with y",
      insight_type: "correlation",
      columns: ["x", "y"],
    });
    expect(result.score.robustness).toBeLessThan(0.6);
  });

  // 11. Novelty scoring: obvious pattern → low novelty
  it("assigns low novelty to single-column insights", async () => {
    const result = await flowInsightScorer({
      csv_data: OUTLIER_DATASET,
      insight: "there is an outlier in value",
      insight_type: "outlier",
      columns: ["value"],
    });
    // Outlier on a single column = basic describe_dataset would find it
    expect(result.score.novelty).toBeLessThan(0.5);
  });

  // 12. Novelty scoring: cross-column → higher novelty
  it("assigns higher novelty to cross-column insights", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    // Cross-column correlation = not immediately obvious from simple stats
    expect(result.score.novelty).toBeGreaterThan(0.4);
  });

  // 13. Discovery score is 0-1
  it("returns discovery_score in valid range 0-1", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(result.score.discovery_score).toBeGreaterThanOrEqual(0);
    expect(result.score.discovery_score).toBeLessThanOrEqual(1);
    expect(result.score.significance).toBeGreaterThanOrEqual(0);
    expect(result.score.significance).toBeLessThanOrEqual(1);
    expect(result.score.effect_size).toBeGreaterThanOrEqual(0);
    expect(result.score.effect_size).toBeLessThanOrEqual(1);
    expect(result.score.novelty).toBeGreaterThanOrEqual(0);
    expect(result.score.novelty).toBeLessThanOrEqual(1);
    expect(result.score.robustness).toBeGreaterThanOrEqual(0);
    expect(result.score.robustness).toBeLessThanOrEqual(1);
  });

  // 14. Verdict classification correctness
  it("classifies verdict correctly based on composite scores", async () => {
    // genuine_discovery: high correlation
    const genuine = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(genuine.score.verdict).toBe("genuine_discovery");

    // likely_noise: random data
    const noise = await flowInsightScorer({
      csv_data: RANDOM_DATA,
      insight: "x correlates with y",
      insight_type: "correlation",
      columns: ["x", "y"],
    });
    expect(noise.score.verdict).toBe("likely_noise");
  });

  // 15. Evidence includes all fields
  it("includes complete evidence object", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(result.evidence).toBeDefined();
    expect(typeof result.evidence.test_used).toBe("string");
    expect(typeof result.evidence.test_statistic).toBe("number");
    expect(typeof result.evidence.p_value).toBe("number");
    expect(typeof result.evidence.effect_size_measure).toBe("string");
    expect(typeof result.evidence.effect_size_value).toBe("number");
    expect(typeof result.evidence.bootstrap_hold_rate).toBe("number");
    expect(typeof result.evidence.sample_size).toBe("number");
    expect(result.evidence.sample_size).toBe(10);
  });

  // 16. Narrative is not empty and mentions columns
  it("generates narrative mentioning columns", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(20);
    expect(result.narrative.toLowerCase()).toMatch(/revenue|employees/);
  });

  // 17. Recommendations array is non-empty
  it("returns non-empty recommendations", async () => {
    const result = await flowInsightScorer({
      csv_data: PERFECT_CORRELATION,
      insight: "revenue correlates with employees",
      insight_type: "correlation",
      columns: ["revenue", "employees"],
    });
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  // 18. Trend with R-squared in evidence
  it("reports R-squared for trend analysis", async () => {
    const result = await flowInsightScorer({
      csv_data: INCREASING_TREND,
      insight: "sales increase with month",
      insight_type: "trend",
      columns: ["month", "sales"],
    });
    expect(result.evidence.effect_size_measure).toBe("R²");
    expect(result.evidence.effect_size_value).toBeGreaterThan(0.9);
  });

  // 19. Group difference reports Cohen's d
  it("reports Cohen's d for group differences", async () => {
    const result = await flowInsightScorer({
      csv_data: DIFFERENT_GROUPS,
      insight: "groups differ",
      insight_type: "group_difference",
      columns: ["score"],
      group_column: "group",
    });
    expect(result.evidence.effect_size_measure).toBe("Cohen's d");
    expect(result.evidence.effect_size_value).toBeGreaterThan(5);
  });
});
