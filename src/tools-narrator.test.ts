/**
 * Tests for tools-narrator.ts (flow_discovery_narrator)
 *
 * Discovery Narrator: turns data exploration into narrative stories.
 * Tests verify narrative generation, chapter structure, camera waypoints,
 * story arc classification, shareable summaries, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowDiscoveryNarrator } from "./tools-narrator.js";
import type { ExplorationStep, DiscoveryNarratorResult } from "./tools-narrator.js";

// ============================================================================
// Test datasets
// ============================================================================

const BUSINESS_DATA = [
  "company,revenue,employees,growth,region",
  "Alpha Inc,2500000,150,12.5,North",
  "Beta Corp,4800000,320,8.3,South",
  "Gamma LLC,9500000,580,22.1,East",
  "Delta Ltd,1200000,85,5.7,West",
  "Epsilon SA,3100000,210,15.2,North",
  "Zeta Corp,1800000,140,-3.4,South",
  "Eta Group,300000,25,7.8,East",
].join("\n");

const NETWORK_DATA = [
  "id,connections,group",
  "Alice,Bob|Charlie,Engineering",
  "Bob,Alice|Diana,Engineering",
  "Charlie,Alice|Eve,Design",
  "Diana,Bob|Eve,Management",
  "Eve,Charlie|Diana,Design",
].join("\n");

const SIMPLE_EXPLORATION: ExplorationStep[] = [
  { action: "viewed_column", target: "revenue", finding: "Range from 300K to 9.5M" },
  { action: "detected_anomaly", target: "Gamma LLC", finding: "Highest revenue AND growth" },
  { action: "found_correlation", target: "revenue vs employees", finding: "r=0.95" },
  { action: "discovered_outlier", target: "Zeta Corp", finding: "Negative growth despite mid revenue" },
];

const NETWORK_EXPLORATION: ExplorationStep[] = [
  { action: "viewed_node", target: "Alice", finding: "Connected to Bob and Charlie" },
  { action: "traversed_edge", target: "Alice -> Bob", finding: "Same group: Engineering" },
  { action: "traversed_edge", target: "Bob -> Diana", finding: "Cross-group: Engineering to Management" },
  { action: "discovered_bridge", target: "Diana", finding: "Connects Engineering and Design via Eve" },
];

// ============================================================================
// Tests
// ============================================================================

describe("flowDiscoveryNarrator", () => {
  it("generates a narrative with length > 100 that references actual data values", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(100);
    // Must reference actual data entities
    expect(result.narrative).toContain("Gamma");
    expect(result.narrative).toContain("Zeta");
  });

  it("follows discovery order: Gamma appears before Zeta in narrative", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    const gammaIdx = result.narrative.indexOf("Gamma");
    const zetaIdx = result.narrative.indexOf("Zeta");
    expect(gammaIdx).toBeGreaterThan(-1);
    expect(zetaIdx).toBeGreaterThan(-1);
    expect(gammaIdx).toBeLessThan(zetaIdx);
  });

  it("generates >= 2 chapters each with title, body, and exploration_step", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    for (const ch of result.chapters) {
      expect(ch.title).toBeTruthy();
      expect(ch.body).toBeTruthy();
      expect(typeof ch.exploration_step).toBe("number");
    }
  });

  it("generates camera waypoints > 0, each with position {x,y,z} and focus_label", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(result.camera_waypoints.length).toBeGreaterThan(0);
    for (const wp of result.camera_waypoints) {
      expect(wp.position).toBeDefined();
      expect(typeof wp.position.x).toBe("number");
      expect(typeof wp.position.y).toBe("number");
      expect(typeof wp.position.z).toBe("number");
      expect(wp.focus_label).toBeTruthy();
    }
  });

  it("works with network data and references node names", () => {
    const result = flowDiscoveryNarrator({ csv_data: NETWORK_DATA, exploration_path: NETWORK_EXPLORATION });
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(100);
    expect(result.narrative).toContain("Alice");
    expect(result.narrative).toContain("Diana");
  });

  it("assigns a valid story_arc", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(["journey", "discovery", "revelation", "convergence", "mystery"]).toContain(result.story_arc);
  });

  it("classifies journey arc for traversal-heavy paths", () => {
    const result = flowDiscoveryNarrator({ csv_data: NETWORK_DATA, exploration_path: NETWORK_EXPLORATION });
    // Network exploration is mostly traversals and node views
    expect(result.story_arc).toBe("journey");
  });

  it("classifies discovery arc for anomaly/outlier paths", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(result.story_arc).toBe("discovery");
  });

  it("generates a shareable summary that is truthy and < 280 chars", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    expect(result.shareable_summary).toBeTruthy();
    expect(result.shareable_summary.length).toBeLessThan(280);
  });

  it("handles a single exploration step", () => {
    const singleStep: ExplorationStep[] = [
      { action: "viewed_column", target: "revenue", finding: "Wide range" },
    ];
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: singleStep });
    expect(result.narrative).toBeTruthy();
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    expect(result.camera_waypoints.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty exploration path with generic narrative", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: [] });
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    expect(result.camera_waypoints.length).toBeGreaterThanOrEqual(1);
  });

  it("handles missing findings in exploration steps", () => {
    const noFindings: ExplorationStep[] = [
      { action: "viewed_column", target: "revenue" },
      { action: "detected_anomaly", target: "Gamma LLC" },
    ];
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: noFindings });
    expect(result.narrative).toBeTruthy();
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
  });

  it("supports csv_content alias via normalizeCsvArgs", () => {
    const result = flowDiscoveryNarrator({ csv_data: "", csv_content: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION } as any);
    expect(result.narrative).toBeTruthy();
    expect(result.narrative).toContain("Gamma");
  });

  it("camera waypoints have chapter_index matching chapter indices", () => {
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: SIMPLE_EXPLORATION });
    for (const wp of result.camera_waypoints) {
      expect(typeof wp.chapter_index).toBe("number");
      expect(wp.chapter_index).toBeGreaterThanOrEqual(0);
      expect(wp.chapter_index).toBeLessThan(result.chapters.length);
    }
  });

  it("convergence arc when multiple discovered_bridge actions", () => {
    const convergePath: ExplorationStep[] = [
      { action: "discovered_bridge", target: "NodeA", finding: "Connects X and Y" },
      { action: "discovered_bridge", target: "NodeB", finding: "Connects Y and Z" },
      { action: "discovered_bridge", target: "NodeC", finding: "Connects Z and W" },
    ];
    const result = flowDiscoveryNarrator({ csv_data: NETWORK_DATA, exploration_path: convergePath });
    expect(result.story_arc).toBe("convergence");
  });

  it("revelation arc when mostly found_correlation actions", () => {
    const revelationPath: ExplorationStep[] = [
      { action: "found_correlation", target: "a vs b", finding: "r=0.99" },
      { action: "found_correlation", target: "b vs c", finding: "r=0.98" },
      { action: "found_correlation", target: "a vs c", finding: "r=0.97" },
    ];
    const result = flowDiscoveryNarrator({ csv_data: BUSINESS_DATA, exploration_path: revelationPath });
    expect(result.story_arc).toBe("revelation");
  });
});
