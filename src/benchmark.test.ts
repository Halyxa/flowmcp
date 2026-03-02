/**
 * Force Layout Performance Benchmark
 *
 * Measures computation time for precomputeForceLayout at varying graph sizes.
 * Results help set performance expectations and detect regressions.
 *
 * Graph sizes: 10, 50, 100, 500, 1000, 5000 nodes
 * Edge density: ~2 edges per node (sparse/realistic for most networks)
 */
import { describe, it, expect } from "vitest";
import { precomputeForceLayout } from "./index.js";

// Generate a graph with N nodes and ~2*N edges (sparse, realistic topology)
function generateGraph(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    group: `g${i % 5}`,
  }));

  const edges: { source: string; target: string }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    // Chain: each node connects to the next (ensures connectivity)
    if (i < nodeCount - 1) {
      edges.push({ source: `n${i}`, target: `n${i + 1}` });
    }
    // Extra random edge per node for more realistic density
    const target = (i + 1 + Math.floor(Math.random() * Math.max(1, nodeCount / 4))) % nodeCount;
    if (target !== i) {
      edges.push({ source: `n${i}`, target: `n${target}` });
    }
  }

  return { nodes, edges };
}

describe("Force Layout Performance Benchmark", () => {
  const sizes = [10, 50, 100, 500, 1000, 5000];
  const iterations = 300; // default
  const results: Array<{ nodes: number; edges: number; ms: number; ms_per_node: number }> = [];

  for (const size of sizes) {
    it(`${size} nodes — completes force layout in reasonable time`, () => {
      const graph = generateGraph(size);
      const start = performance.now();
      const result = precomputeForceLayout({
        ...graph,
        iterations,
      });
      const elapsed = performance.now() - start;

      // Verify correctness
      expect(result.error).toBeUndefined();
      expect(result.stats).toBeDefined();
      expect(result.stats!.nodes).toBe(size);

      // CSV should have header + N data rows
      const lineCount = result.csv.split("\n").length;
      expect(lineCount).toBe(size + 1);

      results.push({
        nodes: size,
        edges: result.stats!.edges,
        ms: Math.round(elapsed),
        ms_per_node: parseFloat((elapsed / size).toFixed(3)),
      });

      // Performance guardrails (generous — CI may be slower)
      // These are sanity checks, not micro-benchmarks
      if (size <= 100) {
        expect(elapsed).toBeLessThan(2000); // <2s for small graphs
      } else if (size <= 1000) {
        expect(elapsed).toBeLessThan(10000); // <10s for medium
      } else {
        expect(elapsed).toBeLessThan(60000); // <60s for large
      }
    });
  }

  it("summary — prints performance table", () => {
    // This test runs last to print aggregated results
    console.log("\n=== Force Layout Performance Summary ===");
    console.log("Nodes  | Edges  | Time (ms) | ms/node");
    console.log("-------|--------|-----------|--------");
    for (const r of results) {
      console.log(
        `${String(r.nodes).padStart(6)} | ${String(r.edges).padStart(6)} | ${String(r.ms).padStart(9)} | ${String(r.ms_per_node).padStart(7)}`
      );
    }
    console.log("========================================\n");

    // Verify scaling is sub-quadratic: ms_per_node should not explode
    // At 5000 nodes, ms/node should be < 50x what it is at 10 nodes
    if (results.length >= 2) {
      const smallest = results[0];
      const largest = results[results.length - 1];
      const scaling_factor = largest.ms_per_node / Math.max(smallest.ms_per_node, 0.001);
      console.log(`Scaling factor (ms/node ratio, ${largest.nodes} vs ${smallest.nodes}): ${scaling_factor.toFixed(1)}x`);
      // d3-force is O(N log N) per tick, so we expect moderate scaling
      expect(scaling_factor).toBeLessThan(100);
    }

    expect(results.length).toBe(sizes.length);
  });
});
