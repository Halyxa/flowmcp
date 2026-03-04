import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// TOOL 69: flow_sparkle_engine — PROGRESSIVE INTELLIGENCE ENGINE
// ============================================================================
// The keystone of the Superbeing Holodeck. Like a JPG drawing in:
// dwell longer → deeper insight layers unlock → epiphanies sparkle into view.
// "Turtles all the way down."
// ============================================================================

export interface SparkleEngineInput {
  csv_data: string;
  /** Simulated dwell time in seconds (default 1, max 300) */
  dwell_seconds?: number;
  /** Focus area: specific columns to concentrate intelligence on */
  focus_columns?: string[];
  /** Focus area: specific row indices to concentrate intelligence on */
  focus_rows?: number[];
}

export interface Sparkle {
  id: string;
  layer: number;          // 0=instant, 1=surface, 2=correlation, 3=deep, 4=epiphany
  type: "stat" | "correlation" | "anomaly" | "trend" | "connection" | "epiphany";
  target_column?: string;
  target_rows?: number[];
  intensity: number;      // 0-1, how "bright" the sparkle is
  title: string;          // Short hook: "Revenue-Employee Lock"
  description: string;    // The insight
  child_sparkle_hints: string[];  // What further investigation might reveal
}

export interface SparkleEngineResult {
  sparkles: Sparkle[];
  layer_reached: number;
  intelligence_density: number;  // sparkles per data point
  progressive_csv: string;       // CSV with _sparkle_layer and _sparkle_count columns
  next_dwell_preview: string;    // "Dwell 30 more seconds to discover correlation patterns..."
  summary: {
    total_sparkles: number;
    layers_unlocked: number;
    brightest_sparkle: string;
  };
}

// ============================================================================
// Internal types
// ============================================================================

interface SEColumnProfile {
  name: string;
  colIdx: number;
  type: "numeric" | "categorical" | "date" | "id";
  values: string[];
  numericValues: number[];
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  skewness: number;
  uniqueCount: number;
  nullCount: number;
  trend: "rising" | "falling" | "flat" | "unknown";
  outlierRows: Map<number, number>; // rowIdx -> z-score
}

// ============================================================================
// Sparkle Engine helpers — all prefixed with se_
// ============================================================================

function se_parseCsv(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCSVLine(line));
  return { headers, rows };
}

function se_isDateLike(val: string): boolean {
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

function se_isIdLike(name: string, values: string[], totalRows: number): boolean {
  const nameLower = name.toLowerCase();
  if (nameLower === "id" || nameLower.endsWith("_id") || nameLower === "key" || nameLower === "name") {
    return true;
  }
  const uniqueSet = new Set(values.filter((v) => v.trim() !== ""));
  return uniqueSet.size === totalRows && totalRows > 1;
}

function se_computeStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function se_computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function se_computeSkewness(values: number[], mean: number, std: number): number {
  if (values.length < 3 || std === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
  return m3;
}

function se_pearson(xs: number[], ys: number[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) {
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

function se_detectTrend(values: number[]): "rising" | "falling" | "flat" | "unknown" {
  if (values.length < 3) return "unknown";
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return "flat";
  const slope = (n * sumXY - sumX * sumY) / denom;
  const meanY = sumY / n;
  if (meanY === 0) return "flat";
  const relativeSlope = slope / Math.abs(meanY);
  if (relativeSlope > 0.02) return "rising";
  if (relativeSlope < -0.02) return "falling";
  return "flat";
}

function se_linearRegressionR2(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const num = n * sumXY - sumX * sumY;
  const denomX = n * sumX2 - sumX * sumX;
  const denomY = n * sumY2 - sumY * sumY;
  if (denomX === 0 || denomY === 0) return 0;
  const r = num / Math.sqrt(denomX * denomY);
  return r * r;
}

function se_profileColumn(
  name: string,
  colIdx: number,
  rows: string[][],
  focusRows?: number[],
): SEColumnProfile {
  const allValues = rows.map((row) => row[colIdx]?.trim() ?? "");
  const activeIndices = focusRows ?? allValues.map((_, i) => i);
  const values = activeIndices.map((i) => allValues[i] ?? "");
  const nonEmpty = values.filter((v) => v !== "");
  const nullCount = values.length - nonEmpty.length;
  const uniqueSet = new Set(nonEmpty);
  const uniqueCount = uniqueSet.size;

  // Detect type
  const dateSample = nonEmpty.slice(0, Math.min(5, nonEmpty.length));
  const dateRatio = dateSample.length > 0 ? dateSample.filter(se_isDateLike).length / dateSample.length : 0;

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
  } else if (se_isIdLike(name, nonEmpty, rows.length)) {
    type = "id";
  } else {
    type = "categorical";
  }

  const sorted = [...numericValues].sort((a, b) => a - b);
  const sum = numericValues.reduce((s, v) => s + v, 0);
  const mean = numericValues.length > 0 ? sum / numericValues.length : 0;
  const std = se_computeStd(numericValues, mean);
  const min = sorted.length > 0 ? sorted[0] : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  const median = se_computeMedian(sorted);
  const skewness = se_computeSkewness(numericValues, mean, std);

  // Outliers: |z| > 2.5
  const outlierRows = new Map<number, number>();
  if (std > 0 && type === "numeric") {
    for (const ri of activeIndices) {
      const val = Number(allValues[ri]);
      if (!isNaN(val)) {
        const z = (val - mean) / std;
        if (Math.abs(z) > 2.5) {
          outlierRows.set(ri, Math.round(z * 100) / 100);
        }
      }
    }
  }

  const trend = type === "numeric" ? se_detectTrend(numericValues) : "unknown";

  return {
    name,
    colIdx,
    type,
    values: allValues,
    numericValues,
    mean: Math.round(mean * 100) / 100,
    std: Math.round(std * 100) / 100,
    min,
    max,
    median: Math.round(median * 100) / 100,
    skewness: Math.round(skewness * 100) / 100,
    uniqueCount,
    nullCount,
    trend,
    outlierRows,
  };
}

function se_dwellToMaxLayer(dwell: number): number {
  if (dwell <= 1) return 0;
  if (dwell <= 5) return 1;
  if (dwell <= 30) return 2;
  if (dwell <= 120) return 3;
  return 4;
}

function se_getEntityName(
  rowIdx: number,
  rows: string[][],
  idColIdx: number,
): string {
  if (idColIdx >= 0 && rows[rowIdx]) {
    return rows[rowIdx][idColIdx]?.trim() ?? `Row ${rowIdx + 1}`;
  }
  return `Row ${rowIdx + 1}`;
}

function se_formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

// ============================================================================
// Layer generators
// ============================================================================

let se_sparkleSeq = 0;
function se_nextId(): string {
  se_sparkleSeq++;
  return `sparkle_${se_sparkleSeq}`;
}

function se_resetSeq(): void {
  se_sparkleSeq = 0;
}

/** Layer 0: Instant — shape, size, column types */
function se_generateLayer0(
  headers: string[],
  rows: string[][],
  profiles: SEColumnProfile[],
): Sparkle[] {
  const sparkles: Sparkle[] = [];
  const numericCols = profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  const categoricalCols = profiles.filter((p) => p.type === "categorical").map((p) => p.name);
  const dateCols = profiles.filter((p) => p.type === "date").map((p) => p.name);

  const typeBreakdown: string[] = [];
  if (numericCols.length > 0) typeBreakdown.push(`${numericCols.length} numeric`);
  if (categoricalCols.length > 0) typeBreakdown.push(`${categoricalCols.length} categorical`);
  if (dateCols.length > 0) typeBreakdown.push(`${dateCols.length} date`);

  sparkles.push({
    id: se_nextId(),
    layer: 0,
    type: "stat",
    intensity: 0.3,
    title: `${rows.length} Rows x ${headers.length} Columns`,
    description: `Dataset shape: ${rows.length} rows, ${headers.length} columns (${typeBreakdown.join(", ")}).`,
    child_sparkle_hints: [],
    target_column: undefined,
    target_rows: undefined,
  });

  return sparkles;
}

/** Layer 1: Surface — basic stats per column, obvious outliers */
function se_generateLayer1(
  profiles: SEColumnProfile[],
  rows: string[][],
  idColIdx: number,
  focusRows?: number[],
): Sparkle[] {
  const sparkles: Sparkle[] = [];

  for (const prof of profiles) {
    if (prof.type !== "numeric") continue;

    // Basic stats sparkle
    sparkles.push({
      id: se_nextId(),
      layer: 1,
      type: "stat",
      target_column: prof.name,
      intensity: 0.4,
      title: `${prof.name}: ${se_formatNumber(prof.min)} to ${se_formatNumber(prof.max)}`,
      description: `${prof.name} ranges from ${se_formatNumber(prof.min)} to ${se_formatNumber(prof.max)} (mean ${se_formatNumber(prof.mean)}, median ${se_formatNumber(prof.median)}, std ${se_formatNumber(prof.std)}).`,
      child_sparkle_hints: [
        `Investigate distribution shape — is ${prof.name} normally distributed?`,
        `Check if ${prof.name} extremes align with other column patterns.`,
      ],
    });

    // Outlier sparkles
    for (const [rowIdx, zScore] of prof.outlierRows) {
      if (focusRows && !focusRows.includes(rowIdx)) continue;
      const entityName = se_getEntityName(rowIdx, rows, idColIdx);
      const val = rows[rowIdx][prof.colIdx]?.trim() ?? "?";
      const direction = zScore > 0 ? "above" : "below";
      sparkles.push({
        id: se_nextId(),
        layer: 1,
        type: "anomaly",
        target_column: prof.name,
        target_rows: [rowIdx],
        intensity: Math.min(Math.abs(zScore) / 5, 1),
        title: `${entityName}: ${prof.name} Outlier`,
        description: `${entityName} has ${prof.name} of ${val} — ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} the mean of ${se_formatNumber(prof.mean)}.`,
        child_sparkle_hints: [
          `What makes ${entityName} so different? Check other columns for clues.`,
          `Is ${entityName} an error, an exception, or a signal?`,
        ],
      });
    }
  }

  return sparkles;
}

/** Layer 2: Correlation — pairwise Pearson, top strongest */
function se_generateLayer2(
  profiles: SEColumnProfile[],
  rows: string[][],
  idColIdx: number,
): Sparkle[] {
  const sparkles: Sparkle[] = [];
  const numProfiles = profiles.filter((p) => p.type === "numeric" && p.numericValues.length >= 3);

  const correlations: { colA: string; colB: string; r: number; absR: number }[] = [];
  for (let i = 0; i < numProfiles.length; i++) {
    for (let j = i + 1; j < numProfiles.length; j++) {
      const r = se_pearson(numProfiles[i].numericValues, numProfiles[j].numericValues);
      const absR = Math.abs(r);
      if (absR > 0.5) {
        correlations.push({ colA: numProfiles[i].name, colB: numProfiles[j].name, r, absR });
      }
    }
  }

  correlations.sort((a, b) => b.absR - a.absR);

  for (const corr of correlations.slice(0, 5)) {
    const direction = corr.r > 0 ? "positive" : "inverse";
    const verb = corr.r > 0 ? "rise together" : "move in opposite directions";
    const lockName = corr.r > 0
      ? `${se_shortName(corr.colA)}-${se_shortName(corr.colB)} Lock`
      : `${se_shortName(corr.colA)}-${se_shortName(corr.colB)} Seesaw`;

    sparkles.push({
      id: se_nextId(),
      layer: 2,
      type: "correlation",
      target_column: corr.colA,
      intensity: corr.absR,
      title: lockName,
      description: `Strong ${direction} correlation (r=${corr.r.toFixed(2)}) between ${corr.colA} and ${corr.colB} — they ${verb}.`,
      child_sparkle_hints: [
        `Is this causal? Does changing ${corr.colA} actually change ${corr.colB}?`,
        `Check if outliers in ${corr.colA} break the pattern with ${corr.colB}.`,
        `Are there subgroups where this relationship reverses (Simpson's paradox)?`,
      ],
    });
  }

  return sparkles;
}

/** Helper to shorten column names for titles */
function se_shortName(col: string): string {
  // Capitalize first letter of each word
  return col
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Layer 3: Deep — trends, clusters, regression, near-misses */
function se_generateLayer3(
  profiles: SEColumnProfile[],
  rows: string[][],
  idColIdx: number,
  focusRows?: number[],
): Sparkle[] {
  const sparkles: Sparkle[] = [];
  const numProfiles = profiles.filter((p) => p.type === "numeric" && p.numericValues.length >= 3);

  // Trend detection
  for (const prof of numProfiles) {
    if (prof.trend === "rising" || prof.trend === "falling") {
      const pctChange = prof.min !== 0
        ? Math.round(((prof.max - prof.min) / Math.abs(prof.min)) * 100)
        : 0;
      const verb = prof.trend === "rising" ? "climbing" : "declining";
      const emoji = prof.trend === "rising" ? "Upward" : "Downward";

      sparkles.push({
        id: se_nextId(),
        layer: 3,
        type: "trend",
        target_column: prof.name,
        intensity: Math.min(Math.abs(pctChange) / 200, 1),
        title: `${emoji} Trajectory: ${prof.name}`,
        description: `${prof.name} is steadily ${verb} across the dataset, from ${se_formatNumber(prof.min)} to ${se_formatNumber(prof.max)} (${pctChange > 0 ? "+" : ""}${pctChange}% change).`,
        child_sparkle_hints: [
          `What's driving this ${prof.trend === "rising" ? "growth" : "decline"}?`,
          `Will this trend continue, plateau, or reverse?`,
          `Are all entities participating equally in this trend?`,
        ],
      });
    }
  }

  // Distribution shape analysis
  for (const prof of numProfiles) {
    if (prof.numericValues.length < 5) continue;
    const absSkew = Math.abs(prof.skewness);
    if (absSkew > 1.0) {
      const direction = prof.skewness > 0 ? "right" : "left";
      sparkles.push({
        id: se_nextId(),
        layer: 3,
        type: "connection",
        target_column: prof.name,
        intensity: Math.min(absSkew / 3, 1),
        title: `Skewed ${prof.name} Distribution`,
        description: `${prof.name} is heavily skewed to the ${direction} (skewness=${prof.skewness}). The mean (${se_formatNumber(prof.mean)}) and median (${se_formatNumber(prof.median)}) tell different stories.`,
        child_sparkle_hints: [
          `The long tail suggests a power law — are a few entities dominating?`,
          `Consider log-transforming ${prof.name} for clearer patterns.`,
        ],
      });
    }
  }

  // Near-miss detection: rows that almost match another pattern
  if (numProfiles.length >= 2 && rows.length >= 3) {
    const primary = numProfiles[0];
    const secondary = numProfiles[1];

    // Find the row closest to the median in primary but farthest from median in secondary
    const activeRows = focusRows ?? rows.map((_, i) => i);
    let bestRowIdx = -1;
    let bestScore = -Infinity;

    for (const ri of activeRows) {
      const pVal = Number(rows[ri][primary.colIdx]?.trim());
      const sVal = Number(rows[ri][secondary.colIdx]?.trim());
      if (isNaN(pVal) || isNaN(sVal)) continue;
      if (primary.std === 0 || secondary.std === 0) continue;

      const pZ = Math.abs((pVal - primary.mean) / primary.std);
      const sZ = Math.abs((sVal - secondary.mean) / secondary.std);
      // Near-miss: close to median in one, far in another
      const score = sZ - pZ;
      if (score > bestScore && pZ < 0.5 && sZ > 1.0) {
        bestScore = score;
        bestRowIdx = ri;
      }
    }

    if (bestRowIdx >= 0) {
      const entityName = se_getEntityName(bestRowIdx, rows, idColIdx);
      const pVal = rows[bestRowIdx][primary.colIdx]?.trim() ?? "?";
      const sVal = rows[bestRowIdx][secondary.colIdx]?.trim() ?? "?";
      sparkles.push({
        id: se_nextId(),
        layer: 3,
        type: "connection",
        target_rows: [bestRowIdx],
        intensity: Math.min(bestScore / 3, 1),
        title: `${entityName}: The Near-Miss`,
        description: `${entityName} is average in ${primary.name} (${pVal}) but extreme in ${secondary.name} (${sVal}) — a near-miss worth investigating.`,
        child_sparkle_hints: [
          `What's preventing ${entityName} from matching the expected pattern?`,
          `Could this be a hidden segment or emerging behavior?`,
        ],
      });
    }
  }

  // Extremes ratio
  for (const prof of numProfiles) {
    if (prof.min !== 0) {
      const ratio = Math.round(prof.max / prof.min);
      if (ratio > 5) {
        sparkles.push({
          id: se_nextId(),
          layer: 3,
          type: "anomaly",
          target_column: prof.name,
          intensity: Math.min(ratio / 50, 1),
          title: `${ratio}x Gap in ${prof.name}`,
          description: `The spread in ${prof.name} is ${ratio}x — from ${se_formatNumber(prof.min)} to ${se_formatNumber(prof.max)}. This isn't a distribution, it's a canyon.`,
          child_sparkle_hints: [
            `Are the extremes from the same population, or two different worlds?`,
            `Segment by other columns — does the gap persist within groups?`,
          ],
        });
      }
    }
  }

  return sparkles;
}

/** Layer 4: Epiphany — cross-pattern connections, meta-insights */
function se_generateLayer4(
  profiles: SEColumnProfile[],
  rows: string[][],
  idColIdx: number,
  lowerLayerSparkles: Sparkle[],
): Sparkle[] {
  const sparkles: Sparkle[] = [];
  const numProfiles = profiles.filter((p) => p.type === "numeric" && p.numericValues.length >= 3);

  // Cross-pattern: connect outliers with correlations
  const outlierSparkles = lowerLayerSparkles.filter((s) => s.type === "anomaly");
  const corrSparkles = lowerLayerSparkles.filter((s) => s.type === "correlation");

  if (outlierSparkles.length > 0 && corrSparkles.length > 0) {
    const topOutlier = outlierSparkles[0];
    const topCorr = corrSparkles[0];
    sparkles.push({
      id: se_nextId(),
      layer: 4,
      type: "epiphany",
      target_column: topOutlier.target_column,
      target_rows: topOutlier.target_rows,
      intensity: Math.min(topOutlier.intensity + topCorr.intensity, 1),
      title: `The ${topOutlier.title.split(":")[0] || "Outlier"} Breaks the ${topCorr.title}`,
      description: `The anomaly "${topOutlier.title}" exists at the exact boundary where "${topCorr.title}" breaks down. This isn't random noise — it's where the underlying model fails. The exception proves a deeper rule.`,
      child_sparkle_hints: [
        "Remove this outlier and re-run: does the correlation get stronger or disappear?",
        "This boundary point may define two distinct regimes in the data.",
        "Look for other entities near this boundary — they're the most informative.",
      ],
    });
  }

  // Cross-pattern: connect trends with distribution shapes
  const trendSparkles = lowerLayerSparkles.filter((s) => s.type === "trend");
  const connectionSparkles = lowerLayerSparkles.filter((s) => s.type === "connection");

  if (trendSparkles.length > 0 && connectionSparkles.length > 0) {
    const topTrend = trendSparkles[0];
    const topConn = connectionSparkles[0];
    sparkles.push({
      id: se_nextId(),
      layer: 4,
      type: "epiphany",
      target_column: topTrend.target_column,
      intensity: Math.min((topTrend.intensity + topConn.intensity) / 2 + 0.3, 1),
      title: `The ${se_shortName(topTrend.target_column || "Trend")} Paradox`,
      description: `${topTrend.title} shows directional movement while "${topConn.title}" reveals structural asymmetry. The data is simultaneously trending and skewing — a signature of exponential growth or winner-take-all dynamics.`,
      child_sparkle_hints: [
        "Is this a phase transition? The current moment may be a tipping point.",
        "Compare early vs late subsets — the dynamics may have shifted mid-dataset.",
        "This pattern often precedes market consolidation or disruption.",
      ],
    });
  }

  // Multi-column coherence epiphany
  if (numProfiles.length >= 3) {
    // Check if multiple columns have the same extreme entity
    const extremeRows = new Map<number, string[]>();
    for (const prof of numProfiles) {
      let maxIdx = -1;
      let maxVal = -Infinity;
      for (let i = 0; i < rows.length; i++) {
        const v = Number(rows[i][prof.colIdx]?.trim());
        if (!isNaN(v) && v > maxVal) { maxVal = v; maxIdx = i; }
      }
      if (maxIdx >= 0) {
        const cols = extremeRows.get(maxIdx) ?? [];
        cols.push(prof.name);
        extremeRows.set(maxIdx, cols);
      }
    }

    for (const [rowIdx, cols] of extremeRows) {
      if (cols.length >= 2) {
        const entityName = se_getEntityName(rowIdx, rows, idColIdx);
        sparkles.push({
          id: se_nextId(),
          layer: 4,
          type: "epiphany",
          target_rows: [rowIdx],
          intensity: Math.min(cols.length / numProfiles.length + 0.3, 1),
          title: `${entityName}: Multi-Dimensional Champion`,
          description: `${entityName} leads in ${cols.join(" AND ")} simultaneously. This isn't luck — it suggests a systemic advantage. The columns that matter most all point to the same entity.`,
          child_sparkle_hints: [
            `What does ${entityName} do differently from the rest?`,
            `Is ${entityName}'s dominance sustainable, or a peak before decline?`,
            `Other entities closest to ${entityName}'s profile may be the next breakout.`,
          ],
        });
        break; // One multi-dimensional epiphany is enough
      }
    }
  }

  // Guarantee at least one epiphany if we have any data at all
  if (sparkles.length === 0 && lowerLayerSparkles.length > 0) {
    const sortedByIntensity = [...lowerLayerSparkles].sort((a, b) => b.intensity - a.intensity);
    const top1 = sortedByIntensity[0];
    const top2 = sortedByIntensity.length > 1 ? sortedByIntensity[1] : null;

    const connText = top2
      ? ` Meanwhile, "${top2.title}" operates in a parallel dimension — but both are symptoms of the same underlying structure.`
      : "";

    sparkles.push({
      id: se_nextId(),
      layer: 4,
      type: "epiphany",
      target_column: top1.target_column,
      target_rows: top1.target_rows,
      intensity: Math.min(top1.intensity + 0.2, 1),
      title: `The Deeper Pattern Behind ${top1.title}`,
      description: `"${top1.title}" is the most striking feature of this dataset.${connText} At this depth of analysis, the question shifts from "what" to "why" — and the answer likely lives outside this dataset.`,
      child_sparkle_hints: [
        "What external data would explain this pattern?",
        "Is this pattern stable over time, or a snapshot of a dynamic system?",
        "The most valuable insight may be what this dataset DOESN'T contain.",
      ],
    });
  }

  return sparkles;
}

// ============================================================================
// Next dwell preview messages
// ============================================================================

function se_getNextDwellPreview(layer: number): string {
  switch (layer) {
    case 0:
      return "Dwell 2 more seconds to reveal basic statistics and spot outliers...";
    case 1:
      return "Dwell 10 more seconds to uncover correlations between columns — which variables move together?";
    case 2:
      return "Dwell 30 more seconds for deep pattern analysis — trends, clusters, and near-misses await.";
    case 3:
      return "Dwell 60 more seconds for epiphanies — cross-pattern connections that rewrite the story.";
    case 4:
      return "Maximum depth reached. Every surface is dense with intelligence. Explore child sparkles for infinite depth.";
    default:
      return "Dwell longer to reveal deeper layers of intelligence.";
  }
}

// ============================================================================
// Progressive CSV builder
// ============================================================================

function se_buildProgressiveCsv(
  headers: string[],
  rows: string[][],
  sparkles: Sparkle[],
  maxLayer: number,
): string {
  // Build a map: rowIdx -> { maxLayer, sparkleCount }
  const rowMeta = new Map<number, { layer: number; count: number }>();

  for (const s of sparkles) {
    if (s.target_rows) {
      for (const ri of s.target_rows) {
        const existing = rowMeta.get(ri) ?? { layer: 0, count: 0 };
        existing.layer = Math.max(existing.layer, s.layer);
        existing.count++;
        rowMeta.set(ri, existing);
      }
    }
  }

  const newHeaders = [...headers, "_sparkle_layer", "_sparkle_count"];
  const headerLine = newHeaders.map(csvEscapeField).join(",");

  const dataLines = rows.map((row, idx) => {
    const meta = rowMeta.get(idx) ?? { layer: 0, count: 0 };
    const augmented = [...row, String(meta.layer), String(meta.count)];
    return augmented.map(csvEscapeField).join(",");
  });

  return [headerLine, ...dataLines].join("\n");
}

// ============================================================================
// Main function
// ============================================================================

export function flowSparkleEngine(input: SparkleEngineInput): SparkleEngineResult {
  se_resetSeq();

  const dwell = Math.max(0, Math.min(input.dwell_seconds ?? 1, 300));
  const maxLayer = se_dwellToMaxLayer(dwell);

  const { headers, rows } = se_parseCsv(input.csv_data);

  // Determine focus scope
  const focusCols = input.focus_columns;
  const focusRows = input.focus_rows;

  // Profile columns (filter to focus if specified)
  const activeHeaders = focusCols
    ? headers.filter((h) => focusCols.includes(h))
    : headers;

  // If focus_columns specified but none match, fall back to all
  const effectiveHeaders = activeHeaders.length > 0 ? activeHeaders : headers;

  const profiles: SEColumnProfile[] = effectiveHeaders.map((h) => {
    const colIdx = headers.indexOf(h);
    return se_profileColumn(h, colIdx, rows, focusRows);
  });

  // Find ID column (search all headers, not just focused)
  let idColIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    const vals = rows.map((r) => r[i]?.trim() ?? "");
    const nonEmpty = vals.filter((v) => v !== "");
    if (se_isIdLike(headers[i], nonEmpty, rows.length)) {
      idColIdx = i;
      break;
    }
  }

  // Generate sparkles layer by layer
  const allSparkles: Sparkle[] = [];

  // Layer 0: always generated
  allSparkles.push(...se_generateLayer0(headers, rows, profiles));

  // Layer 1
  if (maxLayer >= 1) {
    allSparkles.push(...se_generateLayer1(profiles, rows, idColIdx, focusRows));
  }

  // Layer 2
  if (maxLayer >= 2) {
    allSparkles.push(...se_generateLayer2(profiles, rows, idColIdx));
  }

  // Layer 3
  if (maxLayer >= 3) {
    allSparkles.push(...se_generateLayer3(profiles, rows, idColIdx, focusRows));
  }

  // Layer 4
  if (maxLayer >= 4) {
    allSparkles.push(...se_generateLayer4(profiles, rows, idColIdx, allSparkles));
  }

  // Apply focus_rows filter to row-targeted sparkles generated in layers that don't already filter
  let filteredSparkles = allSparkles;
  if (focusRows) {
    filteredSparkles = allSparkles.filter((s) => {
      if (!s.target_rows || s.target_rows.length === 0) return true;
      return s.target_rows.some((ri) => focusRows.includes(ri));
    });
  }

  // Calculate data points
  const totalDataPoints = rows.length * headers.length;
  const density = totalDataPoints > 0 ? filteredSparkles.length / totalDataPoints : 0;

  // Build progressive CSV
  const progressiveCsv = se_buildProgressiveCsv(headers, rows, filteredSparkles, maxLayer);

  // Find brightest sparkle
  const brightest = filteredSparkles.length > 0
    ? filteredSparkles.reduce((a, b) => (a.intensity > b.intensity ? a : b))
    : null;

  return {
    sparkles: filteredSparkles,
    layer_reached: maxLayer,
    intelligence_density: density,
    progressive_csv: progressiveCsv,
    next_dwell_preview: se_getNextDwellPreview(maxLayer),
    summary: {
      total_sparkles: filteredSparkles.length,
      layers_unlocked: maxLayer + 1,
      brightest_sparkle: brightest?.title ?? "none",
    },
  };
}
