/**
 * Tests for flow_waypoint_map (Tool 66) in tools-v5.ts
 *
 * Waypoint Map: GPS for data worlds. Scans a dataset and generates named
 * spatial waypoints — cluster centers ("cities"), outliers ("peaks"),
 * inflection points ("crossroads"), network hubs ("capitals").
 */

import { describe, it, expect } from "vitest";
import { flowWaypointMap } from "./tools-v5.js";
import type { WaypointMapInput, WaypointMapResult } from "./tools-v5.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Clearly clustered data — 3 clusters in 2D space */
const CLUSTERED_DATA = [
  "name,x_val,y_val,category",
  // Cluster A (around 10, 10)
  "A1,10,11,alpha",
  "A2,11,10,alpha",
  "A3,9,10,alpha",
  "A4,10,9,alpha",
  "A5,11,11,alpha",
  // Cluster B (around 50, 50)
  "B1,50,51,beta",
  "B2,51,50,beta",
  "B3,49,50,beta",
  "B4,50,49,beta",
  "B5,51,51,beta",
  // Cluster C (around 90, 90)
  "C1,90,91,gamma",
  "C2,91,90,gamma",
  "C3,89,90,gamma",
  "C4,90,89,gamma",
  "C5,91,91,gamma",
].join("\n");

/** Data with extreme outliers */
const OUTLIER_DATA = [
  "name,value,score,grade",
  "A,10,20,3",
  "B,12,22,4",
  "C,11,21,3",
  "D,10,19,4",
  "E,13,23,3",
  "F,11,20,4",
  "G,100,200,50", // outlier
  "H,12,21,3",
  "I,10,20,4",
  "J,-50,-100,-30", // outlier
].join("\n");

/** Trend data with clear inflection point */
const TREND_DATA = [
  "time,value",
  "1,10",
  "2,20",
  "3,30",
  "4,40",
  "5,50",   // slope is +10 up to here
  "6,45",   // slope changes sign
  "7,35",
  "8,25",
  "9,15",
  "10,5",   // slope is -10 from here
].join("\n");

/** Network data with hub */
const NETWORK_DATA = [
  "id,connections,value",
  "hub1,n2|n3|n4|n5|n6|n7|n8,100",
  "n2,hub1|n3,20",
  "n3,hub1|n2|n4,30",
  "n4,hub1|n3,25",
  "n5,hub1,15",
  "n6,hub1,18",
  "n7,hub1,22",
  "n8,hub1,12",
].join("\n");

/** Single row edge case */
const SINGLE_ROW = ["name,value,score", "lonely,42,99"].join("\n");

/** All identical values */
const IDENTICAL_DATA = [
  "name,value,score",
  "A,10,20",
  "B,10,20",
  "C,10,20",
  "D,10,20",
  "E,10,20",
].join("\n");

/** Multi-column dataset for PCA */
const MULTI_COL_DATA = [
  "name,a,b,c,d,e",
  "P1,1,2,3,4,5",
  "P2,10,20,30,40,50",
  "P3,5,10,15,20,25",
  "P4,3,6,9,12,15",
  "P5,8,16,24,32,40",
  "P6,2,4,6,8,10",
  "P7,7,14,21,28,35",
  "P8,4,8,12,16,20",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_waypoint_map", () => {
  // 1. Cluster centers detected from clearly clustered data
  it("detects cluster center waypoints from clustered data", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    const clusterWaypoints = result.waypoints.filter(
      (w) => w.type === "cluster_center"
    );
    // Should find approximately 3 clusters
    expect(clusterWaypoints.length).toBeGreaterThanOrEqual(2);
    expect(clusterWaypoints.length).toBeLessThanOrEqual(5);
    // Each cluster center should have nearby points
    for (const w of clusterWaypoints) {
      expect(w.nearby_points).toBeGreaterThan(0);
    }
  });

  // 2. Outlier waypoints detected from data with extreme values
  it("detects outlier waypoints from data with extreme values", async () => {
    const result = await flowWaypointMap({ csv_data: OUTLIER_DATA });
    const outlierWaypoints = result.waypoints.filter(
      (w) => w.type === "outlier"
    );
    expect(outlierWaypoints.length).toBeGreaterThanOrEqual(1);
    // The outlier with value 100 or -50 should be flagged
    const hasExtreme = outlierWaypoints.some(
      (w) =>
        w.description.includes("100") ||
        w.description.includes("-50") ||
        w.description.includes("200") ||
        w.description.includes("-100") ||
        w.label.toLowerCase().includes("outlier") ||
        w.label.toLowerCase().includes("peak")
    );
    expect(hasExtreme).toBe(true);
  });

  // 3. Inflection points detected from trend data with slope change
  it("detects inflection waypoints from trend data", async () => {
    const result = await flowWaypointMap({
      csv_data: TREND_DATA,
      types: ["inflection"],
    });
    const inflectionWaypoints = result.waypoints.filter(
      (w) => w.type === "inflection"
    );
    expect(inflectionWaypoints.length).toBeGreaterThanOrEqual(1);
  });

  // 4. Waypoints have valid 0-100 coordinates
  it("produces waypoints with coordinates in 0-100 range", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    for (const w of result.waypoints) {
      expect(w.coordinates.x).toBeGreaterThanOrEqual(0);
      expect(w.coordinates.x).toBeLessThanOrEqual(100);
      expect(w.coordinates.y).toBeGreaterThanOrEqual(0);
      expect(w.coordinates.y).toBeLessThanOrEqual(100);
      expect(w.coordinates.z).toBeGreaterThanOrEqual(0);
      expect(w.coordinates.z).toBeLessThanOrEqual(100);
    }
  });

  // 5. Camera path includes all waypoints
  it("camera path includes all waypoint IDs", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    const waypointIds = new Set(result.waypoints.map((w) => w.id));
    for (const seqId of result.camera_path.sequence) {
      expect(waypointIds.has(seqId)).toBe(true);
    }
    // Every waypoint should be in the path
    expect(result.camera_path.sequence.length).toBe(result.waypoints.length);
  });

  // 6. Camera path narration is non-empty for each stop
  it("camera path has non-empty narration for each stop", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    expect(result.camera_path.narration.length).toBe(
      result.camera_path.sequence.length
    );
    for (const text of result.camera_path.narration) {
      expect(text.length).toBeGreaterThan(0);
    }
  });

  // 7. CSV output has correct headers
  it("CSV output has correct headers", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    const lines = result.csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    expect(headers).toEqual([
      "id",
      "connections",
      "x",
      "y",
      "z",
      "label",
      "type",
      "importance",
    ]);
  });

  // 8. CSV has one row per waypoint (+ header)
  it("CSV has one row per waypoint plus header", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    const lines = result.csv.trim().split("\n");
    expect(lines.length).toBe(result.waypoints.length + 1);
  });

  // 9. max_waypoints parameter limits output
  it("max_waypoints limits the number of waypoints", async () => {
    const result = await flowWaypointMap({
      csv_data: CLUSTERED_DATA,
      max_waypoints: 2,
    });
    expect(result.waypoints.length).toBeLessThanOrEqual(2);
    expect(result.dataset_summary.waypoint_count).toBeLessThanOrEqual(2);
  });

  // 10. types filter works
  it("types filter restricts waypoint types", async () => {
    const result = await flowWaypointMap({
      csv_data: OUTLIER_DATA,
      types: ["outlier"],
    });
    for (const w of result.waypoints) {
      expect(w.type).toBe("outlier");
    }
  });

  // 11. importance scores are 0-1
  it("importance scores are between 0 and 1", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    for (const w of result.waypoints) {
      expect(w.importance).toBeGreaterThanOrEqual(0);
      expect(w.importance).toBeLessThanOrEqual(1);
    }
  });

  // 12. Edge case: single-row dataset
  it("handles single-row dataset gracefully", async () => {
    const result = await flowWaypointMap({ csv_data: SINGLE_ROW });
    expect(result.waypoints.length).toBeGreaterThanOrEqual(0);
    expect(result.dataset_summary.rows).toBe(1);
    // Should not throw
  });

  // 13. Edge case: all identical values
  it("handles all identical values without crashing", async () => {
    const result = await flowWaypointMap({ csv_data: IDENTICAL_DATA });
    expect(result.dataset_summary.rows).toBe(5);
    // Coordinates should still be valid
    for (const w of result.waypoints) {
      expect(w.coordinates.x).toBeGreaterThanOrEqual(0);
      expect(w.coordinates.x).toBeLessThanOrEqual(100);
    }
  });

  // 14. Dataset summary is accurate
  it("dataset summary reflects the actual data", async () => {
    const result = await flowWaypointMap({ csv_data: CLUSTERED_DATA });
    expect(result.dataset_summary.rows).toBe(15);
    expect(result.dataset_summary.columns).toBe(4);
    expect(result.dataset_summary.waypoint_count).toBe(
      result.waypoints.length
    );
    expect(result.dataset_summary.spatial_dimensions_used.length).toBeGreaterThan(0);
  });

  // 15. Hub detection from network data
  it("detects hub waypoints from network data", async () => {
    const result = await flowWaypointMap({
      csv_data: NETWORK_DATA,
      types: ["hub"],
    });
    const hubWaypoints = result.waypoints.filter((w) => w.type === "hub");
    expect(hubWaypoints.length).toBeGreaterThanOrEqual(1);
    // hub1 has the most connections (7) so it should be the hub
    const mainHub = hubWaypoints.find(
      (w) => w.label.includes("hub1") || w.description.includes("hub1")
    );
    expect(mainHub).toBeDefined();
  });

  // 16. PCA works on multi-column data
  it("handles multi-column data with PCA reduction", async () => {
    const result = await flowWaypointMap({ csv_data: MULTI_COL_DATA });
    expect(result.dataset_summary.spatial_dimensions_used.length).toBeGreaterThan(0);
    // Should still produce valid coordinates
    for (const w of result.waypoints) {
      expect(typeof w.coordinates.x).toBe("number");
      expect(typeof w.coordinates.y).toBe("number");
      expect(typeof w.coordinates.z).toBe("number");
      expect(isNaN(w.coordinates.x)).toBe(false);
    }
  });
});
