import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// NARRATIVE INTELLIGENCE TOOLS
// ============================================================================

export interface NarrateDataInput {
  csv: string;
  /** Optional: focus on specific columns for narrative */
  focus_columns?: string[];
  /** Narrative style: "executive" (brief, insights-first), "explorer" (curious, discovery-oriented), "journalist" (who-what-where-why) */
  style?: "executive" | "explorer" | "journalist";
}

export interface DataCharacter {
  name: string;
  role: "protagonist" | "antagonist" | "outlier" | "bridge" | "cluster_leader";
  description: string;
  evidence: string;
}

export interface NarrativeArc {
  hook: string;
  setting: string;
  characters: DataCharacter[];
  rising_action: string;
  climax: string;
  resolution: string;
  cliffhanger: string;
}

export interface NarrateDataResult {
  narrative: NarrativeArc;
  suggested_exploration: string[];
  data_summary: {
    rows: number;
    columns: number;
    numeric_columns: string[];
    categorical_columns: string[];
    potential_id_column: string | null;
  };
  viz_recommendation: string;
}

// ============================================================================
// Internal helpers for narrative
// ============================================================================

interface NarrColumnProfile {
  name: string;
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
  valueCounts: Map<string, number>;
  outliers: Map<number, number>;
  trend: "rising" | "falling" | "flat" | "unknown";
}

interface NarrFinding {
  type: "outlier" | "correlation" | "trend" | "concentration" | "distribution" | "gap" | "extremes";
  strength: number;
  description: string;
  columns: string[];
  detail: string;
}

function narrParseCsvToRows(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return { headers: parseCSVLine(lines[0] || ""), rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCSVLine(line));
  return { headers, rows };
}

function narrIsDateLike(val: string): boolean {
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

function narrIsIdLike(name: string, values: string[], totalRows: number): boolean {
  const nameLower = name.toLowerCase();
  if (nameLower === "id" || nameLower.endsWith("_id") || nameLower === "key" || nameLower === "name") {
    return true;
  }
  const uniqueSet = new Set(values.filter((v) => v.trim() !== ""));
  return uniqueSet.size === totalRows && totalRows > 1;
}

function narrComputeStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function narrComputeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function narrComputeSkewness(values: number[], mean: number, std: number): number {
  if (values.length < 3 || std === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
  return m3;
}

function narrPearson(xs: number[], ys: number[]): number {
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

function narrDetectTrend(values: number[]): "rising" | "falling" | "flat" | "unknown" {
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

function narrProfileColumn(
  name: string,
  colIdx: number,
  rows: string[][],
): NarrColumnProfile {
  const values = rows.map((row) => row[colIdx]?.trim() ?? "");
  const nonEmpty = values.filter((v) => v !== "");
  const nullCount = values.length - nonEmpty.length;

  const uniqueSet = new Set(nonEmpty);
  const uniqueCount = uniqueSet.size;

  // Check if date column
  const dateSample = nonEmpty.slice(0, Math.min(5, nonEmpty.length));
  const dateRatio = dateSample.filter(narrIsDateLike).length / Math.max(dateSample.length, 1);

  // Check if numeric
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
  } else if (narrIsIdLike(name, nonEmpty, rows.length)) {
    type = "id";
  } else {
    type = "categorical";
  }

  const sorted = [...numericValues].sort((a, b) => a - b);
  const sum = numericValues.reduce((s, v) => s + v, 0);
  const mean = numericValues.length > 0 ? sum / numericValues.length : 0;
  const std = narrComputeStd(numericValues, mean);
  const min = sorted.length > 0 ? sorted[0] : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  const median = narrComputeMedian(sorted);
  const skewness = narrComputeSkewness(numericValues, mean, std);

  // Find outliers (|z| > 2.5)
  const outliers = new Map<number, number>();
  if (std > 0 && type === "numeric") {
    for (let i = 0; i < rows.length; i++) {
      const val = Number(values[i]);
      if (!isNaN(val)) {
        const z = (val - mean) / std;
        if (Math.abs(z) > 2.5) {
          outliers.set(i, Math.round(z * 100) / 100);
        }
      }
    }
  }

  // Value counts for categorical
  const valueCounts = new Map<string, number>();
  if (type === "categorical" || type === "id") {
    for (const v of nonEmpty) {
      valueCounts.set(v, (valueCounts.get(v) ?? 0) + 1);
    }
  }

  const trend = type === "numeric" ? narrDetectTrend(numericValues) : "unknown";

  return {
    name,
    type,
    values,
    numericValues,
    mean: Math.round(mean * 100) / 100,
    std: Math.round(std * 100) / 100,
    min,
    max,
    median: Math.round(median * 100) / 100,
    skewness: Math.round(skewness * 100) / 100,
    uniqueCount,
    nullCount,
    valueCounts,
    outliers,
    trend,
  };
}

// ============================================================================
// Finding detection
// ============================================================================

function narrFindOutliers(
  profiles: NarrColumnProfile[],
  rows: string[][],
  idCol: NarrColumnProfile | null,
): NarrFinding[] {
  const findings: NarrFinding[] = [];
  for (const prof of profiles) {
    if (prof.type !== "numeric" || prof.outliers.size === 0) continue;
    const colIdx = profiles.findIndex((p) => p.name === prof.name);
    const idColIdx = idCol ? profiles.findIndex((p) => p.name === idCol.name) : -1;
    for (const [rowIdx, zScore] of prof.outliers) {
      const entityName = idColIdx >= 0 ? rows[rowIdx][idColIdx]?.trim() ?? `Row ${rowIdx + 1}` : `Row ${rowIdx + 1}`;
      const val = rows[rowIdx][colIdx]?.trim() ?? "?";
      const direction = zScore > 0 ? "above" : "below";
      findings.push({
        type: "outlier",
        strength: Math.min(Math.abs(zScore) / 5, 1),
        description: `${entityName} is a dramatic outlier in ${prof.name} — ${val} is ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} the mean of ${prof.mean}`,
        columns: [prof.name],
        detail: `z-score: ${zScore}, value: ${val}, mean: ${prof.mean}, std: ${prof.std}`,
      });
    }
  }
  findings.sort((a, b) => b.strength - a.strength);
  return findings;
}

function narrFindCorrelations(profiles: NarrColumnProfile[]): NarrFinding[] {
  const findings: NarrFinding[] = [];
  const numProfiles = profiles.filter((p) => p.type === "numeric" && p.numericValues.length >= 3);

  for (let i = 0; i < numProfiles.length; i++) {
    for (let j = i + 1; j < numProfiles.length; j++) {
      const r = narrPearson(numProfiles[i].numericValues, numProfiles[j].numericValues);
      const absR = Math.abs(r);
      if (absR > 0.6) {
        const direction = r > 0 ? "positive" : "inverse";
        const verb = r > 0 ? "rise together" : "move in opposite directions";
        findings.push({
          type: "correlation",
          strength: absR,
          description: `Strong ${direction} relationship between ${numProfiles[i].name} and ${numProfiles[j].name} (r=${r.toFixed(2)}) — they ${verb}`,
          columns: [numProfiles[i].name, numProfiles[j].name],
          detail: `Pearson r = ${r.toFixed(4)}`,
        });
      }
    }
  }
  findings.sort((a, b) => b.strength - a.strength);
  return findings;
}

function narrFindTrends(profiles: NarrColumnProfile[]): NarrFinding[] {
  const findings: NarrFinding[] = [];
  for (const prof of profiles) {
    if (prof.type !== "numeric" || prof.trend === "unknown" || prof.trend === "flat") continue;
    const pctChange = prof.max !== 0 && prof.min !== 0
      ? Math.round(((prof.max - prof.min) / Math.abs(prof.min)) * 100)
      : 0;
    const verb = prof.trend === "rising" ? "climbing" : "declining";
    findings.push({
      type: "trend",
      strength: Math.min(Math.abs(pctChange) / 200, 1),
      description: `${prof.name} is steadily ${verb} across the dataset, ranging from ${prof.min} to ${prof.max}`,
      columns: [prof.name],
      detail: `trend: ${prof.trend}, range: ${prof.min}-${prof.max}, change: ${pctChange}%`,
    });
  }
  return findings;
}

function narrFindConcentrations(profiles: NarrColumnProfile[], totalRows: number): NarrFinding[] {
  const findings: NarrFinding[] = [];
  for (const prof of profiles) {
    if (prof.type !== "categorical" || prof.valueCounts.size === 0) continue;
    let maxVal = "";
    let maxCount = 0;
    for (const [val, count] of prof.valueCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxVal = val;
      }
    }
    const pct = totalRows > 0 ? Math.round((maxCount / totalRows) * 100) : 0;
    if (pct >= 50) {
      findings.push({
        type: "concentration",
        strength: pct / 100,
        description: `${maxVal} dominates ${prof.name}, accounting for ${pct}% of all entries (${maxCount} of ${totalRows})`,
        columns: [prof.name],
        detail: `dominant: ${maxVal}, count: ${maxCount}/${totalRows}, pct: ${pct}%`,
      });
    }
  }
  return findings;
}

function narrFindDistributionShapes(profiles: NarrColumnProfile[]): NarrFinding[] {
  const findings: NarrFinding[] = [];
  for (const prof of profiles) {
    if (prof.type !== "numeric" || prof.numericValues.length < 5) continue;
    const absSkew = Math.abs(prof.skewness);
    if (absSkew > 1.5) {
      const direction = prof.skewness > 0 ? "right" : "left";
      findings.push({
        type: "distribution",
        strength: Math.min(absSkew / 3, 1),
        description: `${prof.name} has a heavily skewed distribution (skew=${prof.skewness}) — a long tail stretching to the ${direction}`,
        columns: [prof.name],
        detail: `skewness: ${prof.skewness}, mean: ${prof.mean}, median: ${prof.median}`,
      });
    }
  }
  return findings;
}

function narrFindExtremes(
  profiles: NarrColumnProfile[],
  rows: string[][],
  idCol: NarrColumnProfile | null,
): NarrFinding[] {
  const findings: NarrFinding[] = [];
  for (const prof of profiles) {
    if (prof.type !== "numeric" || prof.numericValues.length < 3) continue;
    const colIdx = profiles.findIndex((p) => p.name === prof.name);
    let maxIdx = -1;
    let maxVal = -Infinity;
    let minIdx = -1;
    let minVal = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const v = Number(rows[i][colIdx]?.trim());
      if (!isNaN(v)) {
        if (v > maxVal) { maxVal = v; maxIdx = i; }
        if (v < minVal) { minVal = v; minIdx = i; }
      }
    }
    if (maxIdx >= 0 && prof.std > 0) {
      const idColIdx = idCol ? profiles.findIndex((p) => p.name === idCol.name) : -1;
      const maxName = idColIdx >= 0 ? rows[maxIdx][idColIdx]?.trim() ?? `Row ${maxIdx + 1}` : `Row ${maxIdx + 1}`;
      const minName = idColIdx >= 0 && minIdx >= 0 ? rows[minIdx][idColIdx]?.trim() ?? `Row ${minIdx + 1}` : `Row ${minIdx + 1}`;
      const ratio = minVal !== 0 ? Math.round(maxVal / minVal) : 0;
      if (ratio > 5) {
        findings.push({
          type: "extremes",
          strength: Math.min(ratio / 50, 1),
          description: `The gap between ${maxName} (${maxVal}) and ${minName} (${minVal}) in ${prof.name} is ${ratio}x — a massive disparity`,
          columns: [prof.name],
          detail: `max: ${maxName}=${maxVal}, min: ${minName}=${minVal}, ratio: ${ratio}x`,
        });
      }
    }
  }
  return findings;
}

// ============================================================================
// Character identification
// ============================================================================

function narrIdentifyCharacters(
  profiles: NarrColumnProfile[],
  rows: string[][],
  idCol: NarrColumnProfile | null,
  findings: NarrFinding[],
  maxChars: number,
): DataCharacter[] {
  const characters: DataCharacter[] = [];
  const usedRows = new Set<number>();
  const idColIdx = idCol ? profiles.findIndex((p) => p.name === idCol.name) : -1;

  const getEntityName = (rowIdx: number): string => {
    if (idColIdx >= 0 && rows[rowIdx]) {
      return rows[rowIdx][idColIdx]?.trim() ?? `Row ${rowIdx + 1}`;
    }
    return `Row ${rowIdx + 1}`;
  };

  // Outlier characters
  for (const prof of profiles) {
    if (prof.type !== "numeric") continue;
    for (const [rowIdx, zScore] of prof.outliers) {
      if (usedRows.has(rowIdx) || characters.length >= maxChars) continue;
      const name = getEntityName(rowIdx);
      const colIdx = profiles.findIndex((p) => p.name === prof.name);
      const val = rows[rowIdx][colIdx]?.trim() ?? "?";
      characters.push({
        name,
        role: "outlier",
        description: `Stands far apart from the rest with ${prof.name} of ${val} (z-score: ${zScore})`,
        evidence: `${prof.name}=${val}, mean=${prof.mean}, std=${prof.std}, z=${zScore}`,
      });
      usedRows.add(rowIdx);
    }
  }

  // Protagonist: the highest value in the most important numeric column
  const primaryNumeric = profiles.find((p) => p.type === "numeric" && p.numericValues.length > 0);
  if (primaryNumeric && characters.length < maxChars) {
    const colIdx = profiles.findIndex((p) => p.name === primaryNumeric.name);
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      if (usedRows.has(i)) continue;
      const v = Number(rows[i][colIdx]?.trim());
      if (!isNaN(v) && v > bestVal) { bestVal = v; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      const name = getEntityName(bestIdx);
      characters.push({
        name,
        role: "protagonist",
        description: `Leads the pack in ${primaryNumeric.name} with a value of ${bestVal}`,
        evidence: `${primaryNumeric.name}=${bestVal}, max in dataset`,
      });
      usedRows.add(bestIdx);
    }
  }

  // Antagonist: the lowest performer
  if (primaryNumeric && characters.length < maxChars) {
    const colIdx = profiles.findIndex((p) => p.name === primaryNumeric.name);
    let worstIdx = -1;
    let worstVal = Infinity;
    for (let i = 0; i < rows.length; i++) {
      if (usedRows.has(i)) continue;
      const v = Number(rows[i][colIdx]?.trim());
      if (!isNaN(v) && v < worstVal) { worstVal = v; worstIdx = i; }
    }
    if (worstIdx >= 0) {
      const name = getEntityName(worstIdx);
      characters.push({
        name,
        role: "antagonist",
        description: `At the bottom of ${primaryNumeric.name} with only ${worstVal}`,
        evidence: `${primaryNumeric.name}=${worstVal}, min in dataset`,
      });
      usedRows.add(worstIdx);
    }
  }

  // Cluster leader: the entity closest to the mean
  if (primaryNumeric && characters.length < maxChars) {
    const colIdx = profiles.findIndex((p) => p.name === primaryNumeric.name);
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < rows.length; i++) {
      if (usedRows.has(i)) continue;
      const v = Number(rows[i][colIdx]?.trim());
      if (!isNaN(v)) {
        const dist = Math.abs(v - primaryNumeric.mean);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      }
    }
    if (closestIdx >= 0) {
      const val = Number(rows[closestIdx][colIdx]?.trim());
      const name = getEntityName(closestIdx);
      characters.push({
        name,
        role: "cluster_leader",
        description: `The most typical entity, sitting right at the center with ${primaryNumeric.name} of ${val}`,
        evidence: `${primaryNumeric.name}=${val}, closest to mean ${primaryNumeric.mean}`,
      });
      usedRows.add(closestIdx);
    }
  }

  return characters;
}

// ============================================================================
// Narrative generation (style-aware)
// ============================================================================

function narrGenerateHook(findings: NarrFinding[], style: string, rows: number): string {
  if (findings.length === 0) {
    if (rows === 0) return "An empty canvas awaits — this dataset has no data rows yet.";
    if (rows === 1) return "A single data point sits alone — one entity, waiting for context.";
    return `A dataset of ${rows} entries holds its secrets close, with no standout patterns at first glance.`;
  }

  const top = findings[0];
  switch (style) {
    case "executive":
      return top.description.split(" — ")[0] + ".";
    case "journalist":
      if (top.type === "outlier") return `One entity stands out from the rest: ${top.description}`;
      if (top.type === "correlation") return `The data reveals a hidden connection: ${top.description}`;
      if (top.type === "concentration") return `A pattern of dominance emerges: ${top.description}`;
      return `Investigation of ${rows} records reveals: ${top.description}`;
    default: // explorer
      if (top.type === "outlier") return `Something remarkable hides in this data — ${top.description}`;
      if (top.type === "correlation") return `A fascinating pattern emerges when you look closely — ${top.description}`;
      if (top.type === "concentration") return `An unexpected concentration catches the eye — ${top.description}`;
      if (top.type === "trend") return `There is a persistent current running through this data — ${top.description}`;
      return `Buried in ${rows} rows of data, a pattern waits to be noticed — ${top.description}`;
  }
}

function narrGenerateSetting(
  rows: number,
  cols: number,
  numericCols: string[],
  categoricalCols: string[],
  idCol: string | null,
  style: string,
): string {
  const entityName = idCol ?? "entries";
  if (rows === 0) return `This dataset contains 0 rows across ${cols} columns — an empty frame waiting for data.`;
  if (rows === 1) return `A solitary record with ${cols} attributes: ${numericCols.concat(categoricalCols).join(", ")}.`;

  switch (style) {
    case "executive":
      return `${rows} ${entityName} across ${cols} dimensions. Numeric: ${numericCols.join(", ") || "none"}. Categorical: ${categoricalCols.join(", ") || "none"}.`;
    case "journalist":
      return `This is a dataset of ${rows} ${entityName} with ${cols} attributes${numericCols.length > 0 ? `, including measurable quantities like ${numericCols.slice(0, 3).join(", ")}` : ""}. Here is what the numbers tell us.`;
    default: // explorer
      return `Imagine ${rows} ${entityName} laid out before you, each described by ${cols} attributes — ${numericCols.length} numeric measurements (${numericCols.slice(0, 3).join(", ")}${numericCols.length > 3 ? ", and more" : ""})${categoricalCols.length > 0 ? ` and ${categoricalCols.length} categorical dimensions (${categoricalCols.slice(0, 2).join(", ")})` : ""}. What stories do they tell?`;
  }
}

function narrGenerateRisingAction(findings: NarrFinding[], style: string): string {
  if (findings.length === 0) {
    return style === "executive"
      ? "No significant patterns detected in the numeric dimensions."
      : "The data sits quietly, without strong correlations, outliers, or trends demanding attention. Sometimes the absence of pattern is itself a finding.";
  }

  const correlations = findings.filter((f) => f.type === "correlation");
  const trends = findings.filter((f) => f.type === "trend");
  const concentrations = findings.filter((f) => f.type === "concentration");
  const distributions = findings.filter((f) => f.type === "distribution");
  const extremes = findings.filter((f) => f.type === "extremes");

  const parts: string[] = [];

  if (correlations.length > 0) {
    if (style === "executive") {
      parts.push(correlations.map((c) => c.description.split(" — ")[0]).join(". ") + ".");
    } else if (style === "journalist") {
      parts.push("The data shows a clear relationship: " + correlations[0].description + ".");
      if (correlations.length > 1) parts.push(`Additionally, ${correlations.slice(1).map((c) => c.description).join(". ")}.`);
    } else {
      parts.push("Dig deeper and a relationship emerges: " + correlations[0].description + ".");
      if (correlations.length > 1) parts.push(`That is not all — ${correlations.slice(1).map((c) => c.description).join(". ")}.`);
    }
  }

  if (trends.length > 0) {
    if (style === "executive") {
      parts.push(trends.map((t) => t.description).join(". ") + ".");
    } else {
      parts.push(trends.map((t) => t.description).join(". Meanwhile, ") + ".");
    }
  }

  if (concentrations.length > 0) {
    parts.push(concentrations.map((c) => c.description).join(". ") + ".");
  }

  if (distributions.length > 0 && style !== "executive") {
    parts.push(distributions.map((d) => d.description).join(". ") + ".");
  }

  if (extremes.length > 0 && style !== "executive") {
    parts.push(extremes[0].description + ".");
  }

  return parts.join(" ");
}

function narrGenerateClimax(findings: NarrFinding[], style: string, rows: number): string {
  if (findings.length === 0) {
    if (rows <= 1) return "With so little data, the story is yet to be written.";
    return style === "executive"
      ? "No standout insights in this dataset."
      : "The most interesting thing about this dataset may be its uniformity — everything sits comfortably close to average, with no dramatic outliers or hidden connections.";
  }

  const best = findings[0];

  switch (style) {
    case "executive":
      return `Key insight: ${best.description}`;
    case "journalist":
      return `Here is the headline: ${best.description}. This is the single most notable finding in the entire dataset.`;
    default: // explorer
      return `And here is the moment that makes this data worth exploring: ${best.description}. This was not obvious at first glance — it emerged from the numbers themselves.`;
  }
}

function narrGenerateResolution(findings: NarrFinding[], style: string): string {
  if (findings.length === 0) {
    return style === "executive"
      ? "Consider collecting more data or different dimensions to surface patterns."
      : "This dataset may need enrichment — additional dimensions, more rows, or a different angle of observation could reveal the stories hiding beneath the surface.";
  }

  const topTypes = [...new Set(findings.slice(0, 3).map((f) => f.type))];
  const actionParts: string[] = [];

  if (topTypes.includes("outlier")) {
    actionParts.push(style === "executive"
      ? "Investigate the outliers — they may represent errors, opportunities, or edge cases requiring separate treatment"
      : "Those outliers deserve investigation. Are they data errors, or are they the most important entities in the dataset?");
  }
  if (topTypes.includes("correlation")) {
    actionParts.push(style === "executive"
      ? "Leverage the correlation for predictive modeling or segmentation"
      : "The correlations suggest a causal mechanism worth exploring further");
  }
  if (topTypes.includes("trend")) {
    actionParts.push(style === "executive"
      ? "Monitor the trend for acceleration or reversal"
      : "The trend is clear, but the question is: will it continue, accelerate, or reverse?");
  }
  if (topTypes.includes("concentration")) {
    actionParts.push(style === "executive"
      ? "Evaluate whether category concentration represents risk or strategic focus"
      : "That concentration raises a question: is it a strength to leverage or a risk to diversify?");
  }

  if (actionParts.length === 0) {
    actionParts.push(style === "executive"
      ? "Explore the numeric dimensions for deeper segmentation."
      : "There is more to uncover — the next step is to slice the data differently and see what emerges.");
  }

  return actionParts.join(". ") + ".";
}

function narrGenerateCliffhanger(findings: NarrFinding[], profiles: NarrColumnProfile[], style: string, rows: number): string {
  if (rows <= 1) {
    return "What would this picture look like with more data?";
  }

  const questions: string[] = [];

  const outlierFindings = findings.filter((f) => f.type === "outlier");
  if (outlierFindings.length > 0) {
    questions.push(`What caused ${outlierFindings[0].columns[0]} to spike so dramatically in that outlier?`);
  }

  const corrFindings = findings.filter((f) => f.type === "correlation");
  if (corrFindings.length > 0) {
    questions.push(`Is the relationship between ${corrFindings[0].columns[0]} and ${corrFindings[0].columns[1]} causal, or is a third variable pulling the strings?`);
  }

  const trendFindings = findings.filter((f) => f.type === "trend");
  if (trendFindings.length > 0) {
    questions.push(`Where does the ${trendFindings[0].columns[0]} trajectory end — is there a ceiling, or is this just the beginning?`);
  }

  const catProfiles = profiles.filter((p) => p.type === "categorical" && p.valueCounts.size > 1);
  if (catProfiles.length > 0) {
    questions.push(`What happens when you break this data down by ${catProfiles[0].name} — does the story change for different groups?`);
  }

  if (questions.length === 0) {
    questions.push("What would happen if you doubled the dataset — would the same patterns hold?");
    questions.push("Is there a dimension not captured here that would change everything?");
  }

  return style === "executive" ? questions[0] : questions.slice(0, 2).join(" And ");
}

// ============================================================================
// Viz recommendation
// ============================================================================

function narrRecommendViz(
  profiles: NarrColumnProfile[],
  findings: NarrFinding[],
  rows: number,
): string {
  const hasGeo = profiles.some((p) =>
    p.name.toLowerCase().includes("lat") ||
    p.name.toLowerCase().includes("lon") ||
    p.name.toLowerCase().includes("geo") ||
    p.name.toLowerCase().includes("country") ||
    p.name.toLowerCase().includes("city")
  );
  const hasNetwork = profiles.some((p) =>
    p.name.toLowerCase().includes("connection") ||
    p.name.toLowerCase().includes("source") ||
    p.name.toLowerCase().includes("target") ||
    p.name.toLowerCase().includes("edge")
  );
  const hasTime = profiles.some((p) => p.type === "date");
  const numericCount = profiles.filter((p) => p.type === "numeric").length;
  const hasCorrelation = findings.some((f) => f.type === "correlation");

  if (hasNetwork) return "3D Network Graph — relationships between entities visualized as a spatial network";
  if (hasGeo) return "3D Geographic Scatter — entities plotted on a globe with altitude for the key metric";
  if (hasTime && findings.some((f) => f.type === "trend")) return "3D Time Series — temporal evolution with depth axis for the trending metric";
  if (numericCount >= 3 && hasCorrelation) return "3D Scatter Plot — three numeric dimensions reveal correlation clusters";
  if (numericCount >= 3) return "3D Scatter Plot — map three numeric columns to x, y, z axes";
  if (numericCount >= 1 && rows > 20) return "3D Bar Chart — compare entities by their key metric with spatial depth";
  return "3D Swarm — position entities spatially to reveal natural groupings";
}

// ============================================================================
// Suggested explorations
// ============================================================================

function narrSuggestExplorations(
  profiles: NarrColumnProfile[],
  findings: NarrFinding[],
): string[] {
  const suggestions: string[] = [];

  const numericCols = profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  const categoricalCols = profiles.filter((p) => p.type === "categorical").map((p) => p.name);

  if (numericCols.length >= 2) {
    suggestions.push(`Run flow_correlation_matrix on ${numericCols.slice(0, 3).join(", ")} to quantify the relationships between numeric columns`);
  }

  if (findings.some((f) => f.type === "outlier")) {
    suggestions.push("Use flow_anomaly_detect with z-score method to flag all outliers systematically");
  }

  if (numericCols.length >= 2) {
    suggestions.push(`Use flow_cluster_data to discover natural groupings across ${numericCols.length} numeric dimensions`);
  }

  if (categoricalCols.length > 0 && numericCols.length > 0) {
    suggestions.push(`Try flow_pivot_table grouping by ${categoricalCols[0]} with aggregation on ${numericCols[0]} to compare categories`);
  }

  if (findings.some((f) => f.type === "trend")) {
    suggestions.push("Use flow_regression_analysis to model the trend and predict future values");
  }

  suggestions.push("Visualize in Flow Immersive with flow_upload_data to see the spatial structure that 2D charts miss");

  return suggestions.slice(0, 5);
}

// ============================================================================
// Main export: flowNarrateData
// ============================================================================

export function flowNarrateData(input: NarrateDataInput): NarrateDataResult {
  const style = input.style ?? "explorer";
  const { headers, rows } = narrParseCsvToRows(input.csv);

  // Profile every column
  let profiles = headers.map((h, i) => narrProfileColumn(h, i, rows));

  // If focus_columns specified, prioritize those for narrative (but still profile all)
  const focusCols = input.focus_columns;
  if (focusCols && focusCols.length > 0) {
    const focused = profiles.filter((p) => focusCols.includes(p.name));
    const rest = profiles.filter((p) => !focusCols.includes(p.name));
    profiles = [...focused, ...rest];
  }

  // Classify columns
  const numericColumns = profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  const categoricalColumns = profiles.filter((p) => p.type === "categorical" || p.type === "date").map((p) => p.name);
  const idCol = profiles.find((p) => p.type === "id") ?? null;

  // Gather findings
  const allFindings: NarrFinding[] = [
    ...narrFindOutliers(profiles, rows, idCol),
    ...narrFindCorrelations(profiles),
    ...narrFindTrends(profiles),
    ...narrFindConcentrations(profiles, rows.length),
    ...narrFindDistributionShapes(profiles),
    ...narrFindExtremes(profiles, rows, idCol),
  ];

  // Sort all findings by strength
  allFindings.sort((a, b) => b.strength - a.strength);

  // Identify characters
  const characters = narrIdentifyCharacters(profiles, rows, idCol, allFindings, 5);

  // Build the narrative arc
  const narrative: NarrativeArc = {
    hook: narrGenerateHook(allFindings, style, rows.length),
    setting: narrGenerateSetting(rows.length, headers.length, numericColumns, categoricalColumns, idCol?.name ?? null, style),
    characters,
    rising_action: narrGenerateRisingAction(allFindings.slice(0, 8), style),
    climax: narrGenerateClimax(allFindings, style, rows.length),
    resolution: narrGenerateResolution(allFindings, style),
    cliffhanger: narrGenerateCliffhanger(allFindings, profiles, style, rows.length),
  };

  return {
    narrative,
    suggested_exploration: narrSuggestExplorations(profiles, allFindings),
    data_summary: {
      rows: rows.length,
      columns: headers.length,
      numeric_columns: numericColumns,
      categorical_columns: categoricalColumns,
      potential_id_column: idCol?.name ?? null,
    },
    viz_recommendation: narrRecommendViz(profiles, allFindings, rows.length),
  };
}

// ============================================================================
// TOOL: flow_famous_network — Instant celebrity/famous person networks
// Generates Flow-compatible network CSVs from Wikidata's free SPARQL API
// ============================================================================

export interface FamousNetworkInput {
  /** Name of the person to build network around */
  person: string;
  /** How many hops from the center person (default 1, max 2) */
  depth?: 1 | 2;
  /** Type of relationships to include */
  relationship_types?: ("spouse" | "child" | "colleague" | "influenced" | "educated_with" | "all")[];
  /** Max nodes (default 50, max 200) */
  max_nodes?: number;
}

export interface FamousNetworkResult {
  csv: string;
  center_person: string;
  center_description: string;
  nodes: number;
  edges: number;
  relationship_breakdown: Record<string, number>;
  notable_connections: string[];
  narrative_hook: string;
  suggested_template: string;
  wikidata_query: string;
}

// Wikidata property IDs for relationship types
const RELATIONSHIP_PROPERTIES: Record<string, { props: string[]; label: string }> = {
  spouse: { props: ["P26"], label: "spouse" },
  child: { props: ["P40", "P22", "P25"], label: "family" },
  colleague: { props: ["P108", "P1327"], label: "colleague" },
  influenced: { props: ["P737", "P800"], label: "influenced" },
  educated_with: { props: ["P69"], label: "education" },
};

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const FETCH_TIMEOUT = 15_000;
const USER_AGENT = "FlowMCP/1.0 (https://github.com/Halyxa/flowmcp)";

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface WikidataBinding {
  person?: { value: string };
  personLabel?: { value: string };
  personDesc?: { value: string };
  related?: { value: string };
  relatedLabel?: { value: string };
  relatedDesc?: { value: string };
  prop?: { value: string };
  propLabel?: { value: string };
  hop1?: { value: string };
}

interface NetworkNode {
  id: string;
  qid: string;
  label: string;
  type: string;
  description: string;
}

interface NetworkEdge {
  source: string;
  target: string;
  relationship: string;
}

function buildPersonSearchQuery(name: string): string {
  // Search for the person by label, filtering to instances of human (Q5)
  const escaped = name.replace(/"/g, '\\"');
  return `
SELECT ?person ?personLabel ?personDesc WHERE {
  SERVICE wikibase:mquery {
    bd:serviceParam wikibase:searchQuery "${escaped}" .
    bd:serviceParam wikibase:searchLanguage "en" .
    bd:serviceParam wikibase:limit 5 .
    ?person wikibase:apiResult "true" .
  }
  ?person wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 5`.trim();
}

function buildRelationshipQuery(
  personQid: string,
  relTypes: string[],
  maxNodes: number,
): string {
  // Gather all property IDs we want to query
  const allProps: string[] = [];
  for (const rt of relTypes) {
    const mapping = RELATIONSHIP_PROPERTIES[rt];
    if (mapping) {
      allProps.push(...mapping.props);
    }
  }

  if (allProps.length === 0) {
    // "all" was selected or no valid types — use all properties
    for (const mapping of Object.values(RELATIONSHIP_PROPERTIES)) {
      allProps.push(...mapping.props);
    }
  }

  // Deduplicate
  const uniqueProps = [...new Set(allProps)];

  // Build UNION clauses for each property
  const unionClauses = uniqueProps.map((prop) => {
    return `{ wd:${personQid} wdt:${prop} ?related . BIND(wdt:${prop} AS ?prop) }
    UNION
    { ?related wdt:${prop} wd:${personQid} . BIND(wdt:${prop} AS ?prop) }`;
  }).join("\n    UNION\n    ");

  // For employer/education properties, also find others at the same institution
  const sharedInstitutionClauses: string[] = [];
  if (uniqueProps.includes("P108")) {
    sharedInstitutionClauses.push(`{
      wd:${personQid} wdt:P108 ?org .
      ?related wdt:P108 ?org .
      FILTER(?related != wd:${personQid})
      BIND(wdt:P108 AS ?prop)
    }`);
  }
  if (uniqueProps.includes("P69")) {
    sharedInstitutionClauses.push(`{
      wd:${personQid} wdt:P69 ?school .
      ?related wdt:P69 ?school .
      FILTER(?related != wd:${personQid})
      ?related wdt:P31 wd:Q5 .
      BIND(wdt:P69 AS ?prop)
    }`);
  }

  const allUnions = sharedInstitutionClauses.length > 0
    ? unionClauses + "\n    UNION\n    " + sharedInstitutionClauses.join("\n    UNION\n    ")
    : unionClauses;

  return `
SELECT DISTINCT ?related ?relatedLabel ?relatedDesc ?prop WHERE {
  {
    ${allUnions}
  }
  ?related wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${maxNodes}`.trim();
}

function buildDepth2Query(
  qids: string[],
  relTypes: string[],
  maxNodes: number,
): string {
  // Get relationships of first-hop people
  const allProps: string[] = [];
  for (const rt of relTypes) {
    const mapping = RELATIONSHIP_PROPERTIES[rt];
    if (mapping) {
      allProps.push(...mapping.props);
    }
  }
  if (allProps.length === 0) {
    for (const mapping of Object.values(RELATIONSHIP_PROPERTIES)) {
      allProps.push(...mapping.props);
    }
  }
  const uniqueProps = [...new Set(allProps)];

  // Build VALUES clause for the first-hop QIDs
  const valuesClause = qids.map((q) => `wd:${q}`).join(" ");

  const unionClauses = uniqueProps.map((prop) => {
    return `{ ?hop1 wdt:${prop} ?related . BIND(wdt:${prop} AS ?prop) }
    UNION
    { ?related wdt:${prop} ?hop1 . BIND(wdt:${prop} AS ?prop) }`;
  }).join("\n    UNION\n    ");

  return `
SELECT DISTINCT ?hop1 ?related ?relatedLabel ?relatedDesc ?prop WHERE {
  VALUES ?hop1 { ${valuesClause} }
  {
    ${unionClauses}
  }
  ?related wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${maxNodes}`.trim();
}

async function sparqlQuery(query: string): Promise<WikidataBinding[]> {
  const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "Accept": "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new Error("Wikidata rate limit reached. Please wait a moment and try again.");
    }
    throw new Error(`Wikidata SPARQL error (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json() as { results: { bindings: WikidataBinding[] } };
  return json.results.bindings;
}

function extractQid(uri: string): string {
  // Extract Q-number from Wikidata URI like http://www.wikidata.org/entity/Q937
  const match = uri.match(/Q\d+$/);
  return match ? match[0] : uri;
}

function propToRelationship(propUri: string): string {
  const prop = propUri.replace("http://www.wikidata.org/prop/direct/", "");
  switch (prop) {
    case "P26": return "spouse";
    case "P40": return "child";
    case "P22": return "father";
    case "P25": return "mother";
    case "P737": return "influenced_by";
    case "P1327": return "business_partner";
    case "P69": return "educated_at_same";
    case "P108": return "worked_at_same";
    case "P800": return "collaborator";
    default: return "related";
  }
}

function sanitizeId(label: string): string {
  // Create a valid ID from a label: lowercase, replace spaces with underscores, remove special chars
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

export async function flowFamousNetwork(input: FamousNetworkInput): Promise<FamousNetworkResult> {
  const { person } = input;
  const depth = input.depth ?? 1;
  const maxNodes = Math.min(Math.max(input.max_nodes ?? 50, 5), 200);
  const relTypes = input.relationship_types?.includes("all")
    ? Object.keys(RELATIONSHIP_PROPERTIES)
    : (input.relationship_types ?? Object.keys(RELATIONSHIP_PROPERTIES));

  // Step 1: Find the person on Wikidata
  const searchQuery = buildPersonSearchQuery(person);
  let searchResults: WikidataBinding[];
  try {
    searchResults = await sparqlQuery(searchQuery);
  } catch (err) {
    throw new Error(
      `Failed to search Wikidata for "${person}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (searchResults.length === 0) {
    throw new Error(
      `Person "${person}" not found on Wikidata. Try:\n` +
      `- Full name (e.g., "Albert Einstein" instead of "Einstein")\n` +
      `- Different spelling or transliteration\n` +
      `- Adding a qualifier (e.g., "Marie Curie physicist")`
    );
  }

  const centerResult = searchResults[0];
  const centerUri = centerResult.person?.value ?? "";
  const centerQid = extractQid(centerUri);
  const centerLabel = centerResult.personLabel?.value ?? person;
  const centerDesc = centerResult.personDesc?.value ?? "";

  // Step 2: Get relationships from center person
  const relQuery = buildRelationshipQuery(centerQid, relTypes, maxNodes);
  let relResults: WikidataBinding[];
  try {
    relResults = await sparqlQuery(relQuery);
  } catch (err) {
    throw new Error(
      `Failed to fetch relationships for "${centerLabel}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Build node and edge maps
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const centerId = sanitizeId(centerLabel);

  // Add center person
  nodes.set(centerId, {
    id: centerId,
    qid: centerQid,
    label: centerLabel,
    type: "center",
    description: centerDesc,
  });

  // Track QIDs for depth-2 expansion
  const hop1Qids: string[] = [];

  for (const binding of relResults) {
    const relUri = binding.related?.value ?? "";
    const relQid = extractQid(relUri);
    const relLabel = binding.relatedLabel?.value ?? relQid;
    const relDesc = binding.relatedDesc?.value ?? "";
    const propUri = binding.prop?.value ?? "";
    const relationship = propToRelationship(propUri);

    const nodeId = sanitizeId(relLabel);
    if (nodeId === centerId || nodeId === "") continue;

    if (!nodes.has(nodeId)) {
      nodes.set(nodeId, {
        id: nodeId,
        qid: relQid,
        label: relLabel,
        type: relationship,
        description: relDesc,
      });
      hop1Qids.push(relQid);
    }

    edges.push({
      source: centerId,
      target: nodeId,
      relationship,
    });
  }

  // Step 3: Depth 2 — follow relationships from first-hop people
  if (depth === 2 && hop1Qids.length > 0) {
    const remaining = maxNodes - nodes.size;
    if (remaining > 0) {
      // Take at most 20 first-hop nodes for depth-2 (to avoid huge queries)
      const hop1Subset = hop1Qids.slice(0, 20);
      try {
        const depth2Query = buildDepth2Query(hop1Subset, relTypes, remaining);
        const depth2Results = await sparqlQuery(depth2Query);

        // Build a QID → nodeId map for first-hop nodes
        const qidToNodeId = new Map<string, string>();
        for (const [nid, node] of nodes) {
          qidToNodeId.set(node.qid, nid);
        }

        for (const binding of depth2Results) {
          if (nodes.size >= maxNodes) break;

          const hop1Qid = binding.hop1 ? extractQid(binding.hop1.value) : "";
          const relUri = binding.related?.value ?? "";
          const relQid = extractQid(relUri);
          const relLabel = binding.relatedLabel?.value ?? relQid;
          const relDesc = binding.relatedDesc?.value ?? "";
          const propUri = binding.prop?.value ?? "";
          const relationship = propToRelationship(propUri);

          const sourceNodeId = qidToNodeId.get(hop1Qid);
          if (!sourceNodeId) continue;

          const nodeId = sanitizeId(relLabel);
          if (nodeId === "" || nodeId === centerId) continue;

          if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
              id: nodeId,
              qid: relQid,
              label: relLabel,
              type: relationship,
              description: relDesc,
            });
          }

          edges.push({
            source: sourceNodeId,
            target: nodeId,
            relationship,
          });
        }
      } catch {
        // Depth-2 is best-effort — don't fail the whole query
      }
    }
  }

  // Handle case where no relationships were found
  if (nodes.size <= 1) {
    const triedTypes = relTypes.join(", ");
    throw new Error(
      `No relationships found for "${centerLabel}" (${centerQid}) with types: ${triedTypes}.\n` +
      `Try:\n` +
      `- relationship_types: ["all"] to search all relationship types\n` +
      `- A more well-known figure (Wikidata coverage varies)\n` +
      `- depth: 2 to expand the search radius`
    );
  }

  // Step 4: Build adjacency for connections column
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes.values()) {
    adjacency.set(node.id, new Set<string>());
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  // Step 5: Build relationship breakdown
  const breakdown: Record<string, number> = {};
  for (const edge of edges) {
    breakdown[edge.relationship] = (breakdown[edge.relationship] ?? 0) + 1;
  }

  // Step 6: Notable connections (top edges involving center)
  const notableConnections: string[] = [];
  for (const edge of edges) {
    if (edge.source === centerId || edge.target === centerId) {
      const other = edge.source === centerId ? edge.target : edge.source;
      const otherNode = nodes.get(other);
      if (otherNode) {
        notableConnections.push(`${centerLabel} → ${edge.relationship} → ${otherNode.label}`);
      }
    }
  }
  // Limit to 10 notable connections
  const topNotable = notableConnections.slice(0, 10);

  // Step 7: Build CSV
  const header = "id,connections,label,type,description,relationship";
  const rows: string[] = [header];

  for (const node of nodes.values()) {
    const connections = adjacency.get(node.id);
    const connectionsStr = connections && connections.size > 0
      ? [...connections].join("|")
      : "";
    rows.push([
      csvEscapeField(node.id),
      csvEscapeField(connectionsStr),
      csvEscapeField(node.label),
      csvEscapeField(node.type),
      csvEscapeField(node.description),
      csvEscapeField(node.type === "center" ? "center" : node.type),
    ].join(","));
  }

  const csv = rows.join("\n");

  // Step 8: Narrative hook
  const totalNodes = nodes.size;
  const totalEdges = edges.length;
  const topRelType = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0];
  const relSummary = topRelType
    ? `dominated by ${topRelType[0]} connections (${topRelType[1]})`
    : "with diverse relationship types";

  const narrativeHook = `${centerLabel}'s network reveals ${totalNodes} connected people and ${totalEdges} relationships, ${relSummary}. ${centerDesc ? centerDesc + "." : ""} Explore this web of connections in 3D to discover hidden clusters and unexpected bridges between domains.`;

  return {
    csv,
    center_person: centerLabel,
    center_description: centerDesc,
    nodes: totalNodes,
    edges: totalEdges,
    relationship_breakdown: breakdown,
    notable_connections: topNotable,
    narrative_hook: narrativeHook,
    suggested_template: "Network",
    wikidata_query: relQuery,
  };
}

// ============================================================================
// TOOL: flow_guided_tour
// Generate a scripted walkthrough of a 3D visualization — step-by-step
// narrated exploration like a museum audio guide for your data.
// ============================================================================

export interface GuidedTourInput {
  csv: string;
  /** Column to use as node/row identifier */
  id_column?: string;
  /** Number of tour stops (default 5, max 10) */
  stops?: number;
  /** Tour focus: what aspect to explore */
  focus?: "outliers" | "clusters" | "connections" | "trends" | "overview";
}

export interface TourStop {
  step: number;
  title: string;
  target: string;
  target_values: Record<string, string | number>;
  narration: string;
  camera_hint: string;
  highlight_columns: string[];
  transition: string;
}

export interface GuidedTourResult {
  title: string;
  introduction: string;
  stops: TourStop[];
  conclusion: string;
  total_duration_hint: string;
  suggested_template: string;
}

// ============================================================================
// Guided tour: internal helpers
// ============================================================================

interface GTColumnMeta {
  name: string;
  index: number;
  isNumeric: boolean;
  isConnection: boolean;
  isTemporal: boolean;
  values: string[];
  numericValues: number[];
  mean: number;
  stddev: number;
  min: number;
  max: number;
}

function gtAnalyzeColumns(headers: string[], rows: string[][]): GTColumnMeta[] {
  return headers.map((name, index) => {
    const values = rows.map(r => r[index] ?? "");
    const numericValues: number[] = [];
    for (const v of values) {
      const n = Number(v);
      if (v !== "" && !isNaN(n)) numericValues.push(n);
    }
    const isNumeric = numericValues.length >= Math.max(1, values.length * 0.5);
    const isConnection = /connect|link|edge|pipe/i.test(name) ||
      values.some(v => v.includes("|"));
    const isTemporal = /date|time|year|month|day|timestamp|period/i.test(name) ||
      values.slice(0, 5).some(v => /\d{4}[-/]\d{1,2}/.test(v));

    const n = numericValues.length;
    const mean = n > 0 ? numericValues.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 0 ? numericValues.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
    const stddev = Math.sqrt(variance);
    const min = n > 0 ? Math.min(...numericValues) : 0;
    const max = n > 0 ? Math.max(...numericValues) : 0;

    return { name, index, isNumeric, isConnection, isTemporal, values, numericValues, mean, stddev, min, max };
  });
}

function gtDetectIdColumn(headers: string[], columns: GTColumnMeta[], userSpecified?: string): number {
  if (userSpecified) {
    const idx = headers.indexOf(userSpecified);
    if (idx !== -1) return idx;
    const lower = userSpecified.toLowerCase();
    const found = headers.findIndex(h => h.toLowerCase() === lower);
    if (found !== -1) return found;
  }
  const idIdx = headers.findIndex(h => /^id$/i.test(h));
  if (idIdx !== -1) return idIdx;
  const nameIdx = headers.findIndex(h => /^name$/i.test(h));
  if (nameIdx !== -1) return nameIdx;
  const firstString = columns.findIndex(c => !c.isNumeric);
  if (firstString !== -1) return firstString;
  return 0;
}

function gtZScore(value: number, mean: number, stddev: number): number {
  return stddev > 0 ? Math.abs((value - mean) / stddev) : 0;
}

function gtRowMaxZ(row: string[], numericCols: GTColumnMeta[]): { maxZ: number; col: GTColumnMeta; val: number } {
  let maxZ = 0;
  let bestCol = numericCols[0];
  let bestVal = 0;
  for (const col of numericCols) {
    const v = Number(row[col.index]);
    if (isNaN(v)) continue;
    const z = gtZScore(v, col.mean, col.stddev);
    if (z > maxZ) {
      maxZ = z;
      bestCol = col;
      bestVal = v;
    }
  }
  return { maxZ, col: bestCol, val: bestVal };
}

function gtSimpleClusters(rows: string[][], numericCols: GTColumnMeta[], k: number): { clusterId: number; center: number; members: number[]; dominantCol: GTColumnMeta }[] {
  if (numericCols.length === 0 || rows.length === 0) return [];
  const dominant = numericCols.reduce((best, c) => c.stddev > best.stddev ? c : best, numericCols[0]);
  const values = rows.map((r, i) => ({ val: Number(r[dominant.index]) || 0, idx: i }));
  values.sort((a, b) => a.val - b.val);

  const clusterSize = Math.ceil(values.length / k);
  const clusters: { clusterId: number; center: number; members: number[]; dominantCol: GTColumnMeta }[] = [];
  for (let c = 0; c < k; c++) {
    const members = values.slice(c * clusterSize, (c + 1) * clusterSize);
    if (members.length === 0) continue;
    const center = members.reduce((a, b) => a + b.val, 0) / members.length;
    clusters.push({ clusterId: c, center, members: members.map(m => m.idx), dominantCol: dominant });
  }
  return clusters;
}

// Creative title pools
const GT_OUTLIER_TITLES = [
  "The Outlier Everyone Missed",
  "The Hidden Giant",
  "Off the Charts",
  "The Anomaly",
  "The Exception That Proves the Rule",
  "Standing Apart",
  "The Extreme Case",
  "Breaking the Pattern",
  "The Statistical Rebel",
  "Where Numbers Defy Expectations",
];

const GT_CLUSTER_TITLES = [
  "Where Two Worlds Meet",
  "The Dense Core",
  "The Heart of the Cluster",
  "A Constellation Forms",
  "The Gravity Well",
  "Birds of a Feather",
  "The Natural Grouping",
  "The Neighborhood",
  "Center of Mass",
  "The Convergence Point",
];

const GT_CONNECTION_TITLES = [
  "The Hub",
  "The Bridge Between Worlds",
  "The Most Connected",
  "The Lonely Island",
  "The Shortest Path",
  "The Social Butterfly",
  "The Gatekeeper",
  "The Network Backbone",
  "Where All Roads Lead",
  "The Isolated Node",
];

const GT_TREND_TITLES = [
  "The Turning Point",
  "The Peak",
  "The Valley",
  "The Steepest Climb",
  "The Sharpest Decline",
  "When Everything Changed",
  "The Inflection Point",
  "The Moment of Acceleration",
  "The Plateau",
  "The Breakout",
];

const GT_CAMERA_HINTS = ["zoom_in", "pan_right", "orbit", "zoom_out", "fly_to"];

const GT_TRANSITIONS = [
  "Now let's look at something unexpected...",
  "But that's not the whole story...",
  "From here, the data tells us something surprising...",
  "Let's shift our perspective...",
  "There's a pattern emerging if we look over here...",
  "Contrast this with what lies on the other side...",
  "Moving deeper into the data...",
  "Now watch what happens when we turn our attention to...",
  "The real surprise is waiting just around the corner...",
  "And this is where it gets interesting...",
];

function gtPickTitle(pool: string[], index: number): string {
  return pool[index % pool.length];
}

function gtGetTargetValues(row: string[], headers: string[], highlightCols: GTColumnMeta[]): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const col of highlightCols) {
    const raw = row[col.index] ?? "";
    const num = Number(raw);
    result[col.name] = (!isNaN(num) && raw !== "") ? num : raw;
  }
  return result;
}

// ============================================================================
// Guided tour: focus strategies
// ============================================================================

function gtFindOutlierStops(rows: string[][], columns: GTColumnMeta[], headers: string[], idColIdx: number, maxStops: number): TourStop[] {
  const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);
  if (numericCols.length === 0) return [];

  const scored = rows.map((row, i) => ({
    row,
    idx: i,
    ...gtRowMaxZ(row, numericCols),
  }));
  scored.sort((a, b) => b.maxZ - a.maxZ);

  const stops: TourStop[] = [];
  const used = new Set<number>();

  for (const item of scored) {
    if (stops.length >= maxStops) break;
    if (used.has(item.idx)) continue;
    used.add(item.idx);

    const id = item.row[idColIdx] ?? `Row ${item.idx + 1}`;
    const direction = item.val > item.col.mean ? "above" : "below";
    const highlightCols = [item.col, ...numericCols.filter(c => c !== item.col).slice(0, 2)];

    stops.push({
      step: stops.length + 1,
      title: gtPickTitle(GT_OUTLIER_TITLES, stops.length),
      target: id,
      target_values: gtGetTargetValues(item.row, headers, highlightCols),
      narration: `This point stands ${direction} the average by ${item.maxZ.toFixed(1)} standard deviations in ${item.col.name}. With a value of ${item.val}, it sits far from the mean of ${item.col.mean.toFixed(1)}. This is the kind of data point that reshapes conclusions.`,
      camera_hint: GT_CAMERA_HINTS[stops.length % GT_CAMERA_HINTS.length],
      highlight_columns: highlightCols.map(c => c.name),
      transition: GT_TRANSITIONS[stops.length % GT_TRANSITIONS.length],
    });
  }
  return stops;
}

function gtFindClusterStops(rows: string[][], columns: GTColumnMeta[], headers: string[], idColIdx: number, maxStops: number): TourStop[] {
  const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);
  if (numericCols.length === 0) return [];

  const k = Math.min(Math.max(maxStops, 2), rows.length);
  const clusters = gtSimpleClusters(rows, numericCols, k);

  const stops: TourStop[] = [];
  for (const cluster of clusters) {
    if (stops.length >= maxStops) break;

    let bestIdx = cluster.members[0];
    let bestDist = Infinity;
    for (const mIdx of cluster.members) {
      const val = Number(rows[mIdx][cluster.dominantCol.index]) || 0;
      const dist = Math.abs(val - cluster.center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = mIdx;
      }
    }

    const row = rows[bestIdx];
    const id = row[idColIdx] ?? `Row ${bestIdx + 1}`;
    const highlightCols = [cluster.dominantCol, ...numericCols.filter(c => c !== cluster.dominantCol).slice(0, 2)];

    stops.push({
      step: stops.length + 1,
      title: gtPickTitle(GT_CLUSTER_TITLES, stops.length),
      target: id,
      target_values: gtGetTargetValues(row, headers, highlightCols),
      narration: `This cluster of ${cluster.members.length} points centers around ${cluster.dominantCol.name} = ${cluster.center.toFixed(1)}. "${id}" sits at the heart of this group, representing the typical member. ${cluster.members.length > 3 ? "The density here suggests a natural grouping in the data." : "A small but distinct group."}`,
      camera_hint: GT_CAMERA_HINTS[stops.length % GT_CAMERA_HINTS.length],
      highlight_columns: highlightCols.map(c => c.name),
      transition: GT_TRANSITIONS[stops.length % GT_TRANSITIONS.length],
    });
  }
  return stops;
}

function gtFindConnectionStops(rows: string[][], columns: GTColumnMeta[], headers: string[], idColIdx: number, maxStops: number): TourStop[] {
  const connCol = columns.find(c => c.isConnection);
  if (!connCol) return [];

  const connCounts = rows.map((row, i) => {
    const val = row[connCol.index] ?? "";
    const connections = val.split("|").filter(s => s.trim() !== "");
    return { row, idx: i, count: connections.length, connections };
  });

  const byConnections = [...connCounts].sort((a, b) => b.count - a.count);

  const stops: TourStop[] = [];
  const used = new Set<number>();

  const halfStops = Math.ceil(maxStops / 2);
  for (const item of byConnections) {
    if (stops.length >= halfStops) break;
    if (used.has(item.idx)) continue;
    used.add(item.idx);

    const id = item.row[idColIdx] ?? `Row ${item.idx + 1}`;
    const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);
    const highlightCols = [connCol, ...numericCols.slice(0, 2)];

    stops.push({
      step: stops.length + 1,
      title: gtPickTitle(GT_CONNECTION_TITLES, stops.length),
      target: id,
      target_values: { ...gtGetTargetValues(item.row, headers, highlightCols), _connections: item.count },
      narration: `"${id}" connects to ${item.count} other nodes: ${item.connections.slice(0, 3).join(", ")}${item.connections.length > 3 ? ` and ${item.connections.length - 3} more` : ""}. In a 3D network, this is a gravitational center — pulling its neighbors close.`,
      camera_hint: GT_CAMERA_HINTS[stops.length % GT_CAMERA_HINTS.length],
      highlight_columns: [connCol.name, ...numericCols.slice(0, 2).map(c => c.name)],
      transition: GT_TRANSITIONS[stops.length % GT_TRANSITIONS.length],
    });
  }

  const byLeast = [...connCounts].sort((a, b) => a.count - b.count);
  for (const item of byLeast) {
    if (stops.length >= maxStops) break;
    if (used.has(item.idx)) continue;
    used.add(item.idx);

    const id = item.row[idColIdx] ?? `Row ${item.idx + 1}`;
    const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);
    const highlightCols = [connCol, ...numericCols.slice(0, 2)];

    stops.push({
      step: stops.length + 1,
      title: item.count === 0 ? "The Lonely Island" : "The Quiet Node",
      target: id,
      target_values: { ...gtGetTargetValues(item.row, headers, highlightCols), _connections: item.count },
      narration: item.count === 0
        ? `"${id}" is completely isolated — no connections at all. In a 3D force-directed layout, it drifts to the edges. Why is it disconnected? That's often the most interesting question.`
        : `"${id}" has only ${item.count} connection${item.count === 1 ? "" : "s"}. In a network, the periphery tells a different story than the center.`,
      camera_hint: GT_CAMERA_HINTS[stops.length % GT_CAMERA_HINTS.length],
      highlight_columns: [connCol.name, ...numericCols.slice(0, 2).map(c => c.name)],
      transition: GT_TRANSITIONS[stops.length % GT_TRANSITIONS.length],
    });
  }

  return stops;
}

function gtFindTrendStops(rows: string[][], columns: GTColumnMeta[], headers: string[], idColIdx: number, maxStops: number): TourStop[] {
  const temporalCol = columns.find(c => c.isTemporal);
  const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);
  if (numericCols.length === 0) return [];

  const dominant = numericCols.reduce((best, c) => c.stddev > best.stddev ? c : best, numericCols[0]);

  const values = rows.map((r, i) => ({
    val: Number(r[dominant.index]) || 0,
    idx: i,
    row: r,
  }));

  type InflectionType = "max" | "min" | "steepest_rise" | "steepest_fall" | "start" | "end";
  const inflections: { idx: number; type: InflectionType; val: number }[] = [];

  const maxRow = values.reduce((best, v) => v.val > best.val ? v : best, values[0]);
  inflections.push({ idx: maxRow.idx, type: "max", val: maxRow.val });

  const minRow = values.reduce((best, v) => v.val < best.val ? v : best, values[0]);
  inflections.push({ idx: minRow.idx, type: "min", val: minRow.val });

  if (values.length > 1) {
    let steepestRiseIdx = 0;
    let steepestRise = -Infinity;
    let steepestFallIdx = 0;
    let steepestFall = Infinity;
    for (let i = 1; i < values.length; i++) {
      const diff = values[i].val - values[i - 1].val;
      if (diff > steepestRise) {
        steepestRise = diff;
        steepestRiseIdx = i;
      }
      if (diff < steepestFall) {
        steepestFall = diff;
        steepestFallIdx = i;
      }
    }
    if (steepestRise > 0) {
      inflections.push({ idx: steepestRiseIdx, type: "steepest_rise", val: values[steepestRiseIdx].val });
    }
    if (steepestFall < 0) {
      inflections.push({ idx: steepestFallIdx, type: "steepest_fall", val: values[steepestFallIdx].val });
    }
  }

  inflections.push({ idx: 0, type: "start", val: values[0].val });
  inflections.push({ idx: values.length - 1, type: "end", val: values[values.length - 1].val });

  const seen = new Set<number>();
  const unique: typeof inflections = [];
  for (const inf of inflections) {
    if (!seen.has(inf.idx)) {
      seen.add(inf.idx);
      unique.push(inf);
    }
  }

  const stops: TourStop[] = [];
  const titleMap: Record<InflectionType, number> = { max: 1, min: 2, steepest_rise: 3, steepest_fall: 4, start: 0, end: 5 };

  for (const inf of unique) {
    if (stops.length >= maxStops) break;
    const row = rows[inf.idx];
    const id = row[idColIdx] ?? `Row ${inf.idx + 1}`;
    const timeLabel = temporalCol ? row[temporalCol.index] : `Position ${inf.idx + 1}`;
    const highlightCols = temporalCol ? [dominant, temporalCol] : [dominant, ...numericCols.filter(c => c !== dominant).slice(0, 1)];

    const narrationMap: Record<InflectionType, string> = {
      max: `At ${timeLabel}, ${dominant.name} reaches its peak of ${inf.val}. This is the highest point in the entire dataset — the moment of greatest magnitude.`,
      min: `Here at ${timeLabel}, ${dominant.name} drops to its lowest: ${inf.val}. The trough reveals the other extreme of the data's range.`,
      steepest_rise: `Between ${timeLabel} and the previous point, ${dominant.name} surges upward — the steepest climb in the dataset. Something changed dramatically here.`,
      steepest_fall: `At ${timeLabel}, ${dominant.name} plunges sharply — the steepest decline in the data. This sudden drop demands explanation.`,
      start: `We begin at ${timeLabel} with ${dominant.name} = ${inf.val}. This is our baseline — remember this number as the tour unfolds.`,
      end: `We arrive at ${timeLabel} with ${dominant.name} = ${inf.val}. Compare this to where we started — the journey of the data is now visible.`,
    };

    stops.push({
      step: stops.length + 1,
      title: gtPickTitle(GT_TREND_TITLES, titleMap[inf.type]),
      target: id,
      target_values: gtGetTargetValues(row, headers, highlightCols),
      narration: narrationMap[inf.type],
      camera_hint: GT_CAMERA_HINTS[stops.length % GT_CAMERA_HINTS.length],
      highlight_columns: highlightCols.map(c => c.name),
      transition: GT_TRANSITIONS[stops.length % GT_TRANSITIONS.length],
    });
  }

  return stops;
}

function gtFindOverviewStops(rows: string[][], columns: GTColumnMeta[], headers: string[], idColIdx: number, maxStops: number): TourStop[] {
  const connCol = columns.find(c => c.isConnection);
  const temporalCol = columns.find(c => c.isTemporal);
  const numericCols = columns.filter(c => c.isNumeric && c.index !== idColIdx);

  const stops: TourStop[] = [];
  const allocated = Math.max(1, Math.floor(maxStops / 4));

  const outlierStops = gtFindOutlierStops(rows, columns, headers, idColIdx, allocated);
  stops.push(...outlierStops);

  const clusterStops = gtFindClusterStops(rows, columns, headers, idColIdx, allocated);
  stops.push(...clusterStops);

  if (connCol) {
    const connectionStops = gtFindConnectionStops(rows, columns, headers, idColIdx, allocated);
    stops.push(...connectionStops);
  }

  if (temporalCol && numericCols.length > 0) {
    const trendStops = gtFindTrendStops(rows, columns, headers, idColIdx, Math.max(1, maxStops - stops.length));
    stops.push(...trendStops);
  }

  if (stops.length < maxStops) {
    const moreOutliers = gtFindOutlierStops(rows, columns, headers, idColIdx, maxStops);
    for (const s of moreOutliers) {
      if (stops.length >= maxStops) break;
      if (!stops.some(existing => existing.target === s.target)) {
        stops.push(s);
      }
    }
  }

  const trimmed = stops.slice(0, maxStops);
  trimmed.forEach((s, i) => { s.step = i + 1; });
  return trimmed;
}

// ============================================================================
// Guided tour: template suggestion
// ============================================================================

function gtSuggestTemplate(columns: GTColumnMeta[]): string {
  const hasConnections = columns.some(c => c.isConnection);
  const hasGeo = columns.some(c => /lat|lon|latitude|longitude/i.test(c.name));
  const hasTemporal = columns.some(c => c.isTemporal);
  const numericCount = columns.filter(c => c.isNumeric).length;

  if (hasConnections) return "Network Graph";
  if (hasGeo) return "Geographic Map";
  if (hasTemporal && numericCount >= 1) return "Time Series";
  if (numericCount >= 3) return "3D Scatter";
  return "Point Cloud";
}

function gtGenerateTourTitle(focus: string, columns: GTColumnMeta[], rows: string[][]): string {
  const numericCols = columns.filter(c => c.isNumeric);
  const hasConnections = columns.some(c => c.isConnection);
  const rowCount = rows.length;

  switch (focus) {
    case "outliers":
      return numericCols.length > 0
        ? `Extremes in ${numericCols[0].name}: A ${rowCount}-Point Investigation`
        : `Finding the Outliers: ${rowCount} Data Points Examined`;
    case "clusters":
      return `A Tale of Clusters: Patterns in ${rowCount} Data Points`;
    case "connections":
      return hasConnections
        ? `The Network Map: Who Connects to Whom`
        : `Exploring Connections Across ${rowCount} Points`;
    case "trends":
      return `The Arc of Change: ${rowCount} Moments in Time`;
    case "overview":
    default:
      return `A Tour Through ${rowCount} Data Points`;
  }
}

// ============================================================================
// Guided tour: main export
// ============================================================================

export function flowGuidedTour(input: GuidedTourInput): GuidedTourResult {
  const { csv, id_column, focus = "overview" } = input;
  const maxStops = Math.min(Math.max(1, input.stops ?? 5), 10);

  const lines = csv.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  if (rows.length === 0) {
    throw new Error("CSV must have at least one data row");
  }

  const columns = gtAnalyzeColumns(headers, rows);
  const idColIdx = gtDetectIdColumn(headers, columns, id_column);

  let stops: TourStop[];
  switch (focus) {
    case "outliers":
      stops = gtFindOutlierStops(rows, columns, headers, idColIdx, maxStops);
      break;
    case "clusters":
      stops = gtFindClusterStops(rows, columns, headers, idColIdx, maxStops);
      break;
    case "connections":
      stops = gtFindConnectionStops(rows, columns, headers, idColIdx, maxStops);
      if (stops.length === 0) {
        stops = gtFindOverviewStops(rows, columns, headers, idColIdx, maxStops);
      }
      break;
    case "trends":
      stops = gtFindTrendStops(rows, columns, headers, idColIdx, maxStops);
      if (stops.length === 0) {
        stops = gtFindOverviewStops(rows, columns, headers, idColIdx, maxStops);
      }
      break;
    case "overview":
    default:
      stops = gtFindOverviewStops(rows, columns, headers, idColIdx, maxStops);
      break;
  }

  // Pad if fewer stops than requested
  if (stops.length < maxStops && stops.length < rows.length) {
    const moreStops = gtFindOverviewStops(rows, columns, headers, idColIdx, maxStops);
    for (const s of moreStops) {
      if (stops.length >= maxStops) break;
      if (!stops.some(existing => existing.target === s.target)) {
        stops.push({ ...s, step: stops.length + 1 });
      }
    }
  }

  const title = gtGenerateTourTitle(focus, columns, rows);
  const template = gtSuggestTemplate(columns);
  const numericCols = columns.filter(c => c.isNumeric);

  const introduction = `Welcome to your guided exploration of ${rows.length} data points across ${headers.length} dimensions. ${numericCols.length > 0 ? `The numeric landscape spans columns like ${numericCols.slice(0, 3).map(c => c.name).join(", ")}.` : ""} We'll visit ${stops.length} key locations in this 3D space, each revealing a different facet of your data's story. Best viewed as a ${template} in Flow Immersive.`;

  const conclusion = `That concludes our ${stops.length}-stop tour through the data. We've seen ${focus === "outliers" ? "the extremes that challenge assumptions" : focus === "clusters" ? "how the data naturally groups itself" : focus === "connections" ? "the network's hidden structure" : focus === "trends" ? "how values evolve over time" : "multiple facets of the dataset's structure"}. But there's more to explore — ${rows.length - stops.length} data points remain unvisited, each with its own story. Load this into Flow Immersive and the patterns we've described become spatial, tangible, and interactive.`;

  const minutes = Math.max(1, Math.round(stops.length * 0.4));
  const total_duration_hint = `~${minutes} minute${minutes > 1 ? "s" : ""}`;

  return {
    title,
    introduction,
    stops,
    conclusion,
    total_duration_hint,
    suggested_template: template,
  };
}
