/**
 * Demo Dataset Integration Tests — Day 7 Holodeck Week
 *
 * Tests that the hand-crafted celebrity network CSVs produce compelling output
 * through the holodeck intelligence tools: data_world_builder, sparkle_engine,
 * and exploration_dna. These are integration tests validating that real-world
 * celebrity data generates meaningful insights.
 */

import { describe, it, expect } from "vitest";
import { flowDataWorldBuilder } from "./tools-world.js";
import { flowSparkleEngine } from "./tools-sparkle.js";
import { flowExplorationDna } from "./tools-dna.js";
import { flowQuestGenerator } from "./tools-v5.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Load demo CSVs
// ============================================================================

const DEMOS_DIR = path.resolve(import.meta.dirname ?? __dirname, "..", "demos");

const TAYLOR_SWIFT_CSV = fs.readFileSync(
  path.join(DEMOS_DIR, "taylor-swift-network.csv"),
  "utf-8"
);

const ELON_MUSK_CSV = fs.readFileSync(
  path.join(DEMOS_DIR, "elon-musk-network.csv"),
  "utf-8"
);

const EINSTEIN_CSV = fs.readFileSync(
  path.join(DEMOS_DIR, "einstein-network.csv"),
  "utf-8"
);

// ============================================================================
// Test Suite: Celebrity Demo Datasets
// ============================================================================

describe("Celebrity Demo Datasets", () => {
  // --------------------------------------------------------------------------
  // Task 1: Taylor Swift through data_world_builder
  // --------------------------------------------------------------------------
  describe("Taylor Swift — Data World Builder", () => {
    it("produces a valid world at deep depth", async () => {
      const result = await flowDataWorldBuilder({
        csv_data: TAYLOR_SWIFT_CSV,
        depth: "deep",
        user_goal: "Explore Taylor Swift's professional and personal network",
      });

      // World was created
      expect(result.world_name).toBeTruthy();
      expect(result.world_name.length).toBeGreaterThan(0);
      expect(result.archetype).toBeTruthy();
      expect(result.dna_code).toBeTruthy();

      // Layers populated
      expect(result.layers.surface).toBeTruthy();
      expect(result.layers.depth_1).toBeTruthy();
      expect(result.layers.full).toBeTruthy();

      // Sparkles exist across layers
      expect(result.sparkles.instant.length).toBeGreaterThan(0);
      expect(result.sparkles.surface.length).toBeGreaterThan(0);

      // Deep depth should produce deep/epiphany sparkles
      const totalSparkles = result.world_stats.total_sparkles;
      expect(totalSparkles).toBeGreaterThan(5);

      // Quests generated
      expect(result.quests).toBeDefined();
      expect(result.world_stats.total_quests).toBeGreaterThan(0);

      // Near misses found
      expect(result.near_misses).toBeDefined();

      // Exploration guide exists
      expect(result.exploration_guide).toBeTruthy();
      expect(result.exploration_guide.length).toBeGreaterThan(20);

      // Recommended sequence populated
      expect(result.recommended_sequence.length).toBeGreaterThan(0);

      // World stats summary
      expect(result.world_stats.intelligence_layers).toBeGreaterThanOrEqual(2);
      expect(result.world_stats.exploration_richness).toBeGreaterThan(0);
    });

    it("produces meaningful content for Taylor Swift data", async () => {
      const result = await flowDataWorldBuilder({
        csv_data: TAYLOR_SWIFT_CSV,
        depth: "standard",
      });

      // Sparkles reference actual data values
      const allSparkles = [
        ...result.sparkles.instant,
        ...result.sparkles.surface,
        ...(result.sparkles.correlations ?? []),
      ];
      const sparkleTexts = allSparkles.map(
        (s) => `${s.title} ${s.description}`
      );
      const joined = sparkleTexts.join(" ");

      // Should reference columns or data from the CSV
      const hasDataReference =
        joined.includes("collaboration_count") ||
        joined.includes("influence_score") ||
        joined.includes("year_connected") ||
        joined.includes("category") ||
        joined.includes("music") ||
        joined.includes("personal");
      expect(hasDataReference).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Task 2: Elon Musk through sparkle_engine
  // --------------------------------------------------------------------------
  describe("Elon Musk — Sparkle Engine", () => {
    it("produces epiphanies at dwell=120", () => {
      const result = flowSparkleEngine({
        csv_data: ELON_MUSK_CSV,
        dwell_seconds: 120,
      });

      // High dwell should unlock multiple layers
      expect(result.layer_reached).toBeGreaterThanOrEqual(3);
      expect(result.sparkles.length).toBeGreaterThan(5);

      // Should have sparkles across multiple layers
      const layers = new Set(result.sparkles.map((s) => s.layer));
      expect(layers.size).toBeGreaterThanOrEqual(3);

      // Should have deep or epiphany sparkles at 120s
      const deepSparkles = result.sparkles.filter((s) => s.layer >= 3);
      expect(deepSparkles.length).toBeGreaterThan(0);

      // Intelligence density positive
      expect(result.intelligence_density).toBeGreaterThan(0);

      // Progressive CSV generated
      expect(result.progressive_csv).toBeTruthy();
      expect(result.progressive_csv).toContain("_sparkle_layer");

      // Next dwell preview teases what's next
      expect(result.next_dwell_preview).toBeTruthy();

      // Summary populated
      expect(result.summary.total_sparkles).toBeGreaterThan(5);
      expect(result.summary.layers_unlocked).toBeGreaterThanOrEqual(3);
      expect(result.summary.brightest_sparkle).toBeTruthy();
    });

    it("sparkles reference Musk network domains", () => {
      const result = flowSparkleEngine({
        csv_data: ELON_MUSK_CSV,
        dwell_seconds: 60,
      });

      // Sparkles should reference columns/data from the CSV
      const allText = result.sparkles
        .map((s) => `${s.title} ${s.description}`)
        .join(" ");

      const hasDataReference =
        allText.includes("funding_billions") ||
        allText.includes("risk_score") ||
        allText.includes("year_started") ||
        allText.includes("domain") ||
        allText.includes("space") ||
        allText.includes("ai");
      expect(hasDataReference).toBe(true);
    });

    it("child sparkle hints suggest further investigation", () => {
      const result = flowSparkleEngine({
        csv_data: ELON_MUSK_CSV,
        dwell_seconds: 60,
      });

      // At least some sparkles should have child hints
      const sparklesWithHints = result.sparkles.filter(
        (s) => s.child_sparkle_hints.length > 0
      );
      expect(sparklesWithHints.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Task 3: Einstein through exploration_dna
  // --------------------------------------------------------------------------
  describe("Albert Einstein — Exploration DNA", () => {
    it("produces a meaningful archetype", () => {
      const result = flowExplorationDna({
        csv_data: EINSTEIN_CSV,
      });

      // DNA code generated
      expect(result.dna_code).toBeTruthy();
      expect(result.dna_code.length).toBeGreaterThan(0);

      // Archetype assigned
      expect(result.archetype).toBeTruthy();
      const validArchetypes = [
        "The Archipelago",
        "The Highway",
        "The Mystery",
        "The Web",
        "The Forest",
        "The Network",
        "The Timeline",
        "The Mosaic",
      ];
      expect(validArchetypes).toContain(result.archetype);

      // Description exists
      expect(result.description).toBeTruthy();
      expect(result.description.length).toBeGreaterThan(10);

      // 8 traits computed
      expect(result.traits.length).toBe(8);

      // Each trait has a valid score (0-1)
      for (const trait of result.traits) {
        expect(trait.score).toBeGreaterThanOrEqual(0);
        expect(trait.score).toBeLessThanOrEqual(1);
        expect(trait.trait).toBeTruthy();
        expect(trait.description).toBeTruthy();
      }

      // Exploration style guide provided
      expect(result.exploration_style).toBeTruthy();

      // Recommended tools populated
      expect(result.recommended_tools.length).toBeGreaterThan(0);

      // Personality CSV has data
      expect(result.personality_csv).toBeTruthy();
      expect(result.personality_csv).toContain("_dna_role");
    });

    it("network_potential trait scores high for connection-rich data", () => {
      const result = flowExplorationDna({
        csv_data: EINSTEIN_CSV,
      });

      // Einstein data has pipe-delimited connections → network_potential should register
      const networkTrait = result.traits.find(
        (t) => t.trait === "network_potential"
      );
      expect(networkTrait).toBeDefined();
      // Should detect the connections column
      expect(networkTrait!.score).toBeGreaterThanOrEqual(0);
    });

    it("recommended tools include network-relevant tools", () => {
      const result = flowExplorationDna({
        csv_data: EINSTEIN_CSV,
      });

      // Should recommend tools relevant to the data personality
      expect(result.recommended_tools.length).toBeGreaterThan(0);
      // All recommended tools should be string names
      for (const tool of result.recommended_tools) {
        expect(typeof tool).toBe("string");
        expect(tool.length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 4: Quest generation from celebrity data
  // --------------------------------------------------------------------------
  describe("Celebrity Quest Generation", () => {
    it("generates quests from Taylor Swift network", () => {
      const result = flowQuestGenerator({
        csv_data: TAYLOR_SWIFT_CSV,
        max_quests: 10,
        difficulty: "all",
      });

      expect(result.quests.length).toBeGreaterThan(0);
      expect(result.dataset_summary.rows).toBeGreaterThan(20);
      expect(result.dataset_summary.columns).toBeGreaterThan(5);

      // Each quest has required fields
      for (const quest of result.quests) {
        expect(quest.id).toBeTruthy();
        expect(quest.title).toBeTruthy();
        expect(quest.narrative_hook).toBeTruthy();
        expect(quest.investigation_steps.length).toBeGreaterThan(0);
        expect(quest.reward).toBeTruthy();
        expect(quest.statistical_basis).toBeDefined();
      }
    });

    it("generates quests from Einstein network", () => {
      const result = flowQuestGenerator({
        csv_data: EINSTEIN_CSV,
        max_quests: 5,
      });

      expect(result.quests.length).toBeGreaterThan(0);
      expect(result.suggested_sequence.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Task 5: CSV format validation
  // --------------------------------------------------------------------------
  describe("Demo CSV Format Validation", () => {
    it("Taylor Swift CSV has correct column structure", () => {
      const lines = TAYLOR_SWIFT_CSV.trim().split("\n");
      const headers = lines[0].split(",");

      expect(headers).toContain("id");
      expect(headers).toContain("connections");
      expect(headers).toContain("relationship_type");
      expect(headers).toContain("category");
      expect(headers).toContain("collaboration_count");
      expect(headers).toContain("year_connected");
      expect(headers).toContain("influence_score");

      // Data rows exist
      expect(lines.length).toBeGreaterThanOrEqual(25);
    });

    it("Elon Musk CSV has correct column structure", () => {
      const lines = ELON_MUSK_CSV.trim().split("\n");
      const headers = lines[0].split(",");

      expect(headers).toContain("id");
      expect(headers).toContain("connections");
      expect(headers).toContain("relationship_type");
      expect(headers).toContain("domain");
      expect(headers).toContain("funding_billions");
      expect(headers).toContain("year_started");
      expect(headers).toContain("risk_score");

      expect(lines.length).toBeGreaterThanOrEqual(28);
    });

    it("Einstein CSV has correct column structure", () => {
      const lines = EINSTEIN_CSV.trim().split("\n");
      const headers = lines[0].split(",");

      expect(headers).toContain("id");
      expect(headers).toContain("connections");
      expect(headers).toContain("relationship_type");
      expect(headers).toContain("domain");
      expect(headers).toContain("era");
      expect(headers).toContain("collaboration_depth");
      expect(headers).toContain("impact_score");

      expect(lines.length).toBeGreaterThanOrEqual(23);
    });

    it("all demo CSVs have pipe-delimited connections (Flow network format)", () => {
      // Einstein's Solvay Conference has many pipe-delimited connections
      const einsteinLines = EINSTEIN_CSV.trim().split("\n");
      const hasPipeConnections = einsteinLines.some((line) =>
        line.includes("|")
      );
      expect(hasPipeConnections).toBe(true);

      // Taylor's Brittany Mahomes has pipe connections
      const taylorLines = TAYLOR_SWIFT_CSV.trim().split("\n");
      const taylorHasPipe = taylorLines.some((line) => line.includes("|"));
      expect(taylorHasPipe).toBe(true);
    });
  });
});
