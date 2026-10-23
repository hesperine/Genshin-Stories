const test = require("node:test");
const assert = require("node:assert/strict");
const { create, routeFromHash, hashFor } = require("./reader-state.js");

const pages = [
  { section: { id: "v1.0-s0", editions: { epic: { html: "史诗正文" } } } },
  { section: { id: "v1.0-s1" } },
  { section: { id: "v3.0-sintro" } }
];
const state = create(pages);

test("legacy records keep ordinary progress, resume location, and shared settings", () => {
  const record = state.validateRecord({
    schema: 1, lastPage: "v3.0-sintro", visited: ["v1.0-s0", "v3.0-sintro"],
    theme: "night", fontSize: 21, lineWidth: 64, sidebarCollapsed: true
  });
  assert.deepEqual(record.visited, ["v1.0-s0", "v3.0-sintro"]);
  assert.deepEqual(record.epicVisited, []);
  assert.equal(record.edition, "standard");
  assert.equal(record.lastStandardPage, "v3.0-sintro");
  assert.equal(record.lastEpicPage, null);
  assert.equal(record.theme, "night");
  assert.equal(record.fontSize, 21);
  assert.equal(record.lineWidth, 64);
  assert.equal(record.sidebarCollapsed, true);
});

test("reading an epic page does not mark its ordinary edition as read", () => {
  const record = state.validateRecord(null);
  state.markRead(record, "v1.0-s0", "epic");
  state.markRead(record, "v1.0-s0", "epic");
  assert.deepEqual(record.visited, []);
  assert.deepEqual(record.epicVisited, ["v1.0-s0"]);
  assert.equal(state.lastPageFor(record), "v1.0-s0");
  assert.equal(state.pageCount("epic"), 1);
  assert.equal(state.pageCount("standard"), 3);
  assert.equal(state.validateRecord(JSON.parse(JSON.stringify(record))).lastStandardPage, null);
});

test("both editions survive export and import with their own last-read pages", () => {
  const record = state.validateRecord(null);
  state.markRead(record, "v3.0-sintro", "standard");
  state.markRead(record, "v1.0-s0", "epic");
  const imported = state.validateRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(imported, record);
  assert.equal(state.lastPageFor(imported, "standard"), "v3.0-sintro");
  assert.equal(state.lastPageFor(imported, "epic"), "v1.0-s0");
});

test("an untranslated next page records only the ordinary edition", () => {
  const record = state.validateRecord(null);
  state.markRead(record, "v1.0-s0", "epic");
  assert.equal(state.markRead(record, "v1.0-s1", "epic"), "standard");
  assert.equal(record.edition, "standard");
  assert.deepEqual(record.visited, ["v1.0-s1"]);
  assert.deepEqual(record.epicVisited, ["v1.0-s0"]);
  assert.equal(record.lastEpicPage, "v1.0-s0");
});

test("old numbered and intro links remain ordinary while epic links round-trip", () => {
  assert.deepEqual(routeFromHash("#v=1.0&s=0"), { id: "v1.0-s0", edition: "standard" });
  assert.deepEqual(routeFromHash("#v=3.0&s=intro"), { id: "v3.0-sintro", edition: "standard" });
  assert.equal(hashFor("v3.0-sintro"), "#v=3.0&s=intro");
  assert.equal(hashFor("v1.0-s0", "epic"), "#v=1.0&s=0&e=epic");
  assert.deepEqual(routeFromHash(hashFor("v1.0-s0", "epic")), { id: "v1.0-s0", edition: "epic" });
  assert.equal(routeFromHash("#v=1.0&s=0&e=unknown"), null);
});

test("import filters missing pages and unavailable rewrites", () => {
  const record = state.validateRecord({
    schema: 1, lastPage: "v1.0-s1", edition: "epic",
    visited: ["v1.0-s0", "v1.0-s0", "v9.9-s0"],
    epicVisited: ["v1.0-s0", "v1.0-s1", "v9.9-s0"],
    lastEpicPage: "v1.0-s1", fontSize: 100, lineWidth: -5
  });
  assert.equal(record.edition, "standard");
  assert.deepEqual(record.visited, ["v1.0-s0"]);
  assert.deepEqual(record.epicVisited, ["v1.0-s0"]);
  assert.equal(record.lastEpicPage, null);
  assert.equal(record.fontSize, 24);
  assert.equal(record.lineWidth, 38);
});
