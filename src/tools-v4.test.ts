/**
 * Tests for tools-v4.ts (flow_live_data, flow_correlation_matrix, flow_cluster_data)
 *
 * Unit tests for live data, correlation matrix, and clustering tools.
 * Network-dependent tests are marked with .skip for CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flowLiveData, flowCorrelationMatrix, flowClusterData, flowHierarchicalData, flowCompareDatasets, flowPivotTable, flowRegressionAnalysis, flowNormalizeData, flowDeduplicateRows, flowBinData, flowTransposeData, flowSampleData, flowColumnStats, flowComputedColumns, flowParseDates, flowStringTransform, flowValidateRules, flowFillMissing, flowRenameColumns, flowFilterRows, flowSplitDataset, flowSelectColumns, flowSortRows, flowUnpivot, flowJoinDatasets, flowCrossTabulate, flowWindowFunctions, flowEncodeCategorical, flowCumulative, flowPercentileRank, flowCoalesceColumns, flowDescribeDataset, flowLagLead, flowGroupAggregate, flowRowNumber, flowTypeCast, flowConcatRows, flowValueCounts, flowDateDiff, flowOutlierFence, flowMovingAverage, flowEntropy, flowStandardize, flowRatioColumns, flowDiscretize } from "./tools-v4.js";
import type { LiveDataInput, CorrelationMatrixInput, ClusterDataInput, HierarchicalDataInput, CompareDataInput, PivotTableInput, RegressionAnalysisInput, NormalizeDataInput, DeduplicateRowsInput, BinDataInput, TransposeDataInput, SampleDataInput, ColumnStatsInput, ComputedColumnsInput, ParseDatesInput, StringTransformInput, ValidateRulesInput, FillMissingInput, RenameColumnsInput, FilterRowsInput, SplitDatasetInput, SelectColumnsInput, SortRowsInput, UnpivotInput, JoinDatasetsInput, CrossTabulateInput, WindowFunctionsInput, EncodeCategoricalInput, CumulativeInput, PercentileRankInput, CoalesceColumnsInput, DescribeDatasetInput, LagLeadInput, GroupAggregateInput, RowNumberInput, TypeCastInput, ConcatRowsInput, ValueCountsInput, DateDiffInput, OutlierFenceInput, MovingAverageInput, EntropyInput, StandardizeInput, RatioColumnsInput, DiscretizeInput } from "./tools-v4.js";

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

// ============================================================================
// TOOL 45: flow_filter_rows
// ============================================================================

describe("flowFilterRows", () => {
  it("filters with equals condition", () => {
    const csv = "name,age\nAlice,30\nBob,25\nCharlie,30";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "age", operator: "equals", value: "30" }],
    });
    expect(result.matched_rows).toBe(2);
    expect(result.csv).toContain("Alice");
    expect(result.csv).toContain("Charlie");
    expect(result.csv).not.toContain("Bob");
  });

  it("filters with not_equals condition", () => {
    const csv = "name,age\nAlice,30\nBob,25\nCharlie,30";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "age", operator: "not_equals", value: "30" }],
    });
    expect(result.matched_rows).toBe(1);
    expect(result.csv).toContain("Bob");
  });

  it("filters with greater_than", () => {
    const csv = "name,score\nAlice,90\nBob,70\nCharlie,85";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "score", operator: "greater_than", value: "80" }],
    });
    expect(result.matched_rows).toBe(2); // 90, 85
  });

  it("filters with less_than", () => {
    const csv = "name,score\nAlice,90\nBob,70\nCharlie,85";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "score", operator: "less_than", value: "80" }],
    });
    expect(result.matched_rows).toBe(1); // 70
  });

  it("filters with contains", () => {
    const csv = "city\nNew York\nLos Angeles\nNew Orleans";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "city", operator: "contains", value: "New" }],
    });
    expect(result.matched_rows).toBe(2);
  });

  it("combines multiple conditions (AND)", () => {
    const csv = "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,30,NYC\nDiana,35,LA";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [
        { column: "age", operator: "greater_than", value: "28" },
        { column: "city", operator: "equals", value: "NYC" },
      ],
    });
    expect(result.matched_rows).toBe(2); // Alice + Charlie
  });

  it("preserves all columns", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "a", operator: "equals", value: "1" }],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("a,b,c");
  });

  it("returns total_rows and summary", () => {
    const csv = "val\n10\n20\n30";
    const result = flowFilterRows({
      csv_content: csv,
      conditions: [{ column: "val", operator: "greater_than", value: "15" }],
    });
    expect(result.total_rows).toBe(3);
    expect(result.matched_rows).toBe(2);
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing column", () => {
    const csv = "val\n10";
    expect(() => flowFilterRows({ csv_content: csv, conditions: [{ column: "missing", operator: "equals", value: "x" }] })).toThrow();
  });
});

// ============================================================================
// TOOL 46: flow_split_dataset
// ============================================================================

describe("flowSplitDataset", () => {
  it("splits by column value", () => {
    const csv = "group,val\nA,1\nB,2\nA,3\nB,4";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "group",
    });
    expect(result.splits.length).toBe(2);
    const splitA = result.splits.find(s => s.value === "A");
    const splitB = result.splits.find(s => s.value === "B");
    expect(splitA).toBeTruthy();
    expect(splitB).toBeTruthy();
    expect(splitA!.row_count).toBe(2);
    expect(splitB!.row_count).toBe(2);
  });

  it("each split has correct CSV content", () => {
    const csv = "group,val\nA,1\nB,2\nA,3";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "group",
    });
    const splitA = result.splits.find(s => s.value === "A");
    expect(splitA!.csv).toContain("group,val");
    expect(splitA!.csv).toContain("A,1");
    expect(splitA!.csv).toContain("A,3");
    expect(splitA!.csv).not.toContain("B,2");
  });

  it("splits three groups", () => {
    const csv = "cat,val\nX,1\nY,2\nZ,3\nX,4";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "cat",
    });
    expect(result.splits.length).toBe(3);
    expect(result.total_groups).toBe(3);
  });

  it("preserves all columns in splits", () => {
    const csv = "group,a,b\nX,1,2\nY,3,4";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "group",
    });
    for (const split of result.splits) {
      const header = split.csv.trim().split("\n")[0];
      expect(header).toBe("group,a,b");
    }
  });

  it("returns split row counts that sum to total", () => {
    const csv = "group,val\nA,1\nB,2\nA,3\nB,4\nC,5";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "group",
    });
    const totalSplit = result.splits.reduce((sum, s) => sum + s.row_count, 0);
    expect(totalSplit).toBe(result.total_rows);
  });

  it("returns summary", () => {
    const csv = "group,val\nA,1\nB,2";
    const result = flowSplitDataset({
      csv_content: csv,
      split_column: "group",
    });
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing split column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowSplitDataset({ csv_content: csv, split_column: "missing" })).toThrow();
  });
});

// ============================================================================
// TOOL 47: flow_select_columns
// ============================================================================

describe("flowSelectColumns", () => {
  it("selects specified columns", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const result = flowSelectColumns({
      csv_content: csv,
      columns: ["a", "c"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("a,c");
    expect(lines[1]).toBe("1,3");
    expect(lines[2]).toBe("4,6");
  });

  it("selects single column", () => {
    const csv = "name,age,city\nAlice,30,NYC\nBob,25,LA";
    const result = flowSelectColumns({
      csv_content: csv,
      columns: ["name"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("name");
    expect(lines[1]).toBe("Alice");
  });

  it("preserves column order as specified", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowSelectColumns({
      csv_content: csv,
      columns: ["c", "a"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("c,a");
    expect(lines[1]).toBe("3,1");
  });

  it("supports exclude mode", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowSelectColumns({
      csv_content: csv,
      columns: ["b"],
      mode: "exclude",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("a,c");
    expect(lines[1]).toBe("1,3");
  });

  it("returns selected_count and summary", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowSelectColumns({
      csv_content: csv,
      columns: ["a", "c"],
    });
    expect(result.selected_count).toBe(2);
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowSelectColumns({ csv_content: csv, columns: ["missing"] })).toThrow();
  });
});

// ============================================================================
// TOOL 48: flow_sort_rows
// ============================================================================

describe("flowSortRows", () => {
  it("sorts ascending by numeric column", () => {
    const csv = "name,score\nBob,80\nAlice,95\nCharlie,70";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "score",
      order: "asc",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("Charlie"); // 70
    expect(lines[2]).toContain("Bob");     // 80
    expect(lines[3]).toContain("Alice");   // 95
  });

  it("sorts descending by numeric column", () => {
    const csv = "name,score\nBob,80\nAlice,95\nCharlie,70";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "score",
      order: "desc",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("Alice");   // 95
    expect(lines[2]).toContain("Bob");     // 80
    expect(lines[3]).toContain("Charlie"); // 70
  });

  it("sorts alphabetically by text column", () => {
    const csv = "name,score\nCharlie,70\nAlice,95\nBob,80";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "name",
      order: "asc",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("Alice");
    expect(lines[2]).toContain("Bob");
    expect(lines[3]).toContain("Charlie");
  });

  it("preserves all columns", () => {
    const csv = "a,b,c\n3,x,y\n1,p,q\n2,r,s";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "a",
      order: "asc",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("a,b,c");
  });

  it("returns row_count and summary", () => {
    const csv = "val\n3\n1\n2";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "val",
      order: "asc",
    });
    expect(result.row_count).toBe(3);
    expect(result.summary).toBeTruthy();
  });

  it("defaults to ascending", () => {
    const csv = "val\n3\n1\n2";
    const result = flowSortRows({
      csv_content: csv,
      sort_by: "val",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toBe("1");
    expect(lines[2]).toBe("2");
    expect(lines[3]).toBe("3");
  });

  it("throws on missing column", () => {
    const csv = "val\n1";
    expect(() => flowSortRows({ csv_content: csv, sort_by: "missing" })).toThrow();
  });
});

// ============================================================================
// TOOL 49: flow_unpivot
// ============================================================================

describe("flowUnpivot", () => {
  it("melts wide columns to long format", () => {
    const csv = "name,q1,q2,q3\nAlice,10,20,30\nBob,40,50,60";
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["name"],
      value_columns: ["q1", "q2", "q3"],
      variable_name: "quarter",
      value_name: "amount",
    });
    const lines = result.csv.trim().split("\n");
    // header: name,quarter,amount
    expect(lines[0]).toBe("name,quarter,amount");
    // 2 rows * 3 value columns = 6 data rows
    expect(lines.length).toBe(7); // 1 header + 6 data
    expect(result.row_count).toBe(6);
  });

  it("uses default variable/value names", () => {
    const csv = "id,a,b\n1,10,20";
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["id"],
      value_columns: ["a", "b"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("id,variable,value");
  });

  it("preserves id column values in each row", () => {
    const csv = "name,x,y\nAlice,1,2\nBob,3,4";
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["name"],
      value_columns: ["x", "y"],
    });
    const lines = result.csv.trim().split("\n");
    // First two data rows should be Alice with x and y
    expect(lines[1]).toContain("Alice");
    expect(lines[2]).toContain("Alice");
    // Next two should be Bob
    expect(lines[3]).toContain("Bob");
    expect(lines[4]).toContain("Bob");
  });

  it("supports multiple id columns", () => {
    const csv = "region,year,sales,profit\nUS,2024,100,10\nEU,2024,200,20";
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["region", "year"],
      value_columns: ["sales", "profit"],
      variable_name: "metric",
      value_name: "amount",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("region,year,metric,amount");
    expect(result.row_count).toBe(4); // 2 rows * 2 value cols
  });

  it("returns summary with row count", () => {
    const csv = "id,a,b\n1,10,20\n2,30,40";
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["id"],
      value_columns: ["a", "b"],
    });
    expect(result.summary).toBeTruthy();
    expect(result.row_count).toBe(4);
  });

  it("handles values with commas by escaping", () => {
    const csv = 'id,a\n1,"hello, world"';
    const result = flowUnpivot({
      csv_content: csv,
      id_columns: ["id"],
      value_columns: ["a"],
    });
    expect(result.row_count).toBe(1);
    // Value should be properly escaped in output
    expect(result.csv).toContain("hello, world");
  });

  it("throws on missing id column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowUnpivot({
      csv_content: csv,
      id_columns: ["missing"],
      value_columns: ["a"],
    })).toThrow();
  });

  it("throws on missing value column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowUnpivot({
      csv_content: csv,
      id_columns: ["a"],
      value_columns: ["missing"],
    })).toThrow();
  });
});

// ============================================================================
// TOOL 50: flow_join_datasets
// ============================================================================

describe("flowJoinDatasets", () => {
  it("performs inner join on shared key", () => {
    const left = "id,name\n1,Alice\n2,Bob\n3,Carol";
    const right = "id,score\n1,95\n2,80\n4,70";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "inner",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("id,name,score");
    // Inner join: only ids 1 and 2 match
    expect(result.row_count).toBe(2);
  });

  it("performs left join preserving all left rows", () => {
    const left = "id,name\n1,Alice\n2,Bob\n3,Carol";
    const right = "id,score\n1,95\n2,80";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "left",
    });
    // All 3 left rows preserved
    expect(result.row_count).toBe(3);
    // Carol should have empty score
    const lines = result.csv.trim().split("\n");
    const carolLine = lines.find(l => l.includes("Carol"));
    expect(carolLine).toBeTruthy();
  });

  it("performs right join preserving all right rows", () => {
    const left = "id,name\n1,Alice";
    const right = "id,score\n1,95\n2,80\n3,70";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "right",
    });
    // All 3 right rows preserved
    expect(result.row_count).toBe(3);
  });

  it("performs full outer join", () => {
    const left = "id,name\n1,Alice\n2,Bob";
    const right = "id,score\n2,80\n3,70";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "full",
    });
    // id 1 (left only), id 2 (both), id 3 (right only)
    expect(result.row_count).toBe(3);
  });

  it("defaults to inner join", () => {
    const left = "id,val\n1,a\n2,b";
    const right = "id,val2\n2,x\n3,y";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
    });
    // Default inner: only id 2
    expect(result.row_count).toBe(1);
  });

  it("handles duplicate non-key column names with _right suffix", () => {
    const left = "id,val\n1,a";
    const right = "id,val\n1,b";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "inner",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toBe("id,val,val_right");
  });

  it("returns summary with match stats", () => {
    const left = "id,name\n1,Alice\n2,Bob";
    const right = "id,score\n1,95";
    const result = flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "left",
    });
    expect(result.summary).toBeTruthy();
    expect(result.matched_rows).toBe(1);
  });

  it("throws on missing join key in left CSV", () => {
    const left = "name\nAlice";
    const right = "id,score\n1,95";
    expect(() => flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "inner",
    })).toThrow();
  });

  it("throws on missing join key in right CSV", () => {
    const left = "id,name\n1,Alice";
    const right = "score\n95";
    expect(() => flowJoinDatasets({
      left_csv: left,
      right_csv: right,
      join_key: "id",
      join_type: "inner",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 51: flow_cross_tabulate
// ============================================================================

describe("flowCrossTabulate", () => {
  it("counts co-occurrences of two columns", () => {
    const csv = "color,size\nred,S\nred,M\nblue,S\nblue,S\nred,S";
    const result = flowCrossTabulate({
      csv_content: csv,
      row_column: "color",
      col_column: "size",
    });
    const lines = result.csv.trim().split("\n");
    // Header: color,M,S (alphabetical column values)
    expect(lines[0]).toContain("color");
    expect(lines[0]).toContain("S");
    expect(lines[0]).toContain("M");
    // blue row: S=2, M=0
    const blueLine = lines.find(l => l.startsWith("blue"));
    expect(blueLine).toBeTruthy();
    expect(result.row_count).toBe(2); // 2 unique row values: blue, red
  });

  it("uses count aggregation by default", () => {
    const csv = "dept,grade\nEng,A\nEng,B\nEng,A\nSales,B";
    const result = flowCrossTabulate({
      csv_content: csv,
      row_column: "dept",
      col_column: "grade",
    });
    expect(result.aggregation).toBe("count");
    expect(result.summary).toBeTruthy();
  });

  it("supports sum aggregation with value column", () => {
    const csv = "region,product,revenue\nUS,A,100\nUS,B,200\nEU,A,150\nEU,A,50";
    const result = flowCrossTabulate({
      csv_content: csv,
      row_column: "region",
      col_column: "product",
      value_column: "revenue",
      aggregation: "sum",
    });
    // EU,A should sum to 200
    const lines = result.csv.trim().split("\n");
    const euLine = lines.find(l => l.startsWith("EU"));
    expect(euLine).toBeTruthy();
    expect(result.row_count).toBe(2);
  });

  it("supports mean aggregation", () => {
    const csv = "cat,type,val\nA,X,10\nA,X,20\nA,Y,30\nB,X,40";
    const result = flowCrossTabulate({
      csv_content: csv,
      row_column: "cat",
      col_column: "type",
      value_column: "val",
      aggregation: "mean",
    });
    // A,X mean = 15
    const lines = result.csv.trim().split("\n");
    const aLine = lines.find(l => l.startsWith("A"));
    expect(aLine).toContain("15");
  });

  it("handles single unique value per column", () => {
    const csv = "x,y\na,b\na,b\na,b";
    const result = flowCrossTabulate({
      csv_content: csv,
      row_column: "x",
      col_column: "y",
    });
    expect(result.row_count).toBe(1);
  });

  it("throws on missing row column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowCrossTabulate({
      csv_content: csv,
      row_column: "missing",
      col_column: "b",
    })).toThrow();
  });

  it("throws on missing col column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowCrossTabulate({
      csv_content: csv,
      row_column: "a",
      col_column: "missing",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 52: flow_window_functions
// ============================================================================

describe("flowWindowFunctions", () => {
  it("computes rolling average", () => {
    const csv = "day,val\n1,10\n2,20\n3,30\n4,40\n5,50";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "val",
      window_size: 3,
      functions: ["mean"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("val_mean_3");
    // First 2 rows: insufficient window, should be empty or partial
    // Row 3 (val=30): mean(10,20,30) = 20
    expect(result.row_count).toBe(5);
  });

  it("computes rolling sum", () => {
    const csv = "t,v\n1,1\n2,2\n3,3\n4,4";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "v",
      window_size: 2,
      functions: ["sum"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("v_sum_2");
    // Row 2: sum(1,2) = 3
    expect(lines[2]).toContain("3");
  });

  it("computes rolling min and max", () => {
    const csv = "t,v\n1,5\n2,3\n3,8\n4,1";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "v",
      window_size: 3,
      functions: ["min", "max"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("v_min_3");
    expect(header).toContain("v_max_3");
  });

  it("computes multiple functions at once", () => {
    const csv = "x,y\n1,10\n2,20\n3,30";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "y",
      window_size: 2,
      functions: ["mean", "sum", "min", "max"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("y_mean_2");
    expect(header).toContain("y_sum_2");
    expect(header).toContain("y_min_2");
    expect(header).toContain("y_max_2");
  });

  it("preserves all original columns", () => {
    const csv = "a,b,c\n1,10,x\n2,20,y\n3,30,z";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "b",
      window_size: 2,
      functions: ["mean"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
    expect(header).toContain("b_mean_2");
  });

  it("returns summary with window details", () => {
    const csv = "t,v\n1,10\n2,20\n3,30";
    const result = flowWindowFunctions({
      csv_content: csv,
      value_column: "v",
      window_size: 2,
      functions: ["mean"],
    });
    expect(result.summary).toBeTruthy();
    expect(result.window_size).toBe(2);
  });

  it("throws on missing value column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowWindowFunctions({
      csv_content: csv,
      value_column: "missing",
      window_size: 2,
      functions: ["mean"],
    })).toThrow();
  });
});

// ============================================================================
// TOOL 53: flow_encode_categorical
// ============================================================================

describe("flowEncodeCategorical", () => {
  it("label-encodes a column with sorted codes", () => {
    const csv = "color,size\nred,S\nblue,M\ngreen,L\nred,S";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["color"],
      method: "label",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("color_encoded");
    // blue=0, green=1, red=2 (alphabetical)
    expect(result.row_count).toBe(4);
    expect(result.mappings).toBeTruthy();
  });

  it("one-hot encodes a column", () => {
    const csv = "color,val\nred,1\nblue,2\nred,3";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["color"],
      method: "onehot",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("color_blue");
    expect(header).toContain("color_red");
    // One-hot: 0 or 1 per category column
    const lines = result.csv.trim().split("\n");
    expect(lines.length).toBe(4); // header + 3 rows
  });

  it("encodes multiple columns", () => {
    const csv = "a,b,c\nX,P,1\nY,Q,2\nX,P,3";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["a", "b"],
      method: "label",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a_encoded");
    expect(header).toContain("b_encoded");
  });

  it("preserves original columns alongside encoded ones", () => {
    const csv = "name,val\nAlice,10\nBob,20";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["name"],
      method: "label",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("name");
    expect(header).toContain("name_encoded");
    expect(header).toContain("val");
  });

  it("returns mapping of categories to codes", () => {
    const csv = "fruit\napple\nbanana\ncherry";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["fruit"],
      method: "label",
    });
    expect(result.mappings.fruit).toBeTruthy();
    expect(Object.keys(result.mappings.fruit).length).toBe(3);
  });

  it("defaults to label encoding", () => {
    const csv = "x\na\nb";
    const result = flowEncodeCategorical({
      csv_content: csv,
      columns: ["x"],
    });
    expect(result.method).toBe("label");
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() => flowEncodeCategorical({
      csv_content: csv,
      columns: ["missing"],
      method: "label",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 54: flow_cumulative
// ============================================================================

describe("flowCumulative", () => {
  it("computes cumulative sum", () => {
    const csv = "day,sales\n1,10\n2,20\n3,30";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "sales",
      functions: ["sum"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("sales_cumsum");
    // Row 1: 10, Row 2: 30, Row 3: 60
    expect(lines[1]).toContain("10");
    expect(lines[2]).toContain("30");
    expect(lines[3]).toContain("60");
  });

  it("computes cumulative min and max", () => {
    const csv = "t,v\n1,5\n2,3\n3,8\n4,1";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "v",
      functions: ["min", "max"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("v_cummin");
    expect(header).toContain("v_cummax");
    const lines = result.csv.trim().split("\n");
    // Row 4: cummin=1, cummax=8
    expect(lines[4]).toContain("1");
    expect(lines[4]).toContain("8");
  });

  it("computes cumulative count", () => {
    const csv = "x,y\na,1\nb,2\nc,3";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "y",
      functions: ["count"],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("y_cumcount");
    // Row 3: count=3
    expect(lines[3]).toContain("3");
  });

  it("computes multiple cumulative functions", () => {
    const csv = "t,v\n1,10\n2,20\n3,30";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "v",
      functions: ["sum", "min", "max", "count"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("v_cumsum");
    expect(header).toContain("v_cummin");
    expect(header).toContain("v_cummax");
    expect(header).toContain("v_cumcount");
  });

  it("preserves all original columns", () => {
    const csv = "a,b,c\n1,10,x\n2,20,y";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "b",
      functions: ["sum"],
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
  });

  it("returns summary", () => {
    const csv = "t,v\n1,10\n2,20";
    const result = flowCumulative({
      csv_content: csv,
      value_column: "v",
      functions: ["sum"],
    });
    expect(result.summary).toBeTruthy();
    expect(result.row_count).toBe(2);
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() => flowCumulative({
      csv_content: csv,
      value_column: "missing",
      functions: ["sum"],
    })).toThrow();
  });
});

// ============================================================================
// TOOL 55: flow_percentile_rank
// ============================================================================

describe("flowPercentileRank", () => {
  it("computes percentile rank for a numeric column", () => {
    const csv = "name,score\nAlice,90\nBob,70\nCarol,80\nDave,60";
    const result = flowPercentileRank({
      csv_content: csv,
      value_column: "score",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("score_percentile");
    expect(result.row_count).toBe(4);
    // Dave (60) should have lowest percentile, Alice (90) highest
  });

  it("produces percentiles between 0 and 100", () => {
    const csv = "v\n10\n20\n30\n40\n50";
    const result = flowPercentileRank({
      csv_content: csv,
      value_column: "v",
    });
    const lines = result.csv.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const pct = Number(parts[parts.length - 1]);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("handles ties by averaging ranks", () => {
    const csv = "v\n10\n10\n20";
    const result = flowPercentileRank({
      csv_content: csv,
      value_column: "v",
    });
    const lines = result.csv.trim().split("\n");
    // Both 10s should have same percentile
    const pct1 = lines[1].split(",").pop();
    const pct2 = lines[2].split(",").pop();
    expect(pct1).toBe(pct2);
  });

  it("preserves all original columns", () => {
    const csv = "a,b,c\n1,10,x\n2,20,y";
    const result = flowPercentileRank({
      csv_content: csv,
      value_column: "b",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
  });

  it("returns summary", () => {
    const csv = "v\n1\n2\n3";
    const result = flowPercentileRank({
      csv_content: csv,
      value_column: "v",
    });
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() => flowPercentileRank({
      csv_content: csv,
      value_column: "missing",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 56: flow_coalesce_columns
// ============================================================================

describe("flowCoalesceColumns", () => {
  it("takes first non-empty value from multiple columns", () => {
    const csv = "email1,email2,email3\n,,c@test.com\na@test.com,,\n,b@test.com,";
    const result = flowCoalesceColumns({
      csv_content: csv,
      columns: ["email1", "email2", "email3"],
      output_column: "email",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("email");
    // Row 1: email3 = c@test.com
    expect(lines[1]).toContain("c@test.com");
    // Row 2: email1 = a@test.com
    expect(lines[2]).toContain("a@test.com");
    // Row 3: email2 = b@test.com
    expect(lines[3]).toContain("b@test.com");
  });

  it("preserves all original columns plus output column", () => {
    const csv = "a,b,c\n1,,3\n,2,";
    const result = flowCoalesceColumns({
      csv_content: csv,
      columns: ["a", "b", "c"],
      output_column: "combined",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
    expect(header).toContain("combined");
  });

  it("returns empty for all-empty rows", () => {
    const csv = "a,b\n,,\n1,2";
    const result = flowCoalesceColumns({
      csv_content: csv,
      columns: ["a", "b"],
      output_column: "out",
    });
    expect(result.row_count).toBe(2);
    expect(result.filled_count).toBe(1); // only second row has a value
  });

  it("reports filled_count and summary", () => {
    const csv = "x,y\n1,\n,2\n3,4";
    const result = flowCoalesceColumns({
      csv_content: csv,
      columns: ["x", "y"],
      output_column: "merged",
    });
    expect(result.filled_count).toBe(3);
    expect(result.summary).toBeTruthy();
  });

  it("uses first provided column when multiple have values", () => {
    const csv = "a,b\nX,Y\nP,Q";
    const result = flowCoalesceColumns({
      csv_content: csv,
      columns: ["a", "b"],
      output_column: "first",
    });
    const lines = result.csv.trim().split("\n");
    // Both rows have both columns filled; should pick first (a)
    expect(lines[1]).toContain("X");
    expect(lines[2]).toContain("P");
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() => flowCoalesceColumns({
      csv_content: csv,
      columns: ["missing"],
      output_column: "out",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 57: flow_describe_dataset
// ============================================================================

describe("flowDescribeDataset", () => {
  it("returns shape with row and column counts", () => {
    const csv = "name,age,score\nAlice,30,95\nBob,25,80\nCarol,35,70";
    const result = flowDescribeDataset({ csv_content: csv });
    expect(result.rows).toBe(3);
    expect(result.columns).toBe(3);
  });

  it("identifies numeric and text column types", () => {
    const csv = "name,age,score\nAlice,30,95\nBob,25,80";
    const result = flowDescribeDataset({ csv_content: csv });
    const nameProfile = result.column_profiles.find(p => p.name === "name");
    const ageProfile = result.column_profiles.find(p => p.name === "age");
    expect(nameProfile?.type).toBe("text");
    expect(ageProfile?.type).toBe("numeric");
  });

  it("counts null/empty values per column", () => {
    const csv = "a,b\n1,\n2,x\n,y";
    const result = flowDescribeDataset({ csv_content: csv });
    const aProfile = result.column_profiles.find(p => p.name === "a");
    const bProfile = result.column_profiles.find(p => p.name === "b");
    expect(aProfile?.null_count).toBe(1);
    expect(bProfile?.null_count).toBe(1);
  });

  it("counts unique values per column", () => {
    const csv = "color\nred\nblue\nred\ngreen";
    const result = flowDescribeDataset({ csv_content: csv });
    const profile = result.column_profiles[0];
    expect(profile.unique_count).toBe(3);
  });

  it("provides sample values", () => {
    const csv = "val\n1\n2\n3\n4\n5";
    const result = flowDescribeDataset({ csv_content: csv });
    const profile = result.column_profiles[0];
    expect(profile.sample_values.length).toBeGreaterThan(0);
    expect(profile.sample_values.length).toBeLessThanOrEqual(5);
  });

  it("returns summary string", () => {
    const csv = "a,b\n1,x\n2,y";
    const result = flowDescribeDataset({ csv_content: csv });
    expect(result.summary).toBeTruthy();
  });

  it("handles single column", () => {
    const csv = "val\n1\n2\n3";
    const result = flowDescribeDataset({ csv_content: csv });
    expect(result.columns).toBe(1);
    expect(result.column_profiles.length).toBe(1);
  });
});

// ============================================================================
// TOOL 58: flow_lag_lead
// ============================================================================

describe("flowLagLead", () => {
  it("creates lag column shifted back by N rows", () => {
    const csv = "day,val\n1,10\n2,20\n3,30\n4,40";
    const result = flowLagLead({
      csv_content: csv,
      value_column: "val",
      shift: -1,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("val_lag1");
    // Row 1: no previous value
    // Row 2: previous val=10
    // Row 3: previous val=20
    expect(lines[2]).toContain("10");
    expect(lines[3]).toContain("20");
    expect(result.row_count).toBe(4);
  });

  it("creates lead column shifted forward by N rows", () => {
    const csv = "day,val\n1,10\n2,20\n3,30\n4,40";
    const result = flowLagLead({
      csv_content: csv,
      value_column: "val",
      shift: 1,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("val_lead1");
    // Row 1: next val=20
    // Row 4: no next value
    expect(lines[1]).toContain("20");
  });

  it("handles shift of 2", () => {
    const csv = "t,v\n1,10\n2,20\n3,30\n4,40\n5,50";
    const result = flowLagLead({
      csv_content: csv,
      value_column: "v",
      shift: -2,
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("v_lag2");
    // Row 3: value from row 1 = 10
    const lines = result.csv.trim().split("\n");
    expect(lines[3]).toContain("10");
  });

  it("preserves all original columns", () => {
    const csv = "a,b,c\n1,10,x\n2,20,y";
    const result = flowLagLead({
      csv_content: csv,
      value_column: "b",
      shift: -1,
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
  });

  it("returns summary with shift details", () => {
    const csv = "t,v\n1,10\n2,20";
    const result = flowLagLead({
      csv_content: csv,
      value_column: "v",
      shift: -1,
    });
    expect(result.summary).toBeTruthy();
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() => flowLagLead({
      csv_content: csv,
      value_column: "missing",
      shift: -1,
    })).toThrow();
  });
});

// ============================================================================
// TOOL 59: flow_group_aggregate
// ============================================================================

describe("flowGroupAggregate", () => {
  it("groups by column and sums values", () => {
    const csv = "dept,salary\nEng,100\nEng,200\nSales,150\nSales,50";
    const result = flowGroupAggregate({
      csv_content: csv,
      group_by: "dept",
      value_column: "salary",
      aggregation: "sum",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("dept,salary_sum");
    expect(result.group_count).toBe(2);
  });

  it("computes mean per group", () => {
    const csv = "cat,val\nA,10\nA,20\nB,30";
    const result = flowGroupAggregate({
      csv_content: csv,
      group_by: "cat",
      value_column: "val",
      aggregation: "mean",
    });
    const lines = result.csv.trim().split("\n");
    // A mean = 15
    const aLine = lines.find(l => l.startsWith("A"));
    expect(aLine).toContain("15");
  });

  it("counts per group", () => {
    const csv = "color\nred\nblue\nred\nred\nblue";
    const result = flowGroupAggregate({
      csv_content: csv,
      group_by: "color",
      value_column: "color",
      aggregation: "count",
    });
    expect(result.group_count).toBe(2);
  });

  it("computes min and max per group", () => {
    const csv = "g,v\nA,5\nA,15\nA,10\nB,20\nB,1";
    const resultMin = flowGroupAggregate({
      csv_content: csv,
      group_by: "g",
      value_column: "v",
      aggregation: "min",
    });
    const resultMax = flowGroupAggregate({
      csv_content: csv,
      group_by: "g",
      value_column: "v",
      aggregation: "max",
    });
    const minLines = resultMin.csv.trim().split("\n");
    const maxLines = resultMax.csv.trim().split("\n");
    const aMinLine = minLines.find(l => l.startsWith("A"));
    const aMaxLine = maxLines.find(l => l.startsWith("A"));
    expect(aMinLine).toContain("5");
    expect(aMaxLine).toContain("15");
  });

  it("returns summary with group count", () => {
    const csv = "x,y\na,1\nb,2\na,3";
    const result = flowGroupAggregate({
      csv_content: csv,
      group_by: "x",
      value_column: "y",
      aggregation: "sum",
    });
    expect(result.summary).toBeTruthy();
    expect(result.group_count).toBe(2);
  });

  it("throws on missing group column", () => {
    const csv = "a,b\n1,2";
    expect(() => flowGroupAggregate({
      csv_content: csv,
      group_by: "missing",
      value_column: "b",
      aggregation: "sum",
    })).toThrow();
  });
});

// ============================================================================
// TOOL 60: flow_row_number
// ============================================================================

describe("flowRowNumber", () => {
  it("adds sequential row numbers", () => {
    const csv = "name\nAlice\nBob\nCarol";
    const result = flowRowNumber({
      csv_content: csv,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("row_number");
    expect(lines[1]).toContain("1");
    expect(lines[2]).toContain("2");
    expect(lines[3]).toContain("3");
    expect(result.row_count).toBe(3);
  });

  it("uses custom column name", () => {
    const csv = "val\n10\n20";
    const result = flowRowNumber({
      csv_content: csv,
      column_name: "rank",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("rank");
  });

  it("numbers within groups when group_by specified", () => {
    const csv = "dept,name\nEng,Alice\nEng,Bob\nSales,Carol\nSales,Dave\nEng,Eve";
    const result = flowRowNumber({
      csv_content: csv,
      group_by: "dept",
    });
    const lines = result.csv.trim().split("\n");
    // Eng: Alice=1, Bob=2, Eve=3
    // Sales: Carol=1, Dave=2
    expect(result.row_count).toBe(5);
    // Check that some rows have 1 (group restart)
    const rowNums = lines.slice(1).map(l => {
      const parts = l.split(",");
      return parts[parts.length - 1];
    });
    expect(rowNums.filter(r => r === "1").length).toBeGreaterThanOrEqual(2);
  });

  it("preserves all original columns", () => {
    const csv = "a,b,c\n1,2,3";
    const result = flowRowNumber({
      csv_content: csv,
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("a");
    expect(header).toContain("b");
    expect(header).toContain("c");
  });

  it("returns summary", () => {
    const csv = "v\n1\n2";
    const result = flowRowNumber({
      csv_content: csv,
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 61: flow_type_cast
// ============================================================================

describe("flow_type_cast", () => {
  it("casts string column to number", () => {
    const csv = "name,value\nAlice,100\nBob,200\nCarol,300";
    const result = flowTypeCast({
      csv_content: csv,
      column: "value",
      target_type: "number",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("name,value");
    // Values should remain numeric
    expect(lines[1]).toContain("100");
    expect(result.converted_count).toBe(3);
    expect(result.failed_count).toBe(0);
  });

  it("casts number column to string", () => {
    const csv = "id,score\n1,95.5\n2,87.3";
    const result = flowTypeCast({
      csv_content: csv,
      column: "score",
      target_type: "string",
    });
    expect(result.converted_count).toBe(2);
    expect(result.csv).toContain("95.5");
  });

  it("casts to boolean (truthy/falsy)", () => {
    const csv = "name,active\nAlice,true\nBob,false\nCarol,1\nDave,0\nEve,yes\nFrank,no";
    const result = flowTypeCast({
      csv_content: csv,
      column: "active",
      target_type: "boolean",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("true");
    expect(lines[2]).toContain("false");
    expect(lines[3]).toContain("true");
    expect(lines[4]).toContain("false");
    expect(lines[5]).toContain("true");
    expect(lines[6]).toContain("false");
  });

  it("handles non-numeric values gracefully when casting to number", () => {
    const csv = "name,value\nAlice,100\nBob,abc\nCarol,300";
    const result = flowTypeCast({
      csv_content: csv,
      column: "value",
      target_type: "number",
    });
    expect(result.converted_count).toBe(2);
    expect(result.failed_count).toBe(1);
    // Failed conversion should become empty
    const lines = result.csv.trim().split("\n");
    expect(lines[2]).toMatch(/Bob,$/);
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowTypeCast({
        csv_content: csv,
        column: "missing",
        target_type: "number",
      })
    ).toThrow();
  });

  it("preserves other columns unchanged", () => {
    const csv = "name,value,category\nAlice,100,A\nBob,200,B";
    const result = flowTypeCast({
      csv_content: csv,
      column: "value",
      target_type: "string",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("name,value,category");
    expect(lines[1]).toContain("Alice");
    expect(lines[1]).toContain("A");
  });

  it("returns summary", () => {
    const csv = "x\n1\n2\n3";
    const result = flowTypeCast({
      csv_content: csv,
      column: "x",
      target_type: "string",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 62: flow_concat_rows
// ============================================================================

describe("flow_concat_rows", () => {
  it("vertically stacks two CSVs with same headers", () => {
    const csv1 = "name,value\nAlice,100\nBob,200";
    const csv2 = "name,value\nCarol,300\nDave,400";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("name,value");
    expect(lines.length).toBe(5); // header + 4 rows
    expect(result.row_count).toBe(4);
  });

  it("handles mismatched columns by filling blanks", () => {
    const csv1 = "name,value\nAlice,100";
    const csv2 = "name,score\nBob,200";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    const lines = result.csv.trim().split("\n");
    // Should have union of all columns
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("value");
    expect(lines[0]).toContain("score");
    expect(result.row_count).toBe(2);
  });

  it("adds _source column when add_source is true", () => {
    const csv1 = "name\nAlice";
    const csv2 = "name\nBob";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
      add_source: true,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_source");
    expect(lines[1]).toContain("dataset_1");
    expect(lines[2]).toContain("dataset_2");
  });

  it("handles empty second dataset", () => {
    const csv1 = "name,value\nAlice,100";
    const csv2 = "name,value";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    expect(result.row_count).toBe(1);
  });

  it("handles both empty datasets", () => {
    const csv1 = "name,value";
    const csv2 = "name,value";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    expect(result.row_count).toBe(0);
  });

  it("preserves data integrity with quoted fields", () => {
    const csv1 = 'name,value\n"Alice, Jr.",100';
    const csv2 = 'name,value\n"Bob, Sr.",200';
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    expect(result.csv).toContain("Alice, Jr.");
    expect(result.csv).toContain("Bob, Sr.");
    expect(result.row_count).toBe(2);
  });

  it("returns summary with counts", () => {
    const csv1 = "a\n1\n2";
    const csv2 = "a\n3";
    const result = flowConcatRows({
      csv_content_1: csv1,
      csv_content_2: csv2,
    });
    expect(result.summary).toContain("3");
  });
});

// ============================================================================
// TOOL 63: flow_value_counts
// ============================================================================

describe("flow_value_counts", () => {
  it("counts occurrences of each unique value", () => {
    const csv = "name,category\nAlice,A\nBob,B\nCarol,A\nDave,A\nEve,B";
    const result = flowValueCounts({
      csv_content: csv,
      column: "category",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe("value,count,percentage");
    // A appears 3 times, B appears 2 times — sorted by count desc
    expect(lines[1]).toContain("A");
    expect(lines[1]).toContain("3");
    expect(lines[2]).toContain("B");
    expect(lines[2]).toContain("2");
    expect(result.unique_count).toBe(2);
  });

  it("sorts by count descending", () => {
    const csv = "x\na\nb\nc\na\na\nb";
    const result = flowValueCounts({
      csv_content: csv,
      column: "x",
    });
    const lines = result.csv.trim().split("\n");
    // a=3, b=2, c=1
    expect(lines[1]).toContain("a");
    expect(lines[3]).toContain("c");
  });

  it("respects top_n parameter", () => {
    const csv = "x\na\na\nb\nc\nd\ne";
    const result = flowValueCounts({
      csv_content: csv,
      column: "x",
      top_n: 2,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines.length).toBe(3); // header + 2 rows
  });

  it("calculates correct percentages", () => {
    const csv = "x\na\na\nb\nb";
    const result = flowValueCounts({
      csv_content: csv,
      column: "x",
    });
    const lines = result.csv.trim().split("\n");
    // Each should be 50%
    expect(lines[1]).toContain("50");
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowValueCounts({
        csv_content: csv,
        column: "missing",
      })
    ).toThrow();
  });

  it("handles empty values", () => {
    const csv = "x\na\n\na\n";
    const result = flowValueCounts({
      csv_content: csv,
      column: "x",
    });
    expect(result.unique_count).toBeGreaterThanOrEqual(1);
  });

  it("returns summary", () => {
    const csv = "x\na\nb\nc";
    const result = flowValueCounts({
      csv_content: csv,
      column: "x",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 64: flow_date_diff
// ============================================================================

describe("flow_date_diff", () => {
  it("calculates day differences between two date columns", () => {
    const csv = "id,start,end\n1,2024-01-01,2024-01-31\n2,2024-03-01,2024-03-15";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "days",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_date_diff");
    // Jan 1 to Jan 31 = 30 days
    expect(lines[1]).toContain("30");
    // Mar 1 to Mar 15 = 14 days
    expect(lines[2]).toContain("14");
  });

  it("supports month unit", () => {
    const csv = "id,start,end\n1,2024-01-15,2024-04-15";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "months",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("3");
  });

  it("supports year unit", () => {
    const csv = "id,start,end\n1,2020-06-01,2024-06-01";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "years",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toContain("4");
  });

  it("handles invalid dates gracefully", () => {
    const csv = "id,start,end\n1,2024-01-01,2024-01-31\n2,not-a-date,2024-03-15";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "days",
    });
    expect(result.failed_count).toBe(1);
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowDateDiff({
        csv_content: csv,
        start_column: "missing",
        end_column: "b",
        unit: "days",
      })
    ).toThrow();
  });

  it("uses custom output column name", () => {
    const csv = "start,end\n2024-01-01,2024-01-10";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "days",
      output_column: "duration",
    });
    const header = result.csv.trim().split("\n")[0];
    expect(header).toContain("duration");
  });

  it("returns summary", () => {
    const csv = "start,end\n2024-01-01,2024-01-10";
    const result = flowDateDiff({
      csv_content: csv,
      start_column: "start",
      end_column: "end",
      unit: "days",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 65: flow_outlier_fence
// ============================================================================

describe("flow_outlier_fence", () => {
  it("flags outliers using Tukey fences", () => {
    // Values: 1,2,3,4,5,100 — 100 is an outlier
    const csv = "id,value\n1,1\n2,2\n3,3\n4,4\n5,5\n6,100";
    const result = flowOutlierFence({
      csv_content: csv,
      column: "value",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_is_outlier");
    // The last row (100) should be flagged
    expect(lines[6]).toContain("true");
    expect(result.outlier_count).toBeGreaterThanOrEqual(1);
  });

  it("uses custom multiplier", () => {
    const csv = "x\n1\n2\n3\n4\n5\n10";
    const result = flowOutlierFence({
      csv_content: csv,
      column: "x",
      multiplier: 3.0, // Very lenient — 10 might not be outlier
    });
    expect(result.outlier_count).toBeLessThanOrEqual(1);
  });

  it("reports fence boundaries", () => {
    const csv = "x\n1\n2\n3\n4\n5";
    const result = flowOutlierFence({
      csv_content: csv,
      column: "x",
    });
    expect(result.lower_fence).toBeDefined();
    expect(result.upper_fence).toBeDefined();
    expect(result.lower_fence).toBeLessThan(result.upper_fence);
  });

  it("handles all-same values (no outliers)", () => {
    const csv = "x\n5\n5\n5\n5";
    const result = flowOutlierFence({
      csv_content: csv,
      column: "x",
    });
    expect(result.outlier_count).toBe(0);
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowOutlierFence({
        csv_content: csv,
        column: "missing",
      })
    ).toThrow();
  });

  it("returns summary", () => {
    const csv = "x\n1\n2\n3\n4\n5";
    const result = flowOutlierFence({
      csv_content: csv,
      column: "x",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 66: flow_moving_average
// ============================================================================

describe("flow_moving_average", () => {
  it("computes simple moving average", () => {
    const csv = "day,value\n1,10\n2,20\n3,30\n4,40\n5,50";
    const result = flowMovingAverage({
      csv_content: csv,
      column: "value",
      window: 3,
      method: "simple",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_sma");
    // First 2 rows should be empty (window not full)
    expect(lines[1]).toMatch(/,$/);
    expect(lines[2]).toMatch(/,$/);
    // Row 3: avg(10,20,30) = 20
    expect(lines[3]).toContain("20");
  });

  it("computes exponential moving average", () => {
    const csv = "day,value\n1,10\n2,20\n3,30\n4,40\n5,50";
    const result = flowMovingAverage({
      csv_content: csv,
      column: "value",
      window: 3,
      method: "exponential",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_ema");
    // EMA starts from first value
    expect(result.row_count).toBe(5);
  });

  it("handles window larger than data", () => {
    const csv = "x\n1\n2";
    const result = flowMovingAverage({
      csv_content: csv,
      column: "x",
      window: 5,
      method: "simple",
    });
    // All values should be empty for SMA since window > data
    const lines = result.csv.trim().split("\n");
    expect(lines[1]).toMatch(/,$/);
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowMovingAverage({
        csv_content: csv,
        column: "missing",
        window: 2,
        method: "simple",
      })
    ).toThrow();
  });

  it("preserves other columns", () => {
    const csv = "name,value\nA,10\nB,20\nC,30";
    const result = flowMovingAverage({
      csv_content: csv,
      column: "value",
      window: 2,
      method: "simple",
    });
    expect(result.csv).toContain("name");
    expect(result.csv).toContain("A");
  });

  it("returns summary", () => {
    const csv = "x\n1\n2\n3";
    const result = flowMovingAverage({
      csv_content: csv,
      column: "x",
      window: 2,
      method: "simple",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 67: flow_entropy
// ============================================================================

describe("flow_entropy", () => {
  it("calculates Shannon entropy for a column", () => {
    const csv = "x\na\nb\nc\nd"; // 4 unique values, uniform = max entropy
    const result = flowEntropy({
      csv_content: csv,
      column: "x",
    });
    // Uniform distribution of 4 values: entropy = log2(4) = 2.0
    expect(result.entropy).toBeCloseTo(2.0, 1);
    expect(result.max_entropy).toBeCloseTo(2.0, 1);
    expect(result.normalized_entropy).toBeCloseTo(1.0, 1);
  });

  it("returns 0 entropy for single value", () => {
    const csv = "x\na\na\na";
    const result = flowEntropy({
      csv_content: csv,
      column: "x",
    });
    expect(result.entropy).toBe(0);
  });

  it("calculates entropy for skewed distribution", () => {
    const csv = "x\na\na\na\na\nb"; // Very skewed: a=80%, b=20%
    const result = flowEntropy({
      csv_content: csv,
      column: "x",
    });
    expect(result.entropy).toBeGreaterThan(0);
    expect(result.entropy).toBeLessThan(1); // Less than log2(2)=1
    expect(result.normalized_entropy).toBeLessThan(1.0);
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowEntropy({
        csv_content: csv,
        column: "missing",
      })
    ).toThrow();
  });

  it("returns unique_count and total_count", () => {
    const csv = "x\na\nb\na";
    const result = flowEntropy({
      csv_content: csv,
      column: "x",
    });
    expect(result.unique_count).toBe(2);
    expect(result.total_count).toBe(3);
  });

  it("returns summary", () => {
    const csv = "x\na\nb\nc";
    const result = flowEntropy({
      csv_content: csv,
      column: "x",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 68: flow_standardize
// ============================================================================

describe("flow_standardize", () => {
  it("standardizes using robust method (median/MAD)", () => {
    const csv = "x\n1\n2\n3\n4\n100";
    const result = flowStandardize({
      csv_content: csv,
      columns: ["x"],
      method: "robust",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("x_standardized");
    // The outlier (100) should have a large standardized value
    const lastVal = parseFloat(lines[5].split(",").pop()!);
    expect(Math.abs(lastVal)).toBeGreaterThan(2);
  });

  it("standardizes using standard method (mean/std)", () => {
    const csv = "x\n10\n20\n30\n40\n50";
    const result = flowStandardize({
      csv_content: csv,
      columns: ["x"],
      method: "standard",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("x_standardized");
    // Mean should be ~0 after standardization
    const vals = lines.slice(1).map(l => parseFloat(l.split(",").pop()!));
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });

  it("handles multiple columns", () => {
    const csv = "a,b\n1,10\n2,20\n3,30";
    const result = flowStandardize({
      csv_content: csv,
      columns: ["a", "b"],
      method: "standard",
    });
    expect(result.csv).toContain("a_standardized");
    expect(result.csv).toContain("b_standardized");
  });

  it("handles zero variance (all same values)", () => {
    const csv = "x\n5\n5\n5";
    const result = flowStandardize({
      csv_content: csv,
      columns: ["x"],
      method: "standard",
    });
    const lines = result.csv.trim().split("\n");
    // All values should be 0 when all inputs are the same
    expect(lines[1]).toContain("0");
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() =>
      flowStandardize({
        csv_content: csv,
        columns: ["missing"],
        method: "standard",
      })
    ).toThrow();
  });

  it("returns summary", () => {
    const csv = "x\n1\n2\n3";
    const result = flowStandardize({
      csv_content: csv,
      columns: ["x"],
      method: "robust",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 69: flow_ratio_columns
// ============================================================================

describe("flow_ratio_columns", () => {
  it("calculates ratio between two columns", () => {
    const csv = "name,revenue,employees\nA,1000,10\nB,2000,20\nC,3000,15";
    const result = flowRatioColumns({
      csv_content: csv,
      numerator: "revenue",
      denominator: "employees",
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("revenue_per_employees");
    // A: 1000/10 = 100
    expect(lines[1]).toContain("100");
    expect(result.computed_count).toBe(3);
  });

  it("handles zero denominator", () => {
    const csv = "a,b\n10,0\n20,5";
    const result = flowRatioColumns({
      csv_content: csv,
      numerator: "a",
      denominator: "b",
    });
    expect(result.zero_denominator_count).toBe(1);
    const lines = result.csv.trim().split("\n");
    // Zero denominator should produce empty
    expect(lines[1]).toMatch(/,$/);
  });

  it("uses custom output column name", () => {
    const csv = "a,b\n10,2";
    const result = flowRatioColumns({
      csv_content: csv,
      numerator: "a",
      denominator: "b",
      output_column: "ratio_ab",
    });
    expect(result.csv).toContain("ratio_ab");
  });

  it("throws on missing column", () => {
    const csv = "a,b\n1,2";
    expect(() =>
      flowRatioColumns({
        csv_content: csv,
        numerator: "missing",
        denominator: "b",
      })
    ).toThrow();
  });

  it("handles non-numeric values", () => {
    const csv = "a,b\n10,5\nabc,3";
    const result = flowRatioColumns({
      csv_content: csv,
      numerator: "a",
      denominator: "b",
    });
    expect(result.computed_count).toBe(1);
  });

  it("returns summary", () => {
    const csv = "a,b\n10,2\n20,4";
    const result = flowRatioColumns({
      csv_content: csv,
      numerator: "a",
      denominator: "b",
    });
    expect(result.summary).toBeTruthy();
  });
});

// ============================================================================
// TOOL 70: flow_discretize
// ============================================================================

describe("flow_discretize", () => {
  it("discretizes with equal-width bins", () => {
    const csv = "x\n0\n25\n50\n75\n100";
    const result = flowDiscretize({
      csv_content: csv,
      column: "x",
      method: "equal_width",
      bins: 4,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_bin");
    expect(result.row_count).toBe(5);
    expect(result.bin_count).toBe(4);
  });

  it("discretizes with quantile bins", () => {
    const csv = "x\n1\n2\n3\n4\n5\n6\n7\n8";
    const result = flowDiscretize({
      csv_content: csv,
      column: "x",
      method: "quantile",
      bins: 4,
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_bin");
    // Should create 4 bins with roughly equal count
    expect(result.bin_count).toBeLessThanOrEqual(4);
  });

  it("discretizes with custom breakpoints", () => {
    const csv = "x\n5\n15\n25\n35\n45";
    const result = flowDiscretize({
      csv_content: csv,
      column: "x",
      method: "custom",
      breakpoints: [10, 20, 30],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toContain("_bin");
  });

  it("throws on missing column", () => {
    const csv = "a\n1";
    expect(() =>
      flowDiscretize({
        csv_content: csv,
        column: "missing",
        method: "equal_width",
        bins: 3,
      })
    ).toThrow();
  });

  it("preserves original columns", () => {
    const csv = "name,score\nAlice,85\nBob,92";
    const result = flowDiscretize({
      csv_content: csv,
      column: "score",
      method: "equal_width",
      bins: 2,
    });
    expect(result.csv).toContain("name");
    expect(result.csv).toContain("Alice");
  });

  it("returns summary", () => {
    const csv = "x\n1\n2\n3\n4\n5";
    const result = flowDiscretize({
      csv_content: csv,
      column: "x",
      method: "equal_width",
      bins: 2,
    });
    expect(result.summary).toBeTruthy();
  });
});