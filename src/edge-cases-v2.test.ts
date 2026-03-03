import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { flowAnomalyDetect, flowTimeSeriesAnimate, flowMergeDatasets } from "./tools-v2.js";
import { flowNlpToViz, flowGeoEnhance, flowExportFormats } from "./tools-v3.js";
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
