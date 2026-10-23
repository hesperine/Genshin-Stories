(() => {
  "use strict";

  const data = window.GENSHIN_STORY;
  const stateApi = window.StoryReaderState;
  if (!stateApi || !data || data.schema !== 1 || !Array.isArray(data.volumes) || !data.volumes.length) {
    document.getElementById("page-content").textContent = "阅读器文件尚未完整加载，请刷新页面或重新打开。";
    return;
  }

  const volumes = data.volumes;
  const pages = volumes.flatMap(volume => volume.sections.map((section, sectionIndex) => ({ volume, section, sectionIndex })));
  const pageIndex = new Map(pages.map((page, index) => [page.section.id, index]));
  const readerState = stateApi.create(pages);
  const sampleId = pages.find(page => readerState.hasEpic(page.section.id))?.section.id;
  const editionLabels = { standard: "普通版", epic: "史诗版" };
  const storageKey = "teyvat-chronicles-reader-v1";
  const $ = id => document.getElementById(id);
  const els = {
    toc: $("toc"), main: $("main"), page: $("page"), content: $("page-content"),
    heading: $("page-heading"), overline: $("page-overline"), volumeHeading: $("volume-heading"),
    volumeLabel: $("volume-label"), pageCounter: $("page-counter"), current: $("pager-current"),
    previous: $("previous-page"), next: $("next-page"), previousLabel: $("previous-label"), nextLabel: $("next-label"),
    sources: $("sources"), sourceContent: $("source-content"), recordStatus: $("record-status"),
    sourcesLabel: $("sources-label"), standard: $("edition-standard"), epic: $("edition-epic"),
    editionNote: $("edition-note"), sampleLink: $("sample-link"),
    headerProgress: $("header-progress"), scrim: $("scrim"), toast: $("toast")
  };
  function savedRecord() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null");
      return readerState.validateRecord(value);
    } catch { return readerState.validateRecord(null); }
  }
  let record = savedRecord();
  let currentId = null;
  let sessionResumeIds = { standard: record.lastStandardPage, epic: record.lastEpicPage };
  let expandedGroups = new Set();
  let toastTimer;

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Private browsing may disable storage. */ }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function hasReadPage(id) { return record.visited.includes(id) || record.epicVisited.includes(id); }
  function hasReadVolume(volume) { return volume.sections.some(section => hasReadPage(section.id)); }
  function isMobile() { return matchMedia("(max-width: 800px)").matches; }
  function clearToast() {
    clearTimeout(toastTimer);
    els.toast.classList.remove("show");
    els.toast.textContent = "";
  }
  function toast(message) {
    clearToast();
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(clearToast, 3200);
  }

  function applySettings() {
    document.body.dataset.theme = record.theme;
    document.documentElement.style.setProperty("--font-size", `${record.fontSize}px`);
    document.documentElement.style.setProperty("--measure", `${record.lineWidth}ch`);
    $("font-size").value = String(record.fontSize);
    $("line-width").value = String(record.lineWidth);
    $("line-width-value").value = `${record.lineWidth} 字`;
    $("day-mode").classList.toggle("selected", record.theme === "day");
    $("night-mode").classList.toggle("selected", record.theme === "night");
    $("day-mode").setAttribute("aria-pressed", String(record.theme === "day"));
    $("night-mode").setAttribute("aria-pressed", String(record.theme === "night"));
    $("theme-toggle").textContent = record.theme === "day" ? "☾" : "☀";
    document.querySelector(".shell").classList.toggle("sidebar-collapsed", record.sidebarCollapsed);
    $("toggle-sidebar").setAttribute("aria-expanded", String(!record.sidebarCollapsed));
  }
  function setTheme(theme) { record.theme = theme; applySettings(); save(); }
  function setMobileSidebar(open) {
    document.body.classList.toggle("mobile-sidebar-open", open);
    els.scrim.hidden = !open;
    if (isMobile()) $("toggle-sidebar").setAttribute("aria-expanded", String(open));
  }

  function renderToc() {
    const current = pages[pageIndex.get(currentId)];
    const groups = new Map();
    for (const volume of volumes) {
      if (!groups.has(volume.major)) groups.set(volume.major, []);
      groups.get(volume.major).push(volume);
    }
    els.toc.innerHTML = [...groups].map(([major, groupVolumes]) => {
      const open = expandedGroups.has(major);
      const volumeMarkup = groupVolumes.map(volume => {
        const active = current.volume.version === volume.version;
        const read = hasReadVolume(volume);
        const title = read ? volume.title : "未读版本";
        const sectionMarkup = active ? `<div class="section-list">${volume.sections.map((section, index) => {
          const unlocked = hasReadPage(section.id);
          const label = unlocked ? section.title : `第 ${index + 1} 节 · 未读`;
          return `<button class="section-button ${section.id === currentId ? "active" : ""}" type="button" data-page="${escapeHtml(section.id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
        }).join("")}</div>` : "";
        return `<div class="volume-item"><button class="volume-button ${active ? "active" : ""}" type="button" data-page="${escapeHtml(volume.sections[0].id)}" aria-current="${active ? "page" : "false"}"><span class="volume-num">${escapeHtml(volume.version)}</span><span class="volume-title">${escapeHtml(title)}</span></button>${sectionMarkup}</div>`;
      }).join("");
      return `<div class="toc-group"><button class="group-toggle ${open ? "active" : ""}" type="button" data-group="${major}" aria-expanded="${open}"><span class="group-chevron">${open ? "⌄" : "›"}</span>${major}.x　·　${groupVolumes.length} 篇</button>${open ? `<div class="group-content">${volumeMarkup}</div>` : ""}</div>`;
    }).join("");
  }
  function updateRecordSummary() {
    const read = readerState.visitedFor(record).length;
    const total = readerState.pageCount(record.edition);
    const lastPage = readerState.lastPageFor(record);
    els.recordStatus.textContent = `${editionLabels[record.edition]}已读 ${read} / ${total} 页${lastPage ? ` · 最近 ${pages[pageIndex.get(lastPage)].volume.version}` : ""}`;
    els.headerProgress.textContent = `${read} / ${total} 页`;
    $("resume").disabled = !sessionResumeIds[record.edition];
  }
  function safeLabel(page, fallback) {
    return page && hasReadPage(page.section.id) ? page.section.title : fallback;
  }
  function showPage(id, requestedEdition = record.edition) {
    if (!pageIndex.has(id)) return;
    const edition = readerState.resolveEdition(id, requestedEdition);
    if (currentId === id && record.edition === edition) return;
    clearToast();
    const switchedToStandard = currentId && requestedEdition === "epic" && edition === "standard";
    const index = pageIndex.get(id);
    const { volume, section, sectionIndex } = pages[index];
    const body = edition === "epic" ? section.editions.epic : section;
    currentId = id;
    readerState.markRead(record, id, edition);
    expandedGroups.add(volume.major);
    save();

    const readingTime = body.readingMinutes ? `　·　约 ${body.readingMinutes} 分钟` : "";
    els.overline.textContent = `版本 ${volume.version}　·　${editionLabels[edition]}${readingTime}`;
    els.heading.textContent = section.title;
    els.volumeHeading.textContent = volume.title;
    els.volumeHeading.hidden = section.title === volume.title;
    els.content.innerHTML = body.html;
    els.volumeLabel.textContent = `${volume.major}.x / ${volume.version}`;
    els.pageCounter.textContent = `第 ${sectionIndex + 1} / ${volume.sections.length} 节`;
    els.current.textContent = `${index + 1} / ${pages.length}`;
    document.title = `${section.title}｜${editionLabels[edition]}｜${volume.version}｜原神剧情编年`;

    for (const [name, button] of [["standard", els.standard], ["epic", els.epic]]) {
      button.classList.toggle("selected", edition === name);
      button.setAttribute("aria-pressed", String(edition === name));
    }
    els.epic.disabled = !readerState.hasEpic(id);
    els.editionNote.textContent = readerState.hasEpic(id) ? "本节可切换普通版与史诗版" : "本节史诗版待改写";
    els.sampleLink.hidden = readerState.hasEpic(id) || !sampleId;

    const previous = pages[index - 1];
    const next = pages[index + 1];
    els.previous.disabled = !previous;
    els.next.disabled = !next;
    els.previousLabel.textContent = safeLabel(previous, "上一版本");
    els.nextLabel.textContent = safeLabel(next, next && next.volume.version !== volume.version ? `版本 ${next.volume.version}` : "下一节");
    const sources = body.sources || volume.sources;
    els.sources.hidden = !(sources && (edition === "epic" || sectionIndex === volume.sections.length - 1));
    els.sources.open = false;
    els.sourceContent.innerHTML = sources;
    els.sourcesLabel.textContent = edition === "epic" ? "本页资料与改写说明" : "本版本资料来源";
    els.content.querySelectorAll("a[href^='http']").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
    els.sourceContent.querySelectorAll("a[href^='http']").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
    renderToc();
    updateRecordSummary();
    els.main.scrollTo({ top: 0, behavior: "instant" });
    if (isMobile()) setMobileSidebar(false);
    if (switchedToStandard) toast("本节史诗版待改写，已切换为普通版");
  }
  function navigate(id, edition = record.edition) {
    if (!pageIndex.has(id)) return;
    showPage(id, edition);
    const hash = stateApi.hashFor(id, record.edition);
    if (location.hash !== hash) location.hash = hash;
  }
  function normalizeRoute() {
    const hash = stateApi.hashFor(currentId, record.edition);
    if (location.hash !== hash) {
      try { history.replaceState(null, "", hash); } catch { /* file:// may restrict History API. */ }
    }
  }
  function step(direction) {
    const index = pageIndex.get(currentId) + direction;
    if (index >= 0 && index < pages.length) navigate(pages[index].section.id);
  }

  els.toc.addEventListener("click", event => {
    const groupButton = event.target.closest("[data-group]");
    if (groupButton) {
      const major = Number(groupButton.dataset.group);
      if (expandedGroups.has(major)) expandedGroups.delete(major); else expandedGroups.add(major);
      renderToc();
      return;
    }
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) navigate(pageButton.dataset.page);
  });
  els.previous.addEventListener("click", () => step(-1));
  els.next.addEventListener("click", () => step(1));
  els.standard.addEventListener("click", () => navigate(currentId, "standard"));
  els.epic.addEventListener("click", () => navigate(currentId, "epic"));
  els.sampleLink.addEventListener("click", () => sampleId && navigate(sampleId, "epic"));
  $("toggle-sidebar").addEventListener("click", () => {
    if (isMobile()) setMobileSidebar(!document.body.classList.contains("mobile-sidebar-open"));
    else { record.sidebarCollapsed = !record.sidebarCollapsed; applySettings(); save(); }
  });
  $("close-sidebar").addEventListener("click", () => setMobileSidebar(false));
  els.scrim.addEventListener("click", () => setMobileSidebar(false));
  $("theme-toggle").addEventListener("click", () => setTheme(record.theme === "day" ? "night" : "day"));
  $("day-mode").addEventListener("click", () => setTheme("day"));
  $("night-mode").addEventListener("click", () => setTheme("night"));
  $("font-smaller").addEventListener("click", () => { record.fontSize = Math.max(15, record.fontSize - 1); applySettings(); save(); });
  $("font-larger").addEventListener("click", () => { record.fontSize = Math.min(24, record.fontSize + 1); applySettings(); save(); });
  $("line-width").addEventListener("input", event => { record.lineWidth = Number(event.target.value); applySettings(); save(); });
  $("resume").addEventListener("click", () => {
    const id = sessionResumeIds[record.edition];
    if (id) navigate(id);
  });
  $("export-record").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "原神剧情编年-阅读记录.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("阅读记录已导出");
  });
  $("import-record").addEventListener("click", () => $("record-file").click());
  $("record-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (raw.schema !== 1 || !Array.isArray(raw.visited)) throw new Error("format");
      record = readerState.validateRecord(raw);
      sessionResumeIds = { standard: record.lastStandardPage, epic: record.lastEpicPage };
      applySettings();
      currentId = null;
      navigate(record.lastPage || pages[0].section.id);
      save();
      toast("阅读记录已导入");
    } catch { toast("无法导入：请选择阅读器导出的 JSON 记录"); }
    event.target.value = "";
  });
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    if (event.key === "Escape") setMobileSidebar(false);
  });
  let touchStart = null;
  els.main.addEventListener("touchstart", event => {
    if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  els.main.addEventListener("touchend", event => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    touchStart = null;
  }, { passive: true });
  window.addEventListener("hashchange", () => {
    const route = stateApi.routeFromHash(location.hash);
    if (route) { showPage(route.id, route.edition); normalizeRoute(); }
  });
  window.addEventListener("resize", () => { if (!isMobile()) setMobileSidebar(false); });

  $("volume-count").textContent = `${volumes.length} 篇`;
  applySettings();
  const route = stateApi.routeFromHash(location.hash);
  const hasRoute = route && pageIndex.has(route.id);
  const initialId = hasRoute ? route.id : record.lastPage || pages[0].section.id;
  showPage(initialId, hasRoute ? route.edition : record.edition);
  normalizeRoute();
})();
