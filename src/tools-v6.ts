/**
 * Visor Mode — Tool 67: flow_visor_mode
 *
 * Switch analytical lenses on the same dataset, like Metroid Prime's scan visor.
 * Same data, different intelligence overlays. Each visor reveals different patterns.
 *
 * Visors: statistical, relational, temporal, anomaly, geographic.
 */

import { parseCSVLine, csvEscapeField, parseCsvToRows, isDateLike, isIdLike } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface VisorModeInput {
  csv_data: string;
  /** Which visor to apply */
  visor: "statistical" | "relational" | "temporal" | "anomaly" | "geographic";
  /** Columns to focus on (optional — auto-selects if omitted) */
  focus_columns?: string[];
}

export interface VisorAnnotation {
  row_index: number;
  column: string;
  annotation_type: string;
  value: string;
  significance: number;
  description: string;
}

export interface VisorModeResult {
  visor: string;
  annotations: VisorAnnotation[];
  annotated_csv: string;
  summary: {
    total_annotations: number;
    top_finding: string;
    coverage: number;
  };
  recommended_next_visor: string;
}

// ============================================================================
// Internal types
// ============================================================================

interface VmColProfile {
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

// ============================================================================
// Helpers
// ============================================================================

// parseCsvToRows, isDateLike, isIdLike imported from csv-utils.ts

function vm_profileColumns(
  headers: string[],
  rows: string[][],
  focusCols?: string[]
): VmColProfile[] {
  const profiles: VmColProfile[] = [];

  for (let c = 0; c < headers.length; c++) {
    const name = headers[c];

    // If focus_columns specified, skip non-focused columns from analysis
    // but still profile them minimally so we can build the CSV
    const rawValues = rows.map((r) => (r[c] !== undefined ? r[c] : ""));
    const nonEmpty = rawValues.filter((v) => v.trim() !== "");

    // Detect type
    let type: VmColProfile["type"] = "categorical";
    const numericValues: number[] = [];
    let numericCount = 0;

    for (const v of nonEmpty) {
      const n = Number(v);
      if (!isNaN(n) && v.trim() !== "") {
        numericCount++;
        numericValues.push(n);
      }
    }

    const dateSample = nonEmpty.slice(0, 5);
    const dateCount = dateSample.filter((v) => isDateLike(v)).length;

    // Numeric detection takes priority over ID detection.
    // A column of unique numbers (like population) should be "numeric", not "id".
    if (numericCount >= nonEmpty.length * 0.8 && nonEmpty.length > 0) {
      type = "numeric";
    } else if (dateCount >= Math.min(3, dateSample.length) && dateSample.length > 0) {
      type = "date";
    } else if (isIdLike(name, rawValues, rows.length)) {
      type = "id";
    }

    // Stats for numeric columns
    let mean = 0,
      std = 0,
      min = 0,
      max = 0,
      median = 0;
    if (type === "numeric" && numericValues.length > 0) {
      mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const variance =
        numericValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / numericValues.length;
      std = Math.sqrt(variance);
      const sorted = [...numericValues].sort((a, b) => a - b);
      min = sorted[0];
      max = sorted[sorted.length - 1];
      median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
    }

    profiles.push({
      name,
      colIdx: c,
      type,
      numericValues,
      rawValues,
      mean,
      std,
      min,
      max,
      median,
      uniqueCount: new Set(rawValues).size,
    });
  }

  return profiles;
}

function vm_clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function vm_pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
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
  return denom === 0 ? 0 : num / denom;
}

function vm_buildAnnotatedCsv(
  headers: string[],
  rows: string[][],
  extraCols: { name: string; values: string[] }[]
): string {
  const allHeaders = [...headers, ...extraCols.map((c) => c.name)];
  const headerLine = allHeaders.map(csvEscapeField).join(",");
  const dataLines = rows.map((row, i) => {
    const base = row.map(csvEscapeField);
    const extra = extraCols.map((c) => csvEscapeField(c.values[i] ?? ""));
    return [...base, ...extra].join(",");
  });
  return [headerLine, ...dataLines].join("\n");
}

function vm_getNumericProfiles(
  profiles: VmColProfile[],
  focusCols?: string[]
): VmColProfile[] {
  return profiles.filter((p) => {
    if (p.type !== "numeric") return false;
    if (focusCols && focusCols.length > 0 && !focusCols.includes(p.name)) return false;
    return true;
  });
}

// ============================================================================
// Visor: Statistical
// ============================================================================

function vm_statistical(
  headers: string[],
  rows: string[][],
  profiles: VmColProfile[],
  focusCols?: string[]
): VisorModeResult {
  const numericProfiles = vm_getNumericProfiles(profiles, focusCols);
  const annotations: VisorAnnotation[] = [];

  // Per-row role: if ANY numeric value is outlier, row is "outlier" or "extreme"
  const rowRoles: string[] = new Array(rows.length).fill("normal");
  const extraCols: { name: string; values: string[] }[] = [];

  // Add z-score columns for each numeric column
  for (const prof of numericProfiles) {
    const zValues: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const val = prof.numericValues[i];
      if (val === undefined || isNaN(val)) {
        zValues.push("");
        continue;
      }
      const z = prof.std === 0 ? 0 : (val - prof.mean) / prof.std;
      zValues.push(z.toFixed(3));

      const absZ = Math.abs(z);
      if (absZ > 2) {
        const significance = vm_clamp01(absZ / 5);
        const isExtreme = absZ > 3;
        const label = isExtreme ? "extreme" : "outlier";
        rowRoles[i] = label;
        annotations.push({
          row_index: i,
          column: prof.name,
          annotation_type: "outlier",
          value: String(val),
          significance,
          description: `${prof.name} value ${val} is ${absZ.toFixed(1)} standard deviations from mean (${prof.mean.toFixed(1)})`,
        });
      } else if (Math.abs(val - prof.median) < prof.std * 0.1 && prof.std > 0) {
        // Near median — annotate as median_anchor (lower significance)
        annotations.push({
          row_index: i,
          column: prof.name,
          annotation_type: "median_anchor",
          value: String(val),
          significance: 0.2,
          description: `${prof.name} value ${val} is near the median (${prof.median.toFixed(1)})`,
        });
      }
    }
    extraCols.push({ name: `_stat_z_${prof.name}`, values: zValues });
  }

  // _stat_role column
  extraCols.push({ name: "_stat_role", values: rowRoles });

  // Build annotated CSV
  const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

  // Summary
  const outlierCount = annotations.filter((a) => a.annotation_type === "outlier").length;
  const rowsWithAnnotations = new Set(annotations.map((a) => a.row_index)).size;
  const coverage = rows.length > 0 ? rowsWithAnnotations / rows.length : 0;

  let topFinding = "No significant statistical outliers detected.";
  if (outlierCount > 0) {
    const topOutlier = annotations
      .filter((a) => a.annotation_type === "outlier")
      .sort((a, b) => b.significance - a.significance)[0];
    topFinding = topOutlier.description;
  }

  return {
    visor: "statistical",
    annotations,
    annotated_csv,
    summary: {
      total_annotations: annotations.length,
      top_finding: topFinding,
      coverage: vm_clamp01(coverage),
    },
    recommended_next_visor: "Try the anomaly visor next to see multi-dimensional anomaly patterns across all columns simultaneously.",
  };
}

// ============================================================================
// Visor: Relational
// ============================================================================

function vm_relational(
  headers: string[],
  rows: string[][],
  profiles: VmColProfile[],
  focusCols?: string[]
): VisorModeResult {
  const numericProfiles = vm_getNumericProfiles(profiles, focusCols);
  const annotations: VisorAnnotation[] = [];

  // Compute all pairwise correlations
  interface CorrPair {
    col1: string;
    col2: string;
    r: number;
    absR: number;
  }
  const corrPairs: CorrPair[] = [];

  for (let i = 0; i < numericProfiles.length; i++) {
    for (let j = i + 1; j < numericProfiles.length; j++) {
      const p1 = numericProfiles[i];
      const p2 = numericProfiles[j];
      const r = vm_pearson(p1.numericValues, p2.numericValues);
      corrPairs.push({ col1: p1.name, col2: p2.name, r, absR: Math.abs(r) });
    }
  }

  corrPairs.sort((a, b) => b.absR - a.absR);
  const topPairs = corrPairs.slice(0, 3);

  // Extra columns: strongest pair label and correlation value
  const pairLabels: string[] = new Array(rows.length).fill("");
  const corrValues: string[] = new Array(rows.length).fill("");

  if (topPairs.length > 0) {
    const strongest = topPairs[0];
    // Label all rows with the strongest pair info
    for (let i = 0; i < rows.length; i++) {
      pairLabels[i] = `${strongest.col1} <-> ${strongest.col2}`;
      corrValues[i] = strongest.r.toFixed(4);
    }

    // Annotate anchor rows (max and min values in correlated columns)
    for (const pair of topPairs) {
      const p1 = numericProfiles.find((p) => p.name === pair.col1);
      const p2 = numericProfiles.find((p) => p.name === pair.col2);
      if (!p1 || !p2) continue;

      // Find the row with max of col1
      let maxIdx1 = 0;
      let minIdx1 = 0;
      for (let i = 0; i < p1.numericValues.length; i++) {
        if (p1.numericValues[i] > p1.numericValues[maxIdx1]) maxIdx1 = i;
        if (p1.numericValues[i] < p1.numericValues[minIdx1]) minIdx1 = i;
      }

      const significance = vm_clamp01(pair.absR);

      annotations.push({
        row_index: maxIdx1,
        column: pair.col1,
        annotation_type: "correlation_anchor",
        value: String(p1.numericValues[maxIdx1]),
        significance,
        description: `Peak of ${pair.col1} (r=${pair.r.toFixed(3)} with ${pair.col2})`,
      });

      annotations.push({
        row_index: minIdx1,
        column: pair.col1,
        annotation_type: "correlation_anchor",
        value: String(p1.numericValues[minIdx1]),
        significance,
        description: `Trough of ${pair.col1} (r=${pair.r.toFixed(3)} with ${pair.col2})`,
      });
    }
  }

  const extraCols = [
    { name: "_rel_strongest_pair", values: pairLabels },
    { name: "_rel_correlation", values: corrValues },
  ];

  const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

  const rowsWithAnnotations = new Set(annotations.map((a) => a.row_index)).size;
  const coverage = rows.length > 0 ? rowsWithAnnotations / rows.length : 0;

  let topFinding = "No significant correlations found between numeric columns.";
  if (topPairs.length > 0) {
    const s = topPairs[0];
    const dir = s.r > 0 ? "positive" : "negative";
    topFinding = `Strongest correlation: ${s.col1} and ${s.col2} have a ${dir} relationship (r=${s.r.toFixed(3)})`;
  }

  return {
    visor: "relational",
    annotations,
    annotated_csv,
    summary: {
      total_annotations: annotations.length,
      top_finding: topFinding,
      coverage: vm_clamp01(coverage),
    },
    recommended_next_visor:
      "Try the temporal visor next to see how these relationships evolve over time.",
  };
}

// ============================================================================
// Visor: Temporal
// ============================================================================

function vm_temporal(
  headers: string[],
  rows: string[][],
  profiles: VmColProfile[],
  focusCols?: string[]
): VisorModeResult {
  const annotations: VisorAnnotation[] = [];

  // Find temporal column: date type or sequential numeric column name containing time-like hints
  let temporalCol: VmColProfile | null = null;
  const dateProfiles = profiles.filter((p) => p.type === "date");
  if (dateProfiles.length > 0) {
    temporalCol = dateProfiles[0];
  } else {
    // Look for sequential numeric columns with time-like names
    const timeNames = ["year", "month", "quarter", "period", "week", "day", "time", "sequence", "order", "index"];
    for (const p of profiles) {
      if (p.type === "numeric" && timeNames.some((t) => p.name.toLowerCase().includes(t))) {
        temporalCol = p;
        break;
      }
    }
    // If no time-named column, use first numeric column that is monotonically increasing/decreasing
    if (!temporalCol) {
      for (const p of profiles) {
        if (p.type === "numeric" && p.numericValues.length > 2) {
          let increasing = true;
          let decreasing = true;
          for (let i = 1; i < p.numericValues.length; i++) {
            if (p.numericValues[i] <= p.numericValues[i - 1]) increasing = false;
            if (p.numericValues[i] >= p.numericValues[i - 1]) decreasing = false;
          }
          if (increasing || decreasing) {
            temporalCol = p;
            break;
          }
        }
      }
    }
  }

  // Get numeric columns to analyze (respect focus_columns)
  const numericProfiles = vm_getNumericProfiles(profiles, focusCols);
  const analysisProfiles = numericProfiles.filter(
    (p) => !temporalCol || p.name !== temporalCol.name
  );

  const extraColMap: Map<string, string[]> = new Map();

  if (temporalCol && analysisProfiles.length > 0) {
    // Compute period-over-period changes for each numeric column
    for (const prof of analysisProfiles) {
      const changes: string[] = [];
      const trends: string[] = [];

      for (let i = 0; i < prof.numericValues.length; i++) {
        if (i === 0) {
          changes.push("");
          trends.push("start");
          continue;
        }
        const prev = prof.numericValues[i - 1];
        const curr = prof.numericValues[i];
        const change = prev === 0 ? 0 : ((curr - prev) / Math.abs(prev)) * 100;
        changes.push(change.toFixed(2));

        if (change > 5) trends.push("rising");
        else if (change < -5) trends.push("falling");
        else trends.push("flat");
      }

      extraColMap.set(`_temp_change_${prof.name}`, changes);
      extraColMap.set(`_temp_trend_${prof.name}`, trends);

      // Detect overall trend direction
      const firstHalf = prof.numericValues.slice(0, Math.floor(prof.numericValues.length / 2));
      const secondHalf = prof.numericValues.slice(Math.floor(prof.numericValues.length / 2));
      const firstMean = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
      const secondMean = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;

      const overallDirection = secondMean > firstMean * 1.1 ? "rising" : secondMean < firstMean * 0.9 ? "falling" : "flat";

      // Find peak and trough
      let peakIdx = 0;
      let troughIdx = 0;
      for (let i = 0; i < prof.numericValues.length; i++) {
        if (prof.numericValues[i] > prof.numericValues[peakIdx]) peakIdx = i;
        if (prof.numericValues[i] < prof.numericValues[troughIdx]) troughIdx = i;
      }

      annotations.push({
        row_index: peakIdx,
        column: prof.name,
        annotation_type: "trend_peak",
        value: String(prof.numericValues[peakIdx]),
        significance: 0.9,
        description: `${prof.name} peaks at row ${peakIdx} (value: ${prof.numericValues[peakIdx]})`,
      });

      annotations.push({
        row_index: troughIdx,
        column: prof.name,
        annotation_type: "trend_direction",
        value: overallDirection,
        significance: overallDirection === "flat" ? 0.3 : 0.8,
        description: `${prof.name} shows an overall ${overallDirection} trend (first half avg: ${firstMean.toFixed(1)}, second half avg: ${secondMean.toFixed(1)})`,
      });

      // Find acceleration changes (where trend direction flips)
      for (let i = 2; i < prof.numericValues.length; i++) {
        const prevChange = prof.numericValues[i - 1] - prof.numericValues[i - 2];
        const currChange = prof.numericValues[i] - prof.numericValues[i - 1];
        if ((prevChange > 0 && currChange < 0) || (prevChange < 0 && currChange > 0)) {
          annotations.push({
            row_index: i,
            column: prof.name,
            annotation_type: "trend_reversal",
            value: String(prof.numericValues[i]),
            significance: 0.7,
            description: `${prof.name} trend reverses at row ${i}`,
          });
        }
      }
    }
  } else if (analysisProfiles.length > 0) {
    // No temporal column found — treat row order as implicit time
    for (const prof of analysisProfiles) {
      const changes: string[] = [];
      const trends: string[] = [];

      for (let i = 0; i < prof.numericValues.length; i++) {
        if (i === 0) {
          changes.push("");
          trends.push("start");
          continue;
        }
        const prev = prof.numericValues[i - 1];
        const curr = prof.numericValues[i];
        const change = prev === 0 ? 0 : ((curr - prev) / Math.abs(prev)) * 100;
        changes.push(change.toFixed(2));
        if (change > 5) trends.push("rising");
        else if (change < -5) trends.push("falling");
        else trends.push("flat");
      }

      extraColMap.set(`_temp_change_${prof.name}`, changes);
      extraColMap.set(`_temp_trend_${prof.name}`, trends);
    }
  }

  // If no extra columns were added at all, add placeholder columns
  if (extraColMap.size === 0) {
    extraColMap.set("_temp_change", new Array(rows.length).fill(""));
    extraColMap.set("_temp_trend", new Array(rows.length).fill("no_temporal_data"));
  }

  const extraCols = Array.from(extraColMap.entries()).map(([name, values]) => ({
    name,
    values,
  }));

  const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

  const rowsWithAnnotations = new Set(annotations.map((a) => a.row_index)).size;
  const coverage = rows.length > 0 ? rowsWithAnnotations / rows.length : 0;

  let topFinding = "No clear temporal trends detected in the data.";
  if (annotations.length > 0) {
    const trendAnn = annotations.find((a) => a.annotation_type === "trend_direction");
    if (trendAnn) {
      topFinding = trendAnn.description;
    } else {
      topFinding = annotations[0].description;
    }
    // Check if there's a rising/falling trend in the annotations
    const risingCols = annotations.filter(
      (a) => a.annotation_type === "trend_direction" && a.value === "rising"
    );
    if (risingCols.length > 0) {
      topFinding = `${risingCols[0].column} shows a rising trend: ${risingCols[0].description}`;
    }
  }

  return {
    visor: "temporal",
    annotations,
    annotated_csv,
    summary: {
      total_annotations: annotations.length,
      top_finding: topFinding,
      coverage: vm_clamp01(coverage),
    },
    recommended_next_visor:
      "Try the relational visor next to see how column relationships shift across time periods.",
  };
}

// ============================================================================
// Visor: Anomaly
// ============================================================================

function vm_anomaly(
  headers: string[],
  rows: string[][],
  profiles: VmColProfile[],
  focusCols?: string[]
): VisorModeResult {
  const numericProfiles = vm_getNumericProfiles(profiles, focusCols);
  const annotations: VisorAnnotation[] = [];

  // Compute composite z-score per row
  const anomScores: string[] = new Array(rows.length).fill("0");
  const anomDrivers: string[] = new Array(rows.length).fill("");

  if (numericProfiles.length > 0) {
    for (let i = 0; i < rows.length; i++) {
      let compositeZ2 = 0;
      const drivers: { col: string; z: number }[] = [];

      for (const prof of numericProfiles) {
        const val = prof.numericValues[i];
        if (val === undefined || isNaN(val)) continue;
        const z = prof.std === 0 ? 0 : (val - prof.mean) / prof.std;
        compositeZ2 += z * z;
        drivers.push({ col: prof.name, z });
      }

      const compositeScore = Math.sqrt(compositeZ2 / numericProfiles.length);
      anomScores[i] = compositeScore.toFixed(4);

      // Sort drivers by |z| descending
      drivers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      const topDrivers = drivers
        .filter((d) => Math.abs(d.z) > 1)
        .slice(0, 3)
        .map((d) => `${d.col}(z=${d.z.toFixed(2)})`)
        .join("; ");
      anomDrivers[i] = topDrivers || "none";

      // Annotate if composite score is high
      if (compositeScore > 2) {
        const significance = vm_clamp01(compositeScore / 5);
        annotations.push({
          row_index: i,
          column: "composite",
          annotation_type: "anomaly",
          value: compositeScore.toFixed(3),
          significance,
          description: `Row ${i} is anomalous (composite score: ${compositeScore.toFixed(2)}). Main drivers: ${topDrivers || "none"}`,
        });
      }
    }
  }

  const extraCols = [
    { name: "_anom_score", values: anomScores },
    { name: "_anom_drivers", values: anomDrivers },
  ];

  const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

  const rowsWithAnnotations = new Set(annotations.map((a) => a.row_index)).size;
  const coverage = rows.length > 0 ? rowsWithAnnotations / rows.length : 0;

  let topFinding = "No multi-dimensional anomalies detected.";
  if (annotations.length > 0) {
    const top = annotations.sort((a, b) => b.significance - a.significance)[0];
    topFinding = top.description;
  }

  return {
    visor: "anomaly",
    annotations,
    annotated_csv,
    summary: {
      total_annotations: annotations.length,
      top_finding: topFinding,
      coverage: vm_clamp01(coverage),
    },
    recommended_next_visor:
      "Try the statistical visor next to drill into individual column distributions for the anomalous rows.",
  };
}

// ============================================================================
// Visor: Geographic
// ============================================================================

function vm_geographic(
  headers: string[],
  rows: string[][],
  profiles: VmColProfile[],
  focusCols?: string[]
): VisorModeResult {
  const annotations: VisorAnnotation[] = [];

  // Find lat/lon columns
  const latNames = ["lat", "latitude", "y"];
  const lonNames = ["lon", "lng", "longitude", "x"];

  let latProfile: VmColProfile | null = null;
  let lonProfile: VmColProfile | null = null;

  for (const p of profiles) {
    const lower = p.name.toLowerCase();
    if (latNames.includes(lower) && p.type === "numeric") latProfile = p;
    if (lonNames.includes(lower) && p.type === "numeric") lonProfile = p;
  }

  if (!latProfile || !lonProfile) {
    // No geo columns found
    const extraCols = [
      { name: "_geo_cluster", values: new Array(rows.length).fill("none") },
      { name: "_geo_isolation", values: new Array(rows.length).fill("0") },
    ];
    const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

    return {
      visor: "geographic",
      annotations: [],
      annotated_csv,
      summary: {
        total_annotations: 0,
        top_finding:
          "No geographic columns (lat/lon) found in the dataset. Cannot apply geographic visor.",
        coverage: 0,
      },
      recommended_next_visor:
        "Try the statistical visor to analyze the numeric distributions in this dataset.",
    };
  }

  // Compute pairwise distances (haversine-like using Euclidean on lat/lon for simplicity)
  const n = rows.length;
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const lat1 = latProfile.numericValues[i] ?? 0;
      const lon1 = lonProfile.numericValues[i] ?? 0;
      const lat2 = latProfile.numericValues[j] ?? 0;
      const lon2 = lonProfile.numericValues[j] ?? 0;
      // Approximate distance using Euclidean on degrees (good enough for clustering)
      const d = Math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2);
      distances[i][j] = d;
      distances[j][i] = d;
    }
  }

  // Nearest-neighbor distance for isolation score
  const nnDistances: number[] = [];
  for (let i = 0; i < n; i++) {
    let minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (i !== j && distances[i][j] < minDist) {
        minDist = distances[i][j];
      }
    }
    nnDistances.push(minDist === Infinity ? 0 : minDist);
  }

  // Simple DBSCAN-like clustering
  // Use median NN distance as eps
  const sortedNN = [...nnDistances].sort((a, b) => a - b);
  const medianNN =
    sortedNN.length % 2 === 0
      ? (sortedNN[sortedNN.length / 2 - 1] + sortedNN[sortedNN.length / 2]) / 2
      : sortedNN[Math.floor(sortedNN.length / 2)];

  const eps = medianNN * 2; // Points within 2x median NN distance are in same cluster
  const minPts = 2;
  const clusterIds: number[] = new Array(n).fill(-1);
  let currentCluster = 0;

  for (let i = 0; i < n; i++) {
    if (clusterIds[i] !== -1) continue;

    // Find neighbors
    const neighbors: number[] = [];
    for (let j = 0; j < n; j++) {
      if (distances[i][j] <= eps) neighbors.push(j);
    }

    if (neighbors.length >= minPts) {
      // Start a new cluster
      clusterIds[i] = currentCluster;
      const queue = [...neighbors.filter((j) => j !== i)];
      while (queue.length > 0) {
        const q = queue.shift()!;
        if (clusterIds[q] !== -1) continue;
        clusterIds[q] = currentCluster;

        const qNeighbors: number[] = [];
        for (let j = 0; j < n; j++) {
          if (distances[q][j] <= eps) qNeighbors.push(j);
        }
        if (qNeighbors.length >= minPts) {
          for (const nn of qNeighbors) {
            if (clusterIds[nn] === -1) queue.push(nn);
          }
        }
      }
      currentCluster++;
    }
  }

  // Assign noise points to cluster -1 label "noise"
  const clusterLabels = clusterIds.map((c) => (c === -1 ? "noise" : `cluster_${c}`));
  const isolationScores = nnDistances.map((d) => d.toFixed(4));

  const extraCols = [
    { name: "_geo_cluster", values: clusterLabels },
    { name: "_geo_isolation", values: isolationScores },
  ];

  // Annotate spatial outliers (high isolation) and cluster members
  const maxNN = Math.max(...nnDistances);
  for (let i = 0; i < n; i++) {
    const relativeIsolation = maxNN > 0 ? nnDistances[i] / maxNN : 0;
    if (relativeIsolation > 0.5) {
      annotations.push({
        row_index: i,
        column: latProfile.name,
        annotation_type: "spatial_outlier",
        value: `${latProfile.numericValues[i]}, ${lonProfile.numericValues[i]}`,
        significance: vm_clamp01(relativeIsolation),
        description: `Spatially isolated point at (${latProfile.numericValues[i]}, ${lonProfile.numericValues[i]}) — nearest neighbor distance: ${nnDistances[i].toFixed(2)}`,
      });
    }

    if (clusterIds[i] !== -1) {
      annotations.push({
        row_index: i,
        column: latProfile.name,
        annotation_type: "cluster_member",
        value: `cluster_${clusterIds[i]}`,
        significance: 0.4,
        description: `Member of spatial cluster ${clusterIds[i]}`,
      });
    }
  }

  const annotated_csv = vm_buildAnnotatedCsv(headers, rows, extraCols);

  const rowsWithAnnotations = new Set(annotations.map((a) => a.row_index)).size;
  const coverage = rows.length > 0 ? rowsWithAnnotations / rows.length : 0;

  const clusterCount = new Set(clusterIds.filter((c) => c !== -1)).size;
  const noiseCount = clusterIds.filter((c) => c === -1).length;
  let topFinding = `Found ${clusterCount} spatial cluster(s) with ${noiseCount} noise point(s).`;
  const spatialOutliers = annotations.filter((a) => a.annotation_type === "spatial_outlier");
  if (spatialOutliers.length > 0) {
    topFinding += ` Most isolated: ${spatialOutliers.sort((a, b) => b.significance - a.significance)[0].description}`;
  }

  return {
    visor: "geographic",
    annotations,
    annotated_csv,
    summary: {
      total_annotations: annotations.length,
      top_finding: topFinding,
      coverage: vm_clamp01(coverage),
    },
    recommended_next_visor:
      "Try the anomaly visor next to see if spatially outlying points are also anomalous in other dimensions.",
  };
}

// ============================================================================
// Main entry point
// ============================================================================

export async function flowVisorMode(input: VisorModeInput): Promise<VisorModeResult> {
  const { csv_data, visor, focus_columns } = input;
  const { headers, rows } = parseCsvToRows(csv_data);

  if (headers.length === 0) {
    return {
      visor,
      annotations: [],
      annotated_csv: "",
      summary: {
        total_annotations: 0,
        top_finding: "Empty dataset — no data to analyze.",
        coverage: 0,
      },
      recommended_next_visor: "Provide data first, then try any visor.",
    };
  }

  const profiles = vm_profileColumns(headers, rows, focus_columns);

  switch (visor) {
    case "statistical":
      return vm_statistical(headers, rows, profiles, focus_columns);
    case "relational":
      return vm_relational(headers, rows, profiles, focus_columns);
    case "temporal":
      return vm_temporal(headers, rows, profiles, focus_columns);
    case "anomaly":
      return vm_anomaly(headers, rows, profiles, focus_columns);
    case "geographic":
      return vm_geographic(headers, rows, profiles, focus_columns);
    default:
      return {
        visor: visor as string,
        annotations: [],
        annotated_csv: csv_data,
        summary: {
          total_annotations: 0,
          top_finding: `Unknown visor: ${visor}`,
          coverage: 0,
        },
        recommended_next_visor: "Try the statistical visor as a starting point.",
      };
  }
}
