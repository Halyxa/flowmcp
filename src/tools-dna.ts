/**
 * Exploration DNA — generates a unique fingerprint for any dataset.
 *
 * Computes 8 traits (cluster_richness, trend_strength, anomaly_density,
 * correlation_density, dimensionality, uniqueness, network_potential,
 * temporal_signal) and classifies datasets into archetypes like
 * "The Archipelago", "The Highway", "The Mystery", etc.
 */

import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface ExplorationDnaInput {
  csv_data: string;
}

export interface DnaTrait {
  trait: string;
  score: number;
  description: string;
}

export interface ExplorationDnaResult {
  dna_code: string;
  archetype: string;
  description: string;
  traits: DnaTrait[];
  exploration_style: string;
  recommended_tools: string[];
  personality_csv: string;
}

// ============================================================================
// Internal helpers (prefixed with dna_)
// ============================================================================

interface DnaColumnProfile {
  name: string;
  index: number;
  isNumeric: boolean;
  numericValues: number[];
  rawValues: string[];
  uniqueCount: number;
  mean: number;
  std: number;
}

function dna_parseCsv(csvData: string): { headers: string[]; rows: string[][] } {
  const lines = csvData.trim().split("\n");
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCSVLine(line));
  return { headers, rows };
}

function dna_profileColumns(headers: string[], rows: string[][]): DnaColumnProfile[] {
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

    const isNumeric = numericCount > 0 && numericCount >= rawValues.filter((v) => v !== "").length * 0.7;

    const uniqueSet = new Set(rawValues.filter((v) => v !== ""));
    const uniqueCount = uniqueSet.size;

    let mean = 0;
    let std = 0;
    if (isNumeric && numericValues.length > 0) {
      mean = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
      if (numericValues.length > 1) {
        const variance = numericValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (numericValues.length - 1);
        std = Math.sqrt(variance);
      }
    }

    return { name, index, isNumeric, numericValues, rawValues, uniqueCount, mean, std };
  });
}

function dna_euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function dna_kMeans(
  data: number[][],
  k: number,
  maxIter: number
): { assignments: number[]; centroids: number[][] } {
  const n = data.length;
  if (n === 0 || k <= 0) return { assignments: [], centroids: [] };
  if (k >= n) {
    return {
      assignments: data.map((_, i) => i),
      centroids: data.map((row) => [...row]),
    };
  }

  const dims = data[0].length;

  // k-means++ initialization
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  // First centroid: index 0 (deterministic for test stability)
  centroids.push([...data[0]]);
  usedIndices.add(0);

  for (let c = 1; c < k; c++) {
    let maxDist = -1;
    let bestIdx = 0;
    for (let i = 0; i < n; i++) {
      if (usedIndices.has(i)) continue;
      let minDistToCentroid = Infinity;
      for (const centroid of centroids) {
        const d = dna_euclideanDistance(data[i], centroid);
        if (d < minDistToCentroid) minDistToCentroid = d;
      }
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        bestIdx = i;
      }
    }
    centroids.push([...data[bestIdx]]);
    usedIndices.add(bestIdx);
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = dna_euclideanDistance(data[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }
    if (!changed) break;

    const sums: number[][] = Array.from({ length: k }, () => new Array(dims).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dims; d++) {
        sums[c][d] += data[i][d];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  return { assignments, centroids };
}

function dna_silhouetteScore(data: number[][], assignments: number[], k: number): number {
  if (k <= 1 || data.length <= k) return 0;

  const n = data.length;
  let totalScore = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];

    let aSum = 0;
    let aCount = 0;
    for (let j = 0; j < n; j++) {
      if (j !== i && assignments[j] === myCluster) {
        aSum += dna_euclideanDistance(data[i], data[j]);
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
          bSum += dna_euclideanDistance(data[i], data[j]);
          bCount++;
        }
      }
      if (bCount > 0) {
        const meanDist = bSum / bCount;
        if (meanDist < b) b = meanDist;
      }
    }
    if (b === Infinity) b = 0;

    const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
    totalScore += s;
  }

  return totalScore / n;
}

function dna_pearsonCorrelation(xs: number[], ys: number[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) {
      pairs.push([xs[i], ys[i]]);
    }
  }
  const n = pairs.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
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

function dna_isDateLike(val: string): boolean {
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

// ============================================================================
// Trait computation functions
// ============================================================================

function dna_computeClusterRichness(numericCols: DnaColumnProfile[], rowCount: number): number {
  if (numericCols.length === 0 || rowCount < 4) return 0;

  // Build data matrix from numeric columns (normalize each column)
  const matrix: number[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const point: number[] = [];
    for (const col of numericCols) {
      const val = r < col.numericValues.length ? col.numericValues[r] : 0;
      // Normalize: (val - mean) / std
      const normalized = col.std > 0 ? (val - col.mean) / col.std : 0;
      point.push(normalized);
    }
    matrix.push(point);
  }

  // Check if all points are identical
  let allIdentical = true;
  for (let i = 1; i < matrix.length; i++) {
    for (let j = 0; j < matrix[0].length; j++) {
      if (matrix[i][j] !== matrix[0][j]) {
        allIdentical = false;
        break;
      }
    }
    if (!allIdentical) break;
  }
  if (allIdentical) return 0;

  // Try k=2..min(5, rowCount-1) and take best silhouette
  let bestSilhouette = -1;
  const maxK = Math.min(5, rowCount - 1);
  for (let k = 2; k <= maxK; k++) {
    const { assignments } = dna_kMeans(matrix, k, 50);
    const score = dna_silhouetteScore(matrix, assignments, k);
    if (score > bestSilhouette) bestSilhouette = score;
  }

  // Use raw silhouette score: -1 to 1, where > 0.5 is strong clustering.
  // Clamp to [0, 1] — negative silhouette means no clustering.
  return Math.max(0, Math.min(1, bestSilhouette));
}

function dna_computeTrendStrength(numericCols: DnaColumnProfile[]): number {
  if (numericCols.length === 0) return 0;

  let maxMonotonicity = 0;

  for (const col of numericCols) {
    const vals = col.numericValues;
    if (vals.length < 3) continue;

    // Compute monotonicity: fraction of consecutive pairs that are monotonically increasing or decreasing
    let increasing = 0;
    let decreasing = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] > vals[i - 1]) increasing++;
      else if (vals[i] < vals[i - 1]) decreasing++;
    }
    const total = vals.length - 1;
    if (total === 0) continue;
    const mono = Math.max(increasing, decreasing) / total;
    if (mono > maxMonotonicity) maxMonotonicity = mono;
  }

  return Math.max(0, Math.min(1, maxMonotonicity));
}

function dna_computeAnomalyDensity(numericCols: DnaColumnProfile[], rowCount: number): number {
  if (numericCols.length === 0 || rowCount === 0) return 0;

  const outlierRows = new Set<number>();

  for (const col of numericCols) {
    if (col.std === 0) continue;
    for (let i = 0; i < col.numericValues.length; i++) {
      const z = Math.abs((col.numericValues[i] - col.mean) / col.std);
      if (z > 2) {
        outlierRows.add(i);
      }
    }
  }

  return outlierRows.size / rowCount;
}

function dna_computeCorrelationDensity(numericCols: DnaColumnProfile[]): number {
  if (numericCols.length < 2) return 0;

  let totalAbsR = 0;
  let pairCount = 0;

  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const r = dna_pearsonCorrelation(numericCols[i].numericValues, numericCols[j].numericValues);
      totalAbsR += Math.abs(r);
      pairCount++;
    }
  }

  if (pairCount === 0) return 0;
  return totalAbsR / pairCount;
}

function dna_computeDimensionality(numericCols: DnaColumnProfile[], rowCount: number): number {
  if (numericCols.length <= 1 || rowCount < 2) return 0;

  const d = numericCols.length;
  const n = rowCount;

  // Build centered data matrix
  const centered: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    for (const col of numericCols) {
      const val = r < col.numericValues.length ? col.numericValues[r] : 0;
      row.push(col.std > 0 ? (val - col.mean) / col.std : 0);
    }
    centered.push(row);
  }

  // Covariance matrix
  const cov: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
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

  // Extract eigenvalues via power iteration + deflation
  const eigenvalues: number[] = [];
  const covWork = cov.map((row) => [...row]);

  for (let comp = 0; comp < d; comp++) {
    let vec = new Array(d).fill(0);
    vec[comp % d] = 1;

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

    const eigenvalue = vec.reduce((s, vi, i) => {
      let dot = 0;
      for (let j = 0; j < d; j++) dot += covWork[i][j] * vec[j];
      return s + vi * dot;
    }, 0);
    eigenvalues.push(Math.max(0, eigenvalue));

    // Deflate
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        covWork[i][j] -= eigenvalue * vec[i] * vec[j];
      }
    }
  }

  // How many components for 80% of variance?
  const totalVariance = eigenvalues.reduce((s, v) => s + v, 0);
  if (totalVariance === 0) return 0;

  let cumulative = 0;
  let componentsFor80 = 0;
  for (let i = 0; i < eigenvalues.length; i++) {
    cumulative += eigenvalues[i];
    componentsFor80++;
    if (cumulative / totalVariance >= 0.8) break;
  }

  // Dimensionality = fraction of total components needed for 80%
  // Higher means more independent dimensions (more complex)
  return componentsFor80 / d;
}

function dna_computeUniqueness(profiles: DnaColumnProfile[], rowCount: number): number {
  if (profiles.length === 0 || rowCount === 0) return 0;

  let totalRatio = 0;
  for (const col of profiles) {
    totalRatio += col.uniqueCount / Math.max(rowCount, 1);
  }
  return Math.min(1, totalRatio / profiles.length);
}

function dna_computeNetworkPotential(headers: string[], rows: string[][]): number {
  // Check if data has id + connections (pipe-delimited) structure
  const headerLower = headers.map((h) => h.toLowerCase());

  // Look for an "id" column
  const hasIdCol = headerLower.some(
    (h) => h === "id" || h.endsWith("_id") || h === "key" || h === "name" || h === "node"
  );

  // Look for a connections column (values contain pipes)
  let hasConnectionsCol = false;
  for (let ci = 0; ci < headers.length; ci++) {
    const name = headerLower[ci];
    if (name === "connections" || name === "edges" || name === "links" || name === "neighbors") {
      hasConnectionsCol = true;
      break;
    }
    // Check if values contain pipes
    let pipeCount = 0;
    for (const row of rows) {
      if ((row[ci] ?? "").includes("|")) pipeCount++;
    }
    if (pipeCount > rows.length * 0.3) {
      hasConnectionsCol = true;
      break;
    }
  }

  return hasIdCol && hasConnectionsCol ? 1 : 0;
}

function dna_computeTemporalSignal(profiles: DnaColumnProfile[], rows: string[][]): number {
  if (profiles.length === 0 || rows.length === 0) return 0;

  let temporalScore = 0;

  for (const col of profiles) {
    // Check for date-like values
    let dateCount = 0;
    for (const val of col.rawValues) {
      if (dna_isDateLike(val)) dateCount++;
    }
    if (dateCount > col.rawValues.length * 0.5) {
      temporalScore = Math.max(temporalScore, 1);
      continue;
    }

    // Check for monotonically increasing integers (like timestamps or sequential IDs that are temporal)
    if (col.isNumeric && col.numericValues.length >= 3) {
      const vals = col.numericValues;
      let increasing = 0;
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] > vals[i - 1]) increasing++;
      }
      const ratio = increasing / (vals.length - 1);
      // Only count as temporal if column name suggests time
      const nameLower = col.name.toLowerCase();
      if (
        (nameLower.includes("date") ||
          nameLower.includes("time") ||
          nameLower.includes("year") ||
          nameLower.includes("month") ||
          nameLower.includes("day") ||
          nameLower.includes("epoch") ||
          nameLower.includes("timestamp")) &&
        ratio > 0.7
      ) {
        temporalScore = Math.max(temporalScore, ratio);
      }
    }
  }

  return Math.min(1, temporalScore);
}

// ============================================================================
// Archetype classification
// ============================================================================

interface ArchetypeInfo {
  archetype: string;
  code: string;
  description: string;
  exploration_style: string;
  recommended_tools: string[];
}

const ARCHETYPE_MAP: Record<string, ArchetypeInfo> = {
  cluster_richness: {
    archetype: "The Archipelago",
    code: "ARCH",
    description:
      "Your data forms distinct clusters — islands of related points separated by clear gaps. Each cluster has its own character and internal patterns.",
    exploration_style:
      "Start at the largest cluster, then hop between islands. Compare each cluster's profile to find what makes them distinct.",
    recommended_tools: [
      "flow_cluster_data",
      "flow_pca_reduce",
      "flow_distance_matrix",
      "flow_describe_dataset",
    ],
  },
  trend_strength: {
    archetype: "The Highway",
    code: "HIGH",
    description:
      "Your data has strong directional trends — clear trajectories that pull values in consistent directions. Follow the road to see where it leads.",
    exploration_style:
      "Follow the dominant trend from start to end. Look for deviations — where does the highway curve? Where do exits appear?",
    recommended_tools: [
      "flow_regression_analysis",
      "flow_time_series_animate",
      "flow_correlation_matrix",
      "flow_window_functions",
    ],
  },
  anomaly_density: {
    archetype: "The Mystery",
    code: "MYST",
    description:
      "Your data is full of surprises — unusual values that defy the dominant pattern. Each anomaly is a clue waiting to be investigated.",
    exploration_style:
      "Start with the biggest surprises. Investigate each anomaly — is it measurement error or hidden signal? Cluster the outliers to find patterns in the unexpected.",
    recommended_tools: [
      "flow_anomaly_detect",
      "flow_outlier_fence",
      "flow_column_stats",
      "flow_filter_rows",
    ],
  },
  correlation_density: {
    archetype: "The Web",
    code: "WEB",
    description:
      "Your data is densely interconnected — most variables are correlated with each other. Pull one thread and the whole web moves.",
    exploration_style:
      "Map the correlation web. Find the hub variables that connect to everything. Look for the few independent dimensions hiding in the mesh.",
    recommended_tools: [
      "flow_correlation_matrix",
      "flow_pca_reduce",
      "flow_regression_analysis",
      "flow_compute_graph_metrics",
    ],
  },
  dimensionality: {
    archetype: "The Forest",
    code: "FRST",
    description:
      "Your data is high-dimensional and complex — many independent features each telling their own story. A dense forest with diverse species.",
    exploration_style:
      "Reduce dimensions first to find the major axes of variation. Then explore each dimension's contribution to the overall structure.",
    recommended_tools: [
      "flow_pca_reduce",
      "flow_describe_dataset",
      "flow_normalize_data",
      "flow_column_stats",
    ],
  },
  network_potential: {
    archetype: "The Network",
    code: "NET",
    description:
      "Your data represents a connected graph — nodes linked by relationships. The structure IS the story.",
    exploration_style:
      "Compute graph metrics first. Find hubs, bridges, and isolated components. Visualize with force layout to reveal the network's topology.",
    recommended_tools: [
      "flow_compute_graph_metrics",
      "flow_precompute_force_layout",
      "flow_transform_to_network_graph",
      "flow_distance_matrix",
    ],
  },
  temporal_signal: {
    archetype: "The Timeline",
    code: "TIME",
    description:
      "Your data has a temporal backbone — time is the organizing axis. Events unfold in sequence, revealing patterns of change.",
    exploration_style:
      "Animate through time. Look for periodicity, acceleration, and regime changes. Compare early vs late to spot evolution.",
    recommended_tools: [
      "flow_time_series_animate",
      "flow_parse_dates",
      "flow_window_functions",
      "flow_lag_lead",
    ],
  },
};

const MOSAIC_INFO: ArchetypeInfo = {
  archetype: "The Mosaic",
  code: "MOSC",
  description:
    "Your data has mixed character — no single trait dominates. A mosaic of patterns, each contributing to the whole. Explore broadly before going deep.",
  exploration_style:
    "Start with a full dataset profile. Let each trait guide a mini-exploration. The richness is in the diversity of patterns.",
  recommended_tools: [
    "flow_describe_dataset",
    "flow_column_stats",
    "flow_suggest_flow_visualization",
    "flow_narrate_data",
  ],
};

function dna_classifyArchetype(traits: DnaTrait[]): ArchetypeInfo {
  // Priority-ordered threshold checks
  const traitMap = new Map(traits.map((t) => [t.trait, t.score]));

  const clusterRichness = traitMap.get("cluster_richness") ?? 0;
  const trendStrength = traitMap.get("trend_strength") ?? 0;
  const anomalyDensity = traitMap.get("anomaly_density") ?? 0;
  const correlationDensity = traitMap.get("correlation_density") ?? 0;
  const dimensionality = traitMap.get("dimensionality") ?? 0;
  const networkPotential = traitMap.get("network_potential") ?? 0;
  const temporalSignal = traitMap.get("temporal_signal") ?? 0;

  // Network is binary and takes priority if detected
  if (networkPotential === 1) return ARCHETYPE_MAP["network_potential"];

  // Check threshold-based classifications
  // Cluster richness: if data clearly clusters, that's the dominant character
  // even if correlation is also high (correlated columns can still form clusters)
  if (clusterRichness > 0.6) {
    return ARCHETYPE_MAP["cluster_richness"];
  }
  if (anomalyDensity > 0.15) return ARCHETYPE_MAP["anomaly_density"];
  if (correlationDensity > 0.5 && correlationDensity >= trendStrength) {
    return ARCHETYPE_MAP["correlation_density"];
  }
  if (trendStrength > 0.6) return ARCHETYPE_MAP["trend_strength"];
  if (temporalSignal > 0.5) return ARCHETYPE_MAP["temporal_signal"];
  if (dimensionality > 0.6) return ARCHETYPE_MAP["dimensionality"];

  // Find dominant trait
  let maxScore = 0;
  let maxTrait = "";
  for (const t of traits) {
    if (t.trait === "uniqueness") continue; // uniqueness alone doesn't define archetype
    if (t.score > maxScore) {
      maxScore = t.score;
      maxTrait = t.trait;
    }
  }

  if (maxScore > 0.4 && ARCHETYPE_MAP[maxTrait]) {
    return ARCHETYPE_MAP[maxTrait];
  }

  return MOSAIC_INFO;
}

// ============================================================================
// DNA code generation
// ============================================================================

const TRAIT_CODES: Record<string, string> = {
  cluster_richness: "ARCH",
  trend_strength: "HIGH",
  anomaly_density: "MYST",
  correlation_density: "WEB",
  dimensionality: "FRST",
  network_potential: "NET",
  temporal_signal: "TIME",
  uniqueness: "UNIQ",
};

function dna_generateCode(traits: DnaTrait[], archetype: ArchetypeInfo): string {
  // Sort traits by score descending, pick top 2-3
  const sorted = [...traits]
    .filter((t) => t.score > 0.1)
    .sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return "MOSC-MOSC";
  }

  // Always include the archetype code first
  const codes: string[] = [archetype.code];

  for (const t of sorted) {
    const code = TRAIT_CODES[t.trait];
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
    if (codes.length >= 3) break;
  }

  // Ensure at least 2 codes
  if (codes.length < 2) {
    codes.push("MOSC");
  }

  return codes.join("-");
}

// ============================================================================
// Role assignment
// ============================================================================

function dna_assignRoles(
  numericCols: DnaColumnProfile[],
  rows: string[][],
  rowCount: number
): string[] {
  if (rowCount === 0) return [];
  if (numericCols.length === 0) {
    return new Array(rowCount).fill("cluster_core");
  }

  const roles = new Array(rowCount).fill("cluster_core");

  // Mark outliers: any row with |z| > 2 in any numeric column
  for (const col of numericCols) {
    if (col.std === 0) continue;
    for (let i = 0; i < Math.min(col.numericValues.length, rowCount); i++) {
      const z = Math.abs((col.numericValues[i] - col.mean) / col.std);
      if (z > 2) {
        roles[i] = "outlier";
      }
    }
  }

  // Mark trend anchors: first and last rows in strongly trending data
  let maxMonotonicity = 0;
  for (const col of numericCols) {
    if (col.numericValues.length < 3) continue;
    let increasing = 0;
    for (let i = 1; i < col.numericValues.length; i++) {
      if (col.numericValues[i] > col.numericValues[i - 1]) increasing++;
    }
    const mono = increasing / (col.numericValues.length - 1);
    if (mono > maxMonotonicity) maxMonotonicity = mono;
  }
  if (maxMonotonicity > 0.7) {
    if (roles[0] !== "outlier") roles[0] = "trend_anchor";
    if (roles[rowCount - 1] !== "outlier") roles[rowCount - 1] = "trend_anchor";
  }

  // Mark bridges: if clustered data, points between clusters
  if (numericCols.length >= 1 && rowCount >= 6) {
    // Build normalized matrix
    const matrix: number[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const point: number[] = [];
      for (const col of numericCols) {
        const val = r < col.numericValues.length ? col.numericValues[r] : 0;
        const normalized = col.std > 0 ? (val - col.mean) / col.std : 0;
        point.push(normalized);
      }
      matrix.push(point);
    }

    // Run k=2 clustering
    const k = Math.min(3, Math.floor(rowCount / 2));
    if (k >= 2) {
      const { assignments, centroids } = dna_kMeans(matrix, k, 30);

      // A bridge is a point far from its own centroid relative to the average distance
      const distancesToCentroid = matrix.map((pt, i) =>
        dna_euclideanDistance(pt, centroids[assignments[i]])
      );
      const avgDist =
        distancesToCentroid.reduce((s, d) => s + d, 0) / distancesToCentroid.length;

      for (let i = 0; i < rowCount; i++) {
        if (roles[i] !== "outlier" && roles[i] !== "trend_anchor") {
          if (distancesToCentroid[i] > avgDist * 1.5) {
            roles[i] = "bridge";
          }
        }
      }
    }
  }

  return roles;
}

// ============================================================================
// Trait description generator
// ============================================================================

function dna_traitDescription(trait: string, score: number): string {
  const descriptions: Record<string, (s: number) => string> = {
    cluster_richness: (s) =>
      s > 0.6
        ? "Data forms distinct, well-separated clusters"
        : s > 0.3
          ? "Some clustering structure visible but not dominant"
          : "Data points are spread relatively evenly — no strong clusters",
    trend_strength: (s) =>
      s > 0.6
        ? "Strong monotonic trends present in one or more columns"
        : s > 0.3
          ? "Moderate directional tendency in the data"
          : "No strong directional trends — values fluctuate without clear trajectory",
    anomaly_density: (s) =>
      s > 0.15
        ? `${Math.round(s * 100)}% of rows contain statistical anomalies (|z|>2)`
        : s > 0.05
          ? "A few unusual values present but within normal range"
          : "Data is remarkably consistent — very few outliers",
    correlation_density: (s) =>
      s > 0.5
        ? "Variables are densely interconnected — high average correlation"
        : s > 0.25
          ? "Moderate correlations between some variable pairs"
          : "Variables are largely independent of each other",
    dimensionality: (s) =>
      s > 0.6
        ? "High effective dimensionality — many independent axes of variation"
        : s > 0.3
          ? "Moderate complexity — some redundancy in the feature space"
          : "Low dimensionality — most variance captured by few components",
    uniqueness: (s) =>
      s > 0.7
        ? "Highly unique values across columns — rich diversity"
        : s > 0.3
          ? "Moderate value diversity"
          : "Many repeated values — limited diversity in the data",
    network_potential: (s) =>
      s === 1
        ? "Graph structure detected — data has nodes and edges (pipe-delimited connections)"
        : "No graph/network structure detected in the data",
    temporal_signal: (s) =>
      s > 0.5
        ? "Temporal patterns detected — dates or time-ordered sequences present"
        : s > 0
          ? "Weak temporal signal — possible time-ordered data"
          : "No temporal structure detected",
  };

  const fn = descriptions[trait];
  return fn ? fn(score) : `Trait score: ${score.toFixed(2)}`;
}

// ============================================================================
// Main function
// ============================================================================

export function flowExplorationDna(input: ExplorationDnaInput): ExplorationDnaResult {
  const { headers, rows } = dna_parseCsv(input.csv_data);

  if (headers.length === 0) {
    throw new Error("No headers found in CSV data");
  }

  const profiles = dna_profileColumns(headers, rows);
  const numericCols = profiles.filter((p) => p.isNumeric);
  const rowCount = rows.length;

  // Compute all 8 traits
  const traits: DnaTrait[] = [
    {
      trait: "cluster_richness",
      score: dna_computeClusterRichness(numericCols, rowCount),
      description: "",
    },
    {
      trait: "trend_strength",
      score: dna_computeTrendStrength(numericCols),
      description: "",
    },
    {
      trait: "anomaly_density",
      score: dna_computeAnomalyDensity(numericCols, rowCount),
      description: "",
    },
    {
      trait: "correlation_density",
      score: dna_computeCorrelationDensity(numericCols),
      description: "",
    },
    {
      trait: "dimensionality",
      score: dna_computeDimensionality(numericCols, rowCount),
      description: "",
    },
    {
      trait: "uniqueness",
      score: dna_computeUniqueness(profiles, rowCount),
      description: "",
    },
    {
      trait: "network_potential",
      score: dna_computeNetworkPotential(headers, rows),
      description: "",
    },
    {
      trait: "temporal_signal",
      score: dna_computeTemporalSignal(profiles, rows),
      description: "",
    },
  ];

  // Clamp scores and add descriptions
  for (const t of traits) {
    t.score = Math.max(0, Math.min(1, Math.round(t.score * 100) / 100));
    t.description = dna_traitDescription(t.trait, t.score);
  }

  // Classify archetype
  const archetypeInfo = dna_classifyArchetype(traits);

  // Generate DNA code
  const dnaCode = dna_generateCode(traits, archetypeInfo);

  // Assign roles to rows
  const roles = dna_assignRoles(numericCols, rows, rowCount);

  // Build personality CSV
  const outHeaders = [...headers, "_dna_role"];
  const outLines = [outHeaders.map(csvEscapeField).join(",")];
  for (let i = 0; i < rows.length; i++) {
    const outRow = [...rows[i].map(csvEscapeField), csvEscapeField(roles[i] ?? "cluster_core")];
    outLines.push(outRow.join(","));
  }
  const personalityCsv = outLines.join("\n");

  return {
    dna_code: dnaCode,
    archetype: archetypeInfo.archetype,
    description: archetypeInfo.description,
    traits,
    exploration_style: archetypeInfo.exploration_style,
    recommended_tools: archetypeInfo.recommended_tools,
    personality_csv: personalityCsv,
  };
}
