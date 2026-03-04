/**
 * Holodeck Intelligence Layer — Tool 61: flow_quest_generator
 *
 * Scans a dataset's statistical topology and generates procedural exploration quests.
 * Each quest has a narrative hook, difficulty rating, investigation steps, and statistical basis.
 * The data itself tells you what to investigate.
 */

import { parseCSVLine, parseCsvToRows, isDateLike, isIdLike } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface QuestGeneratorInput {
  csv_data: string;
  /** Max quests to generate (default 5, max 20) */
  max_quests?: number;
  /** Difficulty filter: easy (surface stats), medium (cross-column), hard (multi-step). Default: all */
  difficulty?: "easy" | "medium" | "hard" | "all";
}

export interface Quest {
  id: string;
  type: "anomaly" | "comparison" | "trend" | "hypothesis" | "connection";
  difficulty: "easy" | "medium" | "hard";
  title: string;
  narrative_hook: string;
  target_columns: string[];
  target_rows?: number[];
  investigation_steps: string[];
  reward: string;
  statistical_basis: {
    metric: string;
    value: number;
    threshold: number;
  };
}

export interface QuestGeneratorResult {
  quests: Quest[];
  dataset_summary: {
    rows: number;
    columns: number;
    quest_density: number;
    dominant_quest_type: string;
  };
  suggested_sequence: string[];
}

// ============================================================================
// Internal types
// ============================================================================

interface ColProfile {
  name: string;
  colIdx: number;
  type: "numeric" | "categorical" | "date" | "id";
  numericValues: number[];
  rawValues: string[];
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  uniqueCount: number;
}

interface RawQuest {
  quest: Quest;
  strength: number; // for ranking
}

// ============================================================================
// Helpers
// ============================================================================

// parseCsvToRows, isDateLike, isIdLike imported from csv-utils.ts

function computeStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < xs.length && i < ys.length; i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) {
      pairs.push([xs[i], ys[i]]);
    }
  }
  const n = pairs.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0;
  for (const [x, y] of pairs) { sumX += x; sumY += y; }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0, varX = 0, varY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function profileColumn(name: string, colIdx: number, rows: string[][]): ColProfile {
  const rawValues = rows.map((row) => row[colIdx]?.trim() ?? "");
  const nonEmpty = rawValues.filter((v) => v !== "");

  const uniqueSet = new Set(nonEmpty);
  const uniqueCount = uniqueSet.size;

  // Date check
  const dateSample = nonEmpty.slice(0, Math.min(5, nonEmpty.length));
  const dateRatio = dateSample.length > 0 ? dateSample.filter(isDateLike).length / dateSample.length : 0;

  // Numeric check
  let numericCount = 0;
  const numericValues: number[] = [];
  for (const v of nonEmpty) {
    const num = Number(v);
    if (!isNaN(num)) {
      numericCount++;
      numericValues.push(num);
    }
  }
  const numericRatio = nonEmpty.length > 0 ? numericCount / nonEmpty.length : 0;

  let type: "numeric" | "categorical" | "date" | "id";
  if (dateRatio > 0.8) {
    type = "date";
  } else if (numericRatio > 0.5) {
    type = "numeric";
  } else if (isIdLike(name, nonEmpty, rows.length)) {
    type = "id";
  } else {
    type = "categorical";
  }

  const sorted = [...numericValues].sort((a, b) => a - b);
  const sum = numericValues.reduce((s, v) => s + v, 0);
  const mean = numericValues.length > 0 ? sum / numericValues.length : 0;
  const std = computeStd(numericValues, mean);

  return {
    name,
    colIdx,
    type,
    numericValues,
    rawValues,
    mean: Math.round(mean * 100) / 100,
    std: Math.round(std * 100) / 100,
    min: sorted.length > 0 ? sorted[0] : 0,
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    median: Math.round(computeMedian(sorted) * 100) / 100,
    uniqueCount,
  };
}

// ============================================================================
// Quest generators
// ============================================================================

function findIdColumn(profiles: ColProfile[]): ColProfile | null {
  return profiles.find((p) => p.type === "id") ?? null;
}

function getEntityName(idCol: ColProfile | null, rows: string[][], rowIdx: number): string {
  if (idCol) {
    const val = rows[rowIdx]?.[idCol.colIdx]?.trim();
    if (val) return val;
  }
  return `Row ${rowIdx + 1}`;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(1);
}

// --- Anomaly quests ---

function generateAnomalyQuests(
  profiles: ColProfile[],
  rows: string[][],
  idCol: ColProfile | null,
): RawQuest[] {
  const quests: RawQuest[] = [];
  const numericProfiles = profiles.filter((p) => p.type === "numeric" && p.std > 0);

  for (const prof of numericProfiles) {
    for (let i = 0; i < rows.length; i++) {
      const val = Number(rows[i][prof.colIdx]?.trim() ?? "");
      if (isNaN(val)) continue;
      const z = (val - prof.mean) / prof.std;
      if (Math.abs(z) > 2.5) {
        const entityName = getEntityName(idCol, rows, i);
        const direction = z > 0 ? "above" : "below";
        const absZ = Math.abs(z);

        // Check if other columns for this row are also unusual
        const otherAnomalies: string[] = [];
        for (const otherProf of numericProfiles) {
          if (otherProf.name === prof.name || otherProf.std === 0) continue;
          const otherVal = Number(rows[i][otherProf.colIdx]?.trim() ?? "");
          if (!isNaN(otherVal)) {
            const otherZ = (otherVal - otherProf.mean) / otherProf.std;
            if (Math.abs(otherZ) > 1.5) {
              otherAnomalies.push(otherProf.name);
            }
          }
        }

        const targetColumns = [prof.name, ...otherAnomalies];

        const titleTemplates = [
          `The ${prof.name} Surge of ${entityName}`,
          `The Surprising ${prof.name} of ${entityName}`,
          `${entityName}: A ${prof.name} That Defies the Pattern`,
          `The ${entityName} ${prof.name} Mystery`,
        ];
        const title = titleTemplates[quests.length % titleTemplates.length];

        const hookTemplates = [
          `Something stands out. ${entityName} has a ${prof.name} of ${formatNumber(val)} — that is ${absZ.toFixed(1)} standard deviations ${direction} the average of ${formatNumber(prof.mean)}. In a dataset of ${rows.length} entries, this is a statistical surprise that demands investigation.`,
          `${entityName} breaks the pattern. While the average ${prof.name} sits at ${formatNumber(prof.mean)}, this entry clocks in at ${formatNumber(val)} — ${absZ.toFixed(1)} standard deviations ${direction}. What makes it so different?`,
        ];

        const steps: string[] = [
          `Examine ${entityName}'s ${prof.name} value of ${formatNumber(val)} against the dataset mean of ${formatNumber(prof.mean)} (std: ${formatNumber(prof.std)}).`,
          `Compare ${entityName}'s full profile across all columns to its ${Math.min(3, rows.length - 1)} nearest neighbors by ${prof.name}.`,
        ];
        if (otherAnomalies.length > 0) {
          steps.push(`Investigate whether ${entityName}'s unusual ${otherAnomalies.join(", ")} values explain or compound the ${prof.name} surprise.`);
        }
        steps.push(`Determine whether ${entityName} represents a data error, a genuinely exceptional case, or a different population entirely.`);

        const reward = otherAnomalies.length > 0
          ? `Understanding what drives the coupled anomaly in ${targetColumns.join(" and ")} reveals whether ${entityName} is an error, an exception, or a different category entirely.`
          : `Discovering why ${entityName} deviates so dramatically in ${prof.name} may reveal a hidden segment or data quality issue.`;

        quests.push({
          quest: {
            id: "", // assigned later
            type: "anomaly",
            difficulty: otherAnomalies.length > 0 ? "medium" : "easy",
            title,
            narrative_hook: hookTemplates[quests.length % hookTemplates.length],
            target_columns: targetColumns,
            target_rows: [i],
            investigation_steps: steps,
            reward,
            statistical_basis: {
              metric: "z_score",
              value: Math.round(z * 100) / 100,
              threshold: 2.5,
            },
          },
          strength: absZ,
        });
      }
    }
  }

  return quests;
}

// --- Comparison quests (simple k-means k=2) ---

function simpleKMeans2(values: number[]): { centroids: [number, number]; labels: number[] } {
  if (values.length < 4) return { centroids: [0, 0], labels: values.map(() => 0) };

  const sorted = [...values].sort((a, b) => a - b);
  let c0 = sorted[Math.floor(sorted.length * 0.25)];
  let c1 = sorted[Math.floor(sorted.length * 0.75)];

  let labels = values.map(() => 0);

  for (let iter = 0; iter < 20; iter++) {
    // Assign
    labels = values.map((v) => Math.abs(v - c0) <= Math.abs(v - c1) ? 0 : 1);
    // Update centroids
    const g0 = values.filter((_, i) => labels[i] === 0);
    const g1 = values.filter((_, i) => labels[i] === 1);
    if (g0.length === 0 || g1.length === 0) break;
    const newC0 = g0.reduce((s, v) => s + v, 0) / g0.length;
    const newC1 = g1.reduce((s, v) => s + v, 0) / g1.length;
    if (Math.abs(newC0 - c0) < 0.001 && Math.abs(newC1 - c1) < 0.001) break;
    c0 = newC0;
    c1 = newC1;
  }

  return { centroids: [c0, c1], labels };
}

function generateComparisonQuests(
  profiles: ColProfile[],
  rows: string[][],
  idCol: ColProfile | null,
): RawQuest[] {
  const quests: RawQuest[] = [];
  const numericProfiles = profiles.filter((p) => p.type === "numeric" && p.std > 0);

  if (numericProfiles.length === 0 || rows.length < 6) return quests;

  // Use the column with highest coefficient of variation for clustering
  let bestCol: ColProfile | null = null;
  let bestCV = 0;
  for (const prof of numericProfiles) {
    if (prof.mean === 0) continue;
    const cv = prof.std / Math.abs(prof.mean);
    if (cv > bestCV) {
      bestCV = cv;
      bestCol = prof;
    }
  }

  if (!bestCol || bestCV < 0.3) return quests; // Not enough separation

  const { centroids, labels } = simpleKMeans2(bestCol.numericValues);
  const group0 = labels.filter((l) => l === 0).length;
  const group1 = labels.filter((l) => l === 1).length;

  // Only generate comparison if both groups have members and centroids differ meaningfully
  if (group0 < 2 || group1 < 2) return quests;
  const centroidGap = Math.abs(centroids[1] - centroids[0]);
  if (centroidGap < bestCol.std * 0.5) return quests;

  // Find which other columns differ between groups
  const differingCols: string[] = [bestCol.name];
  for (const prof of numericProfiles) {
    if (prof.name === bestCol.name) continue;
    const g0Vals = prof.numericValues.filter((_, i) => labels[i] === 0);
    const g1Vals = prof.numericValues.filter((_, i) => labels[i] === 1);
    const g0Mean = g0Vals.reduce((s, v) => s + v, 0) / g0Vals.length;
    const g1Mean = g1Vals.reduce((s, v) => s + v, 0) / g1Vals.length;
    if (prof.std > 0 && Math.abs(g1Mean - g0Mean) / prof.std > 0.8) {
      differingCols.push(prof.name);
    }
  }

  // Build row indices for each group
  const g0Rows = labels.map((l, i) => l === 0 ? i : -1).filter((i) => i >= 0);
  const g1Rows = labels.map((l, i) => l === 1 ? i : -1).filter((i) => i >= 0);

  const g0Names = g0Rows.slice(0, 3).map((i) => getEntityName(idCol, rows, i)).join(", ");
  const g1Names = g1Rows.slice(0, 3).map((i) => getEntityName(idCol, rows, i)).join(", ");

  const title = `The Two Worlds of ${bestCol.name}`;
  const hook = `This dataset splits into two distinct populations. One group (including ${g0Names}) clusters around a ${bestCol.name} of ${formatNumber(centroids[0])}, while the other (including ${g1Names}) centers on ${formatNumber(centroids[1])}. The gap between them is ${formatNumber(centroidGap)}. What separates these two worlds?`;

  const steps: string[] = [
    `Visualize the ${group0} entries in the low-${bestCol.name} group against the ${group1} entries in the high-${bestCol.name} group.`,
    `Compare the groups across ${differingCols.join(", ")} to identify which dimensions co-vary with the split.`,
    `Look for categorical or contextual factors that explain the bifurcation — what makes one group fundamentally different from the other?`,
  ];

  const reward = `Understanding what separates these two populations reveals whether this is a meaningful segmentation (different types) or an artifact (biased sampling).`;

  quests.push({
    quest: {
      id: "",
      type: "comparison",
      difficulty: differingCols.length > 2 ? "hard" : "medium",
      title,
      narrative_hook: hook,
      target_columns: differingCols,
      target_rows: [...g0Rows.slice(0, 2), ...g1Rows.slice(0, 2)],
      investigation_steps: steps,
      reward,
      statistical_basis: {
        metric: "cluster_separation",
        value: Math.round((centroidGap / bestCol.std) * 100) / 100,
        threshold: 0.5,
      },
    },
    strength: centroidGap / bestCol.std,
  });

  return quests;
}

// --- Trend quests ---

function generateTrendQuests(
  profiles: ColProfile[],
  rows: string[][],
): RawQuest[] {
  const quests: RawQuest[] = [];

  const numericProfiles = profiles.filter((p) => p.type === "numeric" && p.std > 0 && p.numericValues.length >= 6);

  if (numericProfiles.length === 0) return quests;

  for (const prof of numericProfiles) {
    const values = prof.numericValues;
    if (values.length < 6) continue;

    // Split into two halves and compute slopes
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const slope1 = linearRegressionSlope(firstHalf);
    const slope2 = linearRegressionSlope(secondHalf);

    // Detect slope change (sign reversal or magnitude change > 2x)
    const slopeChange = Math.abs(slope2 - slope1);
    const signReversal = (slope1 > 0 && slope2 < 0) || (slope1 < 0 && slope2 > 0);
    const magnitudeChange = slope1 !== 0 ? Math.abs(slope2 / slope1) : (slope2 !== 0 ? Infinity : 0);

    if (!signReversal && magnitudeChange < 2 && slopeChange < prof.std * 0.1) continue;

    const direction1 = slope1 > 0 ? "rising" : slope1 < 0 ? "falling" : "flat";
    const direction2 = slope2 > 0 ? "rising" : slope2 < 0 ? "falling" : "flat";

    const inflectionPoint = mid;
    const dateCol = profiles.find((p) => p.type === "date");
    const inflectionLabel = dateCol
      ? rows[inflectionPoint]?.[dateCol.colIdx]?.trim() ?? `position ${inflectionPoint + 1}`
      : `position ${inflectionPoint + 1}`;

    const title = signReversal
      ? `The ${prof.name} Reversal at ${inflectionLabel}`
      : `The ${prof.name} Acceleration at ${inflectionLabel}`;

    const hook = signReversal
      ? `A dramatic shift. ${prof.name} was ${direction1} at a rate of ${formatNumber(slope1)} per step, then reversed to ${direction2} at ${formatNumber(slope2)} per step around ${inflectionLabel}. What triggered this reversal?`
      : `${prof.name} changed gear around ${inflectionLabel}. The rate shifted from ${formatNumber(slope1)} to ${formatNumber(slope2)} per step — a ${magnitudeChange.toFixed(1)}x change in momentum.`;

    const steps: string[] = [
      `Examine the ${prof.name} values around ${inflectionLabel} (positions ${Math.max(1, inflectionPoint - 2)} to ${Math.min(rows.length, inflectionPoint + 3)}) for the inflection pattern.`,
      `Check whether other numeric columns show correlated shifts at the same point — is this a system-wide change or isolated to ${prof.name}?`,
      `Investigate external factors or events that coincide with the timing of this shift.`,
    ];

    const reward = `Identifying the cause of this ${signReversal ? "reversal" : "acceleration"} reveals whether it is a structural change, a cyclical pattern, or a one-time event.`;

    quests.push({
      quest: {
        id: "",
        type: "trend",
        difficulty: "medium",
        title,
        narrative_hook: hook,
        target_columns: [prof.name, ...(dateCol ? [dateCol.name] : [])],
        target_rows: [inflectionPoint],
        investigation_steps: steps,
        reward,
        statistical_basis: {
          metric: "slope_change",
          value: Math.round(slopeChange * 100) / 100,
          threshold: Math.round(prof.std * 0.1 * 100) / 100,
        },
      },
      strength: signReversal ? slopeChange * 2 : slopeChange,
    });
  }

  return quests;
}

// --- Hypothesis quests ---

function generateHypothesisQuests(
  profiles: ColProfile[],
): RawQuest[] {
  const quests: RawQuest[] = [];
  const numericProfiles = profiles.filter((p) => p.type === "numeric" && p.numericValues.length >= 5 && p.std > 0);

  if (numericProfiles.length < 2) return quests;

  const seen = new Set<string>();

  for (let i = 0; i < numericProfiles.length; i++) {
    for (let j = i + 1; j < numericProfiles.length; j++) {
      const profA = numericProfiles[i];
      const profB = numericProfiles[j];

      const r = pearsonCorrelation(profA.numericValues, profB.numericValues);
      const absR = Math.abs(r);

      // Near-significant: 0.5 <= |r| <= 0.95
      // We want correlations that are interesting but not trivially obvious
      if (absR < 0.5 || absR > 0.95) continue;

      const key = [profA.name, profB.name].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);

      const direction = r > 0 ? "positive" : "negative";
      const strength = absR > 0.8 ? "strong" : absR > 0.65 ? "moderate" : "suggestive";

      const title = `The ${profA.name}–${profB.name} Connection`;

      const hook = `A ${strength} ${direction} correlation (r = ${r.toFixed(2)}) exists between ${profA.name} and ${profB.name}. As ${profA.name} increases, ${profB.name} ${r > 0 ? "tends to increase" : "tends to decrease"}. Is this causal, confounded, or coincidental?`;

      const steps: string[] = [
        `Plot ${profA.name} against ${profB.name} to visualize the relationship (r = ${r.toFixed(2)}).`,
        `Identify the outlier pairs — rows where the correlation breaks down — and investigate what makes them different.`,
        `Check whether a third variable (${numericProfiles.filter((p) => p.name !== profA.name && p.name !== profB.name).map((p) => p.name).slice(0, 2).join(" or ") || "a categorical factor"}) mediates or confounds this relationship.`,
      ];

      const reward = `Determining whether the ${profA.name}–${profB.name} correlation is causal could transform how you interpret both columns.`;

      quests.push({
        quest: {
          id: "",
          type: "hypothesis",
          difficulty: "hard",
          title,
          narrative_hook: hook,
          target_columns: [profA.name, profB.name],
          investigation_steps: steps,
          reward,
          statistical_basis: {
            metric: "correlation",
            value: Math.round(r * 100) / 100,
            threshold: 0.5,
          },
        },
        strength: absR,
      });
    }
  }

  return quests;
}

// --- Connection quests ---

function generateConnectionQuests(
  profiles: ColProfile[],
  rows: string[][],
  headers: string[],
): RawQuest[] {
  const quests: RawQuest[] = [];

  // Check for network format: id + connections columns
  const idIdx = headers.findIndex((h) => h.toLowerCase() === "id");
  const connIdx = headers.findIndex((h) => h.toLowerCase() === "connections");

  if (idIdx < 0 || connIdx < 0) return quests;

  // Parse network
  const nodeConnections = new Map<string, string[]>();
  const nodeRow = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const id = rows[i][idIdx]?.trim() ?? "";
    const connStr = rows[i][connIdx]?.trim() ?? "";
    if (!id) continue;
    const conns = connStr.split("|").map((c) => c.trim()).filter((c) => c !== "");
    nodeConnections.set(id, conns);
    nodeRow.set(id, i);
  }

  if (nodeConnections.size < 3) return quests;

  // Find bridge nodes: nodes connected to groups with different categorical labels
  const groupIdx = headers.findIndex((h) => {
    const l = h.toLowerCase();
    return l === "group" || l === "category" || l === "cluster" || l === "team" || l === "type";
  });

  // Compute degree for each node
  const degrees = new Map<string, number>();
  for (const [id, conns] of nodeConnections) {
    degrees.set(id, conns.length);
  }

  // Find bridge candidates
  const bridgeScores: { id: string; score: number; crossGroupConns: number; row: number }[] = [];

  for (const [id, conns] of nodeConnections) {
    const row = nodeRow.get(id);
    if (row === undefined) continue;

    if (groupIdx >= 0) {
      const myGroup = rows[row][groupIdx]?.trim() ?? "";
      let crossGroup = 0;
      for (const conn of conns) {
        const connRow = nodeRow.get(conn);
        if (connRow !== undefined) {
          const connGroup = rows[connRow][groupIdx]?.trim() ?? "";
          if (connGroup !== myGroup && connGroup !== "") crossGroup++;
        }
      }
      if (crossGroup > 0) {
        bridgeScores.push({ id, score: crossGroup, crossGroupConns: crossGroup, row });
      }
    } else {
      // Without group info, highest-degree nodes are hubs
      const degree = degrees.get(id) ?? 0;
      const avgDegree = [...degrees.values()].reduce((s, v) => s + v, 0) / degrees.size;
      if (degree > avgDegree * 1.5) {
        bridgeScores.push({ id, score: degree, crossGroupConns: 0, row });
      }
    }
  }

  bridgeScores.sort((a, b) => b.score - a.score);

  for (const bridge of bridgeScores.slice(0, 2)) {
    const conns = nodeConnections.get(bridge.id) ?? [];

    const title = `The Bridge Role of ${bridge.id}`;
    const hook = groupIdx >= 0
      ? `${bridge.id} connects across group boundaries with ${bridge.crossGroupConns} cross-group connections out of ${conns.length} total. Remove this node and communities may fragment. What makes ${bridge.id} a bridge?`
      : `${bridge.id} is a hub with ${conns.length} connections — significantly above average. It holds the network together. What role does it play?`;

    const steps: string[] = [
      `Examine ${bridge.id}'s connections: ${conns.slice(0, 5).join(", ")}${conns.length > 5 ? ` and ${conns.length - 5} more` : ""}.`,
      `Compare ${bridge.id}'s attributes to its neighbors — does it share characteristics with both sides, or is it unique?`,
      `Simulate removing ${bridge.id} from the network to see how connectivity changes.`,
    ];

    const reward = `Understanding why ${bridge.id} bridges communities reveals the structural glue of this network.`;

    quests.push({
      quest: {
        id: "",
        type: "connection",
        difficulty: "hard",
        title,
        narrative_hook: hook,
        target_columns: ["connections", ...(groupIdx >= 0 ? [headers[groupIdx]] : [])],
        target_rows: [bridge.row],
        investigation_steps: steps,
        reward,
        statistical_basis: {
          metric: "bridge_score",
          value: bridge.score,
          threshold: 1,
        },
      },
      strength: bridge.score,
    });
  }

  return quests;
}

// ============================================================================
// Main export
// ============================================================================

export function flowQuestGenerator(args: QuestGeneratorInput): QuestGeneratorResult {
  const { csv_data, max_quests = 5, difficulty = "all" } = args;

  const { headers, rows } = parseCsvToRows(csv_data);

  // Edge cases
  if (rows.length === 0 || headers.length === 0) {
    return {
      quests: [],
      dataset_summary: {
        rows: 0,
        columns: headers.length,
        quest_density: 0,
        dominant_quest_type: "none",
      },
      suggested_sequence: [],
    };
  }

  // Profile all columns
  const profiles = headers.map((h, i) => profileColumn(h, i, rows));
  const idCol = findIdColumn(profiles);

  // Generate quests from each detector
  const allRawQuests: RawQuest[] = [
    ...generateAnomalyQuests(profiles, rows, idCol),
    ...generateComparisonQuests(profiles, rows, idCol),
    ...generateTrendQuests(profiles, rows),
    ...generateHypothesisQuests(profiles),
    ...generateConnectionQuests(profiles, rows, headers),
  ];

  // Sort by statistical strength (most interesting first)
  allRawQuests.sort((a, b) => b.strength - a.strength);

  // Apply difficulty filter
  let filteredQuests = allRawQuests;
  if (difficulty !== "all") {
    filteredQuests = allRawQuests.filter((rq) => rq.quest.difficulty === difficulty);
  }

  // Apply max_quests limit (capped at 20)
  const effectiveMax = Math.min(max_quests, 20);
  const selectedQuests = filteredQuests.slice(0, effectiveMax);

  // Assign IDs
  const quests = selectedQuests.map((rq, idx) => ({
    ...rq.quest,
    id: `quest_${String(idx + 1).padStart(3, "0")}`,
  }));

  // Compute quest type distribution
  const typeCounts = new Map<string, number>();
  for (const q of quests) {
    typeCounts.set(q.type, (typeCounts.get(q.type) ?? 0) + 1);
  }
  let dominantType = "none";
  let dominantCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantType = type;
    }
  }

  const questDensity = rows.length > 0 ? Math.round((quests.length / rows.length) * 100 * 100) / 100 : 0;

  // Suggested sequence: anomalies first (easy wins), then comparisons, trends, hypotheses, connections
  const typeOrder: Record<string, number> = { anomaly: 1, comparison: 2, trend: 3, hypothesis: 4, connection: 5 };
  const suggested = [...quests]
    .sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9))
    .map((q) => q.id);

  return {
    quests,
    dataset_summary: {
      rows: rows.length,
      columns: headers.length,
      quest_density: questDensity,
      dominant_quest_type: dominantType,
    },
    suggested_sequence: suggested,
  };
}

// ============================================================================
// TOOL 64: flow_anomaly_explain
// ============================================================================

export interface AnomalyExplainInput {
  csv_data: string;
  /** Row indices (0-indexed) of rows to explain */
  target_rows: number[];
  /** Optional column name to use as row identifier */
  id_column?: string;
  /** Narrative style: detective (default), scientific, casual */
  style?: "detective" | "scientific" | "casual";
}

export interface DrivingFeature {
  column: string;
  value: number;
  mean: number;
  z_score: number;
  contribution_pct: number;
  direction: "high" | "low";
}

export interface NearestNeighbor {
  row_index: number;
  label: string;
  distance: number;
}

export interface MicroCluster {
  cluster_size: number;
  member_indices: number[];
  description: string;
}

export interface AnomalyExplanation {
  row_index: number;
  row_id: string | null;
  surprise_score: number;
  nearest_neighbors: NearestNeighbor[];
  driving_features: DrivingFeature[];
  micro_cluster: MicroCluster | null;
  narrative: string;
  investigation_leads: string[];
}

export interface AnomalyExplainResult {
  explanations: AnomalyExplanation[];
}

// ============================================================================
// Internal helpers for anomaly explain
// ============================================================================

interface AEParsedData {
  headers: string[];
  rows: string[][];
  numericColIndices: number[];
  numericColNames: string[];
}

function aeParseData(csv: string): AEParsedData {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) {
    return { headers: [], rows: [], numericColIndices: [], numericColNames: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 0) {
      rows.push(parseCSVLine(line));
    }
  }

  // Identify numeric columns by checking all data rows
  const numericColIndices: number[] = [];
  const numericColNames: string[] = [];
  for (let col = 0; col < headers.length; col++) {
    let allNumeric = true;
    let hasData = false;
    for (const row of rows) {
      const val = row[col];
      if (val === undefined || val === "") continue;
      hasData = true;
      if (isNaN(Number(val))) {
        allNumeric = false;
        break;
      }
    }
    if (allNumeric && hasData) {
      numericColIndices.push(col);
      numericColNames.push(headers[col]);
    }
  }

  return { headers, rows, numericColIndices, numericColNames };
}

function aeGetNumericValues(rows: string[][], colIndex: number): number[] {
  return rows.map((row) => {
    const val = row[colIndex];
    return val !== undefined && val !== "" ? Number(val) : NaN;
  });
}

function aeComputeMean(values: number[]): number {
  const valid = values.filter((v) => !isNaN(v));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function aeComputeStdDev(values: number[], mean: number): number {
  const valid = values.filter((v) => !isNaN(v));
  if (valid.length < 2) return 0;
  const sumSq = valid.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / valid.length);
}

function aeComputeZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

// ============================================================================
// Main implementation
// ============================================================================

export function flowAnomalyExplain(input: AnomalyExplainInput): AnomalyExplainResult {
  const { csv_data, target_rows, id_column, style = "detective" } = input;

  const parsed = aeParseData(csv_data);
  const { headers, rows, numericColIndices, numericColNames } = parsed;

  if (rows.length === 0 || numericColIndices.length === 0) {
    return { explanations: [] };
  }

  // Precompute column statistics
  const colStats: Array<{ mean: number; stdDev: number; values: number[] }> = [];
  for (const colIdx of numericColIndices) {
    const values = aeGetNumericValues(rows, colIdx);
    const mean = aeComputeMean(values);
    const stdDev = aeComputeStdDev(values, mean);
    colStats.push({ mean, stdDev, values });
  }

  // Compute z-score vectors for all rows
  const zScoreMatrix: number[][] = [];
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const zVec: number[] = [];
    for (let ci = 0; ci < numericColIndices.length; ci++) {
      const val = colStats[ci].values[rowIdx];
      const z = aeComputeZScore(val, colStats[ci].mean, colStats[ci].stdDev);
      zVec.push(isNaN(z) ? 0 : z);
    }
    zScoreMatrix.push(zVec);
  }

  // Find id_column index
  const idColIndex = id_column ? headers.indexOf(id_column) : -1;

  // Build explanations for each target row
  const explanations: AnomalyExplanation[] = [];

  for (const targetIdx of target_rows) {
    if (targetIdx < 0 || targetIdx >= rows.length) continue;

    const targetZVec = zScoreMatrix[targetIdx];

    // Surprise score: RMS of z-scores = sqrt(sum(z_i^2) / n)
    const sumSquaredZ = targetZVec.reduce((sum, z) => sum + z * z, 0);
    const surpriseScore = Math.sqrt(sumSquaredZ / numericColIndices.length);

    // Driving features: contribution of each column to total surprise
    const totalAbsZSquared = targetZVec.reduce((sum, z) => sum + z * z, 0);

    const drivingFeatures: DrivingFeature[] = [];
    for (let ci = 0; ci < numericColIndices.length; ci++) {
      const rawVal = colStats[ci].values[targetIdx];
      const z = targetZVec[ci];
      const contribution = totalAbsZSquared > 0 ? (z * z / totalAbsZSquared) * 100 : 0;

      drivingFeatures.push({
        column: numericColNames[ci],
        value: rawVal,
        mean: colStats[ci].mean,
        z_score: z,
        contribution_pct: contribution,
        direction: z >= 0 ? "high" : "low",
      });
    }

    // Sort driving features by contribution descending
    drivingFeatures.sort((a, b) => b.contribution_pct - a.contribution_pct);

    // Nearest neighbors: Euclidean distance on z-scored values
    const distances: Array<{ rowIndex: number; distance: number }> = [];
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      if (rowIdx === targetIdx) continue;
      const otherZVec = zScoreMatrix[rowIdx];
      let distSq = 0;
      for (let ci = 0; ci < numericColIndices.length; ci++) {
        const diff = targetZVec[ci] - otherZVec[ci];
        distSq += diff * diff;
      }
      distances.push({ rowIndex: rowIdx, distance: Math.sqrt(distSq) });
    }
    distances.sort((a, b) => a.distance - b.distance);

    const topK = 3;
    const nearestNeighbors: NearestNeighbor[] = distances.slice(0, topK).map((d) => ({
      row_index: d.rowIndex,
      label: idColIndex >= 0 ? (rows[d.rowIndex][idColIndex] || `Row ${d.rowIndex}`) : `Row ${d.rowIndex}`,
      distance: Math.round(d.distance * 1000) / 1000,
    }));

    // Row ID
    const rowId = idColIndex >= 0 ? (rows[targetIdx][idColIndex] || null) : null;

    // Investigation leads
    const leads = aeGenerateInvestigationLeads(drivingFeatures, numericColNames, rowId, targetIdx);

    // Narrative
    const narrative = aeGenerateNarrative(
      style,
      targetIdx,
      rowId,
      surpriseScore,
      drivingFeatures,
      nearestNeighbors,
      numericColNames
    );

    explanations.push({
      row_index: targetIdx,
      row_id: rowId,
      surprise_score: Math.round(surpriseScore * 1000) / 1000,
      nearest_neighbors: nearestNeighbors,
      driving_features: drivingFeatures.map((f) => ({
        ...f,
        contribution_pct: Math.round(f.contribution_pct * 100) / 100,
        z_score: Math.round(f.z_score * 1000) / 1000,
        value: Math.round(f.value * 1000) / 1000,
        mean: Math.round(f.mean * 1000) / 1000,
      })),
      micro_cluster: null, // placeholder, computed below
      narrative,
      investigation_leads: leads,
    });
  }

  // Micro-cluster detection: group target rows with similar deviation patterns
  if (explanations.length >= 2) {
    aeDetectMicroClusters(explanations, zScoreMatrix, target_rows);
  }

  return { explanations };
}

// ============================================================================
// Micro-cluster detection
// ============================================================================

function aeDetectMicroClusters(
  explanations: AnomalyExplanation[],
  zScoreMatrix: number[][],
  targetRows: number[]
): void {
  const targetVectors = targetRows.map((ri) => zScoreMatrix[ri]);

  function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  const clusterThreshold = 0.8;
  const visited = new Set<number>();

  for (let i = 0; i < explanations.length; i++) {
    if (visited.has(i)) continue;

    const clusterMembers = [i];
    visited.add(i);

    for (let j = i + 1; j < explanations.length; j++) {
      if (visited.has(j)) continue;
      const sim = cosineSimilarity(targetVectors[i], targetVectors[j]);
      if (sim > clusterThreshold) {
        clusterMembers.push(j);
        visited.add(j);
      }
    }

    if (clusterMembers.length >= 2) {
      const topFeatures = clusterMembers.map((mi) => {
        const exp = explanations[mi];
        return exp.driving_features[0]?.column || "";
      });
      const commonFeature = topFeatures[0];

      const memberIndices = clusterMembers.map((mi) => explanations[mi].row_index);
      const description = `${clusterMembers.length} rows share a similar deviation pattern, primarily driven by ${commonFeature}`;

      for (const mi of clusterMembers) {
        explanations[mi].micro_cluster = {
          cluster_size: clusterMembers.length,
          member_indices: memberIndices,
          description,
        };
      }
    }
  }
}

// ============================================================================
// Narrative generation
// ============================================================================

function aeGenerateNarrative(
  style: "detective" | "scientific" | "casual",
  rowIndex: number,
  rowId: string | null,
  surpriseScore: number,
  features: DrivingFeature[],
  neighbors: NearestNeighbor[],
  numericColNames: string[]
): string {
  const rowLabel = rowId ? `"${rowId}" (Row ${rowIndex})` : `Row ${rowIndex}`;
  const topFeature = features[0];
  const secondFeature = features.length > 1 ? features[1] : null;

  const zMag = Math.abs(topFeature.z_score);
  const dirWord = topFeature.direction === "high" ? "above" : "below";
  const topContrib = Math.round(topFeature.contribution_pct);

  switch (style) {
    case "detective": {
      let narrative = `${rowLabel} stands apart from its neighbors.`;
      narrative += ` While the dataset average for ${topFeature.column} sits at ${aeFormatNum(topFeature.mean)},`;
      narrative += ` this row registers ${aeFormatNum(topFeature.value)} — a ${zMag.toFixed(1)} standard deviation departure ${dirWord} the mean,`;
      narrative += ` accounting for ${topContrib}% of its total surprise.`;

      if (secondFeature) {
        const secDir = secondFeature.direction === "high" ? "above" : "below";
        narrative += ` Adding to the intrigue, ${secondFeature.column} at ${aeFormatNum(secondFeature.value)}`;
        narrative += ` runs ${Math.abs(secondFeature.z_score).toFixed(1)} standard deviations ${secDir} average`;
        narrative += ` (${Math.round(secondFeature.contribution_pct)}% contribution).`;
      }

      if (neighbors.length > 0) {
        narrative += ` Its closest match is ${neighbors[0].label} at distance ${neighbors[0].distance},`;
        narrative += ` yet even this nearest neighbor tells a different story.`;
      }

      return narrative;
    }

    case "scientific": {
      let narrative = `Subject ${rowLabel} exhibits a composite surprise score of ${surpriseScore.toFixed(3)}`;
      narrative += ` (RMS z-score across ${numericColNames.length} numeric dimensions).`;
      narrative += ` The primary deviation driver is ${topFeature.column}`;
      narrative += ` (z = ${topFeature.z_score.toFixed(3)}, contribution = ${topContrib}%,`;
      narrative += ` observed = ${aeFormatNum(topFeature.value)}, population mean = ${aeFormatNum(topFeature.mean)}).`;

      if (secondFeature) {
        narrative += ` Secondary driver: ${secondFeature.column}`;
        narrative += ` (z = ${secondFeature.z_score.toFixed(3)}, contribution = ${Math.round(secondFeature.contribution_pct)}%).`;
      }

      if (neighbors.length > 0) {
        narrative += ` Nearest neighbor analysis: k=3 yields distances`;
        narrative += ` [${neighbors.map((n) => n.distance).join(", ")}].`;
      }

      return narrative;
    }

    case "casual": {
      let narrative = `So here is what is interesting about ${rowLabel}.`;
      narrative += ` Its ${topFeature.column} is ${aeFormatNum(topFeature.value)},`;
      narrative += ` which is way ${dirWord} the average of ${aeFormatNum(topFeature.mean)}.`;
      narrative += ` That one thing alone makes up ${topContrib}% of why this row looks so different.`;

      if (secondFeature) {
        const secDir = secondFeature.direction === "high" ? "higher" : "lower";
        narrative += ` On top of that, ${secondFeature.column} is also noticeably ${secDir} than usual.`;
      }

      if (neighbors.length > 0) {
        narrative += ` The closest similar row is ${neighbors[0].label}, but even that one is not really that close.`;
      }

      return narrative;
    }
  }
}

function aeFormatNum(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}

// ============================================================================
// Investigation leads generation
// ============================================================================

function aeGenerateInvestigationLeads(
  features: DrivingFeature[],
  allNumericCols: string[],
  rowId: string | null,
  rowIndex: number
): string[] {
  const leads: string[] = [];
  const rowLabel = rowId ? `"${rowId}"` : `Row ${rowIndex}`;

  if (features.length > 0) {
    const topFeat = features[0];
    leads.push(
      `Investigate why ${rowLabel} has an unusual ${topFeat.column} value of ${aeFormatNum(topFeat.value)} (${Math.abs(topFeat.z_score).toFixed(1)} standard deviations from the mean of ${aeFormatNum(topFeat.mean)}).`
    );
  }

  if (features.length > 1) {
    const secondFeat = features[1];
    leads.push(
      `Check whether the ${features[0].column} and ${secondFeat.column} deviations are related — do they share a common cause?`
    );
  }

  leads.push(
    `Compare ${rowLabel} against its nearest neighbors to understand what makes it different in context.`
  );

  if (allNumericCols.length > 2) {
    leads.push(
      `Look for temporal patterns — has ${rowLabel} always been an outlier, or did something change?`
    );
  }

  return leads;
}

// ============================================================================
// Tool 63: flow_near_miss_detector
// ============================================================================
//
// Finds patterns that ALMOST hold in data. The gambling psychology of data
// analysis, ethically deployed. Near-misses drive genuine investigation.
//
// Types:
// - correlation: strong r but with outlier exceptions
// - cluster_boundary: points assigned to a cluster but near another's edge
// - trend_break: monotonic trend holds for N-1 segments
// - threshold_rule: if X > T then Y, with exceptions
// ============================================================================

export interface NearMissDetectorInput {
  csv_data: string;
  /** Max near-misses to return (default 10, max 30) */
  max_near_misses?: number;
  /** Filter to specific near-miss types */
  types?: ("correlation" | "cluster_boundary" | "trend_break")[];
}

export interface NearMiss {
  id: string;
  type: "correlation" | "cluster_boundary" | "trend_break";
  pattern_strength: number;
  intrigue_score: number;
  columns_involved: string[];
  exception_rows: number[];
  narrative: string;
  investigation_question: string;
  statistical_basis: {
    metric: string;
    value: number;
    without_exceptions?: number;
  };
}

export interface NearMissDetectorResult {
  near_misses: NearMiss[];
  highlighted_csv: string;
  dataset_summary: {
    rows: number;
    columns: number;
    near_miss_density: number;
    dominant_type: string;
  };
}

export async function flowNearMissDetector(
  input: NearMissDetectorInput
): Promise<NearMissDetectorResult> {
  const maxNM = Math.min(input.max_near_misses ?? 10, 30);
  const allowedTypes = input.types ?? ["correlation", "cluster_boundary", "trend_break"];

  const lines = input.csv_data.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      near_misses: [],
      highlighted_csv: input.csv_data,
      dataset_summary: { rows: 0, columns: 0, near_miss_density: 0, dominant_type: "none" },
    };
  }

  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }

  // Identify numeric columns
  const numericCols: number[] = [];
  for (let c = 0; c < headers.length; c++) {
    const vals = rows.map((r) => parseFloat(r[c]));
    if (vals.filter((v) => !isNaN(v)).length > rows.length * 0.5) {
      numericCols.push(c);
    }
  }

  // Compute column stats
  const colStats = numericCols.map((ci) => {
    const vals = rows.map((r) => parseFloat(r[ci])).filter((v) => !isNaN(v));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
    return { ci, name: headers[ci], mean, std, vals };
  });

  const nearMisses: NearMiss[] = [];
  let nmId = 0;

  // --- Correlation near-misses ---
  if (allowedTypes.includes("correlation") && numericCols.length >= 2) {
    for (let a = 0; a < colStats.length; a++) {
      for (let b = a + 1; b < colStats.length; b++) {
        const sa = colStats[a];
        const sb = colStats[b];
        if (sa.std === 0 || sb.std === 0) continue;

        // Compute full correlation
        const pairs: { va: number; vb: number; ri: number }[] = [];
        for (let ri = 0; ri < rows.length; ri++) {
          const va = parseFloat(rows[ri][sa.ci]);
          const vb = parseFloat(rows[ri][sb.ci]);
          if (!isNaN(va) && !isNaN(vb)) pairs.push({ va, vb, ri });
        }
        if (pairs.length < 4) continue;

        const fullR = nmPearson(pairs.map((p) => p.va), pairs.map((p) => p.vb));
        const absFullR = Math.abs(fullR);

        // For each point, check if removing it significantly improves the correlation
        if (absFullR > 0.3 && absFullR < 0.95) {
          // moderate correlation — check for outlier exceptions
          for (let dropIdx = 0; dropIdx < pairs.length; dropIdx++) {
            const filtered = pairs.filter((_, i) => i !== dropIdx);
            const withoutR = nmPearson(
              filtered.map((p) => p.va),
              filtered.map((p) => p.vb)
            );
            const improvement = Math.abs(withoutR) - absFullR;
            if (improvement > 0.1 && Math.abs(withoutR) > 0.8) {
              // Removing this point makes a strong pattern appear
              const patternStrength = Math.abs(withoutR);
              const intrigue = patternStrength * improvement * (1 - absFullR);
              nearMisses.push({
                id: `nm_${++nmId}`,
                type: "correlation",
                pattern_strength: patternStrength,
                intrigue_score: Math.min(1, intrigue * 5),
                columns_involved: [sa.name, sb.name],
                exception_rows: [pairs[dropIdx].ri],
                narrative: `${sa.name} and ${sb.name} show a strong correlation (r=${withoutR.toFixed(2)}) across most data points, but row ${pairs[dropIdx].ri} breaks the pattern with ${sa.name}=${nmFmt(pairs[dropIdx].va)} and ${sb.name}=${nmFmt(pairs[dropIdx].vb)}. Without this exception, the relationship would be much cleaner.`,
                investigation_question: `Why does row ${pairs[dropIdx].ri} deviate from the ${sa.name}-${sb.name} relationship that holds for ${filtered.length} other data points?`,
                statistical_basis: {
                  metric: "pearson_r",
                  value: fullR,
                  without_exceptions: withoutR,
                },
              });
              break; // one per column pair
            }
          }
        }

        // Also check: very high correlation with 1-2 outliers
        if (absFullR > 0.7) {
          // Find residuals from linear fit
          const meanA = pairs.reduce((s, p) => s + p.va, 0) / pairs.length;
          const meanB = pairs.reduce((s, p) => s + p.vb, 0) / pairs.length;
          const slope = pairs.reduce((s, p) => s + (p.va - meanA) * (p.vb - meanB), 0) /
            pairs.reduce((s, p) => s + (p.va - meanA) ** 2, 0);
          const intercept = meanB - slope * meanA;

          const residuals = pairs.map((p) => ({
            ri: p.ri,
            residual: Math.abs(p.vb - (slope * p.va + intercept)),
          }));
          const meanResidual = residuals.reduce((s, r) => s + r.residual, 0) / residuals.length;
          const stdResidual = Math.sqrt(
            residuals.reduce((s, r) => s + (r.residual - meanResidual) ** 2, 0) / residuals.length
          );

          if (stdResidual > 0) {
            const outlierResiduals = residuals.filter(
              (r) => (r.residual - meanResidual) / stdResidual > 2.0
            );
            if (outlierResiduals.length > 0 && outlierResiduals.length <= 2) {
              const withoutOutliers = pairs.filter(
                (_, i) => !outlierResiduals.some((o) => o.ri === pairs[i].ri)
              );
              const cleanR = nmPearson(
                withoutOutliers.map((p) => p.va),
                withoutOutliers.map((p) => p.vb)
              );
              if (Math.abs(cleanR) > absFullR + 0.05) {
                const patternStrength = Math.abs(cleanR);
                const intrigue = patternStrength * (Math.abs(cleanR) - absFullR);
                // Avoid duplicate if we already found this pair
                const alreadyFound = nearMisses.some(
                  (nm) =>
                    nm.type === "correlation" &&
                    nm.columns_involved[0] === sa.name &&
                    nm.columns_involved[1] === sb.name
                );
                if (!alreadyFound) {
                  nearMisses.push({
                    id: `nm_${++nmId}`,
                    type: "correlation",
                    pattern_strength: patternStrength,
                    intrigue_score: Math.min(1, intrigue * 3),
                    columns_involved: [sa.name, sb.name],
                    exception_rows: outlierResiduals.map((o) => o.ri),
                    narrative: `${sa.name} and ${sb.name} are strongly correlated (r=${fullR.toFixed(2)}), but ${outlierResiduals.length === 1 ? "one row" : `${outlierResiduals.length} rows`} deviate significantly from the linear trend. Without ${outlierResiduals.length === 1 ? "this exception" : "these exceptions"}, the correlation jumps to r=${cleanR.toFixed(2)}.`,
                    investigation_question: `What makes ${outlierResiduals.length === 1 ? `row ${outlierResiduals[0].ri}` : `rows ${outlierResiduals.map((o) => o.ri).join(" and ")}`} different from the ${sa.name}-${sb.name} pattern that holds for every other data point?`,
                    statistical_basis: {
                      metric: "pearson_r",
                      value: fullR,
                      without_exceptions: cleanR,
                    },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // --- Cluster boundary near-misses ---
  if (allowedTypes.includes("cluster_boundary") && numericCols.length >= 2 && rows.length >= 6) {
    // Simple 2-means clustering on all numeric columns
    const numVals: number[][] = rows.map((r) =>
      numericCols.map((ci) => {
        const v = parseFloat(r[ci]);
        return isNaN(v) ? 0 : v;
      })
    );

    // Normalize
    const dims = numericCols.length;
    const colMins = Array(dims).fill(Infinity);
    const colMaxs = Array(dims).fill(-Infinity);
    for (const row of numVals) {
      for (let d = 0; d < dims; d++) {
        if (row[d] < colMins[d]) colMins[d] = row[d];
        if (row[d] > colMaxs[d]) colMaxs[d] = row[d];
      }
    }
    const normalized = numVals.map((row) =>
      row.map((v, d) => {
        const range = colMaxs[d] - colMins[d];
        return range > 0 ? (v - colMins[d]) / range : 0;
      })
    );

    // 2-means (simplified k-means)
    const k = 2;
    let centroids = [normalized[0].slice(), normalized[normalized.length - 1].slice()];
    const assignments = new Array(normalized.length).fill(0);

    for (let iter = 0; iter < 20; iter++) {
      // Assign
      for (let ri = 0; ri < normalized.length; ri++) {
        let bestDist = Infinity;
        for (let ci = 0; ci < k; ci++) {
          const dist = nmEuclidean(normalized[ri], centroids[ci]);
          if (dist < bestDist) {
            bestDist = dist;
            assignments[ri] = ci;
          }
        }
      }
      // Update centroids
      const newCentroids = Array.from({ length: k }, () => new Array(dims).fill(0));
      const counts = new Array(k).fill(0);
      for (let ri = 0; ri < normalized.length; ri++) {
        const ci = assignments[ri];
        counts[ci]++;
        for (let d = 0; d < dims; d++) {
          newCentroids[ci][d] += normalized[ri][d];
        }
      }
      for (let ci = 0; ci < k; ci++) {
        if (counts[ci] > 0) {
          for (let d = 0; d < dims; d++) {
            newCentroids[ci][d] /= counts[ci];
          }
        }
      }
      centroids = newCentroids;
    }

    // Check cluster separation — only look for boundary points if clusters are distinct
    const interClusterDist = nmEuclidean(centroids[0], centroids[1]);
    if (interClusterDist > 0.2) {
      // Find points close to the boundary (ratio of distances to both centroids near 1.0)
      for (let ri = 0; ri < normalized.length; ri++) {
        const d0 = nmEuclidean(normalized[ri], centroids[0]);
        const d1 = nmEuclidean(normalized[ri], centroids[1]);
        const maxD = Math.max(d0, d1);
        const minD = Math.min(d0, d1);
        const ratio = maxD > 0 ? minD / maxD : 1;

        // Boundary point: almost equidistant (ratio > 0.6) and reasonably close to both
        if (ratio > 0.6 && minD < interClusterDist * 0.8) {
          const assignedCluster = assignments[ri];
          const otherCluster = 1 - assignedCluster;
          const switchCost = d1 - d0; // how much closer is the assigned cluster

          const patternStrength = 1 - ratio; // closer to 0 = more ambiguous
          const intrigue = ratio * (1 - Math.abs(switchCost) / interClusterDist);

          const idCol = headers.findIndex((h) =>
            /^(id|name|label)$/i.test(h)
          );
          const rowLabel = idCol >= 0 ? rows[ri][idCol] : `Row ${ri}`;

          nearMisses.push({
            id: `nm_${++nmId}`,
            type: "cluster_boundary",
            pattern_strength: Math.max(0.1, 1 - patternStrength),
            intrigue_score: Math.min(1, Math.max(0.1, intrigue)),
            columns_involved: numericCols.map((ci) => headers[ci]),
            exception_rows: [ri],
            narrative: `${rowLabel} sits on the boundary between two data clusters. It is assigned to cluster ${assignedCluster + 1} but is almost equidistant from cluster ${otherCluster + 1}. A small shift in its values would flip its classification entirely.`,
            investigation_question: `What determines whether ${rowLabel} belongs to cluster ${assignedCluster + 1} or cluster ${otherCluster + 1}, and what would tip it over the edge?`,
            statistical_basis: {
              metric: "boundary_ratio",
              value: ratio,
            },
          });
        }
      }
    }
  }

  // --- Trend break near-misses ---
  if (allowedTypes.includes("trend_break") && rows.length >= 5) {
    for (const stat of colStats) {
      if (stat.std === 0) continue;

      // Check for monotonic trend with breaks
      const vals = rows.map((r) => parseFloat(r[stat.ci])).filter((v) => !isNaN(v));
      if (vals.length < 5) continue;

      // Count up/down segments
      let ups = 0;
      let downs = 0;
      const directions: number[] = [];
      for (let i = 1; i < vals.length; i++) {
        const diff = vals[i] - vals[i - 1];
        if (diff > 0) {
          ups++;
          directions.push(1);
        } else if (diff < 0) {
          downs++;
          directions.push(-1);
        } else {
          directions.push(0);
        }
      }

      const total = ups + downs;
      if (total === 0) continue;

      // If the column is MOSTLY monotonic (e.g., 80%+ same direction), find the breaks
      const dominantDir = ups > downs ? 1 : -1;
      const dominantCount = dominantDir === 1 ? ups : downs;
      const dominantRatio = dominantCount / total;

      if (dominantRatio >= 0.7 && dominantRatio < 1.0) {
        // Find the break points
        const breakIndices: number[] = [];
        for (let i = 0; i < directions.length; i++) {
          if (directions[i] !== 0 && directions[i] !== dominantDir) {
            breakIndices.push(i + 1); // row index of the break
          }
        }

        if (breakIndices.length > 0 && breakIndices.length <= 3) {
          const trendWord = dominantDir === 1 ? "upward" : "downward";
          const breakWord = dominantDir === 1 ? "drops" : "spikes";

          // Compute magnitudes of breaks
          const breakDetails = breakIndices.map((bi) => {
            const prev = vals[bi - 1];
            const curr = vals[bi];
            const mag = Math.abs(curr - prev);
            return { bi, prev, curr, mag };
          });

          const patternStrength = dominantRatio;
          const maxBreakMag = Math.max(...breakDetails.map((b) => b.mag));
          const meanVal = vals.reduce((a, b) => a + b, 0) / vals.length;
          const normalizedMag = meanVal !== 0 ? maxBreakMag / Math.abs(meanVal) : 0;
          const intrigue = patternStrength * Math.min(1, normalizedMag);

          // Use first ID column or row index for labels
          const idCol = headers.findIndex((h) => /^(id|name|label|date|month|year)$/i.test(h));

          const breakLabels = breakIndices.map((bi) =>
            idCol >= 0 ? rows[bi][idCol] : `Row ${bi}`
          );

          nearMisses.push({
            id: `nm_${++nmId}`,
            type: "trend_break",
            pattern_strength: patternStrength,
            intrigue_score: Math.min(1, Math.max(0.1, intrigue)),
            columns_involved: [stat.name],
            exception_rows: breakIndices,
            narrative: `${stat.name} follows a consistent ${trendWord} trend across ${dominantCount} of ${total} transitions, but ${breakWord} at ${breakLabels.join(", ")}. The pattern holds for ${Math.round(dominantRatio * 100)}% of the data — what happened at the break ${breakIndices.length === 1 ? "point" : "points"}?`,
            investigation_question: `Why does ${stat.name} ${breakWord} at ${breakLabels.join(" and ")} when the ${trendWord} trend holds everywhere else?`,
            statistical_basis: {
              metric: "monotonicity_ratio",
              value: dominantRatio,
            },
          });
        }
      }
    }
  }

  // Sort by intrigue score descending
  nearMisses.sort((a, b) => b.intrigue_score - a.intrigue_score);

  // Trim to max
  const trimmed = nearMisses.slice(0, maxNM);

  // Build highlighted CSV
  const exceptionRowSet = new Set<number>();
  for (const nm of trimmed) {
    for (const ri of nm.exception_rows) exceptionRowSet.add(ri);
  }

  const csvLines = [headers.join(",") + ",_near_miss_role"];
  for (let ri = 0; ri < rows.length; ri++) {
    const role = exceptionRowSet.has(ri) ? "exception" : "conforming";
    csvLines.push(rows[ri].join(",") + "," + role);
  }

  const typeCounts: Record<string, number> = {};
  for (const nm of trimmed) {
    typeCounts[nm.type] = (typeCounts[nm.type] || 0) + 1;
  }
  const dominantType =
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  return {
    near_misses: trimmed,
    highlighted_csv: csvLines.join("\n"),
    dataset_summary: {
      rows: rows.length,
      columns: headers.length,
      near_miss_density: rows.length > 0 ? trimmed.length / rows.length : 0,
      dominant_type: dominantType,
    },
  };
}

// --- Near-miss utility functions ---

function nmPearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx2 = 0,
    dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

function nmEuclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function nmFmt(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}

// ============================================================================
// Tool 64: flow_progressive_disclosure
// ============================================================================
//
// Fog-of-war layers on any dataset. Like a JPG drawing in — the longer you
// dwell, the smarter the world gets around you. Layer 0 = identity/surface.
// Layer N = everything, including derived and computed columns.
// ============================================================================

export interface ProgressiveDisclosureInput {
  csv_data: string;
  /** Manual column-to-layer assignment. If omitted, auto-assigns. */
  column_layers?: Record<string, number>;
  /** Columns that appear in every layer regardless of assignment */
  always_visible?: string[];
  /** Maximum number of layers (default 4, max 8) */
  max_layers?: number;
}

export interface DisclosureLayer {
  layer: number;
  columns: string[];
  csv: string;
  description: string;
}

export interface RevealManifestEntry {
  layer: number;
  columns_revealed: string[];
  hint: string;
}

export interface ProgressiveDisclosureResult {
  layers: DisclosureLayer[];
  reveal_manifest: RevealManifestEntry[];
  full_csv: string;
  dataset_summary: {
    total_columns: number;
    total_rows: number;
    num_layers: number;
  };
}

export async function flowProgressiveDisclosure(
  input: ProgressiveDisclosureInput
): Promise<ProgressiveDisclosureResult> {
  const maxLayers = Math.min(input.max_layers ?? 4, 8);
  const alwaysVisible = new Set(input.always_visible ?? []);

  const lines = input.csv_data.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      layers: [{ layer: 0, columns: [], csv: input.csv_data, description: "Empty dataset" }],
      reveal_manifest: [],
      full_csv: input.csv_data,
      dataset_summary: { total_columns: 0, total_rows: 0, num_layers: 1 },
    };
  }

  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }

  // Determine column assignments
  let columnToLayer: Record<string, number>;

  if (input.column_layers) {
    columnToLayer = { ...input.column_layers };
    // Ensure all headers are assigned
    for (const h of headers) {
      if (!(h in columnToLayer)) {
        // Assign to highest layer
        const maxExisting = Math.max(...Object.values(columnToLayer), 0);
        columnToLayer[h] = maxExisting;
      }
    }
  } else {
    columnToLayer = pdAutoAssign(headers, rows, maxLayers);
  }

  // Apply always_visible: move those columns to layer 0
  for (const col of alwaysVisible) {
    if (col in columnToLayer) {
      columnToLayer[col] = 0;
    }
  }

  // Group columns by layer
  const layerMap = new Map<number, string[]>();
  for (const [col, layer] of Object.entries(columnToLayer)) {
    if (!headers.includes(col)) continue;
    const clampedLayer = Math.min(layer, maxLayers - 1);
    if (!layerMap.has(clampedLayer)) layerMap.set(clampedLayer, []);
    layerMap.get(clampedLayer)!.push(col);
  }

  // Build sorted layer numbers
  const layerNums = Array.from(layerMap.keys()).sort((a, b) => a - b);

  // Ensure we have at least layer 0
  if (layerNums.length === 0) {
    layerNums.push(0);
    layerMap.set(0, headers.slice());
  }

  // Build cumulative layers
  const disclosureLayers: DisclosureLayer[] = [];
  let cumulativeCols: string[] = [];

  for (const layerNum of layerNums) {
    const newCols = layerMap.get(layerNum) || [];
    // Add new columns while preserving order from headers
    for (const col of newCols) {
      if (!cumulativeCols.includes(col)) {
        cumulativeCols.push(col);
      }
    }

    // Sort cumulative columns in original header order
    const sortedCols = cumulativeCols.slice().sort(
      (a, b) => headers.indexOf(a) - headers.indexOf(b)
    );

    // Generate CSV for this layer
    const colIndices = sortedCols.map((c) => headers.indexOf(c));
    const layerLines = [sortedCols.join(",")];
    for (const row of rows) {
      layerLines.push(colIndices.map((ci) => row[ci] ?? "").join(","));
    }

    disclosureLayers.push({
      layer: layerNum,
      columns: sortedCols.slice(),
      csv: layerLines.join("\n"),
      description: pdLayerDescription(layerNum, newCols, sortedCols),
    });
  }

  // Ensure at least 2 layers if possible by splitting if only 1
  if (disclosureLayers.length === 1 && headers.length > 1) {
    // Split: first half to layer 0, rest to layer 1
    const idCols = headers.filter((h) => pdIsIdentifier(h, rows, headers));
    const nonIdCols = headers.filter((h) => !idCols.includes(h));

    if (nonIdCols.length > 0) {
      const layer0Cols = idCols.length > 0 ? idCols : [headers[0]];
      const layer1Cols = headers.slice(); // all columns

      const layer0Indices = layer0Cols.map((c) => headers.indexOf(c));
      const layer0Lines = [layer0Cols.join(",")];
      for (const row of rows) {
        layer0Lines.push(layer0Indices.map((ci) => row[ci] ?? "").join(","));
      }

      disclosureLayers.length = 0;
      disclosureLayers.push({
        layer: 0,
        columns: layer0Cols.slice(),
        csv: layer0Lines.join("\n"),
        description: pdLayerDescription(0, layer0Cols, layer0Cols),
      });

      const layer1Indices = headers.map((_, i) => i);
      const layer1Lines = [headers.join(",")];
      for (const row of rows) {
        layer1Lines.push(layer1Indices.map((ci) => row[ci] ?? "").join(","));
      }

      disclosureLayers.push({
        layer: 1,
        columns: headers.slice(),
        csv: layer1Lines.join("\n"),
        description: pdLayerDescription(1, nonIdCols, headers),
      });
    }
  }

  // Build reveal manifest
  const revealManifest: RevealManifestEntry[] = [];
  let prevCols = new Set<string>();
  for (const layer of disclosureLayers) {
    const newlyRevealed = layer.columns.filter((c) => !prevCols.has(c));
    if (newlyRevealed.length > 0) {
      revealManifest.push({
        layer: layer.layer,
        columns_revealed: newlyRevealed,
        hint: pdGenerateHint(layer.layer, newlyRevealed, headers, rows),
      });
    }
    for (const c of layer.columns) prevCols.add(c);
  }

  // Build full CSV with _visibility_layer column
  const fullCsvLines = [headers.join(",") + ",_visibility_layer"];
  for (const row of rows) {
    // Each column gets its layer assignment; row gets the highest layer of its visible columns
    const maxLayer = Math.max(
      ...headers.map((h) => columnToLayer[h] ?? 0)
    );
    fullCsvLines.push(row.join(",") + "," + maxLayer);
  }

  return {
    layers: disclosureLayers,
    reveal_manifest: revealManifest,
    full_csv: fullCsvLines.join("\n"),
    dataset_summary: {
      total_columns: headers.length,
      total_rows: rows.length,
      num_layers: disclosureLayers.length,
    },
  };
}

// --- Progressive disclosure utilities ---

function pdAutoAssign(
  headers: string[],
  rows: string[][],
  maxLayers: number
): Record<string, number> {
  const assignments: Record<string, number> = {};
  const numLayers = Math.min(maxLayers, Math.max(2, Math.ceil(headers.length / 2)));

  // Classify each column
  const classifications: { col: string; priority: number }[] = [];

  for (const col of headers) {
    const isId = pdIsIdentifier(col, rows, headers);
    const isNumeric = rows.filter((r) => {
      const idx = headers.indexOf(col);
      return !isNaN(parseFloat(r[idx]));
    }).length > rows.length * 0.5;

    const idx = headers.indexOf(col);
    const uniqueVals = new Set(rows.map((r) => r[idx]));
    const uniqueRatio = uniqueVals.size / rows.length;

    // Lower priority = earlier layer (more visible)
    let priority = 2; // default: middle

    if (isId) {
      priority = 0; // IDs always first
    } else if (
      /^(name|label|title|category|type|status|class)$/i.test(col)
    ) {
      priority = 0; // descriptive columns first
    } else if (isNumeric) {
      // Compute variance to rank numeric columns
      const vals = rows
        .map((r) => parseFloat(r[idx]))
        .filter((v) => !isNaN(v));
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
      const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

      if (cv > 0.5) {
        priority = 1; // high-variance numerics are interesting, layer 1
      } else {
        priority = 2; // low-variance numerics deeper
      }
    } else if (uniqueRatio > 0.9) {
      priority = 3; // near-unique non-numeric (maybe derived) → deep layer
    }

    // Check for computed/derived column patterns
    if (/(_per_|_ratio|_pct|_score|_rank|_index|adjusted|computed|derived)/i.test(col)) {
      priority = Math.max(priority, 3); // derived columns go deep
    }

    classifications.push({ col, priority });
  }

  // Map priorities to layers
  const priorities = [...new Set(classifications.map((c) => c.priority))].sort(
    (a, b) => a - b
  );
  const priorityToLayer: Record<number, number> = {};
  for (let i = 0; i < priorities.length; i++) {
    priorityToLayer[priorities[i]] = Math.min(i, numLayers - 1);
  }

  for (const { col, priority } of classifications) {
    assignments[col] = priorityToLayer[priority];
  }

  return assignments;
}

function pdIsIdentifier(col: string, rows: string[][], headers: string[]): boolean {
  if (/^(id|_id|key|uuid|guid)$/i.test(col)) return true;
  if (/^(name|label)$/i.test(col)) return true;

  // Check if column has all unique values and is first or second column
  const idx = headers.indexOf(col);
  if (idx > 1) return false;

  const vals = rows.map((r) => r[idx]);
  const uniqueVals = new Set(vals);
  return uniqueVals.size === rows.length;
}

function pdLayerDescription(
  layerNum: number,
  newCols: string[],
  allCols: string[]
): string {
  if (layerNum === 0) {
    return `Surface layer: ${newCols.join(", ")} — the identity and primary features of each data point`;
  }
  if (newCols.length === 0) return `Layer ${layerNum}: no new columns`;
  const colList = newCols.slice(0, 3).join(", ");
  const more = newCols.length > 3 ? ` and ${newCols.length - 3} more` : "";
  return `Layer ${layerNum}: reveals ${colList}${more} — deeper patterns emerge (${allCols.length} total columns visible)`;
}

function pdGenerateHint(
  layerNum: number,
  newCols: string[],
  headers: string[],
  rows: string[][]
): string {
  if (layerNum === 0) {
    return `Start here: ${newCols.join(", ")} give you the lay of the land. Look for names and categories that stand out.`;
  }

  // Generate contextual hints based on column types
  const numericNew = newCols.filter((col) => {
    const idx = headers.indexOf(col);
    return rows.filter((r) => !isNaN(parseFloat(r[idx]))).length > rows.length * 0.5;
  });

  if (numericNew.length > 0) {
    return `Layer ${layerNum} reveals ${numericNew.join(", ")} — look for correlations with what you already know from previous layers. The patterns in ${numericNew[0]} may explain outliers you noticed earlier.`;
  }

  return `Layer ${layerNum} reveals ${newCols.join(", ")} — these details add depth. Cross-reference with earlier layers to spot hidden connections.`;
}

// ============================================================================
// Tool 65: flow_insight_scorer
// Peer review system for data exploration. Tests whether a claimed insight is
// statistically real, novel, and robust.
// ============================================================================

export interface InsightScorerInput {
  csv_data: string;
  /** The insight to evaluate — natural language or structured */
  insight: string;
  /** Type of insight to test */
  insight_type: "correlation" | "group_difference" | "trend" | "outlier" | "threshold";
  /** Column(s) involved */
  columns: string[];
  /** Optional: for group_difference, which column defines groups */
  group_column?: string;
}

export interface InsightScore {
  significance: number;      // 0-1: statistical significance (p-value inverted)
  effect_size: number;       // 0-1: practical significance (Cohen's d, r², etc.)
  novelty: number;           // 0-1: would basic describe_dataset have found this?
  robustness: number;        // 0-1: does it hold under bootstrap resampling?
  discovery_score: number;   // 0-1: weighted composite
  verdict: "genuine_discovery" | "interesting_but_fragile" | "trivial" | "likely_noise";
}

export interface InsightScorerResult {
  score: InsightScore;
  evidence: {
    test_used: string;
    test_statistic: number;
    p_value: number;
    effect_size_measure: string;
    effect_size_value: number;
    bootstrap_hold_rate: number;
    sample_size: number;
  };
  narrative: string;
  recommendations: string[];
}

// --- Insight Scorer helpers (prefixed with is_ to avoid naming conflicts) ---

/** Parse CSV into headers + rows of string arrays */
function is_parseCSV(csv_data: string): { headers: string[]; rows: string[][] } {
  const lines = csv_data.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseCSVLine(l));
  return { headers, rows };
}

/** Extract numeric column values by column name */
function is_getNumericColumn(headers: string[], rows: string[][], colName: string): number[] {
  const idx = headers.indexOf(colName);
  if (idx < 0) return [];
  return rows.map((r) => parseFloat(r[idx])).filter((v) => !isNaN(v));
}

/** Extract string column values by column name */
function is_getStringColumn(headers: string[], rows: string[][], colName: string): string[] {
  const idx = headers.indexOf(colName);
  if (idx < 0) return [];
  return rows.map((r) => r[idx]);
}

/** Mean of a number array */
function is_mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Standard deviation (population) */
function is_std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = is_mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Standard deviation (sample) */
function is_stdSample(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = is_mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Pearson correlation coefficient */
function is_pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = is_mean(x.slice(0, n));
  const my = is_mean(y.slice(0, n));
  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }
  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : sumXY / denom;
}

/** t-statistic for Pearson r significance */
function is_tStatForR(r: number, n: number): number {
  if (Math.abs(r) >= 1) return r > 0 ? 100 : -100;
  return r * Math.sqrt((n - 2) / (1 - r * r));
}

/** Two-tailed p-value from t-statistic using regularized incomplete beta function.
 *  Uses the continued fraction expansion (Lentz's algorithm) for I_x(a,b). */
function is_tTestPValue(tStat: number, df: number): number {
  const absT = Math.abs(tStat);
  if (df <= 0) return 1;
  if (absT === 0) return 1;

  // For very large t, p ≈ 0
  if (absT > 40) return 0;

  // x = df / (df + t²), then p = I_x(df/2, 1/2)
  const x = df / (df + absT * absT);
  const a = df / 2;
  const b = 0.5;
  const p = is_regularizedBeta(x, a, b);
  return Math.min(1, Math.max(0, p));
}

/** Regularized incomplete beta function I_x(a, b) using continued fraction (Lentz).
 *  For the t-distribution CDF: P(T <= t) for df = 2a, we need I_{df/(df+t²)}(df/2, 1/2). */
function is_regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the identity: if x > (a+1)/(a+b+2), compute 1 - I_{1-x}(b, a)
  const threshold = (a + 1) / (a + b + 2);
  if (x > threshold) {
    return 1 - is_regularizedBeta(1 - x, b, a);
  }

  // Log of the coefficient: x^a * (1-x)^b / (a * B(a,b))
  const lnPrefix = a * Math.log(x) + b * Math.log(1 - x) - is_lnBeta(a, b) - Math.log(a);

  // Continued fraction using modified Lentz's algorithm
  const maxIter = 200;
  const eps = 1e-14;
  const tiny = 1e-30;

  let c = 1;
  let d = 1 / Math.max(Math.abs(1 - (a + b) * x / (a + 1)), tiny);
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step: d_{2m} = m*(b-m)*x / ((a+2m-1)*(a+2m))
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 / Math.max(Math.abs(1 + aa * d), tiny);
    c = Math.max(Math.abs(1 + aa / c), tiny);
    h *= d * c;

    // Odd step: d_{2m+1} = -(a+m)*(a+b+m)*x / ((a+2m)*(a+2m+1))
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 / Math.max(Math.abs(1 + aa * d), tiny);
    c = Math.max(Math.abs(1 + aa / c), tiny);
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  const result = Math.exp(lnPrefix) * (h - 1);
  // Clamp to [0, 1] due to floating point
  return Math.max(0, Math.min(1, result));
}

/** Log of the beta function: ln(B(a,b)) = lnGamma(a) + lnGamma(b) - lnGamma(a+b) */
function is_lnBeta(a: number, b: number): number {
  return is_lnGamma(a) + is_lnGamma(b) - is_lnGamma(a + b);
}

/** Lanczos approximation for ln(Gamma(z)) */
function is_lnGamma(z: number): number {
  if (z <= 0) return 0;
  // Lanczos coefficients (g=7)
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    // Reflection formula: Gamma(z)*Gamma(1-z) = pi/sin(pi*z)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - is_lnGamma(1 - z);
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Complement of standard normal CDF: P(Z > z) */
function is_normalCDFComplement(z: number): number {
  if (z < 0) return 1 - is_normalCDFComplement(-z);
  // Abramowitz and Stegun approximation 7.1.26
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const t = 1 / (1 + p * z);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const result = poly * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  return Math.max(0, Math.min(1, result));
}

/** Normal CDF: P(Z <= z) */
function is_normalCDF(z: number): number {
  return 1 - is_normalCDFComplement(z);
}

/** Welch's t-test: returns { t, df, p } */
function is_welchTTest(
  a: number[],
  b: number[]
): { t: number; df: number; p: number } {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return { t: 0, df: 1, p: 1 };

  const mA = is_mean(a);
  const mB = is_mean(b);
  const vA = is_stdSample(a) ** 2;
  const vB = is_stdSample(b) ** 2;

  const seDiff = Math.sqrt(vA / nA + vB / nB);
  if (seDiff === 0) return { t: mA === mB ? 0 : 100, df: nA + nB - 2, p: mA === mB ? 1 : 0 };

  const t = (mA - mB) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const num = (vA / nA + vB / nB) ** 2;
  const denomA = (vA / nA) ** 2 / (nA - 1);
  const denomB = (vB / nB) ** 2 / (nB - 1);
  const df = denomA + denomB === 0 ? nA + nB - 2 : num / (denomA + denomB);

  const p = is_tTestPValue(t, df);
  return { t: Math.abs(t), df, p };
}

/** Cohen's d effect size */
function is_cohensD(a: number[], b: number[]): number {
  const mA = is_mean(a);
  const mB = is_mean(b);
  const nA = a.length;
  const nB = b.length;
  const vA = is_stdSample(a) ** 2;
  const vB = is_stdSample(b) ** 2;

  // Pooled standard deviation
  const pooledVar = ((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2);
  const pooledSD = Math.sqrt(pooledVar);
  if (pooledSD === 0) return mA === mB ? 0 : 100;

  return Math.abs(mA - mB) / pooledSD;
}

/** Simple linear regression: returns { slope, intercept, rSquared, slopeT, slopeP, n } */
function is_linearRegression(x: number[], y: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
  slopeT: number;
  slopeP: number;
  n: number;
} {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { slope: 0, intercept: 0, rSquared: 0, slopeT: 0, slopeP: 1, n };

  const mx = is_mean(x.slice(0, n));
  const my = is_mean(y.slice(0, n));

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return { slope: 0, intercept: my, rSquared: 0, slopeT: 0, slopeP: 1, n };

  const slope = ssXY / ssXX;
  const intercept = my - slope * mx;

  const rSquared = ssYY === 0 ? 0 : (ssXY * ssXY) / (ssXX * ssYY);

  // Standard error of slope
  let ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssResidual += (y[i] - predicted) ** 2;
  }
  const mse = ssResidual / (n - 2);
  const slopeStdErr = Math.sqrt(mse / ssXX);
  const slopeT = slopeStdErr === 0 ? (slope === 0 ? 0 : 100) : Math.abs(slope / slopeStdErr);
  const slopeP = is_tTestPValue(slopeT, n - 2);

  return { slope, intercept, rSquared, slopeT, slopeP, n };
}

/** Chi-squared test for 2x2 contingency table */
function is_chiSquared2x2(table: number[][]): { chiSq: number; p: number; cramersV: number } {
  // table = [[a, b], [c, d]]
  const a = table[0][0], b = table[0][1];
  const c = table[1][0], d = table[1][1];
  const n = a + b + c + d;
  if (n === 0) return { chiSq: 0, p: 1, cramersV: 0 };

  const r1 = a + b, r2 = c + d;
  const c1 = a + c, c2 = b + d;

  // Expected values
  const eA = (r1 * c1) / n;
  const eB = (r1 * c2) / n;
  const eC = (r2 * c1) / n;
  const eD = (r2 * c2) / n;

  // Chi-squared (with Yates' correction for small samples)
  const chiSq = eA > 0 && eB > 0 && eC > 0 && eD > 0
    ? ((Math.abs(a - eA) - 0.5) ** 2 / eA +
       (Math.abs(b - eB) - 0.5) ** 2 / eB +
       (Math.abs(c - eC) - 0.5) ** 2 / eC +
       (Math.abs(d - eD) - 0.5) ** 2 / eD)
    : 0;

  // p-value from chi-squared with df=1 using normal approximation
  const z = Math.sqrt(chiSq);
  const p = 2 * is_normalCDFComplement(z);

  // Cramér's V
  const minDim = 1; // min(rows-1, cols-1) for 2x2 = 1
  const cramersV = Math.sqrt(chiSq / (n * minDim));

  return { chiSq, p: Math.min(1, p), cramersV: Math.min(1, cramersV) };
}

/** Deterministic seeded pseudo-random number generator (Mulberry32) */
function is_mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bootstrap resampling: check if insight holds in resampled datasets */
function is_bootstrapRobustness(
  testFn: (indices: number[]) => boolean,
  n: number,
  iterations: number = 100,
  seed: number = 42
): number {
  const rng = is_mulberry32(seed);
  let holdCount = 0;
  for (let iter = 0; iter < iterations; iter++) {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      indices.push(Math.floor(rng() * n));
    }
    if (testFn(indices)) holdCount++;
  }
  return holdCount / iterations;
}

/** Compute novelty score based on insight type and columns */
function is_computeNovelty(
  insightType: string,
  columns: string[],
  significance: number
): number {
  let novelty = 0.5; // baseline

  // Single-column insights: basic describe_dataset would find them
  if (columns.length <= 1) {
    if (insightType === "outlier") {
      novelty = 0.2; // outliers are obvious from basic stats
    } else if (insightType === "trend") {
      novelty = 0.3; // trends on a single column are somewhat obvious
    } else {
      novelty = 0.3;
    }
  } else {
    // Cross-column insights are less obvious
    if (insightType === "correlation") {
      novelty = 0.6; // correlations require cross-column analysis
    } else if (insightType === "group_difference") {
      novelty = 0.5; // comparing groups is a standard analysis
    } else if (insightType === "trend") {
      novelty = 0.55; // bivariate trend
    } else if (insightType === "threshold") {
      novelty = 0.55; // cross-tabulation
    } else {
      novelty = 0.5;
    }
  }

  // Low significance → lower novelty (if it's not even significant, novelty is moot)
  if (significance < 0.3) {
    novelty *= 0.5;
  }

  return Math.min(1, Math.max(0, novelty));
}

/** Compute verdict from component scores */
function is_computeVerdict(
  discoveryScore: number,
  significance: number,
  novelty: number,
  robustness: number
): "genuine_discovery" | "interesting_but_fragile" | "trivial" | "likely_noise" {
  // trivial: statistically significant but not novel
  if (significance >= 0.7 && novelty < 0.3 && discoveryScore < 0.7) {
    return "trivial";
  }
  // genuine_discovery: high composite
  if (discoveryScore >= 0.7) {
    return "genuine_discovery";
  }
  // interesting_but_fragile: moderate score but low robustness
  if (discoveryScore >= 0.4 && robustness < 0.6) {
    return "interesting_but_fragile";
  }
  // likely_noise: low composite
  return "likely_noise";
}

/** Generate narrative text for the insight evaluation */
function is_generateNarrative(
  input: InsightScorerInput,
  score: InsightScore,
  evidence: InsightScorerResult["evidence"]
): string {
  const colStr = input.columns.join(" and ");
  const verdictText =
    score.verdict === "genuine_discovery"
      ? "a genuine discovery"
      : score.verdict === "interesting_but_fragile"
      ? "interesting but fragile"
      : score.verdict === "trivial"
      ? "trivial — basic statistics would surface this"
      : "likely noise — no statistically meaningful pattern";

  let details = "";
  switch (input.insight_type) {
    case "correlation":
      details = `The correlation between ${colStr} (r=${Math.sqrt(evidence.effect_size_value).toFixed(2)}, p=${evidence.p_value < 0.001 ? "<0.001" : evidence.p_value.toFixed(3)}) is ${verdictText}`;
      break;
    case "group_difference":
      details = `The difference between groups on ${colStr} (Cohen's d=${evidence.effect_size_value.toFixed(2)}, p=${evidence.p_value < 0.001 ? "<0.001" : evidence.p_value.toFixed(3)}) is ${verdictText}`;
      break;
    case "trend":
      details = `The trend in ${colStr} (R²=${evidence.effect_size_value.toFixed(2)}, p=${evidence.p_value < 0.001 ? "<0.001" : evidence.p_value.toFixed(3)}) is ${verdictText}`;
      break;
    case "outlier":
      details = `The outlier in ${colStr} (z-score=${evidence.test_statistic.toFixed(2)}) is ${verdictText}`;
      break;
    case "threshold":
      details = `The threshold pattern in ${colStr} (chi²=${evidence.test_statistic.toFixed(2)}, p=${evidence.p_value < 0.001 ? "<0.001" : evidence.p_value.toFixed(3)}) is ${verdictText}`;
      break;
  }

  const bootstrapNote =
    evidence.bootstrap_hold_rate >= 0.8
      ? ` — it holds in ${Math.round(evidence.bootstrap_hold_rate * 100)}% of bootstrap samples`
      : evidence.bootstrap_hold_rate >= 0.5
      ? `. However, it only holds in ${Math.round(evidence.bootstrap_hold_rate * 100)}% of bootstrap samples, suggesting fragility`
      : `. It holds in only ${Math.round(evidence.bootstrap_hold_rate * 100)}% of bootstrap samples, indicating this pattern is not robust`;

  const effectNote =
    evidence.effect_size_value > 0.8
      ? ` with a strong effect size (${evidence.effect_size_measure}=${evidence.effect_size_value.toFixed(2)})`
      : evidence.effect_size_value > 0.3
      ? ` with a moderate effect size (${evidence.effect_size_measure}=${evidence.effect_size_value.toFixed(2)})`
      : ` with a weak effect size (${evidence.effect_size_measure}=${evidence.effect_size_value.toFixed(2)})`;

  return `${details}${effectNote}${bootstrapNote}. ${score.novelty > 0.5 ? "This is not something basic descriptive statistics would surface." : "This pattern could be identified from basic descriptive statistics."}`;
}

/** Generate recommendations based on the insight evaluation */
function is_generateRecommendations(
  input: InsightScorerInput,
  score: InsightScore,
  evidence: InsightScorerResult["evidence"]
): string[] {
  const recs: string[] = [];

  if (score.verdict === "genuine_discovery") {
    recs.push("This insight is statistically robust — consider featuring it in data narratives.");
    if (score.novelty > 0.5) {
      recs.push("High novelty: this cross-column relationship warrants deeper investigation.");
    }
    recs.push("Test with additional datasets to confirm generalizability.");
  } else if (score.verdict === "interesting_but_fragile") {
    recs.push("Collect more data to stabilize this pattern — bootstrap robustness is low.");
    recs.push("Consider confounding variables that may be driving a spurious relationship.");
  } else if (score.verdict === "trivial") {
    recs.push("This is statistically real but obvious — look for more surprising patterns.");
    recs.push("Try cross-column analysis to find non-trivial insights.");
  } else {
    recs.push("This pattern does not reach statistical significance — avoid over-interpreting it.");
    recs.push("Consider analyzing different column combinations or a larger sample size.");
  }

  if (evidence.sample_size < 30) {
    recs.push(`Small sample size (n=${evidence.sample_size}): results may not generalize. Consider collecting more data.`);
  }

  return recs;
}

/** Main insight scorer function */
export async function flowInsightScorer(
  input: InsightScorerInput
): Promise<InsightScorerResult> {
  const { headers, rows } = is_parseCSV(input.csv_data);
  const n = rows.length;

  let testUsed = "";
  let testStatistic = 0;
  let pValue = 1;
  let effectSizeMeasure = "";
  let effectSizeValue = 0;
  let significance = 0;
  let effectSizeNorm = 0;

  // Significance testing and effect size by insight type
  switch (input.insight_type) {
    case "correlation": {
      const col1 = is_getNumericColumn(headers, rows, input.columns[0]);
      const col2 = is_getNumericColumn(headers, rows, input.columns[1]);
      const r = is_pearsonR(col1, col2);
      const tStat = is_tStatForR(r, Math.min(col1.length, col2.length));
      const df = Math.min(col1.length, col2.length) - 2;
      pValue = is_tTestPValue(tStat, df);

      testUsed = "Pearson correlation t-test";
      testStatistic = tStat;
      effectSizeMeasure = "r²";
      effectSizeValue = r * r;

      significance = Math.max(0, Math.min(1, 1 - pValue));
      effectSizeNorm = Math.min(1, effectSizeValue); // r² is already 0-1
      break;
    }

    case "group_difference": {
      const groupCol = input.group_column || input.columns[0];
      const valueCol = input.columns.find((c) => c !== groupCol) || input.columns[0];
      const groupIdx = headers.indexOf(groupCol);
      const valueIdx = headers.indexOf(valueCol);

      // Split into two groups
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const g = row[groupIdx];
        const v = parseFloat(row[valueIdx]);
        if (!isNaN(v)) {
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g)!.push(v);
        }
      }

      const groupNames = [...groups.keys()];
      const groupA = groups.get(groupNames[0]) || [];
      const groupB = groups.get(groupNames[1]) || [];

      const welch = is_welchTTest(groupA, groupB);
      const d = is_cohensD(groupA, groupB);

      testUsed = "Welch's t-test";
      testStatistic = welch.t;
      pValue = welch.p;
      effectSizeMeasure = "Cohen's d";
      effectSizeValue = d;

      significance = Math.max(0, Math.min(1, 1 - pValue));
      // Cohen's d: 0.2=small, 0.5=medium, 0.8=large. Normalize to 0-1
      effectSizeNorm = Math.min(1, d / 2);
      break;
    }

    case "trend": {
      const xCol = is_getNumericColumn(headers, rows, input.columns[0]);
      const yCol = is_getNumericColumn(headers, rows, input.columns[1]);
      const reg = is_linearRegression(xCol, yCol);

      testUsed = "linear regression slope t-test";
      testStatistic = reg.slopeT;
      pValue = reg.slopeP;
      effectSizeMeasure = "R²";
      effectSizeValue = reg.rSquared;

      significance = Math.max(0, Math.min(1, 1 - pValue));
      effectSizeNorm = Math.min(1, reg.rSquared); // R² is already 0-1
      break;
    }

    case "outlier": {
      const col = is_getNumericColumn(headers, rows, input.columns[0]);
      const m = is_mean(col);
      const s = is_std(col);

      // Find the most extreme z-score
      let maxZ = 0;
      for (const v of col) {
        const z = s === 0 ? 0 : Math.abs(v - m) / s;
        if (z > maxZ) maxZ = z;
      }

      testUsed = "z-score";
      testStatistic = maxZ;
      // p-value: probability of seeing a z this extreme under normal
      pValue = 2 * is_normalCDFComplement(maxZ);
      effectSizeMeasure = "z-score magnitude";
      // Normalize: z=3 is significant, z=6+ is extreme
      const maxPossibleZ = col.length > 2 ? Math.sqrt(col.length - 1) : 3;
      effectSizeValue = maxZ;

      significance = Math.max(0, Math.min(1, 1 - pValue));
      effectSizeNorm = Math.min(1, maxZ / Math.max(maxPossibleZ, 6));
      break;
    }

    case "threshold": {
      // Build 2x2 contingency table from the two columns
      const col1 = is_getStringColumn(headers, rows, input.columns[0]);
      const col2 = is_getNumericColumn(headers, rows, input.columns[1]);

      // Get unique groups from col1
      const uniqueGroups = [...new Set(col1)];
      if (uniqueGroups.length >= 2) {
        // Binary outcome from col2 (0 or 1 for threshold)
        const g1 = uniqueGroups[0];
        const g2 = uniqueGroups[1];

        let a = 0, b = 0, c = 0, d = 0;
        for (let i = 0; i < Math.min(col1.length, col2.length); i++) {
          const isG1 = col1[i] === g1;
          const passes = col2[i] >= 1;
          if (isG1 && passes) a++;
          else if (isG1 && !passes) b++;
          else if (!isG1 && passes) c++;
          else d++;
        }

        const chi = is_chiSquared2x2([[a, b], [c, d]]);
        testUsed = "chi-squared";
        testStatistic = chi.chiSq;
        pValue = chi.p;
        effectSizeMeasure = "Cramér's V";
        effectSizeValue = chi.cramersV;
      }

      significance = Math.max(0, Math.min(1, 1 - pValue));
      effectSizeNorm = Math.min(1, effectSizeValue);
      break;
    }
  }

  // Bootstrap robustness
  const holdRate = is_bootstrapRobustness(
    (indices) => {
      // Re-run the significance test on bootstrapped data
      const bootRows = indices.map((i) => rows[i]);

      switch (input.insight_type) {
        case "correlation": {
          const col1Idx = headers.indexOf(input.columns[0]);
          const col2Idx = headers.indexOf(input.columns[1]);
          const bx = bootRows.map((r) => parseFloat(r[col1Idx])).filter((v) => !isNaN(v));
          const by = bootRows.map((r) => parseFloat(r[col2Idx])).filter((v) => !isNaN(v));
          const bLen = Math.min(bx.length, by.length);
          if (bLen < 3) return false;
          const r = is_pearsonR(bx.slice(0, bLen), by.slice(0, bLen));
          // Holds if correlation is significant (|r| > 0.3 and same sign as original)
          const origR = is_pearsonR(
            is_getNumericColumn(headers, rows, input.columns[0]),
            is_getNumericColumn(headers, rows, input.columns[1])
          );
          return Math.abs(r) > 0.3 && Math.sign(r) === Math.sign(origR);
        }
        case "group_difference": {
          const gCol = input.group_column || input.columns[0];
          const vCol = input.columns.find((c) => c !== gCol) || input.columns[0];
          const gIdx = headers.indexOf(gCol);
          const vIdx = headers.indexOf(vCol);
          const grps = new Map<string, number[]>();
          for (const row of bootRows) {
            const g = row[gIdx];
            const v = parseFloat(row[vIdx]);
            if (!isNaN(v)) {
              if (!grps.has(g)) grps.set(g, []);
              grps.get(g)!.push(v);
            }
          }
          const gNames = [...grps.keys()];
          if (gNames.length < 2) return false;
          const gA = grps.get(gNames[0]) || [];
          const gB = grps.get(gNames[1]) || [];
          if (gA.length < 2 || gB.length < 2) return false;
          const w = is_welchTTest(gA, gB);
          return w.p < 0.05;
        }
        case "trend": {
          const xIdx = headers.indexOf(input.columns[0]);
          const yIdx = headers.indexOf(input.columns[1]);
          const bx = bootRows.map((r) => parseFloat(r[xIdx])).filter((v) => !isNaN(v));
          const by = bootRows.map((r) => parseFloat(r[yIdx])).filter((v) => !isNaN(v));
          const bLen = Math.min(bx.length, by.length);
          if (bLen < 3) return false;
          const reg = is_linearRegression(bx.slice(0, bLen), by.slice(0, bLen));
          return reg.slopeP < 0.05 && reg.rSquared > 0.3;
        }
        case "outlier": {
          const cIdx = headers.indexOf(input.columns[0]);
          const bVals = bootRows.map((r) => parseFloat(r[cIdx])).filter((v) => !isNaN(v));
          if (bVals.length < 3) return false;
          const bm = is_mean(bVals);
          const bs = is_std(bVals);
          if (bs === 0) return false;
          let bMaxZ = 0;
          for (const v of bVals) {
            const z = Math.abs(v - bm) / bs;
            if (z > bMaxZ) bMaxZ = z;
          }
          return bMaxZ > 2.5;
        }
        case "threshold": {
          const c1Idx = headers.indexOf(input.columns[0]);
          const c2Idx = headers.indexOf(input.columns[1]);
          const c1 = bootRows.map((r) => r[c1Idx]);
          const c2 = bootRows.map((r) => parseFloat(r[c2Idx]));
          const uGroups = [...new Set(c1)];
          if (uGroups.length < 2) return false;
          let a = 0, b = 0, c = 0, d = 0;
          for (let i = 0; i < Math.min(c1.length, c2.length); i++) {
            const isG1 = c1[i] === uGroups[0];
            const passes = c2[i] >= 1;
            if (isG1 && passes) a++;
            else if (isG1 && !passes) b++;
            else if (!isG1 && passes) c++;
            else d++;
          }
          const chi = is_chiSquared2x2([[a, b], [c, d]]);
          return chi.p < 0.1;
        }
      }
      return false;
    },
    n,
    100,
    42
  );

  // Novelty scoring
  const novelty = is_computeNovelty(input.insight_type, input.columns, significance);

  // Composite discovery score
  const discoveryScore = Math.min(
    1,
    Math.max(
      0,
      0.3 * significance + 0.25 * effectSizeNorm + 0.2 * novelty + 0.25 * holdRate
    )
  );

  // Verdict
  const verdict = is_computeVerdict(discoveryScore, significance, novelty, holdRate);

  const score: InsightScore = {
    significance,
    effect_size: effectSizeNorm,
    novelty,
    robustness: holdRate,
    discovery_score: discoveryScore,
    verdict,
  };

  const evidence: InsightScorerResult["evidence"] = {
    test_used: testUsed,
    test_statistic: testStatistic,
    p_value: pValue,
    effect_size_measure: effectSizeMeasure,
    effect_size_value: effectSizeValue,
    bootstrap_hold_rate: holdRate,
    sample_size: n,
  };

  const narrative = is_generateNarrative(input, score, evidence);
  const recommendations = is_generateRecommendations(input, score, evidence);

  return { score, evidence, narrative, recommendations };
}

// ============================================================================
// Tool 66: flow_waypoint_map — GPS for data worlds
// ============================================================================

export interface WaypointMapInput {
  csv_data: string;
  /** Max waypoints to generate (default 10, max 30) */
  max_waypoints?: number;
  /** Which waypoint types to include */
  types?: ("cluster_center" | "outlier" | "inflection" | "hub")[];
}

export interface Waypoint {
  id: string;
  name: string;
  type: "cluster_center" | "outlier" | "inflection" | "hub";
  importance: number;
  coordinates: { x: number; y: number; z: number };
  label: string;
  nearby_points: number;
  description: string;
}

export interface WaypointMapResult {
  waypoints: Waypoint[];
  camera_path: {
    sequence: string[];
    narration: string[];
  };
  csv: string;
  dataset_summary: {
    rows: number;
    columns: number;
    waypoint_count: number;
    spatial_dimensions_used: string[];
  };
}

export async function flowWaypointMap(
  input: WaypointMapInput
): Promise<WaypointMapResult> {
  const maxWp = Math.min(Math.max(input.max_waypoints ?? 10, 1), 30);
  const allowedTypes = input.types ?? [
    "cluster_center",
    "outlier",
    "inflection",
    "hub",
  ];

  const lines = input.csv_data.trim().split("\n");
  if (lines.length < 2) {
    return wm_emptyResult(
      lines.length >= 1 ? parseCSVLine(lines[0]).length : 0,
      lines.length - 1
    );
  }
  const headers = parseCSVLine(lines[0]);
  const dataRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) dataRows.push(parseCSVLine(lines[i]));
  }
  const numRows = dataRows.length;
  const numCols = headers.length;

  if (numRows === 0) {
    return wm_emptyResult(numCols, 0);
  }

  // Identify numeric columns and connection column
  const numericCols: number[] = [];
  let connectionCol = -1;
  for (let c = 0; c < numCols; c++) {
    const hLow = headers[c].toLowerCase();
    if (hLow === "connections" || hLow === "connection") {
      connectionCol = c;
      continue;
    }
    const numericCount = dataRows.filter(
      (r) => r[c] !== undefined && r[c] !== "" && !isNaN(parseFloat(r[c]))
    ).length;
    if (numericCount > numRows * 0.5) {
      numericCols.push(c);
    }
  }

  // Build numeric matrix
  const matrix: number[][] = dataRows.map((row) =>
    numericCols.map((c) => {
      const v = parseFloat(row[c]);
      return isNaN(v) ? 0 : v;
    })
  );

  // Compute 3D coordinates via PCA or direct mapping
  const spatialDims: string[] = [];
  let coords3d: number[][];

  if (numericCols.length <= 3 && numericCols.length > 0) {
    coords3d = matrix.map((row) => [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0]);
    for (let i = 0; i < Math.min(numericCols.length, 3); i++) {
      spatialDims.push(headers[numericCols[i]]);
    }
  } else if (numericCols.length > 3) {
    coords3d = wm_pca3d(matrix);
    spatialDims.push("PC1", "PC2", "PC3");
  } else {
    coords3d = dataRows.map((_, i) => [i, 0, 0]);
    spatialDims.push("index");
  }

  // Normalize coordinates to 0-100
  coords3d = wm_normalize(coords3d);

  // Collect all candidate waypoints
  let allWaypoints: Waypoint[] = [];

  if (
    allowedTypes.includes("cluster_center") &&
    numRows >= 3 &&
    numericCols.length > 0
  ) {
    allWaypoints.push(
      ...wm_findClusterCenters(matrix, coords3d, dataRows, headers, numericCols)
    );
  }

  if (
    allowedTypes.includes("outlier") &&
    numRows >= 3 &&
    numericCols.length > 0
  ) {
    allWaypoints.push(
      ...wm_findOutliers(matrix, coords3d, dataRows, headers, numericCols)
    );
  }

  if (
    allowedTypes.includes("inflection") &&
    numRows >= 4 &&
    numericCols.length > 0
  ) {
    allWaypoints.push(
      ...wm_findInflections(matrix, coords3d, dataRows, headers, numericCols)
    );
  }

  if (allowedTypes.includes("hub") && connectionCol >= 0) {
    allWaypoints.push(
      ...wm_findHubs(coords3d, dataRows, headers, connectionCol)
    );
  }

  // Single-row: create a single waypoint
  if (numRows === 1 && allWaypoints.length === 0) {
    const labelCol = wm_findLabelCol(headers, numericCols, connectionCol);
    const label = labelCol >= 0 ? dataRows[0][labelCol] : "Point 1";
    allWaypoints.push({
      id: "wp_solo_1",
      name: "Sole Data Point",
      type: "cluster_center",
      importance: 1.0,
      coordinates: {
        x: coords3d[0][0],
        y: coords3d[0][1],
        z: coords3d[0][2],
      },
      label: label,
      nearby_points: 1,
      description: `Single data point: ${label}`,
    });
  }

  // Diversity-aware selection: ensure each type gets representation
  allWaypoints = wm_diverseSelect(allWaypoints, maxWp);

  // Build camera path (importance order)
  const sequence = allWaypoints.map((w) => w.id);
  const narration = allWaypoints.map((w, i) => {
    const ordinal =
      i === 0
        ? "First"
        : i === allWaypoints.length - 1
          ? "Finally"
          : "Next";
    return `${ordinal}, we visit ${w.name} — ${w.description}`;
  });

  // Build connections between nearby waypoints
  const wpConnections = wm_buildConnections(allWaypoints);

  // Build CSV
  const csvLines = ["id,connections,x,y,z,label,type,importance"];
  for (let i = 0; i < allWaypoints.length; i++) {
    const w = allWaypoints[i];
    const conns = wpConnections[i].join("|");
    csvLines.push(
      [
        wm_csvEscape(w.id),
        wm_csvEscape(conns),
        w.coordinates.x.toFixed(2),
        w.coordinates.y.toFixed(2),
        w.coordinates.z.toFixed(2),
        wm_csvEscape(w.label),
        w.type,
        w.importance.toFixed(3),
      ].join(",")
    );
  }

  return {
    waypoints: allWaypoints,
    camera_path: { sequence, narration },
    csv: csvLines.join("\n"),
    dataset_summary: {
      rows: numRows,
      columns: numCols,
      waypoint_count: allWaypoints.length,
      spatial_dimensions_used: spatialDims,
    },
  };
}

// ============================================================================
// WM Helper: empty result
// ============================================================================
function wm_emptyResult(cols: number, rows: number): WaypointMapResult {
  return {
    waypoints: [],
    camera_path: { sequence: [], narration: [] },
    csv: "id,connections,x,y,z,label,type,importance",
    dataset_summary: {
      rows,
      columns: cols,
      waypoint_count: 0,
      spatial_dimensions_used: [],
    },
  };
}

// ============================================================================
// WM Helper: find a suitable label column (non-numeric, non-connection)
// ============================================================================
function wm_findLabelCol(
  headers: string[],
  numericCols: number[],
  connectionCol: number
): number {
  const numSet = new Set(numericCols);
  for (let c = 0; c < headers.length; c++) {
    if (c !== connectionCol && !numSet.has(c)) return c;
  }
  return -1;
}

// ============================================================================
// WM Helper: PCA to 3D via power iteration
// ============================================================================
function wm_pca3d(matrix: number[][]): number[][] {
  const n = matrix.length;
  const d = matrix[0].length;
  if (n === 0 || d === 0) return matrix.map(() => [0, 0, 0]);

  // Center the data
  const means = new Array(d).fill(0);
  for (const row of matrix) {
    for (let j = 0; j < d; j++) means[j] += row[j];
  }
  for (let j = 0; j < d; j++) means[j] /= n;

  const centered = matrix.map((row) => row.map((v, j) => v - means[j]));

  // Covariance matrix (d x d)
  const cov: number[][] = Array.from({ length: d }, () =>
    new Array(d).fill(0)
  );
  for (const row of centered) {
    for (let i = 0; i < d; i++) {
      for (let j = i; j < d; j++) {
        cov[i][j] += row[i] * row[j];
      }
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      cov[i][j] /= Math.max(n - 1, 1);
      cov[j][i] = cov[i][j];
    }
  }

  // Extract top 3 eigenvectors via power iteration with deflation
  const components = Math.min(3, d);
  const eigenvectors: number[][] = [];
  const covWork = cov.map((row) => [...row]);

  for (let comp = 0; comp < components; comp++) {
    // Deterministic initial vector
    let vec = new Array(d).fill(0);
    vec[comp % d] = 1;

    // Power iteration: 100 iterations for convergence
    for (let iter = 0; iter < 100; iter++) {
      const newVec = new Array(d).fill(0);
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          newVec[i] += covWork[i][j] * vec[j];
        }
      }
      const norm = Math.sqrt(newVec.reduce((s, v) => s + v * v, 0));
      if (norm < 1e-10) break;
      vec = newVec.map((v) => v / norm);
    }

    eigenvectors.push(vec);

    // Deflate
    const eigenvalue = vec.reduce((s, vi, i) => {
      let dot = 0;
      for (let j = 0; j < d; j++) dot += covWork[i][j] * vec[j];
      return s + vi * dot;
    }, 0);
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        covWork[i][j] -= eigenvalue * vec[i] * vec[j];
      }
    }
  }

  // Project data onto eigenvectors
  return centered.map((row) => {
    const projected: number[] = [];
    for (let c = 0; c < components; c++) {
      let dot = 0;
      for (let j = 0; j < d; j++) dot += row[j] * eigenvectors[c][j];
      projected.push(dot);
    }
    while (projected.length < 3) projected.push(0);
    return projected;
  });
}

// ============================================================================
// WM Helper: normalize coords to 0-100
// ============================================================================
function wm_normalize(coords: number[][]): number[][] {
  if (coords.length === 0) return coords;
  const dims = 3;
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  for (const c of coords) {
    for (let d = 0; d < dims; d++) {
      if (c[d] < mins[d]) mins[d] = c[d];
      if (c[d] > maxs[d]) maxs[d] = c[d];
    }
  }
  return coords.map((c) =>
    c.map((v, d) => {
      const range = maxs[d] - mins[d];
      if (range < 1e-10) return 50;
      return ((v - mins[d]) / range) * 100;
    })
  );
}

// ============================================================================
// WM Helper: k-means clustering
// ============================================================================
function wm_kmeans(
  data: number[][],
  k: number,
  maxIter: number = 30
): { centroids: number[][]; assignments: number[] } {
  const n = data.length;
  const d = data[0].length;
  if (n <= k) {
    return {
      centroids: data.map((r) => [...r]),
      assignments: data.map((_, i) => i),
    };
  }

  // Initialize centroids deterministically: k-means++ with farthest points
  const centroids: number[][] = [];
  const used = new Set<number>();
  centroids.push([...data[0]]);
  used.add(0);

  for (let c = 1; c < k; c++) {
    let bestDist = -1;
    let bestIdx = 0;
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      let minDist = Infinity;
      for (const cent of centroids) {
        const dist = wm_dist(data[i], cent);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    centroids.push([...data[bestIdx]]);
    used.add(bestIdx);
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dist = wm_dist(data[i], centroids[c]);
        if (dist < bestD) {
          bestD = dist;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }
    if (!changed) break;

    const sums = Array.from({ length: k }, () => new Array(d).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let j = 0; j < d; j++) sums[c][j] += data[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
      }
    }
  }

  return { centroids, assignments };
}

function wm_dist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return sum;
}

// ============================================================================
// WM Helper: silhouette score for choosing k
// ============================================================================
function wm_silhouette(
  data: number[][],
  assignments: number[],
  k: number
): number {
  const n = data.length;
  if (n < 2 || k < 2) return 0;

  let totalSilhouette = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];

    let aSum = 0;
    let aCount = 0;
    for (let j = 0; j < n; j++) {
      if (j !== i && assignments[j] === myCluster) {
        aSum += Math.sqrt(wm_dist(data[i], data[j]));
        aCount++;
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;

    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      let bSum = 0;
      let bCount = 0;
      for (let j = 0; j < n; j++) {
        if (assignments[j] === c) {
          bSum += Math.sqrt(wm_dist(data[i], data[j]));
          bCount++;
        }
      }
      if (bCount > 0) {
        const meanB = bSum / bCount;
        if (meanB < b) b = meanB;
      }
    }
    if (b === Infinity) b = 0;

    const maxAB = Math.max(a, b);
    const s = maxAB > 0 ? (b - a) / maxAB : 0;
    totalSilhouette += s;
    count++;
  }

  return count > 0 ? totalSilhouette / count : 0;
}

// ============================================================================
// WM Helper: find cluster centers
// ============================================================================
function wm_findClusterCenters(
  matrix: number[][],
  coords3d: number[][],
  dataRows: string[][],
  headers: string[],
  numericCols: number[]
): Waypoint[] {
  const n = matrix.length;
  if (n < 3) return [];

  const maxK = Math.min(8, Math.floor(n / 2));
  let bestK = 2;
  let bestScore = -1;
  let bestResult: { centroids: number[][]; assignments: number[] } | null =
    null;

  for (let k = 2; k <= maxK; k++) {
    const result = wm_kmeans(matrix, k);
    const score = wm_silhouette(matrix, result.assignments, k);
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
      bestResult = result;
    }
  }

  if (!bestResult) return [];

  const waypoints: Waypoint[] = [];
  for (let c = 0; c < bestK; c++) {
    const memberCount = bestResult.assignments.filter((a) => a === c).length;
    if (memberCount === 0) continue;

    // Find dominant feature
    const centroid = bestResult.centroids[c];
    let dominantCol = 0;
    let dominantVal = -Infinity;
    for (let j = 0; j < centroid.length; j++) {
      if (Math.abs(centroid[j]) > dominantVal) {
        dominantVal = Math.abs(centroid[j]);
        dominantCol = j;
      }
    }
    const dominantName =
      headers[numericCols[dominantCol]] ?? `col${dominantCol}`;

    // Compute average coord for this cluster
    const memberCoords = { x: 0, y: 0, z: 0 };
    let mc = 0;
    for (let i = 0; i < n; i++) {
      if (bestResult.assignments[i] === c) {
        memberCoords.x += coords3d[i][0];
        memberCoords.y += coords3d[i][1];
        memberCoords.z += coords3d[i][2];
        mc++;
      }
    }
    memberCoords.x /= mc;
    memberCoords.y /= mc;
    memberCoords.z /= mc;

    const importance = memberCount / n;

    waypoints.push({
      id: `wp_cluster_${c + 1}`,
      name: `${dominantName} Cluster`,
      type: "cluster_center",
      importance: Math.min(importance, 1),
      coordinates: {
        x: Math.max(0, Math.min(100, memberCoords.x)),
        y: Math.max(0, Math.min(100, memberCoords.y)),
        z: Math.max(0, Math.min(100, memberCoords.z)),
      },
      label: `${dominantName} Cluster (${memberCount} points)`,
      nearby_points: memberCount,
      description: `Cluster of ${memberCount} points centered on ${dominantName}=${centroid[dominantCol].toFixed(1)}, representing ${(importance * 100).toFixed(0)}% of the data`,
    });
  }

  return waypoints;
}

// ============================================================================
// WM Helper: find outliers via z-score
// ============================================================================
function wm_findOutliers(
  matrix: number[][],
  coords3d: number[][],
  dataRows: string[][],
  headers: string[],
  numericCols: number[]
): Waypoint[] {
  const n = matrix.length;
  const d = matrix[0].length;
  if (n < 3 || d === 0) return [];

  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (const row of matrix) {
    for (let j = 0; j < d; j++) means[j] += row[j];
  }
  for (let j = 0; j < d; j++) means[j] /= n;

  for (const row of matrix) {
    for (let j = 0; j < d; j++) stds[j] += (row[j] - means[j]) ** 2;
  }
  for (let j = 0; j < d; j++)
    stds[j] = Math.sqrt(stds[j] / Math.max(n - 1, 1));

  const outlierRows: { idx: number; maxZ: number; col: number }[] = [];
  for (let i = 0; i < n; i++) {
    let maxZ = 0;
    let maxCol = 0;
    for (let j = 0; j < d; j++) {
      if (stds[j] < 1e-10) continue;
      const z = Math.abs((matrix[i][j] - means[j]) / stds[j]);
      if (z > maxZ) {
        maxZ = z;
        maxCol = j;
      }
    }
    if (maxZ > 2.0) {
      outlierRows.push({ idx: i, maxZ, col: maxCol });
    }
  }

  outlierRows.sort((a, b) => b.maxZ - a.maxZ);

  const waypoints: Waypoint[] = [];
  for (let oi = 0; oi < outlierRows.length; oi++) {
    const { idx, maxZ, col } = outlierRows[oi];
    const colName = headers[numericCols[col]] ?? `col${col}`;
    const val = matrix[idx][col];
    const labelCol = wm_findLabelCol(headers, numericCols, -1);
    const rowLabel =
      labelCol >= 0 ? dataRows[idx][labelCol] : `Row ${idx + 1}`;

    waypoints.push({
      id: `wp_outlier_${oi + 1}`,
      name: `${rowLabel} Peak`,
      type: "outlier",
      importance: Math.min(maxZ / 5, 1),
      coordinates: {
        x: Math.max(0, Math.min(100, coords3d[idx][0])),
        y: Math.max(0, Math.min(100, coords3d[idx][1])),
        z: Math.max(0, Math.min(100, coords3d[idx][2])),
      },
      label: `Outlier: ${rowLabel} (${colName}=${val})`,
      nearby_points: 1,
      description: `${rowLabel} stands out with ${colName}=${val} (z-score=${maxZ.toFixed(1)}), far from the mean of ${means[col].toFixed(1)}`,
    });
  }

  return waypoints;
}

// ============================================================================
// WM Helper: find inflection points (slope sign changes)
// ============================================================================
function wm_findInflections(
  matrix: number[][],
  coords3d: number[][],
  dataRows: string[][],
  headers: string[],
  numericCols: number[]
): Waypoint[] {
  const n = matrix.length;
  if (n < 4) return [];

  const waypoints: Waypoint[] = [];
  let wpCount = 0;

  for (let c = 0; c < matrix[0].length; c++) {
    const values = matrix.map((row) => row[c]);

    const slopes: number[] = [];
    for (let i = 1; i < n; i++) {
      slopes.push(values[i] - values[i - 1]);
    }

    for (let i = 1; i < slopes.length; i++) {
      if (
        (slopes[i - 1] > 0 && slopes[i] < 0) ||
        (slopes[i - 1] < 0 && slopes[i] > 0)
      ) {
        const colName = headers[numericCols[c]] ?? `col${c}`;
        const slopeMag =
          Math.abs(slopes[i] - slopes[i - 1]) /
          (Math.abs(slopes[i - 1]) + Math.abs(slopes[i]) + 1e-10);
        const labelCol = wm_findLabelCol(headers, numericCols, -1);
        const rowLabel =
          labelCol >= 0 ? dataRows[i][labelCol] : `Row ${i + 1}`;

        wpCount++;
        waypoints.push({
          id: `wp_inflection_${wpCount}`,
          name: `${colName} Crossroads`,
          type: "inflection",
          importance: Math.min(slopeMag * 0.5, 0.5),
          coordinates: {
            x: Math.max(0, Math.min(100, coords3d[i][0])),
            y: Math.max(0, Math.min(100, coords3d[i][1])),
            z: Math.max(0, Math.min(100, coords3d[i][2])),
          },
          label: `Inflection: ${colName} at ${rowLabel}`,
          nearby_points: 3,
          description: `${colName} changes direction at ${rowLabel} (value=${values[i].toFixed(1)}), slope shifts from ${slopes[i - 1] > 0 ? "rising" : "falling"} to ${slopes[i] > 0 ? "rising" : "falling"}`,
        });
      }
    }
  }

  return waypoints;
}

// ============================================================================
// WM Helper: find network hubs
// ============================================================================
function wm_findHubs(
  coords3d: number[][],
  dataRows: string[][],
  headers: string[],
  connectionCol: number
): Waypoint[] {
  const n = dataRows.length;
  if (n === 0 || connectionCol < 0) return [];

  const degrees: { idx: number; degree: number; id: string }[] = [];
  const idCol = headers.findIndex(
    (h) => h.toLowerCase() === "id" || h.toLowerCase() === "name"
  );

  for (let i = 0; i < n; i++) {
    const connStr = dataRows[i][connectionCol] ?? "";
    const conns = connStr.split("|").filter((c) => c.trim().length > 0);
    const nodeId = idCol >= 0 ? dataRows[i][idCol] : `node_${i}`;
    degrees.push({ idx: i, degree: conns.length, id: nodeId });
  }

  degrees.sort((a, b) => b.degree - a.degree);

  const meanDeg = degrees.reduce((s, d) => s + d.degree, 0) / n;
  const stdDeg = Math.sqrt(
    degrees.reduce((s, d) => s + (d.degree - meanDeg) ** 2, 0) /
      Math.max(n - 1, 1)
  );

  const threshold = meanDeg + 0.5 * stdDeg;
  const hubs = degrees.filter(
    (d) => d.degree > threshold || d === degrees[0]
  );

  const maxDeg = degrees[0].degree;

  return hubs.map((h, i) => ({
    id: `wp_hub_${i + 1}`,
    name: `${h.id} Capital`,
    type: "hub" as const,
    importance: maxDeg > 0 ? Math.min(h.degree / maxDeg, 1) : 1,
    coordinates: {
      x: Math.max(0, Math.min(100, coords3d[h.idx][0])),
      y: Math.max(0, Math.min(100, coords3d[h.idx][1])),
      z: Math.max(0, Math.min(100, coords3d[h.idx][2])),
    },
    label: `Hub: ${h.id} (${h.degree} connections)`,
    nearby_points: h.degree + 1,
    description: `${h.id} is a network hub with ${h.degree} connections, ${((h.degree / maxDeg) * 100).toFixed(0)}% of the maximum`,
  }));
}

// ============================================================================
// WM Helper: build waypoint connections (nearest neighbors)
// ============================================================================
function wm_buildConnections(waypoints: Waypoint[]): string[][] {
  const n = waypoints.length;
  if (n <= 1) return waypoints.map(() => []);

  const connections: string[][] = [];
  for (let i = 0; i < n; i++) {
    const dists: { idx: number; dist: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = waypoints[i].coordinates.x - waypoints[j].coordinates.x;
      const dy = waypoints[i].coordinates.y - waypoints[j].coordinates.y;
      const dz = waypoints[i].coordinates.z - waypoints[j].coordinates.z;
      dists.push({ idx: j, dist: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.dist - b.dist);
    const numConns = Math.min(2, dists.length);
    connections.push(
      dists.slice(0, numConns).map((d) => waypoints[d.idx].id)
    );
  }
  return connections;
}

// ============================================================================
// WM Helper: CSV escape
// ============================================================================
function wm_csvEscape(val: string): string {
  if (
    val.includes(",") ||
    val.includes('"') ||
    val.includes("\n") ||
    val.includes("|")
  ) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// ============================================================================
// WM Helper: diversity-aware waypoint selection
// ============================================================================
function wm_diverseSelect(waypoints: Waypoint[], maxWp: number): Waypoint[] {
  if (waypoints.length <= maxWp) {
    waypoints.sort((a, b) => b.importance - a.importance);
    return waypoints;
  }

  // Group by type
  const byType: Record<string, Waypoint[]> = {};
  for (const w of waypoints) {
    if (!byType[w.type]) byType[w.type] = [];
    byType[w.type].push(w);
  }

  // Sort each group by importance descending
  for (const t of Object.keys(byType)) {
    byType[t].sort((a, b) => b.importance - a.importance);
  }

  const types = Object.keys(byType);
  const selected: Waypoint[] = [];

  // Round-robin: take top item from each type, then repeat
  let round = 0;
  while (selected.length < maxWp) {
    let addedAny = false;
    for (const t of types) {
      if (selected.length >= maxWp) break;
      if (round < byType[t].length) {
        selected.push(byType[t][round]);
        addedAny = true;
      }
    }
    if (!addedAny) break;
    round++;
  }

  // Sort final selection by importance descending for camera path
  selected.sort((a, b) => b.importance - a.importance);
  return selected;
}
