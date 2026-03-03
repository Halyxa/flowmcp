import { describe, it, expect } from "vitest";
import { flowAnomalyDetect, flowTimeSeriesAnimate, flowMergeDatasets } from "./tools-v2.js";

// ============================================================================
// TOOL 22: flow_anomaly_detect
// ============================================================================

describe("flowAnomalyDetect", () => {
  const basicCSV = "name,value\nA,10\nB,12\nC,11\nD,13\nE,100\nF,9\nG,11\nH,10\nI,12\nJ,11";

  it("detects obvious outlier in basic dataset", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV });
    expect(result.csv).toBeDefined();
    expect(result.summary.anomaly_count).toBeGreaterThanOrEqual(1);
    expect(result.csv).toContain("_anomaly_score");
    expect(result.csv).toContain("_is_anomaly");
  });

  it("returns summary mode without CSV", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV, output_mode: "summary" });
    expect(result.total_rows).toBe(10);
    expect(result.anomaly_count).toBeGreaterThanOrEqual(1);
    expect(result.anomaly_rate).toContain("%");
    expect(result.by_column).toBeDefined();
    expect(result.by_column.length).toBe(1);
    expect(result.by_column[0].column).toBe("value");
  });

  it("filters to anomalies_only mode", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV, output_mode: "anomalies_only" });
    // Only anomaly rows should be in CSV output
    const csvLines = result.csv.split("\n");
    // Header + anomaly rows only
    expect(csvLines.length).toBeLessThan(12); // less than header + 10 data rows
    expect(csvLines.length).toBeGreaterThanOrEqual(2); // at least header + 1 anomaly
  });

  it("respects explicit numeric_columns", () => {
    const csv = "name,val1,val2\nA,10,100\nB,12,200\nC,11,150\nD,13,180\nE,100,170";
    const result = flowAnomalyDetect({ csv_content: csv, numeric_columns: ["val1"] });
    expect(result.summary.by_column.length).toBe(1);
    expect(result.summary.by_column[0].column).toBe("val1");
  });

  it("uses zscore method when specified", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV, method: "zscore" });
    expect(result.method_used).toContain("Z-score");
  });

  it("uses iqr method when specified", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV, method: "iqr" });
    expect(result.method_used).toContain("IQR");
  });

  it("throws on header-only CSV", () => {
    expect(() => flowAnomalyDetect({ csv_content: "name,value" }))
      .toThrow("CSV must have header + at least 1 data row");
  });

  it("throws when no numeric columns found", () => {
    const csv = "name,label\nA,X\nB,Y\nC,Z";
    expect(() => flowAnomalyDetect({ csv_content: csv }))
      .toThrow("No numeric columns found");
  });

  it("throws when specified column does not exist", () => {
    expect(() => flowAnomalyDetect({ csv_content: basicCSV, numeric_columns: ["nonexistent"] }))
      .toThrow('Column "nonexistent" not found');
  });

  it("handles all identical values without crashing", () => {
    const csv = "name,value\nA,5\nB,5\nC,5\nD,5\nE,5";
    const result = flowAnomalyDetect({ csv_content: csv });
    expect(result.summary.anomaly_count).toBe(0);
  });

  it("provides flow_mapping with color and size columns", () => {
    const result = flowAnomalyDetect({ csv_content: basicCSV });
    expect(result.flow_mapping.color_column).toBe("_anomaly_score");
    expect(result.flow_mapping.size_column).toBe("_anomaly_score");
  });

  it("handles custom threshold", () => {
    // With very low threshold, more anomalies should be detected
    const low = flowAnomalyDetect({ csv_content: basicCSV, threshold: 0.5, method: "zscore" });
    const high = flowAnomalyDetect({ csv_content: basicCSV, threshold: 5.0, method: "zscore" });
    expect(low.summary.anomaly_count).toBeGreaterThanOrEqual(high.summary.anomaly_count);
  });
});

// ============================================================================
// TOOL 20: flow_time_series_animate
// ============================================================================

describe("flowTimeSeriesAnimate", () => {
  const basicCSV = "date,value\n2024-01-01,10\n2024-02-01,20\n2024-03-01,30\n2024-04-01,40\n2024-05-01,50";

  it("creates frames from ISO date time series", () => {
    const result = flowTimeSeriesAnimate({ csv_content: basicCSV, time_column: "date", frame_count: 5 });
    expect(result.csv).toContain("_frame");
    expect(result.csv).toContain("_time_label");
    expect(result.frame_count).toBe(5);
    expect(result.rows_output).toBeGreaterThanOrEqual(5);
  });

  it("handles year-only dates", () => {
    const csv = "year,population\n2000,100\n2005,200\n2010,300\n2015,400\n2020,500";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "year", frame_count: 5 });
    expect(result.csv).toContain("_frame");
    expect(result.time_range.start).toContain("2000");
    expect(result.time_range.end).toContain("2020");
  });

  it("handles US date format MM/DD/YYYY", () => {
    const csv = "date,value\n01/15/2024,10\n02/15/2024,20\n03/15/2024,30";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", frame_count: 3 });
    expect(result.frame_count).toBe(3);
    expect(result.csv).toContain("_frame");
  });

  it("handles Unix timestamps", () => {
    const csv = "ts,value\n1704067200,10\n1706745600,20\n1709251200,30";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "ts", frame_count: 3 });
    expect(result.frame_count).toBe(3);
  });

  it("groups by group_column", () => {
    const csv = "date,city,temp\n2024-01-01,NYC,30\n2024-01-01,LA,60\n2024-06-01,NYC,80\n2024-06-01,LA,90";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", group_column: "city", frame_count: 3 });
    expect(result.groups).toContain("NYC");
    expect(result.groups).toContain("LA");
  });

  it("supports cumulative mode", () => {
    const csv = "date,sales\n2024-01-01,10\n2024-02-01,20\n2024-03-01,30";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date", cumulative: true, frame_count: 3 });
    expect(result.csv).toContain("_frame");
    // Cumulative values should be increasing
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const salesIdx = headers.indexOf("sales");
    const values = lines.slice(1).map(l => {
      const fields = l.split(",");
      return Number(fields[salesIdx]);
    }).filter(v => !isNaN(v) && v > 0);
    // Each value should be >= previous (cumulative)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("throws on missing time column", () => {
    expect(() => flowTimeSeriesAnimate({ csv_content: basicCSV, time_column: "nonexistent" }))
      .toThrow('Time column "nonexistent" not found');
  });

  it("throws on header-only CSV", () => {
    expect(() => flowTimeSeriesAnimate({ csv_content: "date,value", time_column: "date" }))
      .toThrow("CSV must have header + at least 1 data row");
  });

  it("throws when no valid dates exist", () => {
    const csv = "date,value\nnot_a_date,10\nalso_not,20";
    expect(() => flowTimeSeriesAnimate({ csv_content: csv, time_column: "date" }))
      .toThrow('No valid dates found in column "date"');
  });

  it("handles single timestamp (all same date)", () => {
    const csv = "date,value\n2024-01-01,10\n2024-01-01,20\n2024-01-01,30";
    const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date" });
    expect(result.frame_count).toBe(1);
    expect(result.rows_output).toBe(3);
  });

  it("clamps frame_count to max 200", () => {
    const result = flowTimeSeriesAnimate({ csv_content: basicCSV, time_column: "date", frame_count: 500 });
    expect(result.frame_count).toBeLessThanOrEqual(200);
  });

  it("provides flow_mapping instructions", () => {
    const result = flowTimeSeriesAnimate({ csv_content: basicCSV, time_column: "date" });
    expect(result.flow_mapping.animation_column).toBe("_frame");
    expect(result.flow_mapping.label_column).toBe("_time_label");
  });
});

// ============================================================================
// TOOL 21: flow_merge_datasets
// ============================================================================

describe("flowMergeDatasets", () => {
  const ds1 = "id,name,score\n1,Alice,90\n2,Bob,85\n3,Carol,95";
  const ds2 = "id,name,grade\n1,Alice,A\n2,Bob,B\n4,Dave,A";

  it("inner join on auto-detected id column", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
      join_type: "inner",
    });
    expect(result.join_columns).toContain("id");
    expect(result.rows_output).toBe(2); // Only id=1 and id=2
    expect(result.csv).toContain("Alice");
    expect(result.csv).toContain("Bob");
    expect(result.csv).not.toContain("Carol"); // not in ds2
    expect(result.csv).not.toContain("Dave"); // not in ds1
  });

  it("left join keeps all left rows", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
      join_type: "left",
    });
    expect(result.rows_output).toBe(3); // All 3 left rows
    expect(result.csv).toContain("Carol"); // from left
  });

  it("outer join includes all rows from both sides", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
      join_type: "outer",
    });
    expect(result.rows_output).toBe(4); // 1,2,3,4
    expect(result.csv).toContain("Carol");
    expect(result.csv).toContain("Dave");
  });

  it("concatenate stacks datasets vertically", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1, label: "scores" }, { csv_content: ds2, label: "grades" }],
      join_type: "concatenate",
    });
    expect(result.rows_output).toBe(6); // 3 + 3
    expect(result.csv).toContain("_source");
    expect(result.csv).toContain("scores");
    expect(result.csv).toContain("grades");
  });

  it("uses custom join columns", () => {
    const a = "key,val\nX,1\nY,2";
    const b = "key,val\nX,10\nZ,30";
    const result = flowMergeDatasets({
      datasets: [{ csv_content: a }, { csv_content: b }],
      join_columns: ["key"],
      join_type: "inner",
    });
    expect(result.rows_output).toBe(1); // Only X
    expect(result.csv).toContain("X");
  });

  it("adds _source column by default", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
    });
    expect(result.csv).toContain("_source");
  });

  it("omits _source column when add_source_column is false", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
      add_source_column: false,
    });
    expect(result.csv).not.toContain("_source");
  });

  it("handles prefix conflict resolution", () => {
    // Use datasets where "value" is shared but NOT a join column
    const a = "id,value,extra_a\n1,100,x\n2,200,y";
    const b = "id,value,extra_b\n1,111,p\n2,222,q";
    const result = flowMergeDatasets({
      datasets: [{ csv_content: a, label: "A" }, { csv_content: b, label: "B" }],
      join_columns: ["id"],
      conflict_resolution: "prefix",
    });
    // "value" appears in both but is NOT a join column, should be prefixed
    expect(result.csv).toContain("A_value");
    expect(result.csv).toContain("B_value");
  });

  it("throws when fewer than 2 datasets provided", () => {
    expect(() => flowMergeDatasets({ datasets: [{ csv_content: ds1 }] }))
      .toThrow("At least 2 datasets are required");
  });

  it("throws when no shared columns and join type is not concatenate", () => {
    const a = "col_a,val\n1,x";
    const b = "col_b,val2\n1,y";
    expect(() => flowMergeDatasets({
      datasets: [{ csv_content: a }, { csv_content: b }],
      join_type: "inner",
    })).toThrow("No shared columns found");
  });

  it("throws when join column not found in a dataset", () => {
    expect(() => flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
      join_columns: ["nonexistent"],
    })).toThrow('Join column "nonexistent" not found');
  });

  it("provides flow_mapping for source column", () => {
    const result = flowMergeDatasets({
      datasets: [{ csv_content: ds1 }, { csv_content: ds2 }],
    });
    expect(result.flow_mapping).toBeDefined();
    expect(result.flow_mapping!.color_column).toBe("_source");
  });
});
