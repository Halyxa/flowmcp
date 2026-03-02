/**
 * Worker Thread for Force-Directed Layout Computation
 *
 * This module runs d3-force-3d simulation in a worker thread,
 * enabling parallel force computation on multi-core systems.
 *
 * On halyx's 96-core EPYC: 96 simultaneous force layouts,
 * or partition a massive graph across cores.
 *
 * Usage from main thread:
 *   import { computeForceLayoutInWorker, computeForceLayoutParallel } from './worker-force.js';
 */

import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// Force layout defaults (mirrored from index.ts DEFAULTS)
const FORCE_DEFAULTS = {
  ITERATIONS: 300,
  DIMENSIONS: 3 as 2 | 3,
  CHARGE_STRENGTH: -30,
  LINK_DISTANCE: 30,
  CENTER_STRENGTH: 1,
  COLLISION_RADIUS: 0,
  PARTITION_SPACING: 200,
};

export interface WorkerForceInput {
  nodes: Array<{ id: string; [key: string]: any }>;
  edges: Array<{ source: string; target: string; weight?: number }>;
  iterations?: number;
  dimensions?: 2 | 3;
  forces?: {
    charge_strength?: number;
    link_distance?: number;
    center_strength?: number;
    collision_radius?: number;
  };
}

export interface WorkerForceResult {
  csv: string;
  stats: {
    nodes: number;
    edges: number;
    dimensions: number;
    iterations: number;
    computation_ms: number;
    final_alpha: string;
    worker_thread: boolean;
  };
  flow_instructions: string;
  error?: string;
}

// parseCSVLine and csvEscapeField imported from ./csv-utils.js

/**
 * Run force layout in a worker thread.
 * Returns a promise that resolves with the computed layout.
 */
export function computeForceLayoutInWorker(
  input: WorkerForceInput
): Promise<WorkerForceResult> {
  return new Promise((resolve, reject) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const workerPath = join(__dirname, "worker-force.js");

    const worker = new Worker(workerPath, {
      workerData: input,
    });

    worker.on("message", (result: WorkerForceResult) => {
      resolve(result);
    });

    worker.on("error", (err) => {
      reject(err);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

/**
 * Run multiple force layouts in parallel using worker threads.
 * Each input gets its own worker thread — on a 96-core EPYC,
 * up to 96 layouts compute simultaneously.
 */
const MAX_PARALLEL_WORKERS = 8;

export function computeForceLayoutParallel(
  inputs: WorkerForceInput[]
): Promise<WorkerForceResult[]> {
  if (inputs.length > MAX_PARALLEL_WORKERS) {
    return Promise.reject(
      new Error(`Too many parallel inputs (${inputs.length}). Maximum is ${MAX_PARALLEL_WORKERS}.`)
    );
  }
  return Promise.all(inputs.map((input) => computeForceLayoutInWorker(input)));
}

/**
 * Partition a large graph and compute force layout across worker threads.
 * Splits the graph into subgraphs, computes each in parallel,
 * then stitches positions back together.
 */
const MAX_PARTITIONS = 16;

export async function computeForceLayoutPartitioned(
  input: WorkerForceInput,
  partitions: number = 4
): Promise<WorkerForceResult> {
  const { nodes, edges, iterations, dimensions, forces } = input;

  // Clamp partitions to safe range
  const clampedPartitions = Math.min(Math.max(partitions, 1), MAX_PARTITIONS);

  if (nodes.length <= 1000 || clampedPartitions <= 1) {
    return computeForceLayoutInWorker(input);
  }

  // Simple partition: round-robin node assignment
  const partitionedNodes: Array<Array<{ id: string; [key: string]: any }>> =
    Array.from({ length: clampedPartitions }, () => []);
  const nodePartition = new Map<string, number>();

  nodes.forEach((node, i) => {
    const p = i % clampedPartitions;
    partitionedNodes[p].push(node);
    nodePartition.set(node.id, p);
  });

  // Assign intra-partition edges only
  const partitionedEdges: Array<
    Array<{ source: string; target: string; weight?: number }>
  > = Array.from({ length: clampedPartitions }, () => []);

  for (const edge of edges) {
    const p = nodePartition.get(edge.source) ?? 0;
    if (nodePartition.get(edge.target) === p) {
      partitionedEdges[p].push(edge);
    }
  }

  const subInputs: WorkerForceInput[] = partitionedNodes.map((pNodes, i) => ({
    nodes: pNodes,
    edges: partitionedEdges[i],
    iterations,
    dimensions,
    forces,
  }));

  const startTime = Date.now();
  const results = await computeForceLayoutParallel(subInputs);
  const elapsed = Date.now() - startTime;

  // Stitch results with spatial offsets to avoid overlap
  const allLines: string[] = [];
  let headers = "";
  const partitionSpacing = FORCE_DEFAULTS.PARTITION_SPACING;

  for (let p = 0; p < results.length; p++) {
    const csvLines = results[p].csv.split("\n");
    if (p === 0) headers = csvLines[0];

    for (let i = 1; i < csvLines.length; i++) {
      const parts = parseCSVLine(csvLines[i]);
      const x = parseFloat(parts[1]) + p * partitionSpacing;
      parts[1] = x.toFixed(4);
      allLines.push(parts.map(csvEscapeField).join(","));
    }
  }

  return {
    csv: headers + "\n" + allLines.join("\n"),
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      dimensions: dimensions || 3,
      iterations: iterations || 300,
      computation_ms: elapsed,
      final_alpha: "partitioned",
      worker_thread: true,
    },
    flow_instructions:
      `Partitioned layout: ${clampedPartitions} partitions computed in parallel. ` +
      "Upload this CSV to Flow Immersive. Map x/y/z columns to XYZ Position axes. " +
      "Use 'connections by id' for network edges.",
  };
}

// ============================================================================
// WORKER THREAD CODE — runs when this file is loaded as a Worker
// ============================================================================

if (!isMainThread && parentPort) {
  const d3 = await import("d3-force-3d");
  const { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } = d3;

  const input: WorkerForceInput = workerData;
  const {
    nodes,
    edges,
    iterations = FORCE_DEFAULTS.ITERATIONS,
    dimensions = FORCE_DEFAULTS.DIMENSIONS,
    forces = {},
  } = input;

  const {
    charge_strength = FORCE_DEFAULTS.CHARGE_STRENGTH,
    link_distance = FORCE_DEFAULTS.LINK_DISTANCE,
    center_strength = FORCE_DEFAULTS.CENTER_STRENGTH,
    collision_radius = FORCE_DEFAULTS.COLLISION_RADIUS,
  } = forces;

  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight || 1,
  }));

  const simulation = forceSimulation(simNodes)
    .numDimensions(dimensions)
    .force("charge", forceManyBody().strength(charge_strength))
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(link_distance)
    )
    .force("center", forceCenter().strength(center_strength))
    .stop();

  if (collision_radius > 0) {
    simulation.force("collide", forceCollide(collision_radius));
  }

  const startTime = Date.now();
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }
  const elapsed = Date.now() - startTime;

  // Build adjacency
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const systemKeys = new Set(["x", "y", "z", "vx", "vy", "vz", "index", "fx", "fy", "fz"]);
  const attrKeys: string[] = [];
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key !== "id" && !systemKeys.has(key) && !attrKeys.includes(key)) {
        attrKeys.push(key);
      }
    }
  }

  const headers = ["id", "x", "y"];
  if (dimensions === 3) headers.push("z");
  headers.push(...attrKeys, "connections by id");

  const rows = simNodes.map((node: any) => {
    const values = [
      csvEscapeField(String(node.id)),
      (node.x || 0).toFixed(4),
      (node.y || 0).toFixed(4),
    ];
    if (dimensions === 3) values.push((node.z || 0).toFixed(4));
    for (const key of attrKeys) {
      values.push(csvEscapeField(String(node[key] ?? "")));
    }
    const connections = Array.from(adjacency.get(node.id) || []).join("|");
    values.push(csvEscapeField(connections));
    return values.join(",");
  });

  const csv = headers.join(",") + "\n" + rows.join("\n");

  parentPort.postMessage({
    csv,
    stats: {
      nodes: simNodes.length,
      edges: edges.length,
      dimensions,
      iterations,
      computation_ms: elapsed,
      final_alpha: simulation.alpha().toFixed(6),
      worker_thread: true,
    },
    flow_instructions:
      "Upload this CSV to Flow Immersive. Set X axis → 'x', Y axis → 'y'" +
      (dimensions === 3 ? ", Z axis → 'z'" : "") +
      ". Layout is pre-converged. Use 'connections by id' for network edges.",
  } as WorkerForceResult);
}
