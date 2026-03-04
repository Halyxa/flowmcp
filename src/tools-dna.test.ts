/**
 * Tests for tools-dna.ts (flow_exploration_dna)
 *
 * Exploration DNA: generates a unique fingerprint for any dataset — its personality,
 * character, and exploration style. Tests verify trait computation, archetype
 * classification, DNA codes, role assignment, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowExplorationDna } from "./tools-dna.js";
import type { ExplorationDnaInput, ExplorationDnaResult } from "./tools-dna.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

// Clearly clustered data: 3 tight groups separated by large gaps
const CLUSTERED_DATASET = [
  "x,y",
  "1,1",
  "1.1,1.2",
  "0.9,0.8",
  "1.2,1.1",
  "1.0,0.9",
  "10,10",
  "10.1,10.2",
  "9.9,9.8",
  "10.2,10.1",
  "10.0,9.9",
  "20,20",
  "20.1,20.2",
  "19.9,19.8",
  "20.2,20.1",
  "20.0,19.9",
].join("\n");

// Strong monotonic trend
const TRENDING_DATASET = [
  "time,value,noise",
  "1,10,5",
  "2,20,3",
  "3,30,7",
  "4,40,2",
  "5,50,8",
  "6,60,1",
  "7,70,6",
  "8,80,4",
  "9,90,9",
  "10,100,5",
].join("\n");

// Many outliers (high anomaly density)
const ANOMALY_DATASET = [
  "id,metric_a,metric_b",
  "1,50,50",
  "2,50,50",
  "3,50,50",
  "4,50,50",
  "5,200,50",
  "6,50,300",
  "7,-100,50",
  "8,50,-150",
  "9,500,50",
  "10,50,600",
  "11,50,50",
  "12,50,50",
].join("\n");

// Highly correlated columns
const CORRELATED_DATASET = [
  "a,b,c",
  "1,2,3",
  "2,4,6",
  "3,6,9",
  "4,8,12",
  "5,10,15",
  "6,12,18",
  "7,14,21",
  "8,16,24",
  "9,18,27",
  "10,20,30",
].join("\n");

// Network-like data with id+connections
const NETWORK_DATASET = [
  "id,name,connections",
  "1,Alice,2|3|4",
  "2,Bob,1|3",
  "3,Charlie,1|2|4|5",
  "4,Diana,1|3",
  "5,Eve,3",
].join("\n");

// Temporal data with dates
const TEMPORAL_DATASET = [
  "date,sales,inventory",
  "2024-01-01,100,500",
  "2024-02-01,120,480",
  "2024-03-01,150,460",
  "2024-04-01,180,440",
  "2024-05-01,200,420",
  "2024-06-01,250,400",
  "2024-07-01,300,380",
  "2024-08-01,350,360",
  "2024-09-01,400,340",
  "2024-10-01,450,320",
].join("\n");

// Single column dataset
const SINGLE_COLUMN_DATASET = [
  "value",
  "10",
  "20",
  "30",
  "40",
  "50",
].join("\n");

// Single row dataset
const SINGLE_ROW_DATASET = [
  "a,b,c",
  "1,2,3",
].join("\n");

// All identical values
const IDENTICAL_DATASET = [
  "x,y,z",
  "5,5,5",
  "5,5,5",
  "5,5,5",
  "5,5,5",
  "5,5,5",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_exploration_dna", () => {
  // Test 1: Clustered data -> "The Archipelago"
  it("classifies clustered data as The Archipelago", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    expect(result.archetype).toBe("The Archipelago");
    expect(result.dna_code).toContain("ARCH");
  });

  // Test 2: Trending data -> "The Highway"
  it("classifies trending data as The Highway", () => {
    const result = flowExplorationDna({ csv_data: TRENDING_DATASET });
    // The trending dataset has perfect monotonic increase in 'value' column
    expect(result.archetype).toBe("The Highway");
    expect(result.dna_code).toContain("HIGH");
  });

  // Test 3: Anomaly-rich data -> "The Mystery"
  it("classifies anomaly-rich data as The Mystery", () => {
    const result = flowExplorationDna({ csv_data: ANOMALY_DATASET });
    expect(result.archetype).toBe("The Mystery");
    expect(result.dna_code).toContain("MYST");
  });

  // Test 4: Highly correlated data -> "The Web"
  it("classifies highly correlated data as The Web", () => {
    const result = flowExplorationDna({ csv_data: CORRELATED_DATASET });
    expect(result.archetype).toBe("The Web");
    expect(result.dna_code).toContain("WEB");
  });

  // Test 5: All 8 traits computed with scores 0-1
  it("computes all 8 traits with scores between 0 and 1", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    expect(result.traits).toHaveLength(8);

    const traitNames = result.traits.map((t) => t.trait);
    expect(traitNames).toContain("cluster_richness");
    expect(traitNames).toContain("trend_strength");
    expect(traitNames).toContain("anomaly_density");
    expect(traitNames).toContain("correlation_density");
    expect(traitNames).toContain("dimensionality");
    expect(traitNames).toContain("uniqueness");
    expect(traitNames).toContain("network_potential");
    expect(traitNames).toContain("temporal_signal");

    for (const trait of result.traits) {
      expect(trait.score).toBeGreaterThanOrEqual(0);
      expect(trait.score).toBeLessThanOrEqual(1);
    }
  });

  // Test 6: DNA code is non-empty and follows format
  it("generates DNA code in correct format", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    expect(result.dna_code).toBeTruthy();
    // Format: CODE-CODE or CODE-CODE-CODE
    expect(result.dna_code).toMatch(/^[A-Z]{3,4}(-[A-Z]{3,4}){1,2}$/);
  });

  // Test 7: Description is non-empty and specific to archetype
  it("generates non-empty description specific to archetype", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    expect(result.description).toBeTruthy();
    expect(result.description.length).toBeGreaterThan(20);
    // Archipelago description should reference clusters/islands/groups
    expect(
      result.description.toLowerCase().includes("cluster") ||
      result.description.toLowerCase().includes("island") ||
      result.description.toLowerCase().includes("group") ||
      result.description.toLowerCase().includes("distinct")
    ).toBe(true);
  });

  // Test 8: Exploration style is non-empty
  it("generates non-empty exploration style", () => {
    const result = flowExplorationDna({ csv_data: TRENDING_DATASET });
    expect(result.exploration_style).toBeTruthy();
    expect(result.exploration_style.length).toBeGreaterThan(10);
  });

  // Test 9: Recommended tools list is non-empty
  it("returns non-empty recommended tools list", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    expect(result.recommended_tools).toBeTruthy();
    expect(result.recommended_tools.length).toBeGreaterThan(0);
    // Tools should be actual FlowMCP tool names
    for (const tool of result.recommended_tools) {
      expect(tool).toMatch(/^flow_/);
    }
  });

  // Test 10: Personality CSV has _dna_role column
  it("adds _dna_role column to personality CSV", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    const lines = result.personality_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    expect(headers).toContain("_dna_role");
  });

  // Test 11: Personality CSV has correct row count
  it("personality CSV has correct row count matching input", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    const inputLines = CLUSTERED_DATASET.trim().split("\n");
    const outputLines = result.personality_csv.trim().split("\n");
    // Same number of rows (header + data rows)
    expect(outputLines.length).toBe(inputLines.length);
  });

  // Test 12: Edge case: single-column dataset
  it("handles single-column dataset", () => {
    const result = flowExplorationDna({ csv_data: SINGLE_COLUMN_DATASET });
    expect(result.archetype).toBeTruthy();
    expect(result.traits).toHaveLength(8);
    expect(result.personality_csv).toBeTruthy();
  });

  // Test 13: Edge case: single-row dataset
  it("handles single-row dataset", () => {
    const result = flowExplorationDna({ csv_data: SINGLE_ROW_DATASET });
    expect(result.archetype).toBeTruthy();
    expect(result.traits).toHaveLength(8);
    expect(result.personality_csv).toBeTruthy();
  });

  // Test 14: Edge case: all identical values
  it("handles all identical values", () => {
    const result = flowExplorationDna({ csv_data: IDENTICAL_DATASET });
    expect(result.archetype).toBeTruthy();
    expect(result.traits).toHaveLength(8);
    // With identical values, most traits should be low/zero
    const clusterTrait = result.traits.find((t) => t.trait === "cluster_richness");
    expect(clusterTrait).toBeDefined();
    expect(clusterTrait!.score).toBeLessThanOrEqual(0.2);
  });

  // Test 15: Network data detected
  it("detects network potential in data with pipe-delimited connections", () => {
    const result = flowExplorationDna({ csv_data: NETWORK_DATASET });
    const networkTrait = result.traits.find((t) => t.trait === "network_potential");
    expect(networkTrait).toBeDefined();
    expect(networkTrait!.score).toBe(1);
  });

  // Test 16: Temporal signal detected
  it("detects temporal signal in date-containing data", () => {
    const result = flowExplorationDna({ csv_data: TEMPORAL_DATASET });
    const temporalTrait = result.traits.find((t) => t.trait === "temporal_signal");
    expect(temporalTrait).toBeDefined();
    expect(temporalTrait!.score).toBeGreaterThan(0.5);
  });

  // Test 17: DNA role values are valid
  it("assigns valid _dna_role values", () => {
    const result = flowExplorationDna({ csv_data: CLUSTERED_DATASET });
    const lines = result.personality_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const roleIdx = headers.indexOf("_dna_role");
    expect(roleIdx).toBeGreaterThanOrEqual(0);

    const validRoles = ["cluster_core", "bridge", "outlier", "trend_anchor"];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      expect(validRoles).toContain(row[roleIdx]);
    }
  });

  // Test 18: Each trait has non-empty description
  it("each trait has a non-empty description", () => {
    const result = flowExplorationDna({ csv_data: TRENDING_DATASET });
    for (const trait of result.traits) {
      expect(trait.description).toBeTruthy();
      expect(trait.description.length).toBeGreaterThan(5);
    }
  });
});
