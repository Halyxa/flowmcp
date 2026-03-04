/**
 * Tests for flow_near_miss_detector (Tool 63) in tools-v5.ts
 *
 * Near-miss detector: finds patterns that ALMOST hold in data.
 * Correlations at the edge, cluster boundary points, trend breaks,
 * threshold rules with exceptions. The gambling psychology of data analysis.
 */

import { describe, it, expect } from "vitest";
import { flowNearMissDetector } from "./tools-v5.js";
import type { NearMissDetectorInput, NearMissDetectorResult } from "./tools-v5.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Dataset with a strong correlation that has ONE outlier breaking it */
const CORRELATION_NEARMISS = [
  "id,hours_studied,test_score",
  "S1,2,55",
  "S2,4,65",
  "S3,6,75",
  "S4,8,85",
  "S5,10,95",
  "S6,12,100",
  "S7,3,60",
  "S8,5,70",
  "S9,7,80",
  "S10,9,40", // outlier: studied 9 hours but scored 40
].join("\n");

/** Dataset with two clusters and a point right on the boundary */
const CLUSTER_BOUNDARY = [
  "id,income,spending",
  "A1,20000,18000",
  "A2,22000,19000",
  "A3,21000,18500",
  "A4,23000,20000",
  "A5,19000,17000",
  "B1,80000,40000",
  "B2,85000,42000",
  "B3,82000,41000",
  "B4,78000,39000",
  "B5,83000,41500",
  "BOUNDARY,50000,30000", // right between clusters
].join("\n");

/** Dataset with a trend that breaks in the middle */
const TREND_BREAK = [
  "month,sales",
  "Jan,100",
  "Feb,120",
  "Mar,140",
  "Apr,160",
  "May,180",
  "Jun,200",
  "Jul,90", // trend break
  "Aug,220",
  "Sep,240",
  "Oct,260",
  "Nov,280",
  "Dec,300",
].join("\n");

/** Dataset with threshold rule that has exceptions */
const THRESHOLD_RULE = [
  "id,age,income,owns_home",
  "P1,25,30000,no",
  "P2,28,35000,no",
  "P3,32,45000,no",
  "P4,35,55000,yes",
  "P5,38,60000,yes",
  "P6,42,70000,yes",
  "P7,45,80000,yes",
  "P8,48,75000,yes",
  "P9,50,90000,yes",
  "P10,33,52000,no", // exception: age 33, income 52k, but no (borderline)
].join("\n");

/** Dataset with near-perfect monotonic relationship */
const MONOTONIC_NEARMISS = [
  "id,temp_c,ice_cream_sales",
  "D1,5,100",
  "D2,10,200",
  "D3,15,300",
  "D4,20,400",
  "D5,25,500",
  "D6,30,350", // break: temp went up but sales went down
  "D7,35,700",
  "D8,40,800",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_near_miss_detector", () => {
  // --- Core near-miss types ---

  it("should detect correlation near-miss from outlier breaking strong pattern", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    expect(result.near_misses.length).toBeGreaterThan(0);

    const corrMiss = result.near_misses.find((nm) => nm.type === "correlation");
    expect(corrMiss).toBeDefined();
    // The correlation WOULD be very strong except for the outlier
    expect(corrMiss!.pattern_strength).toBeGreaterThan(0.5);
    // Should mention the outlier row(s)
    expect(corrMiss!.exception_rows.length).toBeGreaterThan(0);
  });

  it("should detect cluster boundary near-miss", async () => {
    const result = await flowNearMissDetector({
      csv_data: CLUSTER_BOUNDARY,
    });
    expect(result.near_misses.length).toBeGreaterThan(0);

    const clusterMiss = result.near_misses.find(
      (nm) => nm.type === "cluster_boundary"
    );
    expect(clusterMiss).toBeDefined();
    // BOUNDARY point should be flagged
    expect(clusterMiss!.exception_rows.length).toBeGreaterThan(0);
  });

  it("should detect trend break near-miss", async () => {
    const result = await flowNearMissDetector({
      csv_data: TREND_BREAK,
    });
    expect(result.near_misses.length).toBeGreaterThan(0);

    const trendMiss = result.near_misses.find((nm) => nm.type === "trend_break");
    expect(trendMiss).toBeDefined();
    // July's drop should be the exception
    expect(trendMiss!.exception_rows.length).toBeGreaterThan(0);
    expect(trendMiss!.narrative).toBeTruthy();
  });

  it("should detect monotonicity break near-miss", async () => {
    const result = await flowNearMissDetector({
      csv_data: MONOTONIC_NEARMISS,
    });
    expect(result.near_misses.length).toBeGreaterThan(0);

    // Should find the monotonicity break or trend break
    const found = result.near_misses.some(
      (nm) => nm.type === "trend_break" || nm.type === "correlation"
    );
    expect(found).toBe(true);
  });

  // --- Intrigue scoring ---

  it("should compute intrigue scores for all near-misses", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    for (const nm of result.near_misses) {
      expect(nm.intrigue_score).toBeGreaterThan(0);
      expect(nm.intrigue_score).toBeLessThanOrEqual(1);
    }
  });

  it("should return near-misses sorted by intrigue score descending", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    if (result.near_misses.length >= 2) {
      for (let i = 1; i < result.near_misses.length; i++) {
        expect(result.near_misses[i - 1].intrigue_score).toBeGreaterThanOrEqual(
          result.near_misses[i].intrigue_score
        );
      }
    }
  });

  // --- Narrative generation ---

  it("should generate narrative descriptions for near-misses", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    for (const nm of result.near_misses) {
      expect(nm.narrative.length).toBeGreaterThan(20);
      // Narrative should not be generic
      expect(nm.narrative).not.toContain("undefined");
    }
  });

  it("should generate investigation questions", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    for (const nm of result.near_misses) {
      expect(nm.investigation_question.length).toBeGreaterThan(10);
      // Should be an actual question
      expect(nm.investigation_question).toContain("?");
    }
  });

  // --- CSV highlight output ---

  it("should produce CSV with _near_miss_role column", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    expect(result.highlighted_csv).toBeTruthy();
    const lines = result.highlighted_csv.split("\n").filter(Boolean);
    expect(lines[0]).toContain("_near_miss_role");
    // Some rows should be marked as exception
    const exceptionRows = lines.filter((l) => l.includes("exception"));
    expect(exceptionRows.length).toBeGreaterThan(0);
  });

  // --- Configuration ---

  it("should respect max_near_misses parameter", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
      max_near_misses: 1,
    });
    expect(result.near_misses.length).toBeLessThanOrEqual(1);
  });

  it("should filter by near-miss type when specified", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
      types: ["correlation"],
    });
    for (const nm of result.near_misses) {
      expect(nm.type).toBe("correlation");
    }
  });

  // --- Edge cases ---

  it("should handle dataset with no near-misses (perfectly random)", async () => {
    // Perfectly linear relationship — no near-miss because it's perfect
    const perfectData = [
      "x,y",
      "1,2",
      "2,4",
      "3,6",
      "4,8",
      "5,10",
    ].join("\n");
    const result = await flowNearMissDetector({ csv_data: perfectData });
    // A perfect pattern has no near-misses — it's either a full pattern or nothing
    expect(result.near_misses).toBeDefined();
    expect(Array.isArray(result.near_misses)).toBe(true);
  });

  it("should handle single-column numeric dataset", async () => {
    const singleCol = [
      "value",
      "10",
      "12",
      "11",
      "13",
      "50", // outlier
      "11",
      "12",
    ].join("\n");
    const result = await flowNearMissDetector({ csv_data: singleCol });
    // Single column can't have correlations but might have threshold near-misses
    expect(result).toBeDefined();
  });

  it("should handle empty or minimal dataset gracefully", async () => {
    const tiny = "a,b\n1,2\n3,4".trim();
    const result = await flowNearMissDetector({ csv_data: tiny });
    expect(result.near_misses).toBeDefined();
    expect(result.dataset_summary).toBeDefined();
  });

  // --- Dataset summary ---

  it("should include dataset summary with near-miss density", async () => {
    const result = await flowNearMissDetector({
      csv_data: CORRELATION_NEARMISS,
    });
    expect(result.dataset_summary).toBeDefined();
    expect(result.dataset_summary.rows).toBe(10);
    expect(result.dataset_summary.columns).toBe(3);
    expect(result.dataset_summary.near_miss_density).toBeGreaterThanOrEqual(0);
  });
});
