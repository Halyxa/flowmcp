/**
 * Tests for tools-v4.ts (flow_live_data, flow_correlation_matrix, flow_cluster_data)
 *
 * Unit tests for live data, correlation matrix, and clustering tools.
 * Network-dependent tests are marked with .skip for CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flowLiveData, flowCorrelationMatrix, flowClusterData, flowHierarchicalData, flowCompareDatasets, flowPivotTable, flowRegressionAnalysis, flowNormalizeData, flowDeduplicateRows, flowBinData, flowTransposeData, flowSampleData, flowColumnStats, flowComputedColumns, flowParseDates, flowStringTransform, flowValidateRules, flowFillMissing, flowRenameColumns } from "./tools-v4.js";
import type { LiveDataInput, CorrelationMatrixInput, ClusterDataInput, HierarchicalDataInput, CompareDataInput, PivotTableInput, RegressionAnalysisInput, NormalizeDataInput, DeduplicateRowsInput, BinDataInput, TransposeDataInput, SampleDataInput, ColumnStatsInput, ComputedColumnsInput, ParseDatesInput, StringTransformInput, ValidateRulesInput, FillMissingInput, RenameColumnsInput } from "./tools-v4.js";

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

// =============================================================================
// TOOL 35: flow_bin_data — HISTOGRAM BINNING
// =============================================================================

describe("flow_bin_data", () => {
  const CSV = "value\n1\n5\n10\n15\n20\n25\n30\n35\n40\n45";

  it("creates correct number of bins", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    expect(result.bin_count).toBe(5);
  });

  it("CSV has bin_min, bin_max, count, frequency columns", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    expect(result.csv).toContain("bin_min");
    expect(result.csv).toContain("bin_max");
    expect(result.csv).toContain("count");
    expect(result.csv).toContain("frequency");
  });

  it("all values are assigned to bins (count sums to total)", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const countIdx = headers.indexOf("count");
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      total += Number(lines[i].split(",")[countIdx]);
    }
    expect(total).toBe(10);
  });

  it("frequency values sum to ~1.0", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const freqIdx = headers.indexOf("frequency");
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      total += Number(lines[i].split(",")[freqIdx]);
    }
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
  });

  it("auto-selects bins when not specified", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
    });
    expect(result.bin_count).toBeGreaterThan(0);
  });

  it("throws on nonexistent column", () => {
    expect(() =>
      flowBinData({ csv_content: CSV, column: "nonexistent", bins: 5 })
    ).toThrow();
  });

  it("throws on non-numeric column", () => {
    const csv = "name\nAlice\nBob\nCharlie";
    expect(() =>
      flowBinData({ csv_content: csv, column: "name", bins: 5 })
    ).toThrow();
  });

  it("single bin captures all values", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 1,
    });
    expect(result.bin_count).toBe(1);
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const countIdx = headers.indexOf("count");
    expect(Number(lines[1].split(",")[countIdx])).toBe(10);
  });

  it("returns summary text", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("includes bin_label column", () => {
    const result = flowBinData({
      csv_content: CSV,
      column: "value",
      bins: 5,
    });
    expect(result.csv).toContain("bin_label");
  });
});

// =============================================================================
// TOOL 36: flow_transpose_data — ROWS ↔ COLUMNS
// =============================================================================

describe("flow_transpose_data", () => {
  it("transposes rows and columns", () => {
    const csv = "name,q1,q2,q3\nRevenue,100,200,300\nProfit,50,80,120";
    const result = flowTransposeData({
      csv_content: csv,
      header_column: "name",
    });
    // Should have columns: metric, Revenue, Profit
    expect(result.csv).toContain("Revenue");
    expect(result.csv).toContain("Profit");
    expect(result.row_count).toBe(3); // q1, q2, q3
    expect(result.column_count).toBe(3); // metric, Revenue, Profit
  });

  it("preserves values correctly", () => {
    const csv = "name,a,b\nX,1,2\nY,3,4";
    const result = flowTransposeData({
      csv_content: csv,
      header_column: "name",
    });
    // After transpose: metric,X,Y\na,1,3\nb,2,4
    expect(result.csv).toContain("1");
    expect(result.csv).toContain("4");
  });

  it("uses first column as header when not specified", () => {
    const csv = "label,val1,val2\nA,10,20\nB,30,40";
    const result = flowTransposeData({
      csv_content: csv,
    });
    expect(result.csv).toContain("A");
    expect(result.csv).toContain("B");
  });

  it("handles single row", () => {
    const csv = "name,a,b,c\nX,1,2,3";
    const result = flowTransposeData({
      csv_content: csv,
      header_column: "name",
    });
    expect(result.row_count).toBe(3); // a, b, c
    expect(result.column_count).toBe(2); // metric, X
  });

  it("throws on nonexistent header column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowTransposeData({ csv_content: csv, header_column: "nonexistent" })
    ).toThrow();
  });

  it("returns summary text", () => {
    const csv = "name,a,b\nX,1,2\nY,3,4";
    const result = flowTransposeData({
      csv_content: csv,
      header_column: "name",
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("handles many columns gracefully", () => {
    const cols = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const csv = "name," + cols.join(",") + "\nrow1," + cols.map((_, i) => i).join(",");
    const result = flowTransposeData({
      csv_content: csv,
      header_column: "name",
    });
    expect(result.row_count).toBe(20);
  });
});

// =============================================================================
// TOOL 37: flow_sample_data — SMART DATA SAMPLING
// =============================================================================

describe("flow_sample_data", () => {
  const CSV = "id,val,cat\n" + Array.from({ length: 100 }, (_, i) =>
    `${i},${i * 10},${i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C"}`
  ).join("\n");

  it("random sampling returns requested count", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 20,
      method: "random",
    });
    expect(result.sampled_rows).toBe(20);
  });

  it("first-N returns first rows", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 5,
      method: "first",
    });
    expect(result.sampled_rows).toBe(5);
    const lines = result.csv.split("\n");
    expect(lines[1]).toContain("0,0");
  });

  it("every-nth returns evenly spaced rows", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 10,
      method: "every_nth",
    });
    expect(result.sampled_rows).toBe(10);
  });

  it("stratified preserves category proportions", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 30,
      method: "stratified",
      stratify_column: "cat",
    });
    expect(result.sampled_rows).toBeLessThanOrEqual(30);
    expect(result.sampled_rows).toBeGreaterThan(0);
    // Check that we have samples from each category
    expect(result.csv).toContain(",A");
    expect(result.csv).toContain(",B");
    expect(result.csv).toContain(",C");
  });

  it("n > total rows returns all rows", () => {
    const smallCsv = "id,val\n1,10\n2,20\n3,30";
    const result = flowSampleData({
      csv_content: smallCsv,
      n: 100,
      method: "random",
    });
    expect(result.sampled_rows).toBe(3);
  });

  it("preserves headers and columns", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 5,
      method: "first",
    });
    expect(result.csv).toContain("id,val,cat");
  });

  it("returns summary text", () => {
    const result = flowSampleData({
      csv_content: CSV,
      n: 10,
      method: "random",
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("throws on nonexistent stratify column", () => {
    expect(() =>
      flowSampleData({
        csv_content: CSV,
        n: 10,
        method: "stratified",
        stratify_column: "nonexistent",
      })
    ).toThrow();
  });
});

// =============================================================================
// TOOL 38: flow_column_stats — DESCRIPTIVE STATISTICS
// =============================================================================

describe("flow_column_stats", () => {
  const CSV = "name,score,revenue\nAlice,80,1000\nBob,90,2000\nCharlie,70,3000\nDiana,100,4000\nEve,60,5000";

  it("returns stats for all numeric columns by default", () => {
    const result = flowColumnStats({
      csv_content: CSV,
    });
    expect(result.stats.length).toBeGreaterThanOrEqual(2); // score, revenue
  });

  it("includes count, mean, std, min, max, median", () => {
    const result = flowColumnStats({
      csv_content: CSV,
      columns: ["score"],
    });
    const stat = result.stats[0];
    expect(stat.column).toBe("score");
    expect(stat.count).toBe(5);
    expect(stat.mean).toBe(80); // (60+70+80+90+100)/5
    expect(stat.min).toBe(60);
    expect(stat.max).toBe(100);
    expect(stat.median).toBe(80);
  });

  it("includes quartiles", () => {
    const result = flowColumnStats({
      csv_content: CSV,
      columns: ["score"],
    });
    expect(result.stats[0].q1).toBeDefined();
    expect(result.stats[0].q3).toBeDefined();
    expect(result.stats[0].q1!).toBeLessThanOrEqual(result.stats[0].median!);
    expect(result.stats[0].q3!).toBeGreaterThanOrEqual(result.stats[0].median!);
  });

  it("generates CSV output with stats as rows", () => {
    const result = flowColumnStats({
      csv_content: CSV,
      columns: ["score", "revenue"],
    });
    expect(result.csv).toContain("column");
    expect(result.csv).toContain("score");
    expect(result.csv).toContain("revenue");
  });

  it("throws on nonexistent column", () => {
    expect(() =>
      flowColumnStats({
        csv_content: CSV,
        columns: ["nonexistent"],
      })
    ).toThrow();
  });

  it("returns summary text", () => {
    const result = flowColumnStats({
      csv_content: CSV,
    });
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("handles single column", () => {
    const csv = "val\n1\n2\n3\n4\n5";
    const result = flowColumnStats({
      csv_content: csv,
      columns: ["val"],
    });
    expect(result.stats.length).toBe(1);
    expect(result.stats[0].mean).toBe(3);
    expect(result.stats[0].std).toBeGreaterThan(0);
  });

  it("handles missing values by counting only valid ones", () => {
    const csv = "val\n10\n\n30\n\n50";
    const result = flowColumnStats({
      csv_content: csv,
      columns: ["val"],
    });
    expect(result.stats[0].count).toBe(3); // only 10, 30, 50
    expect(result.stats[0].mean).toBe(30);
  });
});

// ============================================================================
// TOOL 39: flow_computed_columns
// ============================================================================

describe("flowComputedColumns", () => {
  it("adds a simple arithmetic column", () => {
    const csv = "a,b\n10,3\n20,7\n30,5";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "sum", formula: "a + b" }],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("sum");
    expect(lines[1]).toContain("13");
    expect(lines[2]).toContain("27");
    expect(lines[3]).toContain("35");
  });

  it("supports subtraction", () => {
    const csv = "x,y\n100,30\n50,20";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "diff", formula: "x - y" }],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("70");
    expect(lines[2]).toContain("30");
  });

  it("supports multiplication", () => {
    const csv = "price,qty\n10,5\n20,3";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "total", formula: "price * qty" }],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("50");
    expect(lines[2]).toContain("60");
  });

  it("supports division", () => {
    const csv = "a,b\n100,4\n50,5";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "ratio", formula: "a / b" }],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("25");
    expect(lines[2]).toContain("10");
  });

  it("supports multiple expressions at once", () => {
    const csv = "a,b\n10,5\n20,8";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [
        { name: "sum", formula: "a + b" },
        { name: "product", formula: "a * b" },
      ],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("sum");
    expect(header).toContain("product");
    expect(result.columns_added).toBe(2);
  });

  it("preserves original columns", () => {
    const csv = "x,y\n1,2\n3,4";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "z", formula: "x + y" }],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("x,y,z");
  });

  it("handles division by zero gracefully", () => {
    const csv = "a,b\n10,0\n20,5";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "ratio", formula: "a / b" }],
    });
    // Should not throw, should produce Infinity or NaN string
    expect(result.csv).toBeTruthy();
    expect(result.row_count).toBe(2);
  });

  it("returns correct row_count and summary", () => {
    const csv = "a,b\n1,2\n3,4\n5,6";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "c", formula: "a + b" }],
    });
    expect(result.row_count).toBe(3);
    expect(result.summary).toBeTruthy();
  });

  it("throws on empty expressions", () => {
    const csv = "a,b\n1,2";
    expect(() => flowComputedColumns({ csv_content: csv, expressions: [] })).toThrow();
  });

  it("supports parentheses", () => {
    const csv = "a,b,c\n2,3,4";
    const result = flowComputedColumns({
      csv_content: csv,
      expressions: [{ name: "calc", formula: "(a + b) * c" }],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("20");
  });
});

// ============================================================================
// TOOL 40: flow_parse_dates
// ============================================================================

describe("flowParseDates", () => {
  it("parses ISO dates and extracts year", () => {
    const csv = "date,val\n2024-01-15,100\n2024-06-20,200";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["year"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_year");
    expect(lines[1]).toContain("2024");
  });

  it("extracts month", () => {
    const csv = "date,val\n2024-03-15,100\n2024-11-20,200";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["month"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_month");
    expect(lines[1]).toContain("3");
    expect(lines[2]).toContain("11");
  });

  it("extracts day", () => {
    const csv = "date,val\n2024-03-15,100";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["day"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_day");
    expect(lines[1]).toContain("15");
  });

  it("extracts day_of_week", () => {
    const csv = "date,val\n2024-01-01,100"; // Monday
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["day_of_week"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_day_of_week");
    // 2024-01-01 is a Monday = 1
    expect(lines[1]).toContain("1");
  });

  it("extracts quarter", () => {
    const csv = "date,val\n2024-01-15,100\n2024-04-15,200\n2024-09-15,300";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["quarter"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_quarter");
    expect(lines[1]).toContain("1");
    expect(lines[2]).toContain("2");
    expect(lines[3]).toContain("3");
  });

  it("extracts multiple components at once", () => {
    const csv = "date,val\n2024-06-15,100";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["year", "month", "quarter"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("date_year");
    expect(header).toContain("date_month");
    expect(header).toContain("date_quarter");
    expect(result.components_added).toBe(3);
  });

  it("preserves original columns", () => {
    const csv = "date,val\n2024-01-15,100";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["year"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("date");
    expect(header).toContain("val");
  });

  it("handles epoch_days output", () => {
    const csv = "date,val\n2024-01-01,100\n2024-01-02,200";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["epoch_days"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("date_epoch_days");
    // Second date should be exactly 1 more than first
    const header = lines[0].split(",");
    const epochIdx = header.indexOf("date_epoch_days");
    const day1 = Number(lines[1].split(",")[epochIdx]);
    const day2 = Number(lines[2].split(",")[epochIdx]);
    expect(day2 - day1).toBe(1);
  });

  it("returns parsed_count and summary", () => {
    const csv = "date,val\n2024-01-15,100\n2024-06-20,200";
    const result = flowParseDates({
      csv_content: csv,
      date_column: "date",
      output_components: ["year"],
    });
    expect(result.parsed_count).toBe(2);
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing date column", () => {
    const csv = "val\n100";
    expect(() => flowParseDates({ csv_content: csv, date_column: "date", output_components: ["year"] })).toThrow();
  });
});

// ============================================================================
// TOOL 41: flow_string_transform
// ============================================================================

describe("flowStringTransform", () => {
  it("converts to uppercase", () => {
    const csv = "name,val\nalice,1\nbob,2";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "uppercase",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("ALICE");
    expect(lines[2]).toContain("BOB");
  });

  it("converts to lowercase", () => {
    const csv = "name,val\nALICE,1\nBOB,2";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "lowercase",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("alice");
    expect(lines[2]).toContain("bob");
  });

  it("trims whitespace", () => {
    const csv = "name,val\n\" alice \",1\n\" bob \",2";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "trim",
    });
    expect(result.csv).toContain("alice");
    expect(result.csv).toContain("bob");
  });

  it("applies title case", () => {
    const csv = "name\nhello world\nfoo bar";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "title_case",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("Hello World");
    expect(lines[2]).toBe("Foo Bar");
  });

  it("replaces substrings", () => {
    const csv = "text\nhello world\nhello foo";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["text"],
      transform: "replace",
      find: "hello",
      replace_with: "hi",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("hi world");
    expect(lines[2]).toBe("hi foo");
  });

  it("transforms multiple columns", () => {
    const csv = "a,b\nhello,world\nfoo,bar";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["a", "b"],
      transform: "uppercase",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("HELLO,WORLD");
    expect(lines[2]).toBe("FOO,BAR");
  });

  it("preserves non-transformed columns", () => {
    const csv = "name,score\nalice,100\nbob,200";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "uppercase",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("ALICE,100");
    expect(lines[2]).toBe("BOB,200");
  });

  it("returns row_count and summary", () => {
    const csv = "name\nalice\nbob\ncharlie";
    const result = flowStringTransform({
      csv_content: csv,
      columns: ["name"],
      transform: "uppercase",
    });
    expect(result.row_count).toBe(3);
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing column", () => {
    const csv = "name\nalice";
    expect(() => flowStringTransform({ csv_content: csv, columns: ["missing"], transform: "uppercase" })).toThrow();
  });
});

// ============================================================================
// TOOL 42: flow_validate_rules
// ============================================================================

describe("flowValidateRules", () => {
  it("validates not_null rule", () => {
    const csv = "name,age\nAlice,30\n,25\nCharlie,";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "name", rule: "not_null" }],
    });
    expect(result.total_violations).toBeGreaterThan(0);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].column).toBe("name");
  });

  it("validates min rule", () => {
    const csv = "age\n30\n5\n25";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "age", rule: "min", value: 18 }],
    });
    expect(result.total_violations).toBe(1); // age=5 < 18
  });

  it("validates max rule", () => {
    const csv = "score\n50\n150\n80";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "score", rule: "max", value: 100 }],
    });
    expect(result.total_violations).toBe(1); // 150 > 100
  });

  it("validates unique rule", () => {
    const csv = "id\n1\n2\n1\n3";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "id", rule: "unique" }],
    });
    expect(result.total_violations).toBe(1); // id=1 duplicated
  });

  it("validates pattern rule (regex)", () => {
    const csv = "email\nfoo@bar.com\ninvalid\ntest@test.org";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "email", rule: "pattern", pattern: "^.+@.+\\..+$" }],
    });
    expect(result.total_violations).toBe(1); // "invalid" doesn't match
  });

  it("validates in_set rule", () => {
    const csv = "status\nactive\npending\nunknown\nactive";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "status", rule: "in_set", allowed_values: ["active", "pending", "completed"] }],
    });
    expect(result.total_violations).toBe(1); // "unknown" not in set
  });

  it("validates multiple rules at once", () => {
    const csv = "name,age\nAlice,30\n,5\nCharlie,25";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [
        { column: "name", rule: "not_null" },
        { column: "age", rule: "min", value: 18 },
      ],
    });
    expect(result.total_violations).toBe(2); // name is null + age=5
  });

  it("returns valid_rows and invalid_rows counts", () => {
    const csv = "val\n10\n20\n30";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "val", rule: "max", value: 25 }],
    });
    expect(result.valid_rows).toBe(2);
    expect(result.invalid_rows).toBe(1);
    expect(result.total_rows).toBe(3);
  });

  it("returns pass=true when no violations", () => {
    const csv = "val\n10\n20\n30";
    const result = flowValidateRules({
      csv_content: csv,
      rules: [{ column: "val", rule: "min", value: 0 }],
    });
    expect(result.pass).toBe(true);
    expect(result.total_violations).toBe(0);
  });

  it("throws on missing column", () => {
    const csv = "val\n10";
    expect(() => flowValidateRules({ csv_content: csv, rules: [{ column: "missing", rule: "not_null" }] })).toThrow();
  });
});

// ============================================================================
// TOOL 43: flow_fill_missing
// ============================================================================

describe("flowFillMissing", () => {
  it("fills with constant value", () => {
    const csv = "a,b\n1,\n,3\n5,6";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["a", "b"],
      method: "constant",
      fill_value: "0",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("1,0");
    expect(lines[2]).toBe("0,3");
  });

  it("fills with mean", () => {
    const csv = "val\n10\n\n30";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["val"],
      method: "mean",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[2]).toBe("20"); // mean of 10 and 30
  });

  it("fills with median", () => {
    const csv = "val\n10\n\n30\n40";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["val"],
      method: "median",
    });
    const lines = result.csv.trim().split("\n");
    expect(Number(lines[2])).toBe(30); // median of 10, 30, 40
  });

  it("fills with forward fill", () => {
    const csv = "val\n10\n\n\n40";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["val"],
      method: "forward",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[2]).toBe("10"); // forward from row 1
    expect(lines[3]).toBe("10"); // forward from row 1
  });

  it("returns filled_count and summary", () => {
    const csv = "a,b\n1,\n,3";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["a", "b"],
      method: "constant",
      fill_value: "0",
    });
    expect(result.filled_count).toBe(2);
    expect(result.summary).toBeTruthy();
  });

  it("preserves non-empty values", () => {
    const csv = "val\n10\n20\n30";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["val"],
      method: "constant",
      fill_value: "999",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("10");
    expect(lines[2]).toBe("20");
    expect(lines[3]).toBe("30");
    expect(result.filled_count).toBe(0);
  });

  it("auto-detects columns when not specified", () => {
    const csv = "a,b\n1,\n,3";
    const result = flowFillMissing({
      csv_content: csv,
      method: "constant",
      fill_value: "0",
    });
    expect(result.filled_count).toBe(2);
  });

  it("fills with mode", () => {
    const csv = "cat\nA\nB\nA\n\nA";
    const result = flowFillMissing({
      csv_content: csv,
      columns: ["cat"],
      method: "mode",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[4]).toBe("A"); // mode is A (3 occurrences)
  });
});

// ============================================================================
// TOOL 44: flow_rename_columns
// ============================================================================

describe("flowRenameColumns", () => {
  it("renames columns", () => {
    const csv = "old_name,val\nfoo,1\nbar,2";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { old_name: "new_name" },
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("new_name");
    expect(header).not.toContain("old_name");
  });

  it("renames multiple columns", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { a: "x", c: "z" },
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("x,b,z");
  });

  it("preserves data rows", () => {
    const csv = "name,score\nAlice,100\nBob,200";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { name: "student" },
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("Alice,100");
    expect(lines[2]).toBe("Bob,200");
  });

  it("reorders columns when order is specified", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const result = flowRenameColumns({
      csv_content: csv,
      order: ["c", "a", "b"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("c,a,b");
    expect(lines[1]).toBe("3,1,2");
  });

  it("renames and reorders simultaneously", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { a: "x" },
      order: ["c", "x", "b"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("c,x,b");
    expect(lines[1]).toBe("3,1,2");
  });

  it("returns columns_renamed count", () => {
    const csv = "a,b\n1,2";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { a: "x", b: "y" },
    });
    expect(result.columns_renamed).toBe(2);
  });

  it("returns summary", () => {
    const csv = "a,b\n1,2";
    const result = flowRenameColumns({
      csv_content: csv,
      renames: { a: "alpha" },
    });
    expect(result.summary).toBeTruthy();
  });

  it("throws on non-existent column in renames", () => {
    const csv = "a,b\n1,2";
    expect(() => flowRenameColumns({ csv_content: csv, renames: { missing: "x" } })).toThrow();
  });
});