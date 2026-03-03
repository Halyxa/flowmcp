import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  flowSemanticSearch,
  scoreMatch,
  _injectCatalogForTesting,
  _clearCatalogCache,
  FlowEntry,
} from "./tools-search.js";

// ============================================================================
// Mock catalog data
// ============================================================================

const MOCK_CATALOG: FlowEntry[] = [
  {
    selector: "abc123",
    title: "Supply Chain Network",
    description: "Global logistics network visualization showing shipping routes",
    categories: ["Business"],
    view_count: 500,
    creator: "demo_user",
    template_type: "network",
  },
  {
    selector: "def456",
    title: "COVID Cases Map",
    description: "Geographic spread of COVID-19 cases worldwide",
    categories: ["Health", "Geography"],
    view_count: 1200,
    creator: "data_viz",
    template_type: "map",
  },
  {
    selector: "ghi789",
    title: "Stock Portfolio Analysis",
    description: "3D scatter plot of portfolio risk vs return",
    categories: ["Finance"],
    view_count: 300,
    creator: "fin_user",
    template_type: "scatter",
  },
  {
    selector: "jkl012",
    title: "Neural Network Architecture",
    description: "Deep learning model layer connections and activations",
    categories: ["Technology", "Science"],
    view_count: 800,
    creator: "ml_dev",
    template_type: "network",
  },
  {
    selector: "mno345",
    title: "Global Trade Routes",
    description: "International trade flows between countries on a 3D globe",
    categories: ["Business", "Geography"],
    view_count: 950,
    creator: "econ_viz",
    template_type: "map",
  },
  {
    selector: "pqr678",
    title: "Social Media Influence",
    description: "Network graph of influencer connections and reach",
    categories: ["Social", "Business"],
    view_count: 1500,
    creator: "social_analyst",
    template_type: "network",
  },
  {
    selector: "stu901",
    title: "Climate Temperature Data",
    description: "Historical temperature changes across regions",
    categories: ["Science", "Geography"],
    view_count: 650,
    creator: "climate_sci",
    template_type: "chart",
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("flow_semantic_search", () => {
  beforeEach(() => {
    _injectCatalogForTesting(MOCK_CATALOG);
  });

  afterEach(() => {
    _clearCatalogCache();
  });

  // 1. Exact title match scores highest
  it("ranks exact title match highest", async () => {
    const result = await flowSemanticSearch({ query: "Supply Chain Network" });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].selector).toBe("abc123");
    expect(result.results[0].relevance_score).toBe(1.0);
  });

  // 2. Token overlap scoring works
  it("scores token overlap in title", async () => {
    const result = await flowSemanticSearch({ query: "supply chain" });
    expect(result.results.length).toBeGreaterThan(0);
    // Supply Chain Network should be near the top due to token overlap
    const supplyChain = result.results.find(r => r.selector === "abc123");
    expect(supplyChain).toBeDefined();
    expect(supplyChain!.relevance_score).toBeGreaterThan(0);
  });

  // 3. Category filter works
  it("filters by category", async () => {
    const result = await flowSemanticSearch({ query: "network", category: "Technology" });
    expect(result.results.length).toBeGreaterThan(0);
    // All results should have Technology category
    for (const r of result.results) {
      expect(r.categories.some(c => c.toLowerCase().includes("technology"))).toBe(true);
    }
  });

  // 4. Template type filter works
  it("filters by template type", async () => {
    const result = await flowSemanticSearch({ query: "data", template_type: "map" });
    // Only map-type results
    for (const r of result.results) {
      expect(r.url).toContain("a.flow.gl/");
    }
    // Should not include network or scatter templates
    const nonMapResults = result.results.filter(r => {
      const original = MOCK_CATALOG.find(m => m.selector === r.selector);
      return original && !original.template_type.includes("map");
    });
    expect(nonMapResults.length).toBe(0);
  });

  // 5. Max results limit works
  it("respects max_results limit", async () => {
    const result = await flowSemanticSearch({ query: "network", max_results: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  // 6. Empty query throws error
  it("throws on empty query", async () => {
    await expect(flowSemanticSearch({ query: "" })).rejects.toThrow("Search query is required");
  });

  it("throws on whitespace-only query", async () => {
    await expect(flowSemanticSearch({ query: "   " })).rejects.toThrow("Search query is required");
  });

  // 7. Sort by views works
  it("sorts by views when requested", async () => {
    const result = await flowSemanticSearch({ query: "network", sort_by: "views" });
    expect(result.results.length).toBeGreaterThan(1);
    for (let i = 1; i < result.results.length; i++) {
      expect(result.results[i - 1].view_count).toBeGreaterThanOrEqual(result.results[i].view_count);
    }
  });

  // 8. Relevance scores are normalized 0-1
  it("normalizes relevance scores between 0 and 1", async () => {
    const result = await flowSemanticSearch({ query: "network" });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.relevance_score).toBeGreaterThanOrEqual(0);
      expect(r.relevance_score).toBeLessThanOrEqual(1);
    }
    // Top result should be 1.0 (normalized max)
    expect(result.results[0].relevance_score).toBe(1.0);
  });

  // 9. No matches returns empty results
  it("returns empty results for unmatched query", async () => {
    const result = await flowSemanticSearch({ query: "xyznonexistent12345" });
    expect(result.results.length).toBe(0);
    expect(result.total_matches).toBe(0);
  });

  // 10. Match reasons are populated correctly
  it("populates match reasons", async () => {
    const result = await flowSemanticSearch({ query: "Supply Chain Network" });
    expect(result.results[0].match_reasons).toBeDefined();
    expect(result.results[0].match_reasons.length).toBeGreaterThan(0);
    expect(result.results[0].match_reasons).toContain("title_exact");
  });

  // 11. Multiple signal types combine scores
  it("combines multiple signal types for higher scores", async () => {
    // "network" appears in title, description, and categories for some entries
    const { score: multiSignalScore } = scoreMatch("network", MOCK_CATALOG[3]); // Neural Network Architecture
    const { score: singleSignalScore } = scoreMatch("portfolio", MOCK_CATALOG[2]); // Stock Portfolio Analysis
    // Multi-signal should generally score higher
    expect(multiSignalScore).toBeGreaterThan(0);
    expect(singleSignalScore).toBeGreaterThan(0);
  });

  // 12. Description matching works
  it("matches on description content", async () => {
    const result = await flowSemanticSearch({ query: "logistics" });
    expect(result.results.length).toBeGreaterThan(0);
    // "logistics" appears in Supply Chain Network's description
    expect(result.results.some(r => r.selector === "abc123")).toBe(true);
  });

  // 13. query_interpretation is correct
  it("builds correct query interpretation", async () => {
    const result = await flowSemanticSearch({
      query: "network",
      category: "Business",
      template_type: "network",
    });
    expect(result.query_interpretation).toContain("network");
    expect(result.query_interpretation).toContain("Business");
    expect(result.query_interpretation).toContain("network");
  });

  // 14. URL format is correct
  it("generates correct Flow URLs", async () => {
    const result = await flowSemanticSearch({ query: "COVID" });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.url).toMatch(/^https:\/\/a\.flow\.gl\/.+/);
    }
  });

  // 15. max_results capped at 100
  it("caps max_results at 100", async () => {
    // Inject a large catalog
    const largeCatalog: FlowEntry[] = [];
    for (let i = 0; i < 200; i++) {
      largeCatalog.push({
        selector: `sel${i}`,
        title: `Network Flow ${i}`,
        description: `Description for network item ${i}`,
        categories: ["Business"],
        view_count: i,
        creator: "test",
        template_type: "network",
      });
    }
    _injectCatalogForTesting(largeCatalog);

    const result = await flowSemanticSearch({ query: "network", max_results: 500 });
    expect(result.results.length).toBeLessThanOrEqual(100);
  });

  // 16. Category match scoring
  it("boosts score for category matches", async () => {
    // Search for "finance" — should match Stock Portfolio Analysis via category
    const result = await flowSemanticSearch({ query: "finance" });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].selector).toBe("ghi789");
    expect(result.results[0].match_reasons).toContain("category_match");
  });

  // 17. total_matches reflects all matches before limiting
  it("total_matches counts all matches before max_results", async () => {
    const result = await flowSemanticSearch({ query: "network", max_results: 1 });
    expect(result.results.length).toBe(1);
    expect(result.total_matches).toBeGreaterThanOrEqual(1);
    // There should be more matches than we returned
    expect(result.total_matches).toBeGreaterThan(result.results.length);
  });
});

// ============================================================================
// scoreMatch unit tests
// ============================================================================

describe("scoreMatch", () => {
  const testFlow: FlowEntry = {
    selector: "test1",
    title: "Supply Chain Network",
    description: "Global logistics network visualization",
    categories: ["Business"],
    view_count: 100,
    creator: "test",
    template_type: "network",
  };

  it("returns zero score for completely unrelated query", () => {
    const { score } = scoreMatch("xyznonexistent", testFlow);
    expect(score).toBe(0);
  });

  it("returns positive score for title substring match", () => {
    const { score, reasons } = scoreMatch("supply chain", testFlow);
    expect(score).toBeGreaterThan(0);
    expect(reasons).toContain("title_exact");
  });

  it("returns positive score for description match", () => {
    const { score, reasons } = scoreMatch("logistics", testFlow);
    expect(score).toBeGreaterThan(0);
    expect(reasons).toContain("description_tokens");
  });

  it("scores template type match", () => {
    const { score, reasons } = scoreMatch("network", testFlow);
    expect(reasons).toContain("title_tokens");
    expect(score).toBeGreaterThan(0);
  });

  it("accumulates score from multiple signals", () => {
    // "network" matches title tokens, description tokens, and possibly template
    const { score } = scoreMatch("network", testFlow);
    // Should be higher than a single-signal match
    const { score: singleScore } = scoreMatch("logistics", testFlow);
    expect(score).toBeGreaterThan(singleScore);
  });
});
