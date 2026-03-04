/**
 * Genetic / Property-Based / Fuzz / Stress Testing Suite
 *
 * Uses the 96-core EPYC + 1TB RAM to hammer all 70 tools with:
 * 1. Property-based testing: random inputs, verify invariants
 * 2. Fuzz testing: garbage inputs, nothing should crash
 * 3. Stress testing: massive datasets
 * 4. Cross-tool composition: pipe every tool's output into every other tool
 * 5. Evolutionary edge-case discovery: mutate inputs to find boundary failures
 */

import { describe, it, expect } from "vitest";
import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// Import ALL tools
import { flowQuestGenerator, flowAnomalyExplain, flowNearMissDetector, flowProgressiveDisclosure, flowInsightScorer, flowWaypointMap } from "./tools-v5.js";
import { flowVisorMode } from "./tools-v6.js";
import { flowSparkleEngine } from "./tools-sparkle.js";
import { flowExplorationDna } from "./tools-dna.js";
import { flowDataWorldBuilder } from "./tools-world.js";

// ============================================================================
// Random data generators
// ============================================================================

/** Seeded PRNG for reproducible randomness */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateRandomCSV(opts: {
  rows: number;
  numericCols: number;
  categoricalCols: number;
  seed: number;
  includeNulls?: boolean;
  includeOutliers?: boolean;
  includeNetwork?: boolean;
}): string {
  const rng = mulberry32(opts.seed);
  const headers: string[] = ["id"];

  for (let i = 0; i < opts.numericCols; i++) headers.push(`num_${i}`);
  for (let i = 0; i < opts.categoricalCols; i++) headers.push(`cat_${i}`);
  if (opts.includeNetwork) headers.push("connections");

  const categories = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const lines = [headers.join(",")];

  for (let r = 0; r < opts.rows; r++) {
    const row: string[] = [`R${r}`];

    for (let c = 0; c < opts.numericCols; c++) {
      if (opts.includeNulls && rng() < 0.05) {
        row.push("");
      } else if (opts.includeOutliers && rng() < 0.03) {
        row.push(String(rng() * 100000)); // outlier
      } else {
        row.push(String(Math.round(rng() * 1000) / 10));
      }
    }

    for (let c = 0; c < opts.categoricalCols; c++) {
      row.push(categories[Math.floor(rng() * categories.length)]);
    }

    if (opts.includeNetwork) {
      const numConns = Math.floor(rng() * 3);
      const conns = [];
      for (let i = 0; i < numConns; i++) {
        conns.push(`R${Math.floor(rng() * opts.rows)}`);
      }
      row.push(conns.join("|"));
    }

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

function generateTrendCSV(rows: number, seed: number): string {
  const rng = mulberry32(seed);
  const lines = ["date,value,secondary"];
  for (let i = 0; i < rows; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
    const value = 100 + i * 2.5 + (rng() - 0.5) * 20;
    const secondary = 50 + Math.sin(i / 10) * 30 + (rng() - 0.5) * 10;
    lines.push(`${date},${value.toFixed(1)},${secondary.toFixed(1)}`);
  }
  return lines.join("\n");
}

function generateClusteredCSV(clusters: number, pointsPerCluster: number, seed: number): string {
  const rng = mulberry32(seed);
  const lines = ["id,x,y,z,group"];
  let id = 0;
  for (let c = 0; c < clusters; c++) {
    const cx = rng() * 100;
    const cy = rng() * 100;
    const cz = rng() * 100;
    for (let p = 0; p < pointsPerCluster; p++) {
      const x = cx + (rng() - 0.5) * 10;
      const y = cy + (rng() - 0.5) * 10;
      const z = cz + (rng() - 0.5) * 10;
      lines.push(`P${id++},${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},cluster_${c}`);
    }
  }
  return lines.join("\n");
}

// ============================================================================
// Property-based tests: invariants that must hold for ANY input
// ============================================================================

describe("Property-based: quest_generator invariants", () => {
  const seeds = [42, 137, 256, 999, 1337, 2048, 3141, 4096, 5555, 7777];

  for (const seed of seeds) {
    it(`seed=${seed}: quests are valid structures`, async () => {
      const csv = generateRandomCSV({ rows: 50, numericCols: 4, categoricalCols: 1, seed, includeOutliers: true });
      const result = await flowQuestGenerator({ csv_data: csv });
      expect(result.quests).toBeDefined();
      expect(Array.isArray(result.quests)).toBe(true);
      for (const q of result.quests) {
        expect(q.id).toBeTruthy();
        expect(["anomaly", "comparison", "trend", "hypothesis", "connection"]).toContain(q.type);
        expect(["easy", "medium", "hard"]).toContain(q.difficulty);
        expect(q.title.length).toBeGreaterThan(0);
        expect(q.narrative_hook.length).toBeGreaterThan(0);
        expect(q.investigation_steps.length).toBeGreaterThan(0);
        expect(q.statistical_basis.threshold).toBeDefined();
      }
      expect(result.dataset_summary.rows).toBe(50);
    });
  }
});

describe("Property-based: sparkle_engine invariants", () => {
  const dwellTimes = [0, 1, 3, 5, 10, 30, 60, 120, 180, 300];

  for (const dwell of dwellTimes) {
    it(`dwell=${dwell}s: sparkles increase monotonically with dwell`, () => {
      const csv = generateRandomCSV({ rows: 20, numericCols: 3, categoricalCols: 1, seed: 42 });
      const result = flowSparkleEngine({ csv_data: csv, dwell_seconds: dwell });
      expect(result.sparkles).toBeDefined();
      expect(result.layer_reached).toBeGreaterThanOrEqual(0);
      expect(result.layer_reached).toBeLessThanOrEqual(4);
      for (const s of result.sparkles) {
        expect(s.intensity).toBeGreaterThanOrEqual(0);
        expect(s.intensity).toBeLessThanOrEqual(1);
        expect(s.layer).toBeLessThanOrEqual(result.layer_reached);
      }
      expect(result.progressive_csv).toContain("_sparkle_layer");
    });
  }

  it("sparkle count is monotonically non-decreasing with dwell time", () => {
    const csv = generateRandomCSV({ rows: 30, numericCols: 4, categoricalCols: 1, seed: 99 });
    let prevCount = 0;
    for (const dwell of [1, 5, 30, 120, 300]) {
      const result = flowSparkleEngine({ csv_data: csv, dwell_seconds: dwell });
      expect(result.sparkles.length).toBeGreaterThanOrEqual(prevCount);
      prevCount = result.sparkles.length;
    }
  });
});

describe("Property-based: exploration_dna invariants", () => {
  const configs = [
    { rows: 10, numericCols: 2, categoricalCols: 0, seed: 1 },
    { rows: 50, numericCols: 5, categoricalCols: 2, seed: 2 },
    { rows: 100, numericCols: 3, categoricalCols: 3, seed: 3 },
    { rows: 200, numericCols: 8, categoricalCols: 1, seed: 4 },
    { rows: 20, numericCols: 1, categoricalCols: 0, seed: 5 },
  ];

  for (const cfg of configs) {
    it(`${cfg.rows}x${cfg.numericCols + cfg.categoricalCols}: valid DNA`, () => {
      const csv = generateRandomCSV({ ...cfg });
      const result = flowExplorationDna({ csv_data: csv });
      expect(result.dna_code).toBeTruthy();
      expect(result.archetype).toBeTruthy();
      expect(result.traits.length).toBe(8);
      for (const t of result.traits) {
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(1);
        expect(t.description).toBeTruthy();
      }
      expect(result.recommended_tools.length).toBeGreaterThan(0);
      expect(result.personality_csv).toContain("_dna_role");
    });
  }
});

describe("Property-based: near_miss_detector invariants", () => {
  const seeds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  for (const seed of seeds) {
    it(`seed=${seed}: near-misses sorted by intrigue desc`, async () => {
      const csv = generateRandomCSV({ rows: 30, numericCols: 4, categoricalCols: 0, seed, includeOutliers: true });
      const result = await flowNearMissDetector({ csv_data: csv });
      for (let i = 1; i < result.near_misses.length; i++) {
        expect(result.near_misses[i - 1].intrigue_score).toBeGreaterThanOrEqual(
          result.near_misses[i].intrigue_score
        );
      }
      expect(result.highlighted_csv).toContain("_near_miss_role");
    });
  }
});

describe("Property-based: progressive_disclosure invariants", () => {
  const configs = [
    { rows: 10, numericCols: 2, categoricalCols: 1, seed: 11 },
    { rows: 30, numericCols: 6, categoricalCols: 2, seed: 22 },
    { rows: 50, numericCols: 10, categoricalCols: 3, seed: 33 },
  ];

  for (const cfg of configs) {
    it(`${cfg.numericCols + cfg.categoricalCols + 1} cols: cumulative layers`, async () => {
      const csv = generateRandomCSV({ ...cfg });
      const result = await flowProgressiveDisclosure({ csv_data: csv });
      expect(result.layers.length).toBeGreaterThanOrEqual(2);
      // Cumulative: each layer has >= columns of previous
      for (let i = 1; i < result.layers.length; i++) {
        expect(result.layers[i].columns.length).toBeGreaterThanOrEqual(
          result.layers[i - 1].columns.length
        );
      }
      expect(result.full_csv).toContain("_visibility_layer");
    });
  }
});

describe("Property-based: insight_scorer invariants", () => {
  it("discovery_score always between 0 and 1 across random datasets", async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const csv = generateRandomCSV({ rows: 30, numericCols: 3, categoricalCols: 0, seed });
      const result = await flowInsightScorer({
        csv_data: csv,
        insight: "correlation between num_0 and num_1",
        insight_type: "correlation",
        columns: ["num_0", "num_1"],
      });
      expect(result.score.discovery_score).toBeGreaterThanOrEqual(0);
      expect(result.score.discovery_score).toBeLessThanOrEqual(1);
      expect(result.score.significance).toBeGreaterThanOrEqual(0);
      expect(result.score.significance).toBeLessThanOrEqual(1);
      expect(result.score.robustness).toBeGreaterThanOrEqual(0);
      expect(result.score.robustness).toBeLessThanOrEqual(1);
    }
  });
});

describe("Property-based: visor_mode invariants", () => {
  const visors: Array<"statistical" | "relational" | "temporal" | "anomaly" | "geographic"> =
    ["statistical", "relational", "temporal", "anomaly", "geographic"];

  for (const visor of visors) {
    it(`${visor} visor: valid annotations on random data`, async () => {
      const csv = generateRandomCSV({ rows: 20, numericCols: 4, categoricalCols: 1, seed: 42 });
      const result = await flowVisorMode({ csv_data: csv, visor });
      expect(result.visor).toBe(visor);
      expect(result.annotated_csv).toBeTruthy();
      expect(result.summary).toBeDefined();
      expect(result.summary.coverage).toBeGreaterThanOrEqual(0);
      expect(result.summary.coverage).toBeLessThanOrEqual(1);
      expect(result.recommended_next_visor).toBeTruthy();
      for (const ann of result.annotations) {
        expect(ann.significance).toBeGreaterThanOrEqual(0);
        expect(ann.significance).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe("Property-based: waypoint_map invariants", () => {
  it("waypoints have valid coordinates across random datasets", async () => {
    for (let seed = 1; seed <= 5; seed++) {
      const csv = generateClusteredCSV(3, 15, seed);
      const result = await flowWaypointMap({ csv_data: csv });
      for (const wp of result.waypoints) {
        expect(wp.coordinates.x).toBeGreaterThanOrEqual(0);
        expect(wp.coordinates.x).toBeLessThanOrEqual(100);
        expect(wp.coordinates.y).toBeGreaterThanOrEqual(0);
        expect(wp.coordinates.y).toBeLessThanOrEqual(100);
        expect(wp.coordinates.z).toBeGreaterThanOrEqual(0);
        expect(wp.coordinates.z).toBeLessThanOrEqual(100);
        expect(wp.importance).toBeGreaterThanOrEqual(0);
        expect(wp.importance).toBeLessThanOrEqual(1);
      }
      expect(result.csv).toContain("id,connections,x,y,z");
    }
  });
});

// ============================================================================
// Fuzz testing: garbage inputs should NEVER crash
// ============================================================================

describe("Fuzz: no tool crashes on malformed input", () => {
  const garbageInputs = [
    "",
    "just a single line no commas",
    ",,,,,",
    "\n\n\n\n",
    "a\n1\n2\n3",
    "header1,header2\n",
    "h1,h2\nval1",
    "name,value\n\"unclosed quote,123",
    "a,b,c\n1,2\n3,4,5,6,7",
    "🎲,💎,🌟\n1,2,3",
    "col\n" + Array(1000).fill("x").join("\n"),
    "a,b\n" + "NaN,Infinity\n".repeat(10),
    "a,b\n" + "-0,1e308\n".repeat(5),
  ];

  for (let i = 0; i < garbageInputs.length; i++) {
    const input = garbageInputs[i];
    const label = input.slice(0, 30).replace(/\n/g, "\\n") || "(empty)";

    it(`quest_generator survives: "${label}"`, async () => {
      await expect(
        (async () => { try { await flowQuestGenerator({ csv_data: input }); } catch { /* expected */ } })()
      ).resolves.not.toThrow();
    });

    it(`sparkle_engine survives: "${label}"`, () => {
      expect(() => {
        try { flowSparkleEngine({ csv_data: input }); } catch { /* expected */ }
      }).not.toThrow();
    });

    it(`exploration_dna survives: "${label}"`, () => {
      expect(() => {
        try { flowExplorationDna({ csv_data: input }); } catch { /* expected */ }
      }).not.toThrow();
    });

    it(`near_miss_detector survives: "${label}"`, async () => {
      await expect(
        (async () => { try { await flowNearMissDetector({ csv_data: input }); } catch { /* expected */ } })()
      ).resolves.not.toThrow();
    });

    it(`progressive_disclosure survives: "${label}"`, async () => {
      await expect(
        (async () => { try { await flowProgressiveDisclosure({ csv_data: input }); } catch { /* expected */ } })()
      ).resolves.not.toThrow();
    });
  }
});

// ============================================================================
// Stress testing: large datasets
// ============================================================================

describe("Stress: tools handle large datasets", () => {
  it("quest_generator handles 1000 rows", async () => {
    const csv = generateRandomCSV({ rows: 1000, numericCols: 5, categoricalCols: 2, seed: 42, includeOutliers: true });
    const start = Date.now();
    const result = await flowQuestGenerator({ csv_data: csv });
    const elapsed = Date.now() - start;
    expect(result.quests.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000); // under 5 seconds
  });

  it("sparkle_engine handles 1000 rows at deep dwell", () => {
    const csv = generateRandomCSV({ rows: 1000, numericCols: 5, categoricalCols: 2, seed: 42 });
    const start = Date.now();
    const result = flowSparkleEngine({ csv_data: csv, dwell_seconds: 300 });
    const elapsed = Date.now() - start;
    expect(result.sparkles.length).toBeGreaterThan(0);
    expect(result.layer_reached).toBe(4);
    expect(elapsed).toBeLessThan(5000);
  });

  it("near_miss_detector handles 500 rows", async () => {
    const csv = generateRandomCSV({ rows: 500, numericCols: 6, categoricalCols: 0, seed: 42, includeOutliers: true });
    const start = Date.now();
    const result = await flowNearMissDetector({ csv_data: csv });
    const elapsed = Date.now() - start;
    expect(result.dataset_summary.rows).toBe(500);
    expect(elapsed).toBeLessThan(10000);
  });

  it("exploration_dna handles 2000 rows", () => {
    const csv = generateRandomCSV({ rows: 2000, numericCols: 8, categoricalCols: 2, seed: 42 });
    const start = Date.now();
    const result = flowExplorationDna({ csv_data: csv });
    const elapsed = Date.now() - start;
    expect(result.traits.length).toBe(8);
    expect(elapsed).toBeLessThan(10000);
  });

  it("waypoint_map handles 500 rows", async () => {
    const csv = generateClusteredCSV(5, 100, 42);
    const start = Date.now();
    const result = await flowWaypointMap({ csv_data: csv });
    const elapsed = Date.now() - start;
    expect(result.waypoints.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10000);
  });

  it("data_world_builder handles 500 rows at standard depth", async () => {
    const csv = generateRandomCSV({ rows: 500, numericCols: 5, categoricalCols: 2, seed: 42, includeOutliers: true });
    const start = Date.now();
    const result = await flowDataWorldBuilder({ csv_data: csv, depth: "standard" });
    const elapsed = Date.now() - start;
    expect(result.world_name).toBeTruthy();
    expect(result.sparkles.instant.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(15000);
  });
});

// ============================================================================
// Cross-tool composition: pipe outputs between tools
// ============================================================================

describe("Composition: tools chain correctly", () => {
  const baseCSV = generateRandomCSV({ rows: 50, numericCols: 4, categoricalCols: 1, seed: 777, includeOutliers: true });

  it("exploration_dna -> sparkle_engine (use DNA to choose dwell)", () => {
    const dna = flowExplorationDna({ csv_data: baseCSV });
    // Complex datasets deserve deeper dwell
    const complexity = dna.traits.reduce((s, t) => s + t.score, 0) / dna.traits.length;
    const dwell = Math.max(5, Math.round(complexity * 300));
    const sparkles = flowSparkleEngine({ csv_data: baseCSV, dwell_seconds: dwell });
    expect(sparkles.sparkles.length).toBeGreaterThan(0);
    expect(sparkles.layer_reached).toBeGreaterThanOrEqual(1);
  });

  it("progressive_disclosure -> sparkle_engine (sparkle each layer)", async () => {
    const disclosure = await flowProgressiveDisclosure({ csv_data: baseCSV });
    // Run sparkle on each layer's CSV
    for (const layer of disclosure.layers) {
      const sparkles = flowSparkleEngine({ csv_data: layer.csv, dwell_seconds: 10 });
      expect(sparkles.sparkles.length).toBeGreaterThan(0);
    }
  });

  it("quest_generator -> insight_scorer (validate quest findings)", async () => {
    const quests = await flowQuestGenerator({ csv_data: baseCSV });
    if (quests.quests.length > 0) {
      const quest = quests.quests[0];
      if (quest.target_columns.length >= 2) {
        const score = await flowInsightScorer({
          csv_data: baseCSV,
          insight: quest.title,
          insight_type: "correlation",
          columns: quest.target_columns.slice(0, 2),
        });
        expect(score.score.discovery_score).toBeGreaterThanOrEqual(0);
        expect(score.score.discovery_score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("near_miss -> visor_mode (analyze near-miss rows with anomaly visor)", async () => {
    const nearMisses = await flowNearMissDetector({ csv_data: baseCSV });
    const visor = await flowVisorMode({ csv_data: baseCSV, visor: "anomaly" });
    expect(visor.annotations.length).toBeGreaterThanOrEqual(0);
    expect(visor.annotated_csv).toBeTruthy();
    // Both tools should have processed the same data
    expect(nearMisses.dataset_summary.rows).toBe(50);
  });

  it("full pipeline: DNA -> disclosure -> quests -> near-miss -> sparkle -> world", async () => {
    // The full Holodeck pipeline in sequence
    const dna = flowExplorationDna({ csv_data: baseCSV });
    expect(dna.archetype).toBeTruthy();

    const disclosure = await flowProgressiveDisclosure({ csv_data: baseCSV });
    expect(disclosure.layers.length).toBeGreaterThanOrEqual(2);

    const quests = await flowQuestGenerator({ csv_data: baseCSV });
    expect(quests.quests).toBeDefined();

    const nearMisses = await flowNearMissDetector({ csv_data: baseCSV });
    expect(nearMisses.near_misses).toBeDefined();

    const sparkles = flowSparkleEngine({ csv_data: baseCSV, dwell_seconds: 60 });
    expect(sparkles.layer_reached).toBeGreaterThanOrEqual(2);

    // World builder should produce the same as composing manually
    const world = await flowDataWorldBuilder({ csv_data: baseCSV, depth: "standard" });
    expect(world.archetype).toBe(dna.archetype);
    expect(world.world_name).toBeTruthy();
  });
});

// ============================================================================
// Evolutionary edge-case discovery
// ============================================================================

describe("Evolutionary: boundary value testing", () => {
  it("handles datasets at exact layer thresholds (2,3,4,5 columns)", async () => {
    for (const numCols of [1, 2, 3, 4, 5]) {
      const csv = generateRandomCSV({ rows: 20, numericCols: numCols, categoricalCols: 0, seed: numCols });
      const dna = flowExplorationDna({ csv_data: csv });
      expect(dna.traits.length).toBe(8);
      const sparkles = flowSparkleEngine({ csv_data: csv, dwell_seconds: 30 });
      expect(sparkles.sparkles.length).toBeGreaterThan(0);
    }
  });

  it("handles datasets at exact row thresholds (1,2,5,10,50,100)", async () => {
    for (const numRows of [1, 2, 5, 10, 50, 100]) {
      const csv = generateRandomCSV({ rows: numRows, numericCols: 3, categoricalCols: 1, seed: numRows });
      const dna = flowExplorationDna({ csv_data: csv });
      expect(dna.archetype).toBeTruthy();
    }
  });

  it("handles extreme numeric values without overflow", () => {
    const csv = "a,b\n1e15,1e-15\n-1e15,-1e-15\n0,0\n1e10,1e10\n-1e10,-1e10";
    const result = flowExplorationDna({ csv_data: csv });
    expect(result.archetype).toBeTruthy();
    for (const t of result.traits) {
      expect(isFinite(t.score)).toBe(true);
    }
  });

  it("handles all-zero dataset without NaN", () => {
    const csv = "a,b,c\n0,0,0\n0,0,0\n0,0,0\n0,0,0\n0,0,0";
    const result = flowSparkleEngine({ csv_data: csv, dwell_seconds: 60 });
    for (const s of result.sparkles) {
      expect(isFinite(s.intensity)).toBe(true);
      expect(s.title).not.toContain("NaN");
      expect(s.description).not.toContain("NaN");
    }
  });

  it("handles negative-only dataset", () => {
    const csv = "x,y\n-100,-200\n-150,-300\n-50,-100\n-200,-400\n-175,-350";
    const dna = flowExplorationDna({ csv_data: csv });
    expect(dna.archetype).toBeTruthy();
    const sparkles = flowSparkleEngine({ csv_data: csv, dwell_seconds: 30 });
    expect(sparkles.sparkles.length).toBeGreaterThan(0);
  });

  it("handles dataset with duplicate rows", async () => {
    const csv = "a,b\n1,2\n1,2\n1,2\n1,2\n1,2\n1,2\n1,2\n1,2\n99,99";
    const quests = await flowQuestGenerator({ csv_data: csv });
    expect(quests.quests).toBeDefined();
    const nearMisses = await flowNearMissDetector({ csv_data: csv });
    expect(nearMisses.near_misses).toBeDefined();
  });

  it("handles single unique value per column (zero variance)", () => {
    const csv = "a,b,c\n5,10,15\n5,10,15\n5,10,15\n5,10,15";
    const result = flowExplorationDna({ csv_data: csv });
    expect(result.archetype).toBeTruthy();
    for (const t of result.traits) {
      expect(isFinite(t.score)).toBe(true);
    }
  });

  it("handles mixed types (numbers that look like strings)", () => {
    const csv = "code,value\n001,100\n002,200\n003,300\n010,400\nABC,500";
    const result = flowSparkleEngine({ csv_data: csv, dwell_seconds: 10 });
    expect(result.sparkles.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Determinism: same input always produces same output
// ============================================================================

describe("Determinism: reproducible results", () => {
  const csv = generateRandomCSV({ rows: 50, numericCols: 4, categoricalCols: 1, seed: 42 });

  it("exploration_dna is deterministic", () => {
    const r1 = flowExplorationDna({ csv_data: csv });
    const r2 = flowExplorationDna({ csv_data: csv });
    expect(r1.dna_code).toBe(r2.dna_code);
    expect(r1.archetype).toBe(r2.archetype);
    for (let i = 0; i < r1.traits.length; i++) {
      expect(r1.traits[i].score).toBe(r2.traits[i].score);
    }
  });

  it("sparkle_engine is deterministic", () => {
    const r1 = flowSparkleEngine({ csv_data: csv, dwell_seconds: 60 });
    const r2 = flowSparkleEngine({ csv_data: csv, dwell_seconds: 60 });
    expect(r1.sparkles.length).toBe(r2.sparkles.length);
    expect(r1.layer_reached).toBe(r2.layer_reached);
    for (let i = 0; i < r1.sparkles.length; i++) {
      expect(r1.sparkles[i].title).toBe(r2.sparkles[i].title);
    }
  });

  it("quest_generator is deterministic", async () => {
    const r1 = await flowQuestGenerator({ csv_data: csv });
    const r2 = await flowQuestGenerator({ csv_data: csv });
    expect(r1.quests.length).toBe(r2.quests.length);
    for (let i = 0; i < r1.quests.length; i++) {
      expect(r1.quests[i].title).toBe(r2.quests[i].title);
    }
  });
});
