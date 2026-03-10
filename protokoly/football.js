/* ════════════════════════════════════════════════════════════════════
   football.js — Protokół Piłki Nożnej
   Ścieżka: /protokoly/football.js
   API: http://localhost:3001/api
════════════════════════════════════════════════════════════════════ */

// const API = "http://localhost:3001/api";
const supabase = window.supabase; /* ładowane przez HTML jako module */

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
  phase:   "prematch",   // prematch | playing | penalties | finished
  matchId: null,

  settings: {
    halfDuration:   45,   // minuty
    halfCount:       2,   // liczba połów
    extraDuration:  10,   // minuty dogrywki
    subsLimit:       5,   // limit zmian
    subsPer:      "mecz", // "mecz" | "połowa" | "brak"
    penaltyShootout: true, // czy rzuty karne są dostępne
  },

  t1: {
    id: null, name: "", cls: "",
    allPlayers: [], squadPlayers: [],
    score:  0,
    subs:   0,
    // playerStats: { [id]: { goals, yellow, red, disqualified } }
    playerStats: {},
  },
  t2: {
    id: null, name: "", cls: "",
    allPlayers: [], squadPlayers: [],
    score:  0,
    subs:   0,
    playerStats: {},
  },

  // połowy: 1=I, 2=II, 3=dogrywka I, 4=dogrywka II
  currentPeriod: 1,
  periodMode: "regular",   // "regular" | "extra" | "penalties"
  periodScores: [{ t1: 0, t2: 0, subs_t1: 0, subs_t2: 0 }],

  // Zegar – liczy w górę (minuty meczu)
  clock: {
    elapsed: 0,    // sekundy
    running: false,
  },

  // Rzuty karne
  penalties: {
    // Setup
    shootersPerTeam: 5,   // z ustawień: football_penalty_shooters
    winsNeeded:      5,   // z ustawień: football_penalty_wins
    startSide: "t1",      // kto zaczyna

    t1: { gk: null, shooters: [] },  // gk: {playerId, name}, shooters: [{playerId,name}]
    t2: { gk: null, shooters: [] },

    // Active
    kicks: [],   // [{side, shooterName, gkName, result:"hit"|"miss", roundIdx, isSuddenDeath}]
    currentKickIdx: 0,   // which kick we're on (index into the alternating sequence)
    finished: false,
    winner: null,  // "t1"|"t2"|"draw"
  },

  actionLog:  [],
  undoStack:  [],
};

let _clockInterval = null;

/* ── Undo ───────────────────────────────────────────────────────── */
function takeSnap(label) {
  const snap = {
    label,
    t1: deepClone({ score: S.t1.score, subs: S.t1.subs, subsPeriod: S.t1.subsPeriod || 0, playerStats: S.t1.playerStats }),
    t2: deepClone({ score: S.t2.score, subs: S.t2.subs, subsPeriod: S.t2.subsPeriod || 0, playerStats: S.t2.playerStats }),
    currentPeriod:  S.currentPeriod,
    periodMode:     S.periodMode,
    periodScores:   deepClone(S.periodScores),
    clockElapsed:   S.clock.elapsed,
    penalties:      deepClone(S.penalties),
    actionLog:      deepClone(S.actionLog),
  };
  S.undoStack.push(snap);
  if (S.undoStack.length > 100) S.undoStack.shift();
}

function applySnap(snap) {
  for (const side of ["t1","t2"]) {
    S[side].score       = snap[side].score;
    S[side].subs        = snap[side].subs;
    S[side].subsPeriod  = snap[side].subsPeriod ?? 0;
    S[side].playerStats = snap[side].playerStats;
  }
  S.currentPeriod  = snap.currentPeriod;
  S.periodMode     = snap.periodMode;
  S.periodScores   = snap.periodScores;
  S.clock.elapsed  = snap.clockElapsed;
  S.penalties      = snap.penalties;
  S.actionLog      = snap.actionLog;
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
  S.settings.halfDuration     = n("football_half_duration",      45);
  S.settings.halfCount        = n("football_half_count",          2);
  S.settings.extraDuration    = n("football_overtime_duration",  10);
  S.settings.subsLimit        = n("football_substitutions_limit", 5);
  S.settings.subsPer          = raw["football_substitutions_per"] || "mecz";   // "mecz" | "połowa" | "brak"
  S.settings.penaltyShootout  = (raw["football_penalty_shootout"] ?? "1") !== "0"; // true / false
  S.settings.pkShooters       = n("football_penalty_shooters", 5);
  S.settings.pkWins           = n("football_penalty_wins",     5);
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
  const matches = await apiFetch("/matches?discipline=Pi%C5%82ka%20No%C5%BCna") || [];
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
  const matches = await apiFetch("/matches?discipline=Pi%C5%82ka%20No%C5%BCna") || [];
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
      <div class="pm-match-disc">⚽</div>
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
    <div class="pm-banner-icon">⚽</div>
    <div class="pm-banner-text">
      <strong>${m.team1_name} vs ${m.team2_name}</strong>
      <span>${m.match_date ? m.match_date.slice(0,10) : ""} ${m.match_time ? m.match_time.slice(0,5) : ""} · ID #${m.id}</span>
    </div>`;

  $("pm-sec-officials").classList.remove("hidden");

  if (m.referee_id) setTimeout(() => { $("pm-referee").value = m.referee_id; }, 100);
  if (m.clerk_id)   setTimeout(() => { $("pm-clerk").value   = m.clerk_id;   }, 100);

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

  await autoCheckPlayedPlayers(m.id);
  validate();
}

async function showPlayedMatchInfo(m) {
  const body = $("pm-played-info-body");
  const people = await apiFetch("/people");
  const refPerson   = people?.find(p => p.id === m.referee_id);
  const clerkPerson = people?.find(p => p.id === m.clerk_id);
  const refName     = refPerson   ? `${refPerson.last_name} ${refPerson.first_name}` : "—";
  const clerkName   = clerkPerson ? `${clerkPerson.last_name} ${clerkPerson.first_name}` : "—";

  const shootoutStr = (m.shootout_t1 != null && m.shootout_t2 != null)
    ? `<div style="font-size:.8rem;color:var(--purple);margin-top:4px">⚽ Rzuty karne: ${m.shootout_t1} : ${m.shootout_t2}</div>` : "";

  body.innerHTML = `
    <div class="pm-played-score">
      <div class="pm-played-team pm-played-team--left">${m.team1_name}</div>
      <div class="pm-played-result">${m.score_t1 ?? 0} : ${m.score_t2 ?? 0}</div>
      <div class="pm-played-team pm-played-team--right">${m.team2_name}</div>
    </div>
    ${shootoutStr}
    ${(() => { const raw = m.referee_notes || m.referee_note || ""; let t = raw; try { t = JSON.parse(raw).notes_text || ""; } catch {} return t ? `<div style="font-size:.82rem;color:var(--muted);padding:4px 0">📝 <em>${t}</em></div>` : ""; })()}
    <div class="pm-played-officials">
      <span>⚖️ Sędzia: <strong>${refName}</strong></span>
      <span>📋 Protokolant: <strong>${clerkName}</strong></span>
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

function renderPrematchSquad(side) {
  const container = $(`pm-${side}-players`);
  container.innerHTML = "";
  const players = S[side].allPlayers;
  if (!players.length) {
    container.innerHTML = `<div class="pm-loading" style="padding:12px">Brak zawodników</div>`;
    return;
  }
  [...players].sort((a,b) => (b.is_captain||0)-(a.is_captain||0)).forEach(p => {
    const hasRodo = !!p.rodo_consent, hasPart = !!p.participation_consent;
    const hasFee  = parseFloat(p.entry_fee_paid||0) > 0;
    const allOk   = hasRodo && hasPart;
    const item    = mk("div", "pm-player-item" + (allOk ? "" : " consent-warn"));
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

  for (const p of [...S.t1.squadPlayers, ...S.t2.squadPlayers]) {
    await apiFetch("/match-player-stats", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: S.matchId, player_id: p.id }),
    });
  }

  const [team1, team2] = await Promise.all([apiFetch(`/teams/${S.t1.id}`), apiFetch(`/teams/${S.t2.id}`)]);
  if (team1) S.t1.cls = team1.class_name || "";
  if (team2) S.t2.cls = team2.class_name || "";

  // Init player stats
  for (const side of ["t1","t2"]) {
    S[side].playerStats = {};
    S[side].squadPlayers.forEach(p => {
      S[side].playerStats[p.id] = { goals: 0, yellow: 0, red: false, disqualified: false };
    });
  }

  // Load referee note — football stores in referee_notes as JSON {notes_text, __fb}
  const matchData = await apiFetch(`/matches/${S.matchId}`);
  if (matchData?.match) {
    const raw = matchData.match.referee_notes || matchData.match.referee_note || "";
    let noteTxt = raw;
    try { noteTxt = JSON.parse(raw).notes_text || ""; } catch {}
    $("referee-note").value = noteTxt;
  }

  S.phase = "playing";
  $("view-prematch").classList.add("hidden");
  $("view-match").classList.remove("hidden");

  logAction("system", `Mecz rozpoczęty: ${S.t1.name} vs ${S.t2.name}`);
  renderAll();
  renderPeriodTable();
}

/* ════════════════════════════════════════════════════════════════════
   CLOCK — count up
════════════════════════════════════════════════════════════════════ */
function startClock() {
  if (_clockInterval) return;
  S.clock.running = true;
  $("btn-clock-toggle").textContent = "⏸ Pauza";
  $("btn-clock-toggle").classList.add("running");
  $("clock-display").classList.add("running");
  _clockInterval = setInterval(() => {
    S.clock.elapsed++;
    renderClock();
  }, 1000);
}

function stopClock() {
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
  S.clock.running = false;
  $("btn-clock-toggle").textContent = "▶ Start";
  $("btn-clock-toggle").classList.remove("running");
  $("clock-display").classList.remove("running");
}

function toggleClock() {
  if (S.phase !== "playing" && S.phase !== "penalties") return;
  if (S.clock.running) stopClock(); else startClock();
}

function resetClock() {
  stopClock();
  S.clock.elapsed = 0;
  renderClock();
}

function adjustClock(sec) {
  S.clock.elapsed = Math.max(0, S.clock.elapsed + sec);
  renderClock();
}

function renderClock() {
  const m = Math.floor(S.clock.elapsed / 60);
  const s = S.clock.elapsed % 60;
  $("clock-display").textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

  // Wizualne ostrzeżenie gdy zegar przekroczy czas połowy (tylko tryb regular)
  const clockEl = $("clock-display");
  if (clockEl && S.periodMode === "regular" && S.settings.halfDuration > 0) {
    clockEl.classList.toggle("clock--overtime", m >= S.settings.halfDuration);
  } else if (clockEl) {
    clockEl.classList.remove("clock--overtime");
  }
}

function openClockModal() {
  const m = Math.floor(S.clock.elapsed / 60);
  const s = S.clock.elapsed % 60;
  $("clock-manual-min").value = m;
  $("clock-manual-sec").value = s;
  $("clock-modal-backdrop").classList.remove("hidden");
}
function closeClockModal() { $("clock-modal-backdrop").classList.add("hidden"); }
function confirmClockModal() {
  const m = Math.max(0, Math.min(999, Number($("clock-manual-min").value) || 0));
  const s = Math.max(0, Math.min(59,  Number($("clock-manual-sec").value) || 0));
  S.clock.elapsed = m * 60 + s;
  renderClock();
  closeClockModal();
}

/* ════════════════════════════════════════════════════════════════════
   GOALS & CARDS
════════════════════════════════════════════════════════════════════ */
function addGoal(side, playerId) {
  if (S.phase !== "playing" && S.phase !== "penalties") return;
  const player = S[side].squadPlayers.find(p => p.id === playerId);
  if (!player) return;
  const pName = `${player.last_name} ${player.first_name}`;
  takeSnap(`Gol: ${pName}`);

  S[side].score++;
  S[side].playerStats[playerId].goals++;
  S.periodScores[S.periodScores.length - 1][side === "t1" ? "t1" : "t2"]++;

  const clockMin = Math.floor(S.clock.elapsed / 60);
  logAction("goal", `⚽ Gol! ${pName} (${S[side].name}) — ${clockMin}'  Wynik: ${S.t1.score}:${S.t2.score}`);
  toast(`⚽ Gol! ${pName} (${S[side].name})`);
  renderAll();
  renderPeriodTable();
}

function addYellowCard(side, playerId) {
  if (S.phase !== "playing") return;
  const player = S[side].squadPlayers.find(p => p.id === playerId);
  if (!player) return;
  const ps    = S[side].playerStats[playerId];
  const pName = `${player.last_name} ${player.first_name}`;
  if (ps.disqualified) { toast(`${pName} już zdyskwalifikowany`, true); return; }
  if (ps.yellow >= 2)  { toast(`${pName} — już 2 żółte kartki`, true); return; }

  takeSnap(`Żółta kartka: ${pName}`);
  ps.yellow++;
  const clockMin = Math.floor(S.clock.elapsed / 60);

  if (ps.yellow >= 2) {
    // Dwie żółte = czerwona
    ps.red = true;
    ps.disqualified = true;
    logAction("red", `🟨🟥 ${pName} (${S[side].name}) — 2 żółte = czerwona! DYSKWALIFIKACJA — ${clockMin}'`);
    toast(`${pName} — dwie żółte = CZERWONA!`);
  } else {
    logAction("card", `🟨 Żółta kartka: ${pName} (${S[side].name}) — ${clockMin}'`);
    toast(`🟨 Żółta kartka: ${pName}`);
  }
  renderAll();
}

function addRedCard(side, playerId) {
  if (S.phase !== "playing") return;
  const player = S[side].squadPlayers.find(p => p.id === playerId);
  if (!player) return;
  const ps    = S[side].playerStats[playerId];
  const pName = `${player.last_name} ${player.first_name}`;
  if (ps.disqualified) { toast(`${pName} już zdyskwalifikowany`, true); return; }

  takeSnap(`Czerwona kartka: ${pName}`);
  ps.red = true;
  ps.disqualified = true;
  const clockMin = Math.floor(S.clock.elapsed / 60);
  logAction("red", `🟥 Czerwona kartka: ${pName} (${S[side].name}) — DYSKWALIFIKACJA — ${clockMin}'`);
  toast(`🟥 Czerwona kartka! ${pName} zdyskwalifikowany`);
  renderAll();
}

function addSubstitution(side) {
  if (S.phase !== "playing") return;
  const lim    = S.settings.subsLimit;
  const perMode = S.settings.subsPer;

  // Wybierz licznik: per-połowa lub globalny
  const used = perMode === "połowa" ? (S[side].subsPeriod || 0) : S[side].subs;
  const limitLabel = perMode === "połowa" ? `${lim}/połowę` : `${lim}/mecz`;

  if (perMode !== "brak" && lim > 0 && used >= lim) {
    toast(`Limit zmian wyczerpany (${limitLabel})`, true); return;
  }
  takeSnap(`Zmiana ${S[side].name}`);
  S[side].subs++;
  S[side].subsPeriod = (S[side].subsPeriod || 0) + 1;
  // Track substitution in current period
  const curPeriod = S.periodScores[S.periodScores.length - 1];
  if (side === "t1") curPeriod.subs_t1 = (curPeriod.subs_t1 || 0) + 1;
  else               curPeriod.subs_t2 = (curPeriod.subs_t2 || 0) + 1;
  logAction("sub", `🔄 Zmiana: ${S[side].name} (${S[side].subs}/${lim > 0 ? limitLabel : "∞"})`);
  renderAll();
}

/* ════════════════════════════════════════════════════════════════════
   PERIODS
════════════════════════════════════════════════════════════════════ */
function periodName(n, mode) {
  if (mode === "penalties") return "Rzuty karne";
  if (mode === "extra") return n <= 2 ? `Dogrywka ${n === 1 ? "I" : "II"}` : "Dogrywka";
  const romans = ["I","II","III","IV","V","VI"];
  return `${romans[n - 1] ?? n}. połowa`;
}

function promptNextPeriod() {
  const label = periodName(S.currentPeriod, S.periodMode);
  $("period-modal-title").textContent = `Zakończyć ${label}?`;
  $("period-modal-body").innerHTML    = `Wynik: <strong>${S.t1.name} ${S.t1.score} : ${S.t2.score} ${S.t2.name}</strong>`;

  const isLastRegular  = S.periodMode === "regular"  && S.currentPeriod >= S.settings.halfCount;
  const isLastExtra    = S.periodMode === "extra"    && S.currentPeriod >= 2;

  const nextLabel = isLastRegular  ? "Koniec regulaminowego czasu gry" :
                    isLastExtra    ? "Koniec dogrywki" : `→ Następna połowa`;
  $("period-confirm").textContent = nextLabel;
  $("period-confirm").onclick = () => {
    $("period-backdrop").classList.add("hidden");
    confirmNextPeriod();
  };
  $("period-cancel").onclick = () => $("period-backdrop").classList.add("hidden");
  $("period-backdrop").classList.remove("hidden");
}

function confirmNextPeriod() {
  const label = periodName(S.currentPeriod, S.periodMode);
  takeSnap(`Koniec: ${label}`);
  stopClock();
  logAction("period", `✓ ${label} zakończona: ${S.t1.score}:${S.t2.score}`);

  // Reset per-period substitution counters if needed
  if (S.settings.subsPer === "połowa") {
    S.t1.subsPeriod = 0;
    S.t2.subsPeriod = 0;
  }

  // Push new period
  S.currentPeriod++;
  S.periodScores.push({ t1: 0, t2: 0, subs_t1: 0, subs_t2: 0 });
  S.clock.elapsed = 0;

  logAction("period", `→ ${periodName(S.currentPeriod, S.periodMode)} rozpoczęta`);
  renderAll();
  renderPeriodTable();
  toast(`${label} zakończona`);
}

function activateExtraTime() {
  if (S.phase !== "playing") return;
  takeSnap("Dogrywka");
  stopClock();
  S.periodMode     = "extra";
  S.currentPeriod  = 1;
  S.periodScores.push({ t1: 0, t2: 0, subs_t1: 0, subs_t2: 0 });
  S.clock.elapsed  = 0;
  logAction("period", `⏱ Dogrywka rozpoczęta (${S.settings.extraDuration} min)`);
  renderAll();
  renderPeriodTable();
  toast("Dogrywka!");
}

function activatePenalties() {
  if (S.phase !== "playing") return;
  if (!S.settings.penaltyShootout) {
    toast("Rzuty karne są wyłączone w ustawieniach zasad", true);
    return;
  }
  takeSnap("Rzuty karne — setup");
  stopClock();
  S.phase      = "pk-setup";
  S.periodMode = "penalties";
  S.clock.elapsed = 0;
  logAction("period", "⚽ Konkurs rzutów karnych — konfiguracja");

  // Init penalty state
  S.penalties.shootersPerTeam = S.settings.pkShooters || 5;
  S.penalties.winsNeeded      = S.settings.pkWins     || 5;  // ile trafień do wygrania serii
  S.penalties.startSide = "t1";
  S.penalties.t1 = { gk: null, shooters: [] };
  S.penalties.t2 = { gk: null, shooters: [] };
  S.penalties.kicks = [];
  S.penalties.currentKickIdx = 0;
  S.penalties.finished = false;
  S.penalties.winner = null;

  renderAll();
  renderPeriodTable();
  renderPkSetup();

  $("pk-setup").classList.remove("hidden");
  $("pk-active").classList.add("hidden");
  toast("Skonfiguruj rzuty karne");
}

/* ════════════════════════════════════════════════════════════════════
   PENALTY SHOOTOUT — SETUP
════════════════════════════════════════════════════════════════════ */

function renderPkSetup() {
  const pk = S.penalties;
  const lim = pk.shootersPerTeam;

  $("pk-setup-sub").textContent = `Wybierz ${lim} strzelców, bramkarza i kolejność`;
  $("pk-setup-t1-name").textContent = S.t1.name;
  $("pk-setup-t2-name").textContent = S.t2.name;
  $("pk-start-t1").textContent = S.t1.name;
  $("pk-start-t2").textContent = S.t2.name;

  // Highlight start side
  $("pk-start-t1").classList.toggle("active", pk.startSide === "t1");
  $("pk-start-t2").classList.toggle("active", pk.startSide === "t2");

  renderPkSetupTeam("t1");
  renderPkSetupTeam("t2");
  validatePkSetup();
}

function renderPkSetupTeam(side) {
  const pk    = S.penalties;
  const lim   = pk.shootersPerTeam;
  const data  = pk[side];
  const squad = S[side].squadPlayers;

  const shooterIds = new Set(data.shooters.map(s => s.playerId));
  const gkId       = data.gk?.playerId;

  // Shooter count badge
  $(`pk-t${side === "t1" ? 1 : 2}-shooter-count`).textContent = `${data.shooters.length}/${lim}`;
  $(`pk-setup-t${side === "t1" ? 1 : 2}-count`).textContent   = `Strzelców: ${data.shooters.length}/${lim}`;

  // GK slot
  const gkSlot = $(`pk-setup-${side}-gk`);
  if (data.gk) {
    gkSlot.innerHTML = `
      <div class="pk-gk-pill">
        <span class="pk-gk-pill-name">🥅 ${data.gk.name}</span>
        <button class="pk-gk-remove" data-side="${side}">✕</button>
      </div>`;
    gkSlot.querySelector(".pk-gk-remove").addEventListener("click", () => {
      S.penalties[side].gk = null;
      renderPkSetupTeam(side);
      renderPkSetupPool(side);
      validatePkSetup();
    });
  } else {
    gkSlot.innerHTML = `<div class="pk-setup-gk-empty">Wybierz bramkarza z listy poniżej</div>`;
  }

  // Shooter list (ordered)
  const shooterList = $(`pk-setup-${side}-shooters`);
  shooterList.innerHTML = "";
  data.shooters.forEach((sh, i) => {
    const row = mk("div", "pk-setup-shooter-row");
    row.innerHTML = `
      <span class="pk-shooter-order">${i+1}</span>
      <span class="pk-shooter-row-name">${sh.name}</span>
      <button class="pk-shooter-up"   data-side="${side}" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="pk-shooter-down" data-side="${side}" data-idx="${i}" ${i === data.shooters.length-1 ? "disabled" : ""}>↓</button>
      <button class="pk-shooter-remove" data-side="${side}" data-idx="${i}">✕</button>`;
    shooterList.appendChild(row);
  });

  shooterList.querySelectorAll(".pk-shooter-up").forEach(btn =>
    btn.addEventListener("click", () => movePkShooter(btn.dataset.side, Number(btn.dataset.idx), -1))
  );
  shooterList.querySelectorAll(".pk-shooter-down").forEach(btn =>
    btn.addEventListener("click", () => movePkShooter(btn.dataset.side, Number(btn.dataset.idx), 1))
  );
  shooterList.querySelectorAll(".pk-shooter-remove").forEach(btn =>
    btn.addEventListener("click", () => removePkShooter(btn.dataset.side, Number(btn.dataset.idx)))
  );

  renderPkSetupPool(side);
}

function renderPkSetupPool(side) {
  const pk      = S.penalties;
  const lim     = pk.shootersPerTeam;
  const data    = pk[side];
  const squad   = S[side].squadPlayers;
  const shooterIds = new Set(data.shooters.map(s => s.playerId));
  const gkId    = data.gk?.playerId;
  const pool    = $(`pk-setup-${side}-players`);
  pool.innerHTML = "";

  squad.forEach(p => {
    const ps      = S[side].playerStats[p.id] || {};
    const isGk    = p.id === gkId;
    const isShooter = shooterIds.has(p.id);
    const isDisq  = ps.disqualified;
    const name    = `${p.last_name} ${p.first_name}${p.is_captain ? " ⭐" : ""}`;

    const row = mk("div", `pk-pool-player${isGk ? " is-gk" : isShooter ? " is-shooter" : isDisq ? " disqualified" : ""}`);

    let badge = "";
    if (isGk)      badge = `<span class="pk-pool-role-badge pk-pool-role-badge--gk">🥅 BRK</span>`;
    else if (isShooter) badge = `<span class="pk-pool-role-badge pk-pool-role-badge--shooter">⚽ #${data.shooters.findIndex(s=>s.playerId===p.id)+1}</span>`;

    let btns = "";
    if (!isDisq) {
      if (!isGk && !isShooter) {
        btns = `<div class="pk-pool-add-as">
          <button class="pk-pool-btn pk-pool-btn--gk" data-side="${side}" data-pid="${p.id}" data-name="${name}">🥅 BRK</button>
          ${data.shooters.length < lim ? `<button class="pk-pool-btn pk-pool-btn--shooter" data-side="${side}" data-pid="${p.id}" data-name="${name}">⚽ Str.</button>` : ""}
        </div>`;
      }
    }

    row.innerHTML = `${badge}<span style="flex:1;font-size:.82rem;font-weight:${isGk||isShooter?700:500}">${name}</span>${btns}`;
    pool.appendChild(row);
  });

  pool.querySelectorAll(".pk-pool-btn--gk").forEach(btn =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setPkGoalkeeper(btn.dataset.side, Number(btn.dataset.pid), btn.dataset.name);
    })
  );
  pool.querySelectorAll(".pk-pool-btn--shooter").forEach(btn =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addPkShooter(btn.dataset.side, Number(btn.dataset.pid), btn.dataset.name);
    })
  );
}

function setPkGoalkeeper(side, playerId, name) {
  // Remove from shooters if was there
  S.penalties[side].shooters = S.penalties[side].shooters.filter(s => s.playerId !== playerId);
  S.penalties[side].gk = { playerId, name };
  renderPkSetupTeam(side);
  validatePkSetup();
}

function addPkShooter(side, playerId, name) {
  const data = S.penalties[side];
  if (data.shooters.length >= S.penalties.shootersPerTeam) { toast("Limit strzelców osiągnięty", true); return; }
  if (data.shooters.find(s => s.playerId === playerId)) return;
  // Remove from GK if was there
  if (data.gk?.playerId === playerId) data.gk = null;
  data.shooters.push({ playerId, name });
  renderPkSetupTeam(side);
  validatePkSetup();
}

function movePkShooter(side, idx, dir) {
  const arr = S.penalties[side].shooters;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderPkSetupTeam(side);
}

function removePkShooter(side, idx) {
  S.penalties[side].shooters.splice(idx, 1);
  renderPkSetupTeam(side);
  validatePkSetup();
}

function validatePkSetup() {
  const pk  = S.penalties;
  const lim = pk.shootersPerTeam;
  const ok  =
    pk.t1.gk && pk.t1.shooters.length === lim &&
    pk.t2.gk && pk.t2.shooters.length === lim;

  const msgs = [];
  if (!pk.t1.gk) msgs.push(`Brak bramkarza ${S.t1.name}`);
  if (!pk.t2.gk) msgs.push(`Brak bramkarza ${S.t2.name}`);
  if (pk.t1.shooters.length < lim) msgs.push(`${S.t1.name}: ${pk.t1.shooters.length}/${lim} strzelców`);
  if (pk.t2.shooters.length < lim) msgs.push(`${S.t2.name}: ${pk.t2.shooters.length}/${lim} strzelców`);

  $("pk-setup-validation").textContent = msgs.join(" · ");
  $("pk-setup-go").disabled = !ok;
}

function startPenaltyShootout() {
  S.phase = "penalties";
  S.penalties.kicks = [];
  S.penalties.currentKickIdx = 0;
  S.penalties.finished = false;
  S.penalties.winner = null;

  logAction("period", `⚽ Rzuty karne: ${S.t1.name} vs ${S.t2.name} — zaczyna ${S.penalties.startSide === "t1" ? S.t1.name : S.t2.name}`);

  $("pk-setup").classList.add("hidden");
  $("pk-active").classList.remove("hidden");
  renderPkActive();
}

/* ════════════════════════════════════════════════════════════════════
   PENALTY SHOOTOUT — ACTIVE
════════════════════════════════════════════════════════════════════ */

/** Build the kick sequence array up to current index + a few ahead.
 *  Alternating: start[0], opp[0], start[1], opp[1], ...
 *  After round 5 (0-indexed rounds 0-4): sudden death
 */
function pkKickInfo(kickIdx) {
  const pk    = S.penalties;
  const lim   = pk.shootersPerTeam;
  const start = pk.startSide;
  const opp   = start === "t1" ? "t2" : "t1";

  // kickIdx 0 = start team's 1st kick, 1 = opp's 1st kick, 2 = start's 2nd, etc.
  const sideOrder = kickIdx % 2 === 0 ? start : opp;
  const roundInSeries = Math.floor(kickIdx / 2);  // 0-indexed
  const isSuddenDeath = roundInSeries >= lim;

  // In sudden death we cycle shooters
  const shooterIdx = isSuddenDeath
    ? (roundInSeries - lim) % S.penalties[sideOrder].shooters.length
    : roundInSeries;

  const shooter = S.penalties[sideOrder].shooters[shooterIdx];
  const gkSide  = sideOrder === "t1" ? "t2" : "t1";
  const gk      = S.penalties[gkSide].gk;

  return { sideOrder, roundInSeries, isSuddenDeath, shooter, gk, gkSide };
}

function pkScore() {
  const kicks = S.penalties.kicks;
  const t1 = kicks.filter(k => k.side === "t1" && k.result === "hit").length;
  const t2 = kicks.filter(k => k.side === "t2" && k.result === "hit").length;
  return { t1, t2 };
}

function pkRoundsCompleted() {
  // A "round" = both teams have kicked once (or start team when it's the last round)
  return Math.floor(S.penalties.kicks.length / 2);
}

function checkPkWinner() {
  const pk    = S.penalties;
  const shots = pk.shootersPerTeam;   // ile strzelców bierze udział
  const wins  = pk.winsNeeded;        // ile trafień potrzeba do wygrania
  const kicks = pk.kicks;
  const score = pkScore();

  const start = pk.startSide;
  const opp   = start === "t1" ? "t2" : "t1";

  const startKicks = kicks.filter(k => k.side === start).length;
  const oppKicks   = kicks.filter(k => k.side === opp).length;

  const startScore = score[start];
  const oppScore   = score[opp];

  // Early win: team already reached winsNeeded
  if (startScore >= wins) return start;
  if (oppScore   >= wins) return opp;

  // Remaining kicks for each team in the first `shots` rounds
  const startRemain = Math.max(0, shots - startKicks);
  const oppRemain   = Math.max(0, shots - oppKicks);

  // Can the trailing team still reach winsNeeded?
  if (startKicks <= shots && oppKicks <= shots) {
    // Opponent cannot possibly reach winsNeeded
    if (oppScore + oppRemain < wins && startScore + startRemain >= wins - (startScore >= wins ? 0 : 0)) {
      // Check if start has already reached wins
      if (startScore >= wins) return start;
    }
    // Mathematical elimination: opp can't catch up even with all remaining hits
    if (startKicks === shots && oppKicks === shots) {
      // Both done first round
      if (startScore > oppScore) return start;
      if (oppScore > startScore) return opp;
      // Tie after first round — go to sudden death (return null to continue)
      // Sudden death: check after each kick pair
      const sdStartKicks = kicks.filter(k => k.side === start && k.roundInSeries >= shots);
      const sdOppKicks   = kicks.filter(k => k.side === opp   && k.roundInSeries >= shots);
      if (sdStartKicks.length > 0 && sdStartKicks.length === sdOppKicks.length) {
        const sdRound   = sdStartKicks.length - 1;
        const lastStart = sdStartKicks[sdRound];
        const lastOpp   = sdOppKicks[sdRound];
        if (lastStart && lastOpp) {
          if (lastStart.result === "hit" && lastOpp.result !== "hit") return start;
          if (lastOpp.result === "hit" && lastStart.result !== "hit") return opp;
        }
      }
      return null;
    }
    // Early mathematical elimination during first round
    if (startScore > oppScore + oppRemain) return start;
    if (oppScore > startScore + startRemain) return opp;
  }

  return null;
}

function recordPkKick(result) {
  const pk = S.penalties;
  const info = pkKickInfo(pk.currentKickIdx);
  if (!info.shooter) return;

  takeSnap(`Rzut karny #${pk.currentKickIdx+1} — ${result}`);

  const kick = {
    kickIdx:       pk.currentKickIdx,
    side:          info.sideOrder,
    shooterName:   info.shooter.name,
    gkName:        info.gk?.name || "—",
    result,
    roundInSeries: info.roundInSeries,
    isSuddenDeath: info.isSuddenDeath,
  };
  pk.kicks.push(kick);
  pk.currentKickIdx++;

  const sd   = info.isSuddenDeath ? " (nagła śmierć)" : "";
  const icon = result === "hit" ? "⚽ TRAFIONY" : "✗ NIECELNY";
  logAction("goal", `${icon}${sd}: ${info.shooter.name} (${S[info.sideOrder].name}) ← broni ${info.gk?.name || "—"}`);

  // Check winner
  const winner = checkPkWinner();
  if (winner) {
    pk.finished = true;
    pk.winner   = winner;
    const sc    = pkScore();
    logAction("system", `🏆 Rzuty karne: wygrywa ${S[winner].name}! ${sc.t1}:${sc.t2}`);
  }

  renderPkActive();
}

function renderPkActive() {
  const pk    = S.penalties;
  const score = pkScore();
  const lim   = pk.shootersPerTeam;
  const start = pk.startSide;
  const opp   = start === "t1" ? "t2" : "t1";

  $("pk-active-t1-name").textContent    = S.t1.name;
  $("pk-active-t2-name").textContent    = S.t2.name;
  $("pk-active-score-t1").textContent   = score.t1;
  $("pk-active-score-t2").textContent   = score.t2;

  // Round label
  const info = pkKickInfo(pk.currentKickIdx);
  if (pk.finished) {
    $("pk-active-round-label").textContent = "Zakończono";
  } else if (info.isSuddenDeath) {
    $("pk-active-round-label").textContent = `Nagła śmierć — seria ${info.roundInSeries - lim + 1}`;
  } else {
    $("pk-active-round-label").textContent = `Seria ${info.roundInSeries + 1} z ${lim}`;
  }

  // Dots for T1 and T2 (in their kick order)
  renderPkDots("t1", start, lim);
  renderPkDots("t2", start, lim);

  // Current kick card or finished card
  if (pk.finished) {
    $("pk-kick-card").classList.add("hidden");
    const fc = $("pk-finished-card");
    fc.classList.remove("hidden");
    const sc = pkScore();
    $("pk-finished-text").textContent  = `🏆 Wygrywa: ${S[pk.winner].name}`;
    $("pk-finished-score").textContent = `${S.t1.name} ${sc.t1} : ${sc.t2} ${S.t2.name}`;
  } else {
    $("pk-kick-card").classList.remove("hidden");
    $("pk-finished-card").classList.add("hidden");

    const sd = info.isSuddenDeath;
    $("pk-kick-phase").textContent = sd ? "⚡ NAGŁA ŚMIERĆ" : `Rzut ${info.roundInSeries + 1}`;
    $("pk-kick-phase").classList.toggle("sudden-death", sd);

    $("pk-kick-shooter-name").textContent = info.shooter?.name || "—";
    $("pk-kick-shooter-team").textContent = S[info.sideOrder]?.name || "—";
    $("pk-kick-gk-name").textContent      = info.gk?.name || "—";
    $("pk-kick-gk-team").textContent      = S[info.gkSide]?.name || "—";
  }

  // History
  renderPkHistory();
}

function renderPkDots(side, startSide, lim) {
  const pk = S.penalties;
  const dotsEl = $(`pk-dots-${side}`);
  const labelEl = $(`pk-series-${side}-lbl`);
  labelEl.textContent = S[side].name;
  dotsEl.innerHTML = "";

  // Get all kicks for this side
  const sideKicks = pk.kicks.filter(k => k.side === side);

  // Determine current kick index for this side
  const nextKickInfo = pkKickInfo(pk.currentKickIdx);
  const isCurrent = !pk.finished && nextKickInfo.sideOrder === side;
  const currentSideIdx = sideKicks.length; // next kick for this side

  // Show lim dots (or more in SD)
  const sdKicks   = sideKicks.filter(k => k.isSuddenDeath);
  const totalDots = lim + sdKicks.length + (isCurrent && nextKickInfo.isSuddenDeath ? 1 : 0);
  const showDots  = Math.max(lim, totalDots);

  for (let i = 0; i < showDots; i++) {
    const kick = sideKicks[i];
    const isCur = isCurrent && i === currentSideIdx;
    const isSd  = i >= lim;
    let cls = "pk-dot";
    if (kick?.result === "hit")  cls += " hit";
    else if (kick?.result === "miss") cls += " miss";
    else if (isCur) cls += " current";
    if (isSd) cls += " sudden-death";

    const dot = mk("div", cls);
    dot.textContent = kick?.result === "hit" ? "✓" : kick?.result === "miss" ? "✗" : (isCur ? "●" : "");
    dotsEl.appendChild(dot);
  }
}

function renderPkHistory() {
  const list = $("pk-history-list");
  list.innerHTML = "";
  const kicks = S.penalties.kicks;
  if (!kicks.length) { list.innerHTML = `<div style="padding:6px;color:var(--muted);font-size:.8rem">Brak rzutów</div>`; return; }
  [...kicks].reverse().forEach((k, i) => {
    const num  = kicks.length - i;
    const item = mk("div", `pk-history-item ${k.result}`);
    const sd   = k.isSuddenDeath ? " ⚡" : "";
    item.innerHTML = `
      <span class="pk-hist-num">#${num}${sd}</span>
      <span class="pk-hist-icon">${k.result === "hit" ? "⚽" : "🛡️"}</span>
      <span class="pk-hist-name">${k.shooterName}</span>
      <span class="pk-hist-team">${S[k.side].name}</span>
      <span class="pk-hist-result ${k.result}">${k.result === "hit" ? "TRAFIONY" : "NIECELNY"}</span>`;
    list.appendChild(item);
  });
}

function undoPkKick() {
  const pk = S.penalties;
  if (!pk.kicks.length) { toast("Brak rzutów do cofnięcia", true); return; }
  pk.kicks.pop();
  pk.currentKickIdx = Math.max(0, pk.currentKickIdx - 1);
  pk.finished = false;
  pk.winner   = null;
  logAction("undo", "↩ Cofnięto ostatni rzut karny");
  renderPkActive();
  toast("Cofnięto rzut karny");
}

function finishPenaltiesEarly() {
  const score = pkScore();
  const winner = score.t1 > score.t2 ? "t1" : score.t2 > score.t1 ? "t2" : null;
  S.penalties.finished = true;
  S.penalties.winner   = winner;
  if (winner) logAction("system", `🏁 Rzuty karne zakończone: wygrywa ${S[winner].name} ${score.t1}:${score.t2}`);
  else        logAction("system", `🏁 Rzuty karne zakończone: remis ${score.t1}:${score.t2}`);
  renderPkActive();
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
  // Zachowaj __fb ext — doczytaj bieżący JSON i podmień tylko notes_text
  const cur = await apiFetch(`/matches/${S.matchId}`);
  const raw = cur?.match?.referee_notes || cur?.match?.referee_note || "";
  let ext = {};
  try { ext = JSON.parse(raw).__fb || {}; } catch {}
  const serialized = JSON.stringify({ notes_text: $("referee-note").value, __fb: ext });
  const r = await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referee_notes: serialized }),
  });
  if (r) toast("Notatka zapisana ✓"); else toast("Błąd zapisu", true);
}

async function saveProtocol(finish = false) {
  if (!S.matchId) return;

  const pkScore = S.penalties.kicks.length > 0 ? (() => {
    const t1 = S.penalties.kicks.filter(k => k.side === "t1" && k.result === "hit").length;
    const t2 = S.penalties.kicks.filter(k => k.side === "t2" && k.result === "hit").length;
    return { t1, t2 };
  })() : null;

  const patch = {
    score_t1: S.t1.score,
    score_t2: S.t2.score,
  };
  if (pkScore) {
    patch.shootout_t1 = pkScore.t1;
    patch.shootout_t2 = pkScore.t2;
  }
  if (finish) patch.status = "Rozegrany";

  await apiFetch(`/matches/${S.matchId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  // Team stats
  for (const side of ["t1","t2"]) {
    const t = S[side];
    await apiFetch("/match-team-stats", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: S.matchId, team_id: t.id,
        timeouts_taken: 0,
        substitutions_used: t.subs,
        team_fouls_count: 0,
      }),
    });
  }

  // Player stats
  for (const side of ["t1","t2"]) {
    for (const p of S[side].squadPlayers) {
      const ps = S[side].playerStats[p.id];
      if (!ps) continue;
      await apiFetch("/match-player-stats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: S.matchId, player_id: p.id,
          yellow_cards: ps.yellow,
          red_card: ps.red ? 1 : 0,
          personal_fouls: 0,
          technical_fouls: 0,
        }),
      });
    }
  }

  // ── Save half/period scores to Volleyball_Sets (reused for football) ───────
  // S.periodScores = [{t1, t2}, ...] — one entry per period/half played
  if (S.periodScores && S.periodScores.length) {
    // Build cumulative per-period scores from periodScores (each entry = goals IN that period)
    const sets = S.periodScores.map((ps, i) => ({
      set_number: i + 1,
      points_t1:  ps.t1,
      points_t2:  ps.t2,
      subs_t1:    ps.subs_t1 || 0,
      subs_t2:    ps.subs_t2 || 0,
      to_t1: 0,
      to_t2: 0,
    }));
    await apiFetch(`/matches/${S.matchId}/sets`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sets }),
    });
  }

  // ── Save penalty shootout kicks to referee_notes JSON (__fb ext) ─────────
  if (S.penalties.kicks.length > 0) {
    // Build per-team kicks arrays
    const pk_t1 = S.penalties.kicks
      .filter(k => k.side === "t1")
      .map(k => ({
        playerId:    S.penalties.t1.shooters.find(s => s.name === k.shooterName)?.playerId ?? null,
        shooterName: k.shooterName,
        result:      k.result,
        kickIdx:     k.kickIdx,
      }));
    const pk_t2 = S.penalties.kicks
      .filter(k => k.side === "t2")
      .map(k => ({
        playerId:    S.penalties.t2.shooters.find(s => s.name === k.shooterName)?.playerId ?? null,
        shooterName: k.shooterName,
        result:      k.result,
        kickIdx:     k.kickIdx,
      }));

    // Merge into referee_notes JSON (__fb extension)
    const matchData2 = await apiFetch(`/matches/${S.matchId}`);
    const rawNote = matchData2?.match?.referee_notes || matchData2?.match?.referee_note || "";
    let existingExt = {};
    try { existingExt = JSON.parse(rawNote).__fb || {}; } catch {}
    const notesText = (() => { try { return JSON.parse(rawNote).notes_text || ""; } catch { return rawNote; } })();
    existingExt.pk_t1  = pk_t1;
    existingExt.pk_t2  = pk_t2;
    existingExt.has_pk = true;
    existingExt.gk_t1  = S.penalties.t1.gk?.name || null;
    existingExt.gk_t2  = S.penalties.t2.gk?.name || null;
    const serialized = JSON.stringify({ notes_text: notesText, __fb: existingExt });
    await apiFetch(`/matches/${S.matchId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referee_notes: serialized }),
    });
  }

  // ── Save action log to Match_Logs ─────────────────────────────────────────
  if (S.actionLog && S.actionLog.length) {
    const logs = S.actionLog.map(a => ({
      type:        a.type  || "info",
      description: a.text  || "",
      time:        a.min != null ? String(a.min) : (a.time || null),
    }));
    await apiFetch(`/matches/${S.matchId}/logs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
  }

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
  if (S.phase === "penalties") renderPenaltySection();
  toast("Cofnięto akcję");
}

/* ════════════════════════════════════════════════════════════════════
   RENDER
════════════════════════════════════════════════════════════════════ */
function logAction(type, text) {
  const matchMin = S.clock && S.clock.elapsed != null
    ? Math.floor(S.clock.elapsed / 60)
    : null;
  S.actionLog.unshift({ type, text, time: nowHHMM(), min: matchMin });
  renderLog();
}

function renderAll() {
  // Scoreboard
  $("sb-t1-name").textContent = S.t1.name; $("sb-t1-cls").textContent = S.t1.cls;
  $("sb-t2-name").textContent = S.t2.name; $("sb-t2-cls").textContent = S.t2.cls;
  $("sb-score-t1").textContent = S.t1.score;
  $("sb-score-t2").textContent = S.t2.score;
  $("sb-period-label").textContent = periodName(S.currentPeriod, S.periodMode);
  $("topbar-match-label").textContent = `⚽ ${S.t1.name} vs ${S.t2.name}`;

  const modeBadge = $("sb-mode-badge");
  if (S.periodMode === "extra")     modeBadge.textContent = "⏱ Dogrywka";
  else if (S.periodMode === "penalties") modeBadge.textContent = "⚽ Rzuty karne";
  else modeBadge.textContent = "";

  // Clock
  renderClock();

  // Periods
  renderPeriodPills();

  // Team panels
  for (const side of ["t1","t2"]) {
    const t = S[side];
    $(`tcp-${side}-name`).textContent = t.name;

    const yellowCount = t.squadPlayers.reduce((acc, p) => acc + (t.playerStats[p.id]?.yellow || 0), 0);
    const redCount    = t.squadPlayers.reduce((acc, p) => acc + (t.playerStats[p.id]?.red ? 1 : 0), 0);

    $(`tc-${side}-goals`).textContent  = t.score;
    const _lim     = S.settings.subsLimit;
    const _perMode = S.settings.subsPer;
    const _used    = _perMode === "połowa" ? (t.subsPeriod || 0) : t.subs;
    const _suffix  = _perMode === "połowa" ? "/poł." : "/mecz";
    $(`tc-${side}-subs`).textContent = _lim > 0 ? `${_used}/${_lim}${_suffix}` : t.subs;
    $(`tc-${side}-yellow`).textContent = yellowCount;
    $(`tc-${side}-red`).textContent    = redCount;

    const subsEl = $(`tc-${side}-subs`);
    subsEl.classList.toggle("limit", _perMode !== "brak" && _lim > 0 && _used >= _lim);
    subsEl.classList.toggle("warn",  _perMode !== "brak" && _lim > 0 && _used === _lim - 1);
  }

  renderPlayers("t1");
  renderPlayers("t2");
  renderLog();
}

function renderPeriodPills() {
  const list = $("periods-list");
  list.innerHTML = "";
  const romans = ["I","II","III","IV","V","VI"];
  const hc = S.settings.halfCount || 2;

  for (let i = 1; i <= hc; i++) {
    const isDone   = S.periodMode !== "regular" || S.currentPeriod > i;
    const isActive = S.periodMode === "regular"  && S.currentPeriod === i;
    const pill = mk("div", "period-pill" + (isActive ? " active" : isDone ? " done" : ""));
    pill.textContent = `${romans[i-1] ?? i} poł.`;
    list.appendChild(pill);
  }

  if (S.periodMode === "extra") {
    for (let i = 1; i <= 2; i++) {
      const p = mk("div", "period-pill et" + (S.currentPeriod === i && S.periodMode === "extra" ? " active" : (S.currentPeriod > i ? " done" : "")));
      p.textContent = `DG ${i}`; list.appendChild(p);
    }
  }
  if (S.periodMode === "penalties") {
    const pk = mk("div", "period-pill pk active"); pk.textContent = "K"; list.appendChild(pk);
  }
}

function renderPeriodTable() {
  const wrap  = $("period-scores-table");
  const HALF_ROMANS = ["I","II","III","IV","V","VI"];
  const names = S.periodScores.map((_, i) => {
    if (S.periodMode === "extra"     && i >= S.settings.halfCount) return `DG${i - S.settings.halfCount + 1}`;
    if (S.periodMode === "penalties" && i === S.periodScores.length - 1) return "K";
    return HALF_ROMANS[i] ?? `P${i + 1}`;
  });
  const t1Rows = S.periodScores.map(s => s.t1);
  const t2Rows = S.periodScores.map(s => s.t2);
  const t1Tot  = t1Rows.reduce((a,b) => a+b, 0);
  const t2Tot  = t2Rows.reduce((a,b) => a+b, 0);
  const curIdx = S.currentPeriod - 1;
  const hdr    = names.map((n,i) => `<th class="${i===curIdx?"current":""}">${n}</th>`).join("") + `<th>Σ</th>`;
  const mkRow  = (name, vals, tot) =>
    `<tr><td class="team-name">${name}</td>${vals.map(v=>`<td>${v}</td>`).join("")}<td class="total">${tot}</td></tr>`;
  wrap.innerHTML = `<table class="pst-table"><thead><tr><th></th>${hdr}</tr></thead><tbody>${mkRow(S.t1.name,t1Rows,t1Tot)}${mkRow(S.t2.name,t2Rows,t2Tot)}</tbody></table>`;
}

function renderPlayers(side) {
  const hdr  = $(`players-${side}-hdr`);
  const body = $(`players-${side}-body`);
  if (hdr) hdr.textContent = S[side].name;
  if (!body) return;
  body.innerHTML = "";

  S[side].squadPlayers.forEach((p, i) => {
    const ps = S[side].playerStats[p.id] || { goals: 0, yellow: 0, red: false, disqualified: false };
    const row = mk("div", "player-row" + (ps.disqualified ? " disqualified" : ""));

    const yellowDots = [0,1].map(j =>
      `<div class="pr-yellow-dot${j < ps.yellow ? " active" : ""}"></div>`
    ).join("");

    const secondYellowClass = ps.yellow >= 1 ? " second" : "";
    const yellowBtnDisabled = ps.disqualified || ps.yellow >= 2 ? " disabled" : "";
    const redBtnDisabled    = ps.disqualified ? " disabled" : "";

    row.innerHTML = `
      <span class="pr-num">${i+1}</span>
      <span class="pr-name">${p.last_name} ${p.first_name}${p.is_captain ? " ⭐" : ""}</span>
      ${ps.disqualified
        ? `<span class="pr-disq-badge">🚫 DKWAL</span>`
        : `
          <span class="pr-goals">${ps.goals > 0 ? ps.goals : "—"}</span>
          <div class="pr-yellows">${yellowDots}</div>
          <button class="pr-goal-btn${yellowBtnDisabled}" data-side="${side}" data-pid="${p.id}">⚽ Gol</button>
          <button class="pr-yellow-btn${secondYellowClass}${yellowBtnDisabled}" data-side="${side}" data-pid="${p.id}">🟨</button>
          <button class="pr-red-btn${redBtnDisabled}" data-side="${side}" data-pid="${p.id}">🟥</button>
        `}`;
    body.appendChild(row);
  });

  body.querySelectorAll(".pr-goal-btn:not(.disabled)").forEach(btn =>
    btn.addEventListener("click", () => addGoal(btn.dataset.side, Number(btn.dataset.pid)))
  );
  body.querySelectorAll(".pr-yellow-btn:not(.disabled)").forEach(btn =>
    btn.addEventListener("click", () => addYellowCard(btn.dataset.side, Number(btn.dataset.pid)))
  );
  body.querySelectorAll(".pr-red-btn:not(.disabled)").forEach(btn =>
    btn.addEventListener("click", () => addRedCard(btn.dataset.side, Number(btn.dataset.pid)))
  );
}

function renderLog() {
  const log   = $("action-log");
  const count = S.actionLog.length;
  $("log-count").textContent = count;
  if (!count) { log.innerHTML = `<div class="log-empty">Brak akcji</div>`; return; }
  log.innerHTML = S.actionLog.slice(0, 150).map(a =>
    `<div class="log-item log-${a.type}">
      <span class="log-time">${a.time}</span>
      <span class="log-text">${a.text}</span>
    </div>`
  ).join("");
}

/* ════════════════════════════════════════════════════════════════════
   WIRE BUTTONS
════════════════════════════════════════════════════════════════════ */
function wireButtons() {
  $("pm-start-btn").addEventListener("click", startMatch);

  $("btn-clock-toggle").addEventListener("click",  toggleClock);
  $("btn-clock-reset").addEventListener("click",   () => { takeSnap("Reset zegara"); resetClock(); });
  $("btn-clock-manual").addEventListener("click",  openClockModal);

  document.querySelectorAll(".clock-adj-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      takeSnap(`Korekta zegara ${btn.dataset.sec}s`);
      adjustClock(Number(btn.dataset.sec));
    })
  );

  $("clock-modal-close").addEventListener("click",    closeClockModal);
  $("clock-modal-cancel").addEventListener("click",   closeClockModal);
  $("clock-modal-confirm").addEventListener("click",  confirmClockModal);
  $("clock-modal-backdrop").addEventListener("click", e => { if (e.target === $("clock-modal-backdrop")) closeClockModal(); });

  $("btn-next-period").addEventListener("click",  promptNextPeriod);
  $("btn-extra-time").addEventListener("click",   activateExtraTime);
  $("btn-penalties").addEventListener("click",    activatePenalties);

  $("btn-t1-sub").addEventListener("click", () => addSubstitution("t1"));
  $("btn-t2-sub").addEventListener("click", () => addSubstitution("t2"));

  // Penalty setup
  $("pk-start-t1").addEventListener("click", () => { S.penalties.startSide = "t1"; renderPkSetup(); });
  $("pk-start-t2").addEventListener("click", () => { S.penalties.startSide = "t2"; renderPkSetup(); });
  $("pk-setup-go").addEventListener("click",  startPenaltyShootout);

  // Penalty active
  $("btn-pk-hit").addEventListener("click",          () => recordPkKick("hit"));
  $("btn-pk-miss").addEventListener("click",         () => recordPkKick("miss"));
  $("btn-pk-undo").addEventListener("click",         undoPkKick);
  $("btn-pk-finish-early").addEventListener("click", finishPenaltiesEarly);

  $("btn-undo").addEventListener("click",     undoAction);
  $("btn-save").addEventListener("click",     () => saveProtocol(false));
  $("btn-save-note").addEventListener("click", saveNote);
  $("btn-finish").addEventListener("click",   promptFinish);

  $("period-cancel").addEventListener("click",  () => $("period-backdrop").classList.add("hidden"));
  $("finish-cancel").addEventListener("click",  () => $("finish-backdrop").classList.add("hidden"));
  $("finish-confirm").addEventListener("click", finishMatch);

  $("topbar-exit").addEventListener("click",  openExitConfirm);
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