/**
 * Holodeck Intelligence Layer — Tool 61: flow_quest_generator
 *
 * Scans a dataset's statistical topology and generates procedural exploration quests.
 * Each quest has a narrative hook, difficulty rating, investigation steps, and statistical basis.
 * The data itself tells you what to investigate.
 */

import { parseCSVLine } from "./csv-utils.js";

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

function parseCsvToRows(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 1 || (lines.length === 1 && lines[0].trim() === "")) {
    return { headers: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  if (lines.length < 2) {
    return { headers, rows: [] };
  }
  const rows = lines.slice(1).filter((l) => l.trim() !== "").map((line) => parseCSVLine(line));
  return { headers, rows };
}

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

function isDateLike(val: string): boolean {
  if (!val || val.trim() === "") return false;
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
    /^\d{4}-\d{2}-\d{2}T/,
    /^[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}$/,
  ];
  return datePatterns.some((p) => p.test(val.trim()));
}

function isIdLike(name: string, values: string[], totalRows: number): boolean {
  const nameLower = name.toLowerCase();
  if (nameLower === "id" || nameLower.endsWith("_id") || nameLower === "key" || nameLower === "name") {
    return true;
  }
  const uniqueSet = new Set(values.filter((v) => v.trim() !== ""));
  return uniqueSet.size === totalRows && totalRows > 1;
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
