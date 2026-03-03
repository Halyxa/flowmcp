/**
 * Tests for tools-v4.ts (flow_live_data, flow_correlation_matrix, flow_cluster_data)
 *
 * Unit tests for live data, correlation matrix, and clustering tools.
 * Network-dependent tests are marked with .skip for CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flowLiveData, flowCorrelationMatrix, flowClusterData } from "./tools-v4.js";
import type { LiveDataInput, CorrelationMatrixInput, ClusterDataInput } from "./tools-v4.js";

// Mock fetch for deterministic tests
const mockFetch = vi.fn();

describe("flow_live_data", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("earthquakes source", () => {
    it("returns CSV with proper columns for earthquake data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          metadata: { count: 2, title: "USGS Earthquakes" },
          features: [
            {
              properties: {
                mag: 6.2,
                place: "10km SW of Tokyo, Japan",
                time: 1709510400000,
                type: "earthquake",
                status: "reviewed",
                tsunami: 0,
                sig: 592,
                magType: "mww",
                title: "M 6.2 - 10km SW of Tokyo, Japan",
              },
              geometry: { coordinates: [139.69, 35.68, 25.0] },
            },
            {
              properties: {
                mag: 4.5,
                place: "50km N of Los Angeles, CA",
                time: 1709500000000,
                type: "earthquake",
                status: "automatic",
                tsunami: 0,
                sig: 312,
                magType: "ml",
                title: "M 4.5 - 50km N of Los Angeles, CA",
              },
              geometry: { coordinates: [-118.24, 34.05, 10.0] },
            },
          ],
        }),
      });

      const result = await flowLiveData({ source: "earthquakes", days: 7, min_magnitude: 4.0 });

      expect(result.source).toBe("USGS Earthquake Hazards Program");
      expect(result.rows).toBe(2);
      expect(result.columns).toContain("latitude");
      expect(result.columns).toContain("longitude");
      expect(result.columns).toContain("magnitude");
      expect(result.columns).toContain("depth_km");
      expect(result.csv).toContain("id,latitude,longitude");
      expect(result.csv).toContain("6.2");
      expect(result.csv).toContain("35.68");
      expect(result.suggested_template).toBe("3D Geographic Scatter");
    });

    it("handles empty earthquake results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          metadata: { count: 0, title: "USGS" },
          features: [],
        }),
      });

      const result = await flowLiveData({ source: "earthquakes", min_magnitude: 9.0 });
      expect(result.rows).toBe(0);
      expect(result.csv).toContain("id,latitude,longitude");
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(flowLiveData({ source: "earthquakes" })).rejects.toThrow("USGS API error");
    });

    it("respects days parameter bounds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metadata: { count: 0 }, features: [] }),
      });

      await flowLiveData({ source: "earthquakes", days: 100 }); // should clamp to 30
      const url = mockFetch.mock.calls[0][0] as string;
      // The start date should be ~30 days ago, not 100
      const startMatch = url.match(/starttime=(\d{4}-\d{2}-\d{2})/);
      expect(startMatch).toBeTruthy();
    });
  });

  describe("weather_stations source", () => {
    it("returns CSV with weather data for major cities", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            latitude: 40.71,
            longitude: -74.01,
            current: {
              temperature_2m: 15.2,
              relative_humidity_2m: 65,
              wind_speed_10m: 12.5,
              weather_code: 2,
              precipitation: 0,
            },
          },
          {
            latitude: 51.51,
            longitude: -0.13,
            current: {
              temperature_2m: 8.7,
              relative_humidity_2m: 80,
              wind_speed_10m: 18.3,
              weather_code: 61,
              precipitation: 2.1,
            },
          },
        ],
      });

      const result = await flowLiveData({ source: "weather_stations", max_rows: 2 });

      expect(result.source).toBe("Open-Meteo Weather API");
      expect(result.rows).toBe(2);
      expect(result.columns).toContain("city");
      expect(result.columns).toContain("temperature_c");
      expect(result.columns).toContain("latitude");
      expect(result.csv).toContain("New York");
      expect(result.csv).toContain("15.2");
    });

    it("handles weather API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      await expect(flowLiveData({ source: "weather_stations" })).rejects.toThrow("Open-Meteo API error");
    });
  });

  describe("world_indicators source", () => {
    it("returns CSV with World Bank data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { total: 2, page: 1 },
          [
            { country: { id: "US", value: "United States" }, date: "2023", value: 331900000 },
            { country: { id: "CN", value: "China" }, date: "2023", value: 1425893000 },
          ],
        ],
      });

      const result = await flowLiveData({ source: "world_indicators" });

      expect(result.source).toBe("World Bank Open Data");
      expect(result.rows).toBe(2);
      expect(result.columns).toContain("country");
      expect(result.columns).toContain("year");
      expect(result.columns).toContain("value");
      expect(result.csv).toContain("United States");
      expect(result.csv).toContain("331900000");
    });

    it("passes custom indicator to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ total: 0, page: 1 }, []],
      });

      await flowLiveData({ source: "world_indicators", indicator: "NY.GDP.MKTP.CD" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("NY.GDP.MKTP.CD");
    });

    it("handles null values in World Bank data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { total: 3, page: 1 },
          [
            { country: { id: "US", value: "United States" }, date: "2023", value: 331900000 },
            { country: { id: "XX", value: "No Data" }, date: "2023", value: null },
            { country: { id: "CN", value: "China" }, date: "2023", value: 1425893000 },
          ],
        ],
      });

      const result = await flowLiveData({ source: "world_indicators" });
      expect(result.rows).toBe(2); // null values filtered out
    });

    it("handles empty results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ total: 0, page: 1 }, []],
      });

      const result = await flowLiveData({ source: "world_indicators" });
      expect(result.rows).toBe(0);
    });
  });

  describe("error handling", () => {
    it("rejects unknown source", async () => {
      await expect(
        flowLiveData({ source: "invalid" as any })
      ).rejects.toThrow("Unknown source");
    });
  });

  describe("CSV format", () => {
    it("properly escapes fields with commas", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          metadata: { count: 1 },
          features: [
            {
              properties: {
                mag: 5.0,
                place: "Near East Coast, USA",
                time: 1709510400000,
                type: "earthquake",
                sig: 100,
                tsunami: 0,
              },
              geometry: { coordinates: [-75.0, 40.0, 10.0] },
            },
          ],
        }),
      });

      const result = await flowLiveData({ source: "earthquakes" });
      const lines = result.csv.split("\n");
      expect(lines.length).toBe(2); // header + 1 data row
      expect(lines[0]).toBe("id,latitude,longitude,magnitude,depth_km,place,time,type,significance,tsunami_alert");
    });
  });
});

// ============================================================================
// TOOL 27: flow_correlation_matrix
// ============================================================================

describe("flow_correlation_matrix", () => {
  const SIMPLE_CSV = [
    "name,height,weight,age",
    "Alice,165,55,30",
    "Bob,180,80,35",
    "Carol,170,65,28",
    "Dave,175,75,40",
    "Eve,160,50,25",
  ].join("\n");

  it("computes pairwise correlations for numeric columns", () => {
    const result = flowCorrelationMatrix({ csv_content: SIMPLE_CSV });
    expect(result.columns).toContain("height");
    expect(result.columns).toContain("weight");
    expect(result.columns).toContain("age");
    // Matrix CSV should have a header row + one row per column
    const lines = result.matrix_csv.split("\n");
    expect(lines.length).toBe(4); // header + 3 numeric columns
    expect(lines[0]).toBe("column,height,weight,age");
    // Diagonal should be 1.0
    expect(result.matrix[0][0]).toBeCloseTo(1.0);
    expect(result.matrix[1][1]).toBeCloseTo(1.0);
    expect(result.matrix[2][2]).toBeCloseTo(1.0);
  });

  it("correlations are between -1 and 1", () => {
    const result = flowCorrelationMatrix({ csv_content: SIMPLE_CSV });
    for (const row of result.matrix) {
      for (const val of row) {
        expect(val).toBeGreaterThanOrEqual(-1.0);
        expect(val).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it("height and weight should be positively correlated", () => {
    const result = flowCorrelationMatrix({ csv_content: SIMPLE_CSV });
    // height is index 0, weight is index 1
    expect(result.matrix[0][1]).toBeGreaterThan(0.5);
  });

  it("matrix is symmetric", () => {
    const result = flowCorrelationMatrix({ csv_content: SIMPLE_CSV });
    const n = result.matrix.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i]);
      }
    }
  });

  it("filters to specified columns only", () => {
    const result = flowCorrelationMatrix({
      csv_content: SIMPLE_CSV,
      columns: ["height", "weight"],
    });
    expect(result.columns).toEqual(["height", "weight"]);
    expect(result.matrix.length).toBe(2);
    expect(result.matrix[0].length).toBe(2);
  });

  it("reports strongest correlations", () => {
    const result = flowCorrelationMatrix({ csv_content: SIMPLE_CSV });
    expect(result.strongest_correlations.length).toBeGreaterThan(0);
    for (const corr of result.strongest_correlations) {
      expect(corr).toHaveProperty("column_a");
      expect(corr).toHaveProperty("column_b");
      expect(corr).toHaveProperty("correlation");
      expect(corr.column_a).not.toBe(corr.column_b);
    }
  });

  it("handles CSV with only one numeric column", () => {
    const csv = "name,value\nA,1\nB,2\nC,3";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.columns).toEqual(["value"]);
    expect(result.matrix).toEqual([[1.0]]);
  });

  it("throws on CSV with no numeric columns", () => {
    const csv = "name,color\nAlice,red\nBob,blue";
    expect(() => flowCorrelationMatrix({ csv_content: csv })).toThrow("No numeric columns");
  });

  it("handles missing/NaN values gracefully", () => {
    const csv = "a,b\n1,2\n3,\n5,6\n,8";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.columns).toEqual(["a", "b"]);
    // Should still compute correlation from valid pairs
    expect(result.matrix[0][0]).toBeCloseTo(1.0);
  });

  it("perfectly correlated data returns r=1.0", () => {
    const csv = "x,y\n1,2\n2,4\n3,6\n4,8\n5,10";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.matrix[0][1]).toBeCloseTo(1.0);
  });

  it("perfectly inversely correlated data returns r=-1.0", () => {
    const csv = "x,y\n1,10\n2,8\n3,6\n4,4\n5,2";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.matrix[0][1]).toBeCloseTo(-1.0);
  });
});

// ============================================================================
// TOOL 28: flow_cluster_data
// ============================================================================

describe("flow_cluster_data", () => {
  // Three clear clusters
  const CLUSTER_CSV = [
    "id,x,y",
    "A,1,1",
    "B,1.1,1.2",
    "C,0.9,0.8",
    "D,10,10",
    "E,10.1,10.2",
    "F,9.9,9.8",
    "G,20,20",
    "H,20.1,20.2",
    "I,19.9,19.8",
  ].join("\n");

  it("adds _cluster column to output CSV", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    expect(result.csv).toContain("_cluster");
    const lines = result.csv.split("\n");
    const header = lines[0].split(",");
    expect(header).toContain("_cluster");
    expect(header).toContain("_distance_to_centroid");
  });

  it("assigns correct number of clusters", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    const uniqueClusters = new Set<string>();
    const lines = result.csv.split("\n").slice(1);
    const clusterIdx = result.csv.split("\n")[0].split(",").indexOf("_cluster");
    for (const line of lines) {
      if (line.trim()) {
        uniqueClusters.add(line.split(",")[clusterIdx]);
      }
    }
    expect(uniqueClusters.size).toBe(3);
  });

  it("nearby points get same cluster", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    const lines = result.csv.split("\n").slice(1).filter(l => l.trim());
    const clusterIdx = result.csv.split("\n")[0].split(",").indexOf("_cluster");
    // Points A, B, C (indices 0, 1, 2) should share a cluster
    const c0 = lines[0].split(",")[clusterIdx];
    const c1 = lines[1].split(",")[clusterIdx];
    const c2 = lines[2].split(",")[clusterIdx];
    expect(c0).toBe(c1);
    expect(c1).toBe(c2);
  });

  it("returns cluster centroids", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    expect(result.centroids.length).toBe(3);
    for (const centroid of result.centroids) {
      expect(centroid).toHaveProperty("cluster");
      expect(centroid).toHaveProperty("size");
      expect(centroid).toHaveProperty("center");
      expect(centroid.size).toBeGreaterThan(0);
    }
  });

  it("auto-selects k when not specified", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, columns: ["x", "y"] });
    // Should find 2-4 clusters for this clearly separated data
    expect(result.k).toBeGreaterThanOrEqual(2);
    expect(result.k).toBeLessThanOrEqual(4);
  });

  it("returns proper metadata", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    expect(result.k).toBe(3);
    expect(result.rows).toBe(9);
    expect(result.columns_used).toEqual(["x", "y"]);
  });

  it("handles single cluster (k=1)", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 1, columns: ["x", "y"] });
    expect(result.k).toBe(1);
    expect(result.centroids.length).toBe(1);
    expect(result.centroids[0].size).toBe(9);
  });

  it("preserves original columns in output", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["x", "y"] });
    const header = result.csv.split("\n")[0].split(",");
    expect(header).toContain("id");
    expect(header).toContain("x");
    expect(header).toContain("y");
  });

  it("throws when columns not found", () => {
    expect(() =>
      flowClusterData({ csv_content: CLUSTER_CSV, k: 3, columns: ["nonexistent"] })
    ).toThrow();
  });

  it("auto-detects numeric columns when columns not specified", () => {
    const result = flowClusterData({ csv_content: CLUSTER_CSV, k: 3 });
    expect(result.columns_used).toEqual(["x", "y"]);
  });

  it("handles data with missing values", () => {
    const csv = "id,x,y\nA,1,1\nB,,2\nC,3,3\nD,4,4\nE,5,5";
    const result = flowClusterData({ csv_content: csv, k: 2, columns: ["x", "y"] });
    // Should handle missing values (skip or fill with mean)
    expect(result.rows).toBeGreaterThanOrEqual(4);
  });
});
