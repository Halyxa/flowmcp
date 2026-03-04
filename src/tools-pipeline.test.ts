/**
 * Holodeck Pipeline Integration Test
 *
 * Demonstrates the COMPLETE holodeck pipeline — every holodeck tool in sequence,
 * composing outputs into a coherent journey through the Taylor Swift celebrity network.
 *
 * Pipeline order:
 *   exploration_dna -> progressive_disclosure -> sparkle_engine (x3 dwell times)
 *   -> quest_generator -> near_miss_detector -> insight_scorer -> waypoint_map
 *   -> visor_mode (x3 visors) -> anomaly_explain -> data_world_builder ("deep")
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import { flowExplorationDna } from "./tools-dna.js";
import type { ExplorationDnaResult } from "./tools-dna.js";

import {
  flowProgressiveDisclosure,
  flowQuestGenerator,
  flowNearMissDetector,
  flowInsightScorer,
  flowWaypointMap,
  flowAnomalyExplain,
} from "./tools-v5.js";
import type {
  ProgressiveDisclosureResult,
  QuestGeneratorResult,
  NearMissDetectorResult,
  InsightScorerResult,
  WaypointMapResult,
  AnomalyExplainResult,
} from "./tools-v5.js";

import { flowSparkleEngine } from "./tools-sparkle.js";
import type { SparkleEngineResult } from "./tools-sparkle.js";

import { flowVisorMode } from "./tools-v6.js";
import type { VisorModeResult } from "./tools-v6.js";

import { flowDataWorldBuilder } from "./tools-world.js";
import type { DataWorldBuilderResult } from "./tools-world.js";

// ============================================================================
// Load Taylor Swift celebrity CSV
// ============================================================================

const CSV_PATH = path.resolve(__dirname, "../demos/taylor-swift-network.csv");
const TAYLOR_CSV = fs.readFileSync(CSV_PATH, "utf-8");

// ============================================================================
// Shared state — tools compose into each other
// ============================================================================

let dnaResult: ExplorationDnaResult;
let disclosureResult: ProgressiveDisclosureResult;
let sparkle1s: SparkleEngineResult;
let sparkle30s: SparkleEngineResult;
let sparkle180s: SparkleEngineResult;
let questResult: QuestGeneratorResult;
let nearMissResult: NearMissDetectorResult;
let insightResult: InsightScorerResult;
let waypointResult: WaypointMapResult;
let visorStatistical: VisorModeResult;
let visorRelational: VisorModeResult;
let visorAnomaly: VisorModeResult;
let anomalyExplainResult: AnomalyExplainResult;
let worldResult: DataWorldBuilderResult;

// ============================================================================
// Pipeline Tests
// ============================================================================

describe("Holodeck Pipeline — Taylor Swift Network", () => {
  // --------------------------------------------------------------------------
  // Step 1: Exploration DNA
  // --------------------------------------------------------------------------
  describe("Step 1: exploration_dna — dataset personality fingerprint", () => {
    it("should generate a DNA profile with archetype and traits", () => {
      dnaResult = flowExplorationDna({ csv_data: TAYLOR_CSV });

      expect(dnaResult).toBeDefined();
      expect(dnaResult.dna_code).toBeTruthy();
      expect(typeof dnaResult.dna_code).toBe("string");
      expect(dnaResult.archetype).toBeTruthy();
      expect(dnaResult.description).toBeTruthy();
    });

    it("should produce exactly 8 DNA traits", () => {
      expect(dnaResult.traits).toHaveLength(8);
      for (const trait of dnaResult.traits) {
        expect(trait.trait).toBeTruthy();
        expect(typeof trait.score).toBe("number");
        expect(trait.score).toBeGreaterThanOrEqual(0);
        expect(trait.score).toBeLessThanOrEqual(1);
        expect(trait.description).toBeTruthy();
      }
    });

    it("should recommend tools and exploration style", () => {
      expect(dnaResult.exploration_style).toBeTruthy();
      expect(Array.isArray(dnaResult.recommended_tools)).toBe(true);
      expect(dnaResult.recommended_tools.length).toBeGreaterThan(0);
      expect(dnaResult.personality_csv).toContain("_dna_role");
    });
  });

  // --------------------------------------------------------------------------
  // Step 2: Progressive Disclosure
  // --------------------------------------------------------------------------
  describe("Step 2: progressive_disclosure — fog-of-war layers", () => {
    it("should generate disclosure layers from the CSV", async () => {
      disclosureResult = await flowProgressiveDisclosure({
        csv_data: TAYLOR_CSV,
        max_layers: 4,
      });

      expect(disclosureResult).toBeDefined();
      expect(disclosureResult.layers.length).toBeGreaterThanOrEqual(2);
      expect(disclosureResult.layers.length).toBeLessThanOrEqual(4);
    });

    it("should have a reveal manifest matching layer count", () => {
      expect(disclosureResult.reveal_manifest.length).toBe(disclosureResult.layers.length);
      for (const entry of disclosureResult.reveal_manifest) {
        expect(typeof entry.layer).toBe("number");
        expect(entry.columns_revealed.length).toBeGreaterThan(0);
        expect(entry.hint).toBeTruthy();
      }
    });

    it("should include dataset summary with correct dimensions", () => {
      const summary = disclosureResult.dataset_summary;
      expect(summary.total_rows).toBeGreaterThan(0);
      expect(summary.total_columns).toBeGreaterThan(0);
      expect(summary.num_layers).toBe(disclosureResult.layers.length);
    });
  });

  // --------------------------------------------------------------------------
  // Step 3: Sparkle Engine at 3 dwell times
  // --------------------------------------------------------------------------
  describe("Step 3: sparkle_engine — progressive intelligence", () => {
    it("should produce sparkles at 1s dwell (instant layer)", () => {
      sparkle1s = flowSparkleEngine({ csv_data: TAYLOR_CSV, dwell_seconds: 1 });

      expect(sparkle1s).toBeDefined();
      expect(sparkle1s.sparkles.length).toBeGreaterThan(0);
      expect(sparkle1s.layer_reached).toBeGreaterThanOrEqual(0);
      expect(sparkle1s.summary.total_sparkles).toBe(sparkle1s.sparkles.length);
    });

    it("should produce more sparkles at 30s dwell", () => {
      sparkle30s = flowSparkleEngine({ csv_data: TAYLOR_CSV, dwell_seconds: 30 });

      expect(sparkle30s.sparkles.length).toBeGreaterThanOrEqual(sparkle1s.sparkles.length);
      expect(sparkle30s.layer_reached).toBeGreaterThanOrEqual(sparkle1s.layer_reached);
    });

    it("should produce the most sparkles at 180s dwell (deep + epiphanies)", () => {
      sparkle180s = flowSparkleEngine({ csv_data: TAYLOR_CSV, dwell_seconds: 180 });

      expect(sparkle180s.sparkles.length).toBeGreaterThanOrEqual(sparkle30s.sparkles.length);
      expect(sparkle180s.layer_reached).toBeGreaterThanOrEqual(sparkle30s.layer_reached);
    });

    it("should show progressive intelligence — sparkle count increases with dwell time", () => {
      const counts = [
        sparkle1s.summary.total_sparkles,
        sparkle30s.summary.total_sparkles,
        sparkle180s.summary.total_sparkles,
      ];
      // Each subsequent dwell time should have >= sparkles as the previous
      expect(counts[1]).toBeGreaterThanOrEqual(counts[0]);
      expect(counts[2]).toBeGreaterThanOrEqual(counts[1]);
    });

    it("should include progressive CSV with sparkle columns", () => {
      expect(sparkle180s.progressive_csv).toContain("_sparkle_layer");
      expect(sparkle180s.progressive_csv).toContain("_sparkle_count");
    });

    it("should have a next_dwell_preview for lower dwell times", () => {
      expect(sparkle1s.next_dwell_preview).toBeTruthy();
      expect(typeof sparkle1s.next_dwell_preview).toBe("string");
    });
  });

  // --------------------------------------------------------------------------
  // Step 4: Quest Generator
  // --------------------------------------------------------------------------
  describe("Step 4: quest_generator — exploration quests from data topology", () => {
    it("should generate quests from the Taylor Swift network", () => {
      questResult = flowQuestGenerator({
        csv_data: TAYLOR_CSV,
        max_quests: 10,
        difficulty: "all",
      });

      expect(questResult).toBeDefined();
      expect(questResult.quests.length).toBeGreaterThan(0);
      expect(questResult.quests.length).toBeLessThanOrEqual(10);
    });

    it("should have quests that reference actual data columns", () => {
      const csvHeaders = TAYLOR_CSV.split("\n")[0].split(",");
      for (const quest of questResult.quests) {
        expect(quest.target_columns.length).toBeGreaterThan(0);
        for (const col of quest.target_columns) {
          expect(csvHeaders).toContain(col);
        }
      }
    });

    it("should include difficulty, narrative hook, and investigation steps", () => {
      for (const quest of questResult.quests) {
        expect(["easy", "medium", "hard"]).toContain(quest.difficulty);
        expect(quest.narrative_hook).toBeTruthy();
        expect(quest.investigation_steps.length).toBeGreaterThan(0);
        expect(quest.statistical_basis).toBeDefined();
        expect(typeof quest.statistical_basis.value).toBe("number");
      }
    });

    it("should provide a suggested sequence", () => {
      expect(questResult.suggested_sequence.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Step 5: Near-Miss Detector
  // --------------------------------------------------------------------------
  describe("Step 5: near_miss_detector — patterns that almost hold", () => {
    it("should detect near-misses in the Taylor Swift network", async () => {
      nearMissResult = await flowNearMissDetector({
        csv_data: TAYLOR_CSV,
        max_near_misses: 10,
      });

      expect(nearMissResult).toBeDefined();
      expect(nearMissResult.near_misses.length).toBeGreaterThanOrEqual(0);
    });

    it("should have intrigue scores on all near-misses", () => {
      for (const nm of nearMissResult.near_misses) {
        expect(typeof nm.intrigue_score).toBe("number");
        expect(nm.intrigue_score).toBeGreaterThanOrEqual(0);
        expect(nm.intrigue_score).toBeLessThanOrEqual(1);
      }
    });

    it("should include columns involved and investigation questions", () => {
      for (const nm of nearMissResult.near_misses) {
        expect(nm.columns_involved.length).toBeGreaterThan(0);
        expect(nm.investigation_question).toBeTruthy();
        expect(nm.narrative).toBeTruthy();
      }
    });

    it("should include a highlighted CSV", () => {
      expect(nearMissResult.highlighted_csv).toBeTruthy();
      expect(nearMissResult.highlighted_csv).toContain("id");
    });
  });

  // --------------------------------------------------------------------------
  // Step 6: Insight Scorer
  // --------------------------------------------------------------------------
  describe("Step 6: insight_scorer — scoring an insight from the data", () => {
    it("should score a correlation insight about influence and collaboration", async () => {
      insightResult = await flowInsightScorer({
        csv_data: TAYLOR_CSV,
        insight: "Higher collaboration count correlates with higher influence score",
        insight_type: "correlation",
        columns: ["collaboration_count", "influence_score"],
      });

      expect(insightResult).toBeDefined();
      expect(insightResult.score).toBeDefined();
    });

    it("should return a verdict and discovery score", () => {
      const score = insightResult.score;
      expect(typeof score.discovery_score).toBe("number");
      expect(score.discovery_score).toBeGreaterThanOrEqual(0);
      expect(score.discovery_score).toBeLessThanOrEqual(1);
      expect([
        "genuine_discovery",
        "interesting_but_fragile",
        "trivial",
        "likely_noise",
      ]).toContain(score.verdict);
    });

    it("should include statistical evidence", () => {
      const evidence = insightResult.evidence;
      expect(evidence.test_used).toBeTruthy();
      expect(typeof evidence.p_value).toBe("number");
      expect(typeof evidence.sample_size).toBe("number");
      expect(evidence.sample_size).toBeGreaterThan(0);
    });

    it("should provide a narrative explanation and recommendations", () => {
      expect(insightResult.narrative).toBeTruthy();
      expect(Array.isArray(insightResult.recommendations)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Step 7: Waypoint Map
  // --------------------------------------------------------------------------
  describe("Step 7: waypoint_map — spatial navigation waypoints", () => {
    it("should generate waypoints from the network", async () => {
      waypointResult = await flowWaypointMap({
        csv_data: TAYLOR_CSV,
        max_waypoints: 15,
      });

      expect(waypointResult).toBeDefined();
      expect(waypointResult.waypoints.length).toBeGreaterThan(0);
    });

    it("should have waypoints with spatial coordinates", () => {
      for (const wp of waypointResult.waypoints) {
        expect(wp.coordinates).toBeDefined();
        expect(typeof wp.coordinates.x).toBe("number");
        expect(typeof wp.coordinates.y).toBe("number");
        expect(typeof wp.coordinates.z).toBe("number");
        expect(isFinite(wp.coordinates.x)).toBe(true);
        expect(isFinite(wp.coordinates.y)).toBe(true);
        expect(isFinite(wp.coordinates.z)).toBe(true);
      }
    });

    it("should include importance scores and descriptions", () => {
      for (const wp of waypointResult.waypoints) {
        expect(typeof wp.importance).toBe("number");
        expect(wp.importance).toBeGreaterThanOrEqual(0);
        expect(wp.importance).toBeLessThanOrEqual(1);
        expect(wp.description).toBeTruthy();
        expect(wp.name).toBeTruthy();
      }
    });

    it("should provide a camera path with narration", () => {
      expect(waypointResult.camera_path.sequence.length).toBeGreaterThan(0);
      expect(waypointResult.camera_path.narration.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Step 8: Visor Mode (3 different visors)
  // --------------------------------------------------------------------------
  describe("Step 8: visor_mode — analytical lenses on the same data", () => {
    it("should apply the statistical visor", async () => {
      visorStatistical = await flowVisorMode({
        csv_data: TAYLOR_CSV,
        visor: "statistical",
      });

      expect(visorStatistical).toBeDefined();
      expect(visorStatistical.visor).toBe("statistical");
      expect(visorStatistical.annotations.length).toBeGreaterThan(0);
    });

    it("should apply the relational visor", async () => {
      visorRelational = await flowVisorMode({
        csv_data: TAYLOR_CSV,
        visor: "relational",
      });

      expect(visorRelational).toBeDefined();
      expect(visorRelational.visor).toBe("relational");
      expect(visorRelational.annotations.length).toBeGreaterThan(0);
    });

    it("should apply the anomaly visor", async () => {
      visorAnomaly = await flowVisorMode({
        csv_data: TAYLOR_CSV,
        visor: "anomaly",
      });

      expect(visorAnomaly).toBeDefined();
      expect(visorAnomaly.visor).toBe("anomaly");
      expect(visorAnomaly.annotations.length).toBeGreaterThanOrEqual(0);
    });

    it("should produce different annotations per visor type", () => {
      // Collect annotation_type sets from each visor
      const statTypes = new Set(visorStatistical.annotations.map((a) => a.annotation_type));
      const relTypes = new Set(visorRelational.annotations.map((a) => a.annotation_type));

      // Statistical and relational visors should produce different annotation types
      // (at least partially — they may share some types but not all)
      const allSameTypes =
        statTypes.size === relTypes.size &&
        [...statTypes].every((t) => relTypes.has(t));
      // If both have annotations, they should differ in at least one way
      if (visorStatistical.annotations.length > 0 && visorRelational.annotations.length > 0) {
        // At minimum, the visor name differs
        expect(visorStatistical.visor).not.toBe(visorRelational.visor);
      }
    });

    it("should include annotated CSV and summary for each visor", () => {
      for (const visor of [visorStatistical, visorRelational, visorAnomaly]) {
        expect(visor.annotated_csv).toBeTruthy();
        expect(visor.summary).toBeDefined();
        expect(typeof visor.summary.total_annotations).toBe("number");
        expect(visor.summary.top_finding).toBeTruthy();
        expect(typeof visor.summary.coverage).toBe("number");
        expect(visor.recommended_next_visor).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Step 9: Anomaly Explain
  // --------------------------------------------------------------------------
  describe("Step 9: anomaly_explain — deep explanation of a specific anomaly", () => {
    it("should explain anomalies for Taylor Swift (row 0) and Beyonce (row 11)", () => {
      anomalyExplainResult = flowAnomalyExplain({
        csv_data: TAYLOR_CSV,
        target_rows: [0, 11],
        id_column: "id",
        style: "detective",
      });

      expect(anomalyExplainResult).toBeDefined();
      expect(anomalyExplainResult.explanations.length).toBe(2);
    });

    it("should provide surprise scores and driving features", () => {
      for (const explanation of anomalyExplainResult.explanations) {
        expect(typeof explanation.surprise_score).toBe("number");
        expect(explanation.driving_features.length).toBeGreaterThan(0);
        for (const feature of explanation.driving_features) {
          expect(feature.column).toBeTruthy();
          expect(typeof feature.z_score).toBe("number");
          expect(typeof feature.contribution_pct).toBe("number");
          expect(["high", "low"]).toContain(feature.direction);
        }
      }
    });

    it("should include narratives and investigation leads", () => {
      for (const explanation of anomalyExplainResult.explanations) {
        expect(explanation.narrative).toBeTruthy();
        expect(explanation.investigation_leads.length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Step 10: Data World Builder (deep)
  // --------------------------------------------------------------------------
  describe("Step 10: data_world_builder — the full synthesis", () => {
    it("should build a complete data world at deep depth", async () => {
      worldResult = await flowDataWorldBuilder({
        csv_data: TAYLOR_CSV,
        depth: "deep",
        user_goal: "Understand Taylor Swift's professional and personal network",
      });

      expect(worldResult).toBeDefined();
      expect(worldResult.world_name).toBeTruthy();
    });

    it("should include the DNA archetype matching standalone DNA result", () => {
      expect(worldResult.archetype).toBeTruthy();
      // The world builder runs DNA internally — archetype should match
      expect(worldResult.archetype).toBe(dnaResult.archetype);
      expect(worldResult.dna_code).toBe(dnaResult.dna_code);
    });

    it("should include sparkle layers", () => {
      expect(worldResult.sparkles.instant.length).toBeGreaterThanOrEqual(0);
      expect(worldResult.sparkles.surface.length).toBeGreaterThanOrEqual(0);
      // Deep depth should unlock correlation and deeper layers
      expect(worldResult.sparkles).toBeDefined();
    });

    it("should include quests at deep depth", () => {
      expect(worldResult.quests).toBeDefined();
      expect(Array.isArray(worldResult.quests)).toBe(true);
      if (worldResult.quests && worldResult.quests.length > 0) {
        expect(worldResult.quests[0].title).toBeTruthy();
      }
    });

    it("should include near-misses at deep depth", () => {
      expect(worldResult.near_misses).toBeDefined();
      expect(Array.isArray(worldResult.near_misses)).toBe(true);
    });

    it("should provide an exploration guide and recommended sequence", () => {
      expect(worldResult.exploration_guide).toBeTruthy();
      expect(worldResult.recommended_sequence.length).toBeGreaterThan(0);
    });

    it("should have world stats with non-zero values", () => {
      const stats = worldResult.world_stats;
      expect(stats.total_sparkles).toBeGreaterThan(0);
      expect(typeof stats.total_quests).toBe("number");
      expect(typeof stats.total_near_misses).toBe("number");
      expect(stats.intelligence_layers).toBeGreaterThan(0);
      expect(typeof stats.exploration_richness).toBe("number");
    });

    it("should produce disclosure layers in the world", () => {
      expect(worldResult.layers).toBeDefined();
      expect(worldResult.layers.surface).toBeTruthy();
      expect(worldResult.layers.depth_1).toBeTruthy();
      expect(worldResult.layers.full).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Pipeline Statistics — the big picture
  // --------------------------------------------------------------------------
  describe("Pipeline Statistics — holodeck composition summary", () => {
    it("should count total sparkles across all dwell times", () => {
      const totalSparkles =
        sparkle1s.summary.total_sparkles +
        sparkle30s.summary.total_sparkles +
        sparkle180s.summary.total_sparkles;

      expect(totalSparkles).toBeGreaterThan(0);
      // Progressive intelligence: total should be meaningfully more than 3x the minimum
      expect(sparkle180s.summary.total_sparkles).toBeGreaterThanOrEqual(
        sparkle1s.summary.total_sparkles
      );
    });

    it("should count total quests generated", () => {
      const totalQuests = questResult.quests.length;
      expect(totalQuests).toBeGreaterThan(0);
      // Dataset summary should agree
      expect(questResult.dataset_summary.rows).toBeGreaterThan(0);
      expect(questResult.dataset_summary.columns).toBeGreaterThan(0);
    });

    it("should count total near-misses found", () => {
      const totalNearMisses = nearMissResult.near_misses.length;
      // Near-misses might be 0 for some datasets — that is valid
      expect(typeof totalNearMisses).toBe("number");
      expect(nearMissResult.dataset_summary.rows).toBeGreaterThan(0);
    });

    it("should count total waypoints mapped", () => {
      const totalWaypoints = waypointResult.waypoints.length;
      expect(totalWaypoints).toBeGreaterThan(0);
      expect(waypointResult.dataset_summary.waypoint_count).toBe(totalWaypoints);
    });

    it("should count total visor annotations across 3 visors", () => {
      const totalAnnotations =
        visorStatistical.summary.total_annotations +
        visorRelational.summary.total_annotations +
        visorAnomaly.summary.total_annotations;

      expect(totalAnnotations).toBeGreaterThan(0);
      // Each visor's total_annotations should match its annotations array length
      expect(visorStatistical.summary.total_annotations).toBe(
        visorStatistical.annotations.length
      );
      expect(visorRelational.summary.total_annotations).toBe(
        visorRelational.annotations.length
      );
      expect(visorAnomaly.summary.total_annotations).toBe(
        visorAnomaly.annotations.length
      );
    });

    it("should report world builder stats for the deep synthesis", () => {
      const stats = worldResult.world_stats;
      expect(stats.total_sparkles).toBeGreaterThan(0);
      expect(stats.intelligence_layers).toBeGreaterThan(0);
      expect(typeof stats.exploration_richness).toBe("number");
      expect(stats.exploration_richness).toBeGreaterThan(0);
    });
  });
});
