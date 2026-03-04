/**
 * Viral Video Spec — auto-generates 30-second TikTok-ready video specs
 * from network traversal paths.
 *
 * Given a network CSV and a navigation path (ordered node IDs), produces
 * camera keyframes, node highlights, text overlays, and a narrative caption
 * suitable for driving a 3D video renderer.
 */

import { parseCsvToRows, normalizeCsvArgs } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface ViralVideoInput {
  csv_data: string;
  navigation_path: string[];
  duration_seconds?: number;
}

export interface CameraKeyframe {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  timestamp_ms: number;
  node_id: string;
  easing: string;
}

export interface NodeHighlight {
  node_id: string;
  start_ms: number;
  end_ms: number;
  color: string;
  pulse: boolean;
}

export interface TextOverlay {
  text: string;
  start_ms: number;
  end_ms: number;
  position: string;
  style: string;
}

export interface ViralVideoResult {
  camera_keyframes: CameraKeyframe[];
  highlights: NodeHighlight[];
  text_overlays: TextOverlay[];
  narrative_caption: string;
  duration_ms: number;
  metadata: {
    node_count: number;
    edge_count: number;
    path_length: number;
    groups_traversed: string[];
  };
}

// ============================================================================
// Internal helpers (prefixed with video_)
// ============================================================================

const VIDEO_PALETTE = ["#FF6B35", "#F7C548", "#E8544E", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#F59E0B"];
const VIDEO_NEIGHBOR_COLOR = "#6B7280";

/** Simple deterministic hash for a string → number. */
function video_hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Seeded pseudo-random number generator (simple LCG). */
function video_seededRandom(seed: number): () => number {
  let state = Math.abs(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface VideoNode {
  id: string;
  connections: string[];
  group: string;
  label: string;
  x: number;
  y: number;
  z: number;
}

function video_buildNodeMap(
  headers: string[],
  rows: string[][]
): { nodes: Map<string, VideoNode>; edgeCount: number } {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  const idIdx = lowerHeaders.indexOf("id");
  const connIdx = lowerHeaders.indexOf("connections");

  if (idIdx < 0 || connIdx < 0) {
    return { nodes: new Map(), edgeCount: 0 };
  }

  // Find group/category column
  let groupIdx = lowerHeaders.indexOf("group");
  if (groupIdx < 0) groupIdx = lowerHeaders.indexOf("category");
  if (groupIdx < 0) groupIdx = lowerHeaders.indexOf("domain");

  // Find label column
  let labelIdx = lowerHeaders.indexOf("label");
  if (labelIdx < 0) labelIdx = lowerHeaders.indexOf("name");

  const nodes = new Map<string, VideoNode>();
  let totalEdges = 0;

  for (const row of rows) {
    const id = (row[idIdx] ?? "").trim();
    if (!id) continue;
    const connStr = (row[connIdx] ?? "").trim();
    const connections = connStr ? connStr.split("|").map((c) => c.trim()).filter(Boolean) : [];
    const group = groupIdx >= 0 ? (row[groupIdx] ?? "").trim() : "";
    const label = labelIdx >= 0 ? (row[labelIdx] ?? "").trim() : id;

    totalEdges += connections.length;
    nodes.set(id, { id, connections, group, label, x: 0, y: 0, z: 0 });
  }

  // Edges are counted per-direction in the CSV, so total unique ≈ totalEdges
  // (we keep total as-is since direction matters for video narrative)
  return { nodes, edgeCount: totalEdges };
}

function video_layoutNodes(nodes: Map<string, VideoNode>): void {
  const nodeList = Array.from(nodes.values());
  if (nodeList.length === 0) return;

  // Initial positions: seeded pseudo-random on a sphere
  for (const node of nodeList) {
    const rng = video_seededRandom(video_hash(node.id));
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = 80 + rng() * 40;
    node.x = r * Math.sin(phi) * Math.cos(theta);
    node.y = r * Math.sin(phi) * Math.sin(theta);
    node.z = r * Math.cos(phi);
  }

  // Simple spring iterations: pull connected nodes closer
  const SPRING_K = 0.05;
  const ITERATIONS = 10;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const node of nodeList) {
      for (const connId of node.connections) {
        const other = nodes.get(connId);
        if (!other) continue;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const dz = other.z - node.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        // Target distance ~50
        const force = (dist - 50) * SPRING_K;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        node.x += fx;
        node.y += fy;
        node.z += fz;
        other.x -= fx;
        other.y -= fy;
        other.z -= fz;
      }
    }
  }
}

// ============================================================================
// Main function
// ============================================================================

export function flowViralVideoSpec(input: ViralVideoInput): ViralVideoResult {
  // Normalize csv_content / csv_data
  const normalized = normalizeCsvArgs(input as unknown as Record<string, unknown>);
  const csvData = (normalized.csv_data as string) || "";
  const navPath = input.navigation_path || [];
  const durationSec = Math.max(5, Math.min(60, input.duration_seconds ?? 30));
  const durationMs = durationSec * 1000;

  // Parse CSV
  const { headers, rows } = parseCsvToRows(csvData);
  const { nodes, edgeCount } = video_buildNodeMap(headers, rows);

  // Layout
  video_layoutNodes(nodes);

  // Filter navigation path to existing nodes
  const validPath = navPath.filter((id) => nodes.has(id));

  // Empty path → minimal result
  if (validPath.length === 0) {
    return {
      camera_keyframes: [],
      highlights: [],
      text_overlays: [],
      narrative_caption: "",
      duration_ms: durationMs,
      metadata: {
        node_count: nodes.size,
        edge_count: edgeCount,
        path_length: 0,
        groups_traversed: [],
      },
    };
  }

  // Collect groups traversed
  const groupsSet = new Set<string>();
  for (const id of validPath) {
    const node = nodes.get(id)!;
    if (node.group) groupsSet.add(node.group);
  }
  const groupsTraversed = Array.from(groupsSet);

  // --- Camera keyframes ---
  const camera_keyframes: CameraKeyframe[] = [];
  for (let i = 0; i < validPath.length; i++) {
    const node = nodes.get(validPath[i])!;
    const t = validPath.length === 1 ? 0 : (i / (validPath.length - 1)) * durationMs;
    const angle = (Math.PI / 6) * i; // 30° orbit variation per step
    const camDist = 40;
    camera_keyframes.push({
      position: {
        x: node.x + Math.cos(angle) * camDist,
        y: node.y + 20,
        z: node.z + Math.sin(angle) * camDist,
      },
      lookAt: { x: node.x, y: node.y, z: node.z },
      timestamp_ms: Math.round(t),
      node_id: node.id,
      easing: "ease-in-out",
    });
  }

  // --- Highlights ---
  const highlights: NodeHighlight[] = [];
  const segmentMs = validPath.length === 1 ? durationMs : durationMs / validPath.length;

  for (let i = 0; i < validPath.length; i++) {
    const node = nodes.get(validPath[i])!;
    const startMs = Math.round(i * segmentMs);
    const endMs = Math.round((i + 1) * segmentMs);
    const color = VIDEO_PALETTE[i % VIDEO_PALETTE.length];

    // Primary highlight for visited node
    highlights.push({
      node_id: node.id,
      start_ms: startMs,
      end_ms: endMs,
      color,
      pulse: false,
    });

    // Connected nodes pulse during this segment
    for (const connId of node.connections) {
      if (nodes.has(connId) && !validPath.includes(connId)) {
        highlights.push({
          node_id: connId,
          start_ms: startMs,
          end_ms: endMs,
          color: VIDEO_NEIGHBOR_COLOR,
          pulse: true,
        });
      }
    }
  }

  // --- Text overlays ---
  const text_overlays: TextOverlay[] = [];
  const firstName = nodes.get(validPath[0])!.label || validPath[0];
  const lastName = nodes.get(validPath[validPath.length - 1])!.label || validPath[validPath.length - 1];

  // Opening title
  text_overlays.push({
    text: `From ${firstName} to ${lastName}`,
    start_ms: 0,
    end_ms: Math.min(3000, durationMs),
    position: "center",
    style: "title",
  });

  // Per-hop subtitles
  for (let i = 0; i < validPath.length; i++) {
    const node = nodes.get(validPath[i])!;
    const hopStart = camera_keyframes[i].timestamp_ms;
    const hopEnd = Math.min(hopStart + 2500, durationMs);
    const infoText = node.group ? `${node.label || node.id} — ${node.group}` : (node.label || node.id);
    text_overlays.push({
      text: infoText,
      start_ms: hopStart,
      end_ms: hopEnd,
      position: "bottom",
      style: "subtitle",
    });
  }

  // Closing title
  const closingStart = Math.max(0, durationMs - 3000);
  text_overlays.push({
    text: `${validPath.length} connections. One journey.`,
    start_ms: closingStart,
    end_ms: durationMs,
    position: "center",
    style: "title",
  });

  // --- Narrative caption ---
  const groupPhrase = groupsTraversed.length > 0
    ? groupsTraversed.join(", ")
    : "the network";
  const firstNode = validPath[0];
  const lastNode = validPath[validPath.length - 1];
  const detail = validPath.length > 2
    ? `Passing through ${validPath.slice(1, -1).join(", ")} along the way.`
    : `A direct link between two nodes.`;
  const narrative_caption = `From ${firstNode} to ${lastNode} through ${validPath.length - 1} connections, crossing ${groupPhrase}. ${detail}`;

  return {
    camera_keyframes,
    highlights,
    text_overlays,
    narrative_caption,
    duration_ms: durationMs,
    metadata: {
      node_count: nodes.size,
      edge_count: edgeCount,
      path_length: validPath.length,
      groups_traversed: groupsTraversed,
    },
  };
}
