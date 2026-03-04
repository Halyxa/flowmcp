/**
 * Tool 68: flow_data_world_builder — THE synthesis tool.
 *
 * Takes ANY CSV and builds a complete "data world" from it by orchestrating:
 * - Exploration DNA (archetype, traits, personality)
 * - Sparkle Engine (progressive intelligence layers)
 * - Quest Generator (procedural exploration quests)
 * - Near-Miss Detector (almost-patterns that provoke curiosity)
 * - Progressive Disclosure (layered column reveal)
 *
 * One call. Data comes alive. The "enter the world" button.
 */

import { parseCSVLine, csvEscapeField, parseCsvToRows } from "./csv-utils.js";
import { flowExplorationDna } from "./tools-dna.js";
import type { ExplorationDnaResult } from "./tools-dna.js";
import { flowSparkleEngine } from "./tools-sparkle.js";
import type { SparkleEngineResult, Sparkle } from "./tools-sparkle.js";
import { flowQuestGenerator, flowNearMissDetector, flowProgressiveDisclosure } from "./tools-v5.js";
import type { QuestGeneratorResult, NearMissDetectorResult, ProgressiveDisclosureResult } from "./tools-v5.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface DataWorldBuilderInput {
  csv_data: string;
  /** World complexity: quick (DNA + layer 1 sparkles), standard (+ quests + near-misses), deep (everything) */
  depth?: "quick" | "standard" | "deep";
  /** Optional: user's goal or question about the data */
  user_goal?: string;
}

export interface DataWorldBuilderResult {
  world_name: string;
  archetype: string;
  dna_code: string;
  layers: {
    surface: string;
    depth_1: string;
    depth_2?: string;
    full: string;
  };
  sparkles: {
    instant: Sparkle[];
    surface: Sparkle[];
    correlations?: Sparkle[];
    deep?: Sparkle[];
    epiphanies?: Sparkle[];
  };
  quests?: any[];
  near_misses?: any[];
  exploration_guide: string;
  recommended_sequence: string[];
  world_stats: {
    total_sparkles: number;
    total_quests: number;
    total_near_misses: number;
    intelligence_layers: number;
    exploration_richness: number;
  };
}

// ============================================================================
// Internal helpers — all prefixed with wb_
// ============================================================================

// parseCsvToRows imported from csv-utils.ts

/**
 * Find the "dominant column" — the most interesting numeric column name
 * for generating a world name. Prioritizes columns with the highest variance
 * coefficient and non-generic names.
 */
function wb_findDominantColumn(headers: string[], rows: string[][]): string {
  const genericNames = new Set(["id", "key", "index", "row", "name", "label"]);

  let bestCol = "";
  let bestScore = -1;

  for (let ci = 0; ci < headers.length; ci++) {
    const name = headers[ci].toLowerCase();

    // Skip generic identifiers
    if (genericNames.has(name)) continue;

    // Score: prefer numeric columns with variance
    const values: number[] = [];
    for (const row of rows) {
      const v = Number(row[ci]);
      if (!isNaN(v)) values.push(v);
    }

    if (values.length === 0) {
      // Categorical column — lower priority but still valid
      if (bestScore < 0) {
        bestCol = headers[ci];
        bestScore = 0;
      }
      continue;
    }

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = values.length > 1
      ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1))
      : 0;
    const cv = mean !== 0 ? Math.abs(std / mean) : std;

    // Score by coefficient of variation (interesting = high variance relative to mean)
    const score = cv + 0.1; // ensure numeric always beats default categorical
    if (score > bestScore) {
      bestScore = score;
      bestCol = headers[ci];
    }
  }

  // Fallback: use first non-generic header
  if (!bestCol && headers.length > 0) {
    for (const h of headers) {
      if (!genericNames.has(h.toLowerCase())) {
        bestCol = h;
        break;
      }
    }
  }

  return bestCol || (headers[0] ?? "Data");
}

/**
 * Generate a world name by combining the archetype with the dominant column.
 * "The Archipelago" + "revenue" → "The Revenue Archipelago"
 */
function wb_generateWorldName(archetype: string, dominantColumn: string): string {
  // Clean up column name: snake_case → Title Case
  const cleanCol = dominantColumn
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  // Extract the noun from the archetype: "The Archipelago" → "Archipelago"
  const archetypeNoun = archetype.replace(/^The\s+/i, "");

  return `The ${cleanCol} ${archetypeNoun}`;
}

/**
 * Group sparkles by their layer number.
 */
function wb_groupSparklesByLayer(sparkles: Sparkle[]): Record<number, Sparkle[]> {
  const groups: Record<number, Sparkle[]> = {};
  for (const s of sparkles) {
    if (!groups[s.layer]) groups[s.layer] = [];
    groups[s.layer].push(s);
  }
  return groups;
}

/**
 * Generate an exploration guide narrative.
 */
function wb_generateExplorationGuide(
  worldName: string,
  archetype: string,
  dnaResult: ExplorationDnaResult,
  sparkleResult: SparkleEngineResult,
  questResult: QuestGeneratorResult | null,
  nearMissResult: NearMissDetectorResult | null,
  userGoal: string | undefined,
  rowCount: number,
  colCount: number,
): string {
  const parts: string[] = [];

  // Opening: welcome to the world
  parts.push(`Welcome to ${worldName}.`);

  // Describe the data's character from DNA
  const traitSummary = dnaResult.traits
    .filter((t) => t.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((t) => t.description)
    .join(". ");

  if (traitSummary) {
    parts.push(traitSummary + ".");
  } else {
    parts.push(`Your ${rowCount}-row dataset spans ${colCount} dimensions, classified as ${archetype}.`);
  }

  // Near-miss hook (the most intriguing finding)
  if (nearMissResult && nearMissResult.near_misses.length > 0) {
    const topNM = nearMissResult.near_misses[0];
    parts.push(
      `The near-miss detector found something intriguing: ${topNM.narrative}`
    );
  }

  // Quest hook
  if (questResult && questResult.quests.length > 0) {
    parts.push(
      `Follow Quest #1 ("${questResult.quests[0].title}") to begin your investigation.`
    );
  }

  // Sparkle count tease
  if (sparkleResult.sparkles.length > 0) {
    parts.push(
      `As you dwell longer, watch for sparkles — the Sparkle Engine has ${sparkleResult.sparkles.length} insights waiting to emerge.`
    );
  }

  // User goal integration
  if (userGoal) {
    parts.push(
      `Your goal: "${userGoal}" — the data world has been oriented to help you find this answer.`
    );
  }

  return parts.join(" ");
}

/**
 * Generate a recommended exploration sequence based on depth and available results.
 */
function wb_generateRecommendedSequence(
  depth: "quick" | "standard" | "deep",
  dnaResult: ExplorationDnaResult,
  questResult: QuestGeneratorResult | null,
): string[] {
  const steps: string[] = [];

  // Always start with orientation
  steps.push("Orient: review the surface layer to see the data's shape");
  steps.push(`Understand: this is ${dnaResult.archetype} — ${dnaResult.exploration_style.split(".")[0]}`);

  // Add DNA-recommended tools
  if (dnaResult.recommended_tools.length > 0) {
    steps.push(`Explore: use ${dnaResult.recommended_tools[0]} for deeper analysis`);
  }

  if (depth === "standard" || depth === "deep") {
    // Add quest-based steps
    if (questResult && questResult.quests.length > 0) {
      steps.push(`Investigate: follow Quest #1 — "${questResult.quests[0].title}"`);
    }
    steps.push("Discover: dwell on interesting areas to unlock deeper sparkles");
  }

  if (depth === "deep") {
    steps.push("Synthesize: review epiphany-level sparkles for cross-cutting insights");
    steps.push("Map: explore the full correlation structure");
  }

  steps.push("Share: export your findings using flow_export_formats");

  return steps;
}

/**
 * Compute exploration richness: a 0-1 composite score of how rich the data world is.
 */
function wb_computeExplorationRichness(
  totalSparkles: number,
  totalQuests: number,
  totalNearMisses: number,
  layers: number,
  rowCount: number,
  colCount: number,
): number {
  // Normalize each dimension to 0-1 and average
  const sparkleDensity = Math.min(1, totalSparkles / Math.max(rowCount * colCount * 0.1, 1));
  const questDensity = Math.min(1, totalQuests / 5); // 5 quests = max
  const nearMissDensity = Math.min(1, totalNearMisses / 5); // 5 near-misses = max
  const layerScore = Math.min(1, layers / 5); // 5 layers = max

  const richness = (sparkleDensity + questDensity + nearMissDensity + layerScore) / 4;
  return Math.max(0, Math.min(1, Math.round(richness * 100) / 100));
}

// ============================================================================
// Main function
// ============================================================================

export async function flowDataWorldBuilder(
  input: DataWorldBuilderInput
): Promise<DataWorldBuilderResult> {
  const depth = input.depth ?? "standard";
  const { headers, rows } = parseCsvToRows(input.csv_data);

  // Step 1: Exploration DNA — always runs
  const dnaResult = flowExplorationDna({ csv_data: input.csv_data });

  // Step 2: Sparkle Engine — dwell time varies by depth
  const dwellMap: Record<string, number> = {
    quick: 5,
    standard: 30,
    deep: 180,
  };
  const sparkleResult = flowSparkleEngine({
    csv_data: input.csv_data,
    dwell_seconds: dwellMap[depth],
  });

  // Step 3: Progressive Disclosure — always runs
  const disclosureResult = await flowProgressiveDisclosure({
    csv_data: input.csv_data,
  });

  // Step 4: Quest Generator — standard + deep only
  let questResult: QuestGeneratorResult | null = null;
  if (depth === "standard" || depth === "deep") {
    questResult = flowQuestGenerator({ csv_data: input.csv_data });
  }

  // Step 5: Near-Miss Detector — standard + deep only
  let nearMissResult: NearMissDetectorResult | null = null;
  if (depth === "standard" || depth === "deep") {
    nearMissResult = await flowNearMissDetector({ csv_data: input.csv_data });
  }

  // Compose results

  // World name
  const dominantColumn = wb_findDominantColumn(headers, rows);
  const worldName = wb_generateWorldName(dnaResult.archetype, dominantColumn);

  // Layers from progressive disclosure
  const disclosureLayers = disclosureResult.layers;
  const surfaceLayer = disclosureLayers.length > 0 ? disclosureLayers[0].csv : input.csv_data;
  const depth1Layer = disclosureLayers.length > 1 ? disclosureLayers[1].csv : surfaceLayer;
  const depth2Layer = (depth === "standard" || depth === "deep") && disclosureLayers.length > 2
    ? disclosureLayers[2].csv
    : undefined;

  const layers = {
    surface: surfaceLayer,
    depth_1: depth1Layer,
    depth_2: depth2Layer,
    full: disclosureResult.full_csv,
  };

  // Group sparkles by layer
  const sparkleGroups = wb_groupSparklesByLayer(sparkleResult.sparkles);

  const sparkles: DataWorldBuilderResult["sparkles"] = {
    instant: sparkleGroups[0] ?? [],
    surface: sparkleGroups[1] ?? [],
  };

  if (depth === "standard" || depth === "deep") {
    sparkles.correlations = sparkleGroups[2] ?? [];
  }

  if (depth === "deep") {
    sparkles.deep = sparkleGroups[3] ?? [];
    sparkles.epiphanies = sparkleGroups[4] ?? [];
  }

  // Total sparkle count
  const totalSparkles = sparkleResult.sparkles.length;
  const totalQuests = questResult?.quests?.length ?? 0;
  const totalNearMisses = nearMissResult?.near_misses?.length ?? 0;

  // Intelligence layers = how many sparkle layers were unlocked
  const intelligenceLayers = sparkleResult.summary.layers_unlocked;

  // Exploration richness
  const explorationRichness = wb_computeExplorationRichness(
    totalSparkles,
    totalQuests,
    totalNearMisses,
    intelligenceLayers,
    rows.length,
    headers.length,
  );

  // Exploration guide
  const explorationGuide = wb_generateExplorationGuide(
    worldName,
    dnaResult.archetype,
    dnaResult,
    sparkleResult,
    questResult,
    nearMissResult,
    input.user_goal,
    rows.length,
    headers.length,
  );

  // Recommended sequence
  const recommendedSequence = wb_generateRecommendedSequence(depth, dnaResult, questResult);

  return {
    world_name: worldName,
    archetype: dnaResult.archetype,
    dna_code: dnaResult.dna_code,
    layers,
    sparkles,
    quests: questResult?.quests,
    near_misses: nearMissResult?.near_misses,
    exploration_guide: explorationGuide,
    recommended_sequence: recommendedSequence,
    world_stats: {
      total_sparkles: totalSparkles,
      total_quests: totalQuests,
      total_near_misses: totalNearMisses,
      intelligence_layers: intelligenceLayers,
      exploration_richness: explorationRichness,
    },
  };
}
