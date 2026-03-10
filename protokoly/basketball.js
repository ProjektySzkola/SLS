/* ════════════════════════════════════════════════════════════════════
   basketball.js — Protokół Koszykówki
   Ścieżka: /protokoly/basketball.js
   API: http://localhost:3001/api
════════════════════════════════════════════════════════════════════ */

// const API = "http://localhost:3001/api";
import { supabase } from '/supabase-client.js';

/* ── Helpers ────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
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
  t.className   = "toast" + (err ? " error" : "");
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
   STATE
════════════════════════════════════════════════════════════════════ */
let S = {
  phase:   "prematch",
  matchId: null,

  settings: {
    periods:          "kwarty",  // "kwarty" | "połowy"
    periodCount:      4,         // 4 (kwarty) lub 2 (połowy)
    periodDuration:   10,        // minuty
    overtimeDuration: 5,
    subsLimit:        5,
    subsPer:          "mecz",    // "mecz" | "kwarta/połowa" | "brak"
    timeoutsLimit:    2,
    timeoutsPer:      "mecz",
    teamFoulLimit:    5,
    teamFoulsPer:     "połowa",  // "połowa" | "mecz"
    playerFoulLimit:  5,
    techFoulLimit:    2,
  },

  t1: {
    id: null, name: "", cls: "",
    allPlayers: [], squadPlayers: [],
    score:    0,
    fouls:    0,   // drużynowe bieżącego okresu (do resetu)
    totalFouls: 0, // drużynowe wszystkich czasów
    timeouts: 0, setTimeouts: 0,
    subs:     0, setSubs: 0,
    // statystyki graczy: { [player_id]: { pts, fouls, techFouls, fouledOut } }
    playerStats: {},
  },
  t2: {
    id: null, name: "", cls: "",
    allPlayers: [], squadPlayers: [],
    score:    0,
    fouls:    0, totalFouls: 0,
    timeouts: 0, setTimeouts: 0,
    subs:     0, setSubs: 0,
    playerStats: {},
  },

  currentPeriod: 1,
  isOvertime:    false,
  // Wyniki per kwarta: [{t1, t2}, ...]
  periodScores: [{ t1: 0, t2: 0 }],
  // Snapshot TO i zmian per zakończona kwarta (indeks i = kwarta i+1)
  quarterStats: [],

  // Zegar
  clock: {
    remaining: 600,  // sekundy
    running:   false,
  },

  actionLog:  [],
  undoStack:  [],
};

let _clockInterval = null;

/* ── Undo ───────────────────────────────────────────────────────── */
function takeSnap(label) {
  const snap = {
    label,
    t1: deepClone({ score: S.t1.score, fouls: S.t1.fouls, totalFouls: S.t1.totalFouls, timeouts: S.t1.timeouts, setTimeouts: S.t1.setTimeouts, subs: S.t1.subs, setSubs: S.t1.setSubs, playerStats: S.t1.playerStats }),
    t2: deepClone({ score: S.t2.score, fouls: S.t2.fouls, totalFouls: S.t2.totalFouls, timeouts: S.t2.timeouts, setTimeouts: S.t2.setTimeouts, subs: S.t2.subs, setSubs: S.t2.setSubs, playerStats: S.t2.playerStats }),
    currentPeriod:  S.currentPeriod,
    isOvertime:     S.isOvertime,
    periodScores:   deepClone(S.periodScores),
    quarterStats:   deepClone(S.quarterStats),
    clockRemaining: S.clock.remaining,
    actionLog:      deepClone(S.actionLog),
  };
  S.undoStack.push(snap);
  if (S.undoStack.length > 100) S.undoStack.shift();
}

function applySnap(snap) {
  for (const side of ["t1","t2"]) {
    S[side].score       = snap[side].score;
    S[side].fouls       = snap[side].fouls;
    S[side].totalFouls  = snap[side].totalFouls;
    S[side].timeouts    = snap[side].timeouts;
    S[side].setTimeouts = snap[side].setTimeouts;
    S[side].subs        = snap[side].subs;
    S[side].setSubs     = snap[side].setSubs;
    S[side].playerStats = snap[side].playerStats;
  }
  S.currentPeriod   = snap.currentPeriod;
  S.isOvertime      = snap.isOvertime;
  S.periodScores    = snap.periodScores;
  S.quarterStats    = snap.quarterStats || [];
  S.clock.remaining = snap.clockRemaining;
  S.actionLog       = snap.actionLog;
}

/* ════════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════════ */
async function init() {
  // Wall clock
  function tick() {
    const now = new Date();
    $("topbar-clock").textContent = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    $("topbar-date").textContent  = now.toLocaleDateString("pl-PL",  { day: "2-digit", month: "short", year: "numeric" });
  }
  tick(); setInterval(tick, 1000);

  // Settings
  const raw = await apiFetch("/tournament-settings") || {};
  loadSettings(raw);

  // People
  const people = await apiFetch("/people") || [];
  fillPeopleSelects(people);

  // Matches
  const urlMatch = new URLSearchParams(location.search).get("match");
  if (urlMatch) await loadMatchById(Number(urlMatch));
  else          await loadMatchList();

  wireButtons();
}

function loadSettings(raw) {
  const n = (k, def) => Number(raw[k] ?? def);
  S.settings.periods          = raw["basketball_periods"]              || "kwarty";
  S.settings.periodCount      = S.settings.periods === "połowy" ? 2 : 4;
  S.settings.periodDuration   = n("basketball_period_duration",    10);
  S.settings.overtimeDuration = n("basketball_overtime_duration",   5);
  S.settings.subsLimit        = n("basketball_substitutions_limit", 5);
  S.settings.subsPer          = raw["basketball_substitutions_per"] || "mecz";
  S.settings.timeoutsLimit    = n("basketball_timeouts_limit",      2);
  S.settings.timeoutsPer      = raw["basketball_timeouts_per"]      || "mecz";
  S.settings.teamFoulLimit    = n("basketball_team_foul_limit",     5);
  S.settings.teamFoulsPer     = raw["basketball_team_fouls_per"]    || "połowa";
  S.settings.playerFoulLimit  = n("basketball_player_foul_limit",   5);
  S.settings.techFoulLimit    = n("basketball_tech_foul_limit",     2);

  // Set initial clock
  S.clock.remaining = S.settings.periodDuration * 60;
}

function fillPeopleSelects(people) {
  people.filter(p => ["Sędzia","Obie role"].includes(p.role)).forEach(p =>
    $("pm-referee").appendChild(new Option(`${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}`, p.id))
  );
  people.filter(p => ["Protokolant","Obie role"].includes(p.role)).forEach(p =>
    $("pm-clerk").appendChild(new Option(`${p.last_name} ${p.first_name}${p.class_name ? ` (${p.class_name})` : ""}`, p.id))
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRE-MATCH — lista meczów
════════════════════════════════════════════════════════════════════ */
let _allMatches = [], _activeFilter = "all", _searchQuery = "";

async function loadMatchList() {
  const matches = await apiFetch("/matches?discipline=Koszykówka") || [];
  _allMatches = matches.sort((a, b) => {
    const order = { "Planowany":0, "Rozegrany":1, "Odwołany":2, "Walkower":3 };
    const d = (order[a.status]??9) - (order[b.status]??9);
    return d !== 0 ? d : (a.match_date||"").localeCompare(b.match_date||"");
  });
  wireMatchFilters();
  renderMatchList();
}

async function loadMatchById(id) {
  const data = await apiFetch(`/matches/${id}`);
  if (!data?.match) { toast("Nie znaleziono meczu #" + id, true); await loadMatchList(); return; }
  const m = data.match;
  const matches = await apiFetch("/matches?discipline=Koszykówka") || [];
  _allMatches = matches.sort((a, b) => {
    const order = { "Planowany":0, "Rozegrany":1, "Odwołany":2, "Walkower":3 };
    const d = (order[a.status]??9) - (order[b.status]??9);
    return d !== 0 ? d : (a.match_date||"").localeCompare(b.match_date||"");
  });
  wireMatchFilters();
  renderMatchList();
  await selectMatch(m, null);
  if (m.referee_id) $("pm-referee").value = m.referee_id;
  if (m.clerk_id)   $("pm-clerk").value   = m.clerk_id;
}

function wireMatchFilters() {
  document.querySelectorAll(".pm-chip").forEach(chip =>
    chip.addEventListener("click", () => {
      document.querySelectorAll(".pm-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _activeFilter = chip.dataset.status;
      renderMatchList();
    })
  );
  const inp = $("pm-search"), clr = $("pm-search-clear");
  inp.addEventListener("input", () => {
    _searchQuery = inp.value.trim().toLowerCase();
    clr.classList.toggle("hidden", !_searchQuery);
    renderMatchList();
  });
  clr.addEventListener("click", () => {
    inp.value = ""; _searchQuery = "";
    clr.classList.add("hidden"); inp.focus(); renderMatchList();
  });
}

function renderMatchList() {
  const list = $("pm-match-list"), meta = $("pm-matches-meta");
  let filtered = _allMatches;
  if (_activeFilter !== "all") filtered = filtered.filter(m => m.status === _activeFilter);
  if (_searchQuery) filtered = filtered.filter(m =>
    (m.team1_name||"").toLowerCase().includes(_searchQuery) ||
    (m.team2_name||"").toLowerCase().includes(_searchQuery) ||
    (m.location||"").toLowerCase().includes(_searchQuery) ||
    String(m.id).includes(_searchQuery)
  );
  meta.textContent = `Wyświetlono: ${filtered.length} z ${_allMatches.length} meczów`;
  list.innerHTML = "";
  if (!filtered.length) { list.innerHTML = `<div class="pm-loading">Brak meczów spełniających kryteria</div>`; return; }
  filtered.forEach(m => {
    const item = mk("div", "pm-match-item" + (m.id === S.matchId ? " sel" : ""));
    const dateStr = m.match_date ? m.match_date.slice(0,10) : "—";
    const timeStr = m.match_time ? " " + m.match_time.slice(0,5) : "";
    const locStr  = m.location   ? " · " + m.location : "";
    item.innerHTML = `
      <div class="pm-match-disc">🏀</div>
      <div class="pm-match-info">
        <strong>${m.team1_name} <span style="color:var(--muted);font-weight:500">vs</span> ${m.team2_name}</strong>
        <span>${dateStr}${timeStr}${locStr}</span>
      </div>
      <span class="pm-match-status pm-match-status--${m.status}">${m.status}</span>
      <div class="pm-match-meta">#${m.id}</div>
      <div class="pm-match-sel-mark ${m.id === S.matchId ? "" : "hidden"}">✓</div>`;
    item.addEventListener("click", () => selectMatch(m, item));
    list.appendChild(item);
  });
}

async function selectMatch(m, itemEl) {
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

  const banner = $("pm-banner");
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div class="pm-banner-icon">🏀</div>
    <div class="pm-banner-text">
      <strong>${m.team1_name} vs ${m.team2_name}</strong>
      <span>${m.match_date ? m.match_date.slice(0,10) : ""} ${m.match_time ? m.match_time.slice(0,5) : ""} · ID #${m.id}</span>
    </div>`;

  $("pm-sec-officials").classList.remove("hidden");

  // Prefill referee/clerk if already set
  if (m.referee_id) setTimeout(() => { $("pm-referee").value = m.referee_id; }, 100);
  if (m.clerk_id)   setTimeout(() => { $("pm-clerk").value   = m.clerk_id;   }, 100);

  // If match already played — show historical data
  const playedSec = $("pm-sec-played-info");
  if (m.status === "Rozegrany" || m.status === "Walkower") {
    await showPlayedMatchInfo(m);
    playedSec.classList.remove("hidden");
  } else {
    playedSec.classList.add("hidden");
  }

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

  // Auto-check players who participated in this match
  await autoCheckPlayedPlayers(m.id);
  validate();
}

async function showPlayedMatchInfo(m) {
  const body = $("pm-played-info-body");

  // Fetch period/set details and team stats
  const [teamStats1, teamStats2, people] = await Promise.all([
    apiFetch(`/match-team-stats-by-match/${m.id}/${m.team1_id}`).catch(() => null),
    apiFetch(`/match-team-stats-by-match/${m.id}/${m.team2_id}`).catch(() => null),
    apiFetch("/people"),
  ]);

  const refPerson   = people?.find(p => p.id === m.referee_id);
  const clerkPerson = people?.find(p => p.id === m.clerk_id);
  const refName     = refPerson   ? `${refPerson.last_name} ${refPerson.first_name}` : "—";
  const clerkName   = clerkPerson ? `${clerkPerson.last_name} ${clerkPerson.first_name}` : "—";

  body.innerHTML = `
    <div class="pm-played-score">
      <div class="pm-played-team pm-played-team--left">${m.team1_name}</div>
      <div class="pm-played-result">${m.score_t1 ?? 0} : ${m.score_t2 ?? 0}</div>
      <div class="pm-played-team pm-played-team--right">${m.team2_name}</div>
    </div>
    ${(() => { const raw = m.referee_notes || m.referee_note || ""; let t = raw; try { t = JSON.parse(raw).notes_text || ""; } catch {} return t ? `<div style="font-size:.82rem;color:var(--muted);padding:4px 0">📝 <em>${t}</em></div>` : ""; })()}
    <div class="pm-played-officials">
      <span>⚖️ Sędzia: <strong>${refName}</strong></span>
      <span>📋 Protokolant: <strong>${clerkName}</strong></span>
    </div>`;
}

async function autoCheckPlayedPlayers(matchId) {
  // Fetch player stats for this match to know who played
  const stats = await apiFetch(`/match-player-stats-by-match/${matchId}`);
  if (!stats || !Array.isArray(stats)) return;

  const playedIds = new Set(stats.map(s => s.player_id));

  for (const side of ["t1", "t2"]) {
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

function renderPrematchSquad(side) {
  const container = $(`pm-${side}-players`);
  container.innerHTML = "";
  const players = S[side].allPlayers;
  if (!players.length) {
    container.innerHTML = `<div class="pm-loading" style="padding:12px">Brak zawodników</div>`;
    return;
  }
  [...players].sort((a,b) => (b.is_captain||0)-(a.is_captain||0)).forEach(p => {
    const hasRodo  = !!p.rodo_consent;
    const hasPart  = !!p.participation_consent;
    const hasFee   = parseFloat(p.entry_fee_paid||0) > 0;
    const allOk    = hasRodo && hasPart;
    const item     = mk("div", "pm-player-item" + (allOk ? "" : " consent-warn"));
    item.dataset.pid = p.id;
    const badges = [];
    if (p.is_captain) badges.push(`<span class="pm-player-badge badge-cap">⭐ Kapitan</span>`);
    if (allOk)        badges.push(`<span class="pm-player-badge badge-ok">✓ Zgody</span>`);
    if (!hasRodo)     badges.push(`<span class="pm-player-badge badge-warn">✗ Brak RODO</span>`);
    if (!hasPart)     badges.push(`<span class="pm-player-badge badge-warn">✗ Brak zgody uczestnictwa</span>`);
    if (!hasFee)      badges.push(`<span class="pm-player-badge badge-warn">💰 Brak opłaty</span>`);
    item.innerHTML = `
      <div class="pm-player-check">✓</div>
      <div class="pm-player-info">
        <div class="pm-player-name">${p.last_name} ${p.first_name}</div>
        <div class="pm-player-meta">${badges.join("")}</div>
      </div>`;
    item.addEventListener("click", () => toggleSquadPlayer(side, p, item));
    container.appendChild(item);
  });
  $(`pm-${side}-selall`).onclick = () => {
    S[side].squadPlayers = [...S[side].allPlayers];
    container.querySelectorAll(".pm-player-item").forEach(i => i.classList.add("checked"));
    updateSquadCount(side); validate();
  };
  updateSquadCount(side);
}

function toggleSquadPlayer(side, player, itemEl) {
  const arr = S[side].squadPlayers;
  const idx = arr.findIndex(p => p.id === player.id);
  if (idx === -1) { arr.push(player); itemEl.classList.add("checked"); }
  else            { arr.splice(idx, 1); itemEl.classList.remove("checked"); }
  updateSquadCount(side); validate();
}
function updateSquadCount(side) {
  $(`pm-${side}-count`).textContent = `${S[side].squadPlayers.length} / ${S[side].allPlayers.length}`;
}
function validate() {
  const ok = S.matchId && S.t1.squadPlayers.length >= 1 && S.t2.squadPlayers.length >= 1;
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

  // Patch officials
  const patch = {};
  const ref = $("pm-referee").value, clerk = $("pm-clerk").value;
  if (ref)   patch.referee_id = Number(ref);
  if (clerk) patch.clerk_id   = Number(clerk);
  if (Object.keys(patch).length) {
    await apiFetch(`/matches/${S.matchId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // Register players
  for (const p of [...S.t1.squadPlayers, ...S.t2.squadPlayers]) {
    await apiFetch("/match-player-stats", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: S.matchId, player_id: p.id }),
    });
  }

  // Team class names
  const [team1, team2] = await Promise.all([apiFetch(`/teams/${S.t1.id}`), apiFetch(`/teams/${S.t2.id}`)]);
  if (team1) S.t1.cls = team1.class_name || "";
  if (team2) S.t2.cls = team2.class_name || "";

  // Init player stats
  for (const side of ["t1","t2"]) {
    S[side].playerStats = {};
    S[side].squadPlayers.forEach(p => {
      S[side].playerStats[p.id] = { pts: 0, pts1: 0, pts2: 0, pts3: 0, fouls: 0, techFouls: 0, fouledOut: false };
    });
  }

  S.phase = "playing";
  $("view-prematch").classList.add("hidden");
  $("view-match").classList.remove("hidden");

  // Aktualizuj etykiety UI zgodnie z ustawieniem kwarty/połowy
  updatePeriodLabels();

  logAction("system", `Mecz rozpoczęty: ${S.t1.name} vs ${S.t2.name}`);
  renderAll();
  renderPeriodTable();
}

/* ════════════════════════════════════════════════════════════════════
   CLOCK
════════════════════════════════════════════════════════════════════ */
function startClock() {
  if (_clockInterval) return;
  _clockInterval = setInterval(() => {
    if (S.clock.remaining <= 0) { stopClock(); return; }
    S.clock.remaining--;
    renderClock();
    if (S.clock.remaining === 0) toast(`⏰ Czas ${periodUnitAcc()} upłynął!`, false);
  }, 1000);
  S.clock.running = true;
  renderClockBtn();
}
function stopClock() {
  clearInterval(_clockInterval); _clockInterval = null;
  S.clock.running = false;
  renderClockBtn();
}
function toggleClock() {
  if (S.clock.running) stopClock(); else startClock();
}
function resetClock() {
  stopClock();
  S.clock.remaining = (S.isOvertime ? S.settings.overtimeDuration : S.settings.periodDuration) * 60;
  renderClock();
}
function adjustClock(seconds) {
  S.clock.remaining = Math.max(0, S.clock.remaining + seconds);
  renderClock();
}

function renderClock() {
  const rem  = S.clock.remaining;
  const min  = Math.floor(rem / 60);
  const sec  = rem % 60;
  const disp = $("clock-display");
  disp.textContent = `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  disp.classList.toggle("running", S.clock.running);
  disp.classList.toggle("urgent",  rem <= 30 && rem > 0);
}
function renderClockBtn() {
  $("btn-clock-toggle").textContent = S.clock.running ? "⏸ Stop" : "▶ Start";
}

/* ════════════════════════════════════════════════════════════════════
   SCORING & FOULS
════════════════════════════════════════════════════════════════════ */
function addPoints(side, playerId, pts) {
  if (S.phase !== "playing") return;
  takeSnap(`+${pts}pkt ${S[side].name}`);

  const ps = S[side].playerStats[playerId];
  if (!ps) return;
  if (ps.fouledOut) { toast("Zawodnik jest zdyskwalifikowany!", true); return; }

  ps.pts += pts;
  if (pts === 1) ps.pts1++;
  else if (pts === 2) ps.pts2++;
  else if (pts === 3) ps.pts3++;

  S[side].score += pts;
  S.periodScores[S.currentPeriod - 1][side] += pts;

  const player = S[side].squadPlayers.find(p => p.id === playerId);
  logAction("point", `+${pts}pkt: ${player ? player.last_name + " " + player.first_name : "?"} (${S[side].name}) → ${S[side].score}`);
  renderAll();
  renderPeriodTable();
}

function addPlayerFoul(side, playerId) {
  if (S.phase !== "playing") return;
  const ps = S[side].playerStats[playerId];
  if (!ps) return;
  if (ps.fouledOut) { toast("Zawodnik już jest zdyskwalifikowany!", true); return; }

  takeSnap(`Faul osobisty ${S[side].name}`);
  ps.fouls++;
  S[side].fouls++;
  S[side].totalFouls++;

  const player = S[side].squadPlayers.find(p => p.id === playerId);
  const pName  = player ? player.last_name + " " + player.first_name : "?";

  // Dyskwalifikacja zawodnika
  if (ps.fouls >= S.settings.playerFoulLimit) {
    ps.fouledOut = true;
    logAction("foul", `🚫 ${pName} (${S[side].name}) — ${ps.fouls} fauli → DYSKWALIFIKACJA`);
    toast(`${pName} zdyskwalifikowany! (${ps.fouls} fauli)`);
  } else {
    logAction("foul", `Faul osobisty: ${pName} (${S[side].name}) — ${ps.fouls}/${S.settings.playerFoulLimit}`);
  }

  // Alert drużynowy
  checkTeamFoulAlert(side);
  renderAll();
}

function addTechFoul(side, playerId) {
  if (S.phase !== "playing") return;
  const ps = S[side].playerStats[playerId];
  if (!ps) return;

  takeSnap(`Faul techniczny ${S[side].name}`);
  ps.techFouls++;
  // Faul techniczny wlicza się do sumy fauli drużynowych
  S[side].fouls++;
  S[side].totalFouls++;

  const player = S[side].squadPlayers.find(p => p.id === playerId);
  const pName  = player ? player.last_name + " " + player.first_name : "?";

  if (ps.techFouls >= S.settings.techFoulLimit) {
    ps.fouledOut = true;
    logAction("foul", `🚫 ${pName} (${S[side].name}) — ${ps.techFouls} fauli technicznych → DYSKWALIFIKACJA`);
    toast(`${pName} zdyskwalifikowany za faule techniczne!`);
  } else {
    logAction("foul", `Faul techniczny: ${pName} (${S[side].name}) — tech: ${ps.techFouls}/${S.settings.techFoulLimit}, drużyna: ${S[side].fouls}`);
  }
  checkTeamFoulAlert(side);
  renderAll();
}

function checkTeamFoulAlert(side) {
  const limit  = S.settings.teamFoulLimit;
  const fouls  = S[side].fouls;
  const alertEl = $(`tcp-${side}-foul-alert`);
  if (fouls >= limit) {
    alertEl.classList.remove("hidden");
    const opp = side === "t1" ? "t2" : "t1";
    logAction("foul", `⚠️ ${S[side].name} — ${fouls} fauli drużynowych → rzuty osobiste dla ${S[opp].name}!`);
    toast(`⚠️ ${S[side].name} — limit fauli! Rzut osobisty.`);
  } else {
    alertEl.classList.add("hidden");
  }
}

/* ════════════════════════════════════════════════════════════════════
   TIMEOUTS & SUBSTITUTIONS
════════════════════════════════════════════════════════════════════ */
function addTimeout(side) {
  if (S.phase !== "playing") return;
  const t    = S[side];
  const perP = S.settings.timeoutsPer === "kwarta/połowa";
  const used = perP ? t.setTimeouts : t.timeouts;
  const lim  = S.settings.timeoutsLimit;
  if (lim > 0 && used >= lim) { toast(`Limit przerw wyczerpany (${lim}${perP ? `/${periodUnitAcc()}` : "/mecz"})`, true); return; }
  takeSnap(`Przerwa ${t.name}`);
  t.timeouts++; t.setTimeouts++;
  logAction("timeout", `Przerwa: ${t.name} (${used+1}/${lim>0?lim:"∞"}${perP?`/${periodUnitAcc()}`:"/mecz"})`);
  renderAll();
}

function addSubstitution(side) {
  if (S.phase !== "playing") return;
  const t    = S[side];
  const perP = S.settings.subsPer === "kwarta/połowa";
  const used = perP ? t.setSubs : t.subs;
  const lim  = S.settings.subsLimit;
  if (S.settings.subsPer !== "brak" && lim > 0 && used >= lim) {
    toast(`Limit zmian wyczerpany (${lim}${perP ? `/${periodUnitAcc()}` : "/mecz"})`, true); return;
  }
  takeSnap(`Zmiana ${t.name}`);
  t.subs++; t.setSubs++;
  logAction("sub", `Zmiana: ${t.name} (${used+1}/${lim>0?lim:"∞"}${perP?`/${periodUnitAcc()}`:"/mecz"})`);
  renderAll();
}

/* ════════════════════════════════════════════════════════════════════
   PERIODS
════════════════════════════════════════════════════════════════════ */
function promptNextPeriod() {
  const isLast = S.currentPeriod >= S.settings.periodCount && !S.isOvertime;
  const label  = S.isOvertime ? "Dogrywkę" : `${periodName(S.currentPeriod)}`;
  $("period-modal-title").textContent = `Zakończyć ${label}?`;
  $("period-modal-body").innerHTML    = `Wynik: <strong>${S.t1.name} ${S.t1.score} : ${S.t2.score} ${S.t2.name}</strong>`;
  $("period-confirm").textContent     = isLast ? "🏁 Zakończ mecz" : `→ ${isLast ? "Koniec" : periodName(S.currentPeriod + 1)}`;
  $("period-confirm").onclick = () => {
    $("period-backdrop").classList.add("hidden");
    if (isLast) { promptFinish(); } else { confirmNextPeriod(); }
  };
  $("period-cancel").onclick = () => $("period-backdrop").classList.add("hidden");
  $("period-backdrop").classList.remove("hidden");
}

function confirmNextPeriod() {
  takeSnap(`Koniec ${periodName(S.currentPeriod)}`);
  stopClock();

  logAction("period", `✓ ${periodName(S.currentPeriod)} zakończona: ${S.t1.score}:${S.t2.score}`);

  // ── Snapshot per-quarter stats BEFORE resetting counters ──────────────────
  const qIdx = S.currentPeriod - 1;  // 0-based
  S.quarterStats[qIdx] = {
    to_t1:   S.t1.setTimeouts,
    to_t2:   S.t2.setTimeouts,
    subs_t1: S.t1.setSubs,
    subs_t2: S.t2.setSubs,
  };

  // Reset per-period counters
  const isHalfTime = S.settings.teamFoulsPer === "połowa" &&
                     ((S.settings.periods === "kwarty" && S.currentPeriod === 2) ||
                      (S.settings.periods === "połowy" && S.currentPeriod === 1));

  if (S.settings.subsPer === "kwarta/połowa") {
    S.t1.setSubs = 0; S.t2.setSubs = 0;
  }
  if (S.settings.timeoutsPer === "kwarta/połowa") {
    S.t1.setTimeouts = 0; S.t2.setTimeouts = 0;
  }
  if (isHalfTime || S.settings.teamFoulsPer === "połowa") {
    // Reset po każdej kwarcie lub tylko po połowie (zależy od ustawień)
    if (S.settings.periods === "połowy" || isHalfTime) {
      S.t1.fouls = 0; S.t2.fouls = 0;
      $("tcp-t1-foul-alert").classList.add("hidden");
      $("tcp-t2-foul-alert").classList.add("hidden");
    }
  }

  S.currentPeriod++;
  S.isOvertime = false;
  S.periodScores.push({ t1: 0, t2: 0 });
  S.clock.remaining = S.settings.periodDuration * 60;

  logAction("period", `→ ${periodName(S.currentPeriod)} rozpoczęta`);
  renderAll();
  renderPeriodTable();
  toast(`${periodName(S.currentPeriod - 1)} zakończona`);
}

function activateOvertime() {
  if (S.phase !== "playing") return;
  takeSnap("Dogrywka");
  stopClock();
  S.isOvertime = true;
  S.currentPeriod = S.settings.periodCount + 1;
  S.periodScores.push({ t1: 0, t2: 0 });
  S.clock.remaining = S.settings.overtimeDuration * 60;
  logAction("period", `⚡ Dogrywka (${S.settings.overtimeDuration} min)`);
  renderAll();
  renderPeriodTable();
  toast("Dogrywka!");
}

/** Aktualizuje statyczne etykiety UI (przyciski, nagłówki) w zależności od trybu kwarty/połowy */
function updatePeriodLabels() {
  const isPołowy = S.settings.periods === "połowy";
  const nextLabel = isPołowy ? "Następna połowa →" : "Następna kwarta →";
  const periodsHeader = isPołowy ? "Połowy" : "Kwarty";
  const scoresHeader  = isPołowy ? "Wyniki połów" : "Wyniki kwart";

  const btnNext = $("btn-next-period");
  if (btnNext) btnNext.textContent = nextLabel;

  const periodsLbl = $("periods-panel-label");
  if (periodsLbl) periodsLbl.textContent = periodsHeader;

  const scoresLbl = $("period-scores-label");
  if (scoresLbl) scoresLbl.textContent = scoresHeader;
}

function periodName(n) {
  if (S.isOvertime || n > S.settings.periodCount) return "Dogrywka";
  return S.settings.periods === "połowy"
    ? (n === 1 ? "I połowa" : "II połowa")
    : `${n}. kwarta`;
}

/** Zwraca odmienioną nazwę okresu w bierniku, np. „kwartę" / „połowę" — do komunikatów */
function periodUnitAcc() {
  return S.settings.periods === "połowy" ? "połowę" : "kwartę";
}

/* ════════════════════════════════════════════════════════════════════
   FINISH MATCH
════════════════════════════════════════════════════════════════════ */
function promptFinish() {
  const w = S.t1.score > S.t2.score ? S.t1.name :
            S.t2.score > S.t1.score ? S.t2.name : "Remis";
  $("finish-body").innerHTML = `
    <strong>${S.t1.name} ${S.t1.score} : ${S.t2.score} ${S.t2.name}</strong><br>
    Zwycięzca: <strong>${w}</strong>`;
  $("finish-backdrop").classList.remove("hidden");
}
async function finishMatch() {
  $("finish-backdrop").classList.add("hidden");
  stopClock();
  S.phase = "finished";
  logAction("system", `Mecz zakończony: ${S.t1.name} ${S.t1.score}:${S.t2.score} ${S.t2.name}`);
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
  const r = await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referee_notes: $("referee-note").value }),
  });
  if (r) toast("Notatka zapisana ✓"); else toast("Błąd zapisu", true);
}

async function saveProtocol(finish = false) {
  if (!S.matchId) return;

  // ── 1. Patch match score / status ────────────────────────────────────────
  const patch = { score_t1: S.t1.score, score_t2: S.t2.score };
  if (finish) patch.status = "Rozegrany";
  await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  // ── 2. Kwarty (Volleyball_Sets) — wyniki + TO + Zmiany per kwarta ────────
  const sets = S.periodScores.map((ps, i) => {
    // quarterStats has snapshots for finished quarters; current quarter gets live counters
    const qSnap = S.quarterStats[i];
    return {
      set_number: i + 1,
      points_t1:  ps.t1,
      points_t2:  ps.t2,
      to_t1:      qSnap ? qSnap.to_t1   : S.t1.setTimeouts,
      to_t2:      qSnap ? qSnap.to_t2   : S.t2.setTimeouts,
      subs_t1:    qSnap ? qSnap.subs_t1 : S.t1.setSubs,
      subs_t2:    qSnap ? qSnap.subs_t2 : S.t2.setSubs,
    };
  });
  await apiFetch(`/matches/${S.matchId}/sets`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sets }),
  });

  // ── 3. Team stats (sumy) ─────────────────────────────────────────────────
  for (const side of ["t1","t2"]) {
    const t = S[side];
    await apiFetch("/match-team-stats", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: S.matchId, team_id: t.id,
        timeouts_taken: t.timeouts, substitutions_used: t.subs,
        team_fouls_count: t.totalFouls,
      }),
    });
  }

  // ── 4. Player stats — z rozpisaniem 1/2/3 ───────────────────────────────
  for (const side of ["t1","t2"]) {
    for (const p of S[side].squadPlayers) {
      const ps = S[side].playerStats[p.id];
      if (!ps) continue;
      await apiFetch("/match-player-stats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id:             S.matchId,
          player_id:            p.id,
          total_points_in_match: ps.pts,
          points_1pt:           ps.pts1 || 0,
          points_2pt:           ps.pts2 || 0,
          points_3pt:           ps.pts3 || 0,
          personal_fouls:       ps.fouls,
          technical_fouls:      ps.techFouls,
        }),
      });
    }
  }

  // ── 5. Logi meczu (idempotentne — bulk replace) ──────────────────────────
  const logs = [...S.actionLog].reverse().map(a => ({
    type:        a.type,
    description: a.text,
    time:        a.time,
  }));
  await apiFetch(`/matches/${S.matchId}/logs`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs }),
  });

  if (!finish) toast("Protokół zapisany ✓");
  logAction("system", `Protokół zapisany (${nowHHMM()})`);
}

/* ════════════════════════════════════════════════════════════════════
   UNDO
════════════════════════════════════════════════════════════════════ */
function undoAction() {
  if (!S.undoStack.length) { toast("Brak akcji do cofnięcia", true); return; }
  const snap = S.undoStack.pop();
  applySnap(snap);
  logAction("undo", `↩ Cofnięto: ${snap.label}`);
  renderAll();
  renderPeriodTable();
  toast("Cofnięto akcję");
}

/* ════════════════════════════════════════════════════════════════════
   RENDER
════════════════════════════════════════════════════════════════════ */
function logAction(type, text) {
  S.actionLog.unshift({ type, text, time: nowHHMM() });
  renderLog();
}

function renderAll() {
  // Scoreboard
  $("sb-t1-name").textContent = S.t1.name; $("sb-t1-cls").textContent = S.t1.cls;
  $("sb-t2-name").textContent = S.t2.name; $("sb-t2-cls").textContent = S.t2.cls;
  $("sb-score-t1").textContent = S.t1.score;
  $("sb-score-t2").textContent = S.t2.score;
  $("sb-period-label").textContent = periodName(S.currentPeriod);
  $("topbar-match-label").textContent = `🏀 ${S.t1.name} vs ${S.t2.name}`;

  // Clock
  renderClock();

  // Periods
  renderPeriodPills();

  // Team panels
  for (const side of ["t1","t2"]) {
    const t = S[side];
    $(`tcp-${side}-name`).textContent = t.name;

    const fLim   = S.settings.teamFoulLimit;
    const fEl    = $(`tc-${side}-fouls`);
    fEl.textContent = t.fouls;
    fEl.classList.toggle("warn",  t.fouls >= Math.ceil(fLim * 0.6) && t.fouls < fLim);
    fEl.classList.toggle("limit", t.fouls >= fLim);
    $(`tc-${side}-fouls-sub`).textContent = `suma: ${t.totalFouls}`;

    const tPerP  = S.settings.timeoutsPer === "kwarta/połowa";
    const sPerP  = S.settings.subsPer     === "kwarta/połowa";
    const tUsed  = tPerP ? t.setTimeouts : t.timeouts;
    const sUsed  = sPerP ? t.setSubs     : t.subs;
    const tLim   = S.settings.timeoutsLimit;
    const sLim   = S.settings.subsLimit;
    const tEl    = $(`tc-${side}-timeouts`);
    const sEl    = $(`tc-${side}-subs`);
    tEl.textContent = tLim > 0 ? `${tUsed}/${tLim}` : `${t.timeouts}`;
    sEl.textContent = sLim > 0 ? `${sUsed}/${sLim}` : `${t.subs}`;
    tEl.classList.toggle("limit", tLim > 0 && tUsed >= tLim);
    sEl.classList.toggle("limit", sLim > 0 && sUsed >= sLim);
  }

  renderPlayers("t1");
  renderPlayers("t2");
  renderLog();
}

function renderPeriodPills() {
  const list  = $("periods-list");
  const total = S.settings.periodCount;
  list.innerHTML = "";
  for (let i = 1; i <= total; i++) {
    const pill = mk("div", "period-pill" +
      (i === S.currentPeriod && !S.isOvertime ? " active" :
       i < S.currentPeriod && !S.isOvertime   ? " done"   : ""));
    pill.textContent = S.settings.periods === "połowy"
      ? (i === 1 ? "I poł." : "II poł.")
      : `Q${i}`;
    list.appendChild(pill);
  }
  if (S.isOvertime) {
    const ot = mk("div", "period-pill ot active");
    ot.textContent = "OT"; list.appendChild(ot);
  }
}

function renderPeriodTable() {
  const wrap  = $("period-scores-table");
  const total = S.periodScores.length;
  const names = [];
  for (let i = 0; i < total; i++) {
    if (S.isOvertime && i === S.settings.periodCount) {
      names.push("OT");
    } else if (S.settings.periods === "połowy") {
      names.push(i === 0 ? "I" : "II");
    } else {
      names.push(`Q${i+1}`);
    }
  }

  const t1Rows = S.periodScores.map(s => s.t1);
  const t2Rows = S.periodScores.map(s => s.t2);
  const t1Tot  = t1Rows.reduce((a,b) => a+b, 0);
  const t2Tot  = t2Rows.reduce((a,b) => a+b, 0);

  const headerCells = names.map((n,i) => {
    const isCur = i === S.currentPeriod - 1;
    return `<th class="${isCur ? "current" : ""}">${n}</th>`;
  }).join("") + `<th>Σ</th>`;

  const mkRow = (name, vals, total) =>
    `<tr class="${vals[S.currentPeriod-1] !== undefined ? "current-period" : ""}">
      <td class="team-name">${name}</td>
      ${vals.map(v => `<td>${v}</td>`).join("")}
      <td class="total">${total}</td>
    </tr>`;

  wrap.innerHTML = `
    <table class="pst-table">
      <thead><tr><th></th>${headerCells}</tr></thead>
      <tbody>
        ${mkRow(S.t1.name, t1Rows, t1Tot)}
        ${mkRow(S.t2.name, t2Rows, t2Tot)}
      </tbody>
    </table>`;
}

function renderPlayers(side) {
  const hdr    = $(`players-${side}-hdr`);
  const body   = $(`players-${side}-body`);
  const squad  = S[side].squadPlayers;
  if (hdr) hdr.textContent = S[side].name;
  if (!body) return;
  body.innerHTML = "";

  squad.forEach((p, i) => {
    const ps = S[side].playerStats[p.id] || { pts:0, pts1:0, pts2:0, pts3:0, fouls:0, techFouls:0, fouledOut:false };
    const fLim  = S.settings.playerFoulLimit;
    const tLim  = S.settings.techFoulLimit;
    const fDang = ps.fouls >= fLim - 1 && ps.fouls < fLim;
    const tHas  = ps.techFouls > 0;

    const row = mk("div", "player-row" + (ps.fouledOut ? " fouled-out" : ""));
    row.innerHTML = `
      <span class="pr-num">${i+1}</span>
      <span class="pr-name">${p.last_name} ${p.first_name}${p.is_captain ? " ⭐" : ""}</span>
      <div class="pr-pts-wrap">
        <span class="pr-pts">${ps.pts}</span>
        <span class="pr-pts-breakdown">${ps.pts1}×1 · ${ps.pts2}×2 · ${ps.pts3}×3</span>
      </div>
      <div class="pr-pts-btns">
        <button class="pr-pts-btn" data-side="${side}" data-pid="${p.id}" data-pts="1" title="+1 (rzut wolny)">+1</button>
        <button class="pr-pts-btn" data-side="${side}" data-pid="${p.id}" data-pts="2" title="+2 (za dwa)">+2</button>
        <button class="pr-pts-btn" data-side="${side}" data-pid="${p.id}" data-pts="3" title="+3 (za trzy)">+3</button>
      </div>
      <button class="pr-foul-btn${fDang?" danger":""}${ps.fouledOut?" out":""}"
        data-side="${side}" data-pid="${p.id}" title="Faul osobisty (${ps.fouls}/${fLim})">
        🟡 <span class="pr-foul-count">${ps.fouls}</span>/${fLim}
      </button>
      <button class="pr-tech-btn${tHas?" has-tech":""}"
        data-side="${side}" data-pid="${p.id}" title="Faul techniczny (${ps.techFouls}/${tLim})">
        🔴 ${ps.techFouls}
      </button>`;
    body.appendChild(row);
  });

  // Wire points buttons
  body.querySelectorAll(".pr-pts-btn").forEach(btn =>
    btn.addEventListener("click", () =>
      addPoints(btn.dataset.side, Number(btn.dataset.pid), Number(btn.dataset.pts))
    )
  );
  // Wire foul buttons
  body.querySelectorAll(".pr-foul-btn").forEach(btn =>
    btn.addEventListener("click", () =>
      addPlayerFoul(btn.dataset.side, Number(btn.dataset.pid))
    )
  );
  // Wire tech buttons
  body.querySelectorAll(".pr-tech-btn").forEach(btn =>
    btn.addEventListener("click", () =>
      addTechFoul(btn.dataset.side, Number(btn.dataset.pid))
    )
  );
}

function renderLog() {
  const log   = $("action-log");
  const count = S.actionLog.length;
  $("log-count").textContent = count;
  if (!count) { log.innerHTML = `<div class="log-empty">Brak akcji</div>`; return; }
  log.innerHTML = S.actionLog.slice(0, 120).map(a =>
    `<div class="log-item log-${a.type}">
      <span class="log-time">${a.time}</span>
      <span class="log-text">${a.text}</span>
    </div>`
  ).join("");
}

/* ════════════════════════════════════════════════════════════════════
   CLOCK MANUAL MODAL
════════════════════════════════════════════════════════════════════ */
function openClockModal() {
  const m = Math.floor(S.clock.remaining / 60);
  const s = S.clock.remaining % 60;
  $("clock-manual-min").value = m;
  $("clock-manual-sec").value = s;
  $("clock-modal-backdrop").classList.remove("hidden");
}
function closeClockModal() { $("clock-modal-backdrop").classList.add("hidden"); }
function confirmClockModal() {
  const m = Math.max(0, Math.min(99, Number($("clock-manual-min").value) || 0));
  const s = Math.max(0, Math.min(59, Number($("clock-manual-sec").value) || 0));
  S.clock.remaining = m * 60 + s;
  renderClock();
  closeClockModal();
}

/* ════════════════════════════════════════════════════════════════════
   WIRE BUTTONS
════════════════════════════════════════════════════════════════════ */
function wireButtons() {
  $("pm-start-btn").addEventListener("click",   startMatch);
  $("btn-clock-toggle").addEventListener("click", toggleClock);
  $("btn-clock-reset").addEventListener("click",  () => { takeSnap("Reset zegara"); resetClock(); });
  $("btn-clock-manual").addEventListener("click", openClockModal);

  // Precise clock adjustment buttons
  document.querySelectorAll(".clock-adj-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      takeSnap(`Korekta zegara ${btn.dataset.sec}s`);
      adjustClock(Number(btn.dataset.sec));
    })
  );

  $("clock-modal-close").addEventListener("click",   closeClockModal);
  $("clock-modal-cancel").addEventListener("click",  closeClockModal);
  $("clock-modal-confirm").addEventListener("click", confirmClockModal);
  $("clock-modal-backdrop").addEventListener("click", e => { if (e.target === $("clock-modal-backdrop")) closeClockModal(); });

  $("btn-next-period").addEventListener("click",  promptNextPeriod);
  $("btn-overtime").addEventListener("click",     activateOvertime);

  $("btn-t1-timeout").addEventListener("click",  () => addTimeout("t1"));
  $("btn-t2-timeout").addEventListener("click",  () => addTimeout("t2"));
  $("btn-t1-sub").addEventListener("click",      () => addSubstitution("t1"));
  $("btn-t2-sub").addEventListener("click",      () => addSubstitution("t2"));

  $("btn-undo").addEventListener("click",   undoAction);
  $("btn-save").addEventListener("click",   () => saveProtocol(false));
  $("btn-save-note").addEventListener("click", saveNote);
  $("btn-finish").addEventListener("click", promptFinish);

  $("period-cancel").addEventListener("click",  () => $("period-backdrop").classList.add("hidden"));
  $("finish-cancel").addEventListener("click",  () => $("finish-backdrop").classList.add("hidden"));
  $("finish-confirm").addEventListener("click", finishMatch);

  // Exit — always visible, double confirm
  $("topbar-exit").addEventListener("click", openExitConfirm);
  $("exit-cancel").addEventListener("click",  () => $("exit-backdrop").classList.add("hidden"));
  $("exit-confirm").addEventListener("click", () => { location.href = "../admin_panel/admin.html"; });
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

/* ── Start ─────────────────────────────────────────────────────── */
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