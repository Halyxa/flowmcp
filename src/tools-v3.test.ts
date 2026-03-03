import { describe, it, expect } from "vitest";
import { flowNlpToViz, flowGeoEnhance, flowExportFormats } from "./tools-v3.js";

// ============================================================================
// flowNlpToViz — THE CLOSER
// ============================================================================

describe("flowNlpToViz", () => {
  it("generates network visualization from network prompt", () => {
    const result = flowNlpToViz({
      prompt: "Show me a social network graph of user connections",
    });
    expect(result.visualization.template).toBe("Network Graph");
    expect(result.csv).toContain("id");
    expect(result.csv).toContain("connections by id");
    expect(result.data_summary.rows).toBeGreaterThan(0);
    expect(result.visualization.column_mappings.id).toBeDefined();
    expect(result.visualization.column_mappings.connections).toBe("connections by id");
  });

  it("generates map visualization from geographic prompt", () => {
    const result = flowNlpToViz({
      prompt: "Show city locations on a global map with geographic coordinates",
    });
    expect(result.visualization.template).toBe("Globe / Map");
    expect(result.csv).toContain("latitude");
    expect(result.csv).toContain("longitude");
    expect(result.visualization.column_mappings.latitude).toBe("latitude");
    expect(result.visualization.column_mappings.longitude).toBe("longitude");
  });

  it("generates scatter visualization for default/scatter prompts", () => {
    const result = flowNlpToViz({
      prompt: "Show me a distribution of scores across clusters",
    });
    expect(result.visualization.template).toBe("3D Scatter");
    expect(result.data_summary.columns).toContain("label");
    expect(result.data_summary.columns).toContain("category");
  });

  it("generates timeline visualization from time prompt", () => {
    const result = flowNlpToViz({
      prompt: "Show revenue growth over time with monthly trends",
    });
    expect(result.visualization.template).toBe("Time Series");
    expect(result.csv).toContain("date");
    expect(result.csv).toContain("group");
  });

  it("respects row_count parameter", () => {
    const result = flowNlpToViz({
      prompt: "Show me scatter data",
      row_count: 50,
    });
    expect(result.data_summary.rows).toBe(50);
  });

  it("caps row_count at 5000", () => {
    const result = flowNlpToViz({
      prompt: "scatter data",
      row_count: 10000,
    });
    expect(result.data_summary.rows).toBeLessThanOrEqual(5000);
  });

  it("handles transform mode with provided CSV", () => {
    const csv = "name,value,category\nAlice,10,A\nBob,20,B\nCharlie,30,A";
    const result = flowNlpToViz({
      prompt: "Show this as a scatter plot",
      data_source: "transform",
      csv_content: csv,
    });
    expect(result.data_summary.generation_method).toBe("Transformed from provided CSV");
    expect(result.csv).toBe(csv);
    expect(result.data_summary.columns).toEqual(["name", "value", "category"]);
  });

  it("transform mode throws on empty CSV", () => {
    expect(() =>
      flowNlpToViz({
        prompt: "scatter",
        data_source: "transform",
        csv_content: "headers_only",
      }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("generates simple complexity with fewer columns", () => {
    const result = flowNlpToViz({
      prompt: "simple scatter data",
      complexity: "simple",
    });
    // Simple scatter: 3 numeric cols + label + category = 5
    expect(result.data_summary.columns.length).toBe(5);
  });

  it("generates rich complexity with more columns", () => {
    const result = flowNlpToViz({
      prompt: "rich scatter data",
      complexity: "rich",
    });
    // Rich scatter: 7 numeric cols + label + category = 9
    expect(result.data_summary.columns.length).toBe(9);
  });

  it("detects domain correctly", () => {
    const result = flowNlpToViz({
      prompt: "Show stock market portfolio trading data",
    });
    expect(result.visualization.title).toContain("Financial Analysis");
  });

  it("returns flow_setup with instructions", () => {
    const result = flowNlpToViz({ prompt: "network graph" });
    expect(result.flow_setup.upload_instructions).toContain("https://a.flow.gl");
    expect(result.flow_setup.recommended_settings).toContain("Template:");
  });
});

// ============================================================================
// flowGeoEnhance — GEOGRAPHIC ENRICHMENT
// ============================================================================

describe("flowGeoEnhance", () => {
  it("resolves known cities with exact match", () => {
    const csv = "city,value\nNew York,100\nLondon,200\nTokyo,300";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    expect(result.stats.resolved).toBe(3);
    expect(result.stats.unresolved).toBe(0);
    expect(result.stats.resolution_rate).toBe(1);
    expect(result.csv).toContain("_latitude");
    expect(result.csv).toContain("_longitude");
    expect(result.csv).toContain("_geo_confidence");
    // New York lat ~40.71
    expect(result.csv).toContain("40.712800");
  });

  it("resolves countries", () => {
    const csv = "country,sales\nUnited States,500\nFrance,300\nJapan,400";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["country"],
    });
    expect(result.stats.resolved).toBe(3);
    expect(result.csv).toContain("0.40"); // country confidence
  });

  it("resolves fuzzy matches", () => {
    const csv = "city,value\nNew Yrok,100\nLndon,200";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    // "New Yrok" is Levenshtein 2 from "New York", "Lndon" is 1 from "London"
    expect(result.stats.resolved).toBe(2);
    expect(result.csv).toContain("0.60"); // fuzzy confidence
  });

  it("detects coordinate format", () => {
    const csv = 'location,name\n"40.7128, -74.0060",NYC\n"51.5074, -0.1278",LON';
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["location"],
    });
    expect(result.stats.resolved).toBe(2);
    expect(result.csv).toContain("1.00"); // coordinate confidence
  });

  it("handles unresolved locations with fallback", () => {
    const csv = "city,value\nXyzzytown,100\nNowhereville,200";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
      fallback_coordinates: { lat: 0, lng: 0 },
    });
    expect(result.stats.unresolved).toBe(2);
    expect(result.csv).toContain("0.000000"); // fallback coords
    expect(result.unresolved_locations).toContain("Xyzzytown");
    expect(result.unresolved_locations).toContain("Nowhereville");
  });

  it("handles combined columns (city + country)", () => {
    const csv = "city,country,value\nLondon,GB,100\nParis,FR,200";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city", "country"],
      combine_columns: true,
    });
    expect(result.stats.resolved).toBe(2);
  });

  it("throws on missing column", () => {
    const csv = "city,value\nNew York,100";
    expect(() =>
      flowGeoEnhance({
        csv_content: csv,
        location_columns: ["nonexistent"],
      }),
    ).toThrow('Column "nonexistent" not found');
  });

  it("throws on empty CSV", () => {
    expect(() =>
      flowGeoEnhance({
        csv_content: "just_header",
        location_columns: ["just_header"],
      }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("resolves city alt names", () => {
    const csv = "city,value\nNYC,100\nSF,200";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    expect(result.stats.resolved).toBe(2);
  });

  it("resolves country codes", () => {
    const csv = "country,value\nUS,100\nGB,200\nJP,300";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["country"],
    });
    // US, GB, JP should all be in country alt codes
    expect(result.stats.resolved).toBe(3);
  });

  it("returns confidence breakdown by match type", () => {
    const csv = "city,value\nNew York,100\nLndon,200\nUnited States,300";
    const result = flowGeoEnhance({
      csv_content: csv,
      location_columns: ["city"],
    });
    expect(result.stats.confidence_breakdown).toBeDefined();
    expect(typeof result.stats.confidence_breakdown).toBe("object");
  });
});

// ============================================================================
// flowExportFormats — PRESENTATION-READY OUTPUTS
// ============================================================================

describe("flowExportFormats", () => {
  const testCsv = "name,value,category,lat,lng\nAlice,10,A,40.7128,-74.0060\nBob,20,B,51.5074,-0.1278\nCharlie,30,A,35.6762,139.6503";

  it("exports to JSON format", () => {
    const result = flowExportFormats({
      csv_content: testCsv,
      format: "json",
    });
    expect(result.format).toBe("json");
    const parsed = JSON.parse(result.output);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].name).toBe("Alice");
    expect(parsed[0].value).toBe(10); // auto-converted to number
    expect(parsed[0].category).toBe("A");
    expect(result.metadata.rows).toBe(3);
  });

  it("exports to GeoJSON format", () => {
    const result = flowExportFormats({
      csv_content: testCsv,
      format: "geojson",
      options: { lat_column: "lat", lng_column: "lng" },
    });
    expect(result.format).toBe("geojson");
    const parsed = JSON.parse(result.output);
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(3);
    expect(parsed.features[0].geometry.type).toBe("Point");
    expect(parsed.features[0].geometry.coordinates[0]).toBeCloseTo(-74.006);
    expect(parsed.features[0].geometry.coordinates[1]).toBeCloseTo(40.7128);
    expect(parsed.features[0].properties.name).toBe("Alice");
  });

  it("GeoJSON throws without lat/lng columns", () => {
    const csv = "name,value\nAlice,10";
    expect(() =>
      flowExportFormats({ csv_content: csv, format: "geojson" }),
    ).toThrow("GeoJSON requires latitude and longitude columns");
  });

  it("exports summary in markdown format", () => {
    const result = flowExportFormats({
      csv_content: testCsv,
      format: "summary",
      title: "Test Summary",
    });
    expect(result.format).toBe("summary");
    expect(result.output).toContain("# Test Summary");
    expect(result.output).toContain("**Rows**: 3");
    expect(result.output).toContain("**Columns**: 5");
    // value column should have numeric stats
    expect(result.output).toContain("(numeric)");
    // name/category should be categorical
    expect(result.output).toContain("(categorical)");
    expect(result.output).toContain("Mean:");
    expect(result.output).toContain("Unique values:");
  });

  it("exports HTML viewer", () => {
    const scatterCsv = "label,category,x_value,y_value,z_value\nA,G1,1,2,3\nB,G2,4,5,6";
    const result = flowExportFormats({
      csv_content: scatterCsv,
      format: "html_viewer",
      title: "Test Viewer",
    });
    expect(result.format).toBe("html_viewer");
    expect(result.output).toContain("<!DOCTYPE html>");
    expect(result.output).toContain("three@0.160.0");
    expect(result.output).toContain("OrbitControls");
    expect(result.output).toContain("Test Viewer");
    expect(result.output).toContain("InstancedMesh");
  });

  it("HTML viewer uses specified columns", () => {
    const csv = "a,b,c,d\n1,2,3,4\n5,6,7,8";
    const result = flowExportFormats({
      csv_content: csv,
      format: "html_viewer",
      options: { x_column: "a", y_column: "b", z_column: "c" },
    });
    expect(result.metadata.format_description).toContain("X: a");
    expect(result.metadata.format_description).toContain("Y: b");
    expect(result.metadata.format_description).toContain("Z: c");
  });

  it("throws on empty CSV", () => {
    expect(() =>
      flowExportFormats({ csv_content: "header_only", format: "json" }),
    ).toThrow("CSV must have header + at least 1 data row");
  });

  it("handles CSV with only numeric columns in summary", () => {
    const csv = "x,y,z\n1,2,3\n4,5,6\n7,8,9";
    const result = flowExportFormats({
      csv_content: csv,
      format: "summary",
    });
    // All columns should be numeric
    expect(result.output).toContain("(numeric)");
    expect(result.output).not.toContain("(categorical)");
    expect(result.output).toContain("Min: 1.00");
    expect(result.output).toContain("Max: 9.00");
  });

  it("JSON handles mixed types correctly", () => {
    const csv = "id,score,name\n1,99.5,Alice\n2,NaN,Bob\n3,,Charlie";
    const result = flowExportFormats({ csv_content: csv, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].score).toBe(99.5);
    expect(parsed[0].name).toBe("Alice");
    expect(typeof parsed[1].score).toBe("string"); // NaN stays as string
    expect(parsed[2].score).toBe(""); // empty stays as string
  });

  it("GeoJSON skips rows with invalid coordinates", () => {
    const csv = "name,lat,lng\nAlice,40.7128,-74.006\nBob,not_a_number,bad\nCharlie,51.5074,-0.1278";
    const result = flowExportFormats({
      csv_content: csv,
      format: "geojson",
      options: { lat_column: "lat", lng_column: "lng" },
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.features).toHaveLength(2); // Bob skipped
  });
});
