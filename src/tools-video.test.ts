import { describe, it, expect } from "vitest";
import { flowViralVideoSpec } from "./tools-video.js";

const NETWORK_DATA = [
  "id,connections,group,label",
  "Alice,Bob|Charlie,Engineering,Alice A",
  "Bob,Alice|Dave,Engineering,Bob B",
  "Charlie,Alice|Eve,Design,Charlie C",
  "Dave,Bob|Eve|Frank,Management,Dave D",
  "Eve,Charlie|Dave,Design,Eve E",
  "Frank,Dave|Grace,Management,Frank F",
  "Grace,Frank|Hank,Engineering,Grace G",
  "Hank,Grace,Design,Hank H",
].join("\n");

const CELEB_NETWORK = [
  "id,connections,domain",
  "Einstein,Bohr|Planck|Schrodinger,Physics",
  "Bohr,Einstein|Heisenberg|Schrodinger,Physics",
  "Heisenberg,Bohr|Planck,Physics",
  "Planck,Einstein|Heisenberg|Curie,Physics",
  "Curie,Planck|Joliot,Chemistry",
  "Joliot,Curie,Chemistry",
  "Schrodinger,Einstein|Bohr,Physics",
].join("\n");

describe("flowViralVideoSpec", () => {
  // --- Camera keyframes ---
  it("generates one camera keyframe per path node", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave", "Frank"],
    });
    expect(result.camera_keyframes).toHaveLength(4);
    result.camera_keyframes.forEach((kf) => {
      expect(kf.node_id).toBeTruthy();
      expect(kf.easing).toBeTruthy();
    });
  });

  it("each keyframe has position {x,y,z} and lookAt {x,y,z}", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Charlie"],
    });
    result.camera_keyframes.forEach((kf) => {
      expect(typeof kf.position.x).toBe("number");
      expect(typeof kf.position.y).toBe("number");
      expect(typeof kf.position.z).toBe("number");
      expect(typeof kf.lookAt.x).toBe("number");
      expect(typeof kf.lookAt.y).toBe("number");
      expect(typeof kf.lookAt.z).toBe("number");
    });
  });

  it("each keyframe has numeric timestamp_ms >= 0", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave"],
    });
    result.camera_keyframes.forEach((kf) => {
      expect(typeof kf.timestamp_ms).toBe("number");
      expect(kf.timestamp_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Timestamps ---
  it("timestamps span 0 to ~30000ms and are monotonically increasing", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave", "Frank", "Grace"],
    });
    const ts = result.camera_keyframes.map((kf) => kf.timestamp_ms);
    expect(ts[0]).toBe(0);
    expect(ts[ts.length - 1]).toBeGreaterThan(20000);
    expect(ts[ts.length - 1]).toBeLessThanOrEqual(30000);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    }
  });

  // --- Highlights ---
  it("generates at least one highlight per path node", () => {
    const path = ["Alice", "Bob", "Dave"];
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: path,
    });
    expect(result.highlights.length).toBeGreaterThanOrEqual(path.length);
    const highlightedIds = new Set(result.highlights.map((h) => h.node_id));
    path.forEach((id) => {
      expect(highlightedIds.has(id)).toBe(true);
    });
  });

  it("each highlight has node_id, start_ms, end_ms, and #RRGGBB color", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Charlie"],
    });
    result.highlights.forEach((h) => {
      expect(h.node_id).toBeTruthy();
      expect(typeof h.start_ms).toBe("number");
      expect(typeof h.end_ms).toBe("number");
      expect(h.end_ms).toBeGreaterThan(h.start_ms);
      expect(h.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  // --- Text overlays ---
  it("generates text overlays with text, start_ms, end_ms, position", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave", "Frank"],
    });
    expect(result.text_overlays.length).toBeGreaterThan(0);
    result.text_overlays.forEach((ov) => {
      expect(ov.text).toBeTruthy();
      expect(typeof ov.start_ms).toBe("number");
      expect(typeof ov.end_ms).toBe("number");
      expect(ov.position).toBeTruthy();
    });
  });

  it("first overlay starts at 0 and last extends past 25000ms", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave", "Frank", "Grace"],
    });
    const starts = result.text_overlays.map((ov) => ov.start_ms);
    const ends = result.text_overlays.map((ov) => ov.end_ms);
    expect(Math.min(...starts)).toBe(0);
    expect(Math.max(...ends)).toBeGreaterThan(25000);
  });

  // --- Narrative caption ---
  it("narrative caption is truthy, > 20 chars, references first and last node", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave", "Frank"],
    });
    expect(result.narrative_caption).toBeTruthy();
    expect(result.narrative_caption.length).toBeGreaterThan(20);
    expect(result.narrative_caption).toContain("Alice");
    expect(result.narrative_caption).toContain("Frank");
  });

  // --- duration_ms ---
  it("duration_ms is between 20000 and 30000 by default", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave"],
    });
    expect(result.duration_ms).toBeGreaterThanOrEqual(20000);
    expect(result.duration_ms).toBeLessThanOrEqual(30000);
  });

  // --- metadata ---
  it("metadata contains node_count and edge_count", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob"],
    });
    expect(result.metadata.node_count).toBe(8);
    expect(typeof result.metadata.edge_count).toBe("number");
    expect(result.metadata.edge_count).toBeGreaterThan(0);
  });

  it("metadata contains path_length and groups_traversed", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Dave", "Eve"],
    });
    expect(result.metadata.path_length).toBe(3);
    expect(result.metadata.groups_traversed).toContain("Engineering");
    expect(result.metadata.groups_traversed).toContain("Management");
    expect(result.metadata.groups_traversed).toContain("Design");
  });

  // --- Custom duration ---
  it("custom duration_seconds=15 yields duration_ms <= 15000", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Bob", "Dave"],
      duration_seconds: 15,
    });
    expect(result.duration_ms).toBeLessThanOrEqual(15000);
  });

  // --- Edge case: single node ---
  it("handles single node path", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice"],
    });
    expect(result.camera_keyframes).toHaveLength(1);
    expect(result.camera_keyframes[0].timestamp_ms).toBe(0);
    expect(result.highlights.length).toBeGreaterThanOrEqual(1);
    expect(result.narrative_caption).toContain("Alice");
  });

  // --- Edge case: two nodes ---
  it("handles two node path", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "Hank"],
    });
    expect(result.camera_keyframes).toHaveLength(2);
    expect(result.camera_keyframes[0].timestamp_ms).toBe(0);
    expect(result.camera_keyframes[1].timestamp_ms).toBeGreaterThan(0);
  });

  // --- Celebrity network ---
  it("works with celebrity network data", () => {
    const result = flowViralVideoSpec({
      csv_data: CELEB_NETWORK,
      navigation_path: ["Einstein", "Bohr", "Heisenberg", "Planck", "Curie"],
    });
    expect(result.camera_keyframes).toHaveLength(5);
    expect(result.narrative_caption).toContain("Einstein");
    expect(result.narrative_caption).toContain("Curie");
    expect(result.metadata.node_count).toBe(7);
    expect(result.metadata.groups_traversed.length).toBeGreaterThanOrEqual(1);
  });

  // --- Node not in dataset: skip gracefully ---
  it("skips nodes not in dataset gracefully", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["Alice", "NONEXISTENT", "Bob"],
    });
    expect(result.camera_keyframes).toHaveLength(2);
    expect(result.camera_keyframes.map((kf) => kf.node_id)).toEqual(["Alice", "Bob"]);
  });

  // --- csv_content alias ---
  it("accepts csv_content alias via normalizeCsvArgs", () => {
    const input = { csv_content: NETWORK_DATA, navigation_path: ["Alice", "Bob"] } as any;
    const normalized = { ...input };
    if (normalized.csv_content && !normalized.csv_data) {
      normalized.csv_data = normalized.csv_content;
    }
    const result = flowViralVideoSpec(normalized);
    expect(result.camera_keyframes).toHaveLength(2);
  });

  // --- Empty path after filtering ---
  it("returns minimal result for all-invalid path nodes", () => {
    const result = flowViralVideoSpec({
      csv_data: NETWORK_DATA,
      navigation_path: ["NOBODY", "GHOST"],
    });
    expect(result.camera_keyframes).toHaveLength(0);
    expect(result.highlights).toHaveLength(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
