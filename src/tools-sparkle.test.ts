/**
 * Tests for tools-sparkle.ts (flow_sparkle_engine)
 *
 * The Sparkle Engine: progressive intelligence that deepens with dwell time.
 * Like a JPG drawing in — first second = shape, 5 minutes = dense intelligence.
 * Tests verify layer progression, sparkle quality, focus filtering, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowSparkleEngine } from "./tools-sparkle.js";
import type { SparkleEngineInput, SparkleEngineResult, Sparkle } from "./tools-sparkle.js";

// ============================================================================
// Test datasets
// ============================================================================

const BUSINESS_DATASET = [
  "company,revenue,employees,growth,region",
  "Acme Corp,5000000,250,12.5,West",
  "Beta Inc,1200000,45,8.3,East",
  "Gamma LLC,9500000,800,25.1,West",
  "Delta Co,300000,12,2.1,South",
  "Epsilon Ltd,4500000,200,15.0,East",
  "Zeta Corp,850000,30,-5.2,North",
  "Eta Inc,7200000,500,18.7,West",
  "Theta Co,2100000,90,7.4,South",
  "Iota Ltd,6800000,450,22.3,East",
  "Kappa Inc,150000,5,0.8,North",
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

const SINGLE_ROW_DATASET = [
  "name,value,category",
  "only_one,42,alpha",
].join("\n");

const SINGLE_COLUMN_DATASET = [
  "score",
  "85",
  "92",
  "78",
  "95",
  "88",
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
  "Mega City,5000000,72",
  "Smalltown,45000,63",
].join("\n");

const TEMPORAL_DATASET = [
  "month,sales,returns",
  "Jan,1000,50",
  "Feb,1200,45",
  "Mar,1500,40",
  "Apr,1800,35",
  "May,2200,30",
  "Jun,2800,28",
  "Jul,3500,25",
  "Aug,4200,22",
  "Sep,5000,20",
  "Oct,6000,18",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_sparkle_engine", () => {
  // ==========================================================================
  // Test 1: Layer 0 — dwell=0 returns only shape sparkles
  // ==========================================================================
  it("layer 0: dwell=0 returns only shape/instant sparkles", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 0 });

    expect(result.layer_reached).toBe(0);
    expect(result.sparkles.length).toBeGreaterThan(0);
    // All sparkles should be layer 0
    for (const s of result.sparkles) {
      expect(s.layer).toBe(0);
    }
    // Should mention shape info (rows, columns, types)
    const allText = result.sparkles.map((s) => s.description).join(" ").toLowerCase();
    expect(
      allText.includes("row") || allText.includes("column") || allText.includes("numeric"),
    ).toBe(true);
  });

  // ==========================================================================
  // Test 2: Layer 1 — dwell=3 includes basic stat sparkles
  // ==========================================================================
  it("layer 1: dwell=3 includes surface stat sparkles", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 3 });

    expect(result.layer_reached).toBe(1);
    const layers = new Set(result.sparkles.map((s) => s.layer));
    expect(layers.has(0)).toBe(true);
    expect(layers.has(1)).toBe(true);
    // Should include stat-type sparkles
    const statSparkles = result.sparkles.filter((s) => s.type === "stat");
    expect(statSparkles.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 3: Layer 2 — dwell=15 includes correlation sparkles
  // ==========================================================================
  it("layer 2: dwell=15 includes correlation sparkles", () => {
    const result = flowSparkleEngine({ csv_data: CORRELATED_DATASET, dwell_seconds: 15 });

    expect(result.layer_reached).toBe(2);
    const layers = new Set(result.sparkles.map((s) => s.layer));
    expect(layers.has(2)).toBe(true);
    const corrSparkles = result.sparkles.filter((s) => s.type === "correlation");
    expect(corrSparkles.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 4: Layer 3 — dwell=60 includes cluster/trend sparkles
  // ==========================================================================
  it("layer 3: dwell=60 includes deep sparkles (trend/anomaly/connection)", () => {
    const result = flowSparkleEngine({ csv_data: TEMPORAL_DATASET, dwell_seconds: 60 });

    expect(result.layer_reached).toBe(3);
    const layers = new Set(result.sparkles.map((s) => s.layer));
    expect(layers.has(3)).toBe(true);
    // Deep layer should have trend or connection type sparkles
    const deepSparkles = result.sparkles.filter((s) => s.layer === 3);
    expect(deepSparkles.length).toBeGreaterThan(0);
    const deepTypes = new Set(deepSparkles.map((s) => s.type));
    expect(
      deepTypes.has("trend") || deepTypes.has("connection") || deepTypes.has("anomaly"),
    ).toBe(true);
  });

  // ==========================================================================
  // Test 5: Layer 4 — dwell=180 includes epiphany sparkles
  // ==========================================================================
  it("layer 4: dwell=180 includes epiphany sparkles", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 180 });

    expect(result.layer_reached).toBe(4);
    const layers = new Set(result.sparkles.map((s) => s.layer));
    expect(layers.has(4)).toBe(true);
    const epiphanies = result.sparkles.filter((s) => s.type === "epiphany");
    expect(epiphanies.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 6: Sparkle count increases with dwell time
  // ==========================================================================
  it("sparkle count increases with dwell time", () => {
    const r0 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 0 });
    const r1 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 3 });
    const r2 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 15 });
    const r3 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 60 });
    const r4 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 180 });

    expect(r1.sparkles.length).toBeGreaterThan(r0.sparkles.length);
    expect(r2.sparkles.length).toBeGreaterThan(r1.sparkles.length);
    expect(r3.sparkles.length).toBeGreaterThanOrEqual(r2.sparkles.length);
    expect(r4.sparkles.length).toBeGreaterThanOrEqual(r3.sparkles.length);
  });

  // ==========================================================================
  // Test 7: Each sparkle has non-empty title and description
  // ==========================================================================
  it("each sparkle has non-empty title and description", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 60 });

    for (const s of result.sparkles) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe("string");
      expect(typeof s.description).toBe("string");
    }
  });

  // ==========================================================================
  // Test 8: Child sparkle hints are non-empty for layers 1+
  // ==========================================================================
  it("child sparkle hints are non-empty for layers 1+", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 60 });

    const higherLayerSparkles = result.sparkles.filter((s) => s.layer >= 1);
    expect(higherLayerSparkles.length).toBeGreaterThan(0);
    for (const s of higherLayerSparkles) {
      expect(s.child_sparkle_hints.length).toBeGreaterThan(0);
      for (const hint of s.child_sparkle_hints) {
        expect(hint.length).toBeGreaterThan(0);
      }
    }
  });

  // ==========================================================================
  // Test 9: Intensity scores are 0-1
  // ==========================================================================
  it("intensity scores are between 0 and 1 inclusive", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 180 });

    for (const s of result.sparkles) {
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
    }
  });

  // ==========================================================================
  // Test 10: Progressive CSV has _sparkle_layer column
  // ==========================================================================
  it("progressive CSV has _sparkle_layer and _sparkle_count columns", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 15 });

    const lines = result.progressive_csv.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    const headers = lines[0].toLowerCase();
    expect(headers).toContain("_sparkle_layer");
    expect(headers).toContain("_sparkle_count");
  });

  // ==========================================================================
  // Test 11: Focus columns limits analysis scope
  // ==========================================================================
  it("focus_columns limits sparkle targets to specified columns", () => {
    const result = flowSparkleEngine({
      csv_data: BUSINESS_DATASET,
      dwell_seconds: 15,
      focus_columns: ["revenue", "employees"],
    });

    // Sparkles that reference columns should only reference focused ones
    const colSparkles = result.sparkles.filter((s) => s.target_column);
    for (const s of colSparkles) {
      expect(["revenue", "employees"]).toContain(s.target_column);
    }
  });

  // ==========================================================================
  // Test 12: Focus rows limits to specific rows
  // ==========================================================================
  it("focus_rows limits sparkle targets to specified row indices", () => {
    const result = flowSparkleEngine({
      csv_data: BUSINESS_DATASET,
      dwell_seconds: 15,
      focus_rows: [0, 1, 2],
    });

    // Row-targeted sparkles should only reference focused rows
    const rowSparkles = result.sparkles.filter(
      (s) => s.target_rows && s.target_rows.length > 0,
    );
    for (const s of rowSparkles) {
      for (const row of s.target_rows!) {
        expect(row).toBeLessThanOrEqual(2);
        expect(row).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // ==========================================================================
  // Test 13: next_dwell_preview changes based on current layer
  // ==========================================================================
  it("next_dwell_preview changes based on current layer", () => {
    const r0 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 0 });
    const r2 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 15 });
    const r4 = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 180 });

    // All should have non-empty preview
    expect(r0.next_dwell_preview.length).toBeGreaterThan(0);
    expect(r2.next_dwell_preview.length).toBeGreaterThan(0);
    expect(r4.next_dwell_preview.length).toBeGreaterThan(0);

    // Layer 0 and layer 2 should have different previews (different things to discover)
    expect(r0.next_dwell_preview).not.toBe(r2.next_dwell_preview);
  });

  // ==========================================================================
  // Test 14: Intelligence density calculated correctly
  // ==========================================================================
  it("intelligence density is sparkles per data point", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 15 });

    // 10 rows * 5 columns = 50 data points
    const expectedDensity = result.sparkles.length / 50;
    expect(result.intelligence_density).toBeCloseTo(expectedDensity, 4);
    expect(result.intelligence_density).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 15: Summary includes brightest sparkle
  // ==========================================================================
  it("summary includes correct brightest sparkle title", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 60 });

    expect(result.summary.total_sparkles).toBe(result.sparkles.length);
    expect(result.summary.layers_unlocked).toBe(result.layer_reached + 1);

    // Brightest sparkle should be the one with highest intensity
    const brightest = result.sparkles.reduce((a, b) => (a.intensity > b.intensity ? a : b));
    expect(result.summary.brightest_sparkle).toBe(brightest.title);
  });

  // ==========================================================================
  // Test 16: Edge case — single-row dataset
  // ==========================================================================
  it("handles single-row dataset without crashing", () => {
    const result = flowSparkleEngine({ csv_data: SINGLE_ROW_DATASET, dwell_seconds: 60 });

    expect(result.sparkles.length).toBeGreaterThan(0);
    expect(result.layer_reached).toBeGreaterThanOrEqual(0);
    expect(result.progressive_csv).toBeTruthy();
    // Should at least report shape
    const shapeSparkles = result.sparkles.filter((s) => s.layer === 0);
    expect(shapeSparkles.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 17: Edge case — single-column dataset
  // ==========================================================================
  it("handles single-column dataset without crashing", () => {
    const result = flowSparkleEngine({ csv_data: SINGLE_COLUMN_DATASET, dwell_seconds: 60 });

    expect(result.sparkles.length).toBeGreaterThan(0);
    expect(result.layer_reached).toBeGreaterThanOrEqual(0);
    expect(result.progressive_csv).toBeTruthy();
  });

  // ==========================================================================
  // Test 18: Sparkles reference actual data values (not generic text)
  // ==========================================================================
  it("sparkles reference actual data values, not generic text", () => {
    const result = flowSparkleEngine({ csv_data: OUTLIER_DATASET, dwell_seconds: 30 });

    // At least some sparkles should contain actual column names from the data
    const allText = result.sparkles.map((s) => `${s.title} ${s.description}`).join(" ");
    expect(
      allText.includes("population") ||
      allText.includes("avg_temp") ||
      allText.includes("city"),
    ).toBe(true);

    // Stats sparkles should contain actual numeric values
    const statSparkles = result.sparkles.filter((s) => s.type === "stat");
    if (statSparkles.length > 0) {
      const statText = statSparkles.map((s) => s.description).join(" ");
      // Should contain actual numbers, not just words
      expect(/\d+/.test(statText)).toBe(true);
    }
  });

  // ==========================================================================
  // Test 19: Default dwell_seconds when not provided
  // ==========================================================================
  it("defaults to dwell_seconds=1 when not provided", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET });

    // Default dwell=1 should reach layer 0 (0-1s range)
    expect(result.layer_reached).toBeLessThanOrEqual(1);
    expect(result.sparkles.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 20: Sparkle IDs are unique
  // ==========================================================================
  it("all sparkle IDs are unique", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 180 });

    const ids = result.sparkles.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // ==========================================================================
  // Test 21: Dwell clamped to max 300
  // ==========================================================================
  it("clamps dwell_seconds to max 300", () => {
    const result = flowSparkleEngine({ csv_data: BUSINESS_DATASET, dwell_seconds: 999 });

    // Should still work, reaching layer 4
    expect(result.layer_reached).toBe(4);
    expect(result.sparkles.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 22: Correlation sparkles reference column names from actual data
  // ==========================================================================
  it("correlation sparkles reference actual column names", () => {
    const result = flowSparkleEngine({ csv_data: CORRELATED_DATASET, dwell_seconds: 15 });

    const corrSparkles = result.sparkles.filter((s) => s.type === "correlation");
    expect(corrSparkles.length).toBeGreaterThan(0);
    const corrText = corrSparkles.map((s) => `${s.title} ${s.description}`).join(" ").toLowerCase();
    // Should mention actual column names from the correlated dataset
    expect(
      corrText.includes("hours_studied") ||
      corrText.includes("test_score") ||
      corrText.includes("absences"),
    ).toBe(true);
  });

  // ==========================================================================
  // Test 23: Outlier detection sparkles in outlier dataset
  // ==========================================================================
  it("detects outliers in dataset with clear outlier", () => {
    const result = flowSparkleEngine({ csv_data: OUTLIER_DATASET, dwell_seconds: 10 });

    const anomalySparkles = result.sparkles.filter(
      (s) => s.type === "anomaly" || s.type === "stat",
    );
    const allText = result.sparkles.map((s) => `${s.title} ${s.description}`).join(" ");
    // Should detect Mega City or the population outlier
    expect(
      allText.includes("Mega City") || allText.includes("5000000") || allText.includes("outlier"),
    ).toBe(true);
  });
});
