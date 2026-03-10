/* ════════════════════════════════════════════════════════════════════
   volleyball.js — Protokół Siatkówki
   Ścieżka: /protokoly/volleyball.js
   API: http://localhost:3001/api
════════════════════════════════════════════════════════════════════ */

// const API = "http://localhost:3001/api";
import { supabase } from '/supabase-client.js';

/* ── Helpers ────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const mk = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const loader = on => $("page-loader").classList.toggle("hidden", !on);

let _toastTimer = null;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " error" : "");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), 3000);
}

// async function apiFetch(path, opts = {}) {
//   try {
//     loader(true);
//     const r = await fetch(API + path, opts);
//     if (!r.ok) throw new Error(`HTTP ${r.status}`);
//     return await r.json();
//   } catch (e) {
//     console.error("API error:", e);
//     return null;
//   } finally {
//     loader(false);
//   }
// }

// apiFetch() — wrapper Supabase kompatybilny z REST API
// Obsługuje tylko endpointy używane przez protokoły
async function apiFetch(path, opts = {}) {
  try {
    loader(true);
    const method = (opts.method || 'GET').toUpperCase();
    const body   = opts.body ? JSON.parse(opts.body) : null;

    // ── GET ──────────────────────────────────────────────────────
    if (method === 'GET') {
      // /tournament-settings
      if (path === '/tournament-settings') {
        const { data } = await supabase.from('tournament_settings').select('*');
        const obj = {}; (data||[]).forEach(r => { obj[r.key] = r.value; }); return obj;
      }
      // /people
      if (path === '/people') {
        const { data } = await supabase.from('people').select('*');
        return data;
      }
      // /matches?discipline=X
      const discMatch = path.match(/^\/matches\?discipline=(.+)$/);
      if (discMatch) {
        const disc = decodeURIComponent(discMatch[1]);
        const { data } = await supabase.from('matches_full').select('*')
          .eq('discipline', disc).order('match_date').order('match_time');
        return data;
      }
      // /matches/:id
      const matchGet = path.match(/^\/matches\/(\d+)$/);
      if (matchGet) {
        const id = parseInt(matchGet[1]);
        const { data } = await supabase.from('matches_full').select('*').eq('id', id).single();
        return data;
      }
      // /teams/:id/players
      const teamPl = path.match(/^\/teams\/(\d+)\/players$/);
      if (teamPl) {
        const { data } = await supabase.from('players')
          .select('*, people(first_name, last_name)').eq('team_id', parseInt(teamPl[1]));
        return (data||[]).map(p => ({
          ...p, first_name: p.people?.first_name, last_name: p.people?.last_name
        }));
      }
      // /teams/:id
      const teamGet = path.match(/^\/teams\/(\d+)$/);
      if (teamGet) {
        const { data } = await supabase.from('teams').select('*')
          .eq('id', parseInt(teamGet[1])).single();
        return data;
      }
      // /match-player-stats-by-match/:id
      const mpsByMatch = path.match(/^\/match-player-stats-by-match\/(\d+)$/);
      if (mpsByMatch) {
        const { data } = await supabase.from('player_stats_full').select('*')
          .eq('match_id', parseInt(mpsByMatch[1]));
        return data;
      }
    }

    // ── PATCH /matches/:id ────────────────────────────────────────
    const matchPatch = path.match(/^\/matches\/(\d+)$/);
    if (matchPatch && method === 'PATCH') {
      const { data } = await supabase.from('matches')
        .update(body).eq('id', parseInt(matchPatch[1])).select().single();
      return data;
    }

    // ── PUT /matches/:id/sets ─────────────────────────────────────
    const matchSets = path.match(/^\/matches\/(\d+)\/sets$/);
    if (matchSets && (method === 'PUT' || method === 'POST')) {
      const matchId = parseInt(matchSets[1]);
      // Usuń stare sety i wstaw nowe
      await supabase.from('match_periods').delete().eq('match_id', matchId);
      if (body?.sets?.length) {
        const rows = body.sets.map((s, i) => ({ match_id: matchId, set_number: i+1, ...s }));
        await supabase.from('match_periods').insert(rows);
      }
      return { ok: true };
    }

    // ── POST /match-player-stats ──────────────────────────────────
    if (path === '/match-player-stats' && method === 'POST') {
      const { data } = await supabase.from('match_player_stats')
        .upsert(body, { onConflict: 'match_id,player_id' }).select();
      return data;
    }

    // ── POST /match-team-stats ────────────────────────────────────
    if (path === '/match-team-stats' && method === 'POST') {
      const { data } = await supabase.from('match_team_stats')
        .upsert(body, { onConflict: 'match_id,team_id' }).select();
      return data;
    }

    // ── POST /matches/:id/logs ────────────────────────────────────
    const matchLogs = path.match(/^\/matches\/(\d+)\/logs$/);
    if (matchLogs && method === 'POST') {
      const matchId = parseInt(matchLogs[1]);
      if (body?.replace) {
        await supabase.from('match_logs').delete().eq('match_id', matchId);
      }
      if (body?.logs?.length) {
        const rows = body.logs.map(l => ({ ...l, match_id: matchId }));
        await supabase.from('match_logs').insert(rows);
      }
      return { ok: true };
    }

    console.warn('apiFetch(): nieznany endpoint:', path, method);
    return null;
  } catch(e) {
    console.error('apiFetch():', e);
    return null;
  } finally {
    loader(false);
  }
}

function nowHHMM() {
  return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

/* ════════════════════════════════════════════════════════════════════
   STAN GLOBALNY
════════════════════════════════════════════════════════════════════ */
let S = {
  phase:   "prematch",  // "prematch" | "playing" | "finished"
  matchId: null,

  settings: {
    sets_to_win:        3,
    points_per_set:     25,
    advantage_rule:     true,
    tiebreak_points:    15,
    tiebreak_advantage: true,
    subs_limit:         6,
    subs_per:           "set",   // "set"|"mecz"|"brak"
    timeouts_limit:     2,
    timeouts_per:       "set",
  },

  t1: {
    id: null, name: "", cls: "",
    allPlayers: [],           // wszyscy zawodnicy z DB
    squadPlayers: [],         // wybrani do meczu (pełne obiekty)
    // P1..P6 = indices 0..5; courtPos[i] = player.id lub null
    courtPos: [null, null, null, null, null, null],
    timeouts: 0, subs: 0,
    setTimeouts: 0, setSubs: 0,
  },
  t2: {
    id: null, name: "", cls: "",
    allPlayers: [], squadPlayers: [],
    courtPos: [null, null, null, null, null, null],
    timeouts: 0, subs: 0,
    setTimeouts: 0, setSubs: 0,
  },

  serving:    "t1",
  currentSet: 1,
  isTiebreak: false,
  setScores:  [{ t1: 0, t2: 0 }],
  setsWon:    { t1: 0, t2: 0 },

  // Per-set TO/subs snapshot — filled at each set end
  // setStats[i] = { to_t1, to_t2, subs_t1, subs_t2 } for completed set i+1
  setStats: [],

  actionLog:  [],
  undoStack:  [],
};

/* ── Undo snapshot ─────────────────────────────────────────────── */
function takeSnap(label) {
  const snap = {
    label,
    serving: S.serving,
    currentSet: S.currentSet,
    isTiebreak: S.isTiebreak,
    setScores:  deepClone(S.setScores),
    setsWon:    { ...S.setsWon },
    setStats:   deepClone(S.setStats),
    t1: { timeouts: S.t1.timeouts, subs: S.t1.subs, setTimeouts: S.t1.setTimeouts, setSubs: S.t1.setSubs, courtPos: [...S.t1.courtPos] },
    t2: { timeouts: S.t2.timeouts, subs: S.t2.subs, setTimeouts: S.t2.setTimeouts, setSubs: S.t2.setSubs, courtPos: [...S.t2.courtPos] },
    actionLog: deepClone(S.actionLog),
  };
  S.undoStack.push(snap);
  if (S.undoStack.length > 80) S.undoStack.shift();
}

function applySnap(snap) {
  S.serving    = snap.serving;
  S.currentSet = snap.currentSet;
  S.isTiebreak = snap.isTiebreak;
  S.setScores  = snap.setScores;
  S.setsWon    = snap.setsWon;
  S.setStats   = snap.setStats || [];
  for (const side of ["t1","t2"]) {
    S[side].timeouts    = snap[side].timeouts;
    S[side].subs        = snap[side].subs;
    S[side].setTimeouts = snap[side].setTimeouts;
    S[side].setSubs     = snap[side].setSubs;
    S[side].courtPos    = snap[side].courtPos;
  }
  S.actionLog = snap.actionLog;
}

/* ════════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════════ */
async function init() {
  // Clock
  function tick() {
    const now = new Date();
    $("topbar-clock").textContent = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    $("topbar-date").textContent  = now.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
  }
  tick(); setInterval(tick, 1000);

  // Load settings from DB
  const raw = await apiFetch("/tournament-settings") || {};
  loadSettings(raw);

  // Load people
  const people = await apiFetch("/people") || [];
  fillPeopleSelects(people);

  // Match from URL param
  const urlMatch = new URLSearchParams(location.search).get("match");
  if (urlMatch) {
    await loadMatchById(Number(urlMatch));
  } else {
    await loadMatchList();
  }

  wireButtons();
}

function loadSettings(raw) {
  const n = (k, def) => Number(raw[k] ?? def);
  const b = (k, def) => (raw[k] ?? def) === "1" || raw[k] === true;
  S.settings.sets_to_win        = n("volleyball_sets_to_win", 3);
  S.settings.points_per_set     = n("volleyball_points_per_set", 25);
  S.settings.advantage_rule     = b("volleyball_advantage_rule", "1");
  S.settings.tiebreak_points    = n("volleyball_tiebreak_points", 15);
  S.settings.tiebreak_advantage = b("volleyball_tiebreak_advantage", "1");
  S.settings.subs_limit         = n("volleyball_substitutions_limit", 6);
  S.settings.subs_per           = raw["volleyball_substitutions_per"] || "set";
  S.settings.timeouts_limit     = n("volleyball_timeouts_limit", 2);
  S.settings.timeouts_per       = raw["volleyball_timeouts_per"] || "set";
}

function fillPeopleSelects(people) {
  const refSel   = $("pm-referee");
  const clerkSel = $("pm-clerk");
  people.filter(p => ["Sędzia","Obie role"].includes(p.role)).forEach(p => {
    refSel.appendChild(new Option(`${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}`, p.id));
  });
  people.filter(p => ["Protokolant","Obie role"].includes(p.role)).forEach(p => {
    clerkSel.appendChild(new Option(`${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}`, p.id));
  });
}

/* ════════════════════════════════════════════════════════════════════
   PRE-MATCH — LISTA MECZÓW z wyszukiwaniem i filtrowaniem
════════════════════════════════════════════════════════════════════ */
let _allMatches = [];
let _activeFilter = "all";
let _searchQuery  = "";

async function loadMatchList() {
  // Pobierz WSZYSTKIE mecze siatkówki
  const matches = await apiFetch("/matches?discipline=Siatkówka") || [];
  _allMatches = matches;

  // Sortuj: najpierw Planowane, potem reszta; w ramach grupy po dacie malejąco
  _allMatches.sort((a, b) => {
    const order = { "Planowany": 0, "Rozegrany": 1, "Odwołany": 2, "Walkower": 3 };
    const oa = order[a.status] ?? 9, ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (a.match_date || "").localeCompare(b.match_date || "");
  });

  renderMatchList();
  wireMatchFilters();
}

function wireMatchFilters() {
  // Chip filters
  document.querySelectorAll(".pm-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".pm-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _activeFilter = chip.dataset.status;
      renderMatchList();
    });
  });

  // Search input
  const searchInput = $("pm-search");
  const clearBtn    = $("pm-search-clear");

  searchInput.addEventListener("input", () => {
    _searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle("hidden", !_searchQuery);
    renderMatchList();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    _searchQuery = "";
    clearBtn.classList.add("hidden");
    searchInput.focus();
    renderMatchList();
  });
}

function renderMatchList() {
  const list = $("pm-match-list");
  const meta = $("pm-matches-meta");

  let filtered = _allMatches;

  // Status filter
  if (_activeFilter !== "all") {
    filtered = filtered.filter(m => m.status === _activeFilter);
  }

  // Text search
  if (_searchQuery) {
    filtered = filtered.filter(m =>
      (m.team1_name || "").toLowerCase().includes(_searchQuery) ||
      (m.team2_name || "").toLowerCase().includes(_searchQuery) ||
      (m.location   || "").toLowerCase().includes(_searchQuery) ||
      String(m.id).includes(_searchQuery)
    );
  }

  meta.textContent = `Wyświetlono: ${filtered.length} z ${_allMatches.length} meczów`;
  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML = `<div class="pm-loading">Brak meczów spełniających kryteria</div>`;
    return;
  }

  filtered.forEach(m => {
    const item = mk("div", "pm-match-item" + (m.id === S.matchId ? " sel" : ""));
    const dateStr = m.match_date ? m.match_date.slice(0, 10) : "—";
    const timeStr = m.match_time ? m.match_time.slice(0, 5) : "";
    const locStr  = m.location   || "";
    item.innerHTML = `
      <div class="pm-match-disc">🏐</div>
      <div class="pm-match-info">
        <strong>${m.team1_name} <span style="color:var(--muted);font-weight:500">vs</span> ${m.team2_name}</strong>
        <span>${dateStr}${timeStr ? " " + timeStr : ""}${locStr ? " · " + locStr : ""}</span>
      </div>
      <span class="pm-match-status pm-match-status--${m.status}">${m.status}</span>
      <div class="pm-match-meta">#${m.id}</div>
      ${m.id === S.matchId ? '<div class="pm-match-sel-mark">✓</div>' : '<div class="pm-match-sel-mark hidden">✓</div>'}`;
    item.addEventListener("click", () => selectMatch(m, item));
    list.appendChild(item);
  });
}

async function loadMatchById(id) {
  const data = await apiFetch(`/matches/${id}`);
  if (!data?.match) { toast("Nie znaleziono meczu #" + id, true); await loadMatchList(); return; }
  const m = data.match;
  // Load full list first, then auto-select
  const matches = await apiFetch("/matches?discipline=Siatkówka") || [];
  _allMatches = matches.sort((a, b) => {
    const order = { "Planowany": 0, "Rozegrany": 1, "Odwołany": 2, "Walkower": 3 };
    const oa = order[a.status] ?? 9, ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (a.match_date || "").localeCompare(b.match_date || "");
  });
  wireMatchFilters();
  renderMatchList();
  await selectMatch(m, null);
  if (m.referee_id) $("pm-referee").value = m.referee_id;
  if (m.clerk_id)   $("pm-clerk").value   = m.clerk_id;
}

async function selectMatch(m, itemEl) {
  // highlight in list
  document.querySelectorAll(".pm-match-item").forEach(i => {
    i.classList.remove("sel");
    i.querySelector(".pm-match-sel-mark")?.classList.add("hidden");
  });
  if (itemEl) {
    itemEl.classList.add("sel");
    itemEl.querySelector(".pm-match-sel-mark")?.classList.remove("hidden");
  }

  S.matchId  = m.id;
  S.t1.id    = m.team1_id; S.t1.name = m.team1_name;
  S.t2.id    = m.team2_id; S.t2.name = m.team2_name;

  // Banner
  const banner = $("pm-banner");
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div class="pm-banner-icon">🏐</div>
    <div class="pm-banner-text">
      <strong>${m.team1_name} vs ${m.team2_name}</strong>
      <span>${m.match_date ? m.match_date.slice(0,10) : ""} ${m.match_time ? m.match_time.slice(0,5) : ""} · ID #${m.id}</span>
    </div>`;

  $("pm-sec-officials").classList.remove("hidden");

  // Prefill referee/clerk if already set
  if (m.referee_id) setTimeout(() => { $("pm-referee").value = m.referee_id; }, 100);
  if (m.clerk_id)   setTimeout(() => { $("pm-clerk").value   = m.clerk_id;   }, 100);

  // Show played match info if applicable
  const playedSec = $("pm-sec-played-info");
  if (m.status === "Rozegrany" || m.status === "Walkower") {
    await showPlayedMatchInfo(m);
    playedSec.classList.remove("hidden");
  } else {
    playedSec.classList.add("hidden");
  }

  // Load players
  const [t1pl, t2pl] = await Promise.all([
    apiFetch(`/teams/${m.team1_id}/players`),
    apiFetch(`/teams/${m.team2_id}/players`),
  ]);
  S.t1.allPlayers = t1pl || [];
  S.t2.allPlayers = t2pl || [];

  $("pm-t1-name-lbl").textContent = m.team1_name;
  $("pm-t2-name-lbl").textContent = m.team2_name;

  $("pm-sec-squads").classList.remove("hidden");
  renderPrematchSquad("t1");
  renderPrematchSquad("t2");

  // Auto-check players who played in this match
  await autoCheckPlayedPlayers(m.id);
  validate();
}

async function showPlayedMatchInfo(m) {
  const body   = $("pm-played-info-body");
  const people = await apiFetch("/people");
  const refP   = people?.find(p => p.id === m.referee_id);
  const clkP   = people?.find(p => p.id === m.clerk_id);

  // Fetch volleyball sets for this match
  const sets = await apiFetch(`/matches/${m.id}/sets-data`).catch(() => null);
  const setChips = Array.isArray(sets) && sets.length
    ? sets.map(s => `<div class="pm-played-period-chip">S${s.set_number}: ${s.points_t1}–${s.points_t2}</div>`).join("")
    : "";

  body.innerHTML = `
    <div class="pm-played-score">
      <div class="pm-played-team pm-played-team--left">${m.team1_name}</div>
      <div class="pm-played-result">${m.score_t1 ?? 0} : ${m.score_t2 ?? 0}</div>
      <div class="pm-played-team pm-played-team--right">${m.team2_name}</div>
    </div>
    ${setChips ? `<div class="pm-played-periods-grid">${setChips}</div>` : ""}
    ${m.referee_note ? `<div style="font-size:.82rem;color:var(--muted)">📝 <em>${m.referee_note}</em></div>` : ""}
    <div class="pm-played-officials">
      <span>⚖️ Sędzia: <strong>${refP ? refP.last_name + " " + refP.first_name : "—"}</strong></span>
      <span>📋 Protokolant: <strong>${clkP ? clkP.last_name + " " + clkP.first_name : "—"}</strong></span>
    </div>`;
}

async function autoCheckPlayedPlayers(matchId) {
  const stats = await apiFetch(`/match-player-stats-by-match/${matchId}`);
  if (!stats || !Array.isArray(stats)) return;
  const playedIds = new Set(stats.map(s => s.player_id));
  for (const side of ["t1","t2"]) {
    const container = $(`pm-${side}-players`);
    if (!container) continue;
    S[side].squadPlayers = [];
    container.querySelectorAll(".pm-player-item").forEach(item => {
      const pid = Number(item.dataset.pid);
      if (playedIds.has(pid)) {
        item.classList.add("checked");
        const player = S[side].allPlayers.find(p => p.id === pid);
        if (player && !S[side].squadPlayers.find(p => p.id === pid)) {
          S[side].squadPlayers.push(player);
        }
      }
    });
    updateSquadCount(side);
  }
}

/* ── Prematch squad render ─────────────────────────────────────── */
function renderPrematchSquad(side) {
  const players = S[side].allPlayers;
  const container = $(`pm-${side}-players`);
  container.innerHTML = "";

  if (!players.length) {
    container.innerHTML = `<div class="pm-loading" style="padding:12px">Brak zawodników w tej drużynie</div>`;
    return;
  }

  // Sortuj: kapitanowie pierwsi
  const sorted = [...players].sort((a,b) => (b.is_captain||0) - (a.is_captain||0));

  sorted.forEach(p => {
    // Sprawdź zgody i opłaty
    const hasRodo   = !!p.rodo_consent;
    const hasPart   = !!p.participation_consent;
    const hasFee    = parseFloat(p.entry_fee_paid || 0) > 0;
    const allOk     = hasRodo && hasPart;   // opłata opcjonalna do ostrzeżenia
    const feeWarn   = !hasFee;

    const item = mk("div", "pm-player-item" + (allOk ? "" : " consent-warn"));
    item.dataset.pid = p.id;

    const badges = [];
    if (p.is_captain) badges.push(`<span class="pm-player-badge badge-cap">⭐ Kapitan</span>`);
    if (hasRodo && hasPart) badges.push(`<span class="pm-player-badge badge-ok">✓ Zgody</span>`);
    if (!hasRodo) badges.push(`<span class="pm-player-badge badge-warn">✗ Brak RODO</span>`);
    if (!hasPart) badges.push(`<span class="pm-player-badge badge-warn">✗ Brak zgody uczestnictwa</span>`);
    if (feeWarn)  badges.push(`<span class="pm-player-badge badge-warn">💰 Brak opłaty</span>`);

    item.innerHTML = `
      <div class="pm-player-check">✓</div>
      <div class="pm-player-info">
        <div class="pm-player-name">${p.last_name} ${p.first_name}</div>
        <div class="pm-player-meta">${badges.join("")}</div>
      </div>`;

    item.addEventListener("click", () => toggleSquadPlayer(side, p, item));
    container.appendChild(item);
  });

  // Select-all
  $(`pm-${side}-selall`).onclick = () => {
    S[side].squadPlayers = [...S[side].allPlayers];
    container.querySelectorAll(".pm-player-item").forEach(i => i.classList.add("checked"));
    updateSquadCount(side);
    validate();
  };

  updateSquadCount(side);
}

function toggleSquadPlayer(side, player, itemEl) {
  const arr = S[side].squadPlayers;
  const idx = arr.findIndex(p => p.id === player.id);
  if (idx === -1) { arr.push(player); itemEl.classList.add("checked"); }
  else            { arr.splice(idx, 1); itemEl.classList.remove("checked"); }
  updateSquadCount(side);
  validate();
}

function updateSquadCount(side) {
  $(`pm-${side}-count`).textContent = `${S[side].squadPlayers.length} / ${S[side].allPlayers.length}`;
}

function validate() {
  const ok = S.matchId &&
             S.t1.squadPlayers.length >= 1 &&
             S.t2.squadPlayers.length >= 1;
  $("pm-start-btn").disabled = !ok;
  $("pm-validation").textContent = !S.matchId ? "Wybierz mecz z listy." :
    S.t1.squadPlayers.length < 1 ? `Zaznacz co najmniej 1 zawodnika ${S.t1.name}.` :
    S.t2.squadPlayers.length < 1 ? `Zaznacz co najmniej 1 zawodnika ${S.t2.name}.` : "";
}

/* ════════════════════════════════════════════════════════════════════
   START MATCH
════════════════════════════════════════════════════════════════════ */
async function startMatch() {
  if (!S.matchId) return;

  // Patch match: referee, clerk
  const refId   = $("pm-referee").value || null;
  const clerkId = $("pm-clerk").value   || null;
  const patchBody = {};
  if (refId)   patchBody.referee_id = Number(refId);
  if (clerkId) patchBody.clerk_id   = Number(clerkId);
  if (Object.keys(patchBody).length) {
    await apiFetch(`/matches/${S.matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
  }

  // Register all selected players (empty stats)
  const allSelected = [...S.t1.squadPlayers, ...S.t2.squadPlayers];
  for (const p of allSelected) {
    await apiFetch("/match-player-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: S.matchId, player_id: p.id }),
    });
  }

  // Fetch team class names
  const [team1, team2] = await Promise.all([
    apiFetch(`/teams/${S.t1.id}`),
    apiFetch(`/teams/${S.t2.id}`),
  ]);
  if (team1) S.t1.cls = team1.class_name || "";
  if (team2) S.t2.cls = team2.class_name || "";

  S.phase = "playing";
  $("view-prematch").classList.add("hidden");
  $("view-match").classList.remove("hidden");

  logAction("system", `Mecz rozpoczęty: ${S.t1.name} vs ${S.t2.name}`);
  renderAll();
  renderCourt();
}

/* ════════════════════════════════════════════════════════════════════
   GAME ACTIONS
════════════════════════════════════════════════════════════════════ */

/* ── Add point ─────────────────────────────────────────────────── */
function addPoint(team) {
  if (S.phase !== "playing") return;
  const other = team === "t1" ? "t2" : "t1";
  takeSnap(`Punkt ${S[team].name}`);

  const setIdx = S.currentSet - 1;
  S.setScores[setIdx][team]++;

  /*
    ROTACJA: drużyna obraca się gdy ZDOBYWA serwis.
    Zdobywa serwis gdy = wygrała punkt BĘDĄC przyjmującą (opponent was serving).
    Kolejność rotacji: P1→P6, P2→P1, P3→P2, P4→P3, P5→P4, P6→P5
    (zgodnie z ruchem wskazówek zegara patrząc od siatki)
    Implementacja: newPos[i] = oldPos[(i+1)%6]
  */
  if (S.serving === other) {
    // Ta drużyna przejmuje serwis → rotacja
    S.serving = team;
    rotateTeam(team);
    logAction("rotate", `${S[team].name} zdobywa serwis → automatyczna rotacja`);
  }

  const pts   = S.setScores[setIdx];
  const limit = S.isTiebreak ? S.settings.tiebreak_points : S.settings.points_per_set;
  const adv   = S.isTiebreak ? S.settings.tiebreak_advantage : S.settings.advantage_rule;

  logAction("point", `Punkt dla ${S[team].name} — ${pts.t1}:${pts.t2} (Set ${S.currentSet}${S.isTiebreak ? " TB" : ""})`);

  // Sprawdź koniec seta
  if (setWon(pts[team], pts[other], limit, adv)) {
    renderAll(); renderCourt();
    promptEndSet(team);
    return;
  }
  renderAll(); renderCourt();
}

function setWon(mine, theirs, limit, advantage) {
  if (mine < limit) return false;
  if (!advantage)   return mine >= limit;
  return mine >= limit && mine - theirs >= 2;
}

/* ── Rotation ──────────────────────────────────────────────────── */
// Rotacja zgodna z ruchem wskazówek zegara patrząc od siatki:
// P2→P1, P3→P2, P4→P3, P5→P4, P6→P5, P1→P6
// courtPos[0]=P1 courtPos[1]=P2 ... courtPos[5]=P6
// Gracz z pozycji (i+1)%6 przechodzi na pozycję i
function rotateTeam(side) {
  const old = [...S[side].courtPos];
  S[side].courtPos = old.map((_, i) => old[(i + 1) % 6]);
}

/* ── Timeout ───────────────────────────────────────────────────── */
function addTimeout(team) {
  if (S.phase !== "playing") return;
  const t = S[team];
  const perSet = S.settings.timeouts_per === "set";
  const used   = perSet ? t.setTimeouts : t.timeouts;
  const limit  = S.settings.timeouts_limit;
  if (limit > 0 && used >= limit) {
    toast(`Limit przerw wyczerpany (${limit}${perSet ? "/set" : "/mecz"})`, true); return;
  }
  takeSnap(`Przerwa ${S[team].name}`);
  t.timeouts++; t.setTimeouts++;
  logAction("timeout", `Przerwa — ${S[team].name} (${used+1}/${limit > 0 ? limit : "∞"}${perSet ? "/set" : "/mecz"})`);
  renderAll();
}

/* ── Substitution ──────────────────────────────────────────────── */
function addSubstitution(team) {
  if (S.phase !== "playing") return;
  const t = S[team];
  const perSet = S.settings.subs_per === "set";
  const used   = perSet ? t.setSubs : t.subs;
  const limit  = S.settings.subs_limit;
  if (S.settings.subs_per !== "brak" && limit > 0 && used >= limit) {
    toast(`Limit zmian wyczerpany (${limit}${perSet ? "/set" : "/mecz"})`, true); return;
  }
  takeSnap(`Zmiana ${S[team].name}`);
  t.subs++; t.setSubs++;
  logAction("sub", `Zmiana — ${S[team].name} (${used+1}/${limit > 0 ? limit : "∞"}${perSet ? "/set" : "/mecz"})`);
  renderAll();
}

/* ── End set ───────────────────────────────────────────────────── */
function promptEndSet(winnerTeam) {
  const pts = S.setScores[S.currentSet - 1];
  $("endset-title").textContent = winnerTeam
    ? `${S[winnerTeam].name} wygrywa seta!`
    : `Zakończyć Set ${S.currentSet}?`;
  $("endset-body").textContent = `Wynik: ${pts.t1} : ${pts.t2}`;
  $("endset-confirm").onclick = () => confirmEndSet(winnerTeam);
  $("endset-backdrop").classList.remove("hidden");
}

function confirmEndSet(winnerTeam) {
  $("endset-backdrop").classList.add("hidden");
  takeSnap(`Zakończenie seta ${S.currentSet}`);

  // Determine winner
  const pts = S.setScores[S.currentSet - 1];
  const w = winnerTeam || (pts.t1 > pts.t2 ? "t1" : pts.t2 > pts.t1 ? "t2" : null);
  if (w) S.setsWon[w]++;

  logAction("set", `✓ Set ${S.currentSet}: ${pts.t1}:${pts.t2} → Sety: ${S.setsWon.t1}:${S.setsWon.t2}`);

  // Snapshot per-set TO/subs before resetting
  const setIdx = S.currentSet - 1;
  S.setStats[setIdx] = {
    to_t1:   S.t1.setTimeouts,
    to_t2:   S.t2.setTimeouts,
    subs_t1: S.t1.setSubs,
    subs_t2: S.t2.setSubs,
  };

  // Reset per-set counters
  if (S.settings.subs_per === "set")     { S.t1.setSubs = 0; S.t2.setSubs = 0; }
  if (S.settings.timeouts_per === "set") { S.t1.setTimeouts = 0; S.t2.setTimeouts = 0; }

  // Check match end
  if (S.setsWon.t1 >= S.settings.sets_to_win || S.setsWon.t2 >= S.settings.sets_to_win) {
    renderAll(); renderCourt();
    promptFinish();
    return;
  }

  // Next set — winner gets serve (loser serves next in volleyball = winner served this one, now loser serves)
  S.currentSet++;
  S.isTiebreak = false;
  S.setScores.push({ t1: 0, t2: 0 });
  // In volleyball the team that LOST the previous set starts serving the next
  S.serving = w === "t1" ? "t2" : "t1";

  $("btn-tiebreak").disabled = false;
  renderAll(); renderCourt();
  toast(`Set ${S.currentSet - 1} zakończony → Set ${S.currentSet}`);
}

/* ── Tiebreak ──────────────────────────────────────────────────── */
function activateTiebreak() {
  if (S.phase !== "playing" || S.isTiebreak) return;
  takeSnap("Tiebreak");
  S.isTiebreak = true;
  $("btn-tiebreak").disabled = true;
  logAction("set", `⚡ Tiebreak włączony (Set ${S.currentSet})`);
  renderAll();
  toast("Tiebreak!");
}

/* ── Undo ──────────────────────────────────────────────────────── */
function undoAction() {
  if (!S.undoStack.length) { toast("Brak akcji do cofnięcia", true); return; }
  const snap = S.undoStack.pop();
  applySnap(snap);
  logAction("undo", `↩ Cofnięto: ${snap.label}`);
  renderAll(); renderCourt();
  toast("Cofnięto akcję");
}

/* ════════════════════════════════════════════════════════════════════
   COURT VISUALIZATION
   Layout (widziany od strony T1, twarzą do siatki):
   Rząd przedni:  P4  P3  P2
   Rząd tylny:    P5  P6  P1
   Indeksy tablicy courtPos: 0=P1, 1=P2, 2=P3, 3=P4, 4=P5, 5=P6
   Grid slots (top-left → bottom-right): P4,P3,P2,P5,P6,P1
     → slotIndex: [3, 2, 1, 4, 5, 0]
════════════════════════════════════════════════════════════════════ */
const GRID_SLOTS = [3, 2, 1, 4, 5, 0]; // grid cell index → courtPos index
const POS_NAMES  = ["P1","P2","P3","P4","P5","P6"];

function renderCourt() {
  $("ct-t1-label").textContent = S.t1.name || "—";
  $("ct-t2-label").textContent = S.t2.name || "—";
  renderCourtHalf("t1");
  renderCourtHalf("t2");
}

function renderCourtHalf(side) {
  const grid     = $(`court-grid-${side}`);
  const courtPos = S[side].courtPos;
  const squad    = S[side].squadPlayers;
  grid.innerHTML = "";

  GRID_SLOTS.forEach((posIdx) => {
    const pid    = courtPos[posIdx];
    const player = squad.find(p => p.id === pid);
    const isServ = posIdx === 0 && S.serving === side;
    const isEmpty = pid === null;

    const cell = mk("div", [
      "court-cell",
      isServ  ? "court-cell--server" : "",
      isEmpty ? "court-cell--empty"  : "",
    ].filter(Boolean).join(" "));

    cell.innerHTML = `<span class="cc-pos">${POS_NAMES[posIdx]}</span>` +
      (player
        ? `<span class="cc-name">${player.last_name}<br>${player.first_name}</span>`
        : `<span class="cc-empty">+ dodaj</span>`);

    cell.addEventListener("click", () => openSwap(side, posIdx));
    grid.appendChild(cell);
  });
}

/* ── Manual rotate buttons ─────────────────────────────────────── */
function wireButtons() {
  $("btn-t1-point").addEventListener("click",   () => addPoint("t1"));
  $("btn-t2-point").addEventListener("click",   () => addPoint("t2"));
  $("btn-t1-timeout").addEventListener("click", () => addTimeout("t1"));
  $("btn-t2-timeout").addEventListener("click", () => addTimeout("t2"));
  $("btn-t1-sub").addEventListener("click",     () => addSubstitution("t1"));
  $("btn-t2-sub").addEventListener("click",     () => addSubstitution("t2"));
  $("btn-rotate-t1").addEventListener("click",  () => { takeSnap("Ręczna rotacja T1"); rotateTeam("t1"); logAction("rotate","Ręczna rotacja: " + S.t1.name); renderCourt(); });
  $("btn-rotate-t2").addEventListener("click",  () => { takeSnap("Ręczna rotacja T2"); rotateTeam("t2"); logAction("rotate","Ręczna rotacja: " + S.t2.name); renderCourt(); });
  $("btn-end-set").addEventListener("click",    () => promptEndSet(null));
  $("btn-tiebreak").addEventListener("click",   activateTiebreak);
  $("btn-undo").addEventListener("click",       undoAction);
  $("btn-save").addEventListener("click",       () => saveProtocol(false));
  $("btn-finish").addEventListener("click",     promptFinish);
  $("pm-start-btn").addEventListener("click",   startMatch);
  $("btn-save-note").addEventListener("click",  saveNote);
  $("endset-cancel").addEventListener("click",  () => $("endset-backdrop").classList.add("hidden"));
  $("finish-cancel").addEventListener("click",  () => $("finish-backdrop").classList.add("hidden"));
  $("finish-confirm").addEventListener("click", finishMatch);
  $("swap-close").addEventListener("click",     () => $("swap-backdrop").classList.add("hidden"));
  $("swap-backdrop").addEventListener("click", e => { if (e.target === $("swap-backdrop")) $("swap-backdrop").classList.add("hidden"); });
  $("topbar-exit").addEventListener("click",    openExitConfirm);
  $("exit-cancel").addEventListener("click",   () => $("exit-backdrop").classList.add("hidden"));
  $("exit-confirm").addEventListener("click",  () => { location.href = "../admin_panel/admin.html"; });
  $("exit-backdrop").addEventListener("click", e => { if (e.target === $("exit-backdrop")) $("exit-backdrop").classList.add("hidden"); });
}

function openExitConfirm() {
  const finished = S.phase === "finished";
  $("exit-body").textContent = finished
    ? "Mecz jest zakończony i zapisany. Wróć do panelu admina?"
    : "Mecz jest W TOKU. Niezapisane zmiany mogą zostać utracone. Czy na pewno chcesz wyjść?";
  $("exit-confirm").textContent = finished ? "→ Wróć do panelu" : "✕ Tak, wyjdź";
  $("exit-backdrop").classList.remove("hidden");
}

/* ════════════════════════════════════════════════════════════════════
   SWAP MODAL — zamiana zawodnika na boisku
════════════════════════════════════════════════════════════════════ */
let _swapCtx = null;

function openSwap(side, posIdx) {
  _swapCtx = { side, posIdx };
  $("swap-pos-lbl").textContent = POS_NAMES[posIdx];

  const list     = $("swap-list");
  const squad    = S[side].squadPlayers;
  const courtPos = S[side].courtPos;
  const curPid   = courtPos[posIdx];

  list.innerHTML = "";

  // Empty option
  const empty = mk("div", "swap-item swap-item-none");
  empty.textContent = "— Pusta pozycja —";
  empty.addEventListener("click", () => doSwap(side, posIdx, null));
  list.appendChild(empty);

  squad.forEach(p => {
    const inUse  = courtPos.findIndex(id => id === p.id && courtPos.indexOf(id) !== posIdx);
    const curSlot = courtPos.indexOf(p.id);
    const onCourt = curSlot !== -1;
    const isCur   = p.id === curPid;

    const item = mk("div", "swap-item" + (isCur ? " active" : ""));
    item.innerHTML = `
      <span>${p.last_name} ${p.first_name}</span>
      ${p.is_captain ? '<span style="color:var(--yellow)">⭐</span>' : ""}
      ${onCourt && !isCur ? `<span style="color:var(--muted);font-size:.72rem;margin-left:auto">(${POS_NAMES[curSlot]})</span>` : ""}`;
    item.addEventListener("click", () => doSwap(side, posIdx, p.id));
    list.appendChild(item);
  });

  $("swap-backdrop").classList.remove("hidden");
}

function doSwap(side, posIdx, playerId) {
  takeSnap(`Zmiana na boisku ${S[side].name} ${POS_NAMES[posIdx]}`);
  const courtPos = S[side].courtPos;
  if (playerId !== null) {
    const otherSlot = courtPos.indexOf(playerId);
    if (otherSlot !== -1) courtPos[otherSlot] = courtPos[posIdx];
  }
  courtPos[posIdx] = playerId;

  const pObj = S[side].squadPlayers.find(p => p.id === playerId);
  logAction("swap", `Boisko ${S[side].name}: ${POS_NAMES[posIdx]} ← ${pObj ? pObj.last_name + " " + pObj.first_name : "puste"}`);
  $("swap-backdrop").classList.add("hidden");
  renderCourt();
}

/* ════════════════════════════════════════════════════════════════════
   FINISH MATCH
════════════════════════════════════════════════════════════════════ */
function promptFinish() {
  const w = S.setsWon.t1 > S.setsWon.t2 ? S.t1.name :
            S.setsWon.t2 > S.setsWon.t1 ? S.t2.name : "Remis";
  $("finish-body").innerHTML = `
    <strong>${S.t1.name} ${S.setsWon.t1} : ${S.setsWon.t2} ${S.t2.name}</strong><br>
    Zwycięzca: <strong>${w}</strong>`;
  $("finish-backdrop").classList.remove("hidden");
}

async function finishMatch() {
  $("finish-backdrop").classList.add("hidden");
  S.phase = "finished";
  logAction("system", `Mecz zakończony: ${S.t1.name} ${S.setsWon.t1}:${S.setsWon.t2} ${S.t2.name}`);
  await saveProtocol(true);
  $("topbar-status").textContent = "Zakończony";
  $("topbar-status").style.color = "var(--muted)";
  $("topbar-exit").classList.add("finished");
  toast("Mecz zakończony i zapisany ✓");
}

/* ════════════════════════════════════════════════════════════════════
   SAVE
════════════════════════════════════════════════════════════════════ */
async function saveNote() {
  const note = $("referee-note").value;
  const r = await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referee_note: note }),
  });
  if (r) toast("Notatka zapisana ✓");
  else   toast("Błąd zapisu notatki", true);
}

async function saveProtocol(finish = false) {
  if (!S.matchId) return;

  const patch = { score_t1: S.setsWon.t1, score_t2: S.setsWon.t2 };
  if (finish) patch.status = "Rozegrany";
  await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  // Save Volleyball_Sets — with per-set TO and subs
  const sets = S.setScores.map((s, i) => {
    // For completed sets use snapshot; for current ongoing set use live counters
    const snap = S.setStats[i];
    const isCurrent = (i === S.currentSet - 1) && !snap;
    return {
      set_number: i + 1,
      points_t1:  s.t1,
      points_t2:  s.t2,
      to_t1:   snap ? snap.to_t1   : (isCurrent ? S.t1.setTimeouts : 0),
      to_t2:   snap ? snap.to_t2   : (isCurrent ? S.t2.setTimeouts : 0),
      subs_t1: snap ? snap.subs_t1 : (isCurrent ? S.t1.setSubs     : 0),
      subs_t2: snap ? snap.subs_t2 : (isCurrent ? S.t2.setSubs     : 0),
    };
  });

  await apiFetch(`/matches/${S.matchId}/sets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sets }),
  });

  // Save team totals
  for (const side of ["t1","t2"]) {
    const t = S[side];
    await apiFetch("/match-team-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: S.matchId, team_id: t.id,
        timeouts_taken:    t.timeouts,
        substitutions_used: t.subs,
      }),
    });
  }

  // Save action logs to DB (full replace — simple and reliable)
  const logsPayload = [...S.actionLog].reverse().map(l => ({
    type:        l.type,
    description: l.text,
    time:        l.time,
  }));
  await apiFetch(`/matches/${S.matchId}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs: logsPayload }),
  });

  if (!finish) toast("Protokół zapisany ✓");
  logAction("system", `Protokół zapisany (${nowHHMM()})`);
}

/* ════════════════════════════════════════════════════════════════════
   RENDER ALL
════════════════════════════════════════════════════════════════════ */
function logAction(type, text) {
  S.actionLog.unshift({ type, text, time: nowHHMM() });
  renderLog();
}

function renderAll() {
  // Scoreboard
  const pts = S.setScores[S.currentSet - 1] || { t1: 0, t2: 0 };
  $("sb-t1-name").textContent = S.t1.name; $("sb-t1-cls").textContent = S.t1.cls;
  $("sb-t2-name").textContent = S.t2.name; $("sb-t2-cls").textContent = S.t2.cls;
  $("sb-pts-t1").textContent  = pts.t1;    $("sb-pts-t2").textContent  = pts.t2;
  $("sb-sets-t1").textContent = S.setsWon.t1; $("sb-sets-t2").textContent = S.setsWon.t2;
  $("sb-set-label").textContent = S.isTiebreak ? "Tiebreak" : `Set ${S.currentSet}`;
  $("topbar-match-label").textContent = `🏐 Siatkówka — ${S.t1.name} vs ${S.t2.name}`;

  // Set history
  renderSetHistory();

  // Team panels
  for (const side of ["t1","t2"]) {
    const t = S[side];
    $(`tp-${side}-name`).textContent = t.name;

    // Serve badge
    const badge = $(`serve-badge-${side}`);
    badge.classList.toggle("hidden", S.serving !== side);

    // Counters
    const isTPer = S.settings.timeouts_per === "set";
    const isSPer = S.settings.subs_per === "set";
    const tUsed  = isTPer ? t.setTimeouts : t.timeouts;
    const sUsed  = isSPer ? t.setSubs     : t.subs;
    const tLim   = S.settings.timeouts_limit;
    const sLim   = S.settings.subs_limit;

    $(`tc-${side}-timeouts`).textContent = tLim > 0 ? `${tUsed}/${tLim}` : `${t.timeouts}`;
    $(`tc-${side}-subs`).textContent     = sLim > 0 ? `${sUsed}/${sLim}` : `${t.subs}`;

    $(`tc-${side}-timeouts`).classList.toggle("limit-hit", tLim > 0 && tUsed >= tLim);
    $(`tc-${side}-subs`).classList.toggle("limit-hit",     sLim > 0 && sUsed >= sLim);
  }

  // Players lists
  renderPlayersList("t1");
  renderPlayersList("t2");

  renderLog();
}

function renderSetHistory() {
  const hist = $("set-history");
  const completed = S.setScores.slice(0, S.currentSet - 1);
  if (!completed.length) {
    hist.innerHTML = `<span style="font-size:.75rem;color:var(--muted)">Brak zakończonych setów</span>`;
    return;
  }
  hist.innerHTML = completed.map((s, i) => {
    const cls = s.t1 > s.t2 ? "wt1" : s.t2 > s.t1 ? "wt2" : "";
    return `<div class="shi ${cls}">S${i+1}: ${s.t1}–${s.t2}</div>`;
  }).join("");
}

function renderPlayersList(side) {
  const hdr  = $(`bp-${side}-title`);
  const list = $(`bp-${side}-list`);
  if (!hdr || !list) return;
  hdr.textContent = S[side].name;
  const squad = S[side].squadPlayers;
  list.innerHTML = squad.length
    ? squad.map((p, i) => `
        <div class="bp-row">
          <span class="bp-num">${i+1}.</span>
          <span class="bp-name">${p.last_name} ${p.first_name}</span>
          ${p.is_captain ? '<span class="bp-cap">⭐</span>' : ""}
        </div>`).join("")
    : `<div class="log-empty">Brak zawodników</div>`;
}

function renderLog() {
  const log   = $("action-log");
  const count = S.actionLog.length;
  $("log-count").textContent = count;
  if (!count) { log.innerHTML = `<div class="log-empty">Brak zarejestrowanych akcji</div>`; return; }
  log.innerHTML = S.actionLog.slice(0, 120).map(a => `
    <div class="log-item log-${a.type}">
      <span class="log-time">${a.time}</span>
      <span class="log-text">${a.text}</span>
    </div>`).join("");
}

/* ── Start ──────────────────────────────────────────────────────── */
init();
/* ════════════════════════════════════════════════════════════════════════════
   THEME TOGGLE — jasny / ciemny motyw, synchronizowany z admin panelem
════════════════════════════════════════════════════════════════════════════ */
(function initTheme() {
  const STORAGE_KEY = "admin-theme";
  if (localStorage.getItem(STORAGE_KEY) === "light") {
    document.body.classList.add("theme-light");
  }
  function updateLabel() {
    const isLight = document.body.classList.contains("theme-light");
    const lbl = document.getElementById("theme-toggle-label");
    if (lbl) lbl.textContent = isLight ? "☀️" : "🌙";
  }
  updateLabel();
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("theme-light");
    localStorage.setItem(STORAGE_KEY, isLight ? "light" : "dark");
    updateLabel();
  });
})();