import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// TOOL 22: flow_anomaly_detect
// ============================================================================

export interface AnomalyDetectInput {
  csv_content: string;
  numeric_columns?: string[];
  method?: "zscore" | "iqr" | "auto";
  threshold?: number;
  group_column?: string;
  output_mode?: "annotated" | "anomalies_only" | "summary";
}

export function flowAnomalyDetect(input: AnomalyDetectInput) {
  // Parse CSV
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least 1 data row");
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  // Detect numeric columns
  const numericCols = input.numeric_columns || headers.filter((_h, i) => {
    return rows.slice(0, 10).every(r => r[i] !== "" && !isNaN(Number(r[i])));
  });
  if (numericCols.length === 0) throw new Error("No numeric columns found");

  const threshold = input.threshold ?? 2.5;
  const method = input.method ?? "auto";

  // For each numeric column, compute stats
  const colStats = numericCols.map(col => {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found`);
    const values = rows.map(r => Number(r[idx])).filter(v => !isNaN(v));
    const n = values.length;
    if (n === 0) throw new Error(`Column "${col}" has no numeric values`);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    // Skewness for auto-detection
    const skewness = n > 2 && stddev > 0
      ? values.reduce((a, b) => a + ((b - mean) / stddev) ** 3, 0) / n
      : 0;

    // Choose method
    const useMethod = method === "auto"
      ? (Math.abs(skewness) < 1 ? "zscore" : "iqr")
      : method;

    return { col, idx, mean, stddev, q1, q3, iqr, skewness, useMethod };
  });

  // Score each row
  const anomalyScores: number[] = [];
  const anomalyReasons: string[][] = [];
  const isAnomaly: boolean[] = [];

  for (const row of rows) {
    let maxScore = 0;
    const reasons: string[] = [];

    for (const stat of colStats) {
      const val = Number(row[stat.idx]);
      if (isNaN(val)) continue;

      let score = 0;
      if (stat.useMethod === "zscore") {
        const z = stat.stddev > 0 ? Math.abs((val - stat.mean) / stat.stddev) : 0;
        score = z;
        if (z > threshold) {
          const dir = val > stat.mean ? "high" : "low";
          reasons.push(`${stat.col}: ${dir} (z=${z.toFixed(2)}, val=${val}, mean=${stat.mean.toFixed(2)})`);
        }
      } else {
        const lower = stat.q1 - threshold * stat.iqr;
        const upper = stat.q3 + threshold * stat.iqr;
        if (val < lower || val > upper) {
          const dist = val < lower
            ? (lower - val) / (stat.iqr || 1)
            : (val - upper) / (stat.iqr || 1);
          score = dist + threshold;
          const dir = val < lower ? "low" : "high";
          reasons.push(`${stat.col}: ${dir} (val=${val}, range=[${lower.toFixed(2)}, ${upper.toFixed(2)}])`);
        }
      }
      maxScore = Math.max(maxScore, score);
    }

    // Normalize score to 0-1 range
    const normalizedScore = Math.min(maxScore / (threshold * 2), 1);
    anomalyScores.push(normalizedScore);
    anomalyReasons.push(reasons);
    isAnomaly.push(reasons.length > 0);
  }

  const anomalyCount = isAnomaly.filter(Boolean).length;

  // Build output based on mode
  if (input.output_mode === "summary") {
    return {
      total_rows: rows.length,
      anomaly_count: anomalyCount,
      anomaly_rate: `${((anomalyCount / rows.length) * 100).toFixed(1)}%`,
      method_used: colStats.map(s => `${s.col}: ${s.useMethod}`).join(", "),
      by_column: colStats.map(stat => ({
        column: stat.col,
        anomalies: rows.filter((_r, i) => anomalyReasons[i].some(reason => reason.startsWith(stat.col))).length,
        method: stat.useMethod,
        stats: stat.useMethod === "zscore"
          ? { mean: stat.mean, stddev: stat.stddev, threshold: `|z| > ${threshold}` }
          : { q1: stat.q1, q3: stat.q3, iqr: stat.iqr, threshold: `${threshold}x IQR` },
      })),
    };
  }

  // Build annotated CSV
  const outHeaders = [...headers, "_anomaly_score", "_is_anomaly", "_anomaly_reasons"];
  const outRows = rows.map((row, i) => {
    if (input.output_mode === "anomalies_only" && !isAnomaly[i]) return null;
    return [
      ...row,
      anomalyScores[i].toFixed(4),
      isAnomaly[i] ? "true" : "false",
      anomalyReasons[i].join("; "),
    ];
  }).filter(Boolean) as string[][];

  const csvOut = [
    outHeaders.map(csvEscapeField).join(","),
    ...outRows.map(r => r.map(v => csvEscapeField(String(v))).join(",")),
  ].join("\n");

  return {
    csv: csvOut,
    summary: {
      total_rows: rows.length,
      anomaly_count: anomalyCount,
      anomaly_rate: `${((anomalyCount / rows.length) * 100).toFixed(1)}%`,
      by_column: colStats.map(stat => ({
        column: stat.col,
        anomalies: rows.filter((_r, i) => anomalyReasons[i].some(reason => reason.startsWith(stat.col))).length,
        method: stat.useMethod,
      })),
    },
    method_used: colStats[0]?.useMethod === "zscore"
      ? `Z-score with threshold ${threshold}`
      : `IQR with multiplier ${threshold}`,
    flow_mapping: {
      color_column: "_anomaly_score",
      size_column: "_anomaly_score",
      instructions: "Map _anomaly_score to Color and Size axes. Anomalies will appear as large, brightly colored points.",
    },
  };
}

// ============================================================================
// TOOL 20: flow_time_series_animate
// ============================================================================

export interface TimeSeriesAnimateInput {
  csv_content: string;
  time_column: string;
  value_columns?: string[];
  group_column?: string;
  frame_count?: number;
  interpolation?: "linear" | "step" | "none";
  aggregation?: "mean" | "sum" | "min" | "max" | "last";
  cumulative?: boolean;
}

/** Try parsing a value as a Date. Returns epoch ms or NaN. */
function parseDate(val: string): number {
  const trimmed = val.trim();
  if (!trimmed) return NaN;

  // ISO 8601 or standard date string
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.getTime();

  // Unix timestamp (seconds): number > 1e9 (after ~2001)
  const num = Number(trimmed);
  if (!isNaN(num) && num > 1e9 && num < 1e13) return num * 1000;
  // Unix timestamp ms
  if (!isNaN(num) && num >= 1e13) return num;

  // Year-only (4-digit number)
  if (/^\d{4}$/.test(trimmed)) return new Date(`${trimmed}-01-01`).getTime();

  // MM/DD/YYYY
  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const d2 = new Date(`${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`);
    if (!isNaN(d2.getTime())) return d2.getTime();
  }

  return NaN;
}

function formatTimeLabel(epochMs: number): string {
  const d = new Date(epochMs);
  // If it looks like a year-only (Jan 1 00:00:00), show just year
  if (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0) {
    return String(d.getFullYear());
  }
  return d.toISOString().split("T")[0];
}

export function flowTimeSeriesAnimate(input: TimeSeriesAnimateInput) {
  const lines = input.csv_content.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header + at least 1 data row");
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  const timeIdx = headers.indexOf(input.time_column);
  if (timeIdx === -1) throw new Error(`Time column "${input.time_column}" not found`);

  // Parse dates
  const parsedDates = rows.map(r => parseDate(r[timeIdx]));
  const validRows = rows.filter((_r, i) => !isNaN(parsedDates[i]));
  const validDates = parsedDates.filter(d => !isNaN(d));

  if (validRows.length === 0) throw new Error(`No valid dates found in column "${input.time_column}"`);

  // Detect value columns (numeric, excluding time column)
  const valueCols = input.value_columns || headers.filter((h, i) => {
    if (h === input.time_column) return false;
    if (input.group_column && h === input.group_column) return false;
    return validRows.slice(0, 10).every(r => r[i] !== "" && !isNaN(Number(r[i])));
  });

  const frameCount = Math.min(Math.max(input.frame_count ?? 50, 2), 200);
  const interpolation = input.interpolation ?? "linear";
  const aggregation = input.aggregation ?? "mean";
  const cumulative = input.cumulative ?? false;

  // Compute time range
  const minTime = Math.min(...validDates);
  const maxTime = Math.max(...validDates);
  const timeSpan = maxTime - minTime;

  if (timeSpan === 0) {
    // All same timestamp — single frame
    const outHeaders = [...headers, "_frame", "_time_label"];
    const outRows = validRows.map(r => [...r, "0", formatTimeLabel(minTime)]);
    const csvOut = [
      outHeaders.map(csvEscapeField).join(","),
      ...outRows.map(r => r.map(v => csvEscapeField(String(v))).join(",")),
    ].join("\n");
    return {
      csv: csvOut,
      frame_count: 1,
      time_range: { start: formatTimeLabel(minTime), end: formatTimeLabel(maxTime) },
      rows_output: outRows.length,
    };
  }

  // Assign each row to a frame bin
  const rowFrames = validDates.map(d => {
    const frac = (d - minTime) / timeSpan;
    return Math.min(Math.floor(frac * frameCount), frameCount - 1);
  });

  // Group by (group_column, frame)
  const groupIdx = input.group_column ? headers.indexOf(input.group_column) : -1;
  if (input.group_column && groupIdx === -1) {
    throw new Error(`Group column "${input.group_column}" not found`);
  }

  // Build frame boundaries (time label for each frame)
  const frameTimes: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    frameTimes.push(minTime + (f / (frameCount - 1)) * timeSpan);
  }

  interface FrameEntry {
    frame: number;
    group: string;
    values: Map<string, number[]>;
    otherCols: Map<string, string>; // last seen non-value cols
  }

  const frameMap = new Map<string, FrameEntry>();

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const frame = rowFrames[i];
    const group = groupIdx >= 0 ? row[groupIdx] : "__all__";
    const key = `${group}::${frame}`;

    if (!frameMap.has(key)) {
      frameMap.set(key, {
        frame,
        group,
        values: new Map(),
        otherCols: new Map(),
      });
    }
    const entry = frameMap.get(key)!;

    for (const vc of valueCols) {
      const vi = headers.indexOf(vc);
      if (vi === -1) continue;
      const v = Number(row[vi]);
      if (!isNaN(v)) {
        if (!entry.values.has(vc)) entry.values.set(vc, []);
        entry.values.get(vc)!.push(v);
      }
    }

    // Store last-seen values for non-value columns
    for (let c = 0; c < headers.length; c++) {
      if (c === timeIdx) continue;
      if (valueCols.includes(headers[c])) continue;
      if (c === groupIdx) continue;
      entry.otherCols.set(headers[c], row[c]);
    }
  }

  // Aggregate values within each frame
  function aggregate(values: number[]): number {
    if (values.length === 0) return NaN;
    switch (aggregation) {
      case "sum": return values.reduce((a, b) => a + b, 0);
      case "min": return Math.min(...values);
      case "max": return Math.max(...values);
      case "last": return values[values.length - 1];
      case "mean":
      default: return values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  // Collect all groups
  const groupSet = new Set<string>();
  for (const r of validRows) {
    groupSet.add(groupIdx >= 0 ? r[groupIdx] : "__all__");
  }
  const allGroups = Array.from(groupSet);

  // Build output rows
  const outHeaders: string[] = [];
  if (groupIdx >= 0) outHeaders.push(input.group_column!);
  outHeaders.push(...valueCols);
  // Add non-value, non-group, non-time columns
  const otherHeaders = headers.filter(h => {
    if (h === input.time_column) return false;
    if (valueCols.includes(h)) return false;
    if (input.group_column && h === input.group_column) return false;
    return true;
  });
  outHeaders.push(...otherHeaders);
  outHeaders.push("_frame", "_time_label");

  const outRows: string[][] = [];

  for (const group of allGroups) {
    const cumulativeAccum = new Map<string, number>();
    for (const vc of valueCols) cumulativeAccum.set(vc, 0);

    let lastValues = new Map<string, number>();
    let lastOtherCols = new Map<string, string>();

    for (let f = 0; f < frameCount; f++) {
      const key = `${group}::${f}`;
      const entry = frameMap.get(key);

      const rowOut: string[] = [];
      if (groupIdx >= 0) rowOut.push(group);

      if (entry) {
        for (const vc of valueCols) {
          const vals = entry.values.get(vc) || [];
          let agg = aggregate(vals);
          if (isNaN(agg) && interpolation !== "none") {
            agg = lastValues.get(vc) ?? NaN;
          }
          if (!isNaN(agg)) lastValues.set(vc, agg);
          if (cumulative && !isNaN(agg)) {
            cumulativeAccum.set(vc, (cumulativeAccum.get(vc) || 0) + agg);
            rowOut.push(String(cumulativeAccum.get(vc)!));
          } else {
            rowOut.push(isNaN(agg) ? "" : String(agg));
          }
        }
        // Other cols
        for (const h of otherHeaders) {
          const v = entry.otherCols.get(h) ?? lastOtherCols.get(h) ?? "";
          if (v) lastOtherCols.set(h, v);
          rowOut.push(v);
        }
      } else if (interpolation === "none") {
        // Skip frames with no data
        continue;
      } else {
        // Carry forward last values (step interpolation) or interpolate
        for (const vc of valueCols) {
          const lv = lastValues.get(vc);
          if (cumulative) {
            rowOut.push(lv !== undefined ? String(cumulativeAccum.get(vc)!) : "");
          } else {
            rowOut.push(lv !== undefined ? String(lv) : "");
          }
        }
        for (const h of otherHeaders) {
          rowOut.push(lastOtherCols.get(h) ?? "");
        }
      }

      rowOut.push(String(f));
      rowOut.push(formatTimeLabel(frameTimes[f]));
      outRows.push(rowOut);
    }
  }

  const csvOut = [
    outHeaders.map(csvEscapeField).join(","),
    ...outRows.map(r => r.map(v => csvEscapeField(String(v))).join(",")),
  ].join("\n");

  return {
    csv: csvOut,
    frame_count: frameCount,
    time_range: { start: formatTimeLabel(minTime), end: formatTimeLabel(maxTime) },
    groups: allGroups.length > 1 || allGroups[0] !== "__all__" ? allGroups : undefined,
    rows_output: outRows.length,
    flow_mapping: {
      animation_column: "_frame",
      label_column: "_time_label",
      instructions: "Map _frame to the Animation axis in Flow. Each frame advances the visualization through time. _time_label provides human-readable timestamps.",
    },
  };
}

// ============================================================================
// TOOL 21: flow_merge_datasets
// ============================================================================

export interface MergeDatasetsInput {
  datasets: Array<{ csv_content: string; label?: string }>;
  join_type?: "inner" | "left" | "outer" | "concatenate";
  join_columns?: string[];
  conflict_resolution?: "prefix" | "keep_first" | "keep_last";
  add_source_column?: boolean;
}

export function flowMergeDatasets(input: MergeDatasetsInput) {
  if (!input.datasets || input.datasets.length < 2) {
    throw new Error("At least 2 datasets are required");
  }

  const joinType = input.join_type ?? "inner";
  const conflictRes = input.conflict_resolution ?? "prefix";
  const addSource = input.add_source_column ?? true;

  // Parse all datasets
  const parsed = input.datasets.map((ds, idx) => {
    const lines = ds.csv_content.trim().split("\n");
    if (lines.length < 1) throw new Error(`Dataset ${idx + 1} is empty`);
    const headers = parseCSVLine(lines[0]);
    const rows = lines.length > 1 ? lines.slice(1).map(l => parseCSVLine(l)) : [];
    const label = ds.label || `dataset_${idx + 1}`;
    return { headers, rows, label };
  });

  // Concatenate mode: stack datasets vertically
  if (joinType === "concatenate") {
    // Union of all headers
    const allHeadersSet = new Set<string>();
    for (const ds of parsed) {
      for (const h of ds.headers) allHeadersSet.add(h);
    }
    const allHeaders = Array.from(allHeadersSet);
    if (addSource) allHeaders.push("_source");

    const outRows: string[][] = [];
    for (const ds of parsed) {
      for (const row of ds.rows) {
        const outRow: string[] = [];
        for (const h of allHeaders) {
          if (h === "_source") {
            outRow.push(ds.label);
            continue;
          }
          const idx = ds.headers.indexOf(h);
          outRow.push(idx >= 0 ? row[idx] : "");
        }
        outRows.push(outRow);
      }
    }

    const csvOut = [
      allHeaders.map(csvEscapeField).join(","),
      ...outRows.map(r => r.map(v => csvEscapeField(String(v))).join(",")),
    ].join("\n");

    return {
      csv: csvOut,
      join_type: "concatenate",
      rows_output: outRows.length,
      columns_output: allHeaders.length,
      datasets_merged: parsed.map(d => ({ label: d.label, rows: d.rows.length, columns: d.headers.length })),
    };
  }

  // For join operations, detect join columns
  let joinCols = input.join_columns;
  if (!joinCols || joinCols.length === 0) {
    // Auto-detect: shared column names across all datasets
    const headerSets = parsed.map(ds => new Set(ds.headers));
    const shared: string[] = [];
    for (const h of parsed[0].headers) {
      if (headerSets.every(s => s.has(h))) shared.push(h);
    }
    // Prefer columns named id, key, name
    const preferred = ["id", "key", "name"];
    const preferredShared = shared.filter(h => preferred.includes(h.toLowerCase()));
    joinCols = preferredShared.length > 0 ? preferredShared : shared;
    if (joinCols.length === 0) {
      throw new Error("No shared columns found for joining. Specify join_columns explicitly or use join_type='concatenate'.");
    }
  }

  // Validate join columns exist in all datasets
  for (const ds of parsed) {
    for (const jc of joinCols) {
      if (!ds.headers.includes(jc)) {
        throw new Error(`Join column "${jc}" not found in dataset "${ds.label}"`);
      }
    }
  }

  // Build composite join key
  function buildKey(row: string[], headers: string[]): string {
    return joinCols!.map(jc => {
      const idx = headers.indexOf(jc);
      return row[idx] ?? "";
    }).join("||");
  }

  // Build merged column list
  const mergedHeaders: string[] = [...joinCols];
  const colSources: Array<{ dsIdx: number; colIdx: number; header: string }> = [];

  for (let d = 0; d < parsed.length; d++) {
    const ds = parsed[d];
    for (let c = 0; c < ds.headers.length; c++) {
      const h = ds.headers[c];
      if (joinCols.includes(h)) continue; // join cols already included

      let outName = h;
      if (mergedHeaders.includes(h)) {
        if (conflictRes === "prefix") {
          // Also rename the existing column to include its source prefix
          const prevIdx = mergedHeaders.indexOf(h);
          const prevSource = colSources.find(cs => cs.header === h);
          if (prevIdx >= 0 && prevSource) {
            const prevLabel = parsed[prevSource.dsIdx].label;
            const prefixedPrev = `${prevLabel}_${h}`;
            mergedHeaders[prevIdx] = prefixedPrev;
            prevSource.header = prefixedPrev;
          }
          outName = `${ds.label}_${h}`;
        } else if (conflictRes === "keep_first") {
          continue; // skip this column, first dataset's version is kept
        } else {
          // keep_last: remove the previous one and add this one
          const prevIdx = mergedHeaders.indexOf(h);
          if (prevIdx >= 0) {
            mergedHeaders.splice(prevIdx, 1);
            const csIdx = colSources.findIndex(cs => cs.header === h);
            if (csIdx >= 0) colSources.splice(csIdx, 1);
          }
          outName = h;
        }
      }
      mergedHeaders.push(outName);
      colSources.push({ dsIdx: d, colIdx: c, header: outName });
    }
  }
  if (addSource) mergedHeaders.push("_source");

  // Build index for first dataset (left side)
  const leftIndex = new Map<string, string[][]>();
  for (const row of parsed[0].rows) {
    const key = buildKey(row, parsed[0].headers);
    if (!leftIndex.has(key)) leftIndex.set(key, []);
    leftIndex.get(key)!.push(row);
  }

  // For each additional dataset, build index
  const rightIndices: Array<Map<string, string[][]>> = [];
  for (let d = 1; d < parsed.length; d++) {
    const idx = new Map<string, string[][]>();
    for (const row of parsed[d].rows) {
      const key = buildKey(row, parsed[d].headers);
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(row);
    }
    rightIndices.push(idx);
  }

  // Collect all keys based on join type
  const allKeysSet = new Set<string>();
  leftIndex.forEach((_v, key) => allKeysSet.add(key));
  if (joinType === "outer") {
    for (const ri of rightIndices) {
      ri.forEach((_v, key) => allKeysSet.add(key));
    }
  }
  const allKeys = Array.from(allKeysSet);

  // Build output rows
  const outRows: string[][] = [];

  for (const key of allKeys) {
    const leftRows = leftIndex.get(key);

    if (joinType === "inner") {
      // Must exist in ALL datasets
      if (!leftRows) continue;
      const rightRowSets = rightIndices.map(ri => ri.get(key));
      if (rightRowSets.some(rs => !rs)) continue;

      // Cross-product of matching rows (simplification: just first match from each right)
      for (const lr of leftRows) {
        const outRow: string[] = [];
        // Join columns from left
        for (const jc of joinCols!) {
          const idx = parsed[0].headers.indexOf(jc);
          outRow.push(lr[idx] ?? "");
        }
        // Value columns
        for (const cs of colSources) {
          if (cs.dsIdx === 0) {
            outRow.push(lr[cs.colIdx] ?? "");
          } else {
            const rRows = rightRowSets[cs.dsIdx - 1];
            outRow.push(rRows && rRows[0] ? rRows[0][cs.colIdx] ?? "" : "");
          }
        }
        if (addSource) {
          const sources: string[] = [parsed[0].label];
          for (let d = 1; d < parsed.length; d++) {
            if (rightRowSets[d - 1]) sources.push(parsed[d].label);
          }
          outRow.push(sources.join("+"));
        }
        outRows.push(outRow);
      }
    } else if (joinType === "left") {
      if (!leftRows) continue;
      const rightRowSets = rightIndices.map(ri => ri.get(key));

      for (const lr of leftRows) {
        const outRow: string[] = [];
        for (const jc of joinCols!) {
          const idx = parsed[0].headers.indexOf(jc);
          outRow.push(lr[idx] ?? "");
        }
        for (const cs of colSources) {
          if (cs.dsIdx === 0) {
            outRow.push(lr[cs.colIdx] ?? "");
          } else {
            const rRows = rightRowSets[cs.dsIdx - 1];
            outRow.push(rRows && rRows[0] ? rRows[0][cs.colIdx] ?? "" : "");
          }
        }
        if (addSource) {
          const sources: string[] = [parsed[0].label];
          for (let d = 1; d < parsed.length; d++) {
            if (rightRowSets[d - 1]) sources.push(parsed[d].label);
          }
          outRow.push(sources.join("+"));
        }
        outRows.push(outRow);
      }
    } else {
      // outer: include all, fill missing with empty
      const leftRowsActual = leftRows || [joinCols!.map(() => key.split("||")).flat()];
      const rightRowSets = rightIndices.map(ri => ri.get(key));

      // If no left rows, fabricate a skeleton with key values
      const useLeft = leftRows ? leftRowsActual : [];
      if (useLeft.length === 0) {
        // Build skeleton row for left side
        const skeleton: string[] = new Array(parsed[0].headers.length).fill("");
        const keyParts = key.split("||");
        for (let k = 0; k < joinCols!.length; k++) {
          const idx = parsed[0].headers.indexOf(joinCols![k]);
          if (idx >= 0) skeleton[idx] = keyParts[k] ?? "";
        }
        useLeft.push(skeleton);
      }

      for (const lr of useLeft) {
        const outRow: string[] = [];
        for (const jc of joinCols!) {
          const idx = parsed[0].headers.indexOf(jc);
          outRow.push(lr[idx] ?? "");
        }
        for (const cs of colSources) {
          if (cs.dsIdx === 0) {
            outRow.push(leftRows ? lr[cs.colIdx] ?? "" : "");
          } else {
            const rRows = rightRowSets[cs.dsIdx - 1];
            outRow.push(rRows && rRows[0] ? rRows[0][cs.colIdx] ?? "" : "");
          }
        }
        if (addSource) {
          const sources: string[] = [];
          if (leftRows) sources.push(parsed[0].label);
          for (let d = 1; d < parsed.length; d++) {
            if (rightRowSets[d - 1]) sources.push(parsed[d].label);
          }
          outRow.push(sources.join("+"));
        }
        outRows.push(outRow);
      }
    }
  }

  const csvOut = [
    mergedHeaders.map(csvEscapeField).join(","),
    ...outRows.map(r => r.map(v => csvEscapeField(String(v))).join(",")),
  ].join("\n");

  return {
    csv: csvOut,
    join_type: joinType,
    join_columns: joinCols,
    rows_output: outRows.length,
    columns_output: mergedHeaders.length,
    datasets_merged: parsed.map(d => ({ label: d.label, rows: d.rows.length, columns: d.headers.length })),
    flow_mapping: addSource
      ? {
          color_column: "_source",
          instructions: "Map _source to Color to visually distinguish data origin.",
        }
      : undefined,
  };
}
