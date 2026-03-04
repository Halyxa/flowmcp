/**
 * Fog of War — stateful progressive disclosure for data exploration.
 *
 * Hides unexplored dimensions behind fog. As the user explores columns and rows,
 * the world gradually reveals itself. Reveal hints tease hidden dimensions with
 * real statistics. Network connections propagate visibility to adjacent nodes.
 *
 * "Like a JPG drawing in — the more you explore, the more you see."
 */

import { parseCSVLine, csvEscapeField, parseCsvToRows, normalizeCsvArgs } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface FogOfWarInput {
  csv_data: string;
  exploration_history?: {
    columns_viewed: string[];
    rows_viewed: number[];
  };
}

export interface RevealHint {
  hidden_column: string;
  tease: string;
  unlock_action: string;
}

export interface FogOfWarResult {
  fog_csv: string;
  visible_columns: string[];
  hidden_columns: string[];
  reveal_hints: RevealHint[];
  world_coverage: number;
}

// ============================================================================
// Internal helpers (prefixed with fog_)
// ============================================================================

interface FogColumnProfile {
  name: string;
  index: number;
  isNumeric: boolean;
  numericValues: number[];
  rawValues: string[];
  min: number;
  max: number;
  mean: number;
  std: number;
  uniqueCount: number;
}

function fog_profileColumns(headers: string[], rows: string[][]): FogColumnProfile[] {
  return headers.map((name, index) => {
    const rawValues = rows.map((r) => (r[index] ?? "").trim());
    const numericValues: number[] = [];
    let numericCount = 0;

    for (const v of rawValues) {
      if (v === "") continue;
      const n = Number(v);
      if (!isNaN(n)) {
        numericValues.push(n);
        numericCount++;
      }
    }

    const nonEmpty = rawValues.filter((v) => v !== "").length;
    const isNumeric = numericCount > 0 && numericCount >= nonEmpty * 0.7;

    const uniqueSet = new Set(rawValues.filter((v) => v !== ""));
    const uniqueCount = uniqueSet.size;

    let min = 0;
    let max = 0;
    let mean = 0;
    let std = 0;

    if (isNumeric && numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
      mean = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
      if (numericValues.length > 1) {
        const variance = numericValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (numericValues.length - 1);
        std = Math.sqrt(variance);
      }
    }

    return { name, index, isNumeric, numericValues, rawValues, min, max, mean, std, uniqueCount };
  });
}

function fog_pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

function fog_isIdColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "id" || lower.endsWith("_id") || lower === "key";
}

function fog_isConnectionsColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "connections" || lower === "edges" || lower === "links";
}

function fog_detectNetworkColumns(headers: string[]): { idCol: number; connCol: number } | null {
  let idCol = -1;
  let connCol = -1;
  for (let i = 0; i < headers.length; i++) {
    if (fog_isIdColumn(headers[i]) && idCol === -1) idCol = i;
    if (fog_isConnectionsColumn(headers[i]) && connCol === -1) connCol = i;
  }
  if (idCol >= 0 && connCol >= 0) return { idCol, connCol };
  return null;
}

/**
 * Parse pipe-delimited connections column and build adjacency map.
 * Returns map: rowIndex -> Set of connected rowIndices.
 */
function fog_buildAdjacency(rows: string[][], idCol: number, connCol: number): Map<number, Set<number>> {
  // Build id -> rowIndex map
  const idToRow = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const id = (rows[i][idCol] ?? "").trim();
    if (id !== "") idToRow.set(id, i);
  }

  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < rows.length; i++) {
    const connStr = (rows[i][connCol] ?? "").trim();
    if (connStr === "") continue;
    const connIds = connStr.split("|").map((s) => s.trim()).filter((s) => s !== "");
    const neighbors = new Set<number>();
    for (const cid of connIds) {
      const rowIdx = idToRow.get(cid);
      if (rowIdx !== undefined) neighbors.add(rowIdx);
    }
    adjacency.set(i, neighbors);
  }
  return adjacency;
}

/**
 * Determine which columns should be visible given exploration history.
 * Returns set of column names.
 */
function fog_computeVisibleColumns(
  headers: string[],
  profiles: FogColumnProfile[],
  columnsViewed: string[]
): Set<string> {
  if (columnsViewed.length === 0) {
    // Starter reveal: first 2 columns, plus id column if present
    const visible = new Set<string>();
    const idIdx = headers.findIndex((h) => fog_isIdColumn(h));
    if (idIdx >= 0) visible.add(headers[idIdx]);

    let added = 0;
    for (let i = 0; i < headers.length && added < 2; i++) {
      if (!visible.has(headers[i])) {
        visible.add(headers[i]);
        added++;
      }
    }
    // If we only have 1 column total and it's the id, still include it
    if (visible.size === 0 && headers.length > 0) {
      visible.add(headers[0]);
    }
    return visible;
  }

  // Start with explicitly viewed columns
  const visible = new Set<string>();
  for (const col of columnsViewed) {
    if (headers.includes(col)) visible.add(col);
  }

  // Always include id column if present
  const idIdx = headers.findIndex((h) => fog_isIdColumn(h));
  if (idIdx >= 0) visible.add(headers[idIdx]);

  // Reveal correlated columns: if a hidden numeric column has |r| >= 0.7 with
  // any viewed numeric column, reveal it
  const viewedProfiles = profiles.filter((p) => visible.has(p.name) && p.isNumeric);
  for (const hp of profiles) {
    if (visible.has(hp.name)) continue;
    if (!hp.isNumeric) continue;
    for (const vp of viewedProfiles) {
      const r = Math.abs(fog_pearsonCorrelation(vp.numericValues, hp.numericValues));
      if (r >= 0.7) {
        visible.add(hp.name);
        break;
      }
    }
  }

  return visible;
}

/**
 * Compute per-row visibility level (0-4).
 */
function fog_computeRowVisibility(
  rows: string[][],
  rowsViewed: number[],
  visibleColumns: Set<string>,
  allColumns: string[],
  adjacency: Map<number, Set<number>> | null
): number[] {
  const rowViewedSet = new Set(rowsViewed);
  const totalCols = allColumns.length;
  const visibleColCount = visibleColumns.size;
  const allVisible = visibleColCount >= totalCols;

  // Compute which rows are adjacent to viewed rows via network
  const adjacentToViewed = new Set<number>();
  if (adjacency) {
    for (const viewedRow of rowsViewed) {
      const neighbors = adjacency.get(viewedRow);
      if (neighbors) {
        for (const n of neighbors) adjacentToViewed.add(n);
      }
    }
  }

  const visibility: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rowViewedSet.has(i)) {
      // Row viewed
      if (allVisible) {
        visibility.push(4); // row viewed + all columns explored
      } else {
        visibility.push(3); // row viewed but not all columns
      }
    } else if (adjacentToViewed.has(i)) {
      visibility.push(1); // adjacent to explored via network
    } else if (visibleColCount > 0 && rowsViewed.length > 0) {
      // Columns are being explored but this specific row hasn't been viewed
      // Check if it's "nearby" any viewed row by value in visible columns
      visibility.push(2); // in viewed columns but row not directly viewed
    } else {
      visibility.push(0); // not explored, no connection
    }
  }
  return visibility;
}

/**
 * Generate reveal hints for hidden columns.
 */
function fog_generateRevealHints(
  hiddenCols: string[],
  profiles: FogColumnProfile[],
  visibleCols: string[]
): RevealHint[] {
  const profileMap = new Map(profiles.map((p) => [p.name, p]));
  const visibleNumeric = profiles.filter((p) => visibleCols.includes(p.name) && p.isNumeric);

  return hiddenCols.map((colName) => {
    const profile = profileMap.get(colName);

    // Find the most related visible column
    let bestRelated = visibleCols[0] || "more data";
    let bestCorr = 0;
    if (profile && profile.isNumeric) {
      for (const vp of visibleNumeric) {
        const r = Math.abs(fog_pearsonCorrelation(vp.numericValues, profile.numericValues));
        if (r > bestCorr) {
          bestCorr = r;
          bestRelated = vp.name;
        }
      }
    }

    let tease: string;
    if (profile && profile.isNumeric && profile.numericValues.length > 0) {
      const range = profile.max - profile.min;
      tease = `A hidden dimension ranges from ${profile.min} to ${profile.max} (range: ${Number(range.toFixed(2))}) — explore ${bestRelated} deeper to reveal it`;
    } else if (profile) {
      tease = `A hidden dimension with ${profile.uniqueCount} unique values — explore ${bestRelated} deeper to reveal it`;
    } else {
      tease = `A hidden dimension awaits — explore ${bestRelated} deeper to reveal it`;
    }

    return {
      hidden_column: colName,
      tease,
      unlock_action: `Explore ${bestRelated} to reveal ${colName}`,
    };
  });
}

/**
 * Compute world coverage: fraction of total cells that have been explored.
 * A cell is "explored" if its column is visible AND its row has been viewed.
 * Starter reveal columns count toward visible but no rows are viewed (coverage from visibility alone).
 */
function fog_computeWorldCoverage(
  totalRows: number,
  totalCols: number,
  visibleColCount: number,
  rowsViewed: number[],
  rowCount: number
): number {
  if (totalRows === 0 || totalCols === 0) return 0;
  const totalCells = totalRows * totalCols;

  // Cells explored = visible columns * viewed rows
  // But if no rows viewed, starter reveal gives partial visibility
  const uniqueRowsViewed = new Set(rowsViewed.filter((r) => r >= 0 && r < rowCount)).size;

  if (uniqueRowsViewed === 0) {
    // Starter state: columns visible but rows not viewed yet — small coverage
    // Count visible-column cells as partially explored (25% weight)
    return Math.min(1, (visibleColCount * totalRows * 0.25) / totalCells);
  }

  const exploredCells = visibleColCount * uniqueRowsViewed;
  return Math.min(1, exploredCells / totalCells);
}

// ============================================================================
// Main export
// ============================================================================

export function flowFogOfWar(input: FogOfWarInput): FogOfWarResult {
  // Normalize csv_content/csv_data
  const normalized = normalizeCsvArgs(input as unknown as Record<string, unknown>);
  const csvData = (normalized.csv_data as string) || "";

  const { headers, rows } = parseCsvToRows(csvData);

  if (headers.length === 0) {
    return {
      fog_csv: "_visibility,_reveal_hint\n",
      visible_columns: [],
      hidden_columns: [],
      reveal_hints: [],
      world_coverage: 0,
    };
  }

  const history = input.exploration_history;
  const columnsViewed = history?.columns_viewed ?? [];
  const rowsViewed = history?.rows_viewed ?? [];

  // Filter out columns that don't exist in the dataset
  const validColumnsViewed = columnsViewed.filter((c) => headers.includes(c));
  const validRowsViewed = rowsViewed.filter((r) => r >= 0 && r < rows.length);

  // Profile all columns
  const profiles = fog_profileColumns(headers, rows);

  // Determine visible vs hidden columns
  const visibleSet = fog_computeVisibleColumns(headers, profiles, validColumnsViewed);
  const visibleColumns = headers.filter((h) => visibleSet.has(h));
  const hiddenColumns = headers.filter((h) => !visibleSet.has(h));

  // Check if all columns are viewed (for full history case)
  // If all columns are in columns_viewed, reveal everything
  const allColumnsViewed = headers.every((h) => columnsViewed.includes(h));
  const finalVisibleColumns = allColumnsViewed ? [...headers] : visibleColumns;
  const finalHiddenColumns = allColumnsViewed ? [] : hiddenColumns;

  // Detect network structure
  const networkInfo = fog_detectNetworkColumns(headers);
  const adjacency = networkInfo ? fog_buildAdjacency(rows, networkInfo.idCol, networkInfo.connCol) : null;

  // Compute row visibility
  const rowVisibility = fog_computeRowVisibility(
    rows,
    validRowsViewed,
    new Set(finalVisibleColumns),
    headers,
    adjacency
  );

  // Generate reveal hints for hidden columns
  const revealHints = fog_generateRevealHints(finalHiddenColumns, profiles, finalVisibleColumns);

  // Build a quick hint string per row
  const rowHints: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (finalHiddenColumns.length === 0) {
      rowHints.push("All dimensions revealed");
    } else {
      // Pick the first hidden column as hint
      const hint = revealHints[0];
      if (hint) {
        rowHints.push(`Hidden: ${hint.hidden_column} — ${hint.unlock_action}`);
      } else {
        rowHints.push("More dimensions await");
      }
    }
  }

  // Build fog_csv: only visible columns + _visibility + _reveal_hint
  const fogHeaders = [...finalVisibleColumns, "_visibility", "_reveal_hint"];
  const fogHeaderLine = fogHeaders.map(csvEscapeField).join(",");

  const fogRows: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values: string[] = [];
    for (const col of finalVisibleColumns) {
      const colIdx = headers.indexOf(col);
      values.push(csvEscapeField((row[colIdx] ?? "").trim()));
    }
    values.push(String(rowVisibility[i]));
    values.push(csvEscapeField(rowHints[i]));
    fogRows.push(values.join(","));
  }

  const fogCsv = [fogHeaderLine, ...fogRows].join("\n");

  // Compute world coverage
  const worldCoverage = fog_computeWorldCoverage(
    rows.length,
    headers.length,
    finalVisibleColumns.length,
    validRowsViewed,
    rows.length
  );

  return {
    fog_csv: fogCsv,
    visible_columns: finalVisibleColumns,
    hidden_columns: finalHiddenColumns,
    reveal_hints: revealHints,
    world_coverage: Number(worldCoverage.toFixed(4)),
  };
}
