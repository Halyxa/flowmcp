/**
 * Explorer Profile — analytical DNA fingerprinting for data explorers.
 *
 * Analyzes a sequence of exploration actions (tool usage) to build
 * a personality profile: dominant archetype, strengths, blind spots,
 * and recommended tools to broaden analytical range.
 */

// ============================================================================
// Public interfaces
// ============================================================================

export interface ExplorationAction {
  tool: string;
  columns?: string[];
  finding?: string;
}

export interface ExplorerProfileInput {
  exploration_actions: ExplorationAction[];
}

export interface ExplorerProfileResult {
  dominant_archetype: string;
  archetype_scores: Record<string, number>;
  dna_string: string;
  strengths: string[];
  blind_spots: string[];
  recommended_tools: string[];
  exploration_summary: string;
}

// ============================================================================
// Internal constants (prefixed with explorer_)
// ============================================================================

const ARCHETYPES = [
  "anomaly_hunter",
  "correlation_spotter",
  "causal_reasoner",
  "network_navigator",
  "pattern_seeker",
  "detail_diver",
  "big_picture_thinker",
  "creative_connector",
] as const;

type Archetype = (typeof ARCHETYPES)[number];

type AffinityMap = Partial<Record<Archetype, number>>;

const TOOL_ARCHETYPE_MAP: Record<string, AffinityMap> = {
  flow_anomaly_detect: { anomaly_hunter: 1.0, pattern_seeker: 0.3 },
  flow_anomaly_explain: { anomaly_hunter: 0.9, causal_reasoner: 0.5 },
  flow_near_miss_detector: { anomaly_hunter: 0.8, causal_reasoner: 0.5 },
  flow_outlier_fence: { anomaly_hunter: 0.9, detail_diver: 0.4 },
  flow_correlation_matrix: { correlation_spotter: 1.0, pattern_seeker: 0.4 },
  flow_regression_analysis: { correlation_spotter: 0.8, causal_reasoner: 0.6 },
  flow_pca_reduce: { big_picture_thinker: 0.8, correlation_spotter: 0.5 },
  flow_compute_graph_metrics: { network_navigator: 1.0, big_picture_thinker: 0.4 },
  flow_precompute_force_layout: { network_navigator: 0.8, big_picture_thinker: 0.3 },
  flow_query_graph: { network_navigator: 0.9 },
  flow_famous_network: { network_navigator: 0.7, creative_connector: 0.5 },
  flow_describe_dataset: { big_picture_thinker: 0.5, detail_diver: 0.3 },
  flow_column_stats: { detail_diver: 0.8, pattern_seeker: 0.3 },
  flow_sparkle_engine: { creative_connector: 0.6, pattern_seeker: 0.5 },
  flow_quest_generator: { creative_connector: 0.7, pattern_seeker: 0.4 },
  flow_exploration_dna: { big_picture_thinker: 0.7, creative_connector: 0.4 },
  flow_filter_rows: { detail_diver: 0.7 },
  flow_cluster_data: { pattern_seeker: 0.9, big_picture_thinker: 0.4 },
  flow_time_series_animate: { pattern_seeker: 0.6, causal_reasoner: 0.5 },
  flow_waypoint_map: { big_picture_thinker: 0.6, pattern_seeker: 0.3 },
  flow_data_world_builder: { creative_connector: 0.8, big_picture_thinker: 0.6 },
  flow_progressive_disclosure: { detail_diver: 0.5, creative_connector: 0.4 },
  flow_insight_scorer: { causal_reasoner: 0.7, detail_diver: 0.5 },
  flow_visor_mode: {}, // handled specially based on finding content
};

const EXPLORER_DEFAULT_AFFINITY: AffinityMap = { pattern_seeker: 0.2 };

// ============================================================================
// Visor mode detection
// ============================================================================

function explorer_visorAffinity(action: ExplorationAction): AffinityMap {
  const finding = (action.finding ?? "").toLowerCase();
  if (finding.includes("anomal") || finding.includes("outlier")) {
    return { anomaly_hunter: 0.8, detail_diver: 0.3 };
  }
  if (finding.includes("relational") || finding.includes("correlat")) {
    return { correlation_spotter: 0.8, pattern_seeker: 0.3 };
  }
  if (finding.includes("network") || finding.includes("graph")) {
    return { network_navigator: 0.8, big_picture_thinker: 0.3 };
  }
  if (finding.includes("cluster") || finding.includes("pattern")) {
    return { pattern_seeker: 0.8, big_picture_thinker: 0.3 };
  }
  if (finding.includes("detail") || finding.includes("drill")) {
    return { detail_diver: 0.8 };
  }
  // Generic visor usage
  return { big_picture_thinker: 0.4, pattern_seeker: 0.3 };
}

// ============================================================================
// Archetype descriptions
// ============================================================================

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  anomaly_hunter: "Anomaly Hunter",
  correlation_spotter: "Correlation Spotter",
  causal_reasoner: "Causal Reasoner",
  network_navigator: "Network Navigator",
  pattern_seeker: "Pattern Seeker",
  detail_diver: "Detail Diver",
  big_picture_thinker: "Big Picture Thinker",
  creative_connector: "Creative Connector",
};

const ARCHETYPE_INITIALS: Record<Archetype, string> = {
  anomaly_hunter: "AH",
  correlation_spotter: "CS",
  causal_reasoner: "CR",
  network_navigator: "NN",
  pattern_seeker: "PS",
  detail_diver: "DD",
  big_picture_thinker: "BP",
  creative_connector: "CC",
};

const STRENGTH_DESCRIPTIONS: Record<Archetype, string> = {
  anomaly_hunter: "You have a sharp eye for anomalies — you naturally gravitate toward outliers and exceptions",
  correlation_spotter: "You excel at spotting relationships between variables — correlations and regressions are your domain",
  causal_reasoner: "You think in cause-and-effect chains — always asking why, not just what",
  network_navigator: "You see the world as a web of connections — network structures and graph relationships come naturally",
  pattern_seeker: "You instinctively find recurring patterns — clusters, trends, and regularities jump out at you",
  detail_diver: "You go deep — no detail escapes your attention, and you thrive on granular analysis",
  big_picture_thinker: "You zoom out to see the whole landscape — dimensionality reduction and overviews are your forte",
  creative_connector: "You make unexpected connections — bridging domains and finding novel perspectives others miss",
};

const BLIND_SPOT_DESCRIPTIONS: Record<Archetype, string> = {
  anomaly_hunter: "You might miss anomalies and outliers that could reveal important edge cases",
  correlation_spotter: "You might overlook correlations and variable relationships hiding in your data",
  causal_reasoner: "You might skip asking why patterns exist — causation matters as much as observation",
  network_navigator: "You might miss network structures and how entities connect to each other",
  pattern_seeker: "You might overlook recurring patterns, clusters, and trends in your data",
  detail_diver: "You might skim past important details by staying at a high level",
  big_picture_thinker: "You might miss the forest for the trees — step back and see the whole landscape",
  creative_connector: "You might miss creative cross-domain connections that could spark new insights",
};

const ARCHETYPE_TOOLS: Record<Archetype, string[]> = {
  anomaly_hunter: ["flow_anomaly_detect", "flow_anomaly_explain", "flow_near_miss_detector", "flow_outlier_fence"],
  correlation_spotter: ["flow_correlation_matrix", "flow_regression_analysis", "flow_pca_reduce"],
  causal_reasoner: ["flow_regression_analysis", "flow_time_series_animate", "flow_insight_scorer"],
  network_navigator: ["flow_compute_graph_metrics", "flow_precompute_force_layout", "flow_query_graph", "flow_famous_network"],
  pattern_seeker: ["flow_cluster_data", "flow_time_series_animate", "flow_column_stats"],
  detail_diver: ["flow_column_stats", "flow_filter_rows", "flow_outlier_fence"],
  big_picture_thinker: ["flow_pca_reduce", "flow_describe_dataset", "flow_exploration_dna", "flow_waypoint_map"],
  creative_connector: ["flow_sparkle_engine", "flow_quest_generator", "flow_data_world_builder"],
};

// ============================================================================
// Main function
// ============================================================================

export function flowExplorerProfile(input: ExplorerProfileInput): ExplorerProfileResult {
  const actions = input.exploration_actions ?? [];

  // Initialize scores
  const rawScores: Record<Archetype, number> = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) {
    rawScores[a] = 0;
  }

  // Handle empty actions
  if (actions.length === 0) {
    const balancedScores: Record<string, number> = {};
    for (const a of ARCHETYPES) {
      balancedScores[a] = 0.125;
    }
    return {
      dominant_archetype: "Curious Beginner",
      archetype_scores: balancedScores,
      dna_string: "CB-000",
      strengths: ["You're just getting started — every direction is open to you"],
      blind_spots: ["Try any tool to begin discovering your analytical style"],
      recommended_tools: ["flow_describe_dataset", "flow_anomaly_detect"],
      exploration_summary: "After 0 exploration actions, your analytical style is Curious Beginner. Start exploring to discover your strengths!",
    };
  }

  // Collect used tools
  const usedTools = new Set<string>();

  // Accumulate weighted scores
  for (const action of actions) {
    const toolName = (action.tool ?? "").trim();
    if (!toolName) continue;

    usedTools.add(toolName);

    let affinities: AffinityMap;
    if (toolName === "flow_visor_mode") {
      affinities = explorer_visorAffinity(action);
    } else {
      affinities = TOOL_ARCHETYPE_MAP[toolName] ?? EXPLORER_DEFAULT_AFFINITY;
    }

    for (const [archetype, weight] of Object.entries(affinities)) {
      rawScores[archetype as Archetype] += weight as number;
    }
  }

  // Normalize to 0-1
  const maxScore = Math.max(...Object.values(rawScores));
  const normalizedScores: Record<string, number> = {};

  if (maxScore > 0) {
    for (const a of ARCHETYPES) {
      normalizedScores[a] = Math.round((rawScores[a] / maxScore) * 1000) / 1000;
    }
  } else {
    // All zeros (e.g., actions with empty tool names)
    for (const a of ARCHETYPES) {
      normalizedScores[a] = 0.125;
    }
  }

  // Sort archetypes by score descending
  const sorted = [...ARCHETYPES].sort((a, b) => normalizedScores[b] - normalizedScores[a]);
  const dominant = sorted[0];
  const top2 = sorted.slice(0, 2);
  const bottom2 = sorted.slice(-2).reverse();

  // DNA string: top 3 initials + hex score levels
  const top3 = sorted.slice(0, 3);
  const hexPart = top3
    .map((a) => {
      const val = Math.round(normalizedScores[a] * 255);
      return val.toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
  const dnaString = top3.map((a) => ARCHETYPE_INITIALS[a]).join("-") + "-" + hexPart;

  // Strengths
  const strengths = top2.map((a) => STRENGTH_DESCRIPTIONS[a]);

  // Blind spots
  const blindSpots = bottom2.map((a) => BLIND_SPOT_DESCRIPTIONS[a]);

  // Recommended tools: for bottom 2 archetypes, suggest unused tools
  const recommendedTools: string[] = [];
  for (const archetype of bottom2) {
    const candidates = ARCHETYPE_TOOLS[archetype] ?? [];
    for (const tool of candidates) {
      if (!usedTools.has(tool) && !recommendedTools.includes(tool)) {
        recommendedTools.push(tool);
        if (recommendedTools.length >= 4) break;
      }
    }
    if (recommendedTools.length >= 4) break;
  }

  // Exploration summary
  const dominantLabel = maxScore > 0 ? ARCHETYPE_LABELS[dominant] : "Curious Beginner";
  const topLabels = top2.map((a) => ARCHETYPE_LABELS[a]).join(" and ");
  const bottomLabel = ARCHETYPE_LABELS[sorted[sorted.length - 1]];
  const summary = `After ${actions.length} exploration action${actions.length === 1 ? "" : "s"}, your analytical style is ${dominantLabel}. You excel at ${topLabels} but may want to explore ${bottomLabel}.`;

  return {
    dominant_archetype: dominantLabel,
    archetype_scores: normalizedScores,
    dna_string: dnaString,
    strengths,
    blind_spots: blindSpots,
    recommended_tools: recommendedTools,
    exploration_summary: summary,
  };
}
