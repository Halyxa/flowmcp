/**
 * Discovery Narrator — turns data exploration into narrative stories.
 *
 * Takes a CSV dataset and an exploration path (sequence of actions the user
 * took while exploring) and weaves them into a dramatic story with chapters,
 * camera waypoints for 3D visualization, and a shareable tweet-length summary.
 */

import { parseCSVLine, csvEscapeField, parseCsvToRows, normalizeCsvArgs } from "./csv-utils.js";

// ============================================================================
// Public interfaces
// ============================================================================

export interface ExplorationStep {
  action: string; // "viewed_column", "detected_anomaly", "found_correlation", "discovered_outlier", "viewed_node", "traversed_edge", "discovered_bridge"
  target: string; // column name, entity name, "X -> Y"
  finding?: string;
}

export interface DiscoveryNarratorInput {
  csv_data: string;
  csv_content?: string;
  exploration_path: ExplorationStep[];
}

export interface Chapter {
  title: string;
  body: string;
  exploration_step: number;
}

export interface CameraWaypoint {
  position: { x: number; y: number; z: number };
  focus_label: string;
  chapter_index: number;
}

export interface DiscoveryNarratorResult {
  narrative: string;
  chapters: Chapter[];
  camera_waypoints: CameraWaypoint[];
  story_arc: string;
  shareable_summary: string;
}

// ============================================================================
// Internal helpers (prefixed with narrator_)
// ============================================================================

interface NarratorColumnProfile {
  name: string;
  isNumeric: boolean;
  min: number;
  max: number;
  mean: number;
  uniqueCount: number;
}

function narrator_profileColumns(headers: string[], rows: string[][]): NarratorColumnProfile[] {
  return headers.map((name, idx) => {
    const rawValues = rows.map((r) => (r[idx] ?? "").trim());
    const numericValues: number[] = [];
    for (const v of rawValues) {
      if (v === "") continue;
      const n = Number(v);
      if (!isNaN(n)) numericValues.push(n);
    }
    const isNumeric = numericValues.length > 0 && numericValues.length >= rawValues.filter((v) => v !== "").length * 0.7;
    const uniqueSet = new Set(rawValues.filter((v) => v !== ""));
    return {
      name,
      isNumeric,
      min: isNumeric ? Math.min(...numericValues) : 0,
      max: isNumeric ? Math.max(...numericValues) : 0,
      mean: isNumeric && numericValues.length > 0 ? numericValues.reduce((s, v) => s + v, 0) / numericValues.length : 0,
      uniqueCount: uniqueSet.size,
    };
  });
}

function narrator_classifyArc(steps: ExplorationStep[]): string {
  if (steps.length === 0) return "discovery";

  const counts: Record<string, number> = {};
  for (const s of steps) {
    counts[s.action] = (counts[s.action] || 0) + 1;
  }

  const bridgeCount = counts["discovered_bridge"] || 0;
  if (bridgeCount >= 2) return "convergence";

  const journeyActions = (counts["traversed_edge"] || 0) + (counts["viewed_node"] || 0);
  const discoveryActions = (counts["detected_anomaly"] || 0) + (counts["discovered_outlier"] || 0);
  const revelationActions = (counts["found_correlation"] || 0);

  // Majority voting
  const total = steps.length;
  if (journeyActions / total > 0.5) return "journey";
  if (revelationActions / total > 0.5) return "revelation";
  if (discoveryActions > 0) return "discovery";
  if (revelationActions > 0) return "revelation";

  return "discovery";
}

const TITLE_TEMPLATES: Record<string, (target: string) => string> = {
  viewed_column: (t) => `First Look: ${t}`,
  detected_anomaly: (t) => `The Anomaly: ${t}`,
  found_correlation: (t) => `The Connection: ${t}`,
  discovered_outlier: (t) => `The Exception: ${t}`,
  viewed_node: (t) => `Meeting ${t}`,
  traversed_edge: (t) => `The Bridge: ${t}`,
  discovered_bridge: (t) => `The Keystone: ${t}`,
};

function narrator_chapterTitle(step: ExplorationStep): string {
  const fn = TITLE_TEMPLATES[step.action];
  if (fn) return fn(step.target);
  return `Exploring: ${step.target}`;
}

const TRANSITIONS: Record<string, string[]> = {
  journey: ["Starting from", "Moving to", "Arriving at", "Passing through", "Finally reaching"],
  discovery: ["At first glance", "But then", "Suddenly", "Upon closer inspection", "And there it was"],
  revelation: ["The data whispered", "A pattern emerged", "The connection was clear", "Hidden in plain sight", "Everything aligned"],
  convergence: ["One path began at", "Another thread led to", "The threads converged at", "All roads met at", "The picture was complete at"],
  mystery: ["Something felt off about", "The clue was in", "Against all odds", "The contradiction revealed", "The truth behind"],
};

function narrator_getTransition(arc: string, index: number): string {
  const pool = TRANSITIONS[arc] || TRANSITIONS["discovery"];
  return pool[index % pool.length];
}

function narrator_buildChapterBody(
  step: ExplorationStep,
  profiles: NarratorColumnProfile[],
  arc: string,
  stepIndex: number,
): string {
  const transition = narrator_getTransition(arc, stepIndex);
  const finding = step.finding || `an interesting pattern in ${step.target}`;

  // Try to enrich with column stats
  const matchingProfile = profiles.find((p) => p.name === step.target);
  let statsContext = "";
  if (matchingProfile && matchingProfile.isNumeric) {
    statsContext = ` (ranging from ${matchingProfile.min} to ${matchingProfile.max})`;
  }

  return `${transition}, ${step.target} revealed something unexpected${statsContext}. ${finding}.`;
}

function narrator_generateWaypoint(stepIndex: number, totalSteps: number, step: ExplorationStep, chapterIndex: number): CameraWaypoint {
  // Place waypoints in a spiral path
  const angle = totalSteps > 1 ? (stepIndex / (totalSteps - 1)) * Math.PI * 2 : 0;
  const radius = 5 + stepIndex * 2;
  const height = 2 + stepIndex * 1.5;
  return {
    position: {
      x: Math.round(Math.cos(angle) * radius * 100) / 100,
      y: Math.round(height * 100) / 100,
      z: Math.round(Math.sin(angle) * radius * 100) / 100,
    },
    focus_label: step.target,
    chapter_index: chapterIndex,
  };
}

function narrator_buildSummary(steps: ExplorationStep[], headers: string[], arc: string): string {
  const datasetName = `a ${headers.length}-column dataset`;
  let keyFinding = "";
  let dramaticFinding = "";

  // Find most dramatic finding
  for (const s of steps) {
    if (s.finding) {
      if (s.action === "detected_anomaly" || s.action === "discovered_outlier" || s.action === "discovered_bridge") {
        dramaticFinding = `${s.target}: ${s.finding}`;
      }
      if (!keyFinding) {
        keyFinding = s.finding;
      }
    }
  }

  if (!keyFinding && steps.length > 0) {
    keyFinding = `explored ${steps.length} features`;
  }
  if (!dramaticFinding) {
    dramaticFinding = keyFinding;
  }

  let summary = `In ${datasetName}, I discovered that ${keyFinding}. ${dramaticFinding}. #DataExploration`;
  // Truncate to < 280 if needed
  if (summary.length >= 280) {
    summary = summary.slice(0, 276) + "...";
  }
  return summary;
}

// ============================================================================
// Main export
// ============================================================================

export function flowDiscoveryNarrator(input: DiscoveryNarratorInput): DiscoveryNarratorResult {
  // Normalize csv_content <-> csv_data
  const normalized = normalizeCsvArgs(input as unknown as Record<string, unknown>);
  const csvData = (normalized.csv_data as string) || "";
  const explorationPath: ExplorationStep[] = input.exploration_path || [];

  const { headers, rows } = parseCsvToRows(csvData);
  const profiles = narrator_profileColumns(headers, rows);

  // Handle empty exploration path
  if (explorationPath.length === 0) {
    const colList = headers.length > 0 ? headers.join(", ") : "unknown columns";
    const genericNarrative = `This dataset awaits exploration. With ${headers.length} columns (${colList}) and ${rows.length} rows, a world of discovery lies ahead.`;
    return {
      narrative: genericNarrative,
      chapters: [
        {
          title: "The Uncharted Dataset",
          body: genericNarrative,
          exploration_step: 0,
        },
      ],
      camera_waypoints: [
        {
          position: { x: 0, y: 5, z: 10 },
          focus_label: headers[0] || "data",
          chapter_index: 0,
        },
      ],
      story_arc: "discovery",
      shareable_summary: `A ${headers.length}-column dataset with ${rows.length} rows awaits exploration. #DataExploration`,
    };
  }

  // Classify story arc
  const storyArc = narrator_classifyArc(explorationPath);

  // Build chapters — one per step (or group adjacent same-action steps)
  const chapters: Chapter[] = [];
  let i = 0;
  while (i < explorationPath.length) {
    const step = explorationPath[i];
    // Group adjacent steps of same action type
    let j = i + 1;
    while (j < explorationPath.length && explorationPath[j].action === step.action) {
      j++;
    }

    if (j - i > 1) {
      // Grouped chapter
      const groupSteps = explorationPath.slice(i, j);
      const title = narrator_chapterTitle(step);
      const bodies = groupSteps.map((s, gi) => narrator_buildChapterBody(s, profiles, storyArc, i + gi));
      chapters.push({
        title,
        body: bodies.join(" "),
        exploration_step: i,
      });
    } else {
      // Single step chapter
      chapters.push({
        title: narrator_chapterTitle(step),
        body: narrator_buildChapterBody(step, profiles, storyArc, i),
        exploration_step: i,
      });
    }
    i = j;
  }

  // Generate camera waypoints — one per chapter
  const waypoints: CameraWaypoint[] = chapters.map((ch, ci) => {
    const stepIdx = ch.exploration_step;
    const step = explorationPath[stepIdx];
    return narrator_generateWaypoint(ci, chapters.length, step, ci);
  });

  // Compose full narrative
  const narrativeParts = chapters.map((ch) => `## ${ch.title}\n\n${ch.body}`);
  const narrative = narrativeParts.join("\n\n");

  // Shareable summary
  const shareableSummary = narrator_buildSummary(explorationPath, headers, storyArc);

  return {
    narrative,
    chapters,
    camera_waypoints: waypoints,
    story_arc: storyArc,
    shareable_summary: shareableSummary,
  };
}
