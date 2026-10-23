/* Reading links and progress shared by the browser and the regression checks. */
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StoryReaderState = api;
})(typeof window === "object" ? window : globalThis, () => {
  "use strict";

  function routeFromHash(hash) {
    const match = /^#v=(\d+\.\d+)&s=(intro|\d+)(?:&e=(standard|epic))?$/.exec(hash);
    return match ? { id: `v${match[1]}-s${match[2]}`, edition: match[3] || "standard" } : null;
  }

  function hashFor(id, edition = "standard") {
    const match = /^v(\d+\.\d+)-s(intro|\d+)$/.exec(id);
    return match ? `#v=${match[1]}&s=${match[2]}${edition === "epic" ? "&e=epic" : ""}` : "";
  }

  function create(pages) {
    const pageIds = new Set(pages.map(page => page.section.id));
    const epicIds = new Set(pages.filter(page => page.section.editions?.epic).map(page => page.section.id));
    const hasEpic = id => epicIds.has(id);
    const resolveEdition = (id, edition) => edition === "epic" && hasEpic(id) ? "epic" : "standard";
    const visitedFor = (record, edition = record.edition) => edition === "epic" ? record.epicVisited : record.visited;
    const lastPageFor = (record, edition = record.edition) => edition === "epic" ? record.lastEpicPage : record.lastStandardPage;
    const pageCount = edition => edition === "epic" ? epicIds.size : pageIds.size;

    function validateRecord(value) {
      const valid = value?.schema === 1 && Array.isArray(value.visited);
      const source = valid ? value : {};
      const lastPage = pageIds.has(source.lastPage) ? source.lastPage : null;
      return {
        schema: 1,
        lastPage,
        edition: resolveEdition(lastPage, source.edition),
        visited: [...new Set((source.visited || []).filter(id => pageIds.has(id)))],
        epicVisited: [...new Set((Array.isArray(source.epicVisited) ? source.epicVisited : []).filter(hasEpic))],
        lastStandardPage: "lastStandardPage" in source
          ? (pageIds.has(source.lastStandardPage) ? source.lastStandardPage : null)
          : (source.edition === "epic" ? null : lastPage),
        lastEpicPage: "lastEpicPage" in source
          ? (hasEpic(source.lastEpicPage) ? source.lastEpicPage : null)
          : (source.edition === "epic" && hasEpic(lastPage) ? lastPage : null),
        theme: source.theme === "night" ? "night" : "day",
        fontSize: Number.isFinite(source.fontSize) ? Math.max(15, Math.min(24, Math.round(source.fontSize))) : 18,
        lineWidth: Number.isFinite(source.lineWidth) ? Math.max(38, Math.min(72, Math.round(source.lineWidth / 2) * 2)) : 58,
        sidebarCollapsed: source.sidebarCollapsed === true
      };
    }

    function markRead(record, id, requestedEdition) {
      if (!pageIds.has(id)) throw new Error(`Unknown page: ${id}`);
      const edition = resolveEdition(id, requestedEdition);
      const visited = visitedFor(record, edition);
      if (!visited.includes(id)) visited.push(id);
      record.edition = edition;
      record.lastPage = id;
      record[edition === "epic" ? "lastEpicPage" : "lastStandardPage"] = id;
      return edition;
    }

    return { hasEpic, resolveEdition, visitedFor, lastPageFor, pageCount, validateRecord, markRead };
  }

  return { create, routeFromHash, hashFor };
});
