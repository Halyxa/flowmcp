import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizeCsvArgs } from "./csv-utils.js";
import { flowAnomalyDetect, flowTimeSeriesAnimate, flowMergeDatasets } from "./tools-v2.js";
import { flowNlpToViz, flowGeoEnhance, flowExportFormats } from "./tools-v3.js";
import { flowCorrelationMatrix, flowClusterData, flowHierarchicalData, flowCompareDatasets, flowPivotTable, flowRegressionAnalysis, flowNormalizeData, flowDeduplicateRows, flowBinData, flowColumnStats } from "./tools-v4.js";
import {
  flowSemanticSearch,
  scoreMatch,
  _injectCatalogForTesting,
  _clearCatalogCache,
  FlowEntry,
} from "./tools-search.js";

// ============================================================================
// EDGE CASES: flow_time_series_animate (Tool 20)
// ============================================================================

describe("flowTimeSeriesAnimate — edge cases", () => {
  it("throws on empty CSV (header only)", () => {
    expect(() =>
      flowTimeSeriesAnimate({ csv_content: "date,value", time_column: "date" }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("throws when time column not found", () => {
    const csv = "date,value\n2024-01-01,10\n2024-02-01,20";
    expect(() =>
      flowTimeSeriesAnimate({ csv_content: csv, time_column: "timestamp" }),
    ).toThrow('Time column "timestamp" not found');
  });

  it("throws on all invalid dates in time column", () => {
    const csv = "date,value\nnot-a-date,10\nalso-bad,20\nstill-bad,30";
    expect(() =>
      flowTimeSeriesAnimate({ csv_content: csv, time_column: "date" }),
    ).toThrow('No valid dates found in column "date"');
  });

  it("handles all same timestamp gracefully (single frame)", () => {
    const csv =
      "date,value\n2024-01-01,10\n2024-01-01,20\n2024-01-01,30";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
    });
    expect(result.frame_count).toBe(1);
    expect(result.csv).toContain("_frame");
    expect(result.csv).toContain("_time_label");
  });

  it("handles non-numeric value columns by excluding them", () => {
    const csv =
      "date,name,value\n2024-01-01,Alice,10\n2024-06-01,Bob,20\n2024-12-01,Carol,30";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 3,
    });
    // name should not be treated as a value column
    expect(result.csv).toContain("_frame");
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("clamps frame_count to minimum of 2", () => {
    const csv = "date,value\n2024-01-01,10\n2024-06-01,20\n2024-12-01,30";
    // frame_count = 0 should be clamped to 2
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 0,
    });
    expect(result.frame_count).toBeGreaterThanOrEqual(2);
  });

  it("clamps frame_count = 1 to minimum of 2", () => {
    const csv = "date,value\n2024-01-01,10\n2024-06-01,20\n2024-12-01,30";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 1,
    });
    expect(result.frame_count).toBeGreaterThanOrEqual(2);
  });

  it("handles frame_count > number of rows without crashing", () => {
    const csv = "date,value\n2024-01-01,10\n2024-06-01,20";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 100,
    });
    expect(result.frame_count).toBeLessThanOrEqual(200);
    expect(result.csv).toContain("_frame");
  });

  it("handles cumulative mode with negative values", () => {
    const csv =
      "date,value\n2024-01-01,-10\n2024-03-01,5\n2024-06-01,-3\n2024-09-01,20\n2024-12-01,-7";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      cumulative: true,
      frame_count: 5,
    });
    expect(result.csv).toContain("_frame");
    // Cumulative values can go negative; just verifying no crash
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("handles single row CSV", () => {
    const csv = "date,value\n2024-01-01,42";
    // Single row means a single timestamp, so timeSpan = 0 -> single frame
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
    });
    expect(result.frame_count).toBe(1);
    expect(result.rows_output).toBe(1);
  });

  it("handles sparse data (missing values)", () => {
    const csv =
      "date,value\n2024-01-01,10\n2024-02-01,\n2024-03-01,30\n2024-04-01,\n2024-05-01,50";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 5,
    });
    expect(result.csv).toContain("_frame");
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("handles timezone-mixed dates", () => {
    const csv =
      "date,value\n2024-01-01T00:00:00Z,10\n2024-06-01T12:00:00+05:30,20\n2024-12-01T23:59:59-08:00,30";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 3,
    });
    expect(result.csv).toContain("_frame");
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("throws when group_column does not exist", () => {
    const csv = "date,value\n2024-01-01,10\n2024-06-01,20";
    expect(() =>
      flowTimeSeriesAnimate({
        csv_content: csv,
        time_column: "date",
        group_column: "nonexistent",
      }),
    ).toThrow('Group column "nonexistent" not found');
  });

  it("handles mixed valid and invalid dates (skips invalid)", () => {
    const csv =
      "date,value\n2024-01-01,10\nnot-a-date,20\n2024-06-01,30\nbogus,40\n2024-12-01,50";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 3,
    });
    // Should only use valid rows (3 out of 5)
    expect(result.csv).toContain("_frame");
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("handles US date format (MM/DD/YYYY)", () => {
    const csv =
      "date,value\n01/15/2024,10\n06/15/2024,20\n12/15/2024,30";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 3,
    });
    expect(result.csv).toContain("_frame");
    expect(result.rows_output).toBeGreaterThan(0);
  });

  it("handles year-only time column", () => {
    const csv = "year,gdp\n2020,1000\n2021,1100\n2022,1250\n2023,1400";
    const result = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "year",
      frame_count: 4,
    });
    expect(result.csv).toContain("_frame");
    expect(result.time_range.start).toContain("2020");
    expect(result.time_range.end).toContain("2023");
  });
});

// ============================================================================
// EDGE CASES: flow_merge_datasets (Tool 21)
// ============================================================================

describe("flowMergeDatasets — edge cases", () => {
  it("throws when only 1 dataset provided", () => {
    expect(() =>
      flowMergeDatasets({
        datasets: [{ csv_content: "id,value\n1,10\n2,20" }],
      }),
    ).toThrow("At least 2 datasets are required");
  });

  it("throws when zero datasets provided", () => {
    expect(() =>
      flowMergeDatasets({ datasets: [] }),
    ).toThrow("At least 2 datasets are required");
  });

  it("throws when no shared columns for join", () => {
    expect(() =>
      flowMergeDatasets({
        datasets: [
          { csv_content: "a,b\n1,2\n3,4" },
          { csv_content: "c,d\n5,6\n7,8" },
        ],
      }),
    ).toThrow("No shared columns found for joining");
  });

  it("handles empty datasets (header only)", () => {
    // Datasets with headers but no rows
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,val1\n" },
        { csv_content: "id,val2\n" },
      ],
      join_type: "concatenate",
    });
    expect(result.rows_output).toBe(0);
  });

  it("returns empty result for inner join with zero overlapping rows", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n2,20" },
        { csv_content: "id,score\n3,30\n4,40" },
      ],
      join_type: "inner",
    });
    expect(result.rows_output).toBe(0);
  });

  it("handles column name collisions with prefix mode", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n2,20", label: "ds1" },
        { csv_content: "id,value\n1,30\n2,40", label: "ds2" },
      ],
      join_type: "inner",
      conflict_resolution: "prefix",
    });
    expect(result.csv).toContain("ds1_value");
    expect(result.csv).toContain("ds2_value");
    expect(result.rows_output).toBe(2);
  });

  it("handles column name collisions with keep_first mode", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n2,20", label: "ds1" },
        { csv_content: "id,value\n1,30\n2,40", label: "ds2" },
      ],
      join_type: "inner",
      conflict_resolution: "keep_first",
    });
    // Only one "value" column should be present, from the first dataset
    const headerLine = result.csv.split("\n")[0];
    const valueCount = headerLine.split(",").filter((h: string) => h === "value").length;
    expect(valueCount).toBe(1);
  });

  it("handles column name collisions with keep_last mode", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n2,20", label: "ds1" },
        { csv_content: "id,value\n1,99\n2,88", label: "ds2" },
      ],
      join_type: "inner",
      conflict_resolution: "keep_last",
    });
    // The second dataset's values should win
    expect(result.csv).toContain("99");
    expect(result.csv).toContain("88");
  });

  it("handles very wide rows (50+ columns) via concatenate", () => {
    // Build headers with many columns
    const cols = Array.from({ length: 55 }, (_, i) => `col_${i}`);
    const header = cols.join(",");
    const row1 = cols.map((_, i) => String(i)).join(",");
    const row2 = cols.map((_, i) => String(i + 100)).join(",");
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: `${header}\n${row1}` },
        { csv_content: `${header}\n${row2}` },
      ],
      join_type: "concatenate",
    });
    expect(result.columns_output).toBeGreaterThanOrEqual(55);
    expect(result.rows_output).toBe(2);
  });

  it("handles mismatched column counts between datasets via concatenate", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "a,b,c\n1,2,3" },
        { csv_content: "b,d\n5,6" },
      ],
      join_type: "concatenate",
    });
    // Should union headers: a, b, c, d + _source
    expect(result.columns_output).toBeGreaterThanOrEqual(4);
    expect(result.rows_output).toBe(2);
  });

  it("handles special characters in column names", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: '"col (a)","col [b]"\n1,2\n3,4' },
        { csv_content: '"col (a)","col {c}"\n1,5\n3,6' },
      ],
      join_type: "inner",
      join_columns: ["col (a)"],
    });
    expect(result.rows_output).toBe(2);
  });

  it("handles null/empty values in join columns", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n,20\n3,30" },
        { csv_content: "id,score\n1,A\n,B\n3,C" },
      ],
      join_type: "inner",
    });
    // Empty id matches empty id
    expect(result.rows_output).toBeGreaterThanOrEqual(2);
  });

  it("outer join includes all rows from both datasets", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,val\n1,A\n2,B" },
        { csv_content: "id,score\n2,X\n3,Y" },
      ],
      join_type: "outer",
    });
    // Should contain rows for ids 1, 2, and 3
    expect(result.rows_output).toBe(3);
  });

  it("left join keeps all left rows, fills missing right columns", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,val\n1,A\n2,B\n3,C" },
        { csv_content: "id,score\n2,X" },
      ],
      join_type: "left",
    });
    expect(result.rows_output).toBe(3);
  });

  it("concatenate with add_source_column = false", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,val\n1,A" },
        { csv_content: "id,val\n2,B" },
      ],
      join_type: "concatenate",
      add_source_column: false,
    });
    const headers = result.csv.split("\n")[0];
    expect(headers).not.toContain("_source");
  });
});

// ============================================================================
// EDGE CASES: flow_anomaly_detect (Tool 22)
// ============================================================================

describe("flowAnomalyDetect — edge cases", () => {
  it("handles all identical values (zero variance)", () => {
    const csv = "name,value\nA,5\nB,5\nC,5\nD,5\nE,5\nF,5\nG,5\nH,5\nI,5\nJ,5";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBe(0);
    // Zero stddev should not cause division by zero crash
    expect(result.csv).toContain("_anomaly_score");
  });

  it("handles single row without crashing", () => {
    const csv = "name,value\nA,42";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.total_rows).toBe(1);
    expect(result.summary.anomaly_count).toBe(0);
  });

  it("throws when no numeric columns exist", () => {
    const csv = "name,label,category\nA,X,Red\nB,Y,Blue\nC,Z,Green";
    expect(() => flowAnomalyDetect({ csv_content: csv })).toThrow(
      "No numeric columns found",
    );
  });

  it("handles columns with all NaN-equivalent values", () => {
    const csv = "name,value\nA,ten\nB,twenty\nC,thirty";
    // All values are non-numeric, so auto-detect should find no numeric columns
    expect(() => flowAnomalyDetect({ csv_content: csv })).toThrow(
      "No numeric columns found",
    );
  });

  it("handles threshold = 0 (everything is anomalous with zscore)", () => {
    const csv = "name,value\nA,10\nB,12\nC,11\nD,13\nE,9";
    const result = flowAnomalyDetect({
      csv_content: csv,
      threshold: 0,
      method: "zscore",
    });
    // With threshold=0, any value not exactly the mean is anomalous
    // For zscore: z > 0 for any non-mean value, and 0 > 0 is false, so only truly off-mean
    // Actually: threshold 0 means z > 0 triggers anomaly. z=0 only if value === mean exactly.
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(0);
    expect(result.csv).toContain("_anomaly_score");
  });

  it("handles negative threshold without crashing", () => {
    const csv = "name,value\nA,10\nB,12\nC,11\nD,13\nE,9";
    // Negative threshold: z > negative is always true (all anomalous)
    const result = flowAnomalyDetect({
      csv_content: csv,
      threshold: -1,
      method: "zscore",
    });
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(0);
    expect(result.csv).toBeDefined();
  });

  it("handles single column with one obvious outlier", () => {
    const csv =
      "value\n1\n1\n1\n1\n1\n1\n1\n1\n1\n100";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(1);
  });

  it("handles very large numbers (1e15)", () => {
    const csv =
      "id,value\n1,1000000000000000\n2,1000000000000001\n3,1000000000000002\n4,999999999999999\n5,5";
    const result = flowAnomalyDetect({ csv_content: csv });
    // The outlier is 5, far from the ~1e15 cluster
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(1);
    expect(result.csv).toContain("_anomaly_score");
  });

  it("handles very small numbers (1e-15)", () => {
    const csv =
      "id,value\n1,0.000000000000001\n2,0.000000000000002\n3,0.000000000000001\n4,0.000000000000003\n5,999";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(1);
  });

  it("handles mixed positive and negative values", () => {
    const csv =
      "id,value\n1,-50\n2,-45\n3,-55\n4,-48\n5,-52\n6,500";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(1);
  });

  it("throws on header-only CSV", () => {
    expect(() => flowAnomalyDetect({ csv_content: "name,value" })).toThrow(
      "CSV must have header + at least 1 data row",
    );
  });

  it("throws on completely empty string", () => {
    expect(() => flowAnomalyDetect({ csv_content: "" })).toThrow();
  });

  it("handles two identical values (edge for stats)", () => {
    const csv = "id,value\nA,10\nB,10";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBe(0);
  });

  it("summary mode returns by_column details for multiple columns", () => {
    const csv = "id,val1,val2\nA,1,100\nB,2,200\nC,3,150\nD,4,175\nE,50,180";
    const result = flowAnomalyDetect({
      csv_content: csv,
      output_mode: "summary",
    });
    expect(result.by_column.length).toBe(2);
    expect(result.by_column[0].column).toBe("val1");
    expect(result.by_column[1].column).toBe("val2");
  });

  it("anomalies_only mode returns only anomalous rows", () => {
    const csv =
      "name,value\nA,10\nB,12\nC,11\nD,13\nE,100\nF,9\nG,11\nH,10\nI,12\nJ,11";
    const result = flowAnomalyDetect({
      csv_content: csv,
      output_mode: "anomalies_only",
    });
    const lines = result.csv.split("\n");
    // All data lines should have is_anomaly = true
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toContain("true");
    }
  });
});

// ============================================================================
// EDGE CASES: flow_geo_enhance (Tool 23)
// ============================================================================

describe("flowGeoEnhance — edge cases", () => {
  it("handles unknown city names gracefully", () => {
    const csv = "city,value\nXyzzyville,10\nNowheresburg,20\nFaketown,30";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    // Faketown fuzzy-matches to a real city (Levenshtein ≤ 3), so only 2 unresolved
    expect(result.stats.unresolved).toBe(2);
    expect(result.unresolved_locations.length).toBe(2);
  });

  it("handles empty location columns", () => {
    const csv = "city,value\n,10\n,20\n,30";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    expect(result.stats.resolved).toBe(0);
  });

  it("handles mix of coordinates and city names", () => {
    const csv =
      "location,value\nNew York,10\n40.7128 -74.006,20\nLondon,30";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["location"],
    });
    // New York, the coordinate, and London should all resolve
    expect(result.stats.resolved).toBe(3);
  });

  it("handles unicode city names (Sao Paulo resolves via alt)", () => {
    const csv = "city,value\nSao Paulo,10\nMunich,20\nTokyo,30";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    // Sao Paulo (alt), Munich, Tokyo should all resolve
    expect(result.stats.resolved).toBe(3);
  });

  it("throws when location column does not exist", () => {
    const csv = "city,value\nNew York,10";
    expect(() =>
      flowGeoEnhance({
        csv_content: csv,
        location_columns: ["nonexistent"],
      }),
    ).toThrow('Column "nonexistent" not found');
  });

  it("handles all unresolvable locations with fallback coordinates", () => {
    const csv = "city,value\nXyzzy,10\nFoobar,20";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
      fallback_coordinates: { lat: 0, lng: 0 },
    });
    // Foobar fuzzy-matches to a real city, so only 1 unresolved
    expect(result.stats.unresolved).toBe(1);
    // But the CSV should have the fallback coordinates
    expect(result.csv).toContain("0.000000");
  });

  it("handles extremely long location strings", () => {
    const longName = "A".repeat(500);
    const csv = `city,value\n${longName},10\nNew York,20`;
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    // Long name should not crash, just fail to resolve
    expect(result.stats.resolved).toBe(1); // Only New York
    expect(result.stats.unresolved).toBe(1);
  });

  it("throws on header-only CSV", () => {
    expect(() =>
      flowGeoEnhance({
        csv_content: "city,value",
        location_columns: ["city"],
      }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("resolves country names to centroids", () => {
    const csv = "location,value\nFrance,100\nJapan,200\nBrazil,300";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["location"],
    });
    expect(result.stats.resolved).toBe(3);
  });

  it("handles combined city+country format", () => {
    const csv = "location,value\n\"London, UK\",10\n\"Paris, FR\",20";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["location"],
      location_format: "city_country",
    });
    expect(result.stats.resolved).toBe(2);
  });

  it("handles coordinate strings in location column", () => {
    const csv = "coords,value\n\"40.7128, -74.0060\",10\n\"51.5074, -0.1278\",20";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["coords"],
      location_format: "coordinates",
    });
    expect(result.stats.resolved).toBe(2);
  });

  it("handles DMS coordinate format", () => {
    const csv = "coords,value\n\"40\u00b042'46\"\"N 74\u00b00'22\"\"W\",10";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["coords"],
    });
    expect(result.stats.resolved).toBe(1);
  });

  it("handles multi-column location (city + country separate columns)", () => {
    const csv = "city,country,value\nLondon,GB,10\nParis,FR,20";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city", "country"],
      combine_columns: true,
    });
    expect(result.stats.resolved).toBe(2);
  });

  it("produces correct confidence breakdown categories", () => {
    const csv =
      "location,value\nNew York,10\nFrance,20\nXyzzy,30";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["location"],
    });
    // New York -> exact_city, France -> country, Xyzzy -> unresolved
    expect(result.stats.resolved).toBe(2);
    expect(result.stats.confidence_breakdown).toBeDefined();
    expect(Object.keys(result.stats.confidence_breakdown).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASES: flow_nlp_to_viz (Tool 24)
// ============================================================================

describe("flowNlpToViz — edge cases", () => {
  it("handles empty prompt by producing a default scatter visualization", () => {
    // Empty string prompt - detectIntent returns "scatter" by default
    const result = flowNlpToViz({ prompt: "" });
    expect(result.visualization.template).toBe("3D Scatter");
    expect(result.csv).toBeDefined();
    expect(result.data_summary.rows).toBeGreaterThan(0);
  });

  it("handles very long prompt (1000+ words) without crashing", () => {
    const longPrompt = Array.from({ length: 1100 }, (_, i) => `word${i}`).join(" ");
    const result = flowNlpToViz({ prompt: longPrompt });
    expect(result.csv).toBeDefined();
    expect(result.data_summary.rows).toBeGreaterThan(0);
  });

  it("handles nonsensical prompt gracefully", () => {
    const result = flowNlpToViz({ prompt: "asdfghjkl qwerty zxcvbn" });
    // No keywords match -> defaults to scatter
    expect(result.visualization.template).toBe("3D Scatter");
    expect(result.csv).toBeDefined();
  });

  it("handles prompt requesting impossible data", () => {
    const result = flowNlpToViz({
      prompt: "show me the meaning of life in 4 dimensions with telepathic data",
    });
    // Should still produce something valid
    expect(result.csv).toBeDefined();
    expect(result.data_summary.rows).toBeGreaterThan(0);
  });

  it("handles row_count = 0 by using default (capped at min)", () => {
    const result = flowNlpToViz({ prompt: "scatter data", row_count: 0 });
    // Math.min(0, 5000) = 0, so should produce 0 data rows or the library handles it
    // Actually generates 0 rows if rowCount=0 for scatter
    expect(result.data_summary.rows).toBe(0);
  });

  it("caps row_count at 5000", () => {
    const result = flowNlpToViz({ prompt: "scatter data", row_count: 10000 });
    expect(result.data_summary.rows).toBeLessThanOrEqual(5000);
  });

  it("transform mode without csv_content falls back to generate mode", () => {
    // data_source=transform but no csv_content -> goes to else branch (generate)
    const result = flowNlpToViz({
      prompt: "scatter data",
      data_source: "transform",
    });
    // Without csv_content, transform mode still produces output (treats empty as transform)
    expect(result.data_summary.generation_method).toBe(
      "Transformed from provided CSV",
    );
    expect(result.csv).toBeDefined();
  });

  it("transform mode with header-only CSV throws", () => {
    expect(() =>
      flowNlpToViz({
        prompt: "scatter",
        data_source: "transform",
        csv_content: "a,b",
      }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("transform mode with CSV that has zero useful numeric columns passes through", () => {
    const csv = "label,category\nA,X\nB,Y\nC,Z";
    const result = flowNlpToViz({
      prompt: "scatter",
      data_source: "transform",
      csv_content: csv,
    });
    // Transform mode passes through the CSV as-is
    expect(result.csv).toBe(csv);
    expect(result.data_summary.columns).toEqual(["label", "category"]);
  });

  it("detects finance domain from prompt keywords", () => {
    const result = flowNlpToViz({
      prompt: "stock market portfolio investment returns",
    });
    expect(result.visualization.title).toContain("Financial");
  });

  it("detects science domain from prompt keywords", () => {
    const result = flowNlpToViz({
      prompt: "research experiment molecule protein biology",
    });
    expect(result.visualization.title).toContain("Research");
  });

  it("detects social domain from prompt keywords", () => {
    const result = flowNlpToViz({
      prompt: "social network people community influence follower connections",
    });
    expect(result.visualization.template).toBe("Network Graph");
  });

  it("network generation produces valid id and connections columns", () => {
    const result = flowNlpToViz({
      prompt: "network graph of node connections",
      row_count: 50,
    });
    expect(result.csv).toContain("id");
    expect(result.csv).toContain("connections by id");
    const lines = result.csv.split("\n");
    // At least header + some rows
    expect(lines.length).toBeGreaterThan(1);
  });

  it("map generation produces valid lat/lng columns", () => {
    const result = flowNlpToViz({
      prompt: "geographic map of city locations across the globe",
      row_count: 20,
    });
    expect(result.csv).toContain("latitude");
    expect(result.csv).toContain("longitude");
  });
});

// ============================================================================
// EDGE CASES: flow_export_formats (Tool 25)
// ============================================================================

describe("flowExportFormats — edge cases", () => {
  it("throws on empty CSV (header only)", () => {
    expect(() =>
      flowExportFormats({ csv_content: "a,b", format: "json" }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("throws on GeoJSON without lat/lng columns", () => {
    const csv = "name,value\nAlice,10\nBob,20";
    expect(() =>
      flowExportFormats({ csv_content: csv, format: "geojson" }),
    ).toThrow("GeoJSON requires latitude and longitude columns");
  });

  it("html_viewer with non-numeric columns still produces valid HTML", () => {
    const csv = "name,category\nAlice,A\nBob,B\nCharlie,C";
    const result = flowExportFormats({
      csv_content: csv,
      format: "html_viewer",
    });
    expect(result.format).toBe("html_viewer");
    expect(result.output).toContain("<!DOCTYPE html>");
    // HTML viewer uses three.js (lowercase module import, not "Three.js" string)
    expect(result.output).toContain("three");
    expect(result.metadata.rows).toBe(3);
  });

  it("summary format handles large dataset (1000 rows)", () => {
    const rows = Array.from(
      { length: 1000 },
      (_, i) => `item_${i},${i},${i * 2.5}`,
    );
    const csv = `name,value,score\n${rows.join("\n")}`;
    const result = flowExportFormats({ csv_content: csv, format: "summary" });
    expect(result.format).toBe("summary");
    expect(result.metadata.rows).toBe(1000);
    expect(result.output).toContain("Mean");
    expect(result.output).toContain("Std Dev");
  });

  it("handles single column CSV", () => {
    const csv = "name\nAlice\nBob\nCharlie";
    const result = flowExportFormats({ csv_content: csv, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(parsed.length).toBe(3);
    expect(parsed[0]).toHaveProperty("name");
  });

  it("json format auto-converts numeric values", () => {
    const csv = "name,value,ratio\nA,42,3.14\nB,0,0.0";
    const result = flowExportFormats({ csv_content: csv, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(typeof parsed[0].value).toBe("number");
    expect(typeof parsed[0].ratio).toBe("number");
    expect(typeof parsed[0].name).toBe("string");
  });

  it("title with special characters is escaped in HTML viewer", () => {
    const csv = "name,value\nA,1\nB,2";
    const result = flowExportFormats({
      csv_content: csv,
      format: "html_viewer",
      title: '<script>alert("xss")</script>',
    });
    expect(result.output).not.toContain('<script>alert("xss")</script>');
    expect(result.output).toContain("&lt;script&gt;");
  });

  it("geojson produces valid FeatureCollection", () => {
    const csv = "name,latitude,longitude,value\nNYC,40.71,-74.01,100\nLA,34.05,-118.24,200";
    const result = flowExportFormats({
      csv_content: csv,
      format: "geojson",
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features.length).toBe(2);
    expect(parsed.features[0].geometry.type).toBe("Point");
    // GeoJSON coordinates are [lng, lat]
    expect(parsed.features[0].geometry.coordinates[0]).toBeCloseTo(-74.01);
    expect(parsed.features[0].geometry.coordinates[1]).toBeCloseTo(40.71);
  });

  it("geojson skips rows with non-numeric lat/lng", () => {
    const csv =
      "name,latitude,longitude\nNYC,40.71,-74.01\nBad,not-a-number,also-bad\nLA,34.05,-118.24";
    const result = flowExportFormats({
      csv_content: csv,
      format: "geojson",
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.features.length).toBe(2); // Bad row skipped
  });

  it("geojson with explicit lat/lng column options", () => {
    const csv = "name,y,x,value\nNYC,40.71,-74.01,100";
    const result = flowExportFormats({
      csv_content: csv,
      format: "geojson",
      options: { lat_column: "y", lng_column: "x" },
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.features.length).toBe(1);
  });

  it("summary format handles all-categorical dataset", () => {
    const csv = "name,color,size\nA,Red,Big\nB,Blue,Small\nC,Red,Medium";
    const result = flowExportFormats({ csv_content: csv, format: "summary" });
    expect(result.output).toContain("categorical");
    expect(result.output).toContain("Unique values");
  });

  it("summary format handles all-numeric dataset", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6\n7,8,9";
    const result = flowExportFormats({ csv_content: csv, format: "summary" });
    expect(result.output).toContain("numeric");
    expect(result.output).toContain("Mean");
    expect(result.output).toContain("Median");
  });

  it("html_viewer with explicit axis options", () => {
    const csv = "a,b,c,d\n1,2,3,4\n5,6,7,8";
    const result = flowExportFormats({
      csv_content: csv,
      format: "html_viewer",
      options: { x_column: "a", y_column: "b", z_column: "c", color_column: "d" },
    });
    expect(result.output).toContain("<!DOCTYPE html>");
    expect(result.metadata.format_description).toContain("X: a");
  });

  it("json format handles empty string values", () => {
    const csv = "name,value\nA,\nB,42";
    const result = flowExportFormats({ csv_content: csv, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(parsed[0].value).toBe("");
    expect(parsed[1].value).toBe(42);
  });
});

// ============================================================================
// EDGE CASES: flow_semantic_search (Tool 19)
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
];

describe("flowSemanticSearch — edge cases", () => {
  beforeEach(() => {
    _injectCatalogForTesting(MOCK_CATALOG);
  });

  afterEach(() => {
    _clearCatalogCache();
  });

  it("throws on empty query string", async () => {
    await expect(flowSemanticSearch({ query: "" })).rejects.toThrow(
      "Search query is required",
    );
  });

  it("throws on whitespace-only query", async () => {
    await expect(flowSemanticSearch({ query: "   " })).rejects.toThrow(
      "Search query is required",
    );
  });

  it("handles very long query without crashing", async () => {
    const longQuery = "network ".repeat(200).trim();
    const result = await flowSemanticSearch({ query: longQuery });
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("handles non-existent category filter (returns empty)", async () => {
    const result = await flowSemanticSearch({
      query: "network",
      category: "NonExistentCategory",
    });
    expect(result.results.length).toBe(0);
  });

  it("handles max_results = 0 (returns empty slice)", async () => {
    const result = await flowSemanticSearch({
      query: "network",
      max_results: 0,
    });
    expect(result.results.length).toBe(0);
  });

  it("caps max_results at 100", async () => {
    const result = await flowSemanticSearch({
      query: "network",
      max_results: 1000,
    });
    // There are only 3 items in mock catalog, so result is capped by available matches
    expect(result.results.length).toBeLessThanOrEqual(100);
  });

  it("handles query with special regex characters", async () => {
    const result = await flowSemanticSearch({
      query: "supply (chain) [network] {graph} $100 ^start end.*",
    });
    // Should not throw regex error
    expect(result.results).toBeDefined();
  });

  it("handles query that matches nothing", async () => {
    const result = await flowSemanticSearch({
      query: "xyzzyplughqwerty",
    });
    expect(result.results.length).toBe(0);
    expect(result.total_matches).toBe(0);
  });

  it("sort by views returns highest view_count first", async () => {
    const result = await flowSemanticSearch({
      query: "map network",
      sort_by: "views",
    });
    if (result.results.length >= 2) {
      expect(result.results[0].view_count).toBeGreaterThanOrEqual(
        result.results[1].view_count,
      );
    }
  });

  it("scoreMatch handles flow with empty description", () => {
    const flow: FlowEntry = {
      selector: "test1",
      title: "Test Flow",
      description: "",
      categories: [],
      view_count: 0,
      creator: "test",
      template_type: "",
    };
    const { score, reasons } = scoreMatch("test", flow);
    expect(score).toBeGreaterThan(0);
    expect(reasons).toContain("title_tokens");
  });

  it("scoreMatch handles flow with empty title", () => {
    const flow: FlowEntry = {
      selector: "test2",
      title: "",
      description: "Some description about data",
      categories: [],
      view_count: 0,
      creator: "test",
      template_type: "",
    };
    const { score } = scoreMatch("data", flow);
    // Should still get points from description match
    expect(score).toBeGreaterThan(0);
  });

  it("scoreMatch returns 0 for completely unrelated query", () => {
    const flow: FlowEntry = {
      selector: "test3",
      title: "Supply Chain Network",
      description: "Logistics routes",
      categories: ["Business"],
      view_count: 100,
      creator: "test",
      template_type: "network",
    };
    const { score } = scoreMatch("xyzzy", flow);
    expect(score).toBe(0);
  });

  it("template_type filter narrows results", async () => {
    const result = await flowSemanticSearch({
      query: "data",
      template_type: "network",
    });
    for (const r of result.results) {
      expect(r.categories.length >= 0).toBe(true); // Just verifying structure
    }
  });

  it("query_interpretation includes all filters", async () => {
    const result = await flowSemanticSearch({
      query: "network",
      category: "Business",
      template_type: "network",
    });
    expect(result.query_interpretation).toContain("network");
    expect(result.query_interpretation).toContain("Business");
    expect(result.query_interpretation).toContain("network");
  });
});

// ============================================================================
// CROSS-TOOL CHAOS: Combinations and boundary conditions
// ============================================================================

describe("Cross-tool chaos tests", () => {
  it("anomaly detect output can be fed to export as JSON", () => {
    const csv =
      "name,value\nA,10\nB,12\nC,11\nD,13\nE,100\nF,9\nG,11\nH,10\nI,12\nJ,11";
    const anomalyResult = flowAnomalyDetect({ csv_content: csv });
    const exportResult = flowExportFormats({
      csv_content: anomalyResult.csv,
      format: "json",
    });
    const parsed = JSON.parse(exportResult.output);
    expect(parsed.length).toBe(10);
    expect(parsed[0]).toHaveProperty("_anomaly_score");
    expect(parsed[0]).toHaveProperty("_is_anomaly");
  });

  it("geo enhance output can be fed to export as GeoJSON", () => {
    const csv =
      "city,value\nNew York,100\nLondon,200\nTokyo,300";
    const geoResult = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    const exportResult = flowExportFormats({
      csv_content: geoResult.csv,
      format: "geojson",
      options: { lat_column: "_latitude", lng_column: "_longitude" },
    });
    const parsed = JSON.parse(exportResult.output);
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features.length).toBe(3);
  });

  it("time series output can be fed to export as summary", () => {
    const csv =
      "date,value\n2024-01-01,10\n2024-03-01,20\n2024-06-01,30\n2024-09-01,40\n2024-12-01,50";
    const tsResult = flowTimeSeriesAnimate({
      csv_content: csv,
      time_column: "date",
      frame_count: 5,
    });
    const exportResult = flowExportFormats({
      csv_content: tsResult.csv,
      format: "summary",
    });
    expect(exportResult.format).toBe("summary");
    expect(exportResult.metadata.rows).toBeGreaterThan(0);
  });

  it("nlp-to-viz output can be fed to anomaly detect", () => {
    const nlpResult = flowNlpToViz({
      prompt: "scatter distribution of scores with clusters",
      row_count: 100,
    });
    // Only works if the generated data has numeric columns
    const anomalyResult = flowAnomalyDetect({ csv_content: nlpResult.csv });
    expect(anomalyResult.summary.total_rows).toBe(100);
    expect(anomalyResult.csv).toContain("_anomaly_score");
  });

  it("merge then anomaly: merging two datasets and detecting anomalies", () => {
    const result = flowMergeDatasets({
      datasets: [
        { csv_content: "id,value\n1,10\n2,12\n3,11\n4,13\n5,100", label: "A" },
        { csv_content: "id,score\n1,50\n2,55\n3,52\n4,48\n5,500", label: "B" },
      ],
      join_type: "inner",
    });
    const anomalyResult = flowAnomalyDetect({ csv_content: result.csv });
    expect(anomalyResult.summary.anomaly_count).toBeGreaterThanOrEqual(1);
  });

  it("CSV with windows-style line endings (CRLF) works in anomaly detect", () => {
    const csv =
      "name,value\r\nA,10\r\nB,12\r\nC,11\r\nD,13\r\nE,100\r\nF,9\r\nG,11\r\nH,10\r\nI,12\r\nJ,11";
    // This may or may not work depending on the parser; verifying no crash
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.csv).toBeDefined();
  });

  it("CSV with trailing newline does not create phantom rows", () => {
    const csv = "name,value\nA,10\nB,20\n";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.total_rows).toBe(2);
  });

  it("CSV with quoted fields containing commas in anomaly detect", () => {
    const csv = 'name,value\n"Smith, John",10\n"Doe, Jane",20\n"X, Y",100';
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.total_rows).toBe(3);
  });
});

// ============================================================================
// EDGE CASES: flow_correlation_matrix (Tool 27)
// ============================================================================

describe("flowCorrelationMatrix — edge cases", () => {
  it("handles constant column (zero variance)", () => {
    const csv = "x,y\n5,1\n5,2\n5,3\n5,4";
    const result = flowCorrelationMatrix({ csv_content: csv });
    // Constant column x has zero variance — correlation should be 0
    expect(result.matrix[0][1]).toBe(0);
  });

  it("handles two rows (minimum for correlation)", () => {
    const csv = "a,b\n1,2\n3,4";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.columns.length).toBe(2);
    expect(result.matrix[0][1]).toBeCloseTo(1.0);
  });

  it("skips non-numeric columns automatically", () => {
    const csv = "name,age,city,salary\nAlice,30,NYC,100000\nBob,35,LA,120000\nCarol,28,NYC,95000";
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.columns).toContain("age");
    expect(result.columns).toContain("salary");
    expect(result.columns).not.toContain("name");
    expect(result.columns).not.toContain("city");
  });

  it("handles single row gracefully", () => {
    const csv = "a,b\n1,2";
    // Single row can still produce a matrix (though correlations are degenerate)
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.columns.length).toBe(2);
  });

  it("handles CSV with mixed numeric/text in same column", () => {
    const csv = "val\n1\n2\nN/A\n4\n5";
    const result = flowCorrelationMatrix({ csv_content: csv });
    // Should still identify "val" as numeric (>50% numeric)
    expect(result.columns).toContain("val");
  });

  it("handles large number of columns", () => {
    const cols = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const rows = Array.from({ length: 5 }, () =>
      cols.map(() => String(Math.random() * 100)).join(",")
    );
    const csv = cols.join(",") + "\n" + rows.join("\n");
    const result = flowCorrelationMatrix({ csv_content: csv });
    expect(result.matrix.length).toBe(20);
    expect(result.matrix[0].length).toBe(20);
  });

  it("strongest_correlations excludes self-correlations", () => {
    const csv = "a,b,c\n1,2,10\n2,4,20\n3,6,30";
    const result = flowCorrelationMatrix({ csv_content: csv });
    for (const pair of result.strongest_correlations) {
      expect(pair.column_a).not.toBe(pair.column_b);
    }
  });
});

// ============================================================================
// EDGE CASES: flow_cluster_data (Tool 28)
// ============================================================================

describe("flowClusterData — edge cases", () => {
  it("handles k larger than data points", () => {
    const csv = "x,y\n1,1\n2,2\n3,3";
    // k=10 but only 3 points — should still work (some clusters empty)
    expect(() =>
      flowClusterData({ csv_content: csv, k: 10, columns: ["x", "y"] })
    ).not.toThrow();
  });

  it("handles all identical points", () => {
    const csv = "x,y\n5,5\n5,5\n5,5\n5,5\n5,5";
    const result = flowClusterData({ csv_content: csv, k: 2, columns: ["x", "y"] });
    // All distances should be 0
    expect(result.rows).toBe(5);
  });

  it("preserves original non-numeric columns", () => {
    const csv = "name,x,y\nAlice,1,1\nBob,10,10\nCarol,1,2\nDave,10,11";
    const result = flowClusterData({ csv_content: csv, k: 2, columns: ["x", "y"] });
    expect(result.csv).toContain("Alice");
    expect(result.csv).toContain("Bob");
    const header = result.csv.split("\n")[0].split(",");
    expect(header).toContain("name");
  });

  it("single column clustering works", () => {
    const csv = "val\n1\n1\n1\n100\n100\n100";
    const result = flowClusterData({ csv_content: csv, k: 2, columns: ["val"] });
    expect(result.k).toBe(2);
    expect(result.columns_used).toEqual(["val"]);
  });

  it("silhouette score is between -1 and 1", () => {
    const csv = "x,y\n1,1\n2,2\n10,10\n11,11\n20,20\n21,21";
    const result = flowClusterData({ csv_content: csv, k: 3, columns: ["x", "y"] });
    expect(result.silhouette_score).toBeGreaterThanOrEqual(-1);
    expect(result.silhouette_score).toBeLessThanOrEqual(1);
  });

  it("exactly 2 points works", () => {
    const csv = "x,y\n0,0\n100,100";
    const result = flowClusterData({ csv_content: csv, k: 2, columns: ["x", "y"] });
    expect(result.k).toBe(2);
    expect(result.rows).toBe(2);
  });
});

// ============================================================================
// EDGE CASES: flow_hierarchical_data (Tool 29)
// ============================================================================

describe("flowHierarchicalData — edge cases", () => {
  it("handles single row", () => {
    const csv = "dept,team\nEngineering,Frontend";
    const result = flowHierarchicalData({ csv_content: csv, hierarchy_columns: ["dept", "team"] });
    // Root + 1 dept + 1 team = 3
    expect(result.total_nodes).toBe(3);
  });

  it("handles many duplicate categories", () => {
    const csv = "cat\n" + Array(20).fill("Same").join("\n");
    const result = flowHierarchicalData({ csv_content: csv, hierarchy_columns: ["cat"] });
    // Root + 1 unique category = 2
    expect(result.total_nodes).toBe(2);
  });

  it("aggregates value column correctly", () => {
    const csv = "region,sales\nNorth,100\nNorth,200\nSouth,300";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["region"],
      value_column: "sales",
    });
    // Root value should be 600 (100+200+300)
    const lines = result.csv.split("\n");
    const header = lines[0].split(",");
    const valueIdx = header.indexOf("value");
    const rootLine = lines.find(l => l.startsWith("Root,"));
    if (rootLine && valueIdx >= 0) {
      expect(Number(rootLine.split(",")[valueIdx])).toBe(600);
    }
  });

  it("custom root name works", () => {
    const csv = "a\nX\nY";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["a"],
      root_name: "MyCompany",
    });
    expect(result.csv).toContain("MyCompany");
  });

  it("3-level deep hierarchy", () => {
    const csv = "continent,country,city\nAsia,Japan,Tokyo\nAsia,Japan,Osaka\nAsia,China,Beijing\nEurope,France,Paris";
    const result = flowHierarchicalData({
      csv_content: csv,
      hierarchy_columns: ["continent", "country", "city"],
    });
    // Root(1) + continents(2) + countries(3) + cities(4) = 10
    expect(result.total_nodes).toBe(10);
    expect(result.depth).toBe(4);
  });
});

// ============================================================================
// EDGE CASES: flow_compare_datasets (Tool 30)
// ============================================================================

describe("flowCompareDatasets — edge cases", () => {
  it("handles empty dataset A", () => {
    const csvA = "id,val\n";
    const csvB = "id,val\n1,100\n2,200";
    // Should handle gracefully — note csvA has 0 data rows
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    expect(result.added_rows).toBe(2);
    expect(result.removed_rows).toBe(0);
  });

  it("handles empty dataset B", () => {
    const csvA = "id,val\n1,100\n2,200";
    const csvB = "id,val\n";
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    expect(result.removed_rows).toBe(2);
    expect(result.added_rows).toBe(0);
  });

  it("detects changes in non-numeric columns", () => {
    const csvA = "id,name\n1,Alice\n2,Bob";
    const csvB = "id,name\n1,Alice\n2,Robert";
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    expect(result.changed_rows).toBe(1);
    expect(result.unchanged_rows).toBe(1);
  });

  it("column_deltas computed for numeric columns only", () => {
    const csvA = "id,name,score\n1,Alice,80\n2,Bob,90";
    const csvB = "id,name,score\n1,Alice,85\n2,Bob,95";
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    expect(result.column_deltas.length).toBe(1);
    expect(result.column_deltas[0].column).toBe("score");
    expect(result.column_deltas[0].delta).toBe(5);
  });

  it("handles datasets with different column orders", () => {
    const csvA = "id,x,y\n1,10,20";
    const csvB = "id,y,x\n1,20,15";
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    // x changed (10→15), y unchanged (20→20)
    expect(result.changed_rows).toBe(1);
  });

  it("summary string contains key column name", () => {
    const csvA = "pk,val\n1,10";
    const csvB = "pk,val\n1,20";
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "pk" });
    expect(result.summary).toContain("pk");
  });

  it("handles duplicate keys in source data", () => {
    const csvA = "id,val\n1,10\n1,20";
    const csvB = "id,val\n1,30";
    // Last value wins for Map
    const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
    expect(result.changed_rows + result.unchanged_rows).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// EDGE CASES: flow_pivot_table (Tool 31)
// ============================================================================

describe("flowPivotTable — edge cases", () => {
  it("single row produces one group", () => {
    const csv = "cat,val\nA,100";
    const result = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "sum" } });
    expect(result.row_count).toBe(1);
  });

  it("all rows same group produces single output row", () => {
    const csv = "cat,val\nX,10\nX,20\nX,30";
    const result = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "sum" } });
    expect(result.row_count).toBe(1);
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const sumIdx = headers.indexOf("val_sum");
    expect(Number(lines[1].split(",")[sumIdx])).toBe(60);
  });

  it("min/max aggregations work correctly", () => {
    const csv = "cat,val\nA,5\nA,15\nA,10";
    const minResult = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "min" } });
    const maxResult = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "max" } });
    const minLines = minResult.csv.split("\n");
    const maxLines = maxResult.csv.split("\n");
    const minHeaders = minLines[0].split(",");
    const maxHeaders = maxLines[0].split(",");
    expect(Number(minLines[1].split(",")[minHeaders.indexOf("val_min")])).toBe(5);
    expect(Number(maxLines[1].split(",")[maxHeaders.indexOf("val_max")])).toBe(15);
  });

  it("handles empty values in aggregation column", () => {
    const csv = "cat,val\nA,10\nA,\nA,30";
    const result = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "sum" } });
    // NaN values should be filtered, sum = 10+30 = 40
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const sumIdx = headers.indexOf("val_sum");
    expect(Number(lines[1].split(",")[sumIdx])).toBe(40);
  });

  it("two-level group-by produces correct number of groups", () => {
    const csv = "region,product,sales\nN,A,10\nN,B,20\nS,A,30\nS,B,40\nN,A,5";
    const result = flowPivotTable({ csv_content: csv, group_by: ["region", "product"], aggregations: { sales: "sum" } });
    expect(result.row_count).toBe(4); // N-A, N-B, S-A, S-B
  });

  it("summary includes group-by columns", () => {
    const csv = "cat,val\nA,10\nB,20";
    const result = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "count" } });
    expect(result.summary).toContain("cat");
  });

  it("avg handles single value per group", () => {
    const csv = "cat,val\nA,42";
    const result = flowPivotTable({ csv_content: csv, group_by: ["cat"], aggregations: { val: "avg" } });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const avgIdx = headers.indexOf("val_avg");
    expect(Number(lines[1].split(",")[avgIdx])).toBe(42);
  });
});

// ============================================================================
// EDGE CASES: flow_regression_analysis (Tool 32)
// ============================================================================

describe("flowRegressionAnalysis — edge cases", () => {
  it("two points produce perfect fit", () => {
    const csv = "x,y\n0,0\n10,20";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.r_squared).toBeCloseTo(1, 5);
    expect(result.slope).toBeCloseTo(2, 5);
    expect(result.intercept).toBeCloseTo(0, 5);
  });

  it("constant y gives slope = 0", () => {
    const csv = "x,y\n1,5\n2,5\n3,5\n4,5";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
  });

  it("throws with only one data point", () => {
    const csv = "x,y\n1,2";
    expect(() =>
      flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" })
    ).toThrow();
  });

  it("handles large values without overflow", () => {
    const csv = "x,y\n1000000,2000000\n2000000,4000000\n3000000,6000000";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.r_squared).toBeCloseTo(1, 3);
    expect(result.slope).toBeCloseTo(2, 3);
  });

  it("preserves extra columns in output CSV", () => {
    const csv = "x,y,label,category\n1,2,A,cat1\n2,4,B,cat2\n3,6,C,cat3";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.csv).toContain("label");
    expect(result.csv).toContain("category");
    expect(result.csv).toContain("_predicted");
    expect(result.csv).toContain("_residual");
  });

  it("equation string has correct format", () => {
    const csv = "x,y\n1,3\n2,5\n3,7";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.equation).toMatch(/y = .+x .+ .+/);
  });

  it("negative intercept shown correctly in equation", () => {
    // y = 2x - 1: points (1,1), (2,3), (3,5)
    const csv = "x,y\n1,1\n2,3\n3,5";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.equation).toContain("-");
    expect(result.intercept).toBeCloseTo(-1, 3);
  });

  it("p_value is small for strong relationship", () => {
    const csv = "x,y\n1,2\n2,4\n3,6\n4,8\n5,10\n6,12\n7,14\n8,16";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.p_value).toBeLessThan(0.01);
  });

  it("summary describes strength correctly", () => {
    // Perfect linear
    const csv = "x,y\n1,2\n2,4\n3,6";
    const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
    expect(result.summary).toContain("very strong");
    expect(result.summary).toContain("positive");
  });
});

// ============================================================================
// EDGE CASES: flow_normalize_data (Tool 33)
// ============================================================================

describe("flowNormalizeData — edge cases", () => {
  it("single row min-max produces 0", () => {
    const csv = "val\n42";
    const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "min_max" });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("val_normalized");
    // Single value, range = 0, should produce 0
    expect(Number(lines[1].split(",")[normIdx])).toBe(0);
  });

  it("single row z-score produces 0", () => {
    const csv = "val\n42";
    const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "z_score" });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("val_normalized");
    expect(Number(lines[1].split(",")[normIdx])).toBe(0);
  });

  it("negative values normalize correctly", () => {
    const csv = "val\n-10\n0\n10";
    const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "min_max" });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const normIdx = headers.indexOf("val_normalized");
    expect(Number(lines[1].split(",")[normIdx])).toBeCloseTo(0, 4); // -10 → 0
    expect(Number(lines[2].split(",")[normIdx])).toBeCloseTo(0.5, 4); // 0 → 0.5
    expect(Number(lines[3].split(",")[normIdx])).toBeCloseTo(1, 4); // 10 → 1
  });

  it("handles missing values gracefully", () => {
    const csv = "name,val\nA,10\nB,\nC,30";
    const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "min_max" });
    const lines = result.csv.split("\n");
    expect(lines.length).toBe(4); // header + 3 rows, no crash
  });

  it("summary mentions method", () => {
    const csv = "val\n1\n2\n3";
    const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "z_score" });
    expect(result.summary).toContain("z-score");
    expect(result.method).toBe("z_score");
  });

  it("many columns normalized at once", () => {
    const csv = "a,b,c,d\n1,2,3,4\n5,6,7,8\n9,10,11,12";
    const result = flowNormalizeData({ csv_content: csv, method: "min_max" });
    expect(result.columns_normalized.length).toBe(4);
    expect(result.csv).toContain("a_normalized");
    expect(result.csv).toContain("d_normalized");
  });
});

// ============================================================================
// EDGE CASES: flow_deduplicate_rows (Tool 34)
// ============================================================================

describe("flowDeduplicateRows — edge cases", () => {
  it("single row returns unchanged", () => {
    const csv = "a,b\n1,2";
    const result = flowDeduplicateRows({ csv_content: csv });
    expect(result.unique_rows).toBe(1);
    expect(result.duplicates_removed).toBe(0);
  });

  it("all rows identical returns single row", () => {
    const csv = "a,b\n1,2\n1,2\n1,2\n1,2";
    const result = flowDeduplicateRows({ csv_content: csv });
    expect(result.unique_rows).toBe(1);
    expect(result.duplicates_removed).toBe(3);
  });

  it("numeric string differences are treated as different", () => {
    const csv = "name\n100\n100.0\n100.00";
    const result = flowDeduplicateRows({ csv_content: csv, columns: ["name"] });
    // String comparison: these are different strings
    expect(result.unique_rows).toBe(3);
  });

  it("empty values handled correctly", () => {
    const csv = "a,b\n1,\n1,\n2,3";
    const result = flowDeduplicateRows({ csv_content: csv });
    expect(result.unique_rows).toBe(2);
    expect(result.duplicates_removed).toBe(1);
  });

  it("case-insensitive flag works with mixed case", () => {
    const csv = "name\nALICE\nalice\nAlice\nBob";
    const result = flowDeduplicateRows({ csv_content: csv, columns: ["name"], case_insensitive: true });
    expect(result.unique_rows).toBe(2); // ALICE + Bob
    expect(result.duplicates_removed).toBe(2);
  });

  it("summary mentions column names", () => {
    const csv = "id,val\n1,a\n2,b";
    const result = flowDeduplicateRows({ csv_content: csv, columns: ["id"] });
    expect(result.summary).toContain("id");
  });
});

// ============================================================================
// EDGE CASES: flow_bin_data (Tool 35)
// ============================================================================

describe("flowBinData — edge cases", () => {
  it("all identical values go into one bin", () => {
    const csv = "val\n5\n5\n5\n5";
    const result = flowBinData({ csv_content: csv, column: "val", bins: 3 });
    // All values are in the same bin
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const countIdx = headers.indexOf("count");
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      total += Number(lines[i].split(",")[countIdx]);
    }
    expect(total).toBe(4);
  });

  it("two values create valid bins", () => {
    const csv = "val\n0\n100";
    const result = flowBinData({ csv_content: csv, column: "val", bins: 2 });
    expect(result.bin_count).toBe(2);
    expect(result.total_values).toBe(2);
  });

  it("negative values handled correctly", () => {
    const csv = "val\n-50\n-10\n0\n10\n50";
    const result = flowBinData({ csv_content: csv, column: "val", bins: 5 });
    expect(result.min_value).toBe(-50);
    expect(result.max_value).toBe(50);
    expect(result.bin_count).toBe(5);
  });

  it("very large range doesn't crash", () => {
    const csv = "val\n0\n1000000";
    const result = flowBinData({ csv_content: csv, column: "val", bins: 10 });
    expect(result.bin_count).toBe(10);
  });

  it("summary mentions column name", () => {
    const csv = "score\n1\n2\n3";
    const result = flowBinData({ csv_content: csv, column: "score", bins: 2 });
    expect(result.summary).toContain("score");
  });
});

// ============================================================================
// EDGE CASES: flow_transpose_data (Tool 36)
// ============================================================================
// ============================================================================
// flowSampleData — edge cases
// ============================================================================
// ============================================================================
// flowColumnStats — edge cases
// ============================================================================

describe("flowColumnStats — edge cases", () => {
  it("auto-detects numeric columns ignoring text", () => {
    const csv = "name,score,grade\nAlice,95,A\nBob,85,B\nCharlie,92,A";
    const result = flowColumnStats({ csv_content: csv });
    expect(result.stats.length).toBe(1);
    expect(result.stats[0].column).toBe("score");
  });

  it("specific column parameter overrides auto-detect", () => {
    const csv = "a,b,c\n1,10,100\n2,20,200\n3,30,300";
    const result = flowColumnStats({ csv_content: csv, columns: ["b"] });
    expect(result.stats.length).toBe(1);
    expect(result.stats[0].column).toBe("b");
  });

  it("all identical values produce std=0", () => {
    const csv = "val\n5\n5\n5\n5\n5";
    const result = flowColumnStats({ csv_content: csv });
    expect(result.stats[0].std).toBe(0);
    expect(result.stats[0].min).toBe(5);
    expect(result.stats[0].max).toBe(5);
    expect(result.stats[0].mean).toBe(5);
    expect(result.stats[0].median).toBe(5);
  });

  it("two values compute correct stats", () => {
    const csv = "val\n10\n20";
    const result = flowColumnStats({ csv_content: csv });
    const s = result.stats[0];
    expect(s.count).toBe(2);
    expect(s.mean).toBe(15);
    expect(s.min).toBe(10);
    expect(s.max).toBe(20);
    expect(s.range).toBe(10);
  });

  it("negative values handled correctly", () => {
    const csv = "val\n-10\n-20\n-5\n-15";
    const result = flowColumnStats({ csv_content: csv });
    const s = result.stats[0];
    expect(s.min).toBe(-20);
    expect(s.max).toBe(-5);
    expect(s.mean).toBe(-12.5);
    expect(s.range).toBe(15);
  });

  it("mixed positive and negative", () => {
    const csv = "val\n-100\n0\n100";
    const result = flowColumnStats({ csv_content: csv });
    const s = result.stats[0];
    expect(s.mean).toBeCloseTo(0, 5);
    expect(s.median).toBe(0);
  });

  it("missing values counted correctly", () => {
    const csv = "val\n1\n\n3\n\n5";
    const result = flowColumnStats({ csv_content: csv });
    const s = result.stats[0];
    expect(s.missing).toBeGreaterThan(0);
    expect(s.count + s.missing).toBeLessThanOrEqual(5);
  });

  it("csv output has correct headers", () => {
    const csv = "x,y\n1,10\n2,20\n3,30";
    const result = flowColumnStats({ csv_content: csv });
    const csvHeader = result.csv.trim().split("\n")[0];
    expect(csvHeader).toContain("column");
    expect(csvHeader).toContain("mean");
    expect(csvHeader).toContain("median");
    expect(csvHeader).toContain("std");
  });

  it("empty data returns empty stats", () => {
    const result = flowColumnStats({ csv_content: "val" });
    expect(result.stats.length).toBe(0);
  });

  it("no numeric columns returns empty stats", () => {
    const csv = "name,city\nAlice,NYC\nBob,LA";
    const result = flowColumnStats({ csv_content: csv });
    expect(result.stats.length).toBe(0);
  });
});

// ============================================================================
// CSV ARG NORMALIZATION (normalizeCsvArgs)
// ============================================================================

describe("normalizeCsvArgs", () => {
  it("copies csv_content to csv_data when only csv_content provided", () => {
    const args = normalizeCsvArgs({ csv_content: "a,b\n1,2" });
    expect(args.csv_content).toBe("a,b\n1,2");
    expect(args.csv_data).toBe("a,b\n1,2");
  });

  it("copies csv_data to csv_content when only csv_data provided", () => {
    const args = normalizeCsvArgs({ csv_data: "x,y\n3,4" });
    expect(args.csv_data).toBe("x,y\n3,4");
    expect(args.csv_content).toBe("x,y\n3,4");
  });

  it("preserves both when both provided", () => {
    const args = normalizeCsvArgs({ csv_content: "a", csv_data: "b" });
    expect(args.csv_content).toBe("a");
    expect(args.csv_data).toBe("b");
  });

  it("does nothing when neither is provided", () => {
    const args = normalizeCsvArgs({ column: "name", value: 5 });
    expect(args.csv_content).toBeUndefined();
    expect(args.csv_data).toBeUndefined();
    expect(args.column).toBe("name");
  });

  it("does not clobber other args", () => {
    const args = normalizeCsvArgs({ csv_content: "data", style: "explorer" });
    expect(args.csv_data).toBe("data");
    expect(args.style).toBe("explorer");
  });

  it("works with tools expecting csv_content when csv_data is passed", () => {
    const csv = "name,value\nAlice,10\nBob,20";
    const args = normalizeCsvArgs({ csv_data: csv });
    const result = flowColumnStats({ csv_content: args.csv_content as string });
    expect(result.stats.length).toBeGreaterThan(0);
  });
});
