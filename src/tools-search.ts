import { parseCSVLine, csvEscapeField } from "./csv-utils.js";

// ============================================================================
// TOOL 19: flow_semantic_search
// ============================================================================

export interface SemanticSearchInput {
  query: string;
  category?: string;
  template_type?: string;
  max_results?: number;
  sort_by?: "relevance" | "views" | "recent";
}

interface CachedCatalog {
  flows: FlowEntry[];
  timestamp: number;
}

export interface FlowEntry {
  selector: string;
  title: string;
  description: string;
  categories: string[];
  view_count: number;
  creator: string;
  template_type: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let catalogCache: CachedCatalog | null = null;

// Multi-signal scoring
export function scoreMatch(query: string, flow: FlowEntry): { score: number; reasons: string[] } {
  const queryLower = query.toLowerCase();
  const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 2);
  const titleLower = flow.title.toLowerCase();
  const descLower = (flow.description || "").toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // Exact substring in title (3.0)
  if (titleLower.includes(queryLower)) {
    score += 3.0;
    reasons.push("title_exact");
  }

  // Token overlap in title (2.0)
  const titleTokens = titleLower.split(/\s+/);
  const titleOverlap = queryTokens.filter(t => titleTokens.some(tt => tt.includes(t))).length;
  if (titleOverlap > 0) {
    score += (titleOverlap / queryTokens.length) * 2.0;
    reasons.push("title_tokens");
  }

  // Substring in description (1.5)
  if (descLower.includes(queryLower)) {
    score += 1.5;
    reasons.push("description_exact");
  }

  // Token overlap in description (1.0)
  const descTokens = descLower.split(/\s+/);
  const descOverlap = queryTokens.filter(t => descTokens.some(dt => dt.includes(t))).length;
  if (descOverlap > 0) {
    score += (descOverlap / queryTokens.length) * 1.0;
    reasons.push("description_tokens");
  }

  // Category match (2.0)
  if (flow.categories.some(c => c.toLowerCase().includes(queryLower) || queryLower.includes(c.toLowerCase()))) {
    score += 2.0;
    reasons.push("category_match");
  }

  // Template type match (1.5)
  if (flow.template_type && queryLower.includes(flow.template_type.toLowerCase())) {
    score += 1.5;
    reasons.push("template_match");
  }

  return { score, reasons };
}

// Fetch catalog from Flow API (with retry and pagination)
async function fetchCatalog(maxPages: number = 3): Promise<FlowEntry[]> {
  const flows: FlowEntry[] = [];
  const FLOW_API_BASE = "https://api.flow.gl/v1";

  for (let page = 1; page <= maxPages; page++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${FLOW_API_BASE}/flows?public=true&page=${page}`, {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
      });
      clearTimeout(timeout);

      if (!resp.ok) break;
      const data = await resp.json();
      const items = Array.isArray(data) ? data : (data.flows || data.data || []);
      if (items.length === 0) break;

      for (const f of items) {
        flows.push({
          selector: String(f.selector || f.id || ""),
          title: String(f.title || f.name || ""),
          description: String(f.description || ""),
          categories: Array.isArray(f.categories) ? f.categories.map(String) : [],
          view_count: Number(f.view_count || f.views || 0),
          creator: String(f.creator || f.user?.username || "unknown"),
          template_type: String(f.template?.category || f.template_type || ""),
        });
      }
    } catch {
      break; // Network error, stop pagination
    }
  }

  return flows;
}

export async function flowSemanticSearch(input: SemanticSearchInput) {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("Search query is required");
  }

  const maxResults = Math.min(input.max_results ?? 20, 100);

  // Check cache
  const now = Date.now();
  if (!catalogCache || (now - catalogCache.timestamp) > CACHE_TTL_MS) {
    const flows = await fetchCatalog(3);
    if (flows.length > 0) {
      catalogCache = { flows, timestamp: now };
    } else if (catalogCache) {
      // Keep stale cache if fetch fails
    } else {
      throw new Error("Failed to fetch Flow catalog and no cache available");
    }
  }

  let results = catalogCache!.flows.map(flow => {
    const { score, reasons } = scoreMatch(input.query, flow);
    return { ...flow, relevance_score: score, match_reasons: reasons };
  });

  // Apply filters
  if (input.category) {
    results = results.filter(r => r.categories.some(c => c.toLowerCase().includes(input.category!.toLowerCase())));
  }
  if (input.template_type) {
    results = results.filter(r => r.template_type.toLowerCase().includes(input.template_type!.toLowerCase()));
  }

  // Filter to only matches (score > 0)
  results = results.filter(r => r.relevance_score > 0);

  // Sort
  if (input.sort_by === "views") {
    results.sort((a, b) => b.view_count - a.view_count);
  } else if (input.sort_by === "recent") {
    // Default order from API is recent — no re-sort needed
  } else {
    results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  // Normalize scores to 0-1
  const maxScore = results.length > 0 ? results[0].relevance_score : 1;

  const topResults = results.slice(0, maxResults).map(r => ({
    selector: r.selector,
    title: r.title,
    description: r.description,
    relevance_score: Number((r.relevance_score / (maxScore || 1)).toFixed(3)),
    match_reasons: r.match_reasons,
    categories: r.categories,
    view_count: r.view_count,
    creator: r.creator,
    url: `https://a.flow.gl/${r.selector}`,
  }));

  return {
    results: topResults,
    total_matches: results.length,
    query_interpretation: `Searching for "${input.query}"${input.category ? ` in category "${input.category}"` : ""}${input.template_type ? ` of type "${input.template_type}"` : ""}`,
  };
}

// For testing: allow injecting mock catalog
export function _injectCatalogForTesting(flows: FlowEntry[]) {
  catalogCache = { flows, timestamp: Date.now() };
}
export function _clearCatalogCache() {
  catalogCache = null;
}
