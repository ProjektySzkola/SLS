/* ════════════════════════════════════════════════════════════════════════════
   MECZE — lista + szczegóły + PDF + LIVE + uzupełnianie protokołu
════════════════════════════════════════════════════════════════════════════ */

const MZ = {
  allMatches: [],
  filterStatus: "all",
  filterDisc: "all",
  filterDate: "",
  searchText: "",
  currentMatch: null,
  currentMatchData: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mzToast(msg, type = "ok") {
  const t = $("toast-mz");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast--${type}`;
  t.classList.remove("hidden");
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.add("hidden"), 3000);
}

function hasShootout(m) {
  return m.shootout_t1 != null && m.shootout_t2 != null;
}

function mzFmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pl-PL", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
}

function mzStatusBadge(status) {
  const map = {
    "Planowany": { cls: "badge--planned", label: "📅 Planowany" },
    "Rozegrany": { cls: "badge--played",  label: "✅ Rozegrany" },
    "Odwołany":  { cls: "badge--cancelled", label: "❌ Odwołany" },
    "Walkower":  { cls: "badge--walkover", label: "🏳 Walkower" },
  };
  const s = map[status] || { cls: "", label: status };
  return `<span class="mz-badge ${s.cls}">${s.label}</span>`;
}

function mzDiscIcon(disc) {
  return DISC_EMOJI[disc] || "🏅";
}

function mzLiveUrl(match) {
  const map = {
    "Piłka Nożna": "../protokoly/football.html",
    "Koszykówka":  "../protokoly/basketball.html",
    "Siatkówka":   "../protokoly/volleyball.html",
  };
  const base = map[match.discipline];
  if (!base) return null;
  return `${base}?match_id=${match.id}`;
}

// ── Volleyball extended-data helpers ─────────────────────────────────────────
// Extended notes are stored in referee_notes as JSON.
// Volleyball:  { __vb: {...}, notes_text: "..." }
// Football:    { __fb: {...}, notes_text: "..." }
// Basketball:  { __bk: {...}, notes_text: "..." }
// Legacy plain text: treated as notes_text, no ext.

function vbParseExtended(notesStr) {
  if (!notesStr) return { notes_text: "", ext: {} };
  try {
    const obj = JSON.parse(notesStr);
    if (obj && typeof obj === "object") {
      return {
        notes_text: obj.notes_text || "",
        ext: obj.__vb || obj.__fb || obj.__bk || {},
      };
    }
  } catch {}
  return { notes_text: notesStr, ext: {} };
}

function vbSerializeExtended(notesText, ext) {
  return JSON.stringify({ notes_text: notesText, __vb: ext });
}

// Roman numeral helper for sets
const ROMAN = ["I", "II", "III", "IV", "V"];

// ── Load list ─────────────────────────────────────────────────────────────────

async function loadMecze() {
  const listEl = $("mz-match-list");
  if (!listEl) return;

  $("mz-detail")?.classList.add("hidden");
  $("mz-empty-state")?.classList.remove("hidden");

  listEl.innerHTML = `<div class="panel-loading">Ładowanie meczów…</div>`;

  const { data, error: _e0 } = await supabase.from("matches_full").select("*").order("match_date", { ascending: true });
  if (_e0) console.warn(_e0);
  if (!data) {
    listEl.innerHTML = `<div class="panel-loading">Błąd ładowania danych.</div>`;
    return;
  }

  MZ.allMatches = data;
  mzRenderList();
  mzBindFilters();
}

function mzFilteredMatches() {
  return MZ.allMatches.filter(m => {
    if (MZ.filterStatus !== "all" && m.status !== MZ.filterStatus) return false;
    if (MZ.filterDisc !== "all" && m.discipline !== MZ.filterDisc) return false;
    if (MZ.filterDate) {
      const md = m.match_date ? m.match_date.slice(0, 10) : "";
      if (md !== MZ.filterDate) return false;
    }
    if (MZ.searchText) {
      const q = MZ.searchText.toLowerCase();
      const hay = `${m.team1_name} ${m.team2_name} ${m.location || ""} ${m.discipline}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function mzRenderList() {
  const listEl = $("mz-match-list");
  if (!listEl) return;
  const matches = mzFilteredMatches();

  if (!matches.length) {
    listEl.innerHTML = `<div class="mz-empty">Brak meczów spełniających kryteria.</div>`;
    return;
  }

  const groups = {};
  matches.forEach(m => {
    const key = m.match_date || "—";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  listEl.innerHTML = Object.entries(groups).map(([date, list]) => `
    <div class="mz-group">
      <div class="mz-group-label">${mzFmtDate(date)}</div>
      ${list.map(m => `
        <div class="mz-match-card" data-id="${m.id}" tabindex="0" role="button">
          <div class="mz-mc-disc">${mzDiscIcon(m.discipline)}</div>
          <div class="mz-mc-body">
            <div class="mz-mc-teams">
              <span class="mz-mc-team">${m.team1_name}</span>
              <span class="mz-mc-vs">
                ${m.status === "Rozegrany"
                  ? `<strong>${fmtScore(m)}</strong>`
                  : `<span class="mz-mc-time">${m.match_time ? m.match_time.slice(0,5) : "—:—"}</span>`}
              </span>
              <span class="mz-mc-team">${m.team2_name}</span>
            </div>
            <div class="mz-mc-meta">
              ${mzStatusBadge(m.status)}
              ${m.location ? `<span class="mz-mc-loc">📍 ${m.location}</span>` : ""}
              <span class="mz-mc-disc-tag">${m.discipline}</span>
            </div>
          </div>
          <div class="mz-mc-arrow">›</div>
        </div>
      `).join("")}
    </div>
  `).join("");

  listEl.querySelectorAll(".mz-match-card").forEach(card => {
    card.addEventListener("click", () => mzOpenDetail(Number(card.dataset.id)));
    card.addEventListener("keydown", e => { if (e.key === "Enter") mzOpenDetail(Number(card.dataset.id)); });
  });
}

function mzBindFilters() {
  const search = $("mz-search");
  if (search) {
    search.value = MZ.searchText;
    search.oninput = () => { MZ.searchText = search.value.trim(); mzRenderList(); };
  }

  // ── Filtr daty ─────────────────────────────────────────────────────────
  const dateInput = $("mz-date-filter");
  const dateClear = $("mz-date-clear");
  const dateWrap  = dateInput?.closest(".mz-date-filter-wrap");

  if (dateInput) {
    dateInput.value = MZ.filterDate;
    if (MZ.filterDate) dateWrap?.classList.add("has-value");

    dateInput.onchange = () => {
      MZ.filterDate = dateInput.value;
      dateWrap?.classList.toggle("has-value", !!dateInput.value);
      mzRenderList();
    };
  }
  if (dateClear) {
    dateClear.onclick = () => {
      MZ.filterDate = "";
      if (dateInput) dateInput.value = "";
      dateWrap?.classList.remove("has-value");
      mzRenderList();
    };
  }

  // ── Filtry status ───────────────────────────────────────────────────────
  document.querySelectorAll("#mz-chips .mz-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mz-chips .mz-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      MZ.filterStatus = btn.dataset.status;
      mzRenderList();
    });
  });

  document.querySelectorAll("#mz-disc-chips .mz-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mz-disc-chips .mz-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      MZ.filterDisc = btn.dataset.disc;
      mzRenderList();
    });
  });

  // ── Toggle: ukryj / pokaż listę ────────────────────────────────────────
  const hideBtn = $("mz-hide-list-btn");
  const showBtn = $("mz-show-list-btn");
  const colLeft = $("mz-col-left");

  function setListVisible(visible) {
    if (!colLeft) return;
    colLeft.classList.toggle("collapsed", !visible);
    if (showBtn) showBtn.classList.toggle("hidden", visible);
    // persist across re-renders via sessionStorage
    try { sessionStorage.setItem("mz_list_visible", visible ? "1" : "0"); } catch {}
  }

  // Restore saved state
  try {
    const saved = sessionStorage.getItem("mz_list_visible");
    if (saved === "0") setListVisible(false);
  } catch {}

  if (hideBtn) hideBtn.onclick = () => setListVisible(false);
  if (showBtn) showBtn.onclick = () => setListVisible(true);
}

// ── Detail view ───────────────────────────────────────────────────────────────

async function mzOpenDetail(matchId) {
  $("mz-empty-state")?.classList.add("hidden");
  const detailEl = $("mz-detail");
  detailEl.classList.remove("hidden");

  // Na mobile (< 900px) automatycznie ukryj listę po wybraniu meczu
  if (window.innerWidth <= 900) {
    const colLeft = $("mz-col-left");
    const showBtn = $("mz-show-list-btn");
    if (colLeft) colLeft.classList.add("collapsed");
    if (showBtn) showBtn.classList.remove("hidden");
    try { sessionStorage.setItem("mz_list_visible", "0"); } catch {}
  }

  $("mz-action-btns")?.classList.remove("hidden");
  $("mz-pdf-panel")?.classList.add("hidden");
  $("mz-fill-panel")?.classList.add("hidden");

  document.querySelectorAll(".mz-match-card").forEach(c =>
    c.classList.toggle("active", Number(c.dataset.id) === matchId));

  $("mz-detail-header").innerHTML = `<div class="panel-loading">Ładowanie…</div>`;
  $("mz-detail-info").innerHTML = "";

  const [matchRes, setsRes, psRes, tsRes] = await Promise.all([
    supabase.from("matches_full").select("*").eq("id", matchId).single(),
    supabase.from("match_periods").select("*").eq("match_id", matchId).order("set_number", { ascending: true }),
    supabase.from("player_stats_full").select("*").eq("match_id", matchId),
    supabase.from("match_team_stats").select("*").eq("match_id", matchId),
  ]);
  const data = matchRes.error ? null : {
    match: matchRes.data, sets: setsRes.data || [], playerStats: psRes.data || [], teamStats: tsRes.data || []
  };
  if (!data || matchRes.error) {
    $("mz-detail-header").innerHTML = `<div class="mz-empty">Błąd ładowania danych meczu.</div>`;
    return;
  }

  MZ.currentMatch = data.match;
  MZ.currentMatchData = data;

  mzRenderDetailHeader(data);
  mzBindDetailButtons(data);
}

function mzRenderDetailHeader(data) {
  const m = data.match;
  // Chipy wyników — siatkówka: sety z numerem, koszykówka: kwarty z oznaczeniem,
  // piłka nożna: tylko karne (jeśli były), bez emoji
  let setsHtml = "";
  const SET_LABELS  = ["S1","S2","S3","S4","S5"];
  const QRTR_LABELS = ["Q1","Q2","Q3","Q4","OT"];

  if (m.discipline === "Siatkówka" && data.sets && data.sets.length) {
    setsHtml = `<div class="mz-sets">
        ${data.sets.map((s, i) =>
          `<span class="mz-set-chip"><span class="mz-set-chip-lbl">${SET_LABELS[i] || `S${i+1}`}</span>${s.points_t1}:${s.points_t2}</span>`
        ).join("")}
      </div>`;
  } else if (m.discipline === "Koszykówka" && data.sets && data.sets.length) {
    setsHtml = `<div class="mz-sets">
        ${data.sets.filter(s => s.set_number <= 5).map(s =>
          `<span class="mz-set-chip"><span class="mz-set-chip-lbl">${QRTR_LABELS[(s.set_number||1)-1] || `K${s.set_number}`}</span>${s.points_t1}:${s.points_t2}</span>`
        ).join("")}
      </div>`;
  } else if (m.discipline === "Piłka Nożna" && hasShootout(m)) {
    setsHtml = `<div class="mz-sets">
        <span class="mz-set-chip mz-set-chip--pk"><span class="mz-set-chip-lbl">Rzuty karne</span>${m.shootout_t1}:${m.shootout_t2}</span>
      </div>`;
  }

  $("mz-detail-header").innerHTML = `
    <div class="mz-dh-disc">${mzDiscIcon(m.discipline)} ${m.discipline}</div>
    <div class="mz-dh-teams">
      <div class="mz-dh-team">
        <div class="mz-dh-tname">${m.team1_name}</div>
        ${m.status === "Rozegrany" ? `<div class="mz-dh-score">${m.score_t1}</div>` : ""}
      </div>
      <div class="mz-dh-sep">
        ${m.status === "Rozegrany"
          ? `<span class="mz-dh-final">WYNIK KOŃCOWY</span>`
          : `<span class="mz-dh-vs">VS</span>`}
        ${setsHtml}
      </div>
      <div class="mz-dh-team">
        ${m.status === "Rozegrany" ? `<div class="mz-dh-score">${m.score_t2}</div>` : ""}
        <div class="mz-dh-tname">${m.team2_name}</div>
      </div>
    </div>
    ${mzStatusBadge(m.status)}
  `;

  const { notes_text } = vbParseExtended(m.referee_notes);
  // vbParseExtended obsługuje __vb/__fb/__bk i plain text — notes_text zawsze poprawny
  const displayNotes = notes_text;

  $("mz-detail-info").innerHTML = `
    <div class="mz-info-grid">
      <div class="mz-info-item"><span class="mz-info-lbl">📅 Data</span><span>${mzFmtDate(m.match_date)}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">⏰ Godzina</span><span>${m.match_time ? m.match_time.slice(0,5) : "—"}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">📍 Lokalizacja</span><span>${m.location || "—"}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">🏟 Boisko</span><span>${m.court || "—"}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">⚖️ Sędzia</span><span>${m.referee_name || "—"}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">📋 Protokolant</span><span>${m.clerk_name || "—"}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">🏆 Typ</span><span>${m.match_type === "puchar" ? "Puchar" : "Liga"}${m.cup_round ? ` — ${m.cup_round}` : ""}</span></div>
      <div class="mz-info-item"><span class="mz-info-lbl">⏱ Czas gry</span><span>${m.duration_min || 60} min</span></div>
    </div>
    ${displayNotes ? `<div class="mz-referee-note"><strong>📝 Notatka sędziego:</strong> ${displayNotes}</div>` : ""}
  `;
}

function mzBindDetailButtons(data) {
  const m = data.match;

  $("mz-btn-pdf").onclick = async () => {
    $("mz-fill-panel").classList.add("hidden");
    const panel = $("mz-pdf-panel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      await mzRenderPdf(data);
    }
  };

  $("mz-pdf-close").onclick = () => $("mz-pdf-panel").classList.add("hidden");

  $("mz-pdf-print").onclick = () => {
    const body = $("mz-pdf-body");
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Protokół — ${m.team1_name} vs ${m.team2_name}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; padding: 20px; font-size: 12px; background: #fff; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
        th, td { border: 1px solid #000; padding: 5px 8px; font-size: 11px; color: #000; }
        th { background: #d0d0d0 !important; font-weight: 700; text-align: center; }
        tr:nth-child(even) td { background: #f4f4f4 !important; }
        h1 { font-size:16px; font-weight:900; text-align:center; text-transform:uppercase;
             letter-spacing:.06em; margin-bottom:16px; border-bottom:3px solid #000;
             padding-bottom:8px; color:#000; background:#fff; }
        h2 { font-size:13px; font-weight:900; margin:16px 0 0; color:#000;
             background:#e8e8e8 !important; padding:4px 10px;
             border-left:4px solid #000; border-bottom:2px solid #000; }
        .info-row { font-size:11px; margin-bottom:3px; }
        @media print { @page { size: A4; margin: 12mm 15mm; } }
      </style>
    </head><body>${body.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  $("mz-btn-live").onclick = () => {
    const url = mzLiveUrl(m);
    if (!url) { mzToast("Brak protokołu LIVE dla tej dyscypliny.", "err"); return; }
    window.location.href = url;
  };

  $("mz-btn-fill").onclick = () => {
    $("mz-pdf-panel").classList.add("hidden");
    const panel = $("mz-fill-panel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      mzRenderFillForm(data);
    }
  };

  $("mz-fill-close").onclick = () => $("mz-fill-panel").classList.add("hidden");

  $("mz-fill-save").onclick = () => mzSaveFillForm(data);

  $("mz-btn-delete").onclick = () => mzOpenDeleteModal(m);
}

// ── Delete match — modal + double-confirm ─────────────────────────────────────

function mzOpenDeleteModal(m) {
  const overlay  = $("mz-delete-modal");
  const desc     = $("mz-delete-modal-desc");
  const step2    = $("mz-delete-confirm-step2");
  const cb       = $("mz-delete-confirm-cb");
  const btnNext  = $("mz-delete-next");
  const btnConf  = $("mz-delete-confirm");
  const btnCancel= $("mz-delete-cancel");

  // Reset stanu modala
  desc.innerHTML = `Zamierzasz usunąć mecz:<br><br>
    <strong>${m.team1_name} vs ${m.team2_name}</strong><br>
    <span style="font-size:.8rem;color:var(--text2)">${mzFmtDate(m.match_date)} · ${m.discipline}</span><br><br>
    Wszystkie dane meczu (statystyki, sety, logi) zostaną <strong>trwale usunięte</strong>.`;

  step2.classList.add("hidden");
  cb.checked = false;
  btnNext.classList.remove("hidden");
  btnConf.classList.add("hidden");
  btnConf.disabled = true;

  overlay.classList.remove("hidden");

  // Krok 1 → Krok 2: pokaż checkbox
  btnNext.onclick = () => {
    step2.classList.remove("hidden");
    btnNext.classList.add("hidden");
    btnConf.classList.remove("hidden");
    btnConf.disabled = true;
  };

  // Odblokuj przycisk dopiero po zaznaczeniu checkboxa
  cb.onchange = () => { btnConf.disabled = !cb.checked; };

  // Zamknij modal
  const closeModal = () => overlay.classList.add("hidden");
  btnCancel.onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  // Potwierdzenie — usuń mecz
  btnConf.onclick = async () => {
    if (!cb.checked) return;
    btnConf.disabled = true;
    btnConf.textContent = "Usuwanie…";

    try {
      const { error: delErr } = await supabase.from("matches").delete().eq("id", m.id);
      if (delErr) throw new Error(delErr.message);

      closeModal();

      // Usuń mecz z lokalnej tablicy i przerenderuj listę
      MZ.allMatches = MZ.allMatches.filter(x => x.id !== m.id);
      mzRenderList();

      // Ukryj panel szczegółów
      $("mz-detail")?.classList.add("hidden");
      $("mz-empty-state")?.classList.remove("hidden");
      $("mz-action-btns")?.classList.add("hidden");
      MZ.currentMatch = null;
      MZ.currentMatchData = null;

      mzToast(`Mecz ${m.team1_name} vs ${m.team2_name} został usunięty.`, "ok");
    } catch (err) {
      btnConf.disabled = false;
      btnConf.textContent = "Tak, usuń na zawsze";
      mzToast(`Błąd usuwania: ${err.message}`, "err");
    }
  };
}

// ── PDF Render ────────────────────────────────────────────────────────────────

async function mzRenderPdf(data) {
  const m = data.match;

  // ══════════════════════════════════════════════════════
  //  VOLLEYBALL — Official Protocol
  // ══════════════════════════════════════════════════════
  if (m.discipline === "Siatkówka") {
    await mzRenderVolleyballPdf(data);
    return;
  }

  // ══════════════════════════════════════════════════════
  //  BASKETBALL — Official Protocol
  // ══════════════════════════════════════════════════════
  if (m.discipline === "Koszykówka") {
    await mzRenderBasketballPdf(data);
    return;
  }

  // ══════════════════════════════════════════════════════
  //  FOOTBALL — Official Protocol
  // ══════════════════════════════════════════════════════
  if (m.discipline === "Piłka Nożna") {
    await mzRenderFootballPdf(data);
    return;
  }

  // ── Generic protocol (fallback) ──────────
  const ps = data.playerStats || [];
  const ts = data.teamStats || [];
  const sets = data.sets || [];

  const t1Players = ps.filter(p => p.team_name === m.team1_name);
  const t2Players = ps.filter(p => p.team_name === m.team2_name);
  const t1Stats = ts.find(t => t.team_name === m.team1_name) || {};
  const t2Stats = ts.find(t => t.team_name === m.team2_name) || {};

  const playerCols = m.discipline === "Piłka Nożna"
    ? ["Zawodnik", "Klasa", "Pkt", "Żółte kartki", "Czerwona kartka"]
    : ["Zawodnik", "Klasa", "Pkt", "Faule osobiste", "Faule techn."];

  function playerRow(p) {
    const isBasket = m.discipline === "Koszykówka";
    return `<tr>
      <td>${p.last_name} ${p.first_name}${p.is_captain ? " ©" : ""}</td>
      <td>${p.class_name || "—"}</td>
      <td>${p.total_points_in_match || 0}</td>
      <td>${isBasket ? (p.personal_fouls || 0) : (p.yellow_cards || 0)}</td>
      <td>${isBasket ? (p.technical_fouls || 0) : (p.red_card ? "TAK" : "—")}</td>
    </tr>`;
  }

  $("mz-pdf-body").innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#111;padding:8px">
      <h1>📋 Protokół meczu — ${m.discipline}</h1>
      <div class="header-info">
        <div>
          <div class="info-row"><strong>Data:</strong> ${mzFmtDate(m.match_date)}</div>
          <div class="info-row"><strong>Godzina:</strong> ${m.match_time ? m.match_time.slice(0,5) : "—"}</div>
          <div class="info-row"><strong>Lokalizacja:</strong> ${m.location || "—"}</div>
          <div class="info-row"><strong>Boisko:</strong> ${m.court || "—"}</div>
        </div>
        <div>
          <div class="info-row"><strong>Sędzia:</strong> ${m.referee_name || "—"}</div>
          <div class="info-row"><strong>Protokolant:</strong> ${m.clerk_name || "—"}</div>
          <div class="info-row"><strong>Typ:</strong> ${m.match_type === "puchar" ? "Puchar" : "Liga"}${m.cup_round ? ` (${m.cup_round})` : ""}</div>
          <div class="info-row"><strong>Status:</strong> ${m.status}</div>
        </div>
      </div>

      <h2>Wynik końcowy</h2>
      <table>
        <thead>
          <tr><th>Drużyna</th><th>Wynik</th>${hasShootout(m) ? "<th>Rzuty karne</th>" : ""}<th>Przerwy</th><th>Zmiany</th><th>Faule drużynowe</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${m.team1_name}</strong></td>
            <td><strong>${m.score_t1 ?? "—"}</strong></td>
            ${hasShootout(m) ? `<td><strong>${m.shootout_t1}</strong></td>` : ""}
            <td>${t1Stats.timeouts_taken ?? "—"}</td>
            <td>${t1Stats.substitutions_used ?? "—"}</td>
            <td>${t1Stats.team_fouls_count ?? "—"}</td>
          </tr>
          <tr>
            <td><strong>${m.team2_name}</strong></td>
            <td><strong>${m.score_t2 ?? "—"}</strong></td>
            ${hasShootout(m) ? `<td><strong>${m.shootout_t2}</strong></td>` : ""}
            <td>${t2Stats.timeouts_taken ?? "—"}</td>
            <td>${t2Stats.substitutions_used ?? "—"}</td>
            <td>${t2Stats.team_fouls_count ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Skład i statystyki — ${m.team1_name}</h2>
      <table>
        <thead><tr>${playerCols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${t1Players.length ? t1Players.map(playerRow).join("") : `<tr><td colspan="5" style="text-align:center;color:#999">Brak danych zawodników</td></tr>`}</tbody>
      </table>

      <h2>Skład i statystyki — ${m.team2_name}</h2>
      <table>
        <thead><tr>${playerCols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${t2Players.length ? t2Players.map(playerRow).join("") : `<tr><td colspan="5" style="text-align:center;color:#999">Brak danych zawodników</td></tr>`}</tbody>
      </table>

      ${m.referee_notes ? `<h2>Notatka sędziego</h2><p style="font-size:13px;padding:8px;background:#f9f9f9;border:1px solid #ddd">${m.referee_notes}</p>` : ""}

      <div style="margin-top:24px;display:flex;gap:48px">
        <div style="font-size:12px">
          <div>Podpis sędziego głównego:</div>
          <div style="margin-top:24px;border-top:1px solid #555;width:160px">${m.referee_name || ""}</div>
        </div>
        <div style="font-size:12px">
          <div>Podpis protokolanta:</div>
          <div style="margin-top:24px;border-top:1px solid #555;width:160px">${m.clerk_name || ""}</div>
        </div>
      </div>
    </div>
  `;
}

// ── Basketball Official Protocol PDF ─────────────────────────────────────────

async function mzRenderBasketballPdf(data) {
  const m  = data.match;
  const ps = data.playerStats || [];
  const ts = data.teamStats   || [];
  // Quarters stored in same Volleyball_Sets table: set_number 1-4 = Q1-Q4, 5 = OT
  const quarters = (data.sets || []).filter(s => s.set_number <= 5);

  const rawNotes = m.referee_notes || m.referee_note || "";
  // Basketball notes: JSON with __bk ext, or plain text fallback
  let notes_text = rawNotes, bkExt = {};
  try {
    const p = JSON.parse(rawNotes);
    notes_text = p.notes_text ?? rawNotes;
    bkExt      = p.__bk || {};
  } catch { /* plain text */ }

  const t1Players = ps.filter(p => p.team_name === m.team1_name);
  const t2Players = ps.filter(p => p.team_name === m.team2_name);
  const t1Stats   = ts.find(t => t.team_name === m.team1_name) || {};
  const t2Stats   = ts.find(t => t.team_name === m.team2_name) || {};

  // Competition / stage
  const competition = m.match_type === "puchar"
    ? `Puchar${m.cup_round ? ` — ${m.cup_round}` : ""}` : "Liga";
  const stage = m.cup_round || (m.match_type === "puchar" ? "Puchar" : "Runda ligowa");

  // Fetch logs
  const { data: logsRaw } = await supabase.from("match_logs").select("*").eq("match_id", m.id).order("id", { ascending: true });
  const logs = logsRaw || [];

  // ── Shared style palette (identical to volleyball — printer-safe BW) ────────
  const PC  = "-webkit-print-color-adjust:exact;print-color-adjust:exact";
  const H2  = [
    "font-size:13px","font-weight:900","color:#000",
    "margin:16px 0 0","padding:4px 10px",
    "background:#e8e8e8",
    "border-left:4px solid #000","border-bottom:2px solid #000", PC,
  ].join(";");
  const TD  = `border:1px solid #000;padding:5px 8px;font-size:11px;color:#000`;
  const TDc = `${TD};text-align:center`;
  const TDr = `${TD};text-align:right`;
  const TH  = `${TDc};font-weight:700;background:#d0d0d0;${PC}`;
  const THA = `${TH};background:#c0c0c0;border-bottom:2px solid #000`;
  const THB = `${TH};background:#e8e8e8;border-bottom:2px solid #000`;
  const TK  = `${TD};font-weight:700;background:#f0f0f0;width:210px;${PC}`;
  const RTH = `${TH};background:#d8d8d8`;
  const SEP = "border-left:3px solid #000";

  function teamTitleBar(side) {
    const extra = side === "A"
      ? "border-left:4px solid #000;font-weight:900"
      : "border-left:2px solid #000;font-weight:700";
    return `font-size:12px;color:#000;margin-bottom:0;padding:5px 8px;
            background:#e0e0e0;border:1px solid #000;border-bottom:2px solid #000;${extra};${PC}`;
  }

  function teamClass(players) {
    const cls = players.find(p => p.class_name)?.class_name;
    return cls ? ` (${cls})` : "";
  }
  const t1Label = `${m.team1_name}${teamClass(t1Players)}`;
  const t2Label = `${m.team2_name}${teamClass(t2Players)}`;

  // ── Quarter / kvarta helpers ───────────────────────────────────────────────
  const QNAMES  = ["K1", "K2", "K3", "K4", "OT"];
  const QLABELS = ["Kwarta 1", "Kwarta 2", "Kwarta 3", "Kwarta 4", "Dogrywka"];
  const hasOT   = quarters.some(q => q.set_number === 5);
  const activeCols = hasOT ? [1,2,3,4,5] : [1,2,3,4];

  const getQ = n => quarters.find(q => q.set_number === n) || {};
  const fmtTO   = (v) => v != null ? v : "—";
  const fmtSubs = (v) => v != null ? v : "—";

  // Section 2 table: one ROW per kwarta, columns: Kwarta | Wynik | [A Przerwy | A Zmiany] | [B Przerwy | B Zmiany]
  function quarterRows() {
    if (!quarters.length) {
      return `<tr><td colspan="5" style="${TDc};font-style:italic">Brak danych kwart</td></tr>`;
    }
    return activeCols.map((n, i) => {
      const q = getQ(n);
      const rowBg = i % 2 === 0 ? "#fff" : "#f4f4f4";
      const pts1 = q.points_t1 ?? "—";
      const pts2 = q.points_t2 ?? "—";
      const wynik = (q.points_t1 != null) ? `${pts1} : ${pts2}` : "—";
      // Read TO/subs from bkExt (fill-form saves) or fallback to set fields (live protocol)
      const qd = (bkExt.quarter_data || {})[n] || {};
      const to1   = qd.to_t1   ?? q.to_t1   ?? null;
      const subs1 = qd.subs_t1 ?? q.subs_t1 ?? null;
      const to2   = qd.to_t2   ?? q.to_t2   ?? null;
      const subs2 = qd.subs_t2 ?? q.subs_t2 ?? null;
      return `<tr>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${QLABELS[n-1]}</td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${wynik}</td>
        <td style="${TDc};background:${rowBg};${SEP};${PC}">${fmtTO(to1)}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fmtSubs(subs1)}</td>
        <td style="${TDc};background:${rowBg};${SEP};${PC}">${fmtTO(to2)}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fmtSubs(subs2)}</td>
      </tr>`;
    }).join("");
  }

  // ── Player stats rows ──────────────────────────────────────────────────────
  // Standard basketball disqualification thresholds (used when no settings available)
  const FOUL_LIMIT = 5, TECH_LIMIT = 2;

  function playerRows(players) {
    if (!players.length) return `<tr><td colspan="8" style="${TDc};font-style:italic">Brak danych zawodników</td></tr>`;
    return players.map((p, idx) => {
      const rowBg = idx % 2 === 0 ? "#fff" : "#f4f4f4";
      const cap   = p.is_captain ? " ©" : "";
      const p1    = p.points_1pt  ?? "—";
      const p2    = p.points_2pt  ?? "—";
      const p3    = p.points_3pt  ?? "—";
      const calcTotal = (p.points_1pt != null && p.points_2pt != null && p.points_3pt != null)
        ? (p.points_1pt * 1 + p.points_2pt * 2 + p.points_3pt * 3)
        : (p.total_points_in_match ?? 0);

      // Wykluczenie
      const fouls  = p.personal_fouls  ?? 0;
      const tech   = p.technical_fouls ?? 0;
      const fouledOutByPersonal = fouls  >= FOUL_LIMIT;
      const fouledOutByTech     = tech   >= TECH_LIMIT;
      const fouledOut = fouledOutByPersonal || fouledOutByTech;
      const excReason = fouledOutByTech
        ? `wykluczony (${tech} f.tech.)`
        : `wykluczony (${fouls} fauli)`;

      const nameBg    = fouledOut ? "background:#f0f0f0" : `background:${rowBg}`;
      const nameStyle = fouledOut
        ? `${TD};${nameBg};${PC}`
        : `${TD};background:${rowBg};${PC}`;

      // Jersey from fill-form save or fallback to sequence number
      const bkRole = ((p.team_name === m.team1_name ? bkExt.players_t1 : bkExt.players_t2) || {})[String(p.player_id || p.id)] || {};
      const jersey = bkRole.jersey || (idx + 1);
      return `<tr>
        <td style="${TDc};background:${rowBg};${PC}">${jersey}</td>
        <td style="${nameStyle}">
          ${p.last_name || ""} ${p.first_name || ""}${cap}
          ${fouledOut ? `<span style="font-size:9px;color:#555;font-style:italic;display:block">— ${excReason}</span>` : ""}
        </td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${calcTotal}</td>
        <td style="${TDc};background:${rowBg};${PC}">${p1}</td>
        <td style="${TDc};background:${rowBg};${PC}">${p2}</td>
        <td style="${TDc};background:${rowBg};${PC}">${p3}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fouls}</td>
        <td style="${TDc};background:${rowBg};${PC}">${tech}</td>
      </tr>`;
    }).join("");
  }
  // ── Logs section — one full-width table per quarter ──────────────────────
  function logsSection() {
    if (!logs.length) return `<p style="font-size:9px;font-style:italic;margin:4px 0">Brak logów.</p>`;

    // Parse each log entry into structured { action, team, player, score, isEndRow, isStartRow }
    function parseLog(l) {
      const desc = l.description || "";
      const typ  = (l.action_type || "").toLowerCase();
      // Extract trailing score "→ X:Y"
      const scoreM = desc.match(/→\s*(\d+)/);
      // Extract time from description like "▶ Start - 10:00" or end "■ Koniec - 15:30"
      const timeM  = desc.match(/[-–]\s*(\d{1,2}:\d{2})\s*$/);
      const timeStr = timeM ? timeM[1] : "";

      let action = "", team = "", player = "", score = "", isEndRow = false, isStartRow = false;

      if (typ === "system") {
        if (desc.includes("rozpoczęty")) {
          // "Mecz rozpoczęty: T1 vs T2"
          action = "▶ Start" + (timeStr ? " - " + timeStr : "");
          score  = "0:0";
          isStartRow = true;
        } else if (desc.includes("zakończony")) {
          const resM = desc.match(/(\d+:\d+)/);
          score  = resM ? resM[1] : "";
          action = "■ Koniec" + (timeStr ? " - " + timeStr : "");
          isEndRow = true;
        } else { return null; }

      } else if (typ === "point") {
        // "+Xpkt: LastName FirstName (TeamName) → score"
        const ptM   = desc.match(/^\+(\d+)pkt:\s*(.+?)\s*\((.+?)\)\s*→\s*(\d+)/);
        if (ptM) {
          action = `+${ptM[1]}pkt`;
          player = ptM[2].trim();
          team   = ptM[3].trim();
          score  = desc.match(/→\s*(\d+)/) ? (() => {
            // reconstruct full score from description — it stores only one side
            // Format: "+3pkt: Name (Team) → 15" — we need T1:T2
            // The full score pattern is actually "→ score" where score is just the team's running total
            // But original log stores it as "→ 3" (just that team's total) — look for full X:Y
            const full = desc.match(/(\d+:\d+)/);
            return full ? full[1] : "";
          })() : "";
          // Re-extract full X:Y score (may appear differently)
          const fullScore = desc.match(/(\d+:\d+)/);
          score = fullScore ? fullScore[1] : "";
        } else { return null; }

      } else if (typ === "foul") {
        // Personal: "Faul osobisty: Name (Team) — X/Y"
        // Tech:     "Faul techniczny: Name (Team) — tech: X/Y, drużyna: Z"
        // Disq:     "🚫 Name (Team) — X fauli → DYSKWALIFIKACJA"
        // Team alert: "⚠️ TeamName — X fauli drużynowych → rzuty osobiste dla OppTeam!"
        const personalM = desc.match(/^Faul osobisty:\s*(.+?)\s*\((.+?)\)\s*[—–-]\s*(\d+\/\d+)/);
        const techM     = desc.match(/^Faul techniczny:\s*(.+?)\s*\((.+?)\)\s*[—–-]\s*tech:\s*(\d+\/\d+)/);
        const disqM     = desc.match(/^🚫\s*(.+?)\s*\((.+?)\)\s*[—–-]/);
        const teamAlert = desc.match(/^⚠️\s*(.+?)\s*[—–-]\s*\d+\s*fauli drużynowych/);

        if (personalM) {
          action = `Faul`;
          player = `${personalM[1].trim()} - ${personalM[3]}`;
          team   = personalM[2].trim();
        } else if (techM) {
          action = `Faul techniczny`;
          player = `${techM[1].trim()} - ${techM[3]}`;
          team   = techM[2].trim();
          // extract team foul count from "drużyna: X"
          const dM = desc.match(/drużyna:\s*(\d+)/);
          if (dM) team += ` - ${dM[1]}/${desc.match(/\/(\d+)/)?.[1]||"?"}`;
        } else if (disqM) {
          action = `Faul (DYSKW.)`;
          player = disqM[1].trim();
          team   = disqM[2].trim();
        } else if (teamAlert) {
          action = `⚠️ Limit fauli`;
          team   = teamAlert[1].trim();
          const fM = desc.match(/(\d+)\s*fauli drużynowych/);
          if (fM) {
            const limM = desc.match(/(\d+)\s*fauli drużynowych/);
            team += limM ? ` - ${fM[1]}` : "";
          }
        } else { return null; }

      } else if (typ === "timeout") {
        // "Przerwa: TeamName (X/Y/kwartę)"
        const tM = desc.match(/^Przerwa:\s*(.+?)\s*\((\d+\/[^)]+)\)/);
        if (tM) { action = "Przerwa"; team = `${tM[1].trim()} - ${tM[2]}`; }
        else { action = "Przerwa"; team = desc.replace(/^Przerwa:\s*/i, "").slice(0, 24); }

      } else if (typ === "sub") {
        // "Zmiana: TeamName (X/Y)"
        const sM = desc.match(/^Zmiana:\s*(.+?)\s*\((\d+\/[^)]+)\)/);
        if (sM) { action = "Zmiana"; team = `${sM[1].trim()} - ${sM[2]}`; }
        else { action = "Zmiana"; team = desc.replace(/^Zmiana:\s*/i, "").slice(0, 24); }

      } else if (typ === "period") {
        if (desc.includes("zakończona") || desc.includes("zakończony")) {
          const resM = desc.match(/:\s*(\d+:\d+)/);
          score  = resM ? resM[1] : "";
          action = "■ Koniec" + (timeStr ? " - " + timeStr : "");
          isEndRow = true;
        } else {
          // "→ Kwarta X rozpoczęta" — skip, handled by group header
          return null;
        }
      } else { return null; }

      return { action, team, player, score, isEndRow, isStartRow };
    }

    const allParsed = logs.map(parseLog).filter(Boolean);

    // Group into quarters: split at each period-end row
    const QLABELS = ["Kwarta 1","Kwarta 2","Kwarta 3","Kwarta 4","Dogrywka","Dogrywka 2"];
    const qGroups2 = [];
    let cur2 = [];
    for (const e of allParsed) {
      cur2.push(e);
      // Period end = isEndRow but not the last "match end" entry (which has no score from period)
      // Heuristic: if score present and it's end row, treat as period boundary
      if (e.isEndRow && e.score && !e.action.startsWith("▶")) {
        qGroups2.push(cur2); cur2 = [];
      }
    }
    if (cur2.length) qGroups2.push(cur2);
    if (!qGroups2.length) qGroups2.push(allParsed);

    // Styles
    const C    = `border:1px solid #bbb;padding:3px 6px;font-size:9px;color:#000;line-height:1.4`;
    const Cc   = `${C};text-align:center`;
    const CH   = `${Cc};background:#d0d0d0;font-weight:700;${PC}`;
    const GH   = `border:1px solid #888;padding:3px 8px;font-size:10px;font-weight:900;` +
                 `text-align:center;background:#e4e4e4;letter-spacing:.04em;${PC}`;
    const END_BG  = `background:#e8e8e8;font-weight:700`;
    const STRT_BG = `background:#f0f0f0;font-style:italic`;

    const tables = qGroups2.map((grp, gi) => {
      const closing = grp.find(e => e.isEndRow && e.score);
      const title   = closing
        ? `${QLABELS[gi] || "Kwarta " + (gi+1)}  —  Wynik: ${closing.score}`
        : (QLABELS[gi] || "Kwarta " + (gi+1));

      const rows = grp.map((e, ri) => {
        const isEnd   = e.isEndRow;
        const isStart = e.isStartRow;
        const rowBg   = isEnd   ? END_BG
                      : isStart ? STRT_BG
                      : ri % 2 === 0 ? "background:#fff" : "background:#f7f7f7";
        const boldEnd = isEnd ? "font-weight:700" : "";
        return `<tr>
          <td style="${C};${rowBg};${boldEnd};${PC}">${e.action}</td>
          <td style="${C};${rowBg};${boldEnd};${PC}">${e.team}</td>
          <td style="${C};${rowBg};${boldEnd};${PC}">${e.player}</td>
          <td style="${Cc};${rowBg};${boldEnd};${PC}">${e.score}</td>
        </tr>`;
      }).join("");

      return `<table style="border-collapse:collapse;width:100%;margin-bottom:8px;table-layout:fixed">
        <thead>
          <tr><th colspan="4" style="${GH}">${title}</th></tr>
          <tr>
            <th style="${CH};width:26%">Akcja</th>
            <th style="${CH};width:28%">Drużyna</th>
            <th style="${CH};width:28%">Zawodnik</th>
            <th style="${CH};width:18%">Wynik</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    });

    return tables.join("");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  $("mz-pdf-body").innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#000;padding:8px;max-width:760px;${PC}">

      <h1 style="font-size:16px;text-align:center;text-transform:uppercase;
                 letter-spacing:.08em;border-bottom:3px solid #000;
                 padding-bottom:8px;margin-bottom:16px;color:#000;font-weight:900">
        PROTOKÓŁ MECZU KOSZYKÓWKI
      </h1>

      <!-- 1. Dane meczu -->
      <h2 style="${H2}">1. Dane meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr><td style="${TK}">Rozgrywki:</td><td style="${TD}">${competition}</td></tr>
          <tr><td style="${TK}">Etap / kolejka:</td><td style="${TD}">${stage}</td></tr>
          <tr><td style="${TK}">Data:</td><td style="${TD}">${mzFmtDate(m.match_date)}</td></tr>
          <tr><td style="${TK}">Godzina rozpoczęcia:</td><td style="${TD}">${m.match_time ? m.match_time.slice(0,5) : "—"}</td></tr>
        </tbody>
      </table>

      <!-- 2. Wynik meczu -->
      <h2 style="${H2}">2. Wynik meczu</h2>
      <p style="font-size:12px;margin:6px 0 8px;font-weight:700;color:#000">
        Wynik końcowy:
        <span style="font-size:16px;font-weight:900;letter-spacing:.06em;margin-left:8px">
          ${t1Label} &nbsp; ${m.score_t1 ?? "—"} : ${m.score_t2 ?? "—"} &nbsp; ${t2Label}
        </span>
      </p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:4px;font-size:11px">
        <thead>
          <tr>
            <th rowspan="2" style="${TH};width:90px;border-bottom:2px solid #000">Kwarta</th>
            <th rowspan="2" style="${TH};width:72px;border-bottom:2px solid #000">Wynik</th>
            <th colspan="2" style="${THA};${SEP}">${m.team1_name}</th>
            <th colspan="2" style="${THB};${SEP}">${m.team2_name}</th>
          </tr>
          <tr>
            <th style="${THA};width:72px">Przerwy</th>
            <th style="${THA};width:72px">Zmiany</th>
            <th style="${THB};${SEP};width:72px">Przerwy</th>
            <th style="${THB};width:72px">Zmiany</th>
          </tr>
        </thead>
        <tbody>${quarterRows()}</tbody>
      </table>
      <p style="font-size:10px;color:#444;margin:2px 0 14px">
        ${hasOT ? "OT — dogrywka &nbsp;|&nbsp;" : ""}Przerwy i zmiany per kwarta
      </p>

      <!-- 3. Skład i statystyki — Drużyna A -->
      <h2 style="${H2}">3. Skład i statystyki — ${t1Label}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px;font-size:11px">
        <thead>
          <tr>
            <th style="${RTH};width:34px">Nr</th>
            <th style="${RTH};text-align:left">Imię i nazwisko</th>
            <th style="${RTH};width:44px">Pkt</th>
            <th style="${RTH};width:44px">+1pkt</th>
            <th style="${RTH};width:44px">+2pkt</th>
            <th style="${RTH};width:44px">+3pkt</th>
            <th style="${RTH};width:52px">Faule</th>
            <th style="${RTH};width:60px">F.techn.</th>
          </tr>
        </thead>
        <tbody>${playerRows(t1Players)}</tbody>
      </table>

      <!-- 4. Skład i statystyki — Drużyna B -->
      <h2 style="${H2}">4. Skład i statystyki — ${t2Label}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px;font-size:11px">
        <thead>
          <tr>
            <th style="${RTH};width:34px">Nr</th>
            <th style="${RTH};text-align:left">Imię i nazwisko</th>
            <th style="${RTH};width:44px">Pkt</th>
            <th style="${RTH};width:44px">+1pkt</th>
            <th style="${RTH};width:44px">+2pkt</th>
            <th style="${RTH};width:44px">+3pkt</th>
            <th style="${RTH};width:52px">Faule</th>
            <th style="${RTH};width:60px">F.techn.</th>
          </tr>
        </thead>
        <tbody>${playerRows(t2Players)}</tbody>
      </table>

      <!-- 5. Sędziowie -->
      <h2 style="${H2}">5. Sędziowie i obsługa meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr><td style="${TK}">Sędzia I:</td><td style="${TD}">${m.referee_name || "—"}</td></tr>
          <tr><td style="${TK}">Sędzia II:</td><td style="${TD}">${bkExt.referee2 || "—"}</td></tr>
          <tr><td style="${TK}">Sekretarz:</td><td style="${TD}">${m.clerk_name || "—"}</td></tr>
          <tr><td style="${TK}">Asystent sekretarza:</td><td style="${TD}">${bkExt.assistant_clerk || "—"}</td></tr>
        </tbody>
      </table>

      <!-- 6. Uwagi -->
      <h2 style="${H2}">6. Uwagi sędziowskie / organizacyjne</h2>
      <div style="min-height:50px;border:1px solid #000;padding:8px;font-size:12px;
                  color:#000;white-space:pre-wrap;background:#fff;margin-top:4px">${notes_text || ""}</div>

      <!-- 7. Logi — nowa strona -->
      <div style="page-break-before:always;padding-top:4px">
        <h1 style="font-size:15px;text-align:center;text-transform:uppercase;
                   letter-spacing:.06em;border-bottom:3px solid #000;
                   padding-bottom:8px;margin-bottom:10px;color:#000;font-weight:900">
          HISTORIA ZDARZEŃ — ${m.team1_name} vs ${m.team2_name}
        </h1>
        <p style="font-size:10px;color:#000;margin:0 0 6px">
          Data: ${mzFmtDate(m.match_date)} &nbsp;|&nbsp; Wygenerowano: ${new Date().toLocaleString("pl-PL")}
        </p>
        <h2 style="${H2}">7. Historia zdarzeń meczu</h2>
        <div style="margin-top:6px">${logsSection()}</div>
      </div>

    </div>
  `;
}


// Async — fetches logs before rendering

async function mzRenderVolleyballPdf(data) {
  const m = data.match;
  const ps = data.playerStats || [];
  const sets = data.sets || [];

  // Read notes from both field variants: fill-form saves to referee_notes (JSON),
  // live protocol saves plain text to referee_note — fall back to either
  const rawNotes = m.referee_notes || m.referee_note || "";
  const { notes_text, ext } = vbParseExtended(rawNotes);

  // Player data split by team
  const t1Players = ps.filter(p => p.team_name === m.team1_name);
  const t2Players = ps.filter(p => p.team_name === m.team2_name);

  // Extended data (referee2, assistant_clerk from JSON notes)
  const playerRolesT1 = ext.players_t1 || {};
  const playerRolesT2 = ext.players_t2 || {};

  // Competition / stage
  const competition = m.match_type === "puchar"
    ? `Puchar${m.cup_round ? ` — ${m.cup_round}` : ""}`
    : "Liga";
  const stage = m.cup_round || (m.match_type === "puchar" ? "Puchar" : "Runda ligowa");

  // Sets won
  const setsWonT1 = sets.filter(s => s.points_t1 > s.points_t2).length;
  const setsWonT2 = sets.filter(s => s.points_t2 > s.points_t1).length;

  // Fetch logs for this match
  const { data: logsRaw1 } = await supabase.from("match_logs").select("*").eq("match_id", m.id).order("id", { ascending: true });
  const logs = logsRaw1 || [];

  // ── Style palette — printer-safe pure grayscale ───────────────────────────
  // Rule: ALL text is #000. Backgrounds are LIGHT grays only (#e8–#f4).
  // Structure comes from borders (1-2px solid #000) and font-weight, NOT
  // from dark fills. This guarantees readability even on a poor B&W printer.
  const PC = "-webkit-print-color-adjust:exact;print-color-adjust:exact"; // shorthand

  // Section heading H2 — white bg, black text, thick left rule + bottom rule
  // No dark background fill → no risk of black blobs obscuring text
  const H2 = [
    "font-size:13px", "font-weight:900", "color:#000",
    "margin:16px 0 0", "padding:4px 10px 4px 10px",
    "background:#e8e8e8",
    "border-left:4px solid #000", "border-bottom:2px solid #000",
    PC,
  ].join(";");

  // Base data cell
  const TD  = `border:1px solid #000;padding:5px 8px;font-size:11px;color:#000`;
  const TDc = `${TD};text-align:center`;

  // Column header — slightly darker gray, bold, centered
  const TH  = `${TDc};font-weight:700;background:#d0d0d0;${PC}`;

  // Group sub-header for team A (slightly darker shade)
  const THA = `${TH};background:#c0c0c0;border-bottom:2px solid #000`;

  // Group sub-header for team B (lighter shade, clearly different)
  const THB = `${TH};background:#e8e8e8;border-bottom:2px solid #000`;

  // Key cell (label in 2-col info tables)
  const TK  = `${TD};font-weight:700;background:#f0f0f0;width:210px;${PC}`;

  // Roster column header
  const RTH = `${TH};background:#d8d8d8`;

  // Team title bar above roster — Drużyna A vs B differentiated by weight/border only
  function teamTitleBar(label, side) {
    const extra = side === "A"
      ? `border-left:4px solid #000;font-weight:900`
      : `border-left:2px solid #000;font-weight:700`;
    return `font-size:12px;color:#000;margin-bottom:0;padding:5px 8px;
            background:#e0e0e0;border:1px solid #000;border-bottom:2px solid #000;
            ${extra};${PC}`;
  }

  // Thick vertical separator between team A and B columns
  const SEP = "border-left:3px solid #000";

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Team class label
  function teamClass(players) {
    const cls = players.find(p => p.class_name)?.class_name;
    return cls ? ` (${cls})` : "";
  }
  const t1Label = `${m.team1_name}${teamClass(t1Players)}`;
  const t2Label = `${m.team2_name}${teamClass(t2Players)}`;

  // Roster rows — auto-number from 1
  function rosterRows(players, rolesMap) {
    if (!players.length) {
      return `<tr><td colspan="3" style="${TDc};font-style:italic">Brak danych zawodników</td></tr>`;
    }
    return players.map((p, idx) => {
      const role = rolesMap[p.player_id] || rolesMap[p.id] || {};
      const func = role.func || (p.is_captain ? "C" : "");
      const rowBg = idx % 2 === 0 ? "#fff" : "#f4f4f4";
      return `<tr>
        <td style="${TDc};background:${rowBg};${PC}">${idx + 1}</td>
        <td style="${TD};background:${rowBg};${PC}">${p.last_name || ""} ${p.first_name || ""}</td>
        <td style="${TDc};background:${rowBg};${PC}">${func}</td>
      </tr>`;
    }).join("");
  }

  // Combined sets + timeouts table — stats come directly from DB Volleyball_Sets
  const TO_MAX = 2, SUBS_MAX = 6;
  function fmt(val, max) {
    return `${val != null && val !== "" ? val : 0}/${max}`;
  }

  function combinedSetRows() {
    if (!sets.length) {
      return `<tr><td colspan="6" style="${TDc};font-style:italic">Brak danych setów</td></tr>`;
    }
    return sets.map((s, i) => {
      // per-set stats stored directly on the set row from DB
      const rowBg = i % 2 === 0 ? "#fff" : "#f4f4f4";
      return `<tr>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${ROMAN[i] || i + 1}</td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${s.points_t1} : ${s.points_t2}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fmt(s.to_t1,   TO_MAX)}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fmt(s.subs_t1, SUBS_MAX)}</td>
        <td style="${TDc};${SEP};background:${rowBg};${PC}">${fmt(s.to_t2,   TO_MAX)}</td>
        <td style="${TDc};background:${rowBg};${PC}">${fmt(s.subs_t2, SUBS_MAX)}</td>
      </tr>`;
    }).join("");
  }

  // ── Ultra-compact per-set logs ───────────────────────────────────────────
  function logsSection() {
    if (!logs.length) {
      return `<p style="font-size:9px;font-style:italic;margin:4px 0">Brak logów.</p>`;
    }

    // Parse entry → {event, value, score} — NO timestamp
    function parseLog(l) {
      const desc = l.description || "";
      const typ  = (l.action_type || "").toLowerCase();

      // Score "NN:NN" from "— 12:20"
      const scoreM = desc.match(/[—–-]\s*(\d+:\d+)/);
      const score  = scoreM ? scoreM[1] : "";

      let event = "", value = "";
      if (typ === "point") {
        const team = desc.replace(/Punkt dla\s*/i,"").split("—")[0].trim();
        event = "+1"; value = team.slice(0, 16);
      } else if (typ === "timeout") {
        const teamM = desc.match(/Przerwa\s*[—–-]\s*(.+?)\s*\(/i);
        const ratM  = desc.match(/\((\d+\/\d+)/);
        event = "TO"; value = (teamM ? teamM[1].slice(0,14) : "") + (ratM ? " " + ratM[1] : "");
      } else if (typ === "sub") {
        const teamM = desc.match(/Zmiana\s*[—–-]\s*(.+?)\s*\(/i);
        const ratM  = desc.match(/\((\d+\/\d+)/);
        event = "Sub"; value = (teamM ? teamM[1].slice(0,14) : "") + (ratM ? " " + ratM[1] : "");
      } else if (typ === "set") {
        if (desc.includes("Tiebreak")) { event = "⚡ Tiebreak"; value = ""; }
        else {
          const resM = desc.match(/:\s*(\d+:\d+)/);
          event = "■ Koniec"; value = resM ? resM[1] : "";
        }
      } else if (typ === "swap") {
        const posM = desc.match(/:\s*(P\d+)\s*←\s*(.+)/);
        event = "↔"; value = posM ? posM[1] + " " + posM[2].slice(0, 12) : desc.slice(0, 16);
      } else if (typ === "system") {
        if (desc.includes("rozpoczęty"))    { event = "▶ Start";  value = ""; }
        else if (desc.includes("zakończony")){ event = "■ Koniec"; value = "meczu"; }
        else return null;
      } else if (typ === "rotate" || typ === "undo") {
        return null; // skip noise
      } else {
        return null;
      }
      return { event, value: value.trim(), score };
    }

    // Group by set boundary (each "■ Koniec" entry for type=set closes a set)
    const allParsed = logs.map(parseLog).filter(Boolean);
    const setGroups = [];
    let cur = [];
    for (const e of allParsed) {
      cur.push(e);
      if (e.event === "■ Koniec" && e.value !== "meczu") {
        setGroups.push(cur); cur = [];
      }
    }
    if (cur.length) setGroups.push(cur);
    if (!setGroups.length) setGroups.push(allParsed);

    // Micro styles — absolute minimum padding, 8px font, 1px borders
    const C  = "border:1px solid #ccc;padding:1px 3px;font-size:8px;color:#000;line-height:1.3";
    const CH = `${C};background:#ddd;font-weight:700;text-align:center;${PC}`;
    const GH = `border:1px solid #888;padding:2px 4px;font-size:9px;font-weight:900;` +
               `text-align:center;background:#e4e4e4;letter-spacing:.03em;${PC}`;

    // 2 set-tables side by side using a wrapper flex table
    // Build each set as a standalone mini-table string, then place them 2-up
    const miniTables = setGroups.map((grp, gi) => {
      const setNum = gi + 1;
      // header: "Set N  (wynik)" from the closing entry
      const closing = grp.find(e => e.event === "■ Koniec" && e.value !== "meczu");
      const title = closing ? `S${setNum} &nbsp; ${closing.value}` : `S${setNum}`;
      const rows = grp.map((e, ri) => {
        const bg = ri % 2 === 0 ? "#fff" : "#f6f6f6";
        return `<tr>
          <td style="${C};background:${bg};${PC}">${e.event}</td>
          <td style="${C};background:${bg};max-width:90px;overflow:hidden;white-space:nowrap;${PC}">${e.value}</td>
          <td style="${C};text-align:center;background:${bg};white-space:nowrap;${PC}">${e.score}</td>
        </tr>`;
      }).join("");

      return `<table style="border-collapse:collapse;width:100%;table-layout:fixed">
        <thead>
          <tr><th colspan="3" style="${GH}">${title}</th></tr>
          <tr>
            <th style="${CH};width:22%">Akcja</th>
            <th style="${CH}">Drużyna</th>
            <th style="${CH};width:22%">Wynik</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    });

    // Pair sets 2 per row in an outer table
    let html = "";
    for (let i = 0; i < miniTables.length; i += 2) {
      const a = miniTables[i]   || "";
      const b = miniTables[i+1] || "";
      const w = b ? "50%" : "50%";
      html += `<table style="border-collapse:collapse;width:100%;margin-bottom:4px">
        <tr>
          <td style="width:${w};vertical-align:top;padding-right:${b ? "3px" : "0"}">${a}</td>
          ${b ? `<td style="width:50%;vertical-align:top;padding-left:3px">${b}</td>` : `<td style="width:50%"></td>`}
        </tr>
      </table>`;
    }
    return html;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  $("mz-pdf-body").innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#000;padding:8px;max-width:760px;${PC}">

      <!-- ══ TITLE ══ -->
      <h1 style="font-size:16px;text-align:center;text-transform:uppercase;
                 letter-spacing:.08em;border-bottom:3px solid #000;
                 padding-bottom:8px;margin-bottom:16px;color:#000;font-weight:900">
        PROTOKÓŁ MECZU SIATKÓWKI
      </h1>

      <!-- ══ 1. Dane meczu ══ -->
      <h2 style="${H2}">1. Dane meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr>
            <td style="${TK}">Rozgrywki:</td>
            <td style="${TD}">${competition}</td>
          </tr>
          <tr>
            <td style="${TK}">Etap / kolejka:</td>
            <td style="${TD}">${stage}</td>
          </tr>
          <tr>
            <td style="${TK}">Data:</td>
            <td style="${TD}">${mzFmtDate(m.match_date)}</td>
          </tr>
          <tr>
            <td style="${TK}">Godzina rozpoczęcia:</td>
            <td style="${TD}">${m.match_time ? m.match_time.slice(0,5) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <!-- ══ 3. Składy drużyn ══ -->
      <h2 style="${H2}">3. Składy drużyn</h2>
      <p style="font-size:10px;color:#000;margin:3px 0 8px">(C – kapitan, L – libero)</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">

        <div>
          <div style="${teamTitleBar(t1Label, 'A')}">Drużyna A — ${t1Label}</div>
          <table style="border-collapse:collapse;width:100%">
            <thead>
              <tr>
                <th style="${RTH};width:36px;text-align:center">Nr</th>
                <th style="${RTH};text-align:left">Imię i nazwisko</th>
                <th style="${RTH};width:68px;text-align:center">Funkcja</th>
              </tr>
            </thead>
            <tbody>${rosterRows(t1Players, playerRolesT1)}</tbody>
          </table>
        </div>

        <div>
          <div style="${teamTitleBar(t2Label, 'B')}">Drużyna B — ${t2Label}</div>
          <table style="border-collapse:collapse;width:100%">
            <thead>
              <tr>
                <th style="${RTH};width:36px;text-align:center">Nr</th>
                <th style="${RTH};text-align:left">Imię i nazwisko</th>
                <th style="${RTH};width:68px;text-align:center">Funkcja</th>
              </tr>
            </thead>
            <tbody>${rosterRows(t2Players, playerRolesT2)}</tbody>
          </table>
        </div>

      </div>

      <!-- ══ 4. Statystyki meczu ══ -->
      <h2 style="${H2}">4. Statystyki meczu</h2>
      <p style="font-size:13px;margin:6px 0 8px;font-weight:700;color:#000">
        Wynik końcowy (sety):
        <span style="font-size:16px;font-weight:900;letter-spacing:.06em;margin-left:8px">
          ${t1Label} &nbsp; ${setsWonT1} : ${setsWonT2} &nbsp; ${t2Label}
        </span>
      </p>

      <table style="border-collapse:collapse;width:100%;margin-bottom:4px;font-size:11px">
        <thead>
          <tr>
            <th rowspan="2" style="${TH};width:42px;border-bottom:2px solid #000">Set</th>
            <th rowspan="2" style="${TH};width:88px;border-bottom:2px solid #000">Wynik</th>
            <th colspan="2" style="${THA};${SEP}">${t1Label}</th>
            <th colspan="2" style="${THB};${SEP}">${t2Label}</th>
          </tr>
          <tr>
            <th style="${THA};width:80px">Przerwy</th>
            <th style="${THA};width:80px">Zmiany</th>
            <th style="${THB};${SEP};width:80px">Przerwy</th>
            <th style="${THB};width:80px">Zmiany</th>
          </tr>
        </thead>
        <tbody>${combinedSetRows()}</tbody>
      </table>
      <p style="font-size:10px;color:#444;margin:2px 0 14px">
        Format: użyte&thinsp;/&thinsp;max &nbsp;|&nbsp; Przerwy max: ${TO_MAX} &nbsp;|&nbsp; Zmiany max: ${SUBS_MAX}
      </p>

      <!-- ══ 5. Sędziowie ══ -->
      <h2 style="${H2}">5. Sędziowie i obsługa meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr><td style="${TK}">Sędzia I:</td><td style="${TD}">${m.referee_name || "—"}</td></tr>
          <tr><td style="${TK}">Sędzia II:</td><td style="${TD}">${ext.referee2 || "—"}</td></tr>
          <tr><td style="${TK}">Sekretarz:</td><td style="${TD}">${m.clerk_name || "—"}</td></tr>
          <tr><td style="${TK}">Asystent sekretarza:</td><td style="${TD}">${ext.assistant_clerk || "—"}</td></tr>
        </tbody>
      </table>

      <!-- ══ 6. Uwagi ══ -->
      <h2 style="${H2}">6. Uwagi sędziowskie / organizacyjne</h2>
      <div style="min-height:60px;border:1px solid #000;padding:8px;font-size:12px;
                  color:#000;white-space:pre-wrap;background:#fff;margin-top:4px">${notes_text || ""}</div>

      <!-- ══ 7. Logi meczu — nowa strona ══ -->
      <div style="page-break-before:always;padding-top:4px">
        <h1 style="font-size:15px;text-align:center;text-transform:uppercase;
                   letter-spacing:.06em;border-bottom:3px solid #000;
                   padding-bottom:8px;margin-bottom:14px;color:#000;font-weight:900">
          LOGI MECZU — ${m.team1_name} vs ${m.team2_name}
        </h1>
        <p style="font-size:10px;color:#000;margin:0 0 8px">
          Data meczu: ${mzFmtDate(m.match_date)} &nbsp;|&nbsp; Wygenerowano: ${new Date().toLocaleString("pl-PL")}
        </p>
        <h2 style="${H2}">7. Historia zmian / logi</h2>
        <div style="margin-top:6px">${logsSection()}</div>
      </div>

    </div>
  `;
}

// ── Football Official Protocol PDF ───────────────────────────────────────────

// ── Football Official Protocol PDF ───────────────────────────────────────────

async function mzRenderFootballPdf(data) {
  const m  = data.match;
  const ps = data.playerStats || [];

  // Football stores notes in referee_notes (JSON {notes_text, __fb})
  const rawNotes   = m.referee_notes || m.referee_note || "";
  const fbExt      = (() => { try { const p = JSON.parse(rawNotes); return p.__fb || {}; } catch { return {}; } })();
  const notes_text = (() => { try { const p = JSON.parse(rawNotes); return p.notes_text || ""; } catch { return rawNotes; } })();

  const t1Players = ps.filter(p => p.team_name === m.team1_name);
  const t2Players = ps.filter(p => p.team_name === m.team2_name);

  const competition = m.match_type === "puchar"
    ? `Puchar${m.cup_round ? ` \u2014 ${m.cup_round}` : ""}` : "Liga";
  const stage = m.cup_round || (m.match_type === "puchar" ? "Puchar" : "Runda ligowa");
  const hasPK = m.shootout_t1 != null && m.shootout_t2 != null;

  // Logs - server returns ORDER BY id ASC (oldest first)
  const { data: logsRaw2 } = await supabase.from("match_logs").select("*").eq("match_id", m.id).order("id", { ascending: true });
  const logs = logsRaw2 || [];

  // BW print-safe style palette
  const PC  = "-webkit-print-color-adjust:exact;print-color-adjust:exact";
  const H2  = `font-size:13px;font-weight:900;color:#000;margin:16px 0 0;padding:4px 10px;background:#e8e8e8;border-left:4px solid #000;border-bottom:2px solid #000;${PC}`;
  const TD  = `border:1px solid #000;padding:5px 8px;font-size:11px;color:#000`;
  const TDc = `${TD};text-align:center`;
  const TH  = `${TDc};font-weight:700;background:#d0d0d0;${PC}`;
  const TK  = `${TD};font-weight:700;background:#f0f0f0;width:210px;${PC}`;
  const RTH = `${TH};background:#d8d8d8`;
  const SEP = "border-left:3px solid #000";

  // Section 2: Period results + subs per half
  // data.sets = Volleyball_Sets rows with subs_t1/subs_t2 per period
  const periods = (data.sets || []).filter(s => s.set_number <= 4);
  const PNAMES  = ["1. po\u0142owa", "2. po\u0142owa", "Dogrywka I", "Dogrywka II"];

  function periodRows() {
    if (!periods.length) {
      return `<tr><td colspan="4" style="${TDc};font-style:italic">Brak danych po\u0142\u00f3w</td></tr>`;
    }
    return periods.map((p, i) => {
      const rowBg = i % 2 === 0 ? "#fff" : "#f4f4f4";
      const wynik = (p.points_t1 != null) ? `${p.points_t1} : ${p.points_t2}` : "\u2014";
      const s1 = (p.subs_t1 != null) ? p.subs_t1 : "\u2014";
      const s2 = (p.subs_t2 != null) ? p.subs_t2 : "\u2014";
      return `<tr>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${PNAMES[p.set_number - 1] || `Cz\u0119\u015b\u0107 ${p.set_number}`}</td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${wynik}</td>
        <td style="${TDc};background:${rowBg};${SEP};${PC}">${s1}</td>
        <td style="${TDc};background:${rowBg};${PC}">${s2}</td>
      </tr>`;
    }).join("");
  }

  // Section 2a: Penalty shootout - shooters in correct order from fbExt
  function buildPkTable(kicks, totalGoals, teamName, gkName) {
    const sorted = [...kicks].sort((a, b) => (a.kickIdx ?? 0) - (b.kickIdx ?? 0));

    // Group by unique shooter name — sum hits per player (like counting goals)
    const shooterOrder = [];   // preserves first-appearance order
    const hitsByShooter  = {};
    const kicksByShooter = {};
    for (const k of sorted) {
      const name = k.shooterName || "";
      if (!name) continue;
      if (!hitsByShooter[name]) {
        hitsByShooter[name]  = 0;
        kicksByShooter[name] = 0;
        shooterOrder.push(name);
      }
      kicksByShooter[name]++;
      if (k.result === "hit") hitsByShooter[name]++;
    }

    // Show at least 5 rows (empty placeholders if fewer shooters registered)
    const rowCount = Math.max(shooterOrder.length, 5);

    const rows = Array.from({ length: rowCount }, (_, i) => {
      const shooter = shooterOrder[i] || "";
      const hits    = shooter ? (hitsByShooter[shooter] ?? 0) : "";
      const total   = shooter ? (kicksByShooter[shooter] ?? 0) : "";
      const rowBg   = i % 2 === 0 ? "#fff" : "#f4f4f4";
      // Trafienia: hits/total kicks (np. 1/1 lub 0/1), puste gdy brak zawodnika
      const hitsDisplay = shooter !== "" ? `${hits}/${total}` : "";
      return `<tr>
        <td style="${TDc};background:${rowBg};${PC}">${i + 1}</td>
        <td style="${TD};background:${rowBg};${PC}">${shooter}</td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${hitsDisplay}</td>
      </tr>`;
    }).join("");

    // GK row — always show at bottom with "Br." in hits column
    const gkRow = gkName ? `<tr>
      <td style="${TDc};background:#f0f0f0;font-weight:700;${PC}">BRK</td>
      <td style="${TD};background:#f0f0f0;font-weight:700;${PC}">${gkName}</td>
      <td style="${TDc};background:#f0f0f0;font-weight:700;${PC}">Br.</td>
    </tr>` : `<tr>
      <td style="${TDc};background:#f0f0f0;${PC}">BRK</td>
      <td style="${TD};background:#f0f0f0;font-style:italic;${PC}">Bramkarz nieznany</td>
      <td style="${TDc};background:#f0f0f0;font-weight:700;${PC}">Br.</td>
    </tr>`;

    return `<div>
      <div style="font-weight:700;font-size:11px;background:#e4e4e4;border:1px solid #000;padding:4px 8px;border-bottom:2px solid #000;${PC}">${teamName}</div>
      <table style="border-collapse:collapse;width:100%;font-size:11px">
        <thead><tr>
          <th style="${TH};width:32px">Nr</th>
          <th style="${TH};text-align:left">Zawodnik</th>
          <th style="${TH};width:80px">Trafienia</th>
        </tr></thead>
        <tbody>
          ${rows}
          ${gkRow}
          <tr>
            <td colspan="2" style="${TD};font-weight:700;background:#f0f0f0;${PC}">Razem trafionych:</td>
            <td style="${TDc};font-weight:700;background:#f0f0f0;${PC}">${totalGoals ?? "\u2014"}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  function penaltySection() {
    if (!hasPK) return "";
    // Extract GK names from fbExt if available
    const gkT1 = fbExt.gk_t1 || null;
    const gkT2 = fbExt.gk_t2 || null;
    return `
      <h2 style="${H2}">2a. Rzuty karne</h2>
      <p style="font-size:12px;margin:6px 0 10px;font-weight:700;color:#000">
        Wynik serii:
        <span style="font-size:15px;font-weight:900;letter-spacing:.06em;margin-left:8px">
          ${m.team1_name} &nbsp; ${m.shootout_t1} : ${m.shootout_t2} &nbsp; ${m.team2_name}
        </span>
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        ${buildPkTable(fbExt.pk_t1 || [], m.shootout_t1, m.team1_name, gkT1)}
        ${buildPkTable(fbExt.pk_t2 || [], m.shootout_t2, m.team2_name, gkT2)}
      </div>`;
  }

  // Sections 3/4: Players - BW, no emoji, disq note inline same line
  function playerRows(players) {
    if (!players.length) return `<tr><td colspan="5" style="${TDc};font-style:italic">Brak danych zawodnik\u00f3w</td></tr>`;
    return players.map((p, idx) => {
      const rowBg  = idx % 2 === 0 ? "#fff" : "#f4f4f4";
      const cap    = p.is_captain ? " \u00a9" : "";
      const goals  = p.total_points_in_match ?? 0;
      const yellow = p.yellow_cards ?? 0;
      const red    = p.red_card ? 1 : 0;
      const isDisq = yellow >= 2 || red === 1;
      const disqReason = (yellow >= 2 && red === 1) ? "wyklucz. (2 \u017c\u00f3\u0142te + czerwona)"
                       : yellow >= 2                ? "wyklucz. (2 \u017c\u00f3\u0142te kartki)"
                       :                              "wyklucz. (czerwona kartka)";
      // disq note inline - same TD, same line via inline span
      const disqSpan = isDisq
        ? `<span style="font-size:9px;color:#333;font-style:italic;margin-left:6px">\u2014 ${disqReason}</span>`
        : "";
      return `<tr>
        <td style="${TDc};background:${rowBg};${PC}">${idx + 1}</td>
        <td style="${TD};background:${rowBg};${PC};white-space:nowrap">${p.last_name || ""} ${p.first_name || ""}${cap}${disqSpan}</td>
        <td style="${TDc};font-weight:700;background:${rowBg};${PC}">${goals > 0 ? goals : "\u2014"}</td>
        <td style="${TDc};background:${rowBg};${PC}">${yellow > 0 ? yellow : "\u2014"}</td>
        <td style="${TDc};background:${rowBg};${PC}">${red ? "1" : "\u2014"}</td>
      </tr>`;
    }).join("");
  }

  // Section 7: Event history - oldest to newest, grouped by period
  //
  // Exact log formats from football.js logAction calls:
  //   system: "Mecz rozpoczety: T1 vs T2"
  //   goal:   "Gol! NazwiskoImie (Druzyna) - 15'  Wynik: 2:1"
  //   goal(pk): "TRAFIONY: Imie (Druzyna) <- broni GK"  or  "NIECELNY: ..."
  //   card:   "Zolta kartka: NazwiskoImie (Druzyna) - 23'"
  //   red:    "Czerwona kartka: NazwiskoImie (Druzyna) - DYSKWALIFIKACJA - 23'"
  //           "NazwiskoImie (Druzyna) - 2 zolte = czerwona! DYSKWALIFIKACJA - 23'"
  //   sub:    "Zmiana: NazwaDruzyny (2/5)"
  //   period: "polow zakonczona: 2:1"   /   "polowa rozpoczeta"
  //   penalty: "Rzut karny: Zawodnik (Druzyna) - Gol/Niecelny/Obroniony"
  //   undo:   "Cofnieto: ..." - SKIP

  function logsSection() {
    if (!logs.length) {
      return `<p style="font-size:9px;font-style:italic;color:#555">Brak log\u00f3w z protoko\u0142u live.</p>`;
    }

    const C  = `border:1px solid #ccc;padding:1px 4px;font-size:9px;color:#000;line-height:1.4`;
    const Cc = `${C};text-align:center`;
    const CH = `${Cc};background:#d0d0d0;font-weight:700;${PC}`;
    const GH = `border:1px solid #888;padding:3px 6px;font-size:10px;font-weight:900;text-align:center;background:#e4e4e4;letter-spacing:.03em;${PC}`;
    const END_BG  = `background:#e0e0e0;font-weight:700`;
    const STRT_BG = `background:#f0f0f0;font-style:italic`;

    const yellowCount = {};

    function stripEmoji(str) {
      return str.replace(/[\u26bd\u{1f7e8}\u{1f7e5}\u{1f504}\u2713\u2192\u23f1\u{1f3c6}\u{1f3c1}\u25b6\u25a0\u2714\u2191\u2193\u27a1\u00bb\u25cf\u2605\u2716\u00d7\u{1f6ab}\u270f\u2764\u{1f4cb}\u{1f947}\u{1f4e2}\u2139\u26a0\u2705\u274c\u{1f3c5}]/gu, "").trim();
    }

    // football.js uses unshift() so newest = lowest id → ORDER BY id ASC = newest first
    // Reverse to get oldest-first (chronological)
    const chronoLogs = [...logs].reverse();

    function parseLog(l) {
      const typ  = (l.action_type || "").toLowerCase();
      const desc = l.description || "";

      if (typ === "undo") return null;
      if (desc.includes("Protok\u00f3\u0142 zapisany") || desc.includes("Protokol zapisany")) return null;

      let action = "", team = "", player = "", score = "", kind = "data";

      // Period START markers
      if (typ === "period" && (desc.startsWith("\u2192") || desc.includes("rozpocz\u0119ta") || desc.includes("rozpoczeta"))) {
        const label = stripEmoji(desc).replace(/^\u2192\s*/, "").replace(/rozpocz\u0119ta|rozpoczeta/i, "").trim();
        return { kind: "period_start", periodLabel: label, action: "", team: "", player: "", score: "" };
      }

      // PK-phase start ("Rzuty karne: T1 vs T2 — zaczyna ...")
      if (typ === "period" && desc.includes("zaczyna")) {
        return { kind: "period_start", periodLabel: "Rzuty karne", action: "", team: "", player: "", score: "" };
      }

      // Period END ("✓ I połowa zakończona: 2:1")
      if (typ === "period" && (desc.includes("zako\u0144czona") || desc.includes("zakonczona"))) {
        const sm = desc.match(/:\s*(\d+:\d+)/);
        return { action: "Koniec", team: "", player: "", score: sm ? sm[1] : "", kind: "end" };
      }

      if (typ === "period") return null;

      if (typ === "system" && (desc.includes("Mecz rozpocz\u0119ty") || desc.includes("Mecz rozpoczety"))) {
        action = "Start meczu"; kind = "start";

      } else if (typ === "system" && (
          desc.includes("Mecz zako\u0144czony") || desc.includes("Mecz zakonczony") ||
          (desc.includes("wygrywa") && desc.includes("karne")) ||
          desc.includes("zako\u0144czone") || desc.includes("zakonczone")
        )) {
        const sm = desc.match(/(\d+:\d+)/);
        score = sm ? sm[1] : "";
        action = "Koniec meczu"; kind = "end";

      } else if (typ === "system") {
        return null;

      } else if (typ === "goal" && (desc.includes("\u2190 broni") || desc.includes("<- broni"))) {
        const hit = desc.includes("TRAFIONY");
        const pM  = desc.match(/:\s*(.+?)\s*\((.+?)\)/);
        action = hit ? "PK: Gol" : "PK: Niecelny";
        if (pM) { player = pM[1].trim(); team = pM[2].trim(); }
        kind = "pk_kick";

      } else if (typ === "goal") {
        action = "Gol";
        const pM = desc.match(/Gol!\s+(.+?)\s*\((.+?)\)/);
        if (pM) { player = pM[1].trim(); team = pM[2].trim(); }
        const sm = desc.match(/Wynik:\s*(\d+:\d+)/);
        score = sm ? sm[1] : "";

      } else if (typ === "card") {
        // "🟨 Żółta kartka: Kowalski Jan (Druzyna) — 23'"
        // Strip emojis from the whole desc before matching to avoid partial matches
        const cleanDesc = stripEmoji(desc);
        const pM = cleanDesc.match(/:\s*(.+?)\s*\((.+?)\)/);
        if (pM) {
          const pName = pM[1].trim();
          yellowCount[pName] = (yellowCount[pName] || 0) + 1;
          player = `${pName} ${yellowCount[pName]}/2`;
          team = pM[2].trim();
        }
        action = "Zolta kartka";

      } else if (typ === "red") {
        // "🟨🟥 Test1 Test1 (Druzyna) — 2 żółte = czerwona! ..."  → "Test1 Test1 2/2"
        // "🟥 Czerwona kartka: Test1 Test1 (Druzyna) ..."         → "Test1 Test1"
        const cleanDesc = stripEmoji(desc);
        const has2y = desc.includes("2 \u017c\u00f3\u0142te") || desc.includes("2 zolte") ||
                      (desc.includes("\u{1f7e8}") && desc.includes("\u{1f7e5}"));
        action = has2y ? "2 zolte = czerwona" : "Czerwona kartka";

        const pM = cleanDesc.match(/:\s*(.+?)\s*\((.+?)\)/);
        if (pM) {
          const pName = pM[1].trim();
          yellowCount[pName] = 2;
          player = has2y ? `${pName} 2/2` : pName;
          team = pM[2].trim();
        } else {
          // Pattern without colon: "Test1 Test1 (Druzyna) — ..."
          const pM2 = cleanDesc.match(/^(.+?)\s*\((.+?)\)/);
          if (pM2) {
            const pName = pM2[1].trim();
            yellowCount[pName] = 2;
            player = has2y ? `${pName} 2/2` : pName;
            team = pM2[2].trim();
          }
        }

      } else if (typ === "sub") {
        const tM = desc.match(/Zmiana:\s*(.+?)\s*\((.+?)\)/);
        if (tM) {
          team = `${tM[1].trim()} (${tM[2]})`;
          action = "Zmiana";
        } else {
          action = "Zmiana";
          team = stripEmoji(desc.replace(/^Zmiana:\s*/i, "")).slice(0, 30);
        }

      } else if (typ === "penalty") {
        const pM = desc.match(/:\s*(.+?)\s*\((.+?)\)/);
        if (pM) { player = pM[1].trim(); team = pM[2].trim(); }
        if (desc.includes("Gol"))            action = "PK: Gol";
        else if (desc.includes("Obroniony")) action = "PK: Obroniony";
        else                                 action = "PK: Niecelny";
        kind = "pk_kick";

      } else {
        action = stripEmoji(desc).trim().slice(0, 40);
        if (!action) return null;
      }

      return { action, team, player, score, kind };
    }

    // Group by period — period_start entries open a new group
    const PLABELS    = ["1. Po\u0142owa", "2. Po\u0142owa", "Dogrywka I", "Dogrywka II", "Rzuty karne"];
    const groups     = [[]];
    const titles     = [PLABELS[0]];
    let gi = 0;

    for (const l of chronoLogs) {
      const e = parseLog(l);
      if (!e) continue;

      if (e.kind === "period_start") {
        gi++;
        groups.push([]);
        const lbl = e.periodLabel || "";
        let title;
        if      (lbl.includes("II po") || lbl.includes("2 po") || lbl.includes("druga")) title = PLABELS[1];
        else if (lbl.includes("Dogrywka I") && !lbl.includes("II"))                       title = PLABELS[2];
        else if (lbl.includes("Dogrywka II") || lbl.includes("Dogrywka 2"))               title = PLABELS[3];
        else if (lbl.toLowerCase().includes("rzut") || lbl === "Rzuty karne")             title = PLABELS[4];
        else    title = lbl || PLABELS[gi] || `Cz\u0119\u015b\u0107 ${gi + 1}`;
        titles.push(title);
        continue;
      }

      groups[gi].push(e);
      if (e.kind === "end" && e.score) {
        titles[gi] = `${titles[gi]} \u2014 Wynik ${e.score}`;
      }
    }

    // Build mini-tables
    const miniTables = groups
      .filter(g => g.length > 0)
      .map((grp, gidx) => {
        const title = titles[gidx] || `Cz\u0119\u015b\u0107 ${gidx + 1}`;

        // Check if group already has an explicit "end" entry from logs
        const hasExplicitEnd = grp.some(e => e.kind === "end");

        // Extract score from title (added when end event was parsed) or from last end entry
        const endEntry = grp.find(e => e.kind === "end");
        const scoreFromTitle = title.match(/Wynik\s+([\d:]+)/);
        const endScore = (endEntry && endEntry.score) || (scoreFromTitle && scoreFromTitle[1]) || "";

        // Rows — skip the explicit "end" entry since we always render a footer row instead
        const dataRows = grp.filter(e => e.kind !== "end");

        const rows = dataRows.map((e, ri) => {
          const isStart = e.kind === "start";
          const rowBg   = isStart ? STRT_BG
                        : ri % 2 === 0 ? "background:#fff" : "background:#f6f6f6";
          return `<tr>
            <td style="${C};${rowBg};${PC}">${e.action}</td>
            <td style="${C};${rowBg};${PC}">${e.team}</td>
            <td style="${C};${rowBg};${PC}">${e.player}</td>
            <td style="${Cc};${rowBg};${PC}">${e.score}</td>
          </tr>`;
        }).join("");

        // Always render footer row with end score
        const footerLabel = title.startsWith("Rzuty") ? "Koniec serii" : "Koniec";
        const footerRow = `<tr>
          <td style="${C};${END_BG};font-weight:700;${PC}">${footerLabel}</td>
          <td style="${C};${END_BG};${PC}"></td>
          <td style="${C};${END_BG};${PC}"></td>
          <td style="${Cc};${END_BG};font-weight:700;${PC}">${endScore}</td>
        </tr>`;

        return `<div><table style="border-collapse:collapse;width:100%;table-layout:fixed">
          <thead>
            <tr><th colspan="4" style="${GH}">${title}</th></tr>
            <tr>
              <th style="${CH};width:26%">Akcja</th>
              <th style="${CH};width:28%">Druzyna</th>
              <th style="${CH}">Zawodnik</th>
              <th style="${CH};width:18%">Wynik</th>
            </tr>
          </thead>
          <tbody>${rows || ""}${footerRow}</tbody>
        </table></div>`;
      });

    // Pair 2-per-row
    let html = "";
    for (let i = 0; i < miniTables.length; i += 2) {
      const a = miniTables[i]   || "";
      const b = miniTables[i+1] || "";
      html += `<table style="border-collapse:collapse;width:100%;margin-bottom:6px">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:${b ? "3px" : "0"}">${a}</td>
          ${b ? `<td style="width:50%;vertical-align:top;padding-left:3px">${b}</td>` : `<td style="width:50%"></td>`}
        </tr>
      </table>`;
    }
    return html;
  }

  const ref2   = fbExt.referee2 || "\u2014";
  const clerk1 = m.clerk_name   || "\u2014";
  const clerk2 = fbExt.clerk2   || "\u2014";

  $("mz-pdf-body").innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#000;padding:8px;max-width:760px;${PC}">

      <h1 style="font-size:16px;text-align:center;text-transform:uppercase;
                 letter-spacing:.08em;border-bottom:3px solid #000;
                 padding-bottom:8px;margin-bottom:16px;color:#000;font-weight:900">
        PROTOK\u00d3\u0141 MECZU PI\u0141KI NO\u017bNEJ
      </h1>

      <h2 style="${H2}">1. Dane meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr><td style="${TK}">Rozgrywki:</td><td style="${TD}">${competition}</td></tr>
          <tr><td style="${TK}">Etap / kolejka:</td><td style="${TD}">${stage}</td></tr>
          <tr><td style="${TK}">Data:</td><td style="${TD}">${mzFmtDate(m.match_date)}</td></tr>
          <tr><td style="${TK}">Godzina rozpocz\u0119cia:</td><td style="${TD}">${m.match_time ? m.match_time.slice(0,5) : "\u2014"}</td></tr>
        </tbody>
      </table>

      <h2 style="${H2}">2. Wynik meczu</h2>
      <p style="font-size:12px;margin:6px 0 8px;font-weight:700;color:#000">
        Wynik ko\u0144cowy:
        <span style="font-size:16px;font-weight:900;letter-spacing:.06em;margin-left:8px">
          ${m.team1_name} &nbsp; ${m.score_t1 ?? "\u2014"} : ${m.score_t2 ?? "\u2014"} &nbsp; ${m.team2_name}
        </span>
        ${hasPK ? `<span style="font-size:12px;font-style:italic;margin-left:12px">(po rzutach karnych ${m.shootout_t1}:${m.shootout_t2})</span>` : ""}
      </p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:4px;font-size:11px">
        <thead>
          <tr>
            <th style="${TH};width:130px">Cz\u0119\u015b\u0107 meczu</th>
            <th style="${TH};width:80px">Wynik</th>
            <th style="${TH};${SEP}">${m.team1_name} \u2014 Zmiany</th>
            <th style="${TH}">${m.team2_name} \u2014 Zmiany</th>
          </tr>
        </thead>
        <tbody>${periodRows()}</tbody>
      </table>
      <p style="font-size:10px;color:#555;margin:2px 0 14px">Zmiany = liczba zmian wykonanych w danej cz\u0119\u015bci gry</p>

      ${penaltySection()}

      <h2 style="${H2}">3. Sk\u0142ad i statystyki \u2014 ${m.team1_name}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px;font-size:11px">
        <thead><tr>
          <th style="${RTH};width:32px">Nr</th>
          <th style="${RTH};text-align:left">Imi\u0119 i nazwisko</th>
          <th style="${RTH};width:44px">Gole</th>
          <th style="${RTH};width:54px">\u017b\u00f3\u0142te</th>
          <th style="${RTH};width:54px">Czerwona</th>
        </tr></thead>
        <tbody>${playerRows(t1Players)}</tbody>
      </table>

      <h2 style="${H2}">4. Sk\u0142ad i statystyki \u2014 ${m.team2_name}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px;font-size:11px">
        <thead><tr>
          <th style="${RTH};width:32px">Nr</th>
          <th style="${RTH};text-align:left">Imi\u0119 i nazwisko</th>
          <th style="${RTH};width:44px">Gole</th>
          <th style="${RTH};width:54px">\u017b\u00f3\u0142te</th>
          <th style="${RTH};width:54px">Czerwona</th>
        </tr></thead>
        <tbody>${playerRows(t2Players)}</tbody>
      </table>

      <h2 style="${H2}">5. S\u0119dziowie i obs\u0142uga meczu</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
        <tbody>
          <tr><td style="${TK}">S\u0119dzia g\u0142\u00f3wny:</td><td style="${TD}">${m.referee_name || "\u2014"}</td></tr>
          <tr><td style="${TK}">S\u0119dzia asystent:</td><td style="${TD}">${ref2}</td></tr>
          <tr><td style="${TK}">Protokolant I:</td><td style="${TD}">${clerk1}</td></tr>
          <tr><td style="${TK}">Protokolant II:</td><td style="${TD}">${clerk2}</td></tr>
        </tbody>
      </table>

      <h2 style="${H2}">6. Notatka s\u0119dziego / uwagi organizacyjne</h2>
      <div style="min-height:60px;border:1px solid #000;padding:8px;font-size:12px;
                  color:#000;white-space:pre-wrap;background:#fff;margin-top:4px;margin-bottom:14px">${notes_text || ""}</div>

      <div style="page-break-before:always;padding-top:4px">
        <h1 style="font-size:15px;text-align:center;text-transform:uppercase;
                   letter-spacing:.06em;border-bottom:3px solid #000;
                   padding-bottom:8px;margin-bottom:10px;color:#000;font-weight:900">
          HISTORIA ZDARZE\u0143 \u2014 ${m.team1_name} vs ${m.team2_name}
        </h1>
        <p style="font-size:10px;color:#000;margin:0 0 6px">
          Data: ${mzFmtDate(m.match_date)} &nbsp;|&nbsp;
          Wygenerowano: ${new Date().toLocaleString("pl-PL")}
        </p>
        <h2 style="${H2}">7. Historia zdarze\u0144 meczu</h2>
        <div style="margin-top:6px">${logsSection()}</div>
      </div>

    </div>
  `;
}

// ── Shared protocol helpers: add player / add referee ────────────────────────

/**
 * Buduje HTML elementu <select> do wyboru osoby z bazy People.
 * @param {Array}  people        – tablica obiektów {id, first_name, last_name, role}
 * @param {string} currentVal   – aktualnie wybrana wartość (imię+nazwisko jako string)
 * @param {string} id           – id elementu
 * @param {string[]} roleFilter – role do filtrowania (puste = wszyscy)
 * @param {string} placeholder  – tekst pierwszej opcji
 */
function protBuildOfficialSelect(people, currentId, id, _unused, placeholder) {
  // currentId = People.id (liczba), value opcji = People.id — poprawny FK do bazy
  const curId = currentId ? String(currentId) : "";
  const opts = people.map(p =>
    `<option value="${p.id}" ${String(p.id) === curId ? "selected" : ""}>${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}</option>`
  ).join("");
  return `<select class="mz-fill-input prot-official-sel" id="${id}">
    <option value="">— ${placeholder} —</option>
    ${opts}
  </select>`;
}

/**
 * Pokazuje/ukrywa inline formularz dodawania zawodnika pod przyciskiem.
 * Obsługuje wybór z bazy danych lub ręczne dodanie nowego.
 * @param {HTMLButtonElement} btn       – kliknięty przycisk
 * @param {number}            teamId    – id drużyny
 * @param {string}            rosterId  – id kontenera .prot-cards
 * @param {Function}          buildCard – funkcja buildPlayerCard(p, teamId)
 * @param {Function|null}     onAdded   – callback po dodaniu
 * @param {Array}             allPeople – lista wszystkich People z API
 * @param {Array}             currentSquad – aktualny skład (by wykluczyć z listy)
 */
function protToggleAddPlayer(btn, teamId, rosterId, buildCard, onAdded, allPeople, currentSquad) {
  const existingForm = btn.parentElement.querySelector(".prot-inline-form");
  if (existingForm) {
    existingForm.remove();
    btn.textContent = btn.dataset.origLabel;
    return;
  }
  if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
  btn.textContent = "✕ Anuluj";

  // Osoby, które już są w składzie
  const squadPersonIds = new Set((currentSquad || []).map(p => p.person_id || p.id));

  // Osoby dostępne do dodania (rola "Zawodnik" lub brak roli, nie będące już w składzie)
  const available = (allPeople || []).filter(p =>
    p.role === "Zawodnik" && !squadPersonIds.has(p.id)
  );

  const dbOpts = available.map(p =>
    `<option value="${p.id}" data-name="${p.first_name} ${p.last_name}">${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}</option>`
  ).join("");

  const form = document.createElement("div");
  form.className = "prot-inline-form";
  form.innerHTML = `
    <div class="prot-inline-form-title">👤 Dodaj zawodnika do składu</div>

    ${available.length ? `
    <div class="prot-inline-tabs">
      <button type="button" class="prot-inline-tab prot-inline-tab--active" data-tab="db">📋 Z bazy danych</button>
      <button type="button" class="prot-inline-tab" data-tab="new">➕ Nowy zawodnik</button>
    </div>

    <div class="prot-inline-panel" data-panel="db">
      <div class="prot-field" style="margin-bottom:.6rem">
        <label class="prot-lbl">Wybierz osobę z bazy <span class="prot-req">*</span></label>
        <div class="prot-sel-search-wrap">
          <input type="text" class="mz-fill-input pif-search" placeholder="🔍 Szukaj po nazwisku…" autocomplete="off">
          <select class="mz-fill-input pif-person-sel" size="5" style="height:auto;min-height:100px">
            ${dbOpts}
          </select>
        </div>
      </div>
      <label class="prot-check-label pif-cap-db-wrap" style="margin-bottom:.5rem">
        <input type="checkbox" class="pif-captain-db"> Kapitan drużyny
      </label>
      <div class="prot-inline-form-actions">
        <button type="button" class="prot-inline-save prot-inline-save--db">✅ Dodaj wybraną osobę</button>
        <span class="prot-inline-err prot-inline-err--db"></span>
      </div>
    </div>` : ""}

    <div class="prot-inline-panel ${available.length ? "prot-inline-panel--hidden" : ""}" data-panel="new">
      <div class="prot-inline-form-row">
        <div class="prot-field">
          <label class="prot-lbl">Imię <span class="prot-req">*</span></label>
          <input type="text" class="mz-fill-input pif-first" placeholder="np. Jan" autocomplete="off">
        </div>
        <div class="prot-field">
          <label class="prot-lbl">Nazwisko <span class="prot-req">*</span></label>
          <input type="text" class="mz-fill-input pif-last" placeholder="np. Kowalski" autocomplete="off">
        </div>
      </div>
      <div class="prot-inline-form-row">
        <div class="prot-field">
          <label class="prot-lbl">Klasa</label>
          <input type="text" class="mz-fill-input pif-class" placeholder="np. 3A" autocomplete="off">
        </div>
        <div class="prot-field" style="justify-content:flex-end">
          <label class="prot-check-label" style="margin-top:1.4rem">
            <input type="checkbox" class="pif-captain"> Kapitan
          </label>
        </div>
      </div>
      <div class="prot-inline-form-actions">
        <button type="button" class="prot-inline-save prot-inline-save--new">✅ Dodaj nowego zawodnika</button>
        <span class="prot-inline-err prot-inline-err--new"></span>
      </div>
    </div>`;

  btn.parentElement.insertBefore(form, btn);

  // Zakładki
  form.querySelectorAll(".prot-inline-tab").forEach(tab => {
    tab.onclick = () => {
      form.querySelectorAll(".prot-inline-tab").forEach(t => t.classList.remove("prot-inline-tab--active"));
      tab.classList.add("prot-inline-tab--active");
      form.querySelectorAll(".prot-inline-panel").forEach(p => p.classList.add("prot-inline-panel--hidden"));
      form.querySelector(`[data-panel="${tab.dataset.tab}"]`)?.classList.remove("prot-inline-panel--hidden");
    };
  });

  // Szukajka filtruje listę select
  const searchInp = form.querySelector(".pif-search");
  const personSel = form.querySelector(".pif-person-sel");
  if (searchInp && personSel) {
    searchInp.addEventListener("input", () => {
      const q = searchInp.value.toLowerCase();
      Array.from(personSel.options).forEach(opt => {
        opt.hidden = !opt.text.toLowerCase().includes(q);
      });
    });
  }

  // ── Dodaj z bazy ──────────────────────────────────────────────────────────
  const dbSaveBtn = form.querySelector(".prot-inline-save--db");
  const dbErrEl   = form.querySelector(".prot-inline-err--db");
  if (dbSaveBtn) {
    dbSaveBtn.onclick = async () => {
      const sel = form.querySelector(".pif-person-sel");
      const personId = sel?.value;
      if (!personId) { dbErrEl.textContent = "Wybierz osobę z listy."; return; }

      dbSaveBtn.disabled = true;
      dbSaveBtn.textContent = "Dodawanie…";
      dbErrEl.textContent = "";

      try {
        const cap = form.querySelector(".pif-captain-db")?.checked;
        const { data: res, error: pe } = await supabase
          .from("players")
          .insert({ team_id: teamId, person_id: Number(personId), is_captain: cap ? 1 : 0 })
          .select("*, people(*)")
          .single();
        if (pe) throw new Error(pe.message);

        const roster = document.getElementById(rosterId);
        roster?.querySelectorAll(".mz-fill-empty").forEach(el => el.remove());
        const cardHTML = buildCard(res, teamId);
        const tmp = document.createElement("div");
        tmp.innerHTML = cardHTML;
        const card = tmp.firstElementChild;
        card.classList.add("prot-card--new");
        roster?.appendChild(card);

        // Usuń z listy dostępnych
        sel.querySelector(`option[value="${personId}"]`)?.remove();

        mzToast(`✅ Dodano: ${res.last_name} ${res.first_name}`, "ok");
        if (onAdded) onAdded(teamId);

        dbSaveBtn.disabled = false;
        dbSaveBtn.textContent = "✅ Dodaj wybraną osobę";
        if (cap) form.querySelector(".pif-captain-db").checked = false;
      } catch (e) {
        dbErrEl.textContent = e.message || "Błąd dodawania.";
        dbSaveBtn.disabled = false;
        dbSaveBtn.textContent = "✅ Dodaj wybraną osobę";
      }
    };
  }

  // ── Dodaj nowego ─────────────────────────────────────────────────────────
  const newSaveBtn = form.querySelector(".prot-inline-save--new");
  const newErrEl   = form.querySelector(".prot-inline-err--new");
  if (newSaveBtn) {
    newSaveBtn.onclick = async () => {
      const first = form.querySelector(".pif-first").value.trim();
      const last  = form.querySelector(".pif-last").value.trim();
      const cls   = form.querySelector(".pif-class").value.trim();
      const cap   = form.querySelector(".pif-captain").checked;

      if (!first || !last) { newErrEl.textContent = "Imię i nazwisko są wymagane."; return; }

      newSaveBtn.disabled = true;
      newSaveBtn.textContent = "Dodawanie…";
      newErrEl.textContent = "";

      try {
        // Utwórz osobę w people, potem gracza
        const { data: person, error: pe } = await supabase
          .from("people")
          .insert({ first_name: first, last_name: last, class_name: cls || null, role: "Zawodnik" })
          .select()
          .single();
        if (pe) throw new Error(pe.message);
        const { data: res, error: plE } = await supabase
          .from("players")
          .insert({ team_id: teamId, person_id: person.id, is_captain: cap ? 1 : 0 })
          .select("*, people(*)")
          .single();
        if (plE) throw new Error(plE.message);

        const roster = document.getElementById(rosterId);
        roster?.querySelectorAll(".mz-fill-empty").forEach(el => el.remove());
        const cardHTML = buildCard(res, teamId);
        const tmp = document.createElement("div");
        tmp.innerHTML = cardHTML;
        const card = tmp.firstElementChild;
        card.classList.add("prot-card--new");
        roster?.appendChild(card);

        mzToast(`✅ Dodano: ${last} ${first}`, "ok");
        if (onAdded) onAdded(teamId);

        form.querySelector(".pif-first").value = "";
        form.querySelector(".pif-last").value  = "";
        form.querySelector(".pif-class").value = "";
        form.querySelector(".pif-captain").checked = false;
        newSaveBtn.disabled = false;
        newSaveBtn.textContent = "✅ Dodaj nowego zawodnika";
      } catch (e) {
        newErrEl.textContent = e.message || "Błąd dodawania.";
        newSaveBtn.disabled = false;
        newSaveBtn.textContent = "✅ Dodaj nowego zawodnika";
      }
    };
  }
}

/**
 * Pokazuje/ukrywa inline formularz dodawania nowej osoby do bazy People.
 * Używane gdy chcemy dodać sędziego/protokolanta którego nie ma w bazie.
 * @param {HTMLButtonElement} btn – kliknięty przycisk
 */
function protToggleAddReferee(btn) {
  const existingForm = btn.parentElement.querySelector(".prot-inline-form");
  if (existingForm) {
    existingForm.remove();
    btn.textContent = btn.dataset.origLabel;
    return;
  }
  if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
  btn.textContent = "✕ Anuluj";

  const form = document.createElement("div");
  form.className = "prot-inline-form";
  form.innerHTML = `
    <div class="prot-inline-form-title">⚖️ Dodaj nową osobę do bazy</div>
    <div class="prot-inline-form-row">
      <div class="prot-field">
        <label class="prot-lbl">Imię <span class="prot-req">*</span></label>
        <input type="text" class="mz-fill-input pif-first" placeholder="np. Anna" autocomplete="off">
      </div>
      <div class="prot-field">
        <label class="prot-lbl">Nazwisko <span class="prot-req">*</span></label>
        <input type="text" class="mz-fill-input pif-last" placeholder="np. Nowak" autocomplete="off">
      </div>
    </div>
    <div class="prot-field" style="margin:.4rem 0">
      <label class="prot-lbl">Rola</label>
      <select class="mz-fill-input pif-role">
        <option value="Sędzia">⚖️ Sędzia</option>
        <option value="Protokolant">📋 Protokolant</option>
      </select>
    </div>
    <div class="prot-inline-form-actions">
      <button type="button" class="prot-inline-save">✅ Dodaj do bazy</button>
      <span class="prot-inline-err"></span>
    </div>
    <p class="prot-inline-note">Po dodaniu odśwież formularz aby zobaczyć nową osobę na liście.</p>`;

  btn.parentElement.insertBefore(form, btn);

  const saveBtn = form.querySelector(".prot-inline-save");
  const errEl   = form.querySelector(".prot-inline-err");

  saveBtn.onclick = async () => {
    const first = form.querySelector(".pif-first").value.trim();
    const last  = form.querySelector(".pif-last").value.trim();
    const role  = form.querySelector(".pif-role").value;

    if (!first || !last) { errEl.textContent = "Imię i nazwisko są wymagane."; return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "Dodawanie…";
    errEl.textContent = "";

    try {
      const { data: res, error: pe } = await supabase
        .from("people")
        .insert({ first_name: first, last_name: last, role })
        .select()
        .single();
      if (pe) throw new Error(pe.message);

      mzToast(`✅ Dodano: ${last} ${first} (${role}) — odśwież protokół aby wybrać`, "ok");

      form.querySelector(".pif-first").value = "";
      form.querySelector(".pif-last").value  = "";
      saveBtn.disabled = false;
      saveBtn.textContent = "✅ Dodaj do bazy";
    } catch (e) {
      errEl.textContent = e.message || "Błąd dodawania.";
      saveBtn.disabled = false;
      saveBtn.textContent = "✅ Dodaj do bazy";
    }
  };
}

// ── Football Fill Form (mobile-first protocol) ────────────────────────────────

async function mzRenderFootballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople) {
  const m = data.match;
  const rawNotes   = m.referee_notes || m.referee_note || "";
  const notes_text = (() => { try { const p = JSON.parse(rawNotes); return p.notes_text || ""; } catch { return rawNotes; } })();
  const ext        = (() => { try { const p = JSON.parse(rawNotes); return p.__fb || {}; } catch { return {}; } })();

  const sets          = data.sets || [];
  const hasPK         = m.shootout_t1 != null || ext.has_pk;
  const PERIOD_LABELS = ["1. połowa", "2. połowa", "Dogrywka I", "Dogrywka II"];
  const periodCount   = Math.max(sets.length, 2);
  const pkT1          = Array.isArray(ext.pk_t1) ? ext.pk_t1 : [];
  const pkT2          = Array.isArray(ext.pk_t2) ? ext.pk_t2 : [];
  const lineupT1      = ext.lineup_t1 || {};
  const lineupT2      = ext.lineup_t2 || {};

  // People filtered by role
  const referees    = (allPeople || []).filter(p => p.role === "Sędzia");
  const protokolanci = (allPeople || []).filter(p => p.role === "Protokolant");

  // ── Player card ─────────────────────────────────────────────────────────
  function buildPlayerCard(p, teamId) {
    const s       = statsMap[p.id] || {};
    const goals   = s.total_points_in_match ?? 0;
    const yc      = s.yellow_cards ?? 0;
    const rc      = s.red_card ? 1 : 0;
    const disq    = yc >= 2 || rc;
    const lineup  = teamId === m.team1_id ? lineupT1 : lineupT2;
    const playing = String(p.id) in lineup ? lineup[String(p.id)] : 1;
    const cap     = p.is_captain ? " ©" : "";
    return `
      <div class="prot-card fb-player-row ${playing ? "" : "prot-card--bench"}" data-player-id="${p.id}" data-team-id="${teamId}">
        <input type="hidden" name="total_points_in_match" value="${goals}">
        <input type="hidden" name="yellow_cards" value="${yc}">
        <input type="hidden" name="red_card" value="${rc}">
        <input type="hidden" name="is_playing" value="${playing}">
        <div class="prot-card-hdr">
          <span class="prot-pname">${p.last_name} ${p.first_name}${cap}${p.class_name ? ` <em class="prot-cls">${p.class_name}</em>` : ""}</span>
          <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
            ${disq ? `<span class="prot-disq-badge">DYSKW.</span>` : ""}
            <button type="button" class="prot-lineup-btn ${playing ? "prot-lineup-btn--active" : ""}" data-for="lineup">
              ${playing ? "✅ Gra" : "🪑 Ławka"}
            </button>
          </div>
        </div>
        <div class="prot-card-body ${playing ? "" : "prot-card-body--hidden"}">
          <div class="prot-stat-row">
            <span class="prot-stat-lbl">⚽ Gole</span>
            <div class="prot-counter">
              <button type="button" class="prot-cb prot-cb--dec" data-for="goals">−</button>
              <span class="prot-cv" data-type="goals">${goals}</span>
              <button type="button" class="prot-cb prot-cb--inc" data-for="goals">+</button>
            </div>
          </div>
          <div class="prot-stat-row">
            <span class="prot-stat-lbl">🟡 Żółte kartki</span>
            <div class="prot-counter prot-counter--sm">
              <button type="button" class="prot-cb prot-cb--dec" data-for="yellow">−</button>
              <span class="prot-cv" data-type="yellow">${yc}</span>
              <button type="button" class="prot-cb prot-cb--inc" data-for="yellow">+</button>
            </div>
          </div>
          <div class="prot-stat-row">
            <span class="prot-stat-lbl">🟥 Czerwona kartka</span>
            <button type="button" class="prot-toggle ${rc ? "prot-toggle--on" : ""}" data-for="red">${rc ? "TAK ✓" : "NIE"}</button>
          </div>
        </div>
      </div>`;
  }

  // ── Period rows ──────────────────────────────────────────────────────────
  function buildPeriodRows() {
    return Array.from({ length: periodCount }, (_, i) => {
      const s = sets[i] || {};
      const n = i + 1;
      return `<tr class="fb-period-row" data-period="${n}">
        <td class="prot-tbl-lbl">${PERIOD_LABELS[i] || `Część ${n}`}</td>
        <td class="prot-tbl-spin"><div class="prot-spin">
          <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t1" data-delta="-1">−</button>
          <input id="fp-p${n}-t1" type="number" class="prot-spin-inp" name="pts_t1" data-period="${n}" min="0" value="${s.points_t1 ?? ""}">
          <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t1" data-delta="1">+</button>
        </div></td>
        <td class="prot-tbl-sep">:</td>
        <td class="prot-tbl-spin"><div class="prot-spin">
          <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t2" data-delta="-1">−</button>
          <input id="fp-p${n}-t2" type="number" class="prot-spin-inp" name="pts_t2" data-period="${n}" min="0" value="${s.points_t2 ?? ""}">
          <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t2" data-delta="1">+</button>
        </div></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t1_period" data-period="${n}" min="0" max="10" value="${s.subs_t1 ?? ""}"></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t2_period" data-period="${n}" min="0" max="10" value="${s.subs_t2 ?? ""}"></td>
      </tr>`;
    }).join("");
  }

  // ── PK kick rows ─────────────────────────────────────────────────────────
  function buildPKRows(teamId, kicks, players) {
    const sorted = [...kicks].sort((a, b) => (a.kickIdx ?? 0) - (b.kickIdx ?? 0));
    return Array.from({ length: 5 }, (_, i) => {
      const k    = sorted[i] || {};
      const opts = players.map(p =>
        `<option value="${p.id}" ${k.playerId == p.id ? "selected" : ""}>${p.last_name} ${p.first_name}</option>`
      ).join("");
      return `<tr class="fb-pk-kick-row" data-team-id="${teamId}" data-kick="${i}">
        <td class="prot-pk-num">${i + 1}</td>
        <td><select class="mz-fill-select" name="pk_shooter" style="width:100%">
          <option value="">— zawodnik —</option>${opts}
        </select></td>
        <td>
          <div class="prot-pk-btns">
            <button type="button" class="prot-pk-btn ${k.result === "hit"   ? "prot-pk-btn--active prot-pk-btn--goal"  : ""}" data-result="hit">⚽ Gol</button>
            <button type="button" class="prot-pk-btn ${k.result === "saved" ? "prot-pk-btn--active prot-pk-btn--saved" : ""}" data-result="saved">🧤 Obron.</button>
            <button type="button" class="prot-pk-btn ${k.result === "miss"  ? "prot-pk-btn--active prot-pk-btn--miss"  : ""}" data-result="miss">❌ Niecel.</button>
            <input type="hidden" name="pk_result" value="${k.result || ""}">
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  // Initial live score from existing stats
  const calcT1 = (squad1 || []).reduce((s, p) => s + ((statsMap[p.id] || {}).total_points_in_match || 0), 0);
  const calcT2 = (squad2 || []).reduce((s, p) => s + ((statsMap[p.id] || {}).total_points_in_match || 0), 0);

  body.innerHTML = `
    <!-- 1. Dane meczu -->
    <div class="prot-section">
      <div class="prot-section-hdr">📋 1. Dane meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">📅 Data</label>
          <input type="date" class="mz-fill-input" id="fb-date" value="${m.match_date ? m.match_date.slice(0, 10) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">Status meczu</label>
          <select class="mz-fill-input" id="fb-status-quick">
            <option value="Planowany"  ${m.status === "Planowany"  ? "selected" : ""}>📅 Planowany</option>
            <option value="Rozegrany"  ${m.status === "Rozegrany"  ? "selected" : ""}>✅ Rozegrany</option>
            <option value="Odwołany"   ${m.status === "Odwołany"   ? "selected" : ""}>❌ Odwołany</option>
            <option value="Walkower"   ${m.status === "Walkower"   ? "selected" : ""}>🏳 Walkower</option>
          </select></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina rozpoczęcia</label>
          <input type="time" class="mz-fill-input" id="fb-start-time" value="${m.match_time ? m.match_time.slice(0, 5) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina zakończenia</label>
          <input type="time" class="mz-fill-input" id="fb-end-time" value="${ext.end_time || ""}"></div>
      </div>
      <div class="prot-field"><label class="prot-lbl">📍 Miejsce rozegrania</label>
        <input type="text" class="mz-fill-input" id="fb-location" value="${m.location || ""}" placeholder="Boisko, hala…"></div>
    </div>

    <!-- 2. Wynik na żywo -->
    <div class="prot-section prot-section--score">
      <div class="prot-section-hdr">⚽ 2. Wynik meczu</div>
      <div class="prot-scoreboard">
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team1_name}</div>
          <div class="prot-sb-val" id="fb-live-t1">${m.score_t1 ?? calcT1}</div>
        </div>
        <div class="prot-sb-sep">:</div>
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team2_name}</div>
          <div class="prot-sb-val" id="fb-live-t2">${m.score_t2 ?? calcT2}</div>
        </div>
      </div>
      <input type="hidden" name="score" id="fb-score-t1" data-team="${m.team1_id}" value="${m.score_t1 ?? calcT1}">
      <input type="hidden" name="score" id="fb-score-t2" data-team="${m.team2_id}" value="${m.score_t2 ?? calcT2}">
      <p class="prot-hint">Wynik aktualizuje się automatycznie z goli zawodników poniżej</p>
    </div>

    <!-- 3. Wyniki połów -->
    <div class="prot-section">
      <div class="prot-section-hdr">⏱ 3. Wyniki połów / części gry</div>
      <div class="prot-tbl-wrap">
        <table class="prot-tbl">
          <thead><tr>
            <th>Część</th>
            <th colspan="3">Wynik<small><br>${m.team1_name} : ${m.team2_name}</small></th>
            <th>Zm. A</th>
            <th>Zm. B</th>
          </tr></thead>
          <tbody id="fb-periods-tbody">${buildPeriodRows()}</tbody>
        </table>
      </div>
      <button type="button" class="prot-add-btn" id="fb-add-period">+ Dodaj dogrywkę</button>
    </div>

    <!-- 4. Rzuty karne -->
    <div class="prot-section">
      <div class="prot-section-hdr">🥅 4. Rzuty karne</div>
      <label class="prot-check-label">
        <input type="checkbox" id="fb-has-pk" ${hasPK ? "checked" : ""}>
        Mecz rozstrzygnięto przez serię rzutów karnych
      </label>
      <div id="fb-pk-section" ${hasPK ? "" : "style='display:none'"}>
        <div class="prot-grid2" style="margin:.75rem 0">
          <div class="prot-field"><label class="prot-lbl">Gole karne — ${m.team1_name}</label>
            <input type="number" class="mz-fill-input" id="fb-pk-t1" min="0" value="${m.shootout_t1 ?? ""}" placeholder="0"></div>
          <div class="prot-field"><label class="prot-lbl">Gole karne — ${m.team2_name}</label>
            <input type="number" class="mz-fill-input" id="fb-pk-t2" min="0" value="${m.shootout_t2 ?? ""}" placeholder="0"></div>
        </div>
        <div class="prot-pk-cols">
          <div class="prot-pk-col">
            <div class="prot-pk-col-hdr">⚽ ${m.team1_name}</div>
            <table class="prot-pk-tbl"><thead><tr><th>#</th><th>Zawodnik</th><th>Wynik</th></tr></thead>
              <tbody>${buildPKRows(m.team1_id, pkT1, squad1 || [])}</tbody></table>
          </div>
          <div class="prot-pk-col">
            <div class="prot-pk-col-hdr">⚽ ${m.team2_name}</div>
            <table class="prot-pk-tbl"><thead><tr><th>#</th><th>Zawodnik</th><th>Wynik</th></tr></thead>
              <tbody>${buildPKRows(m.team2_id, pkT2, squad2 || [])}</tbody></table>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Drużyna A -->
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">⚽ 5. ${m.team1_name} — skład</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="fb-roster-t1" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="fb-roster-t1" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="fb-roster-t1">
        ${(squad1 || []).length
          ? (squad1 || []).map(p => buildPlayerCard(p, m.team1_id)).join("")
          : `<div class="mz-fill-empty">Brak zawodników.</div>`}
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="fb-add-player-t1">+ Dodaj zawodnika do ${m.team1_name}</button>
    </div>

    <!-- 6. Drużyna B -->
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">⚽ 6. ${m.team2_name} — skład</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="fb-roster-t2" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="fb-roster-t2" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="fb-roster-t2">
        ${(squad2 || []).length
          ? (squad2 || []).map(p => buildPlayerCard(p, m.team2_id)).join("")
          : `<div class="mz-fill-empty">Brak zawodników.</div>`}
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="fb-add-player-t2">+ Dodaj zawodnika do ${m.team2_name}</button>
    </div>

    <!-- 7. Sędziowie -->
    <div class="prot-section">
      <div class="prot-section-hdr">⚖️ 7. Sędziowie i obsługa meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">Sędzia główny</label>
          ${protBuildOfficialSelect(referees, m.referee_id || "", "fb-referee2", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Sędzia asystent</label>
          ${protBuildOfficialSelect(referees, ext.referee2_id || "", "fb-referee3", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Protokolant I</label>
          ${protBuildOfficialSelect(protokolanci, m.clerk_id || "", "fb-clerk1", [], "wybierz protokolanta")}</div>
        <div class="prot-field"><label class="prot-lbl">Protokolant II</label>
          ${protBuildOfficialSelect(protokolanci, ext.clerk2_id || "", "fb-clerk2", [], "wybierz protokolanta")}</div>
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--referee" id="fb-add-referee">+ Dodaj nowego sędziego / protokolanta do bazy</button>
    </div>

    <!-- 8. Uwagi -->
    <div class="prot-section">
      <div class="prot-section-hdr">📝 8. Uwagi sędziowskie / organizacyjne</div>
      <textarea class="mz-fill-textarea" id="mz-fill-note-text" rows="4" placeholder="Wpisz uwagi…">${notes_text || ""}</textarea>
    </div>
  `;

  // ── Interaktywność ───────────────────────────────────────────────────────

  // Przelicz wynik na żywo (suma goli zawodników)
  function recalcScore(teamId, side) {
    const total = Array.from(body.querySelectorAll(`.fb-player-row[data-team-id="${teamId}"] [name="total_points_in_match"]`))
      .reduce((s, inp) => {
        const card = inp.closest(".fb-player-row");
        const playing = Number(card?.querySelector("[name=is_playing]")?.value ?? 1);
        return s + (playing ? (Number(inp.value) || 0) : 0);
      }, 0);
    const liveEl = document.getElementById(`fb-live-${side}`);
    const hidEl  = document.getElementById(`fb-score-${side}`);
    if (liveEl) liveEl.textContent = total;
    if (hidEl)  hidEl.value = total;
  }

  // Karty zawodników — delegacja zdarzeń na kontener drużyny
  [["fb-roster-t1", m.team1_id, "t1"], ["fb-roster-t2", m.team2_id, "t2"]].forEach(([rosterId, teamId, side]) => {
    const cont = document.getElementById(rosterId);
    if (!cont) return;
    cont.addEventListener("click", e => {
      const card = e.target.closest(".prot-card");
      if (!card) return;
      const goalsH    = card.querySelector("[name=total_points_in_match]");
      const yellowH   = card.querySelector("[name=yellow_cards]");
      const redH      = card.querySelector("[name=red_card]");
      const playingH  = card.querySelector("[name=is_playing]");
      const goalsDp   = card.querySelector("[data-type=goals]");
      const ycDp      = card.querySelector("[data-type=yellow]");
      const btn       = e.target.closest("button");
      if (!btn) return;

      if (btn.matches(".prot-lineup-btn")) {
        const isPlaying = Number(playingH?.value ?? 1);
        const next = isPlaying ? 0 : 1;
        if (playingH) playingH.value = next;
        btn.textContent = next ? "✅ Gra" : "🪑 Ławka";
        btn.classList.toggle("prot-lineup-btn--active", !!next);
        card.classList.toggle("prot-card--bench", !next);
        const bodyEl = card.querySelector(".prot-card-body");
        if (bodyEl) bodyEl.classList.toggle("prot-card-body--hidden", !next);
        recalcScore(teamId, side);
      } else if (btn.matches(".prot-cb--inc[data-for=goals]")) {
        goalsH.value = (Number(goalsH.value) || 0) + 1;
        goalsDp.textContent = goalsH.value;
        recalcScore(teamId, side);
      } else if (btn.matches(".prot-cb--dec[data-for=goals]")) {
        goalsH.value = Math.max(0, (Number(goalsH.value) || 0) - 1);
        goalsDp.textContent = goalsH.value;
        recalcScore(teamId, side);
      } else if (btn.matches(".prot-cb--inc[data-for=yellow]")) {
        yellowH.value = Math.min(2, (Number(yellowH.value) || 0) + 1);
        ycDp.textContent = yellowH.value;
      } else if (btn.matches(".prot-cb--dec[data-for=yellow]")) {
        yellowH.value = Math.max(0, (Number(yellowH.value) || 0) - 1);
        ycDp.textContent = yellowH.value;
      } else if (btn.matches(".prot-toggle[data-for=red]")) {
        const next = Number(redH.value) ? 0 : 1;
        redH.value = next;
        btn.textContent = next ? "TAK ✓" : "NIE";
        btn.classList.toggle("prot-toggle--on", !!next);
      }
    });
  });

  // Spinnery do wyników połów
  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-spin-btn");
    if (!btn) return;
    const inp = document.getElementById(btn.dataset.inp);
    if (!inp) return;
    inp.value = Math.max(0, (Number(inp.value) || 0) + Number(btn.dataset.delta));
  });

  // Checkbox rzutów karnych
  const pkCb = document.getElementById("fb-has-pk");
  if (pkCb) pkCb.onchange = () => {
    const sec = document.getElementById("fb-pk-section");
    if (sec) sec.style.display = pkCb.checked ? "" : "none";
  };

  // Przełączniki wyniku rzutu karnego
  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-pk-btn");
    if (!btn) return;
    const grp = btn.closest(".prot-pk-btns");
    if (!grp) return;
    grp.querySelectorAll(".prot-pk-btn").forEach(b => b.classList.remove("prot-pk-btn--active", "prot-pk-btn--goal", "prot-pk-btn--saved", "prot-pk-btn--miss"));
    const cls = btn.dataset.result === "hit" ? "prot-pk-btn--goal" : btn.dataset.result === "saved" ? "prot-pk-btn--saved" : "prot-pk-btn--miss";
    btn.classList.add("prot-pk-btn--active", cls);
    const hid = grp.querySelector("[name=pk_result]");
    if (hid) hid.value = btn.dataset.result;
  });

  // Dodaj dogrywkę
  document.getElementById("fb-add-period")?.addEventListener("click", () => {
    const tbody = document.getElementById("fb-periods-tbody");
    const n = tbody.querySelectorAll(".fb-period-row").length + 1;
    if (n > 4) { mzToast("Maksymalnie 4 części.", "err"); return; }
    const tr = document.createElement("tr");
    tr.className = "fb-period-row"; tr.dataset.period = n;
    tr.innerHTML = `
      <td class="prot-tbl-lbl">${PERIOD_LABELS[n - 1] || `Część ${n}`}</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t1" data-delta="-1">−</button>
        <input id="fp-p${n}-t1" type="number" class="prot-spin-inp" name="pts_t1" data-period="${n}" min="0" value="">
        <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t1" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sep">:</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t2" data-delta="-1">−</button>
        <input id="fp-p${n}-t2" type="number" class="prot-spin-inp" name="pts_t2" data-period="${n}" min="0" value="">
        <button type="button" class="prot-spin-btn" data-inp="fp-p${n}-t2" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t1_period" data-period="${n}" min="0" max="10" value=""></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t2_period" data-period="${n}" min="0" max="10" value=""></td>`;
    tbody.appendChild(tr);
  });

  // Dodaj zawodnika — drużyna A i B
  document.getElementById("fb-add-player-t1")?.addEventListener("click", function () {
    const currentSquad1 = Array.from(document.querySelectorAll("#fb-roster-t1 .fb-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team1_id, "fb-roster-t1",
      (p, tid) => buildPlayerCard(p, tid),
      (tid) => recalcScore(tid, "t1"),
      allPeople, [...(squad1 || []), ...currentSquad1]
    );
  });

  document.getElementById("fb-add-player-t2")?.addEventListener("click", function () {
    const currentSquad2 = Array.from(document.querySelectorAll("#fb-roster-t2 .fb-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team2_id, "fb-roster-t2",
      (p, tid) => buildPlayerCard(p, tid),
      (tid) => recalcScore(tid, "t2"),
      allPeople, [...(squad2 || []), ...currentSquad2]
    );
  });

  // Dodaj sędziego
  document.getElementById("fb-add-referee")?.addEventListener("click", function () {
    protToggleAddReferee(this);
  });

  // Zaznacz wszystkich / wszyscy ławka
  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-lineup-all-btn");
    if (!btn) return;
    const roster = document.getElementById(btn.dataset.roster);
    if (!roster) return;
    const val = Number(btn.dataset.val);
    roster.querySelectorAll(".prot-card").forEach(card => {
      const playingH = card.querySelector("[name=is_playing]");
      const lineupBtn = card.querySelector(".prot-lineup-btn");
      const bodyEl   = card.querySelector(".prot-card-body");
      if (playingH) playingH.value = val;
      if (lineupBtn) { lineupBtn.textContent = val ? "✅ Gra" : "🪑 Ławka"; lineupBtn.classList.toggle("prot-lineup-btn--active", !!val); }
      card.classList.toggle("prot-card--bench", !val);
      if (bodyEl) bodyEl.classList.toggle("prot-card-body--hidden", !val);
    });
    recalcScore(m.team1_id, "t1");
    recalcScore(m.team2_id, "t2");
  });
}

// Football Save

async function mzSaveFootballForm(data, body, m) {
  // 1. Period scores + subs per half
  const periodRowEls = body.querySelectorAll(".fb-period-row");
  const sets = Array.from(periodRowEls).map((row, i) => ({
    set_number: i + 1,
    points_t1:  Number(row.querySelector("[name=pts_t1]")?.value  || 0),
    points_t2:  Number(row.querySelector("[name=pts_t2]")?.value  || 0),
    subs_t1:    Number(row.querySelector("[name=subs_t1_period]")?.value || 0),
    subs_t2:    Number(row.querySelector("[name=subs_t2_period]")?.value || 0),
    to_t1: 0, to_t2: 0,
  }));

  // 1. Periods — delete + insert
  await supabase.from("match_periods").delete().eq("match_id", m.id);
  if (sets.length) {
    await supabase.from("match_periods").insert(sets.map(s => ({ ...s, match_id: m.id })));
  }

  // 2. Final scores
  const scoreData = {};
  body.querySelectorAll("input[name=score]").forEach(inp => {
    scoreData[Number(inp.dataset.team)] = Number(inp.value || 0);
  });

  // 3. PK shootout
  const hasPK = $("fb-has-pk")?.checked;
  const pk_t1 = hasPK ? (Number($("fb-pk-t1")?.value) || 0) : null;
  const pk_t2 = hasPK ? (Number($("fb-pk-t2")?.value) || 0) : null;

  function collectKicks(teamId) {
    const kicks = [];
    body.querySelectorAll(`.fb-pk-kick-row[data-team-id="${teamId}"]`).forEach((row, i) => {
      const sel         = row.querySelector("[name=pk_shooter]");
      const playerId    = sel?.value || "";
      const result      = row.querySelector("[name=pk_result]")?.value || "";
      const selOpt      = sel?.options?.[sel.selectedIndex];
      const shooterName = selOpt?.dataset?.name
        || (selOpt?.text && selOpt.text.includes("\u2014") ? "" : (selOpt?.text || "").trim())
        || "";
      if (playerId || result) {
        kicks.push({ playerId: Number(playerId) || null, shooterName, result, kickIdx: i });
      }
    });
    return kicks;
  }

  // 4. __fb ext for referee_notes JSON
  const ext    = {};
  ext.end_time    = $("fb-end-time")?.value || "";
  // Asystent sędziego — ID do zapisu w DB + nazwa do wyświetlenia w PDF
  const fbRef3El    = $("fb-referee3");
  ext.referee2_id   = Number(fbRef3El?.value) || null;
  ext.referee2      = fbRef3El?.selectedIndex > 0 ? fbRef3El.options[fbRef3El.selectedIndex].text : "";
  // Protokolant II — ID do zapisu + nazwa do PDF
  const fbClerk2El  = $("fb-clerk2");
  ext.clerk2_id     = Number(fbClerk2El?.value) || null;
  ext.clerk2        = fbClerk2El?.selectedIndex > 0 ? fbClerk2El.options[fbClerk2El.selectedIndex].text : "";
  ext.has_pk   = hasPK || false;
  ext.pk_t1    = collectKicks(m.team1_id);
  ext.pk_t2    = collectKicks(m.team2_id);

  // Zapisz skład (kto gra, kto na ławce)
  ext.lineup_t1 = {};
  ext.lineup_t2 = {};
  body.querySelectorAll(".fb-player-row").forEach(row => {
    const pid  = String(row.dataset.playerId);
    const tid  = Number(row.dataset.teamId);
    const val  = Number(row.querySelector("[name=is_playing]")?.value ?? 1);
    if (tid === m.team1_id) ext.lineup_t1[pid] = val;
    else                    ext.lineup_t2[pid] = val;
  });

  const notesText  = $("mz-fill-note-text")?.value || "";
  const serialized = JSON.stringify({ notes_text: notesText, __fb: ext });

  // 5. PK kicks also written to Match_Logs so section 7 shows them
  if (hasPK && (ext.pk_t1.length || ext.pk_t2.length)) {
    const { data: existingLogsRaw } = await supabase.from("match_logs").select("*").eq("match_id", m.id).order("id");
    const existingLogs = existingLogsRaw || [];
    const nonPkLogs = existingLogs
      .filter(l => (l.action_type || "").toLowerCase() !== "penalty")
      .map(l => ({ type: l.action_type, description: l.description, time: l.log_time }));
    const pkLogs = [];
    for (const [kicks, teamName] of [[ext.pk_t1, m.team1_name], [ext.pk_t2, m.team2_name]]) {
      [...kicks].sort((a, b) => (a.kickIdx ?? 0) - (b.kickIdx ?? 0)).forEach(k => {
        if (!k.result) return;
        const label = k.result === "hit" ? "Gol" : k.result === "saved" ? "Obroniony" : "Niecelny";
        pkLogs.push({
          type: "penalty",
          description: `Rzut karny: ${k.shooterName || "Zawodnik"} (${teamName}) \u2014 ${label}`,
          time: null,
        });
      });
    }
    if (pkLogs.length) {
      const allLogs = [...nonPkLogs, ...pkLogs];
      await supabase.from("match_logs").delete().eq("match_id", m.id);
      await supabase.from("match_logs").insert(allLogs.map(l => ({
        match_id: m.id, action_type: l.type, description: l.description, log_time: l.time ?? null,
      })));
    }
  }

  // 6. Update match — football stores notes in referee_notes (JSON {notes_text, __fb})
  const matchTime = $("fb-start-time")?.value ? `${$("fb-start-time").value}:00` : m.match_time;
  await supabase.from("matches").update({
    score_t1:      scoreData[m.team1_id] ?? 0,
    score_t2:      scoreData[m.team2_id] ?? 0,
    shootout_t1:   hasPK ? pk_t1 : null,
    shootout_t2:   hasPK ? pk_t2 : null,
    referee_notes: serialized,
    referee_id:    Number($("fb-referee2")?.value) || null,
    clerk_id:      Number($("fb-clerk1")?.value)   || null,
    location:      $("fb-location")?.value || m.location     || "",
    match_time:    matchTime,
    match_date:    $("fb-date")?.value || m.match_date,
    status:        $("fb-status-quick")?.value || "Rozegrany",
  }).eq("id", m.id);

  // 7. Player stats
  for (const row of body.querySelectorAll(".fb-player-row")) {
    const playerId = Number(row.dataset.playerId);
    const getV     = n => row.querySelector(`[name="${n}"]`)?.value;
    await supabase.from("match_player_stats").upsert({
      match_id: m.id, player_id: playerId,
      total_points_in_match: Number(getV("total_points_in_match") || 0),
      yellow_cards:          Number(getV("yellow_cards") || 0),
      red_card:              Number(getV("red_card") || 0),
      personal_fouls: 0, technical_fouls: 0,
    }, { onConflict: "match_id,player_id" });
  }

  // 8. Team stats (total subs = sum across periods)
  for (const side of ["t1", "t2"]) {
    const teamId    = side === "t1" ? m.team1_id : m.team2_id;
    const totalSubs = sets.reduce((acc, s) => acc + (s[`subs_${side}`] || 0), 0);
    await supabase.from("match_team_stats").upsert({
      match_id: m.id, team_id: teamId,
      timeouts_taken: 0, substitutions_used: totalSubs, team_fouls_count: 0,
    }, { onConflict: "match_id,team_id" });
  }
}

// ── Fill Form ─────────────────────────────────────────────────────────────────

async function mzRenderFillForm(data) {
  const m = data.match;
  const body = $("mz-fill-body");
  body.innerHTML = `<div class="panel-loading">Ładowanie składów…</div>`;

  const [sq1Res, sq2Res, psRes2, ts1Res, ts2Res, peopleRes] = await Promise.all([
    supabase.from("players").select("*, people(*)").eq("team_id", m.team1_id),
    supabase.from("players").select("*, people(*)").eq("team_id", m.team2_id),
    supabase.from("match_player_stats").select("*").eq("match_id", m.id),
    supabase.from("match_team_stats").select("*").eq("match_id", m.id).eq("team_id", m.team1_id).maybeSingle(),
    supabase.from("match_team_stats").select("*").eq("match_id", m.id).eq("team_id", m.team2_id).maybeSingle(),
    supabase.from("people").select("*").order("last_name"),
  ]);
  const [squad1, squad2, existingStats, t1Stats, t2Stats, allPeople] = [
    sq1Res.data || [], sq2Res.data || [], psRes2.data || [],
    ts1Res.data || {}, ts2Res.data || {}, peopleRes.data || [],
  ];

  const statsMap = {};
  (existingStats || []).forEach(s => { statsMap[s.player_id] = s; });

  const isFootball  = m.discipline === "Piłka Nożna";
  const isBasketball = m.discipline === "Koszykówka";
  const isVolleyball = m.discipline === "Siatkówka";

  // ══════════════════════════════════════════════════════
  //  VOLLEYBALL — Full Official Protocol Fill Form
  // ══════════════════════════════════════════════════════
  if (isVolleyball) {
    mzRenderVolleyballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople);
    return;
  }

  // ══════════════════════════════════════════════════════
  //  FOOTBALL — Full Official Protocol Fill Form
  // ══════════════════════════════════════════════════════
  if (isFootball) {
    mzRenderFootballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople);
    return;
  }

  // ══════════════════════════════════════════════════════
  //  BASKETBALL — Full Official Protocol Fill Form
  // ══════════════════════════════════════════════════════
  if (isBasketball) {
    mzRenderBasketballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople);
    return;
  }

  // ── Generic fill form (basketball / fallback) ──────────
  function teamSection(teamName, teamId, players, teamStats) {
    if (!players.length) return `<div class="mz-fill-empty">Brak zawodników w drużynie ${teamName}</div>`;
    return `
      <div class="mz-fill-team-section">
        <div class="mz-fill-team-hdr">${mzDiscIcon(m.discipline)} ${teamName}</div>

        <div class="mz-fill-team-stats" data-team-id="${teamId}">
          <div class="mz-fill-field-row">
            <label class="mz-fill-label">Wynik końcowy drużyny</label>
            <input type="number" class="mz-fill-input" name="score"
              data-field="score" data-team="${teamId}" min="0"
              value="${teamId === m.team1_id ? (m.score_t1 ?? "") : (m.score_t2 ?? "")}"
              placeholder="Wynik" />
          </div>
          ${isFootball ? `
          <div class="mz-fill-field-row mz-fill-shootout-row">
            <label class="mz-fill-label">🥅 Rzuty karne <span class="mz-fill-label-note">(tylko jeśli remis po regulaminowym czasie)</span></label>
            <div class="mz-fill-shootout-inputs">
              <input type="number" class="mz-fill-input mz-fill-input--pen" name="shootout"
                data-team="${teamId}" min="0" max="99"
                value="${teamId === m.team1_id ? (m.shootout_t1 ?? "") : (m.shootout_t2 ?? "")}"
                placeholder="— brak —" />
            </div>
          </div>` : ""}
          <div class="mz-fill-row3">
            <div class="mz-fill-field-sm">
              <label>⏸ Przerwy</label>
              <input type="number" class="mz-fill-input" name="timeouts_taken"
                data-team="${teamId}" min="0" value="${teamStats.timeouts_taken ?? 0}" />
            </div>
            <div class="mz-fill-field-sm">
              <label>🔄 Zmiany</label>
              <input type="number" class="mz-fill-input" name="substitutions_used"
                data-team="${teamId}" min="0" value="${teamStats.substitutions_used ?? 0}" />
            </div>
            ${!isFootball ? `<div class="mz-fill-field-sm">
              <label>⚠️ Faule drużyny</label>
              <input type="number" class="mz-fill-input" name="team_fouls_count"
                data-team="${teamId}" min="0" value="${teamStats.team_fouls_count ?? 0}" />
            </div>` : ""}
          </div>
        </div>

        <div class="mz-fill-players">
          <div class="mz-fill-players-hdr">
            <span>Zawodnik</span>
            <span>Pkt</span>
            ${isFootball  ? "<span>Żółte</span><span>Czerwona</span>" : ""}
            ${isBasketball ? "<span>Faule os.</span><span>Faule techn.</span>" : ""}
          </div>
          ${players.map(p => {
            const s = statsMap[p.id] || {};
            return `
              <div class="mz-fill-player-row" data-player-id="${p.id}" data-team-id="${teamId}">
                <span class="mz-fill-pname">${p.last_name} ${p.first_name}${p.is_captain ? " ©" : ""}
                  ${p.class_name ? `<em>${p.class_name}</em>` : ""}
                </span>
                <input type="number" class="mz-fill-input mz-fill-sm" name="total_points_in_match"
                  min="0" value="${s.total_points_in_match ?? 0}" placeholder="Pkt" />
                ${isFootball ? `
                  <input type="number" class="mz-fill-input mz-fill-sm" name="yellow_cards"
                    min="0" max="2" value="${s.yellow_cards ?? 0}" />
                  <select class="mz-fill-select mz-fill-sm" name="red_card">
                    <option value="0" ${!s.red_card ? "selected" : ""}>—</option>
                    <option value="1" ${s.red_card  ? "selected" : ""}>TAK</option>
                  </select>
                ` : ""}
                ${isBasketball ? `
                  <input type="number" class="mz-fill-input mz-fill-sm" name="personal_fouls"
                    min="0" value="${s.personal_fouls ?? 0}" />
                  <input type="number" class="mz-fill-input mz-fill-sm" name="technical_fouls"
                    min="0" value="${s.technical_fouls ?? 0}" />
                ` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  body.innerHTML = `
    <div class="mz-fill-note">
      <label class="mz-fill-label">📝 Notatka sędziego</label>
      <textarea class="mz-fill-textarea" id="mz-fill-note-text" rows="3" placeholder="Wpisz notatki sędziego…">${m.referee_notes || ""}</textarea>
    </div>
    <div class="mz-fill-teams-grid">
      ${teamSection(m.team1_name, m.team1_id, squad1 || [], t1Stats)}
      ${teamSection(m.team2_name, m.team2_id, squad2 || [], t2Stats)}
    </div>
  `;
}

// ── Volleyball Fill Form ──────────────────────────────────────────────────────

function mzRenderVolleyballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople) {
  const m    = data.match;
  const sets = data.sets || [];
  const { notes_text, ext } = vbParseExtended(m.referee_notes);
  const playerRolesT1 = ext.players_t1 || {};
  const playerRolesT2 = ext.players_t2 || {};
  const setData       = ext.set_data || [];
  const lineupT1      = ext.lineup_t1 || {};
  const lineupT2      = ext.lineup_t2 || {};
  const setCount      = Math.max(sets.length, 3);

  const referees     = (allPeople || []).filter(p => p.role === "Sędzia");
  const protokolanci = (allPeople || []).filter(p => p.role === "Protokolant");

  // ── Wiersz seta ──────────────────────────────────────────────────────────
  function buildSetRow(i) {
    const s  = sets[i] || { points_t1: 0, points_t2: 0 };
    const sd = setData[i] || {};
    const n  = i + 1;
    return `<tr class="vb-set-row" data-set="${n}">
      <td class="prot-tbl-lbl">${ROMAN[i] || n}</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t1" data-delta="-1">−</button>
        <input id="vb-s${n}-t1" type="number" class="prot-spin-inp" name="pts_t1" data-set="${n}" min="0" value="${s.points_t1 || 0}">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t1" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sep">:</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t2" data-delta="-1">−</button>
        <input id="vb-s${n}-t2" type="number" class="prot-spin-inp" name="pts_t2" data-set="${n}" min="0" value="${s.points_t2 || 0}">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t2" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="set_duration" data-set="${n}" min="0" max="99" value="${sd.duration_min || ""}" placeholder="min"></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t1" data-set="${n}" min="0" max="2" value="${sd.to_t1 ?? ""}"></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t1" data-set="${n}" min="0" max="6" value="${sd.subs_t1 ?? ""}"></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t2" data-set="${n}" min="0" max="2" value="${sd.to_t2 ?? ""}"></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t2" data-set="${n}" min="0" max="6" value="${sd.subs_t2 ?? ""}"></td>
    </tr>`;
  }

  // ── Skład drużyny ─────────────────────────────────────────────────────────
  function buildRoster(players, rolesMap, teamId) {
    if (!players.length) return `<div class="mz-fill-empty">Brak zawodników.</div>`;
    const lineup = teamId === m.team1_id ? lineupT1 : lineupT2;
    return players.map(p => {
      const role        = rolesMap[p.id] || {};
      const s           = statsMap[p.id] || {};
      const defaultFunc = p.is_captain ? "C" : "";
      const playing     = String(p.id) in lineup ? lineup[String(p.id)] : 1;
      return `
        <div class="prot-card vb-player-row ${playing ? "" : "prot-card--bench"}" data-player-id="${p.id}" data-team-id="${teamId}">
          <input type="hidden" name="is_playing" value="${playing}">
          <div class="prot-card-hdr">
            <span class="prot-pname">${p.last_name} ${p.first_name}${p.is_captain ? " ©" : ""}${p.class_name ? ` <em class="prot-cls">${p.class_name}</em>` : ""}</span>
            <button type="button" class="prot-lineup-btn ${playing ? "prot-lineup-btn--active" : ""}" data-for="lineup">
              ${playing ? "✅ Gra" : "🪑 Ławka"}
            </button>
          </div>
          <div class="prot-card-body prot-card-body--row ${playing ? "" : "prot-card-body--hidden"}">
            <div class="prot-stat-row">
              <span class="prot-stat-lbl">Nr koszulki</span>
              <input type="text" class="prot-nr-inp" name="vb_jersey" value="${role.jersey || ""}" placeholder="Nr" maxlength="3">
            </div>
            <div class="prot-stat-row">
              <span class="prot-stat-lbl">Funkcja</span>
              <div class="prot-func-btns">
                <button type="button" class="prot-func-btn ${(role.func || defaultFunc) === "C" ? "prot-func-btn--active" : ""}" data-func="C">C kapitan</button>
                <button type="button" class="prot-func-btn ${role.func === "L" ? "prot-func-btn--active" : ""}" data-func="L">L libero</button>
                <input type="hidden" name="vb_func" value="${role.func || defaultFunc || ""}">
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // Automatyczny wynik setów
  const autoT1 = sets.filter(s => s.points_t1 > s.points_t2).length || 0;
  const autoT2 = sets.filter(s => s.points_t2 > s.points_t1).length || 0;

  body.innerHTML = `
    <!-- 1. Dane meczu -->
    <div class="prot-section">
      <div class="prot-section-hdr">📋 1. Dane meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">📅 Data</label>
          <input type="date" class="mz-fill-input" id="vb-date" value="${m.match_date ? m.match_date.slice(0, 10) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">Status meczu</label>
          <select class="mz-fill-input" id="vb-status-quick">
            <option value="Planowany"  ${m.status === "Planowany"  ? "selected" : ""}>📅 Planowany</option>
            <option value="Rozegrany"  ${m.status === "Rozegrany"  ? "selected" : ""}>✅ Rozegrany</option>
            <option value="Odwołany"   ${m.status === "Odwołany"   ? "selected" : ""}>❌ Odwołany</option>
            <option value="Walkower"   ${m.status === "Walkower"   ? "selected" : ""}>🏳 Walkower</option>
          </select></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina rozpoczęcia</label>
          <input type="time" class="mz-fill-input" id="vb-start-time" value="${m.match_time ? m.match_time.slice(0, 5) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina zakończenia</label>
          <input type="time" class="mz-fill-input" id="vb-end-time" value="${ext.end_time || ""}"></div>
      </div>
      <div class="prot-field"><label class="prot-lbl">🏟 Hala / miejsce</label>
        <input type="text" class="mz-fill-input" id="vb-location" value="${m.location || ""}" placeholder="Nazwa hali, adres"></div>
    </div>

    <!-- 2. Wynik meczu (sety) -->
    <div class="prot-section prot-section--score">
      <div class="prot-section-hdr">🏐 2. Wynik meczu (sety wygrane)</div>
      <div class="prot-scoreboard">
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team1_name}</div>
          <div class="prot-sb-val" id="vb-live-t1">${m.score_t1 ?? autoT1}</div>
        </div>
        <div class="prot-sb-sep">:</div>
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team2_name}</div>
          <div class="prot-sb-val" id="vb-live-t2">${m.score_t2 ?? autoT2}</div>
        </div>
      </div>
      <input type="hidden" name="score" data-team="${m.team1_id}" value="${m.score_t1 ?? autoT1}">
      <input type="hidden" name="score" data-team="${m.team2_id}" value="${m.score_t2 ?? autoT2}">
      <p class="prot-hint">Wynik setów aktualizuje się po wpisaniu wyników poniżej</p>
    </div>

    <!-- 3. Wyniki setów -->
    <div class="prot-section">
      <div class="prot-section-hdr">📊 3. Wyniki setów, czas i przerwy</div>
      <div class="prot-tbl-wrap">
        <table class="prot-tbl">
          <thead><tr>
            <th>Set</th>
            <th colspan="3">Wynik<small><br>${m.team1_name} : ${m.team2_name}</small></th>
            <th>Czas</th>
            <th>TO-A</th>
            <th>Zm-A</th>
            <th>TO-B</th>
            <th>Zm-B</th>
          </tr></thead>
          <tbody id="vb-sets-tbody">${Array.from({ length: setCount }, (_, i) => buildSetRow(i)).join("")}</tbody>
        </table>
      </div>
      <button type="button" class="prot-add-btn" id="mz-fill-add-set">+ Dodaj set</button>
    </div>

    <!-- 4+5. Składy drużyn -->
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">👥 4. Skład — ${m.team1_name}</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="vb-roster-t1" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="vb-roster-t1" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="vb-roster-t1">${buildRoster(squad1 || [], playerRolesT1, m.team1_id)}</div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="vb-add-player-t1">+ Dodaj zawodnika do ${m.team1_name}</button>
    </div>
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">👥 5. Skład — ${m.team2_name}</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="vb-roster-t2" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="vb-roster-t2" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="vb-roster-t2">${buildRoster(squad2 || [], playerRolesT2, m.team2_id)}</div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="vb-add-player-t2">+ Dodaj zawodnika do ${m.team2_name}</button>
    </div>

    <!-- 6. Sędziowie -->
    <div class="prot-section">
      <div class="prot-section-hdr">⚖️ 6. Sędziowie i obsługa meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">Sędzia I</label>
          ${protBuildOfficialSelect(referees, m.referee_id || "", "vb-referee1", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Sędzia II</label>
          ${protBuildOfficialSelect(referees, ext.referee2_id || "", "vb-referee2", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Sekretarz</label>
          ${protBuildOfficialSelect(protokolanci, m.clerk_id || "", "vb-clerk", [], "wybierz sekretarza")}</div>
        <div class="prot-field"><label class="prot-lbl">Asystent sekretarza</label>
          ${protBuildOfficialSelect(protokolanci, ext.assistant_clerk_id || "", "vb-assistant-clerk", [], "wybierz asystenta")}</div>
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--referee" id="vb-add-referee">+ Dodaj nowego sędziego / protokolanta do bazy</button>
    </div>

    <!-- 7. Uwagi -->
    <div class="prot-section">
      <div class="prot-section-hdr">📝 7. Uwagi sędziowskie / organizacyjne</div>
      <textarea class="mz-fill-textarea" id="mz-fill-note-text" rows="4" placeholder="Wpisz uwagi…">${notes_text || ""}</textarea>
    </div>

    <!-- hidden team stats (required by generic save) -->
    <div class="mz-fill-team-stats" data-team-id="${m.team1_id}" style="display:none">
      <input type="number" name="timeouts_taken" data-team="${m.team1_id}" value="0">
      <input type="number" name="substitutions_used" data-team="${m.team1_id}" value="0">
      <input type="number" name="team_fouls_count" data-team="${m.team1_id}" value="0">
    </div>
    <div class="mz-fill-team-stats" data-team-id="${m.team2_id}" style="display:none">
      <input type="number" name="timeouts_taken" data-team="${m.team2_id}" value="0">
      <input type="number" name="substitutions_used" data-team="${m.team2_id}" value="0">
      <input type="number" name="team_fouls_count" data-team="${m.team2_id}" value="0">
    </div>
  `;

  // ── Interaktywność ───────────────────────────────────────────────────────

  // Spinnery wyników setów + auto-przelicz wynik meczu
  function recalcSetScore() {
    const rows = document.getElementById("vb-sets-tbody")?.querySelectorAll(".vb-set-row") || [];
    let w1 = 0, w2 = 0;
    rows.forEach(row => {
      const v1 = Number(row.querySelector("[name=pts_t1]")?.value || 0);
      const v2 = Number(row.querySelector("[name=pts_t2]")?.value || 0);
      if (v1 > v2) w1++;
      else if (v2 > v1) w2++;
    });
    const lT1 = document.getElementById("vb-live-t1");
    const lT2 = document.getElementById("vb-live-t2");
    if (lT1) lT1.textContent = w1;
    if (lT2) lT2.textContent = w2;
    body.querySelector(`[name=score][data-team="${m.team1_id}"]`).value = w1;
    body.querySelector(`[name=score][data-team="${m.team2_id}"]`).value = w2;
  }

  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-spin-btn");
    if (!btn) return;
    const inp = document.getElementById(btn.dataset.inp);
    if (!inp) return;
    inp.value = Math.max(0, (Number(inp.value) || 0) + Number(btn.dataset.delta));
    if (inp.name === "pts_t1" || inp.name === "pts_t2") recalcSetScore();
  });

  body.addEventListener("input", e => {
    if (e.target.name === "pts_t1" || e.target.name === "pts_t2") recalcSetScore();
  });

  // Przyciski funkcji zawodnika (C/L) i lineup
  body.addEventListener("click", e => {
    // Lineup toggle
    const lineupBtn = e.target.closest(".prot-lineup-btn");
    if (lineupBtn) {
      const card = lineupBtn.closest(".prot-card");
      const hid  = card?.querySelector("[name=is_playing]");
      const val  = Number(hid?.value ?? 1);
      const next = val ? 0 : 1;
      if (hid) hid.value = next;
      lineupBtn.textContent = next ? "✅ Gra" : "🪑 Ławka";
      lineupBtn.classList.toggle("prot-lineup-btn--active", !!next);
      card.classList.toggle("prot-card--bench", !next);
      const bodyEl = card?.querySelector(".prot-card-body");
      if (bodyEl) bodyEl.classList.toggle("prot-card-body--hidden", !next);
      return;
    }

    // Zaznacz wszystkich / ławka
    const allBtn = e.target.closest(".prot-lineup-all-btn");
    if (allBtn) {
      const roster = document.getElementById(allBtn.dataset.roster);
      const val = Number(allBtn.dataset.val);
      roster?.querySelectorAll(".prot-card").forEach(card => {
        const ph = card.querySelector("[name=is_playing]");
        const lb = card.querySelector(".prot-lineup-btn");
        const be = card.querySelector(".prot-card-body");
        if (ph) ph.value = val;
        if (lb) { lb.textContent = val ? "✅ Gra" : "🪑 Ławka"; lb.classList.toggle("prot-lineup-btn--active", !!val); }
        card.classList.toggle("prot-card--bench", !val);
        if (be) be.classList.toggle("prot-card-body--hidden", !val);
      });
      return;
    }

    // Funkcja C/L
    const btn = e.target.closest(".prot-func-btn");
    if (!btn) return;
    const card = btn.closest(".prot-card");
    const hid  = card?.querySelector("[name=vb_func]");
    const grp  = btn.closest(".prot-func-btns");
    const func = btn.dataset.func;
    const isActive = btn.classList.contains("prot-func-btn--active");
    grp.querySelectorAll(".prot-func-btn").forEach(b => b.classList.remove("prot-func-btn--active"));
    if (!isActive) {
      btn.classList.add("prot-func-btn--active");
      if (hid) hid.value = func;
    } else {
      if (hid) hid.value = "";
    }
  });

  // Dodaj set
  document.getElementById("mz-fill-add-set")?.addEventListener("click", () => {
    const tbody = document.getElementById("vb-sets-tbody");
    const n = tbody.querySelectorAll(".vb-set-row").length + 1;
    if (n > 5) { mzToast("Siatkówka ma maksymalnie 5 setów.", "err"); return; }
    const tr = document.createElement("tr");
    tr.className = "vb-set-row"; tr.dataset.set = n;
    tr.innerHTML = `
      <td class="prot-tbl-lbl">${ROMAN[n - 1] || n}</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t1" data-delta="-1">−</button>
        <input id="vb-s${n}-t1" type="number" class="prot-spin-inp" name="pts_t1" data-set="${n}" min="0" value="0">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t1" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sep">:</td>
      <td class="prot-tbl-spin"><div class="prot-spin">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t2" data-delta="-1">−</button>
        <input id="vb-s${n}-t2" type="number" class="prot-spin-inp" name="pts_t2" data-set="${n}" min="0" value="0">
        <button type="button" class="prot-spin-btn" data-inp="vb-s${n}-t2" data-delta="1">+</button>
      </div></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="set_duration" data-set="${n}" min="0" max="99" value="" placeholder="min"></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t1" data-set="${n}" min="0" max="2" value=""></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t1" data-set="${n}" min="0" max="6" value=""></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t2" data-set="${n}" min="0" max="2" value=""></td>
      <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t2" data-set="${n}" min="0" max="6" value=""></td>`;
    tbody.appendChild(tr);
  });

  // Dodaj zawodnika VB
  document.getElementById("vb-add-player-t1")?.addEventListener("click", function () {
    const currentSquad = Array.from(document.querySelectorAll("#vb-roster-t1 .vb-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team1_id, "vb-roster-t1",
      (p, tid) => buildRoster([p], {}, tid),
      null, allPeople, [...(squad1 || []), ...currentSquad]);
  });
  document.getElementById("vb-add-player-t2")?.addEventListener("click", function () {
    const currentSquad = Array.from(document.querySelectorAll("#vb-roster-t2 .vb-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team2_id, "vb-roster-t2",
      (p, tid) => buildRoster([p], {}, tid),
      null, allPeople, [...(squad2 || []), ...currentSquad]);
  });

  // Dodaj sędziego VB
  document.getElementById("vb-add-referee")?.addEventListener("click", function () {
    protToggleAddReferee(this);
  });
}

// ── Save Form ─────────────────────────────────────────────────────────────────

async function mzSaveFillForm(data) {
  const m = data.match;
  const body = $("mz-fill-body");
  $("mz-fill-save").disabled = true;
  $("mz-fill-save").textContent = "Zapisywanie…";

  try {
    // ══════════════════════════════════════════════════════
    //  VOLLEYBALL — Extended save
    // ══════════════════════════════════════════════════════
    if (m.discipline === "Siatkówka") {
      await mzSaveVolleyballForm(data, body, m);
    } else if (m.discipline === "Piłka Nożna") {
      await mzSaveFootballForm(data, body, m);
    } else if (m.discipline === "Koszykówka") {
      await mzSaveBasketballForm(data, body, m);
    } else {
      // ── Generic save ──────────────────────────────────────
      const noteText = $("mz-fill-note-text")?.value || "";
      await supabase.from("matches").update({ referee_notes: noteText }).eq("id", m.id);

      const scoreInputs = body.querySelectorAll("input[name=score]");
      const scoreData = {};
      scoreInputs.forEach(inp => { scoreData[Number(inp.dataset.team)] = Number(inp.value || 0); });

      const shootoutInputs = body.querySelectorAll("input[name=shootout]");
      const shootoutData = {};
      shootoutInputs.forEach(inp => {
        const tid = Number(inp.dataset.team);
        const v = inp.value.trim();
        shootoutData[tid] = v !== "" ? Number(v) : null;
      });
      const shootoutValid = shootoutInputs.length === 2
        && shootoutData[m.team1_id] != null
        && shootoutData[m.team2_id] != null;

      await supabase.from("matches").update({
        score_t1: scoreData[m.team1_id] ?? 0,
        score_t2: scoreData[m.team2_id] ?? 0,
        shootout_t1: shootoutValid ? shootoutData[m.team1_id] : null,
        shootout_t2: shootoutValid ? shootoutData[m.team2_id] : null,
        status: "Rozegrany",
      }).eq("id", m.id);

      for (const teamId of [m.team1_id, m.team2_id]) {
        const section = body.querySelector(`.mz-fill-team-stats[data-team-id="${teamId}"]`);
        if (!section) continue;
        const getVal = name => Number(section.querySelector(`[name="${name}"][data-team="${teamId}"]`)?.value || 0);
        await supabase.from("match_team_stats").upsert({
          match_id: m.id, team_id: teamId,
          timeouts_taken: getVal("timeouts_taken"),
          substitutions_used: getVal("substitutions_used"),
          team_fouls_count: getVal("team_fouls_count"),
        }, { onConflict: "match_id,team_id" });
      }

      const playerRows = body.querySelectorAll(".mz-fill-player-row");
      for (const row of playerRows) {
        const playerId = Number(row.dataset.playerId);
        const getV = name => row.querySelector(`[name="${name}"]`)?.value;
        await supabase.from("match_player_stats").upsert({
          match_id: m.id,
          player_id: playerId,
          total_points_in_match: Number(getV("total_points_in_match") || 0),
          yellow_cards: Number(getV("yellow_cards") || 0),
          red_card: Number(getV("red_card") || 0),
          personal_fouls: Number(getV("personal_fouls") || 0),
          technical_fouls: Number(getV("technical_fouls") || 0),
        }, { onConflict: "match_id,player_id" });
      }
    }

    mzToast("✅ Protokół zapisany pomyślnie!", "ok");

    const [fmRes, fsRes, fpRes, ftRes] = await Promise.all([
      supabase.from("matches_full").select("*").eq("id", m.id).single(),
      supabase.from("match_periods").select("*").eq("match_id", m.id).order("set_number"),
      supabase.from("player_stats_full").select("*").eq("match_id", m.id),
      supabase.from("match_team_stats").select("*").eq("match_id", m.id),
    ]);
    const freshData = { match: fmRes.data, sets: fsRes.data || [], playerStats: fpRes.data || [], teamStats: ftRes.data || [] };
    MZ.currentMatch = freshData.match;
    MZ.currentMatchData = freshData;
    mzRenderDetailHeader(freshData);

  } catch (e) {
    console.error(e);
    mzToast("❌ Błąd zapisu danych.", "err");
  } finally {
    $("mz-fill-save").disabled = false;
    $("mz-fill-save").textContent = "💾 Zapisz";
  }
}

// ── Volleyball Save ───────────────────────────────────────────────────────────

async function mzSaveVolleyballForm(data, body, m) {
  // 1. Collect sets data — w tym TO i zmiany per set (BUG-03 fix)
  const setRows = body.querySelectorAll(".vb-set-row");
  const sets = Array.from(setRows).map((row, i) => ({
    set_number: i + 1,
    points_t1: Number(row.querySelector("[name=pts_t1]")?.value || 0),
    points_t2: Number(row.querySelector("[name=pts_t2]")?.value || 0),
    to_t1:   Number(row.querySelector("[name=to_t1]")?.value   || 0) || 0,
    to_t2:   Number(row.querySelector("[name=to_t2]")?.value   || 0) || 0,
    subs_t1: Number(row.querySelector("[name=subs_t1]")?.value || 0) || 0,
    subs_t2: Number(row.querySelector("[name=subs_t2]")?.value || 0) || 0,
  }));

  // 2. Save sets to DB
  await supabase.from("match_periods").delete().eq("match_id", m.id);
  if (sets.length) {
    await supabase.from("match_periods").insert(sets.map(s => ({ ...s, match_id: m.id })));
  }

  // 3. Calculate sets won (score)
  const scoreInput_t1 = body.querySelector(`input[name=score][data-team="${m.team1_id}"]`);
  const scoreInput_t2 = body.querySelector(`input[name=score][data-team="${m.team2_id}"]`);
  let score_t1 = scoreInput_t1 ? Number(scoreInput_t1.value) : null;
  let score_t2 = scoreInput_t2 ? Number(scoreInput_t2.value) : null;
  // Auto-calculate from sets if not manually entered
  if (score_t1 == null || score_t2 == null || (score_t1 === 0 && score_t2 === 0 && sets.length)) {
    score_t1 = sets.filter(s => s.points_t1 > s.points_t2).length;
    score_t2 = sets.filter(s => s.points_t2 > s.points_t1).length;
  }

  // 4. Collect extended volleyball data
  const ext = {};
  ext.end_time           = $("vb-end-time")?.value || "";
  // Sędzia II — ID do DB + nazwa do PDF
  const vbRef2El          = $("vb-referee2");
  ext.referee2_id         = Number(vbRef2El?.value) || null;
  ext.referee2            = vbRef2El?.selectedIndex > 0 ? vbRef2El.options[vbRef2El.selectedIndex].text : "";
  // Asystent sekretarza — ID do DB + nazwa do PDF
  const vbAsstEl          = $("vb-assistant-clerk");
  ext.assistant_clerk_id  = Number(vbAsstEl?.value) || null;
  ext.assistant_clerk     = vbAsstEl?.selectedIndex > 0 ? vbAsstEl.options[vbAsstEl.selectedIndex].text : "";

  // Per-set extended data
  ext.set_data = Array.from(setRows).map((row, i) => ({
    set_number: i + 1,
    duration_min: Number(row.querySelector("[name=set_duration]")?.value || 0) || null,
    to_t1:   Number(row.querySelector("[name=to_t1]")?.value  || 0) || null,
    subs_t1: Number(row.querySelector("[name=subs_t1]")?.value || 0) || null,
    to_t2:   Number(row.querySelector("[name=to_t2]")?.value  || 0) || null,
    subs_t2: Number(row.querySelector("[name=subs_t2]")?.value || 0) || null,
  }));

  // Player roles (jersey + function) + lineup
  ext.players_t1 = {};
  ext.players_t2 = {};
  ext.lineup_t1  = {};
  ext.lineup_t2  = {};
  body.querySelectorAll(".vb-player-row").forEach(row => {
    const pid = String(row.dataset.playerId);
    const tid = Number(row.dataset.teamId);
    const jersey  = row.querySelector("[name=vb_jersey]")?.value || "";
    const func    = row.querySelector("[name=vb_func]")?.value || "";
    const playing = Number(row.querySelector("[name=is_playing]")?.value ?? 1);
    if (tid === m.team1_id) {
      ext.players_t1[pid] = { jersey, func };
      ext.lineup_t1[pid]  = playing;
    } else {
      ext.players_t2[pid] = { jersey, func };
      ext.lineup_t2[pid]  = playing;
    }
  });

  // Notes text
  const notesText = $("mz-fill-note-text")?.value || "";

  // Serialize extended data into referee_notes
  const serialized = vbSerializeExtended(notesText, ext);

  // 5. Save match meta (referee IDs, location, time, notes)
  const referee_id = Number($("vb-referee1")?.value)  || null;
  const clerk_id   = Number($("vb-clerk")?.value)      || null;
  const location   = $("vb-location")?.value || m.location || "";
  const matchTime  = $("vb-start-time")?.value ? `${$("vb-start-time").value}:00` : m.match_time;
  const matchDate  = $("vb-date")?.value || m.match_date;

  await supabase.from("matches").update({
    score_t1,
    score_t2,
    referee_id,
    clerk_id,
    location,
    match_time:    matchTime,
    match_date:    matchDate,
    referee_notes: serialized,
    status: $("vb-status-quick")?.value || "Rozegrany",
  }).eq("id", m.id);

  // 6. Save player points
  const playerRows = body.querySelectorAll(".vb-player-row");
  for (const row of playerRows) {
    const playerId = Number(row.dataset.playerId);
    const pts = Number(row.querySelector("[name=total_points_in_match]")?.value || 0);
    await supabase.from("match_player_stats").upsert({
      match_id: m.id,
      player_id: playerId,
      total_points_in_match: pts,
      yellow_cards: 0, red_card: 0, personal_fouls: 0, technical_fouls: 0,
    }, { onConflict: "match_id,player_id" });
  }

  // 7. Save team stats (totals across all sets)
  for (const teamKey of ["t1", "t2"]) {
    const teamId = teamKey === "t1" ? m.team1_id : m.team2_id;
    const totalTO   = ext.set_data.reduce((acc, s) => acc + (s[`to_${teamKey}`]   || 0), 0);
    const totalSubs = ext.set_data.reduce((acc, s) => acc + (s[`subs_${teamKey}`] || 0), 0);
    await supabase.from("match_team_stats").upsert({
      match_id: m.id,
      team_id: teamId,
      timeouts_taken:     totalTO,
      substitutions_used: totalSubs,
      team_fouls_count:   0,
    }, { onConflict: "match_id,team_id" });
  }
}


// ── Basketball Fill Form (mobile-first protocol) ──────────────────────────────

function mzRenderBasketballFillForm(data, body, squad1, squad2, t1Stats, t2Stats, statsMap, allPeople) {
  const m        = data.match;
  const sets     = data.sets || [];
  const quarters = sets.filter(s => s.set_number <= 5);

  const rawNotes = m.referee_notes || m.referee_note || "";
  let notes_text = rawNotes, ext = {};
  try { const p = JSON.parse(rawNotes); notes_text = p.notes_text ?? rawNotes; ext = p.__bk || {}; }
  catch { /* plain text */ }

  const lineupT1 = ext.lineup_t1 || {};
  const lineupT2 = ext.lineup_t2 || {};

  const referees     = (allPeople || []).filter(p => p.role === "Sędzia");
  const protokolanci = (allPeople || []).filter(p => p.role === "Protokolant");
  const QLABELS     = ["K1", "K2", "K3", "K4", "OT"];
  const getQ        = n => quarters.find(q => q.set_number === n) || {};

  // ── Karta zawodnika (koszykówka) ─────────────────────────────────────────
  function buildPlayerCard(p, teamId) {
    const s    = statsMap[p.id] || {};
    const p1   = s.points_1pt  ?? 0;
    const p2   = s.points_2pt  ?? 0;
    const p3   = s.points_3pt  ?? 0;
    const tot  = p1 * 1 + p2 * 2 + p3 * 3 || s.total_points_in_match || 0;
    const pf   = s.personal_fouls  ?? 0;
    const tf   = s.technical_fouls ?? 0;
    const roles   = teamId === m.team1_id ? (ext.players_t1 || {}) : (ext.players_t2 || {});
    const role    = roles[String(p.id)] || {};
    const disq    = pf >= 5 || tf >= 2;
    const lineup  = teamId === m.team1_id ? lineupT1 : lineupT2;
    const playing = String(p.id) in lineup ? lineup[String(p.id)] : 1;
    return `
      <div class="prot-card bk-player-row ${playing ? "" : "prot-card--bench"}" data-player-id="${p.id}" data-team-id="${teamId}">
        <input type="hidden" name="total_points_in_match" value="${tot}">
        <input type="hidden" name="points_1pt" value="${p1}">
        <input type="hidden" name="points_2pt" value="${p2}">
        <input type="hidden" name="points_3pt" value="${p3}">
        <input type="hidden" name="personal_fouls"  value="${pf}">
        <input type="hidden" name="technical_fouls" value="${tf}">
        <input type="hidden" name="is_playing" value="${playing}">
        <div class="prot-card-hdr">
          <div class="prot-card-hdr-left">
            <input type="text" class="prot-nr-inp" name="bk_jersey" value="${role.jersey || ""}" placeholder="Nr" maxlength="3">
            <span class="prot-pname">${p.last_name} ${p.first_name}${p.is_captain ? " ©" : ""}${p.class_name ? ` <em class="prot-cls">${p.class_name}</em>` : ""}</span>
          </div>
          <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
            <div class="prot-total-pts ${disq ? "prot-total-pts--disq" : ""}">
              <span class="prot-total-num" data-type="total">${tot}</span>
              <span class="prot-total-lbl">PKT</span>
              ${disq ? `<span class="prot-disq-badge">DYSKW.</span>` : ""}
            </div>
            <button type="button" class="prot-lineup-btn ${playing ? "prot-lineup-btn--active" : ""}" data-for="lineup">
              ${playing ? "✅ Gra" : "🪑 Ławka"}
            </button>
          </div>
        </div>
        <div class="prot-card-body ${playing ? "" : "prot-card-body--hidden"}">
          <div class="prot-pts-row">
            <div class="prot-pts-grp">
              <div class="prot-pts-lbl">Rzuty wolne<br><small>+1 pkt</small></div>
              <div class="prot-counter">
                <button type="button" class="prot-cb prot-cb--dec" data-for="p1">−</button>
                <span class="prot-cv" data-type="p1">${p1}</span>
                <button type="button" class="prot-cb prot-cb--inc" data-for="p1">+</button>
              </div>
            </div>
            <div class="prot-pts-grp">
              <div class="prot-pts-lbl">Za 2 punkty<br><small>+2 pkt</small></div>
              <div class="prot-counter">
                <button type="button" class="prot-cb prot-cb--dec" data-for="p2">−</button>
                <span class="prot-cv" data-type="p2">${p2}</span>
                <button type="button" class="prot-cb prot-cb--inc" data-for="p2">+</button>
              </div>
            </div>
            <div class="prot-pts-grp">
              <div class="prot-pts-lbl">Za 3 punkty<br><small>+3 pkt</small></div>
              <div class="prot-counter">
                <button type="button" class="prot-cb prot-cb--dec" data-for="p3">−</button>
                <span class="prot-cv" data-type="p3">${p3}</span>
                <button type="button" class="prot-cb prot-cb--inc" data-for="p3">+</button>
              </div>
            </div>
          </div>
          <div class="prot-fouls-row">
            <div class="prot-stat-row">
              <span class="prot-stat-lbl">⚠️ Faule osobiste (maks. 5)</span>
              <div class="prot-counter prot-counter--sm">
                <button type="button" class="prot-cb prot-cb--dec" data-for="pf">−</button>
                <span class="prot-cv prot-cv--foul" data-type="pf">${pf}</span>
                <button type="button" class="prot-cb prot-cb--inc" data-for="pf">+</button>
              </div>
            </div>
            <div class="prot-stat-row">
              <span class="prot-stat-lbl">⛔ Faule techniczne (maks. 2)</span>
              <div class="prot-counter prot-counter--sm">
                <button type="button" class="prot-cb prot-cb--dec" data-for="tf">−</button>
                <span class="prot-cv prot-cv--foul" data-type="tf">${tf}</span>
                <button type="button" class="prot-cb prot-cb--inc" data-for="tf">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Wiersz kwarty ─────────────────────────────────────────────────────────
  function buildQuarterRows() {
    return [1, 2, 3, 4, 5].map(n => {
      const q  = getQ(n);
      const qd = (ext.quarter_data || {})[n] || {};
      return `<tr class="bk-quarter-row" data-quarter="${n}">
        <td class="prot-tbl-lbl">${QLABELS[n - 1]}</td>
        <td class="prot-tbl-spin"><div class="prot-spin">
          <button type="button" class="prot-spin-btn" data-inp="bk-q${n}-t1" data-delta="-1">−</button>
          <input id="bk-q${n}-t1" type="number" class="prot-spin-inp" name="pts_t1" data-quarter="${n}" min="0" value="${q.points_t1 ?? ""}">
          <button type="button" class="prot-spin-btn" data-inp="bk-q${n}-t1" data-delta="1">+</button>
        </div></td>
        <td class="prot-tbl-sep">:</td>
        <td class="prot-tbl-spin"><div class="prot-spin">
          <button type="button" class="prot-spin-btn" data-inp="bk-q${n}-t2" data-delta="-1">−</button>
          <input id="bk-q${n}-t2" type="number" class="prot-spin-inp" name="pts_t2" data-quarter="${n}" min="0" value="${q.points_t2 ?? ""}">
          <button type="button" class="prot-spin-btn" data-inp="bk-q${n}-t2" data-delta="1">+</button>
        </div></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t1" data-quarter="${n}" min="0" max="3" value="${qd.to_t1 ?? ""}"></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="to_t2" data-quarter="${n}" min="0" max="3" value="${qd.to_t2 ?? ""}"></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t1" data-quarter="${n}" min="0" max="10" value="${qd.subs_t1 ?? ""}"></td>
        <td class="prot-tbl-sm"><input type="number" class="prot-spin-inp" name="subs_t2" data-quarter="${n}" min="0" max="10" value="${qd.subs_t2 ?? ""}"></td>
      </tr>`;
    }).join("");
  }

  // Live score z kwart
  const initT1 = quarters.reduce((s, q) => s + (q.points_t1 || 0), 0) || (m.score_t1 ?? 0);
  const initT2 = quarters.reduce((s, q) => s + (q.points_t2 || 0), 0) || (m.score_t2 ?? 0);

  body.innerHTML = `
    <!-- 1. Dane meczu -->
    <div class="prot-section">
      <div class="prot-section-hdr">📋 1. Dane meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">📅 Data</label>
          <input type="date" class="mz-fill-input" id="bk-date" value="${m.match_date ? m.match_date.slice(0, 10) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">Status meczu</label>
          <select class="mz-fill-input" id="bk-status">
            <option value="Planowany"  ${m.status === "Planowany"  ? "selected" : ""}>📅 Planowany</option>
            <option value="Rozegrany"  ${m.status === "Rozegrany"  ? "selected" : ""}>✅ Rozegrany</option>
            <option value="Odwołany"   ${m.status === "Odwołany"   ? "selected" : ""}>❌ Odwołany</option>
            <option value="Walkower"   ${m.status === "Walkower"   ? "selected" : ""}>🏳 Walkower</option>
          </select></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina rozpoczęcia</label>
          <input type="time" class="mz-fill-input" id="bk-start-time" value="${m.match_time ? m.match_time.slice(0, 5) : ""}"></div>
        <div class="prot-field"><label class="prot-lbl">⏰ Godzina zakończenia</label>
          <input type="time" class="mz-fill-input" id="bk-end-time" value="${ext.end_time || ""}"></div>
      </div>
      <div class="prot-field"><label class="prot-lbl">📍 Miejsce rozegrania</label>
        <input type="text" class="mz-fill-input" id="bk-location" value="${m.location || ""}" placeholder="Hala, adres…"></div>
    </div>

    <!-- 2. Wynik na żywo -->
    <div class="prot-section prot-section--score">
      <div class="prot-section-hdr">🏀 2. Wynik meczu</div>
      <div class="prot-scoreboard">
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team1_name}</div>
          <div class="prot-sb-val" id="bk-live-t1">${initT1}</div>
        </div>
        <div class="prot-sb-sep">:</div>
        <div class="prot-sb-team">
          <div class="prot-sb-name">${m.team2_name}</div>
          <div class="prot-sb-val" id="bk-live-t2">${initT2}</div>
        </div>
      </div>
      <input type="number" class="mz-fill-input" id="bk-score-t1" name="score" data-team="${m.team1_id}" value="${m.score_t1 ?? initT1}" style="display:none">
      <input type="number" class="mz-fill-input" id="bk-score-t2" name="score" data-team="${m.team2_id}" value="${m.score_t2 ?? initT2}" style="display:none">
      <p class="prot-hint">Wynik aktualizuje się automatycznie z sumy kwart</p>
    </div>

    <!-- 3. Kwarty -->
    <div class="prot-section">
      <div class="prot-section-hdr">📊 3. Wyniki kwart</div>
      <div class="prot-tbl-wrap">
        <table class="prot-tbl">
          <thead><tr>
            <th></th>
            <th colspan="3">Wynik<small><br>A : B</small></th>
            <th>TO-A</th><th>TO-B</th>
            <th>Zm-A</th><th>Zm-B</th>
          </tr></thead>
          <tbody id="bk-quarters-tbody">${buildQuarterRows()}</tbody>
        </table>
      </div>
      <p class="prot-hint" style="margin-top:.4rem">K1–K4 = kwarty · OT = dogrywka · TO = przerwy na żądanie · Zm = zmiany zawodników</p>
    </div>

    <!-- 4. Drużyna A -->
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">🏀 4. ${m.team1_name} — skład</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="bk-roster-t1" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="bk-roster-t1" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="bk-roster-t1">
        ${(squad1 || []).length
          ? (squad1 || []).map(p => buildPlayerCard(p, m.team1_id)).join("")
          : `<div class="mz-fill-empty">Brak zawodników.</div>`}
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="bk-add-player-t1">+ Dodaj zawodnika do ${m.team1_name}</button>
    </div>

    <!-- 5. Drużyna B -->
    <div class="prot-section">
      <div class="prot-section-hdr-row">
        <span class="prot-section-hdr">🏀 5. ${m.team2_name} — skład</span>
        <div class="prot-lineup-actions">
          <button type="button" class="prot-lineup-all-btn" data-roster="bk-roster-t2" data-val="1">Wszyscy grają</button>
          <button type="button" class="prot-lineup-all-btn" data-roster="bk-roster-t2" data-val="0">Wszyscy ławka</button>
        </div>
      </div>
      <div class="prot-cards" id="bk-roster-t2">
        ${(squad2 || []).length
          ? (squad2 || []).map(p => buildPlayerCard(p, m.team2_id)).join("")
          : `<div class="mz-fill-empty">Brak zawodników.</div>`}
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--player" id="bk-add-player-t2">+ Dodaj zawodnika do ${m.team2_name}</button>
    </div>

    <!-- 6. Sędziowie -->
    <div class="prot-section">
      <div class="prot-section-hdr">⚖️ 6. Sędziowie i obsługa meczu</div>
      <div class="prot-grid2">
        <div class="prot-field"><label class="prot-lbl">Sędzia I</label>
          ${protBuildOfficialSelect(referees, m.referee_id || "", "bk-referee1", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Sędzia II</label>
          ${protBuildOfficialSelect(referees, ext.referee2_id || "", "bk-referee2", [], "wybierz sędziego")}</div>
        <div class="prot-field"><label class="prot-lbl">Sekretarz</label>
          ${protBuildOfficialSelect(protokolanci, m.clerk_id || "", "bk-clerk", [], "wybierz sekretarza")}</div>
        <div class="prot-field"><label class="prot-lbl">Asystent sekretarza</label>
          ${protBuildOfficialSelect(protokolanci, ext.assistant_clerk_id || "", "bk-assistant-clerk", [], "wybierz asystenta")}</div>
      </div>
      <button type="button" class="prot-add-btn prot-add-btn--referee" id="bk-add-referee">+ Dodaj nowego sędziego / protokolanta do bazy</button>
    </div>

    <!-- 7. Uwagi -->
    <div class="prot-section">
      <div class="prot-section-hdr">📝 7. Uwagi sędziowskie / organizacyjne</div>
      <textarea class="mz-fill-textarea" id="mz-fill-note-text" rows="4" placeholder="Wpisz uwagi…">${notes_text || ""}</textarea>
    </div>
  `;

  // ── Interaktywność ───────────────────────────────────────────────────────

  // Przelicz wynik z kwart
  function recalcQuarterScore() {
    const rows = document.getElementById("bk-quarters-tbody")?.querySelectorAll(".bk-quarter-row") || [];
    let t1 = 0, t2 = 0;
    rows.forEach(row => {
      t1 += Number(row.querySelector("[name=pts_t1]")?.value || 0);
      t2 += Number(row.querySelector("[name=pts_t2]")?.value || 0);
    });
    const lT1 = document.getElementById("bk-live-t1");
    const lT2 = document.getElementById("bk-live-t2");
    if (lT1) lT1.textContent = t1;
    if (lT2) lT2.textContent = t2;
    const sT1 = document.getElementById("bk-score-t1");
    const sT2 = document.getElementById("bk-score-t2");
    if (sT1) sT1.value = t1;
    if (sT2) sT2.value = t2;
  }

  // Przelicz punkty zawodnika i odśwież total
  function recalcPlayerTotal(card) {
    const p1H  = card.querySelector("[name=points_1pt]");
    const p2H  = card.querySelector("[name=points_2pt]");
    const p3H  = card.querySelector("[name=points_3pt]");
    const totH = card.querySelector("[name=total_points_in_match]");
    const totDp = card.querySelector("[data-type=total]");
    const t = (Number(p1H?.value) || 0) * 1
            + (Number(p2H?.value) || 0) * 2
            + (Number(p3H?.value) || 0) * 3;
    if (totH)  totH.value = t;
    if (totDp) totDp.textContent = t;

    // Dyskwalifikacja
    const pf = Number(card.querySelector("[name=personal_fouls]")?.value || 0);
    const tf = Number(card.querySelector("[name=technical_fouls]")?.value || 0);
    const disq = pf >= 5 || tf >= 2;
    const totalEl = card.querySelector(".prot-total-pts");
    if (totalEl) totalEl.classList.toggle("prot-total-pts--disq", disq);
    let badge = card.querySelector(".prot-disq-badge");
    if (disq && !badge) {
      badge = document.createElement("span");
      badge.className = "prot-disq-badge";
      badge.textContent = "DYSKW.";
      totalEl?.appendChild(badge);
    } else if (!disq && badge) {
      badge.remove();
    }
  }

  // Spinner kwart
  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-spin-btn");
    if (!btn) return;
    const inp = document.getElementById(btn.dataset.inp);
    if (!inp) return;
    inp.value = Math.max(0, (Number(inp.value) || 0) + Number(btn.dataset.delta));
    if (inp.closest(".bk-quarter-row")) recalcQuarterScore();
  });

  body.addEventListener("input", e => {
    const row = e.target.closest(".bk-quarter-row");
    if (row && (e.target.name === "pts_t1" || e.target.name === "pts_t2")) recalcQuarterScore();
  });

  // Karty zawodników — delegacja
  [["bk-roster-t1", m.team1_id], ["bk-roster-t2", m.team2_id]].forEach(([rosterId, teamId]) => {
    const cont = document.getElementById(rosterId);
    if (!cont) return;
    cont.addEventListener("click", e => {
      const card = e.target.closest(".prot-card");
      if (!card) return;

      // Lineup toggle
      const lineupBtn = e.target.closest(".prot-lineup-btn");
      if (lineupBtn) {
        const playingH = card.querySelector("[name=is_playing]");
        const val  = Number(playingH?.value ?? 1);
        const next = val ? 0 : 1;
        if (playingH) playingH.value = next;
        lineupBtn.textContent = next ? "✅ Gra" : "🪑 Ławka";
        lineupBtn.classList.toggle("prot-lineup-btn--active", !!next);
        card.classList.toggle("prot-card--bench", !next);
        const bodyEl = card.querySelector(".prot-card-body");
        if (bodyEl) bodyEl.classList.toggle("prot-card-body--hidden", !next);
        return;
      }

      const btn = e.target.closest(".prot-cb");
      if (!btn) return;

      const forAttr = btn.dataset.for;
      const nameMap = { p1: "points_1pt", p2: "points_2pt", p3: "points_3pt", pf: "personal_fouls", tf: "technical_fouls" };
      const maxMap  = { p1: 99, p2: 99, p3: 99, pf: 5, tf: 2 };
      const hidName = nameMap[forAttr];
      if (!hidName) return;

      const hidInp = card.querySelector(`[name=${hidName}]`);
      const dispEl = card.querySelector(`[data-type=${forAttr}]`);
      const cur    = Number(hidInp?.value || 0);
      const next   = btn.classList.contains("prot-cb--inc")
        ? Math.min(maxMap[forAttr], cur + 1)
        : Math.max(0, cur - 1);

      if (hidInp) hidInp.value = next;
      if (dispEl) dispEl.textContent = next;
      recalcPlayerTotal(card);
    });
  });

  // Zaznacz wszystkich / wszyscy ławka
  body.addEventListener("click", e => {
    const btn = e.target.closest(".prot-lineup-all-btn");
    if (!btn) return;
    const roster = document.getElementById(btn.dataset.roster);
    const val = Number(btn.dataset.val);
    roster?.querySelectorAll(".prot-card").forEach(card => {
      const ph = card.querySelector("[name=is_playing]");
      const lb = card.querySelector(".prot-lineup-btn");
      const be = card.querySelector(".prot-card-body");
      if (ph) ph.value = val;
      if (lb) { lb.textContent = val ? "✅ Gra" : "🪑 Ławka"; lb.classList.toggle("prot-lineup-btn--active", !!val); }
      card.classList.toggle("prot-card--bench", !val);
      if (be) be.classList.toggle("prot-card-body--hidden", !val);
    });
  });

  // Dodaj zawodnika BK
  document.getElementById("bk-add-player-t1")?.addEventListener("click", function () {
    const currentSquad = Array.from(document.querySelectorAll("#bk-roster-t1 .bk-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team1_id, "bk-roster-t1",
      (p, tid) => buildPlayerCard(p, tid),
      null, allPeople, [...(squad1 || []), ...currentSquad]);
  });
  document.getElementById("bk-add-player-t2")?.addEventListener("click", function () {
    const currentSquad = Array.from(document.querySelectorAll("#bk-roster-t2 .bk-player-row"))
      .map(el => ({ person_id: Number(el.dataset.playerId) }));
    protToggleAddPlayer(this, m.team2_id, "bk-roster-t2",
      (p, tid) => buildPlayerCard(p, tid),
      null, allPeople, [...(squad2 || []), ...currentSquad]);
  });

  // Dodaj sędziego BK
  document.getElementById("bk-add-referee")?.addEventListener("click", function () {
    protToggleAddReferee(this);
  });
}

// ── Basketball Save ───────────────────────────────────────────────────────────

async function mzSaveBasketballForm(data, body, m) {
  // 1. Collect quarter scores — w tym TO i zmiany per kwartę (P2-W2 fix)
  const quarterRows = body.querySelectorAll(".bk-quarter-row");
  const quarters = Array.from(quarterRows).map(row => {
    const n = Number(row.dataset.quarter);
    const t1 = row.querySelector("[name=pts_t1]")?.value;
    const t2 = row.querySelector("[name=pts_t2]")?.value;
    if (t1 === "" && t2 === "") return null; // skip empty quarters
    return {
      set_number: n,
      points_t1: Number(t1 || 0),
      points_t2: Number(t2 || 0),
      to_t1:   Number(row.querySelector("[name=to_t1]")?.value   || 0) || 0,
      to_t2:   Number(row.querySelector("[name=to_t2]")?.value   || 0) || 0,
      subs_t1: Number(row.querySelector("[name=subs_t1]")?.value || 0) || 0,
      subs_t2: Number(row.querySelector("[name=subs_t2]")?.value || 0) || 0,
    };
  }).filter(Boolean);

  // 2. Save quarters to DB
  if (quarters.length) {
    await supabase.from("match_periods").delete().eq("match_id", m.id);
    await supabase.from("match_periods").insert(quarters.map(q => ({ ...q, match_id: m.id })));
  }

  // 3. Collect match scores — prefer the big score inputs at top of form
  const t1ScoreEl = $("bk-score-t1") || body.querySelector(`input[name=score][data-team="${m.team1_id}"]`);
  const t2ScoreEl = $("bk-score-t2") || body.querySelector(`input[name=score][data-team="${m.team2_id}"]`);
  let score_t1 = t1ScoreEl?.value !== "" ? Number(t1ScoreEl.value) : null;
  let score_t2 = t2ScoreEl?.value !== "" ? Number(t2ScoreEl.value) : null;
  // Auto-calculate from quarters only if both score fields are empty
  if ((score_t1 == null || score_t2 == null) && quarters.length) {
    score_t1 = quarters.reduce((s, q) => s + q.points_t1, 0);
    score_t2 = quarters.reduce((s, q) => s + q.points_t2, 0);
  }
  score_t1 = score_t1 ?? 0;
  score_t2 = score_t2 ?? 0;

  // 4. Build extended JSON
  const ext = {};
  ext.end_time           = $("bk-end-time")?.value || "";
  // Sędzia II — ID do DB + nazwa do PDF
  const bkRef2El          = $("bk-referee2");
  ext.referee2_id         = Number(bkRef2El?.value) || null;
  ext.referee2            = bkRef2El?.selectedIndex > 0 ? bkRef2El.options[bkRef2El.selectedIndex].text : "";
  // Asystent sekretarza — ID do DB + nazwa do PDF
  const bkAsstEl          = $("bk-assistant-clerk");
  ext.assistant_clerk_id  = Number(bkAsstEl?.value) || null;
  ext.assistant_clerk     = bkAsstEl?.selectedIndex > 0 ? bkAsstEl.options[bkAsstEl.selectedIndex].text : "";

  // Per-quarter extended data (timeouts + subs)
  ext.quarter_data = {};
  quarterRows.forEach(row => {
    const n = Number(row.dataset.quarter);
    ext.quarter_data[n] = {
      to_t1:   Number(row.querySelector("[name=to_t1]")?.value  || 0) || null,
      to_t2:   Number(row.querySelector("[name=to_t2]")?.value  || 0) || null,
      subs_t1: Number(row.querySelector("[name=subs_t1]")?.value || 0) || null,
      subs_t2: Number(row.querySelector("[name=subs_t2]")?.value || 0) || null,
    };
  });

  // Player jersey numbers + lineup
  ext.players_t1 = {};
  ext.players_t2 = {};
  ext.lineup_t1  = {};
  ext.lineup_t2  = {};
  body.querySelectorAll(".bk-player-row").forEach(row => {
    const pid    = String(row.dataset.playerId);
    const tid    = Number(row.dataset.teamId);
    const jersey  = row.querySelector("[name=bk_jersey]")?.value || "";
    const playing = Number(row.querySelector("[name=is_playing]")?.value ?? 1);
    if (tid === m.team1_id) { ext.players_t1[pid] = { jersey }; ext.lineup_t1[pid] = playing; }
    else                    { ext.players_t2[pid] = { jersey }; ext.lineup_t2[pid] = playing; }
  });

  const notesText  = $("mz-fill-note-text")?.value || "";
  const serialized = JSON.stringify({ notes_text: notesText, __bk: ext });

  // 5. Save match meta
  const referee_id = Number($("bk-referee1")?.value)  || null;
  const clerk_id   = Number($("bk-clerk")?.value)      || null;
  const location   = $("bk-location")?.value || m.location || "";
  const matchTime  = $("bk-start-time")?.value ? `${$("bk-start-time").value}:00` : m.match_time;
  const matchDate  = $("bk-date")?.value || m.match_date;

  await supabase.from("matches").update({
    score_t1,
    score_t2,
    referee_id,
    clerk_id,
    location,
    match_time:    matchTime,
    match_date:    matchDate,
    referee_notes: serialized,
    status: $("bk-status")?.value || "Rozegrany",
  }).eq("id", m.id);

  // 6. Save player stats
  const playerRows = body.querySelectorAll(".bk-player-row");
  for (const row of playerRows) {
    const playerId = Number(row.dataset.playerId);
    await supabase.from("match_player_stats").upsert({
      match_id: m.id,
      player_id: playerId,
      total_points_in_match: Number(row.querySelector("[name=total_points_in_match]")?.value || 0),
      points_1pt:      Number(row.querySelector("[name=points_1pt]")?.value      || 0),
      points_2pt:      Number(row.querySelector("[name=points_2pt]")?.value      || 0),
      points_3pt:      Number(row.querySelector("[name=points_3pt]")?.value      || 0),
      yellow_cards: 0, red_card: 0,
      personal_fouls:  Number(row.querySelector("[name=personal_fouls]")?.value  || 0),
      technical_fouls: Number(row.querySelector("[name=technical_fouls]")?.value || 0),
    }, { onConflict: "match_id,player_id" });
  }

  // 7. Save team stats (sum across quarters)
  const qdVals = Object.values(ext.quarter_data || {});
  for (const [teamId, key] of [[m.team1_id, "t1"], [m.team2_id, "t2"]]) {
    const totalTO   = qdVals.reduce((s, q) => s + (q[`to_${key}`]   || 0), 0);
    const totalSubs = qdVals.reduce((s, q) => s + (q[`subs_${key}`] || 0), 0);
    const foulsEl   = body.querySelector(`[name=team_fouls_count][data-team="${teamId}"]`);
    await supabase.from("match_team_stats").upsert({
      match_id: m.id,
      team_id: teamId,
      timeouts_taken:     totalTO,
      substitutions_used: totalSubs,
      team_fouls_count:   Number(foulsEl?.value || 0),
    }, { onConflict: "match_id,team_id" });
  }
}
checkStatus();
loadDashboard();