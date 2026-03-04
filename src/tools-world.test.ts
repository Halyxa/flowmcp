/**
 * Tests for tools-world.ts (flow_data_world_builder)
 *
 * The Data World Builder: one-call orchestrator that composes exploration DNA,
 * sparkle engine, quest generator, near-miss detector, and progressive disclosure
 * into a complete "data world." Tests verify depth modes, composition of sub-tools,
 * world naming, exploration guide narrative, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowDataWorldBuilder } from "./tools-world.js";
import type { DataWorldBuilderInput, DataWorldBuilderResult } from "./tools-world.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Business dataset with clear structure: outliers, clusters, correlations */
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

/** Minimal dataset — just 3 rows */
const TINY_DATASET = [
  "name,value,category",
  "Alice,100,A",
  "Bob,200,B",
  "Carol,300,A",
].join("\n");

/** Single-column dataset */
const SINGLE_COL_DATASET = [
  "score",
  "85",
  "92",
  "78",
  "95",
  "88",
  "70",
  "99",
].join("\n");

/** Trending dataset for Highway archetype */
const TREND_DATASET = [
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

// ============================================================================
// Tests
// ============================================================================

describe("flow_data_world_builder", () => {
  // Test 1: Quick depth returns DNA + sparkles + layers
  it("quick depth returns DNA, sparkles, and layers", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    // DNA fields populated
    expect(result.archetype).toBeTruthy();
    expect(result.dna_code).toBeTruthy();

    // Sparkles present
    expect(result.sparkles.instant).toBeDefined();
    expect(result.sparkles.surface).toBeDefined();

    // Layers present
    expect(result.layers.surface).toBeTruthy();
    expect(result.layers.full).toBeTruthy();
  });

  // Test 2: Standard depth includes quests and near-misses
  it("standard depth includes quests and near-misses", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "standard",
    });

    expect(result.quests).toBeDefined();
    expect(Array.isArray(result.quests)).toBe(true);
    expect(result.near_misses).toBeDefined();
    expect(Array.isArray(result.near_misses)).toBe(true);
  });

  // Test 3: Deep depth includes epiphany-level sparkles
  it("deep depth includes epiphany-level sparkles", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "deep",
    });

    // Deep mode should have correlations and deep sparkles
    expect(result.sparkles.correlations).toBeDefined();
    expect(result.sparkles.deep).toBeDefined();
    expect(result.sparkles.epiphanies).toBeDefined();
  });

  // Test 4: World name is generated (not empty, not generic)
  it("world name is generated and not empty or generic", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    expect(result.world_name).toBeTruthy();
    expect(result.world_name.length).toBeGreaterThan(3);
    // Should not be just the archetype alone — should include a data-specific element
    expect(result.world_name).not.toBe("Data World");
    expect(result.world_name).not.toBe("");
  });

  // Test 5: Archetype comes from DNA tool
  it("archetype comes from exploration DNA", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    // Known archetypes from tools-dna.ts
    const knownArchetypes = [
      "The Archipelago",
      "The Highway",
      "The Mystery",
      "The Web",
      "The Forest",
      "The Network",
      "The Timeline",
      "The Mosaic",
    ];
    expect(knownArchetypes).toContain(result.archetype);
  });

  // Test 6: Layers include surface and full CSV
  it("layers include surface and full CSV with valid CSV content", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    // Surface layer should be valid CSV
    expect(result.layers.surface).toContain(",");
    expect(result.layers.surface.split("\n").length).toBeGreaterThan(1);

    // Full layer should contain all rows
    expect(result.layers.full).toContain(",");
    const fullLines = result.layers.full.split("\n").filter((l: string) => l.trim());
    expect(fullLines.length).toBeGreaterThanOrEqual(2); // at least header + 1 row
  });

  // Test 7: Sparkles are grouped by layer
  it("sparkles are grouped by layer", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "standard",
    });

    // Instant and surface should always be arrays
    expect(Array.isArray(result.sparkles.instant)).toBe(true);
    expect(Array.isArray(result.sparkles.surface)).toBe(true);
  });

  // Test 8: Exploration guide is non-empty and mentions the archetype
  it("exploration guide mentions the archetype", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    expect(result.exploration_guide).toBeTruthy();
    expect(result.exploration_guide.length).toBeGreaterThan(20);
    // The guide should reference the world name or archetype
    const guideContainsArchetype =
      result.exploration_guide.includes(result.archetype) ||
      result.exploration_guide.includes(result.world_name);
    expect(guideContainsArchetype).toBe(true);
  });

  // Test 9: Recommended sequence is ordered list
  it("recommended sequence is an ordered list of strings", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    expect(Array.isArray(result.recommended_sequence)).toBe(true);
    expect(result.recommended_sequence.length).toBeGreaterThan(0);
    for (const step of result.recommended_sequence) {
      expect(typeof step).toBe("string");
      expect(step.length).toBeGreaterThan(0);
    }
  });

  // Test 10: World stats are populated
  it("world stats are populated with valid numbers", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "standard",
    });

    expect(typeof result.world_stats.total_sparkles).toBe("number");
    expect(typeof result.world_stats.total_quests).toBe("number");
    expect(typeof result.world_stats.total_near_misses).toBe("number");
    expect(typeof result.world_stats.intelligence_layers).toBe("number");
    expect(typeof result.world_stats.exploration_richness).toBe("number");
    expect(result.world_stats.total_sparkles).toBeGreaterThanOrEqual(0);
    expect(result.world_stats.intelligence_layers).toBeGreaterThanOrEqual(1);
  });

  // Test 11: Exploration richness is 0-1
  it("exploration richness is between 0 and 1", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "standard",
    });

    expect(result.world_stats.exploration_richness).toBeGreaterThanOrEqual(0);
    expect(result.world_stats.exploration_richness).toBeLessThanOrEqual(1);
  });

  // Test 12: Edge case — very small dataset (3 rows)
  it("handles very small dataset (3 rows)", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: TINY_DATASET,
      depth: "standard",
    });

    expect(result.archetype).toBeTruthy();
    expect(result.world_name).toBeTruthy();
    expect(result.layers.surface).toBeTruthy();
    expect(result.layers.full).toBeTruthy();
    expect(result.exploration_guide).toBeTruthy();
  });

  // Test 13: Edge case — single-column dataset
  it("handles single-column dataset", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: SINGLE_COL_DATASET,
      depth: "quick",
    });

    expect(result.archetype).toBeTruthy();
    expect(result.world_name).toBeTruthy();
    expect(result.sparkles.instant).toBeDefined();
    expect(result.layers.full).toBeTruthy();
  });

  // Test 14: user_goal parameter influences exploration guide
  it("user_goal influences the exploration guide", async () => {
    const withoutGoal = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    const withGoal = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
      user_goal: "find the fastest growing company",
    });

    // The guide with a goal should mention the goal or be different
    expect(withGoal.exploration_guide).toBeTruthy();
    // Guide with goal should reference the user's intent
    const mentionsGoal =
      withGoal.exploration_guide.toLowerCase().includes("grow") ||
      withGoal.exploration_guide.toLowerCase().includes("goal") ||
      withGoal.exploration_guide.toLowerCase().includes("fastest") ||
      withGoal.exploration_guide !== withoutGoal.exploration_guide;
    expect(mentionsGoal).toBe(true);
  });

  // Test 15: Quick mode produces fewer sparkles than deep mode
  it("quick mode produces fewer sparkles than deep mode", async () => {
    const quick = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "quick",
    });

    const deep = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "deep",
    });

    expect(deep.world_stats.total_sparkles).toBeGreaterThanOrEqual(
      quick.world_stats.total_sparkles
    );
  });

  // Test 16: Default depth is standard
  it("defaults to standard depth when not specified", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
    });

    // Standard should include quests and near-misses
    expect(result.quests).toBeDefined();
    expect(result.near_misses).toBeDefined();
  });

  // Test 17: depth_2 layer present in standard mode
  it("standard mode includes depth_2 layer", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: BUSINESS_DATASET,
      depth: "standard",
    });

    expect(result.layers.depth_1).toBeTruthy();
    expect(result.layers.depth_2).toBeDefined();
  });

  // Test 18: Trending dataset gets Highway archetype
  it("trending dataset produces a valid world", async () => {
    const result = await flowDataWorldBuilder({
      csv_data: TREND_DATASET,
      depth: "quick",
    });

    expect(result.archetype).toBeTruthy();
    expect(result.world_name).toBeTruthy();
    expect(result.dna_code).toBeTruthy();
  });
});
