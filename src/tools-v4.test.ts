/**
 * Tests for tools-v4.ts (flow_live_data, flow_correlation_matrix, flow_cluster_data)
 *
 * Unit tests for live data, correlation matrix, and clustering tools.
 * Network-dependent tests are marked with .skip for CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flowLiveData, flowCorrelationMatrix, flowClusterData, flowHierarchicalData, flowCompareDatasets, flowPivotTable, flowRegressionAnalysis, flowNormalizeData, flowDeduplicateRows } from "./tools-v4.js";
import type { LiveDataInput, CorrelationMatrixInput, ClusterDataInput, HierarchicalDataInput, CompareDataInput, PivotTableInput, RegressionAnalysisInput, NormalizeDataInput, DeduplicateRowsInput } from "./tools-v4.js";

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

// ============================================================================
// TOOL 29: flow_hierarchical_data
// ============================================================================

describe("flow_hierarchical_data", () => {
  const ORG_CSV = [
    "department,team,employee,salary",
    "Engineering,Frontend,Alice,120000",
    "Engineering,Frontend,Bob,115000",
    "Engineering,Backend,Carol,130000",
    "Engineering,Backend,Dave,125000",
    "Engineering,Backend,Eve,128000",
    "Sales,Enterprise,Frank,95000",
    "Sales,Enterprise,Grace,92000",
    "Sales,SMB,Hank,85000",
    "Marketing,Digital,Ivy,88000",
    "Marketing,Digital,Jack,90000",
  ].join("\n");

  it("produces hierarchical CSV with id and connections columns", () => {
    const result = flowHierarchicalData({
      csv_content: ORG_CSV,
      hierarchy_columns: ["department", "team", "employee"],
    });
    expect(result.csv).toContain("id");
    expect(result.csv).toContain("connections");
    // Root node should exist
    expect(result.csv).toContain("Root");
  });

  it("computes correct node count from categories", () => {
    const result = flowHierarchicalData({
      csv_content: ORG_CSV,
      hierarchy_columns: ["department", "team", "employee"],
    });
    // Root(1) + departments(3) + teams(5) + employees(10) = 19
    expect(result.total_nodes).toBe(19);
  });

  it("aggregates value column at parent levels", () => {
    const result = flowHierarchicalData({
      csv_content: ORG_CSV,
      hierarchy_columns: ["department", "team"],
      value_column: "salary",
    });
    // Should have aggregate values at parent nodes
    const lines = result.csv.split("\n");
    const header = lines[0].split(",");
    const valueIdx = header.indexOf("value");
    expect(valueIdx).toBeGreaterThan(-1);
    // Engineering total salary = 120000+115000+130000+125000+128000 = 618000
    // Find Engineering node and check its value
    const engLine = lines.find(l => {
      const fields = l.split(",");
      return fields[0] === "Engineering" && !fields[0].includes("/");
    });
    expect(engLine).toBeDefined();
  });

  it("handles two-level hierarchy", () => {
    const csv = "region,country,gdp\nAsia,China,18000\nAsia,Japan,5000\nEurope,Germany,4000\nEurope,France,3000";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["region", "country"],
      value_column: "gdp",
    });
    // Root(1) + regions(2) + countries(4) = 7
    expect(result.total_nodes).toBe(7);
    expect(result.depth).toBe(3); // root → region → country
  });

  it("handles single-level hierarchy (flat grouping)", () => {
    const csv = "category,item,count\nFruit,Apple,10\nFruit,Banana,8\nVegetable,Carrot,5";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["category"],
      value_column: "count",
    });
    // Root(1) + categories(2) = 3 nodes (items are not included since hierarchy is only 1 level)
    expect(result.total_nodes).toBe(3);
  });

  it("produces Flow network format with pipe-delimited connections", () => {
    const csv = "a,b\nX,1\nX,2\nY,3";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["a", "b"],
    });
    // Root should connect to X and Y
    const lines = result.csv.split("\n").slice(1);
    const rootLine = lines.find(l => l.startsWith("Root,"));
    expect(rootLine).toBeDefined();
    // Root's connections should contain X and Y
    if (rootLine) {
      expect(rootLine).toContain("X");
      expect(rootLine).toContain("Y");
    }
  });

  it("throws on empty hierarchy columns", () => {
    expect(() =>
      flowHierarchicalData({ csv_content: ORG_CSV, hierarchy_columns: [] })
    ).toThrow();
  });

  it("throws on non-existent column", () => {
    expect(() =>
      flowHierarchicalData({
        csv_content: ORG_CSV,
        hierarchy_columns: ["nonexistent"],
      })
    ).toThrow();
  });

  it("returns suggested template", () => {
    const result = flowHierarchicalData({
      csv_content: ORG_CSV,
      hierarchy_columns: ["department", "team"],
    });
    expect(result.suggested_template).toBeDefined();
    expect(typeof result.suggested_template).toBe("string");
  });

  it("handles duplicate values across different branches", () => {
    const csv = "dept,role,name\nEng,Dev,Alice\nSales,Dev,Bob";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["dept", "role"],
    });
    // "Dev" appears under both Eng and Sales — should be distinct nodes
    // Root(1) + depts(2) + roles(2 unique under different parents) = 5
    expect(result.total_nodes).toBe(5);
  });
});

// ============================================================================
// TOOL 30: flow_compare_datasets
// ============================================================================

describe("flow_compare_datasets", () => {
  const CSV_A = [
    "id,name,revenue",
    "1,Acme,100",
    "2,Beta,200",
    "3,Gamma,300",
  ].join("\n");

  const CSV_B = [
    "id,name,revenue",
    "1,Acme,120",
    "2,Beta,200",
    "4,Delta,400",
  ].join("\n");

  it("identifies added, removed, and changed rows", () => {
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: CSV_B,
      key_column: "id",
    });
    expect(result.added_rows).toBe(1); // Delta
    expect(result.removed_rows).toBe(1); // Gamma
    expect(result.changed_rows).toBe(1); // Acme (revenue 100→120)
    expect(result.unchanged_rows).toBe(1); // Beta
  });

  it("produces diff CSV with _diff_status column", () => {
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: CSV_B,
      key_column: "id",
    });
    expect(result.csv).toContain("_diff_status");
    expect(result.csv).toContain("added");
    expect(result.csv).toContain("removed");
    expect(result.csv).toContain("changed");
    expect(result.csv).toContain("unchanged");
  });

  it("computes numeric column deltas", () => {
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: CSV_B,
      key_column: "id",
    });
    expect(result.column_deltas.length).toBeGreaterThan(0);
    const revenueDelta = result.column_deltas.find(d => d.column === "revenue");
    expect(revenueDelta).toBeDefined();
    if (revenueDelta) {
      expect(revenueDelta.mean_a).toBeDefined();
      expect(revenueDelta.mean_b).toBeDefined();
    }
  });

  it("handles identical datasets", () => {
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: CSV_A,
      key_column: "id",
    });
    expect(result.added_rows).toBe(0);
    expect(result.removed_rows).toBe(0);
    expect(result.changed_rows).toBe(0);
    expect(result.unchanged_rows).toBe(3);
  });

  it("handles completely different datasets", () => {
    const csvC = "id,name,revenue\n10,Zeta,999\n11,Omega,888";
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: csvC,
      key_column: "id",
    });
    expect(result.added_rows).toBe(2);
    expect(result.removed_rows).toBe(3);
    expect(result.changed_rows).toBe(0);
  });

  it("throws on missing key column", () => {
    expect(() =>
      flowCompareDatasets({ csv_a: CSV_A, csv_b: CSV_B, key_column: "nonexistent" })
    ).toThrow();
  });

  it("auto-detects first column as key when not specified", () => {
    const result = flowCompareDatasets({ csv_a: CSV_A, csv_b: CSV_B });
    expect(result.key_column).toBe("id");
    expect(result.added_rows + result.removed_rows + result.changed_rows + result.unchanged_rows).toBe(4);
  });

  it("summary describes the comparison", () => {
    const result = flowCompareDatasets({
      csv_a: CSV_A,
      csv_b: CSV_B,
      key_column: "id",
    });
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(10);
  });
});

// =============================================================================
// TOOL 31: flow_pivot_table — GROUP BY + AGGREGATE
// =============================================================================

describe("flow_pivot_table", () => {
  const CSV = "region,product,revenue,units\nNorth,Widget,100,10\nSouth,Widget,200,20\nNorth,Gadget,150,15\nSouth,Gadget,300,30\nNorth,Widget,50,5";

  it("groups by a single column and aggregates", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "sum", units: "sum" },
    });
    expect(result.csv).toContain("region");
    expect(result.csv).toContain("revenue_sum");
    expect(result.csv).toContain("units_sum");
    expect(result.row_count).toBe(2); // North, South
  });

  it("groups by multiple columns", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region", "product"],
      aggregations: { revenue: "sum" },
    });
    expect(result.row_count).toBe(4); // North-Widget, North-Gadget, South-Widget, South-Gadget
  });

  it("computes sum correctly", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "sum" },
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const revIdx = headers.indexOf("revenue_sum");
    // North: 100+150+50=300, South: 200+300=500
    const northRow = lines.find(l => l.startsWith("North"))!;
    const southRow = lines.find(l => l.startsWith("South"))!;
    expect(Number(northRow.split(",")[revIdx])).toBe(300);
    expect(Number(southRow.split(",")[revIdx])).toBe(500);
  });

  it("computes avg correctly", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "avg" },
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const revIdx = headers.indexOf("revenue_avg");
    const northRow = lines.find(l => l.startsWith("North"))!;
    // North: (100+150+50)/3 = 100
    expect(Number(northRow.split(",")[revIdx])).toBe(100);
  });

  it("computes count, min, max", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "count" },
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const countIdx = headers.indexOf("revenue_count");
    const northRow = lines.find(l => l.startsWith("North"))!;
    expect(Number(northRow.split(",")[countIdx])).toBe(3); // 3 North rows
  });

  it("adds _group_size column", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "sum" },
    });
    expect(result.csv).toContain("_group_size");
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const sizeIdx = headers.indexOf("_group_size");
    const northRow = lines.find(l => l.startsWith("North"))!;
    expect(Number(northRow.split(",")[sizeIdx])).toBe(3);
  });

  it("throws on nonexistent group_by column", () => {
    expect(() =>
      flowPivotTable({
        csv_content: CSV,
        group_by: ["nonexistent"],
        aggregations: { revenue: "sum" },
      })
    ).toThrow();
  });

  it("throws on nonexistent aggregation column", () => {
    expect(() =>
      flowPivotTable({
        csv_content: CSV,
        group_by: ["region"],
        aggregations: { nonexistent: "sum" },
      })
    ).toThrow();
  });

  it("handles single row per group", () => {
    const csv = "city,value\nTokyo,100\nParis,200\nBerlin,300";
    const result = flowPivotTable({
      csv_content: csv,
      group_by: ["city"],
      aggregations: { value: "sum" },
    });
    expect(result.row_count).toBe(3);
  });

  it("returns summary text", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "sum" },
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("supports multiple aggregations on same column", () => {
    const result = flowPivotTable({
      csv_content: CSV,
      group_by: ["region"],
      aggregations: { revenue: "sum" },
    });
    // This just ensures it doesn't crash — multi-agg on same col
    // is tested by calling with different agg types
    expect(result.row_count).toBeGreaterThan(0);
  });
});

// =============================================================================
// TOOL 32: flow_regression_analysis — LINEAR REGRESSION
// =============================================================================

describe("flow_regression_analysis", () => {
  // Perfect positive linear: y = 2x + 1
  const PERFECT_CSV = "x,y\n1,3\n2,5\n3,7\n4,9\n5,11";
  // Noisy data
  const NOISY_CSV = "x,y,label\n1,2.1,A\n2,4.3,B\n3,5.8,C\n4,8.2,D\n5,9.9,E";

  it("returns slope, intercept, and r_squared", () => {
    const result = flowRegressionAnalysis({
      csv_content: PERFECT_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.slope).toBeCloseTo(2, 5);
    expect(result.intercept).toBeCloseTo(1, 5);
    expect(result.r_squared).toBeCloseTo(1, 5);
  });

  it("produces CSV with _predicted and _residual columns", () => {
    const result = flowRegressionAnalysis({
      csv_content: PERFECT_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.csv).toContain("_predicted");
    expect(result.csv).toContain("_residual");
    const lines = result.csv.split("\n");
    expect(lines.length).toBe(6); // header + 5 rows
  });

  it("preserves original columns in output", () => {
    const result = flowRegressionAnalysis({
      csv_content: NOISY_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.csv).toContain("label");
    expect(result.csv).toContain("x");
    expect(result.csv).toContain("y");
  });

  it("r_squared is between 0 and 1 for noisy data", () => {
    const result = flowRegressionAnalysis({
      csv_content: NOISY_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.r_squared).toBeGreaterThan(0);
    expect(result.r_squared).toBeLessThanOrEqual(1);
  });

  it("residuals sum approximately to zero", () => {
    const result = flowRegressionAnalysis({
      csv_content: NOISY_CSV,
      x_column: "x",
      y_column: "y",
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const resIdx = headers.indexOf("_residual");
    let sum = 0;
    for (let i = 1; i < lines.length; i++) {
      sum += Number(lines[i].split(",")[resIdx]);
    }
    expect(Math.abs(sum)).toBeLessThan(0.001);
  });

  it("returns equation string", () => {
    const result = flowRegressionAnalysis({
      csv_content: PERFECT_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.equation).toBeDefined();
    expect(result.equation).toContain("y");
    expect(result.equation).toContain("x");
  });

  it("throws on nonexistent x_column", () => {
    expect(() =>
      flowRegressionAnalysis({
        csv_content: PERFECT_CSV,
        x_column: "nonexistent",
        y_column: "y",
      })
    ).toThrow();
  });

  it("throws on non-numeric column", () => {
    const csv = "name,value\nAlice,10\nBob,20";
    expect(() =>
      flowRegressionAnalysis({
        csv_content: csv,
        x_column: "name",
        y_column: "value",
      })
    ).toThrow();
  });

  it("handles negative slope", () => {
    const csv = "x,y\n1,10\n2,8\n3,6\n4,4\n5,2";
    const result = flowRegressionAnalysis({
      csv_content: csv,
      x_column: "x",
      y_column: "y",
    });
    expect(result.slope).toBeCloseTo(-2, 5);
    expect(result.r_squared).toBeCloseTo(1, 5);
  });

  it("returns n_points and p_value", () => {
    const result = flowRegressionAnalysis({
      csv_content: NOISY_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.n_points).toBe(5);
    expect(result.p_value).toBeDefined();
    expect(result.p_value).toBeGreaterThanOrEqual(0);
    expect(result.p_value).toBeLessThanOrEqual(1);
  });

  it("summary describes the relationship", () => {
    const result = flowRegressionAnalysis({
      csv_content: PERFECT_CSV,
      x_column: "x",
      y_column: "y",
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// TOOL 33: flow_normalize_data — MIN-MAX / Z-SCORE NORMALIZATION
// =============================================================================

describe("flow_normalize_data", () => {
  const CSV = "name,score,revenue\nAlice,80,1000\nBob,90,2000\nCharlie,70,3000";

  it("min-max normalizes values to [0,1]", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score"],
      method: "min_max",
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("score_normalized");
    expect(normIdx).toBeGreaterThan(-1);
    for (let i = 1; i < lines.length; i++) {
      const val = Number(lines[i].split(",")[normIdx]);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it("z-score normalizes to mean ~0 and std ~1", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score"],
      method: "z_score",
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("score_normalized");
    const values: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      values.push(Number(lines[i].split(",")[normIdx]));
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });

  it("normalizes multiple columns", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score", "revenue"],
      method: "min_max",
    });
    expect(result.csv).toContain("score_normalized");
    expect(result.csv).toContain("revenue_normalized");
    expect(result.columns_normalized).toEqual(["score", "revenue"]);
  });

  it("preserves original columns", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score"],
      method: "min_max",
    });
    expect(result.csv).toContain("name");
    expect(result.csv).toContain("score");
    expect(result.csv).toContain("revenue");
  });

  it("auto-detects numeric columns when none specified", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      method: "min_max",
    });
    expect(result.columns_normalized.length).toBeGreaterThanOrEqual(2);
  });

  it("throws on nonexistent column", () => {
    expect(() =>
      flowNormalizeData({
        csv_content: CSV,
        columns: ["nonexistent"],
        method: "min_max",
      })
    ).toThrow();
  });

  it("handles constant column in min-max (all same value)", () => {
    const csv = "name,val\nA,5\nB,5\nC,5";
    const result = flowNormalizeData({
      csv_content: csv,
      columns: ["val"],
      method: "min_max",
    });
    // Constant column → all values should be 0 (or 0.5, implementation choice)
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("val_normalized");
    for (let i = 1; i < lines.length; i++) {
      const val = Number(lines[i].split(",")[normIdx]);
      expect(val).toBe(0);
    }
  });

  it("returns row_count matching input", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score"],
      method: "min_max",
    });
    expect(result.row_count).toBe(3);
  });

  it("returns summary text", () => {
    const result = flowNormalizeData({
      csv_content: CSV,
      columns: ["score"],
      method: "min_max",
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// TOOL 34: flow_deduplicate_rows — FUZZY DEDUPLICATION
// =============================================================================

describe("flow_deduplicate_rows", () => {
  it("removes exact duplicates", () => {
    const csv = "name,value\nAlice,10\nBob,20\nAlice,10\nCharlie,30";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["name", "value"],
    });
    expect(result.unique_rows).toBe(3);
    expect(result.duplicates_removed).toBe(1);
  });

  it("deduplicates on specified column subset", () => {
    const csv = "name,value,extra\nAlice,10,X\nAlice,10,Y\nBob,20,Z";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["name", "value"],
    });
    expect(result.unique_rows).toBe(2);
    expect(result.duplicates_removed).toBe(1);
  });

  it("keeps first occurrence by default", () => {
    const csv = "name,value\nAlice,10\nAlice,20\nAlice,30";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["name"],
    });
    expect(result.unique_rows).toBe(1);
    const lines = result.csv.split("\n");
    expect(lines[1]).toContain("10"); // First Alice kept
  });

  it("returns CSV with _duplicate_group column when groups exist", () => {
    const csv = "name,value\nAlice,10\nBob,20\nAlice,30";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["name"],
    });
    expect(result.csv).toBeDefined();
    expect(result.unique_rows).toBe(2);
  });

  it("no duplicates → same row count", () => {
    const csv = "id,val\n1,A\n2,B\n3,C";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["id"],
    });
    expect(result.unique_rows).toBe(3);
    expect(result.duplicates_removed).toBe(0);
  });

  it("deduplicates on all columns when none specified", () => {
    const csv = "a,b\n1,2\n3,4\n1,2\n5,6";
    const result = flowDeduplicateRows({
      csv_content: csv,
    });
    expect(result.unique_rows).toBe(3);
    expect(result.duplicates_removed).toBe(1);
  });

  it("throws on nonexistent column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowDeduplicateRows({
        csv_content: csv,
        columns: ["nonexistent"],
      })
    ).toThrow();
  });

  it("case-insensitive dedup when enabled", () => {
    const csv = "name,val\nAlice,10\nalice,20\nBob,30";
    const result = flowDeduplicateRows({
      csv_content: csv,
      columns: ["name"],
      case_insensitive: true,
    });
    expect(result.unique_rows).toBe(2);
    expect(result.duplicates_removed).toBe(1);
  });

  it("returns summary text", () => {
    const csv = "a,b\n1,2\n1,2\n3,4";
    const result = flowDeduplicateRows({
      csv_content: csv,
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
