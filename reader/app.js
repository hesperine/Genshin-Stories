(() => {
  "use strict";

  const data = window.GENSHIN_STORY;
  if (!data || data.schema !== 1 || !Array.isArray(data.volumes) || !data.volumes.length) {
    document.getElementById("page-content").textContent = "阅读数据尚未生成。请运行 python reader/build.py。";
    return;
  }

  const volumes = data.volumes;
  const pages = volumes.flatMap(volume => volume.sections.map((section, sectionIndex) => ({ volume, section, sectionIndex })));
  const pageIndex = new Map(pages.map((page, index) => [page.section.id, index]));
  const storageKey = "teyvat-chronicles-reader-v1";
  const $ = id => document.getElementById(id);
  const els = {
    toc: $("toc"), main: $("main"), page: $("page"), content: $("page-content"),
    heading: $("page-heading"), overline: $("page-overline"), volumeHeading: $("volume-heading"),
    volumeLabel: $("volume-label"), pageCounter: $("page-counter"), current: $("pager-current"),
    previous: $("previous-page"), next: $("next-page"), previousLabel: $("previous-label"), nextLabel: $("next-label"),
    sources: $("sources"), sourceContent: $("source-content"), recordStatus: $("record-status"),
    headerProgress: $("header-progress"), scrim: $("scrim"), toast: $("toast")
  };
  const defaults = { schema: 1, lastPage: null, visited: [], theme: "day", fontSize: 18, lineWidth: 58, sidebarCollapsed: false };

  function savedRecord() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null");
      return validateRecord(value);
    } catch { return { ...defaults }; }
  }
  function validateRecord(value) {
    if (!value || value.schema !== 1 || !Array.isArray(value.visited)) return { ...defaults };
    return {
      schema: 1,
      lastPage: pageIndex.has(value.lastPage) ? value.lastPage : null,
      visited: [...new Set(value.visited.filter(id => pageIndex.has(id)))],
      theme: value.theme === "night" ? "night" : "day",
      fontSize: Number.isFinite(value.fontSize) ? Math.max(15, Math.min(24, Math.round(value.fontSize))) : 18,
      lineWidth: Number.isFinite(value.lineWidth) ? Math.max(38, Math.min(72, Math.round(value.lineWidth / 2) * 2)) : 58,
      sidebarCollapsed: value.sidebarCollapsed === true
    };
  }
  let record = savedRecord();
  let visited = new Set(record.visited);
  let currentId = null;
  let sessionResumeId = record.lastPage;
  let expandedGroups = new Set();
  let toastTimer;

  function save() {
    record.visited = [...visited];
    try { localStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Private browsing may disable storage. */ }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function hasReadVolume(volume) { return volume.sections.some(section => visited.has(section.id)); }
  function isMobile() { return matchMedia("(max-width: 800px)").matches; }
  function routeId() {
    const match = /^#v=(\d+\.\d+)&s=(intro|\d+)$/.exec(location.hash);
    return match ? `v${match[1]}-s${match[2]}` : null;
  }
  function hashFor(id) {
    const match = /^v(\d+\.\d+)-s(intro|\d+)$/.exec(id);
    return match ? `#v=${match[1]}&s=${match[2]}` : "";
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
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
          const unlocked = visited.has(section.id);
          const label = unlocked ? section.title : `第 ${index + 1} 节 · 未读`;
          return `<button class="section-button ${section.id === currentId ? "active" : ""}" type="button" data-page="${escapeHtml(section.id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
        }).join("")}</div>` : "";
        return `<div class="volume-item"><button class="volume-button ${active ? "active" : ""}" type="button" data-page="${escapeHtml(volume.sections[0].id)}" aria-current="${active ? "page" : "false"}"><span class="volume-num">${escapeHtml(volume.version)}</span><span class="volume-title">${escapeHtml(title)}</span></button>${sectionMarkup}</div>`;
      }).join("");
      return `<div class="toc-group"><button class="group-toggle ${open ? "active" : ""}" type="button" data-group="${major}" aria-expanded="${open}"><span class="group-chevron">${open ? "⌄" : "›"}</span>${major}.x　·　${groupVolumes.length} 篇</button>${open ? `<div class="group-content">${volumeMarkup}</div>` : ""}</div>`;
    }).join("");
  }
  function updateRecordSummary() {
    const read = visited.size;
    els.recordStatus.textContent = `已读 ${read} / ${pages.length} 页${record.lastPage ? ` · 最近 ${pages[pageIndex.get(record.lastPage)].volume.version}` : ""}`;
    els.headerProgress.textContent = `${read} / ${pages.length} 页`;
    $("resume").disabled = !sessionResumeId;
  }
  function safeLabel(page, fallback) {
    return page && visited.has(page.section.id) ? page.section.title : fallback;
  }
  function showPage(id) {
    if (!pageIndex.has(id) || currentId === id) return;
    const index = pageIndex.get(id);
    const { volume, section, sectionIndex } = pages[index];
    currentId = id;
    visited.add(id);
    record.lastPage = id;
    expandedGroups.add(volume.major);
    save();

    const readingTime = section.readingMinutes ? `　·　约 ${section.readingMinutes} 分钟` : "";
    els.overline.textContent = `版本 ${volume.version}${readingTime}`;
    els.heading.textContent = section.title;
    els.volumeHeading.textContent = volume.title;
    els.volumeHeading.hidden = section.title === volume.title;
    els.content.innerHTML = section.html;
    els.volumeLabel.textContent = `${volume.major}.x / ${volume.version}`;
    els.pageCounter.textContent = `第 ${sectionIndex + 1} / ${volume.sections.length} 节`;
    els.current.textContent = `${index + 1} / ${pages.length}`;
    document.title = `${section.title}｜${volume.version}｜原神剧情编年`;

    const previous = pages[index - 1];
    const next = pages[index + 1];
    els.previous.disabled = !previous;
    els.next.disabled = !next;
    els.previousLabel.textContent = safeLabel(previous, "上一版本");
    els.nextLabel.textContent = safeLabel(next, next && next.volume.version !== volume.version ? `版本 ${next.volume.version}` : "下一节");
    els.sources.hidden = !(sectionIndex === volume.sections.length - 1 && volume.sources);
    els.sources.open = false;
    els.sourceContent.innerHTML = volume.sources;
    els.content.querySelectorAll("a[href^='http']").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
    els.sourceContent.querySelectorAll("a[href^='http']").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
    renderToc();
    updateRecordSummary();
    els.main.scrollTo({ top: 0, behavior: "instant" });
    if (isMobile()) setMobileSidebar(false);
  }
  function navigate(id) {
    if (!pageIndex.has(id)) return;
    showPage(id);
    const hash = hashFor(id);
    if (location.hash !== hash) location.hash = hash;
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
  $("resume").addEventListener("click", () => sessionResumeId && navigate(sessionResumeId));
  $("export-record").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ ...record, visited: [...visited] }, null, 2)], { type: "application/json" });
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
      record = validateRecord(raw);
      visited = new Set(record.visited);
      sessionResumeId = record.lastPage;
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
  window.addEventListener("hashchange", () => { const id = routeId(); if (id) showPage(id); });
  window.addEventListener("resize", () => { if (!isMobile()) setMobileSidebar(false); });

  $("volume-count").textContent = `${volumes.length} 篇`;
  applySettings();
  const initialId = pageIndex.has(routeId()) ? routeId() : pageIndex.has(record.lastPage) ? record.lastPage : pages[0].section.id;
  showPage(initialId);
  if (!location.hash || !pageIndex.has(routeId())) {
    try { history.replaceState(null, "", hashFor(initialId)); } catch { /* file:// may restrict History API. */ }
  }
})();
