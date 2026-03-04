/**
 * Tests for flow_progressive_disclosure (Tool 64) in tools-v5.ts
 *
 * Progressive disclosure: fog-of-war layers on any dataset.
 * Layer 0 = surface stats (names/IDs). Layer 3 = everything.
 * Like a JPG drawing in — the longer you dwell, the smarter the world gets.
 */

import { describe, it, expect } from "vitest";
import { flowProgressiveDisclosure } from "./tools-v5.js";
import type {
  ProgressiveDisclosureInput,
  ProgressiveDisclosureResult,
} from "./tools-v5.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Dataset with clear column hierarchy: id/name → primary metrics → derived */
const DISCLOSURE_DATASET = [
  "name,revenue,employees,growth,revenue_per_employee,sector,founded",
  "Acme Corp,5000000,250,12.5,20000,tech,1995",
  "Beta Inc,1200000,45,8.3,26667,retail,2005",
  "Gamma LLC,3500000,180,15.0,19444,tech,2000",
  "Delta Co,300000,12,2.1,25000,food,2015",
  "Epsilon Ltd,4500000,200,14.2,22500,tech,1998",
  "Zeta Corp,850000,30,5.2,28333,retail,2010",
  "Eta Inc,2700000,120,10.7,22500,health,2003",
  "Theta Co,2100000,90,7.4,23333,food,2008",
].join("\n");

/** Simple numeric dataset */
const SIMPLE_DATASET = [
  "id,score,bonus,penalty,adjusted_score",
  "A,85,10,2,93",
  "B,72,8,5,75",
  "C,91,12,1,102",
  "D,60,5,8,57",
  "E,78,9,3,84",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_progressive_disclosure", () => {
  // --- Layer generation ---

  it("should auto-assign columns to layers based on importance", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    expect(result.layers.length).toBeGreaterThanOrEqual(2);
    // Layer 0 should include identifier columns
    const layer0Cols = result.layers[0].columns;
    expect(layer0Cols).toContain("name");
  });

  it("should produce cumulative layers (each layer includes all previous columns)", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    for (let i = 1; i < result.layers.length; i++) {
      const prevCols = result.layers[i - 1].columns;
      const currCols = result.layers[i].columns;
      // Every column in layer N-1 should be in layer N
      for (const col of prevCols) {
        expect(currCols).toContain(col);
      }
      // Layer N should have more columns than N-1
      expect(currCols.length).toBeGreaterThan(prevCols.length);
    }
  });

  it("should generate valid CSV for each layer", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    for (const layer of result.layers) {
      expect(layer.csv).toBeTruthy();
      const lines = layer.csv.split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(1); // header + at least 1 row
      const headers = parseCSVLine(lines[0]);
      // All declared columns should be in the CSV headers
      for (const col of layer.columns) {
        expect(headers).toContain(col);
      }
    }
  });

  it("should include all data rows in every layer CSV", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    for (const layer of result.layers) {
      const lines = layer.csv.split("\n").filter(Boolean);
      expect(lines.length - 1).toBe(8); // 8 data rows
    }
  });

  // --- Manual column assignment ---

  it("should respect manual column_layers assignment", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: SIMPLE_DATASET,
      column_layers: {
        id: 0,
        score: 0,
        bonus: 1,
        penalty: 1,
        adjusted_score: 2,
      },
    });
    expect(result.layers[0].columns).toContain("id");
    expect(result.layers[0].columns).toContain("score");
    expect(result.layers[0].columns).not.toContain("adjusted_score");
    // Layer 2 should have everything
    const lastLayer = result.layers[result.layers.length - 1];
    expect(lastLayer.columns).toContain("adjusted_score");
  });

  // --- Always-visible columns ---

  it("should keep always_visible columns in every layer", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
      always_visible: ["name"],
    });
    for (const layer of result.layers) {
      expect(layer.columns).toContain("name");
    }
  });

  // --- Reveal manifest ---

  it("should generate reveal manifest with unlock hints", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    expect(result.reveal_manifest).toBeDefined();
    expect(result.reveal_manifest.length).toBeGreaterThan(0);
    for (const entry of result.reveal_manifest) {
      expect(entry.layer).toBeGreaterThanOrEqual(0);
      expect(entry.columns_revealed.length).toBeGreaterThan(0);
      expect(entry.hint.length).toBeGreaterThan(10);
    }
  });

  // --- Full CSV with visibility column ---

  it("should produce full CSV with _visibility_layer column", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    expect(result.full_csv).toBeTruthy();
    const lines = result.full_csv.split("\n").filter(Boolean);
    const headers = parseCSVLine(lines[0]);
    expect(headers).toContain("_visibility_layer");
  });

  // --- Number of layers ---

  it("should respect max_layers parameter", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
      max_layers: 2,
    });
    expect(result.layers.length).toBeLessThanOrEqual(2);
  });

  it("should generate at least 2 layers for any multi-column dataset", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: SIMPLE_DATASET,
    });
    expect(result.layers.length).toBeGreaterThanOrEqual(2);
  });

  // --- Layer descriptions ---

  it("should include descriptions for each layer", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    for (const layer of result.layers) {
      expect(layer.description.length).toBeGreaterThan(5);
    }
  });

  // --- Edge cases ---

  it("should handle single-column dataset", async () => {
    const singleCol = "value\n10\n20\n30\n40\n50";
    const result = await flowProgressiveDisclosure({ csv_data: singleCol });
    expect(result.layers.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle dataset with only ID columns", async () => {
    const idOnly = "name,id\nAlice,1\nBob,2\nCarol,3";
    const result = await flowProgressiveDisclosure({ csv_data: idOnly });
    expect(result.layers.length).toBeGreaterThanOrEqual(1);
    expect(result.layers[0].columns).toContain("name");
  });

  // --- Summary ---

  it("should include dataset summary", async () => {
    const result = await flowProgressiveDisclosure({
      csv_data: DISCLOSURE_DATASET,
    });
    expect(result.dataset_summary).toBeDefined();
    expect(result.dataset_summary.total_columns).toBe(7);
    expect(result.dataset_summary.total_rows).toBe(8);
    expect(result.dataset_summary.num_layers).toBeGreaterThanOrEqual(2);
  });
});
