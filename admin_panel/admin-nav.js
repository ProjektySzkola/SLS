/* ════════════════════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════════════════ */
const VIEWS = ["dashboard","turniej","druzyny","rozstawienie","rozgrywki","sedziowie","mecze","protokoly","sport-football","sport-basketball","sport-volleyball","ranking"];

function navigate(viewName) {
  VIEWS.forEach(v => {
    const s = $(`view-${v}`);
    if (s) s.classList.toggle("active", v === viewName);
  });
  document.querySelectorAll(".nav-btn[data-view]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.view === viewName)
  );
  closeSidebar();
  const loaders = {
    dashboard:          () => loadDashboard(),
    druzyny:            () => loadAdminTeams(),
    turniej:            () => loadTurniej(),
    rozstawienie:       () => loadRozstawienie(),
    rozgrywki:          () => loadPlanowanie(),
    sedziowie:          () => loadSedziowie(),
    mecze:              () => loadMecze(),
    "sport-football":   () => loadSportView("Piłka Nożna"),
    "sport-basketball": () => loadSportView("Koszykówka"),
    "sport-volleyball": () => loadSportView("Siatkówka"),
    ranking:            () => loadRankingView(),
  };
  loaders[viewName]?.();
}

document.querySelectorAll(".nav-btn[data-view]").forEach(btn =>
  btn.addEventListener("click", () => navigate(btn.dataset.view))
);

/* ════════════════════════════════════════════════════════════════════════════
   MOBILE SIDEBAR
════════════════════════════════════════════════════════════════════════════ */
function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebar-overlay").classList.remove("hidden");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").classList.add("hidden");
}

$("hamburger").addEventListener("click", openSidebar);
$("sidebar-overlay").addEventListener("click", closeSidebar);

/* ════════════════════════════════════════════════════════════════════════════
   NAVIGATE TO MATCH — otwiera zakładkę Mecze i wybiera konkretny mecz
════════════════════════════════════════════════════════════════════════════ */
async function navigateToMatch(matchId) {
  // Najpierw przełącz widok (bez resetowania zaznaczenia)
  VIEWS.forEach(v => {
    const s = $(`view-${v}`);
    if (s) s.classList.toggle("active", v === "mecze");
  });
  document.querySelectorAll(".nav-btn[data-view]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.view === "mecze")
  );
  closeSidebar();

  // Załaduj listę meczów (jeśli jeszcze nie załadowana lub matchId nie istnieje)
  const alreadyLoaded = MZ.allMatches && MZ.allMatches.length > 0;
  if (!alreadyLoaded) {
    await loadMecze();
  } else {
    // Upewnij się że lista jest wyrenderowana (mogła być schowana)
    mzRenderList();
    mzBindFilters();
    $("mz-detail")?.classList.add("hidden");
    $("mz-empty-state")?.classList.remove("hidden");
  }

  // Wyczyść filtry żeby mecz był widoczny
  MZ.filterStatus = "all";
  MZ.filterDisc   = "all";
  MZ.searchText   = "";
  mzRenderList();

  // Podświetl kartę meczu i otwórz szczegóły
  await mzOpenDetail(matchId);

  // Przewiń kartę meczu do widoku
  requestAnimationFrame(() => {
    const card = document.querySelector(`.mz-match-card[data-id="${matchId}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DB STATUS
════════════════════════════════════════════════════════════════════════════ */
async function checkStatus() {
  const els = [$("db-status"), $("db-status-mobile")].filter(Boolean);
  try {
    const r = await fetch(`${API}/status`);
    const d = await r.json();
    els.forEach(e => {
      e.textContent = d.ok ? "● Online" : "● Błąd";
      e.className   = `db-status ${d.ok ? "ok" : "error"}`;
    });
  } catch {
    els.forEach(e => {
      e.textContent = "● Offline";
      e.className   = "db-status error";
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THEME TOGGLE — jasny / ciemny motyw zapisywany w localStorage
════════════════════════════════════════════════════════════════════════════ */
(function initTheme() {
  const STORAGE_KEY = "admin-theme";
  const saved = localStorage.getItem(STORAGE_KEY);
  // domyślnie ciemny — aplikuj jasny tylko jeśli zapisano "light"
  if (saved === "light") {
    document.body.classList.add("theme-light");
  }

  function updateLabel() {
    const isLight = document.body.classList.contains("theme-light");
    const btn = document.getElementById("theme-toggle-label");
    if (btn) btn.textContent = isLight ? "☀️ Jasny motyw" : "🌙 Ciemny motyw";
  }

  updateLabel();

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("theme-light");
    localStorage.setItem(STORAGE_KEY, isLight ? "light" : "dark");
    updateLabel();
  });
})();