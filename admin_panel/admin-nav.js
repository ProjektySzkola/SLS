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
    rozstawienie:       () => { loadRozstawienie(); srApplyFormatConstraints(); },
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
   ROZSTAWIENIE — ograniczenia formatu turnieju
   Blokuje zakładkę "Puchar" gdy dyscyplina nie ma pucharu wg ustawień.
════════════════════════════════════════════════════════════════════════════ */
let _srFmtCache = null; // cache formatu aby nie pobierać wielokrotnie

async function srApplyFormatConstraints() {
  // Załaduj format jeśli jeszcze nie w cache
  if (!_srFmtCache) {
    _srFmtCache = await api("/tournament-format");
  }
  const fmtList = _srFmtCache;
  if (!fmtList) return;

  // Zbuduj mapę disc → format
  const fmtMap = {};
  if (Array.isArray(fmtList)) {
    fmtList.forEach(f => { if (f.discipline) fmtMap[f.discipline] = f; });
  } else if (typeof fmtList === "object") {
    Object.assign(fmtMap, fmtList);
  }

  function applyConstraintForDisc(disc) {
    const fmt    = fmtMap[disc] || {};
    const hasCup = !!(fmt.has_cup);
    const cupTab  = $("sr-cup-tab");
    const cupHint = $("sr-cup-hint");
    const ligatab = document.querySelector('.sr-type-tab[data-type="liga"]');

    if (!cupTab) return;

    if (!hasCup) {
      // Puchar wyłączony — zablokuj przycisk i przełącz na ligę
      cupTab.disabled = true;
      cupTab.classList.add("sr-type-tab--disabled");
      cupHint?.classList.remove("hidden");
      // Jeśli aktualnie wybrana zakładka to puchar — przełącz na ligę
      if (cupTab.classList.contains("active")) {
        cupTab.classList.remove("active");
        ligatab?.classList.add("active");
        ligatab?.click();
      }
    } else {
      // Puchar aktywny — odblokuj
      cupTab.disabled = false;
      cupTab.classList.remove("sr-type-tab--disabled");
      cupHint?.classList.add("hidden");
    }
  }

  // Zastosuj dla aktualnie wybranej dyscypliny
  const activeDiscTab = document.querySelector(".sr-disc-tab.active");
  const currentDisc   = activeDiscTab?.dataset.disc || "Piłka Nożna";
  applyConstraintForDisc(currentDisc);

  // Nasłuchuj zmiany dyscypliny — podepnij event delegation na kontenerze
  const discTabs = $("sr-disc-tabs");
  if (discTabs && !discTabs._fmtListenerAdded) {
    discTabs._fmtListenerAdded = true;
    discTabs.addEventListener("click", e => {
      const tab = e.target.closest(".sr-disc-tab");
      if (tab) applyConstraintForDisc(tab.dataset.disc);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   DB STATUS
════════════════════════════════════════════════════════════════════════════ */
async function checkStatus() {
  const els = [$("db-status"), $("db-status-mobile")].filter(Boolean);
  try {
    const { error } = await supabase.from("tournament_settings").select("key").limit(1);
    const ok = !error;
    els.forEach(e => {
      e.textContent = ok ? "● Online" : "● Błąd";
      e.className   = `db-status ${ok ? "ok" : "error"}`;
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