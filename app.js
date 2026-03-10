/* ════════════════════════════════════════════════════════════════════════════
   THEME — jasny / ciemny motyw zapisywany w localStorage
════════════════════════════════════════════════════════════════════════════ */
(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") document.body.classList.add("theme-light");
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = saved === "light" ? "☀️" : "🌙";
    btn.title = saved === "light" ? "Przełącz na ciemny motyw" : "Przełącz na jasny motyw";
    btn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("theme-light");
      localStorage.setItem("theme", isLight ? "light" : "dark");
      btn.textContent = isLight ? "☀️" : "🌙";
      btn.title = isLight ? "Przełącz na ciemny motyw" : "Przełącz na jasny motyw";
    });
  }
})();

/* ── Config ─────────────────────────────────────────────────────────────── */
// Supabase client jest ładowany przez supabase-client.js jako moduł ES
// i eksportuje `supabase`. Ponieważ app.js ładowany jest jako zwykły <script>,
// pobieramy go z globalnego obiektu window (supabase-client.js ustawia window.supabase).
// Jeśli nie istnieje, tworzymy placeholder który wypisze błąd.
let _sb = null;
function getSB() {
  if (_sb) return _sb;
  // supabase-client.js eksportuje przez window gdy type=module
  if (window.__supabase) { _sb = window.__supabase; return _sb; }
  console.error("Supabase client not available");
  return null;
}

// ── Warstwa danych — wszystkie zapytania do Supabase ──────────────────────
const DB = {
  // MECZE
  async getMatches({ discipline, status, match_type } = {}) {
    let q = getSB()
      .from("matches")
      .select(`*, teams!matches_team1_id_fkey(team_name), team2:teams!matches_team2_id_fkey(team_name), referee:people!matches_referee_id_fkey(first_name,last_name), clerk:people!matches_clerk_id_fkey(first_name,last_name)`)
      .order("match_date", { ascending: true })
      .order("match_time", { ascending: true });
    if (discipline) q = q.eq("discipline", discipline);
    if (status)     q = q.eq("status", status);
    if (match_type) q = q.eq("match_type", match_type);
    const { data, error } = await q;
    if (error) { console.error("getMatches:", error); return null; }
    return data.map(m => DB._normalizeMatch(m));
  },

  async getMatch(id) {
    const { data: m, error } = await getSB()
      .from("matches")
      .select(`*, teams!matches_team1_id_fkey(team_name), team2:teams!matches_team2_id_fkey(team_name), referee:people!matches_referee_id_fkey(first_name,last_name), clerk:people!matches_clerk_id_fkey(first_name,last_name)`)
      .eq("id", id)
      .single();
    if (error) { console.error("getMatch:", error); return null; }

    const [{ data: playerStats }, { data: teamStats }, { data: sets }, { data: logs }] = await Promise.all([
      getSB().from("match_player_stats").select(`*, players!inner(is_captain, team_id, people!inner(first_name,last_name)), teams!match_player_stats_team_id_fkey(team_name)`).eq("match_id", id),
      getSB().from("match_team_stats").select(`*, teams(team_name)`).eq("match_id", id),
      getSB().from("match_periods").select("*").eq("match_id", id).order("set_number"),
      getSB().from("match_logs").select("*").eq("match_id", id).order("id"),
    ]);

    // Normalizuj playerStats — spłaszcz relacje
    const ps = (playerStats || []).map(s => ({
      ...s,
      first_name:  s.players?.people?.first_name,
      last_name:   s.players?.people?.last_name,
      is_captain:  s.players?.is_captain,
      team_name:   s.teams?.team_name,
      player_id:   s.player_id,
    }));

    const ts = (teamStats || []).map(s => ({ ...s, team_name: s.teams?.team_name }));

    const match = DB._normalizeMatch(m);

    // Kwartały koszykówki
    const quartersArray = (sets || [])
      .filter(s => s.set_number >= 1 && s.set_number <= 5)
      .map(s => ({ quarter: s.set_number, t1: s.points_t1 ?? null, t2: s.points_t2 ?? null, to1: s.to_t1 ?? null, to2: s.to_t2 ?? null, zm1: s.subs_t1 ?? null, zm2: s.subs_t2 ?? null }));
    const totalTimeoutsT1 = quartersArray.reduce((a, r) => a + (r.to1 || 0), 0);
    const totalTimeoutsT2 = quartersArray.reduce((a, r) => a + (r.to2 || 0), 0);
    const totalSubsT1 = quartersArray.reduce((a, r) => a + (r.zm1 || 0), 0);
    const totalSubsT2 = quartersArray.reduce((a, r) => a + (r.zm2 || 0), 0);

    // Połowy piłki nożnej
    const FOOT_PERIOD_LABELS = ["1. połowa", "2. połowa", "Dogrywka I", "Dogrywka II"];
    const footParts = (sets || [])
      .filter(s => s.set_number >= 1 && s.set_number <= 4)
      .map(s => ({ label: FOOT_PERIOD_LABELS[s.set_number - 1] || `Część ${s.set_number}`, t1: s.points_t1 ?? 0, t2: s.points_t2 ?? 0, zm1: s.subs_t1 ?? 0, zm2: s.subs_t2 ?? 0 }));

    const hasPenalty = match.shootout_t1 !== null && match.shootout_t2 !== null;
    const penaltyScore = hasPenalty ? { t1: Number(match.shootout_t1), t2: Number(match.shootout_t2) } : null;

    return {
      match,
      playerStats: ps,
      teamStats: ts,
      sets: sets || [],
      logs: logs || [],
      quarters: quartersArray,
      quarterTotals: { to1: totalTimeoutsT1, to2: totalTimeoutsT2, zm1: totalSubsT1, zm2: totalSubsT2 },
      footParts,
      penaltyScore,
    };
  },

  _normalizeMatch(m) {
    if (!m) return m;
    return {
      ...m,
      team1_name:   m.teams?.team_name   || m.team1_name,
      team2_name:   m.team2?.team_name   || m.team2_name,
      referee_name: m.referee ? `${m.referee.first_name} ${m.referee.last_name}` : null,
      clerk_name:   m.clerk   ? `${m.clerk.first_name} ${m.clerk.last_name}`     : null,
      match_date:   m.match_date ? String(m.match_date).slice(0, 10) : null,
    };
  },

  // DRUŻYNY
  async getTeams() {
    const { data, error } = await getSB()
      .from("teams")
      .select("*, players(id)")
      .order("team_name");
    if (error) { console.error("getTeams:", error); return null; }
    return data.map(t => ({ ...t, player_count: t.players?.length || 0 }));
  },

  async getTeamProfile(id) {
    const { data: team } = await getSB().from("teams").select("*").eq("id", id).single();
    if (!team) return null;

    const { data: players } = await getSB()
      .from("players")
      .select(`*, people(first_name,last_name,class_name)`)
      .eq("team_id", id)
      .order("is_captain", { ascending: false });

    const { data: matches } = await getSB()
      .from("matches")
      .select(`*, teams!matches_team1_id_fkey(team_name), team2:teams!matches_team2_id_fkey(team_name)`)
      .or(`team1_id.eq.${id},team2_id.eq.${id}`)
      .order("match_date", { ascending: true });

    // Statystyki W/D/L per dyscyplina — obliczamy po stronie frontendu
    const DISCS = ["Piłka Nożna", "Koszykówka", "Siatkówka"];
    const discStats = {};
    DISCS.forEach(disc => {
      const discMatches = (matches || []).filter(m => m.discipline === disc && m.status === "Rozegrany");
      let wins = 0, draws = 0, losses = 0;
      discMatches.forEach(m => {
        const s1 = m.shootout_t1 ?? m.score_t1 ?? 0;
        const s2 = m.shootout_t2 ?? m.score_t2 ?? 0;
        if      (m.team1_id === id && s1 > s2) wins++;
        else if (m.team2_id === id && s2 > s1) wins++;
        else if (s1 === s2 && m.shootout_t1 === null) draws++;
        else losses++;
      });
      discStats[disc] = { wins, draws, losses };
    });

    const ps = (players || []).map(p => ({
      ...p,
      first_name: p.people?.first_name,
      last_name:  p.people?.last_name,
      class_name: p.people?.class_name,
      player_id:  p.id,
    }));

    const ms = (matches || []).map(m => DB._normalizeMatch(m));

    return { team, players: ps, matches: ms, discStats };
  },

  // KLASYFIKACJE
  async getTopScorersDetail(discipline) {
    const { data: mps, error } = await getSB()
      .from("match_player_stats")
      .select(`*, players!inner(is_captain, team_id, people!inner(first_name,last_name)), teams!match_player_stats_team_id_fkey(team_name,class_name), matches!inner(discipline,status,match_date,match_time,score_t1,score_t2,team1_id,team2_id,teams!matches_team1_id_fkey(team_name),team2:teams!matches_team2_id_fkey(team_name))`)
      .eq("matches.discipline", discipline)
      .eq("matches.status", "Rozegrany");
    if (error) { console.error("getTopScorersDetail:", error); return null; }

    const playerMap = {};
    (mps || []).forEach(s => {
      const pid = s.player_id;
      if (!playerMap[pid]) {
        playerMap[pid] = {
          player_id:     pid,
          first_name:    s.players?.people?.first_name,
          last_name:     s.players?.people?.last_name,
          team_name:     s.teams?.team_name,
          class_name:    s.teams?.class_name,
          is_captain:    s.players?.is_captain,
          total_points:  0,
          matches_played: 0,
          points_1pt:    0,
          points_2pt:    0,
          points_3pt:    0,
          matches:       [],
        };
      }
      const pts = s.total_points_in_match ?? 0;
      playerMap[pid].total_points   += pts;
      playerMap[pid].matches_played += 1;
      playerMap[pid].points_1pt     += s.points_1pt ?? 0;
      playerMap[pid].points_2pt     += s.points_2pt ?? 0;
      playerMap[pid].points_3pt     += s.points_3pt ?? 0;
      playerMap[pid].matches.push({
        match_id:              s.match_id,
        total_points_in_match: pts,
        points_1pt:            s.points_1pt ?? 0,
        points_2pt:            s.points_2pt ?? 0,
        points_3pt:            s.points_3pt ?? 0,
        match_date:            s.matches?.match_date,
        match_time:            s.matches?.match_time,
        team1_name:            s.matches?.teams?.team_name,
        team2_name:            s.matches?.team2?.team_name,
        score_t1:              s.matches?.score_t1,
        score_t2:              s.matches?.score_t2,
      });
    });

    return Object.values(playerMap).sort((a, b) => b.total_points - a.total_points || (a.last_name || "").localeCompare(b.last_name || "", "pl"));
  },

  async getPlayerStats(discipline) {
    return DB.getTopScorersDetail(discipline);
  },

  // FORMAT TURNIEJU
  async getTournamentFormat() {
    const { data } = await getSB().from("tournament_format").select("*");
    const map = {};
    const DEFAULTS = { has_league: false, has_cup: false, pts_win: 3, pts_draw: 1, pts_loss: 0, groups_count: 1, teams_per_group: 4, cup_rounds: [] };
    ["Piłka Nożna", "Koszykówka", "Siatkówka"].forEach(d => { map[d] = { discipline: d, ...DEFAULTS }; });
    (data || []).forEach(r => {
      map[r.discipline] = {
        ...DEFAULTS, ...r,
        has_league: !!r.has_league,
        has_cup:    !!r.has_cup,
        cup_rounds: r.cup_rounds ? (typeof r.cup_rounds === "string" ? JSON.parse(r.cup_rounds) : r.cup_rounds) : [],
      };
    });
    return map;
  },

  // USTAWIENIA TURNIEJU
  async getTournamentSettings() {
    const { data } = await getSB().from("tournament_settings").select("*");
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });
    return s;
  },

  // TABELA LIGOWA
  async getStandings(discipline) {
    const [fmtAll, { data: seedRows }, { data: matchRows }, { data: setRows }] = await Promise.all([
      DB.getTournamentFormat(),
      getSB().from("seeding").select("team_id, position, teams(team_name,class_name)").eq("discipline", discipline).eq("type", "liga"),
      getSB().from("matches").select("*").eq("discipline", discipline).eq("match_type", "liga").eq("status", "Rozegrany"),
      discipline === "Siatkówka"
        ? getSB().from("match_periods").select("*, matches!inner(team1_id,team2_id,discipline,match_type,status)").eq("matches.discipline", "Siatkówka").eq("matches.status", "Rozegrany").eq("matches.match_type", "liga")
        : Promise.resolve({ data: [] }),
    ]);

    const fmt = fmtAll[discipline] || {};
    const pts_win  = fmt.pts_win  ?? 3;
    const pts_draw = fmt.pts_draw ?? 1;
    const pts_loss = fmt.pts_loss ?? 0;

    // Zbuduj tabelę
    const teamMap = {};
    (seedRows || []).forEach(s => {
      teamMap[s.team_id] = { id: s.team_id, team_name: s.teams?.team_name, class_name: s.teams?.class_name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    });

    (matchRows || []).forEach(m => {
      const t1 = teamMap[m.team1_id], t2 = teamMap[m.team2_id];
      if (!t1 || !t2) return;
      const s1 = m.shootout_t1 ?? m.score_t1 ?? 0;
      const s2 = m.shootout_t2 ?? m.score_t2 ?? 0;
      const g1 = m.score_t1 ?? 0, g2 = m.score_t2 ?? 0;
      t1.played++; t2.played++;
      t1.gf += g1; t1.ga += g2;
      t2.gf += g2; t2.ga += g1;
      if (s1 > s2)      { t1.wins++; t2.losses++; }
      else if (s2 > s1) { t2.wins++; t1.losses++; }
      else              { t1.draws++; t2.draws++; }
    });

    let result = Object.values(teamMap).map(r => ({ ...r, pts: r.wins * pts_win + r.draws * pts_draw + r.losses * pts_loss, gd: r.gf - r.ga }));

    // Siatkówka — sety
    if (discipline === "Siatkówka") {
      const setMap = {};
      (setRows || []).forEach(s => {
        const t1id = s.matches?.team1_id, t2id = s.matches?.team2_id;
        if (!t1id || !t2id) return;
        [t1id, t2id].forEach(tid => { if (!setMap[tid]) setMap[tid] = { sw: 0, sl: 0, pf: 0, pa: 0 }; });
        const w1 = s.points_t1 > s.points_t2;
        setMap[t1id].sw += w1 ? 1 : 0; setMap[t1id].sl += w1 ? 0 : 1;
        setMap[t1id].pf += s.points_t1; setMap[t1id].pa += s.points_t2;
        setMap[t2id].sw += w1 ? 0 : 1; setMap[t2id].sl += w1 ? 1 : 0;
        setMap[t2id].pf += s.points_t2; setMap[t2id].pa += s.points_t1;
      });
      result.forEach(r => {
        const sm = setMap[r.id] || { sw: 0, sl: 0, pf: 0, pa: 0 };
        r.gf = sm.sw; r.ga = sm.sl; r.gd = sm.sw - sm.sl;
        r.pf = sm.pf; r.pa = sm.pa; r.pd = sm.pf - sm.pa;
      });
      result.sort((a, b) => b.pts - a.pts || b.gd - a.gd || (b.pd ?? 0) - (a.pd ?? 0) || (b.pf ?? 0) - (a.pf ?? 0));
    } else {
      result.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    }

    return { rows: result, format: { pts_win, pts_draw, pts_loss }, discipline };
  },

  // DRABINKA PUCHAROWA
  async getBracket(discipline) {
    const { data, error } = await getSB()
      .from("matches")
      .select(`*, teams!matches_team1_id_fkey(team_name), team2:teams!matches_team2_id_fkey(team_name)`)
      .eq("discipline", discipline)
      .eq("match_type", "puchar")
      .order("match_date", { ascending: true });
    if (error) return [];
    const CUP_ORDER = ["1/16","1/8","1/4","Półfinał","Finał"];
    const grouped = {};
    (data || []).forEach(m => {
      const norm = DB._normalizeMatch(m);
      const r = norm.cup_round || "Inne";
      if (!grouped[r]) grouped[r] = [];
      grouped[r].push(norm);
    });
    const rounds = [];
    CUP_ORDER.forEach(r => { if (grouped[r]) rounds.push({ round: r, matches: grouped[r] }); });
    if (grouped["Inne"]) rounds.push({ round: "Inne", matches: grouped["Inne"] });
    return rounds;
  },

  // DANE DO TABELI GENERALNEJ
  async getRankingData(discipline) {
    const [fmtAll, standingsData, bracketData] = await Promise.all([
      DB.getTournamentFormat(),
      DB.getStandings(discipline),
      DB.getBracket(discipline),
    ]);
    const fmt = fmtAll[discipline] || {};
    const cupRoundsRaw = fmt.cup_rounds || [];
    const ROUND_ORDER = ["1/16","1/8","1/4","Półfinał","Finał"];

    // Liga
    const ligaResult = (standingsData?.rows || []).map((r, i) => ({ ...r, liga_rank: i + 1 }));

    // Puchar
    const cupMap = {};
    const ensureTeam = (id, name) => { if (!cupMap[id]) cupMap[id] = { teamId: id, teamName: name, bestRoundIdx: -1, bestRound: null, wonFinal: false, reached: [] }; };
    const allCupMatches = bracketData.flatMap(r => r.matches.map(m => ({ ...m, cup_round: r.round })));
    allCupMatches.forEach(m => {
      const rIdx = ROUND_ORDER.indexOf(m.cup_round);
      ensureTeam(m.team1_id, m.team1_name);
      ensureTeam(m.team2_id, m.team2_name);
      [m.team1_id, m.team2_id].forEach(tid => {
        if (rIdx > cupMap[tid].bestRoundIdx) { cupMap[tid].bestRoundIdx = rIdx; cupMap[tid].bestRound = m.cup_round; }
        if (!cupMap[tid].reached.includes(m.cup_round)) cupMap[tid].reached.push(m.cup_round);
      });
      if (m.status === "Rozegrany") {
        const s1 = m.shootout_t1 ?? m.score_t1 ?? 0, s2 = m.shootout_t2 ?? m.score_t2 ?? 0;
        const winnerId = s1 > s2 ? m.team1_id : m.team2_id;
        if (m.cup_round === "Finał") cupMap[winnerId].wonFinal = true;
      }
    });
    const cupPlaceLabel = (rIdx, wonFinal) => {
      if (rIdx < 0) return null;
      const round = ROUND_ORDER[rIdx];
      if (round === "Finał") return wonFinal ? "1." : "2.";
      if (round === "Półfinał") return "3–4.";
      if (round === "1/4")     return "5–8.";
      if (round === "1/8")     return "9–16.";
      if (round === "1/16")    return "17–32.";
      return `${rIdx+1}.`;
    };
    const N_cup = Object.keys(cupMap).length;
    const cupData = Object.values(cupMap).map(t => {
      const rIdx = t.bestRoundIdx;
      let Rmid = N_cup;
      if (t.wonFinal) Rmid = 1;
      else if (ROUND_ORDER[rIdx] === "Finał") Rmid = 2;
      else if (rIdx >= 0) Rmid = Math.max(3, N_cup / Math.pow(2, rIdx + 1) + 2);
      const Pb = N_cup > 0 ? Math.round(((N_cup - Rmid + 1) / N_cup) * 100 * 10) / 10 : 0;
      return { ...t, placeLabel: cupPlaceLabel(rIdx, t.wonFinal), cupPb: Math.max(0, Pb), cupRankMid: Rmid, N_cup };
    });

    return {
      discipline,
      has_league: !!fmt.has_league,
      has_cup:    !!fmt.has_cup,
      cup_rounds: cupRoundsRaw,
      liga: { rows: ligaResult, format: standingsData?.format || {}, total: ligaResult.length },
      cup:  { teams: cupData, total: cupData.length, rounds: allCupMatches.map(m => m.cup_round).filter((v, i, a) => a.indexOf(v) === i) },
    };
  },

  // STATUS
  async checkStatus() {
    try {
      const { error } = await getSB().from("matches").select("id").limit(1);
      return { ok: !error };
    } catch { return { ok: false }; }
  },
};

// Stara funkcja `api()` — zastępujemy przez wywołania DB.*
// Zostawiona tylko dla fragmentów które używają openMatchDetail itp.
async function api(path) {
  loader(true);
  try {
    // Parsuj path i przekieruj do odpowiedniego DB.*
    const matchesDetail = path.match(/^\/matches\/(\d+)$/);
    if (matchesDetail) return await DB.getMatch(matchesDetail[1]);

    const matchesList = path.match(/^\/matches\?(.*)$/);
    if (matchesList) {
      const params = Object.fromEntries(new URLSearchParams(matchesList[1]));
      return await DB.getMatches(params);
    }

    const topScorers = path.match(/^\/top-scorers-detail\/(.+)$/);
    if (topScorers) return await DB.getTopScorersDetail(decodeURIComponent(topScorers[1]));

    const playerStats = path.match(/^\/player-stats\/(.+)$/);
    if (playerStats) return await DB.getPlayerStats(decodeURIComponent(playerStats[1]));

    const teams = path.match(/^\/teams$/);
    if (teams) return await DB.getTeams();

    const teamProfile = path.match(/^\/teams\/(\d+)\/profile$/);
    if (teamProfile) return await DB.getTeamProfile(+teamProfile[1]);

    const bracket = path.match(/^\/bracket\/(.+)$/);
    if (bracket) return await DB.getBracket(decodeURIComponent(bracket[1]));

    console.warn("Unhandled api path:", path);
    return null;
  } catch(e) { console.error("api:", e); return null; }
  finally { loader(false); }
}

/* ── State ──────────────────────────────────────────────────────────────── */
let activeDiscipline = "Piłka Nożna";
let activeSub        = "terminarz";
let popupOpenDisc    = null;
let tournamentFormat = null; // cache formatu rozgrywek

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)               e.className  = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const VIEWS = ["terminarz","wyniki","zawodnicy","dokumenty","druzyny","ranking"];

function showView(name) {
  VIEWS.forEach(v => {
    const s = $(`view-${v}`);
    if (s) s.classList.toggle("active", v === name);
  });
}

const loader   = on => $("loader").classList.toggle("hidden", !on);
const isMobile = () => window.innerWidth < 768;

const fmtDate = d => d ? new Date(d).toLocaleDateString("pl-PL",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtTime = t => t ? t.slice(0,5) : "";

const DISC_CLASS = { "Piłka Nożna":"disc-football","Koszykówka":"disc-basketball","Siatkówka":"disc-volleyball" };
const DISC_EMOJI = { "Piłka Nożna":"⚽","Koszykówka":"🏀","Siatkówka":"🏐" };


(icon, msg) => {
  const d = el("div","empty-state");
  d.innerHTML = `<div class="icon">${icon}</div><p>${msg}</p>`;
  return d;
}

/* ════════════════════════════════════════════════════════════════════════════
   FORMAT — pobierz i cache'uj
════════════════════════════════════════════════════════════════════════════ */
async function getFormat(forceRefresh) {
  if (tournamentFormat && !forceRefresh) return tournamentFormat;
  try {
    tournamentFormat = await DB.getTournamentFormat();
  } catch { tournamentFormat = {}; }
  return tournamentFormat;
}

// Zwraca pełny obiekt formatu dla dyscypliny (nie tylko has_league/has_cup)
function formatFor(disc) {
  const f = tournamentFormat?.[disc] || {};
  return {
    has_league:      !!f.has_league,
    has_cup:         !!f.has_cup,
    pts_win:         f.pts_win  ?? 3,
    pts_draw:        f.pts_draw ?? 1,
    pts_loss:        f.pts_loss ?? 0,
    groups_count:    f.groups_count    ?? 1,
    teams_per_group: f.teams_per_group ?? 4,
    cup_rounds:      f.cup_rounds      ?? [],
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   NAVIGATE — single source of truth
════════════════════════════════════════════════════════════════════════════ */
async function navigate(disc, sub) {
  activeDiscipline = disc;

  // Zawsze pobierz świeży format z serwera — ustawienia mogły się zmienić
  await getFormat(true);

  if (sub) {
    // Jeśli żądany sub to "wyniki" ale brak rozgrywek — przełącz na terminarz
    const fmtCheck = formatFor(disc);
      // ranking zawsze dostępny niezależnie od rozgrywek
    activeSub = sub;
  } else {
    // Domyślny widok: terminarz (zawsze dostępny)
    activeSub = "terminarz";
  }

  updateDesktopNav();
  updateBottomNav();

  if (disc === "ranking") {
    showView("ranking");
    activeDiscipline = "ranking";
    activeSub = "ranking";
    updateDesktopNav();
    updateBottomNav();
    loadRankingSection();
    return;
  }

  if (disc === "dokumenty") {
    showView("dokumenty");
    loadDokumenty();
    return;
  }

  if (disc === "druzyny") {
    allTeams = null;
    if (typeof initTeamsView === "function") initTeamsView(null);
    return;
  }

  // dyscyplina sportowa
  const e = DISC_EMOJI[disc] || "";
  $("terminarz-title").textContent  = `${e} Terminarz — ${disc}`;
  $("wyniki-title").textContent     = `${e} Wyniki — ${disc}`;
  $("zawodnicy-title").textContent  = `${e} Zawodnicy — ${disc}`;

  showView(activeSub);
  if (activeSub === "terminarz") loadTerminarz();
  if (activeSub === "wyniki")    loadWyniki();
  if (activeSub === "zawodnicy") loadZawodnicy();
}

/* ════════════════════════════════════════════════════════════════════════════
   DESKTOP NAV — function-first: group by sub, dropdown shows sports
════════════════════════════════════════════════════════════════════════════ */
document.querySelectorAll(".desktop-nav-group").forEach(group => {
  const sub = group.dataset.sub;
  let closeTimer = null;
  const open  = () => {
    clearTimeout(closeTimer);
    // For "wyniki" disable sports where no format available — rebuild on open
    const dd = group.querySelector(".desktop-dropdown");
    if (dd && sub === "wyniki") {
      dd.querySelectorAll(".dd-btn").forEach(btn => {
        const disc = btn.dataset.disc;
        const f = formatFor(disc);
        // wyniki zawsze dostępne (tabela generalna dostępna dla każdej dyscypliny)
        btn.classList.remove("dd-btn--disabled");
        btn.title = "";
      });
    }
    group.classList.add("open");
  };
  const close = () => { closeTimer = setTimeout(() => group.classList.remove("open"), 200); };
  group.addEventListener("mouseenter", open);
  group.addEventListener("mouseleave", close);
  group.querySelector(".nav-disc-btn").addEventListener("click", () => {
    // clicking the top-level button navigates with current discipline
    navigate(activeDiscipline, sub);
    group.classList.remove("open");
  });
  group.querySelectorAll(".dd-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (btn.dataset.disc === "ranking") {
        navigate("ranking", null);
      } else {
        navigate(btn.dataset.disc, sub);
      }
      group.classList.remove("open");
    });
  });
});

document.querySelectorAll(".nav-disc-btn.solo").forEach(btn =>
  btn.addEventListener("click", () => navigate(btn.dataset.disc, null))
);

function updateDesktopNav() {
  document.querySelectorAll(".desktop-nav-group").forEach(g => {
    const sub = g.dataset.sub;
    const active = sub === activeSub;
    g.querySelector(".nav-disc-btn").classList.toggle("active", active);
    g.querySelectorAll(".dd-btn").forEach(b =>
      b.classList.toggle("active", active && b.dataset.disc === activeDiscipline));
  });
  document.querySelectorAll(".nav-disc-btn.solo").forEach(btn =>
    btn.classList.toggle("active", activeDiscipline === btn.dataset.disc));
  // Aktywny stan dla "Tabela Generalna" w dropdown Wyniki
  document.querySelectorAll(".dd-btn--ranking").forEach(btn =>
    btn.classList.toggle("active", activeDiscipline === "ranking"));
}

/* ════════════════════════════════════════════════════════════════════════════
   MOBILE BOTTOM NAV — function-first: tap function → popup shows sports
════════════════════════════════════════════════════════════════════════════ */
document.querySelectorAll(".bot-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const sub = btn.dataset.sub;
    if (popupOpenDisc === sub) { closeMobilePopup(); return; }
    openMobilePopup(sub, btn);
  });
});

function updateBottomNav() {
  document.querySelectorAll(".bot-btn").forEach(b => {
    const s = b.dataset.sub;
    const active =
      s === activeSub ||
      (s === "inne" && (activeDiscipline === "druzyny" || activeDiscipline === "dokumenty"));
    b.classList.toggle("active", active);
    b.classList.remove("popup-open");
  });
}

/* ── Mobile popup ────────────────────────────────────────────────────────── */
const INNE_SUBS = [
  { disc:"druzyny",   label:"🏅 Drużyny"   },
  { disc:"dokumenty", label:"📄 Dokumenty" },
];

const SPORT_OPTIONS = [
  { disc:"Piłka Nożna", label:"⚽ Piłka Nożna" },
  { disc:"Koszykówka",  label:"🏀 Koszykówka"  },
  { disc:"Siatkówka",   label:"🏐 Siatkówka"   },
];

function openMobilePopup(sub, btnEl) {
  closeMobilePopup(true);
  popupOpenDisc = sub;
  btnEl.classList.add("popup-open");

  const isInne = sub === "inne";
  const SUB_LABELS = { terminarz:"📅 Terminarz", wyniki:"🏁 Wyniki", zawodnicy:"👤 Zawodnicy" };
  const title = isInne ? "☰ Inne" : (SUB_LABELS[sub] || sub);

  const popup = el("div","mob-popup");
  popup.id = "mob-popup-active";
  popup.innerHTML = `<div class="mob-popup-title">${title}</div>`;

  let options;
  if (isInne) {
    options = INNE_SUBS.map(({ disc, label }) => ({
      disc, label,
      isActive: activeDiscipline === disc,
      disabled: false,
      action: () => navigate(disc, null),
    }));
  } else {
    options = SPORT_OPTIONS.map(({ disc, label }) => {
      return {
        disc, label,
        isActive: disc === activeDiscipline && sub === activeSub,
        disabled: false,
        action: () => navigate(disc, sub),
      };
    });
    // Dla wyniki — dodaj separator + Tabela Generalna
    if (sub === "wyniki") {
      options.push({ disc: "ranking", label: "🏅 Tabela Generalna", separator: true,
        isActive: activeDiscipline === "ranking",
        disabled: false,
        action: () => navigate("ranking", null),
      });
    }
  }

  options.forEach(({ label, isActive, disabled, action, separator }) => {
    if (separator) {
      const sep = el("div","mob-opt-separator");
      popup.appendChild(sep);
    }
    const optBtn = el("button","mob-opt" + (separator ? " mob-opt--ranking" : ""), label);
    if (isActive) optBtn.classList.add("active");
    if (disabled) {
      optBtn.classList.add("mob-opt--disabled");
      optBtn.title = "Brak aktywnych rozgrywek";
    }
    optBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (disabled) return;
      closeMobilePopup();
      action();
    });
    popup.appendChild(optBtn);
  });

  document.body.appendChild(popup);

  const btnRect  = btnEl.getBoundingClientRect();
  const botnav   = document.querySelector(".bottom-nav");
  const botnavTop = botnav.getBoundingClientRect().top;
  const popupW   = popup.offsetWidth;
  const popupH   = popup.offsetHeight;

  let left = btnRect.left + btnRect.width / 2 - popupW / 2;
  left = Math.max(4, Math.min(left, window.innerWidth - popupW - 4));
  const top = botnavTop - popupH;

  popup.style.left     = `${left}px`;
  popup.style.top      = `${top}px`;
  popup.style.minWidth = `${Math.max(btnRect.width, 130)}px`;

  $("mob-popup-backdrop").classList.remove("hidden");
}

function closeMobilePopup(instant = false) {
  const existing = document.getElementById("mob-popup-active");
  if (existing) existing.remove();
  popupOpenDisc = null;
  document.querySelectorAll(".bot-btn").forEach(b => b.classList.remove("popup-open"));
  $("mob-popup-backdrop").classList.add("hidden");
}

$("mob-popup-backdrop").addEventListener("click", () => closeMobilePopup());

/* ════════════════════════════════════════════════════════════════════════════
   TERMINARZ
════════════════════════════════════════════════════════════════════════════ */
let _termData    = [];
let _termSets    = {};
let _termFilters = new Set(); // wielokrotny wybór
let _termSearch  = "";

async function loadTerminarz() {
  const disc = activeDiscipline;
  const data = await api(`/matches?discipline=${encodeURIComponent(disc)}`);
  const c = $("terminarz-list"); c.innerHTML = "";
  if (!data?.length) { c.appendChild(emptyState("📅","Brak meczów")); return; }

  let setsMap = {};
  if (disc === "Siatkówka") {
    const played = data.filter(m => ["Rozegrany","Walkower"].includes(m.status));
    const results = await Promise.all(played.map(m => api(`/matches/${m.id}`)));
    results.forEach(r => { if (r?.sets?.length) setsMap[r.match.id] = r.sets; });
  }

  _termData    = data;
  _termSets    = setsMap;
  _termFilters = new Set();
  _termSearch  = "";

  const searchInput = $("tf-search");
  if (searchInput) searchInput.value = "";
  document.querySelectorAll(".tf-chip").forEach(b => b.classList.remove("tf-chip--active"));
  updateClearBtn();

  applyTerminarzFilters();
  initTerminarzFilters();
}

function initTerminarzFilters() {
  const oldFilters = $("terminarz-filters");
  if (!oldFilters) return;
  const newFilters = oldFilters.cloneNode(true);
  oldFilters.parentNode.replaceChild(newFilters, oldFilters);

  const searchInput = newFilters.querySelector("#tf-search");
  const clearBtn    = newFilters.querySelector("#tf-clear");

  searchInput.addEventListener("input", () => {
    _termSearch = searchInput.value.trim().toLowerCase();
    updateClearBtn();
    applyTerminarzFilters();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    _termSearch = "";
    updateClearBtn();
    applyTerminarzFilters();
  });

  newFilters.querySelectorAll(".tf-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.filter;
      if (_termFilters.has(f)) {
        _termFilters.delete(f);
        btn.classList.remove("tf-chip--active");
      } else {
        _termFilters.add(f);
        btn.classList.add("tf-chip--active");
      }
      applyTerminarzFilters();
    });
  });
}

function updateClearBtn() {
  const btn = $("tf-clear");
  if (btn) btn.style.opacity = _termSearch ? "1" : "0";
}

function applyTerminarzFilters() {
  let matches = _termData;

  if (_termFilters.size > 0) {
    matches = matches.filter(m => {
      // sprawdź czy mecz pasuje do KTÓREGOKOLWIEK aktywnego filtra
      return [..._termFilters].some(f => {
        if (f === "liga" || f === "puchar") return m.match_type === f;
        return m.status === f;
      });
    });
  }

  if (_termSearch) {
    matches = matches.filter(m =>
      m.team1_name?.toLowerCase().includes(_termSearch) ||
      m.team2_name?.toLowerCase().includes(_termSearch)
    );
  }

  buildScheduleList(matches, _termSets);

  if (!matches.length) {
    const c = $("terminarz-list");
    c.innerHTML = "";
    c.appendChild(emptyState("🔍", "Brak meczów spełniających kryteria"));
  }
}
function buildScheduleList(matches, setsMap = {}) {
  const c = $("terminarz-list");
  c.innerHTML = "";

  // ukryj mecze bez daty
  const withDate = matches.filter(m => m.match_date && m.match_date.slice(0,10) !== "—");
  if (!withDate.length) { c.appendChild(emptyState("📅","Brak meczów z przypisaną datą")); return; }

  // dzisiejsza data YYYY-MM-DD
  const todayStr = new Date().toLocaleDateString("sv-SE");

  // grupuj po dacie
  const groups = [];
  withDate.forEach(m => {
    const key = m.match_date.slice(0,10);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.matches.push(m);
    else groups.push({ key, matches: [m] });
  });

  // Czy linia "dziś" już wstawiona
  let todayLineInserted = false;

  // Sprawdź czy dziś jest między datami (poza grupami)
  const allKeys = groups.map(g => g.key);
  const hasTodayGroup = allKeys.includes(todayStr);
  const hasPast   = allKeys.some(k => k < todayStr);
  const hasFuture = allKeys.some(k => k > todayStr);
  const todayBetween = !hasTodayGroup && hasPast && hasFuture;
  const todayBeforeAll = !hasTodayGroup && !hasPast && hasFuture;

  // Wstaw linię "dziś" PRZED wszystkimi, jeśli wszystkie mecze są w przyszłości
  if (todayBeforeAll) {
    c.appendChild(buildTodayLine());
    todayLineInserted = true;
  }

  groups.forEach(({ key, matches }) => {
    const isToday = key === todayStr;

    // Jeśli dziś jest "między" — wstaw linię przed pierwszą przyszłą datą
    if (!todayLineInserted && !isToday && key > todayStr && todayBetween) {
      c.appendChild(buildTodayLine());
      todayLineInserted = true;
    }

    const sep = el("div", isToday ? "sched-date-sep sched-date-sep--today" : "sched-date-sep");
    const d = new Date(key + "T12:00:00");
    const dayNames = ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"];
    sep.innerHTML = `
      ${isToday ? `<span class="sched-today-pill">DZIŚ</span>` : ""}
      <span class="sched-sep-day">${dayNames[d.getDay()]}</span>
      <span class="sched-sep-date">${d.toLocaleDateString("pl-PL",{day:"2-digit",month:"long",year:"numeric"})}</span>
    `;
    c.appendChild(sep);

    // Jeśli to dzisiejsza data — wstaw linię "dziś" PO nagłówku, PRZED kartami
    if (isToday && !todayLineInserted) {
      c.appendChild(buildTodayLine());
      todayLineInserted = true;
    }

    matches.forEach(m => {
      const wrapper = el("div","sched-card-wrapper");
      buildScheduleCard(m, setsMap[m.id] || [], wrapper);
      c.appendChild(wrapper);
    });
  });

  // Jeśli wszystkie mecze są w przeszłości — wstaw linię na końcu
  if (!todayLineInserted) {
    c.appendChild(buildTodayLine());
  }
}

function buildTodayLine() {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("pl-PL", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  const line = el("div","sched-today-line");
  line.innerHTML = `
    <div class="sched-today-line-bar"></div>
    <span class="sched-today-line-label">&#x25c6; Dzi&#x15B; &middot; ${dateLabel}</span>
    <div class="sched-today-line-bar"></div>
  `;
  return line;
}

function buildMatchTypeLabel(m) {
  if (m.match_type === "puchar") {
    return `Puchar${m.cup_round ? " · " + m.cup_round : ""}`;
  }
  return `Liga`;
}

function buildScheduleCard(m, sets = [], wrapper) {
  const card = el("div","sched-card");

  // Logika wyniku: 0:0 przy statusie Planowany traktuj jak brak wyniku
  const isPlanned = m.status === "Planowany";
  const score0_0  = (m.score_t1 === 0 || m.score_t1 === null) &&
                    (m.score_t2 === 0 || m.score_t2 === null);
  const hasScore  = ["Rozegrany","Walkower"].includes(m.status) ||
                    (!isPlanned && m.score_t1 !== null && m.score_t2 !== null) ||
                    (m.score_t1 !== null && m.score_t2 !== null && !score0_0);

  // Ustal zwycięzcę
  const w = hasScore ? (()=>{
    const a = m.shootout_t1 !== null ? m.shootout_t1 : m.score_t1;
    const b = m.shootout_t2 !== null ? m.shootout_t2 : m.score_t2;
    if (a > b) return 1; if (b > a) return 2; return 0;
  })() : 0;

  const setsHtml = sets.length
    ? `<div class="sched-sets">${sets.map(s => {
        const t1w = s.points_t1 > s.points_t2;
        const t2w = s.points_t2 > s.points_t1;
        return `<span class="sched-set">
          <span class="${t1w?"sched-set-t1w":t2w?"sched-set-t1l":""}">${s.points_t1}</span><span class="sched-set-sep">:</span><span class="${t2w?"sched-set-t2w":t1w?"sched-set-t2l":""}">${s.points_t2}</span>
        </span>`;
      }).join("")}</div>`
    : "";

  const matchTypeLabel = buildMatchTypeLabel(m);

  // Tylko data i godzina pod wynikiem na karcie
  const ICON_CAL   = `<svg class="meta-icon meta-icon--cal" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3" width="13" height="11.5" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.4"/><path d="M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="4" y="9" width="2" height="2" rx=".4" fill="currentColor"/><rect x="7" y="9" width="2" height="2" rx=".4" fill="currentColor"/><rect x="10" y="9" width="2" height="2" rx=".4" fill="currentColor"/></svg>`;
  const ICON_CLOCK = `<svg class="meta-icon meta-icon--clock" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2.2 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const metaParts = [];
  if (m.match_date) metaParts.push(`<span class="sched-meta-item">${ICON_CAL} ${fmtDate(m.match_date)}</span>`);
  if (m.match_time) metaParts.push(`<span class="sched-meta-item">${ICON_CLOCK} ${fmtTime(m.match_time)}</span>`);

  card.innerHTML = `
    <div class="sched-card-header">
      <span class="sched-match-type">${matchTypeLabel}</span>
      <span class="status-badge status-${m.status}">${m.status}</span>
    </div>

    <div class="sched-matchup">
      <div class="sched-team ${hasScore && w===1 ? "sched-team--winner" : hasScore && w===2 ? "sched-team--loser" : ""}">
        <div class="sched-team-row">
          <span class="sched-team-name">${m.team1_name}</span>
          ${m.team1_class ? `<span class="sched-team-class">${m.team1_class}</span>` : ""}
          
        </div>
      </div>

      <div class="sched-center">
        ${hasScore
          ? `<div class="sched-score">
               <span class="sched-score-num ${scoreWinner(m.score_t1,m.score_t2,m.shootout_t1,m.shootout_t2,"t1")}">${m.score_t1}</span>
               <span class="sched-score-sep">:</span>
               <span class="sched-score-num ${scoreWinner(m.score_t1,m.score_t2,m.shootout_t1,m.shootout_t2,"t2")}">${m.score_t2}</span>
             </div>
             ${m.shootout_t1 !== null ? `<div class="sched-shootout">karne ${m.shootout_t1}:${m.shootout_t2}</div>` : ""}
             ${setsHtml}`
          : `<div class="sched-score sched-score--empty">
               <span class="sched-vs">VS</span>
             </div>`
        }
        ${metaParts.length ? `<div class="sched-center-meta">${metaParts.join("")}</div>` : ""}
      </div>

      <div class="sched-team ${hasScore && w===2 ? "sched-team--winner" : hasScore && w===1 ? "sched-team--loser" : ""}">
        <div class="sched-team-row">
          
          <span class="sched-team-name">${m.team2_name}</span>
          ${m.team2_class ? `<span class="sched-team-class">${m.team2_class}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="sched-card-footer">
      <span class="sched-expand-hint">Szczegóły ▾</span>
    </div>
  `;

  // Panel szczegółów — dodawany DO WRAPPERA po karcie, nie do karty
  const panel = el("div","sched-detail-panel");
  panel.dataset.matchId = m.id;
  panel.dataset.loaded = "0";

  card.addEventListener("click", async () => {
    const isOpen = wrapper.classList.contains("expanded");

    // zamknij wszystkie inne
    document.querySelectorAll(".sched-card-wrapper.expanded").forEach(w => {
      if (w !== wrapper) {
        w.classList.remove("expanded");
        w.querySelector(".sched-detail-panel")?.classList.remove("open");
        const hint = w.querySelector(".sched-expand-hint");
        if (hint) hint.textContent = "Szczegóły ▾";
      }
    });

    if (isOpen) {
      wrapper.classList.remove("expanded");
      panel.classList.remove("open");
      card.querySelector(".sched-expand-hint").textContent = "Szczegóły ▾";
      return;
    }

    wrapper.classList.add("expanded");
    panel.classList.add("open");
    card.querySelector(".sched-expand-hint").textContent = "Zwiń ▴";

    if (panel.dataset.loaded === "1") return;
    panel.dataset.loaded = "1";
    panel.innerHTML = `<div class="sched-detail-loading"><div class="spinner-sm"></div> Ładowanie…</div>`;

    const data = await api(`/matches/${m.id}`);
    if (!data || data.error) {
      panel.innerHTML = `<p style="color:var(--red);padding:1rem">Błąd ładowania danych</p>`;
      return;
    }
    panel.innerHTML = await buildMatchDetailHtml(data);
  });

  wrapper.appendChild(card);
  wrapper.appendChild(panel);
  return null;
}


async function buildMatchDetailHtml({ match: m, playerStats, teamStats, sets, logs: serverLogs, quarters: serverQuarters, quarterTotals, footParts: serverFootParts, penaltyScore: serverPenaltyScore }) {
  const played  = ["Rozegrany","Walkower"].includes(m.status);
  const isBask  = m.discipline === "Koszykówka";
  const isFoot  = m.discipline === "Piłka Nożna";
  const isVolley = m.discipline === "Siatkówka";
  let html = `<div class="sched-detail-inner">`;

  if (isBask && played) {
    // ══════════════════════════════════════════════════════════════════════
    // KOSZYKÓWKA — rozegrany mecz: pełny widok
    // ══════════════════════════════════════════════════════════════════════
    const scoreT1 = Number(m.score_t1 ?? 0);
    const scoreT2 = Number(m.score_t2 ?? 0);
    const winner  = scoreT1 > scoreT2 ? 1 : scoreT2 > scoreT1 ? 2 : 0;

    // Logi z serwera (już pobrane przez /api/matches/:id)
    const logs = serverLogs || [];
    // Kwartały sparsowane po stronie serwera
    const qRows = serverQuarters || [];
    const qTotals = quarterTotals || {};

    // — Podstawowe informacje
    html += `
      <div class="sched-det-section bsk-info-section">
        <div class="sched-det-title">&#x25a0; Informacje o meczu</div>
        <div class="sched-det-grid">
          <div class="sched-det-item"><div class="sched-det-label">Data</div><div class="sched-det-val">${fmtDate(m.match_date)}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Godzina</div><div class="sched-det-val">${fmtTime(m.match_time)||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Boisko</div><div class="sched-det-val">${m.court||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Rodzaj</div><div class="sched-det-val">${m.match_type === "puchar" ? "Puchar" + (m.cup_round ? " · " + m.cup_round : "") : "Liga"}</div></div>
        </div>
      </div>
    `;

    // — Wynik końcowy
    html += `
      <div class="sched-det-section">
        <div class="bsk-final-score">
          <div class="bsk-final-team ${winner===1?"bsk-final-win":winner===2?"bsk-final-lose":""}">
            <div class="bsk-final-name">${m.team1_name}</div>
            <div class="bsk-final-num">${scoreT1}</div>
            ${winner===1?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
          <div class="bsk-final-vs">
            <div class="bsk-final-sep">:</div>
            <div class="bsk-final-label">Wynik ko&#x144;cowy</div>
          </div>
          <div class="bsk-final-team ${winner===2?"bsk-final-win":winner===1?"bsk-final-lose":""}">
            <div class="bsk-final-num">${scoreT2}</div>
            <div class="bsk-final-name">${m.team2_name}</div>
            ${winner===2?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
        </div>
      </div>
    `;

    // — Tabela kwartałów — dane z serwera
    {
      const cell = v => v !== null && v !== undefined
        ? `<span class="${v===0?"bsk-q-zero":""}">${v}</span>`
        : `<span class="bsk-q-s-na">—</span>`;

      html += `
        <div class="sched-det-section">
          <div class="sched-det-title">&#x25a1; Wyniki kwartalnie</div>
          <div class="bsk-quarters-wrap">
            <table class="bsk-q-table">
              <colgroup>
                <col class="bsk-qcol-label">
                <col class="bsk-qcol-score">
                <col class="bsk-qcol-stat"><col class="bsk-qcol-stat">
                <col class="bsk-qcol-stat"><col class="bsk-qcol-stat">
              </colgroup>
              <thead>
                <tr class="bsk-q-head-top">
                  <th rowspan="2" class="bsk-q-th-kwarta">Kwarta</th>
                  <th rowspan="2" class="bsk-q-th-wynik">Wynik</th>
                  <th colspan="2" class="bsk-q-th-team bsk-q-th-t1 ${winner===1?"bsk-q-th-win":""}">${m.team1_name}</th>
                  <th colspan="2" class="bsk-q-th-team bsk-q-th-t2 ${winner===2?"bsk-q-th-win":""}">${m.team2_name}</th>
                </tr>
                <tr class="bsk-q-head-sub">
                  <th class="bsk-q-th-sub">Przerwy</th>
                  <th class="bsk-q-th-sub">Zmiany</th>
                  <th class="bsk-q-th-sub">Przerwy</th>
                  <th class="bsk-q-th-sub">Zmiany</th>
                </tr>
              </thead>
              <tbody>
                ${qRows.map(r => {
                  const hasScore = r.t1 !== null && r.t2 !== null;
                  const w = hasScore ? (r.t1 > r.t2 ? 1 : r.t1 < r.t2 ? 2 : 0) : 0;
                  const scoreHtml = hasScore
                    ? `<span class="${w===1?"bsk-q-s-win":w===2?"bsk-q-s-lose":""}">${r.t1}</span><span class="bsk-q-s-sep"> : </span><span class="${w===2?"bsk-q-s-win":w===1?"bsk-q-s-lose":""}">${r.t2}</span>`
                    : `<span class="bsk-q-s-na">—</span>`;
                  return `<tr class="bsk-q-row">
                    <td class="bsk-q-td-label">Kwarta ${r.quarter}</td>
                    <td class="bsk-q-td-score">${scoreHtml}</td>
                    <td class="bsk-q-td-stat">${cell(r.to1)}</td>
                    <td class="bsk-q-td-stat">${cell(r.zm1)}</td>
                    <td class="bsk-q-td-stat">${cell(r.to2)}</td>
                    <td class="bsk-q-td-stat">${cell(r.zm2)}</td>
                  </tr>`;
                }).join("")}
              </tbody>
              <tfoot>
                <tr class="bsk-q-foot">
                  <td class="bsk-q-td-label bsk-q-foot-label">Wynik ko&#x144;cowy</td>
                  <td class="bsk-q-td-score bsk-q-foot-score">
                    <span class="${winner===1?"bsk-q-s-win-final":""}">${scoreT1}</span>
                    <span class="bsk-q-s-sep"> : </span>
                    <span class="${winner===2?"bsk-q-s-win-final":""}">${scoreT2}</span>
                  </td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${cell(qTotals.to1 ?? null)}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${cell(qTotals.zm1 ?? null)}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${cell(qTotals.to2 ?? null)}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${cell(qTotals.zm2 ?? null)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    // — Składy drużyn
    if (playerStats?.length) {
      html += `<div class="sched-det-section">
        <div class="sched-det-title">&#x25b7; Sk&#x142;ady dru&#x17c;yn</div>
        <div class="bsk-squads-grid">`;

      [m.team1_name, m.team2_name].forEach(teamName => {
        const players = playerStats.filter(s => s.team_name === teamName);
        if (!players.length) return;
        const isWin = (teamName === m.team1_name && winner === 1) ||
                      (teamName === m.team2_name && winner === 2);
        const teamScore = teamName === m.team1_name ? scoreT1 : scoreT2;

        const sorted = [...players].sort((a,b) => {
          if (b.is_captain !== a.is_captain) return b.is_captain - a.is_captain;
          return (b.total_points_in_match ?? 0) - (a.total_points_in_match ?? 0);
        });

        html += `
          <div class="bsk-squad-block ${isWin?"bsk-squad-block--win":"bsk-squad-block--lose"}">
            <div class="bsk-squad-title">
              <span class="bsk-squad-name">${teamName}</span>
              <span class="bsk-squad-score ${isWin?"bsk-squad-score--win":"bsk-squad-score--lose"}">${teamScore} pkt</span>
            </div>
            <div class="bsk-squad-table-wrap">
              <table class="sched-det-table bsk-squad-table">
                <thead><tr>
                  <th class="bsk-col-nr" title="Lp.">Nr</th>
                  <th class="bsk-col-name">Imi&#x119; i nazwisko</th>
                  <th class="bsk-col-pts" title="Punkty łącznie">Pkt</th>
                  <th class="bsk-col-1pt" title="Rzuty wolne (1 pkt)">1pt</th>
                  <th class="bsk-col-2pt" title="Rzut za 2 pkt">2pt</th>
                  <th class="bsk-col-3pt" title="Rzut za 3 pkt">3pt</th>
                  <th class="bsk-col-foul" title="Faule osobiste">F.</th>
                  <th class="bsk-col-tech" title="Faule techniczne">T.</th>
                </tr></thead>
                <tbody>
        `;

        sorted.forEach((s, idx) => {
          const pts  = s.total_points_in_match ?? 0;
          const foul = s.personal_fouls ?? 0;
          const tech = s.technical_fouls ?? 0;
          const p3   = s.points_3pt ?? 0;
          const p2   = s.points_2pt ?? 0;
          const p1   = s.points_1pt ?? 0;

          // Logiczne klasy wierszy:
          let rowCls = s.is_captain ? "bsk-row-captain" : "";

          html += `<tr class="${rowCls}">
            <td class="bsk-col-nr">${idx + 1}</td>
            <td class="bsk-col-name">${s.is_captain ? '<span class="captain-badge">K</span>&nbsp;' : ""}${s.first_name} ${s.last_name}</td>
            <td class="bsk-col-pts"><strong>${pts}</strong></td>
            <td class="bsk-col-1pt">${p1}</td>
            <td class="bsk-col-2pt">${p2}</td>
            <td class="bsk-col-3pt">${p3}</td>
            <td class="bsk-col-foul">${foul}</td>
            <td class="bsk-col-tech">${tech}</td>
          </tr>`;
        });

        const totalPts  = sorted.reduce((a,p) => a+(p.total_points_in_match??0), 0);
        const totalFoul = sorted.reduce((a,p) => a+(p.personal_fouls??0), 0);
        const totalTech = sorted.reduce((a,p) => a+(p.technical_fouls??0), 0);
        html += `<tr class="bsk-row-total">
          <td colspan="2" class="bsk-total-label">Łącznie</td>
          <td class="bsk-col-pts"><strong>${totalPts}</strong></td>
          <td></td><td></td><td></td>
          <td class="bsk-col-foul">${totalFoul}</td>
          <td class="bsk-col-tech">${totalTech}</td>
        </tr>`;

        html += `</tbody></table></div></div>`;
      });

      html += `</div></div>`;
    }

    // — Historia zdarzeń (filtruj "period" i "system")
    const SKIP_TYPES = ["period","system"];
    const eventLogs = logs.filter(log => !SKIP_TYPES.includes((log.action_type||"").toLowerCase()));

    if (eventLogs.length) {
      const ACTION_DEF = {
        "point":   { cls: "bsk-ev-basket",  label: "Kosz"           },
        "foul":    { cls: "bsk-ev-foul",    label: "Faul"           },
        "timeout": { cls: "bsk-ev-timeout", label: "Przerwa"        },
        "sub":     { cls: "bsk-ev-sub",     label: "Zmiana"         },
        "info":    { cls: "bsk-ev-info",    label: "Info"           },
      };

      const getActionDef = type => {
        const t = (type||"").toLowerCase();
        // Dokładne dopasowanie najpierw
        if (ACTION_DEF[t]) return ACTION_DEF[t];
        // Faul techniczny
        if (t === "foul" || t.includes("foul")) {
          return { cls: "bsk-ev-foul", label: "Faul" };
        }
        for (const [key, def] of Object.entries(ACTION_DEF)) {
          if (t.includes(key)) return def;
        }
        return { cls: "bsk-ev-info", label: type || "Info" };
      };

      // Deduplikacja logów — po id (logi są zduplikowane przez JOIN z playerStats)
      const seen = new Set();
      const uniqueLogs = eventLogs.filter(log => {
        if (seen.has(log.id)) return false;
        seen.add(log.id);
        return true;
      });

      html += `<div class="sched-det-section">
        <div class="sched-det-title">&#x25c6; Historia zdarze&#x144;</div>
        <div class="bsk-events-list">`;

      uniqueLogs.forEach(log => {
        const def = getActionDef(log.action_type);
        // Rozpoznaj faul techniczny po opisie
        const isTech = (log.description||"").toLowerCase().includes("techniczny");
        const defFinal = isTech ? { cls: "bsk-ev-tech", label: "Faul tech." } : def;

        // Wyciągnij wynik aktualny z opisu np. "+2pkt: Test1 Test1 (ZPW 2B) → 24"
        const arrowMatch = log.description.match(/→\s*(\d+)\s*$/);
        const currentScore = arrowMatch ? arrowMatch[1] : null;
        const descClean = arrowMatch
          ? log.description.slice(0, log.description.lastIndexOf("→")).trim()
          : log.description;

        html += `<div class="bsk-ev-row ${defFinal.cls}">
          <span class="bsk-ev-pill">${defFinal.label}</span>
          <span class="bsk-ev-desc">${descClean}</span>
          ${currentScore ? `<span class="bsk-ev-score">→ ${currentScore}</span>` : ""}
        </div>`;
      });

      html += `</div></div>`;
    }


  } else if (isVolley && played) {
    // ══════════════════════════════════════════════════════════════════════
    // SIATKÓWKA — rozegrany mecz
    // ══════════════════════════════════════════════════════════════════════
    const scoreT1 = Number(m.score_t1 ?? 0);   // liczba setów wygranych
    const scoreT2 = Number(m.score_t2 ?? 0);
    const winner  = scoreT1 > scoreT2 ? 1 : scoreT2 > scoreT1 ? 2 : 0;
    const logs    = serverLogs || [];

    // Odczyt __vb z referee_notes (role zawodników, czas setów)
    let vbExt = {};
    try { vbExt = JSON.parse(m.referee_notes || m.referee_note || "{}") || {}; } catch {}
    const vb = vbExt.__vb || {};
    const playersT1 = vb.players_t1 || {};  // { [pid]: { jersey, func } }
    const playersT2 = vb.players_t2 || {};
    const lineupT1  = vb.lineup_t1  || {};  // { [pid]: 0|1 }
    const lineupT2  = vb.lineup_t2  || {};
    const setData   = vb.set_data   || [];  // [ { set_number, duration_min, to_t1, subs_t1, to_t2, subs_t2 } ]

    // Limity (z set_data lub domyślne)
    const maxTO   = 2;
    const maxSubs = 6;

    // ─ Informacje o meczu ──────────────────────────────────────────────
    html += `
      <div class="sched-det-section bsk-info-section">
        <div class="sched-det-title">&#x25a0; Informacje o meczu</div>
        <div class="sched-det-grid">
          <div class="sched-det-item"><div class="sched-det-label">Data</div><div class="sched-det-val">${fmtDate(m.match_date)}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Godzina</div><div class="sched-det-val">${fmtTime(m.match_time)||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Boisko</div><div class="sched-det-val">${m.court||m.location||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Rodzaj</div><div class="sched-det-val">${m.match_type === "puchar" ? "Puchar" + (m.cup_round ? " · " + m.cup_round : "") : "Liga"}</div></div>
        </div>
      </div>
    `;

    // ─ Wynik końcowy ───────────────────────────────────────────────────
    html += `
      <div class="sched-det-section">
        <div class="bsk-final-score">
          <div class="bsk-final-team ${winner===1?"bsk-final-win":winner===2?"bsk-final-lose":""}">
            <div class="bsk-final-name">${m.team1_name}</div>
            <div class="bsk-final-num">${scoreT1}</div>
            <div class="bsk-final-sub">setów</div>
            ${winner===1?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
          <div class="bsk-final-vs">
            <div class="bsk-final-sep">:</div>
            <div class="bsk-final-label">Wynik ko&#x144;cowy</div>
          </div>
          <div class="bsk-final-team ${winner===2?"bsk-final-win":winner===1?"bsk-final-lose":""}">
            <div class="bsk-final-num">${scoreT2}</div>
            <div class="bsk-final-sub">setów</div>
            <div class="bsk-final-name">${m.team2_name}</div>
            ${winner===2?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
        </div>
      </div>
    `;

    // ─ Tabela setów ────────────────────────────────────────────────────
    if (sets?.length) {
      const ROMAN = ["I","II","III","IV","V"];
      const isTB  = i => i === sets.length - 1 && sets.length >= 3 && sets[i].points_t1 <= 20 && sets[i].points_t2 <= 20;

      // Scal to/subs z Volleyball_Sets (DB) — te są source of truth
      html += `
        <div class="sched-det-section">
          <div class="sched-det-title">&#x25a1; Wyniki setów</div>
          <div class="vb-sets-legend">(C – kapitan, format przerw/zmian: użyte / max)</div>
          <div class="bsk-quarters-wrap">
            <table class="bsk-q-table vb-q-table">
              <colgroup>
                <col class="bsk-qcol-label">
                <col class="bsk-qcol-score">
                <col class="bsk-qcol-stat"><col class="bsk-qcol-stat">
                <col class="bsk-qcol-stat"><col class="bsk-qcol-stat">
              </colgroup>
              <thead>
                <tr class="bsk-q-head-top">
                  <th rowspan="2" class="bsk-q-th-kwarta">Set</th>
                  <th rowspan="2" class="bsk-q-th-wynik">Wynik</th>
                  <th colspan="2" class="bsk-q-th-team bsk-q-th-t1 ${winner===1?"bsk-q-th-win":""}">${m.team1_name}</th>
                  <th colspan="2" class="bsk-q-th-team bsk-q-th-t2 ${winner===2?"bsk-q-th-win":""}">${m.team2_name}</th>
                </tr>
                <tr class="bsk-q-head-sub">
                  <th class="bsk-q-th-sub">Przerwy</th>
                  <th class="bsk-q-th-sub">Zmiany</th>
                  <th class="bsk-q-th-sub">Przerwy</th>
                  <th class="bsk-q-th-sub">Zmiany</th>
                </tr>
              </thead>
              <tbody>
                ${sets.map((s, i) => {
                  const w = s.points_t1 > s.points_t2 ? 1 : s.points_t1 < s.points_t2 ? 2 : 0;
                  const tb = isTB(i);
                  const scoreHtml = `<span class="${w===1?"bsk-q-s-win":w===2?"bsk-q-s-lose":""}">${s.points_t1}</span><span class="bsk-q-s-sep"> : </span><span class="${w===2?"bsk-q-s-win":w===1?"bsk-q-s-lose":""}">${s.points_t2}</span>`;
                  const fmt = (v, max) => `<span class="vb-stat-cell">${v ?? 0}<span class="vb-stat-max">/${max}</span></span>`;
                  const dur = setData[i]?.duration_min;
                  const durHtml = dur ? `<span class="vb-set-dur">${dur} min</span>` : "";
                  return `<tr class="bsk-q-row${tb?" vb-row-tb":""}">
                    <td class="bsk-q-td-label">${tb ? "TB" : (ROMAN[i] ?? `Set ${i+1}`)}&nbsp;${durHtml}</td>
                    <td class="bsk-q-td-score">${scoreHtml}</td>
                    <td class="bsk-q-td-stat">${fmt(s.to_t1,   maxTO)}</td>
                    <td class="bsk-q-td-stat">${fmt(s.subs_t1, maxSubs)}</td>
                    <td class="bsk-q-td-stat">${fmt(s.to_t2,   maxTO)}</td>
                    <td class="bsk-q-td-stat">${fmt(s.subs_t2, maxSubs)}</td>
                  </tr>`;
                }).join("")}
              </tbody>
              <tfoot>
                <tr class="bsk-q-foot">
                  <td class="bsk-q-td-label bsk-q-foot-label">Wynik ko&#x144;cowy</td>
                  <td class="bsk-q-td-score bsk-q-foot-score">
                    <span class="${winner===1?"bsk-q-s-win-final":""}">${scoreT1}</span>
                    <span class="bsk-q-s-sep"> : </span>
                    <span class="${winner===2?"bsk-q-s-win-final":""}">${scoreT2}</span>
                  </td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${sets.reduce((a,s)=>a+(s.to_t1||0),0)}/${maxTO*sets.length}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${sets.reduce((a,s)=>a+(s.subs_t1||0),0)}/${maxSubs*sets.length}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${sets.reduce((a,s)=>a+(s.to_t2||0),0)}/${maxTO*sets.length}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${sets.reduce((a,s)=>a+(s.subs_t2||0),0)}/${maxSubs*sets.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="foot-table-note">Przerwy max: ${maxTO} | Zmiany max: ${maxSubs}</div>
        </div>
      `;
    }

    // ─ Składy drużyn ──────────────────────────────────────────────────
    if (playerStats?.length) {
      html += `
        <div class="sched-det-section">
          <div class="sched-det-title">&#x25b7; Sk&#x142;ady dru&#x17c;yn</div>
          <div class="vb-squads-note">(C – kapitan, L – libero)</div>
          <div class="vb-squads-grid">
      `;

      [m.team1_name, m.team2_name].forEach(teamName => {
        const teamId  = teamName === m.team1_name ? m.team1_id : m.team2_id;
        const players = playerStats.filter(s => s.team_name === teamName);
        if (!players.length) return;
        const isWin  = (teamName === m.team1_name && winner === 1) ||
                       (teamName === m.team2_name && winner === 2);
        const roles  = teamName === m.team1_name ? playersT1 : playersT2;
        const lineup = teamName === m.team1_name ? lineupT1 : lineupT2;

        const sorted = [...players].sort((a,b) => {
          // Kapitan pierwszy, potem nr koszulki, potem nazwisko
          const ra = roles[String(a.player_id)] || {};
          const rb = roles[String(b.player_id)] || {};
          const capA = (ra.func === "C" || a.is_captain) ? 0 : 1;
          const capB = (rb.func === "C" || b.is_captain) ? 0 : 1;
          if (capA !== capB) return capA - capB;
          const jA = parseInt(ra.jersey) || 999;
          const jB = parseInt(rb.jersey) || 999;
          if (jA !== jB) return jA - jB;
          return (a.last_name||"").localeCompare(b.last_name||"");
        });

        html += `
          <div class="vb-squad-block ${isWin?"vb-squad-block--win":""}">
            <div class="vb-squad-header">
              <span class="vb-squad-name">${teamName}</span>
              <span class="vb-squad-score ${isWin?"vb-squad-score--win":""}">${teamName===m.team1_name?scoreT1:scoreT2} setów</span>
            </div>
            <table class="vb-squad-table">
              <thead><tr>
                <th class="vb-col-nr">Nr</th>
                <th class="vb-col-name">Imię i nazwisko</th>
                <th class="vb-col-func" title="Funkcja">Funkcja</th>
              </tr></thead>
              <tbody>
        `;

        sorted.forEach((s, idx) => {
          const pid    = String(s.player_id);
          const role   = roles[pid] || {};
          const func   = role.func || (s.is_captain ? "C" : "");
          const jersey = role.jersey || "";
          const nr     = jersey || (idx + 1);
          const pts    = s.total_points_in_match ?? 0;
          const benched = lineup[pid] === 0;
          const funcBadge = func === "C"
            ? `<span class="vb-func-badge vb-func-c">C</span>`
            : func === "L"
            ? `<span class="vb-func-badge vb-func-l">L</span>`
            : "";
          const rowCls = [
            func === "C" ? "vb-row-captain" : "",
            func === "L" ? "vb-row-libero"  : "",
            benched      ? "vb-row-bench"   : "",
          ].filter(Boolean).join(" ");

          html += `<tr class="${rowCls}">
            <td class="vb-col-nr">${nr}</td>
            <td class="vb-col-name">${s.first_name} ${s.last_name}${benched ? ' <span class="vb-bench-tag">ławka</span>' : ""}</td>
            <td class="vb-col-func">${funcBadge}</td>
          </tr>`;
        });

        const totalPts = sorted.reduce((a,p)=>a+(p.total_points_in_match??0),0);
        html += `<tr class="vb-row-total">
          <td colspan="2" class="bsk-total-label">Łącznie: ${sorted.length} zawodników</td>
          <td></td>
        </tr>`;

        html += `</tbody></table></div>`;
      });

      html += `</div></div>`;
    }

    // ─ Historia zdarzeń ────────────────────────────────────────────────
    const VB_SKIP = ["period","system"];
    const vbLogs  = logs.filter(log => !VB_SKIP.includes((log.action_type||"").toLowerCase()));

    if (vbLogs.length) {
      const VB_ACTION_DEF = {
        "point":    { cls: "bsk-ev-basket",  label: "Punkt"     },
        "timeout":  { cls: "bsk-ev-timeout", label: "Przerwa"   },
        "sub":      { cls: "bsk-ev-sub",     label: "Zmiana"    },
        "foul":     { cls: "bsk-ev-foul",    label: "Faul"      },
        "info":     { cls: "bsk-ev-info",    label: "Info"      },
      };
      const getVbDef = type => {
        const t = (type||"").toLowerCase();
        for (const [key, def] of Object.entries(VB_ACTION_DEF)) {
          if (t.includes(key)) return def;
        }
        return { cls: "bsk-ev-info", label: type || "Info" };
      };

      const seen = new Set();
      const uniqueVbLogs = vbLogs.filter(log => {
        if (seen.has(log.id)) return false;
        seen.add(log.id);
        return true;
      });

      html += `<div class="sched-det-section">
        <div class="sched-det-title">&#x25c6; Historia zdarze&#x144;</div>
        <div class="bsk-events-list">`;

      uniqueVbLogs.forEach(log => {
        const def = getVbDef(log.action_type);
        const arrowMatch = (log.description||"").match(/→\s*(\d+)\s*$/);
        const currentScore = arrowMatch ? arrowMatch[1] : null;
        const descClean = arrowMatch
          ? log.description.slice(0, log.description.lastIndexOf("→")).trim()
          : log.description;
        html += `<div class="bsk-ev-row ${def.cls}">
          <span class="bsk-ev-pill">${def.label}</span>
          <span class="bsk-ev-desc">${descClean}</span>
          ${currentScore ? `<span class="bsk-ev-score">→ ${currentScore}</span>` : ""}
        </div>`;
      });

      html += `</div></div>`;
    }

  } else if (isFoot && played) {
    // ══════════════════════════════════════════════════════════════════════
    // PIŁKA NOŻNA — rozegrany mecz
    // ══════════════════════════════════════════════════════════════════════
    const scoreT1 = Number(m.score_t1 ?? 0);
    const scoreT2 = Number(m.score_t2 ?? 0);
    const hasPen  = serverPenaltyScore != null;
    const penScore = serverPenaltyScore;
    const footParts = serverFootParts || [];
    const logs = serverLogs || [];

    // Wynik z uwzględnieniem karnych
    const effT1 = hasPen ? penScore.t1 : scoreT1;
    const effT2 = hasPen ? penScore.t2 : scoreT2;
    const winner = effT1 > effT2 ? 1 : effT2 > effT1 ? 2 : 0;

    // — Podstawowe informacje
    html += `
      <div class="sched-det-section bsk-info-section">
        <div class="sched-det-title">&#x25a0; Informacje o meczu</div>
        <div class="sched-det-grid">
          <div class="sched-det-item"><div class="sched-det-label">Data</div><div class="sched-det-val">${fmtDate(m.match_date)}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Godzina</div><div class="sched-det-val">${fmtTime(m.match_time)||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Boisko</div><div class="sched-det-val">${m.court||"—"}</div></div>
          <div class="sched-det-item"><div class="sched-det-label">Rodzaj</div><div class="sched-det-val">${m.match_type === "puchar" ? "Puchar" + (m.cup_round ? " · " + m.cup_round : "") : "Liga"}</div></div>
        </div>
      </div>
    `;

    // — Wynik końcowy
    html += `
      <div class="sched-det-section">
        <div class="bsk-final-score">
          <div class="bsk-final-team ${winner===1?"bsk-final-win":winner===2?"bsk-final-lose":""}">
            <div class="bsk-final-name">${m.team1_name}</div>
            <div class="bsk-final-num">${scoreT1}</div>
            ${hasPen ? `<div class="foot-pen-sub">(karne ${penScore.t1})</div>` : ""}
            ${winner===1?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
          <div class="bsk-final-vs">
            <div class="bsk-final-sep">:</div>
            <div class="bsk-final-label">${hasPen?"po karnych":"Wynik końcowy"}</div>
          </div>
          <div class="bsk-final-team ${winner===2?"bsk-final-win":winner===1?"bsk-final-lose":""}">
            <div class="bsk-final-num">${scoreT2}</div>
            ${hasPen ? `<div class="foot-pen-sub">(karne ${penScore.t2})</div>` : ""}
            <div class="bsk-final-name">${m.team2_name}</div>
            ${winner===2?'<div class="bsk-final-badge">Zwycięzca</div>':''}
          </div>
        </div>
      </div>
    `;

    // — Tabela części gry (połowy + dogrywka)
    if (footParts.length) {
      html += `
        <div class="sched-det-section">
          <div class="sched-det-title">&#x25a1; Wynik meczu</div>
          <div class="bsk-quarters-wrap">
            <table class="bsk-q-table">
              <colgroup>
                <col class="bsk-qcol-label">
                <col class="bsk-qcol-score">
                <col class="bsk-qcol-stat">
                <col class="bsk-qcol-stat">
              </colgroup>
              <thead>
                <tr class="bsk-q-head-top">
                  <th class="bsk-q-th-kwarta">Część meczu</th>
                  <th class="bsk-q-th-wynik">Wynik</th>
                  <th class="bsk-q-th-team bsk-q-th-t1 ${winner===1?"bsk-q-th-win":""}">${m.team1_name} — Zmiany</th>
                  <th class="bsk-q-th-team bsk-q-th-t2 ${winner===2?"bsk-q-th-win":""}">${m.team2_name} — Zmiany</th>
                </tr>
              </thead>
              <tbody>
                ${footParts.map(r => {
                  const w = r.t1 > r.t2 ? 1 : r.t1 < r.t2 ? 2 : 0;
                  const scoreHtml = `<span class="${w===1?"bsk-q-s-win":w===2?"bsk-q-s-lose":""}">${r.t1}</span><span class="bsk-q-s-sep"> : </span><span class="${w===2?"bsk-q-s-win":w===1?"bsk-q-s-lose":""}">${r.t2}</span>`;
                  return `<tr class="bsk-q-row">
                    <td class="bsk-q-td-label">${r.label}</td>
                    <td class="bsk-q-td-score">${scoreHtml}</td>
                    <td class="bsk-q-td-stat"><span class="${r.zm1===0?"bsk-q-zero":""}">${r.zm1}</span></td>
                    <td class="bsk-q-td-stat"><span class="${r.zm2===0?"bsk-q-zero":""}">${r.zm2}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
              <tfoot>
                <tr class="bsk-q-foot">
                  <td class="bsk-q-td-label bsk-q-foot-label">Wynik końcowy</td>
                  <td class="bsk-q-td-score bsk-q-foot-score">
                    <span class="${winner===1?"bsk-q-s-win-final":""}">${scoreT1}</span>
                    <span class="bsk-q-s-sep"> : </span>
                    <span class="${winner===2?"bsk-q-s-win-final":""}">${scoreT2}</span>
                  </td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${footParts.reduce((a,r)=>a+r.zm1,0)}</td>
                  <td class="bsk-q-td-stat bsk-q-foot-stat">${footParts.reduce((a,r)=>a+r.zm2,0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="foot-table-note">Zmiany = liczba zmian wykonanych w danej części gry</div>
        </div>
      `;
    }

    // — Rzuty karne (jeśli były)
    if (hasPen) {
      // Spróbuj odczytać szczegółowe dane strzałów z __fb w referee_notes
      let fbExt = {};
      try { fbExt = JSON.parse(m.referee_notes || m.referee_note || "{}") || {}; } catch {}
      const fb = fbExt.__fb || {};
      const pkKicks1 = Array.isArray(fb.pk_t1) ? fb.pk_t1 : [];
      const pkKicks2 = Array.isArray(fb.pk_t2) ? fb.pk_t2 : [];
      const gkName1  = fb.gk_t1 || null;
      const gkName2  = fb.gk_t2 || null;
      const hasDetailedData = pkKicks1.length > 0 || pkKicks2.length > 0;

      // Funkcja renderująca blok jednej drużyny
      const penBlock = (kicks, gkName, teamName, teamScore, isWinner) => {
        // Wizualne kropki (jedna na każdy strzał)
        const dots = kicks.map((k, i) => {
          const hit = k.result === "hit";
          const sd  = k.isSuddenDeath ? " pk-dot-sd" : "";
          return `<div class="pk2-dot${hit ? " pk2-dot--hit" : " pk2-dot--miss"}${sd}" title="${k.shooterName || ""}: ${hit ? "Trafiony" : "Niecelny"}">
            ${hit ? "⚽" : "✕"}
          </div>`;
        }).join("");

        const scored = kicks.filter(k => k.result === "hit").length;
        const total  = kicks.length;

        // Lista strzelców
        const shooterRows = kicks.map((k, i) => {
          const hit = k.result === "hit";
          const sd  = k.isSuddenDeath ? `<span class="pk2-sd-badge">SD</span>` : "";
          return `<div class="pk2-shooter-row${hit ? " pk2-shooter--hit" : " pk2-shooter--miss"}">
            <span class="pk2-shooter-nr">${i + 1}</span>
            <span class="pk2-shooter-icon">${hit ? "⚽" : "<span class='pk2-miss-x'>✕</span>"}</span>
            <span class="pk2-shooter-name">${k.shooterName || "—"}</span>
            ${sd}
            <span class="pk2-shooter-result${hit ? " pk2-res-hit" : " pk2-res-miss"}">${hit ? "Trafiony" : "Niecelny"}</span>
          </div>`;
        }).join("");

        const gkRow = gkName
          ? `<div class="pk2-gk-row">🥅 <span class="pk2-gk-label">Bramkarz:</span> <strong>${gkName}</strong></div>`
          : "";

        return `<div class="pk2-block${isWinner ? " pk2-block--win" : ""}">
          <div class="pk2-block-header">
            <span class="pk2-block-team">${teamName}</span>
            <span class="pk2-block-score${isWinner ? " pk2-block-score--win" : ""}">${teamScore} <span class="pk2-block-score-lbl">traf.</span></span>
          </div>
          <div class="pk2-dots-row">${dots || '<span class="pk2-no-data">brak danych</span>'}</div>
          ${gkRow}
          <div class="pk2-shooters-list">${shooterRows || '<div class="pk2-no-data">brak szczegółów</div>'}</div>
          <div class="pk2-summary">${scored} / ${total} trafionych</div>
        </div>`;
      };

      const pkWinner1 = penScore.t1 > penScore.t2;
      const pkWinner2 = penScore.t2 > penScore.t1;

      html += `
        <div class="sched-det-section pk2-section">
          <div class="sched-det-title">&#x25c7; Rzuty karne</div>
          <div class="pk2-scoreboard">
            <span class="pk2-sb-team${pkWinner1 ? " pk2-sb-team--win" : ""}">${m.team1_name}</span>
            <span class="pk2-sb-score">
              <span class="pk2-sb-num${pkWinner1 ? " pk2-sb-num--win" : ""}">${penScore.t1}</span>
              <span class="pk2-sb-sep">:</span>
              <span class="pk2-sb-num${pkWinner2 ? " pk2-sb-num--win" : ""}">${penScore.t2}</span>
            </span>
            <span class="pk2-sb-team${pkWinner2 ? " pk2-sb-team--win" : ""}">${m.team2_name}</span>
          </div>
          ${pkWinner1 || pkWinner2 ? `<div class="pk2-winner-banner">🏆 Wygrywa: <strong>${pkWinner1 ? m.team1_name : m.team2_name}</strong></div>` : ""}
          <div class="pk2-grid">
            ${penBlock(pkKicks1, gkName1, m.team1_name, penScore.t1, pkWinner1)}
            ${penBlock(pkKicks2, gkName2, m.team2_name, penScore.t2, pkWinner2)}
          </div>
        </div>
      `;
    }

    // — Składy drużyn
    if (playerStats?.length) {
      html += `<div class="sched-det-section">
        <div class="sched-det-title">&#x25b7; Sk&#x142;ady dru&#x17c;yn</div>
        <div class="bsk-squads-grid">`;

      [m.team1_name, m.team2_name].forEach(teamName => {
        const players = playerStats.filter(s => s.team_name === teamName);
        if (!players.length) return;
        const isWin = (teamName === m.team1_name && winner === 1) ||
                      (teamName === m.team2_name && winner === 2);
        const teamScore = teamName === m.team1_name ? scoreT1 : scoreT2;

        const sorted = [...players].sort((a,b) => {
          if (b.is_captain !== a.is_captain) return b.is_captain - a.is_captain;
          return (b.total_points_in_match ?? 0) - (a.total_points_in_match ?? 0);
        });

        html += `
          <div class="bsk-squad-block ${isWin?"bsk-squad-block--win":"bsk-squad-block--lose"}">
            <div class="bsk-squad-title">
              <span class="bsk-squad-name">${teamName}</span>
              <span class="bsk-squad-score ${isWin?"bsk-squad-score--win":"bsk-squad-score--lose"}">${teamScore} goli</span>
            </div>
            <div class="bsk-squad-table-wrap">
              <table class="sched-det-table bsk-squad-table">
                <thead><tr>
                  <th class="bsk-col-nr">Nr</th>
                  <th class="bsk-col-name">Imi&#x119; i nazwisko</th>
                  <th class="foot-col-goals" title="Gole">Gole</th>
                  <th class="foot-col-yellow" title="Żółte kartki"><span class="foot-hdr-yellow-badge">🟨</span></th>
                  <th class="foot-col-red" title="Czerwona kartka"><span class="foot-hdr-red-badge">🟥</span></th>
                </tr></thead>
                <tbody>`;

        sorted.forEach((s, idx) => {
          const goals  = s.total_points_in_match ?? 0;
          const yellow = s.yellow_cards ?? 0;
          const red    = s.red_card ? 1 : 0;
          const rowCls = s.is_captain ? "bsk-row-captain" : "";

          html += `<tr class="${rowCls}">
            <td class="bsk-col-nr">${idx + 1}</td>
            <td class="bsk-col-name">${s.is_captain ? '<span class="captain-badge">K</span>&nbsp;' : ""}${s.first_name} ${s.last_name}</td>
            <td class="foot-col-goals">${goals > 0 ? `<strong>${goals}</strong>` : "—"}</td>
            <td class="foot-col-yellow">${yellow > 0 ? `<span class="foot-yellow-badge">${yellow}</span>` : "—"}</td>
            <td class="foot-col-red">${red ? '<span class="foot-red-badge">&#x25a0;</span>' : "—"}</td>
          </tr>`;
        });

        const totalGoals  = sorted.reduce((a,p) => a+(p.total_points_in_match??0), 0);
        const totalYellow = sorted.reduce((a,p) => a+(p.yellow_cards??0), 0);
        const totalRed    = sorted.reduce((a,p) => a+(p.red_card?1:0), 0);
        html += `<tr class="bsk-row-total">
          <td colspan="2" class="bsk-total-label">Łącznie</td>
          <td class="foot-col-goals">${totalGoals}</td>
          <td class="foot-col-yellow">${totalYellow || "—"}</td>
          <td class="foot-col-red">${totalRed || "—"}</td>
        </tr>`;

        html += `</tbody></table></div></div>`;
      });

      html += `</div></div>`;
    }

    // — Historia zdarzeń
    const FOOT_SKIP = ["period","system"];
    const footEventLogs = logs.filter(log => !FOOT_SKIP.includes((log.action_type||"").toLowerCase()));

    if (footEventLogs.length) {
      const FOOT_ACTION_DEF = {
        "goal":    { cls: "bsk-ev-basket",  label: "Gol"         },
        "gol":     { cls: "bsk-ev-basket",  label: "Gol"         },
        "foul":    { cls: "bsk-ev-foul",    label: "Faul"        },
        "yellow":  { cls: "bsk-ev-timeout", label: "Żółta"       },
        "card":    { cls: "bsk-ev-timeout", label: "Kartka"      },
        "red":     { cls: "bsk-ev-tech",    label: "Czerwona"    },
        "sub":     { cls: "bsk-ev-sub",     label: "Zmiana"      },
        "zmiana":  { cls: "bsk-ev-sub",     label: "Zmiana"      },
        "penalty": { cls: "bsk-ev-3pt",     label: "Karny"       },
        "karny":   { cls: "bsk-ev-3pt",     label: "Karny"       },
        "info":    { cls: "bsk-ev-info",    label: "Info"        },
      };
      const getFootDef = type => {
        const t = (type||"").toLowerCase();
        for (const [key, def] of Object.entries(FOOT_ACTION_DEF)) {
          if (t.includes(key)) return def;
        }
        return { cls: "bsk-ev-info", label: type || "Info" };
      };

      const seen = new Set();
      const uniqueLogs = footEventLogs.filter(log => {
        if (seen.has(log.id)) return false;
        seen.add(log.id);
        return true;
      });

      html += `<div class="sched-det-section">
        <div class="sched-det-title">&#x25c6; Historia zdarze&#x144;</div>
        <div class="bsk-events-list">`;

      uniqueLogs.forEach(log => {
        const def = getFootDef(log.action_type);
        const arrowMatch = (log.description||"").match(/→\s*(\d+)\s*$/);
        const currentScore = arrowMatch ? arrowMatch[1] : null;
        const descClean = arrowMatch
          ? log.description.slice(0, log.description.lastIndexOf("→")).trim()
          : log.description;

        html += `<div class="bsk-ev-row ${def.cls}">
          <span class="bsk-ev-pill">${def.label}</span>
          <span class="bsk-ev-desc">${descClean}</span>
          ${currentScore ? `<span class="bsk-ev-score">→ ${currentScore}</span>` : ""}
        </div>`;
      });

      html += `</div></div>`;
    }

  } else {
    // ══════════════════════════════════════════════════════════════════════
    // POZOSTAŁE DYSCYPLINY / NIEZAGRANY MECZ
    // ══════════════════════════════════════════════════════════════════════

    if (m.status === "Planowany") {
      // ── Mecz planowany — tylko 4 pola, zajmują 100% szerokości ──────────
      html += `
        <div class="sched-det-section">
          <div class="sched-planned-grid">
            <div class="sched-planned-item">
              <div class="sched-planned-label">Data</div>
              <div class="sched-planned-val">${fmtDate(m.match_date)}</div>
            </div>
            <div class="sched-planned-item">
              <div class="sched-planned-label">Godzina</div>
              <div class="sched-planned-val">${fmtTime(m.match_time)||"—"}</div>
            </div>
            <div class="sched-planned-item">
              <div class="sched-planned-label">Miejsce rozgrywek</div>
              <div class="sched-planned-val">${m.location || m.court || "—"}</div>
            </div>
            <div class="sched-planned-item">
              <div class="sched-planned-label">Rodzaj meczu</div>
              <div class="sched-planned-val">${m.match_type === "puchar" ? "Puchar" + (m.cup_round ? " · " + m.cup_round : "") : "Liga"}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // ── Mecz rozegrany lub inny status — pełny widok ─────────────────────
      html += `
        <div class="sched-det-section">
          <div class="sched-det-title">&#x25a0; Szczeg&oacute;&lstrok;y meczu</div>
          <div class="sched-det-grid">
            <div class="sched-det-item"><div class="sched-det-label">Data</div><div class="sched-det-val">${fmtDate(m.match_date)}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Godzina</div><div class="sched-det-val">${fmtTime(m.match_time)||"—"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Boisko</div><div class="sched-det-val">${m.court||"—"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Obiekt</div><div class="sched-det-val">${m.location||"—"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Rodzaj</div><div class="sched-det-val">${m.match_type === "puchar" ? "Puchar" + (m.cup_round ? " · " + m.cup_round : "") : "Liga"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Czas gry</div><div class="sched-det-val">${m.duration_min ? m.duration_min + " min" : "—"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Sędzia</div><div class="sched-det-val">${m.referee_name||"—"}</div></div>
            <div class="sched-det-item"><div class="sched-det-label">Protokolant</div><div class="sched-det-val">${m.clerk_name||"—"}</div></div>
          </div>
        </div>
      `;
    }

    // Sety i statystyki tylko dla meczów innych niż Planowany
    if (m.status !== "Planowany") {

    // — Sety (siatkówka)
    if (sets?.length) {
      html += `<div class="sched-det-section"><div class="sched-det-title">&#x25cb; Sety</div><div class="sched-sets-row">`;
      sets.forEach(s => {
        const t1w = s.points_t1 > s.points_t2;
        html += `<div class="sched-set-card">
          <div class="sched-set-num">Set ${s.set_number}</div>
          <div class="sched-set-result">
            <span class="${t1w?"sched-set-win":"sched-set-lose"}">${s.points_t1}</span>
            <span class="sched-set-colon">:</span>
            <span class="${!t1w?"sched-set-win":"sched-set-lose"}">${s.points_t2}</span>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }

    // — Statystyki drużyn
    if (teamStats?.length) {
      html += `<div class="sched-det-section"><div class="sched-det-title">&#x25a1; Statystyki dru&#x17c;yn</div>
        <table class="sched-det-table"><thead><tr>
          <th>Drużyna</th><th>Zmiany</th><th>T-outy</th><th>Faule</th>
        </tr></thead><tbody>`;
      teamStats.forEach(ts => {
        html += `<tr>
          <td><strong>${ts.team_name}</strong></td>
          <td>${ts.substitutions_used ?? "—"}</td>
          <td>${ts.timeouts_taken ?? "—"}</td>
          <td>${ts.team_fouls_count ?? "—"}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // — Statystyki zawodników
    if (playerStats?.length) {
      html += `<div class="sched-det-section"><div class="sched-det-title">&#x25b7; Zawodnicy</div>
        <table class="sched-det-table"><thead><tr>
          <th>Zawodnik</th><th>Dru&#x17c;yna</th><th>Pkt</th>
          ${isFoot ? "<th>&#x25a8;</th><th>&#x25a0;</th>" : ""}
          ${isBask ? "<th>1pt</th><th>2pt</th><th>3pt</th><th>Faule</th>" : ""}
        </tr></thead><tbody>`;
      playerStats.forEach(s => {
        html += `<tr>
          <td>${s.is_captain ? '<span class="captain-badge">K</span> ' : ""}${s.first_name} ${s.last_name}</td>
          <td style="color:var(--muted)">${s.team_name}</td>
          <td><strong>${s.total_points_in_match ?? 0}</strong></td>
          ${isFoot ? `<td>${s.yellow_cards ?? 0}</td><td>${s.red_card ? "&#x25a0;" : "&#x2014;"}</td>` : ""}
          ${isBask ? `<td>${s.points_1pt ?? 0}</td><td>${s.points_2pt ?? 0}</td><td>${s.points_3pt ?? 0}</td><td>${s.personal_fouls ?? 0}</td>` : ""}
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // — Notatki sędziego
    if (m.referee_notes || m.referee_note) {
      html += `<div class="sched-det-section"><div class="sched-det-title">&#x2261; Notatki s&#x119;dziego</div>
        <p class="sched-det-note">${m.referee_notes || m.referee_note}</p></div>`;
    }

    } // end if (m.status !== "Planowany")
  }

  html += `</div>`;
  return html;
}

function scoreWinner(s1, s2, sh1, sh2, side) {
  const a = sh1 !== null ? sh1 : s1;
  const b = sh2 !== null ? sh2 : s2;
  if (side === "t1") return a > b ? "sched-score-num--win" : a < b ? "sched-score-num--lose" : "";
  return b > a ? "sched-score-num--win" : b < a ? "sched-score-num--lose" : "";
}

/* ════════════════════════════════════════════════════════════════════════════
   WYNIKI — tabela ligowa (pełna, per dyscyplina) + drabinka pucharowa SVG
════════════════════════════════════════════════════════════════════════════ */

// Pomocnicza: znak bilansu
function signVal(v) { return v > 0 ? `+${v}` : String(v); }
function bilCls(v)  { return v > 0 ? "sv-td-pos-gd" : v < 0 ? "sv-td-neg-gd" : ""; }

async function loadWyniki() {
  const disc = activeDiscipline;
  const fmt  = formatFor(disc);
  const c    = $("wyniki-list"); c.innerHTML = "";

  const tabs = [];
  if (fmt.has_league) tabs.push({ id:"liga",    label:"📊 Tabela ligowa" });
  if (fmt.has_cup)    tabs.push({ id:"puchar",   label:"🏆 Drabinka pucharowa" });
  // Tabela Generalna dostępna przez nawigację w headerze (nie jako zakładka tutaj)

  const body = el("div","sv-wyniki-body");

  const tabBar = el("div","sv-wyniki-tabs");
  tabs.forEach((t, i) => {
    const btn = el("button", `sv-tab${i===0?" active":""}`, t.label);
    // (ranking tab removed — available via header nav)
    btn.dataset.tab = t.id;
    btn.addEventListener("click", () => {
      tabBar.querySelectorAll(".sv-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderWynikiTab(t.id, disc, fmt, body);
    });
    tabBar.appendChild(btn);
  });
  c.appendChild(tabBar);

  c.appendChild(body);

  await renderWynikiTab(tabs[0].id, disc, fmt, body);
}

async function renderWynikiTab(tab, disc, fmt, body) {
  body.innerHTML = `<div class="sv-loading"><div class="sv-loading-spin"></div>Ładowanie…</div>`;

  if (tab === "liga") {
    const standingsData = await DB.getStandings(disc);

    body.innerHTML = "";
    const wrap = el("div","sv-league-wrap");
    wrap.innerHTML = buildLeagueHtml(disc, standingsData, fmt);
    body.appendChild(wrap);

    // Klik w drużynę → profil drużyny
    wrap.querySelectorAll(".sv-td-team[data-team-id]").forEach(td => {
      td.addEventListener("click", (e) => {
        e.stopPropagation();
        openTeamDetail({ id: +td.dataset.teamId });
      });
    });
  }

  if (tab === "puchar") {
    body.innerHTML = "";
    await buildBracket(body, disc);
  }


}

// ── TABELA LIGOWA ─────────────────────────────────────────────────────────────

function buildLeagueHtml(discipline, standingsData, fmt) {
  const isFootball   = discipline === "Piłka Nożna";
  const isVolleyball = discipline === "Siatkówka";
  const hasDraw      = isFootball;
  const hasCup       = !!fmt.has_cup;

  const groupsCount   = Math.max(1, fmt.groups_count   || 1);

  // ── Ile drużyn awansuje ───────────────────────────────────────────────────
  let promotedPerGroup = 0;
  let promoNote = "";
  if (hasCup && fmt.cup_rounds && fmt.cup_rounds.length) {
    const ROUND_ORDER = ["1/16","1/8","1/4","Półfinał","Finał"];
    const sorted = [...fmt.cup_rounds].sort((a,b) =>
      (ROUND_ORDER.indexOf(a)===-1?99:ROUND_ORDER.indexOf(a)) -
      (ROUND_ORDER.indexOf(b)===-1?99:ROUND_ORDER.indexOf(b))
    );
    const firstRoundMatches = Math.pow(2, sorted.length - 1);
    const totalPromoted     = firstRoundMatches * 2;
    promotedPerGroup = Math.ceil(totalPromoted / groupsCount);
    promoNote = `${promotedPerGroup} ${promotedPerGroup===1?"drużyna awansuje":promotedPerGroup<5?"drużyny awansują":"drużyn awansuje"} do pucharu`;
  }

  // ── Dane i grupy ──────────────────────────────────────────────────────────
  const rows          = standingsData?.rows || [];
  const format        = standingsData?.format || {};
  const teamsPerGroup = Math.max(2, fmt.teams_per_group || (rows.length || 4));

  let groups = [];
  if (groupsCount > 1) {
    for (let g = 0; g < groupsCount; g++) {
      groups.push({ name:`Grupa ${String.fromCharCode(65+g)}`, rows: rows.slice(g*teamsPerGroup,(g+1)*teamsPerGroup) });
    }
  } else {
    groups = [{ name: null, rows }];
  }

  // ── Legenda ───────────────────────────────────────────────────────────────
  const fmt2 = format || {};

  const legendItems = isVolleyball ? [
    { key: "M",     desc: "Mecze rozegrane" },
    { key: "W",     desc: "Wygrane mecze" },
    { key: "P",     desc: "Przegrane mecze" },
    { key: "SW",    desc: "Sety wygrane" },
    { key: "SP",    desc: "Sety przegrane" },
    { key: "Bil.S", desc: "Bilans setów (SW − SP)" },
    { key: "P+",    desc: "Małe punkty zdobyte" },
    { key: "P−",    desc: "Małe punkty stracone" },
    { key: "Bil.P", desc: "Bilans małych punktów" },
    { key: "Pkt",   desc: `Punkty ligowe · W=${fmt2.pts_win??3} / P=${fmt2.pts_loss??0}`, accent: true },
  ] : isFootball ? [
    { key: "M",     desc: "Mecze rozegrane" },
    { key: "W",     desc: "Wygrane" },
    { key: "R",     desc: "Remisy", hide: !hasDraw },
    { key: "P",     desc: "Przegrane" },
    { key: "G+",    desc: "Bramki zdobyte" },
    { key: "G−",    desc: "Bramki stracone" },
    { key: "Bil.G", desc: "Bilans bramkowy (G+ − G−)" },
    { key: "Pkt",   desc: `Punkty ligowe · W=${fmt2.pts_win??3}${hasDraw?` / R=${fmt2.pts_draw??1}`:""} / P=${fmt2.pts_loss??0}`, accent: true },
  ] : [
    { key: "M",     desc: "Mecze rozegrane" },
    { key: "W",     desc: "Wygrane" },
    { key: "P",     desc: "Przegrane" },
    { key: "P+",    desc: "Punkty zdobyte" },
    { key: "P−",    desc: "Punkty stracone" },
    { key: "Bil.P", desc: "Bilans punktów (P+ − P−)" },
    { key: "Pkt",   desc: `Punkty ligowe · W=${fmt2.pts_win??2} / P=${fmt2.pts_loss??0}`, accent: true },
  ];

  const legendHtml = `
    <div class="sv-legend-block">
      ${hasCup && promotedPerGroup ? `
        <div class="sv-legend-promo">
          <span class="sv-legend-promo-arrow">▶</span>
          <span>Drużyny oznaczone fioletowym paskiem awansują do pucharu (${promotedPerGroup} z każdej grupy)</span>
        </div>` : ""}
      <div class="sv-legend-title">Objaśnienie kolumn</div>
      <div class="sv-legend-grid">
        ${legendItems.filter(i => !i.hide).map(i => `
          <div class="sv-legend-item">
            <span class="sv-legend-key${i.accent ? " sv-legend-key--accent" : ""}">${i.key}</span>
            <span class="sv-legend-val">${i.desc}</span>
          </div>`).join("")}
      </div>
    </div>`;

  // ── Nagłówki — stałe szerokości kolumn statystycznych ────────────────────
  const COL_STAT   = `style="width:52px;min-width:52px"`;
  const COL_BILANS = `style="width:62px;min-width:62px"`;
  const COL_PTS    = `style="width:56px;min-width:56px"`;
  const COL_POS    = `style="width:38px;min-width:38px"`;
  const COL_TEAM   = `style="width:100px;min-width:70px"`;

  const thead = isVolleyball ? `
    <colgroup>
      <col ${COL_POS}>
      <col ${COL_TEAM}>
      <col ${COL_STAT}><col ${COL_STAT}><col ${COL_STAT}>
      <col ${COL_STAT}><col ${COL_STAT}><col ${COL_BILANS}>
      <col ${COL_STAT}><col ${COL_STAT}><col ${COL_BILANS}>
      <col ${COL_PTS}>
    </colgroup>
    <thead><tr>
      <th class="sv-th-pos" title="#">#</th>
      <th class="sv-th-team">Drużyna</th>
      <th title="Mecze rozegrane">M</th>
      <th title="Wygrane mecze">W</th>
      <th title="Przegrane mecze">P</th>
      <th title="Sety wygrane">SW</th>
      <th title="Sety przegrane">SP</th>
      <th title="Bilans setów" class="sv-th-vb-bil">Bil.S</th>
      <th title="Małe punkty zdobyte">P+</th>
      <th title="Małe punkty stracone">P−</th>
      <th title="Bilans małych punktów" class="sv-th-vb-bil">Bil.P</th>
      <th title="Punkty ligowe" class="sv-th-pts">Pkt</th>
    </tr></thead>` : `
    <colgroup>
      <col ${COL_POS}>
      <col ${COL_TEAM}>
      <col ${COL_STAT}><col ${COL_STAT}>
      ${hasDraw ? `<col ${COL_STAT}>` : ""}
      <col ${COL_STAT}><col ${COL_STAT}><col ${COL_STAT}><col ${COL_BILANS}>
      <col ${COL_PTS}>
    </colgroup>
    <thead><tr>
      <th class="sv-th-pos" title="#">#</th>
      <th class="sv-th-team">Drużyna</th>
      <th title="Mecze rozegrane">M</th>
      <th title="Wygrane">W</th>
      ${hasDraw ? `<th title="Remisy">R</th>` : ""}
      <th title="Przegrane">P</th>
      <th title="${isFootball?"Bramki zdobyte":"Punkty zdobyte"}">${isFootball?"G+":"P+"}</th>
      <th title="${isFootball?"Bramki stracone":"Punkty stracone"}">${isFootball?"G−":"P−"}</th>
      <th title="${isFootball?"Bilans bramkowy":"Bilans punktów"}">${isFootball?"Bil.G":"Bil.P"}</th>
      <th title="Punkty ligowe" class="sv-th-pts">Pkt</th>
    </tr></thead>`;

  // ── Wiersz tabeli ─────────────────────────────────────────────────────────
  function buildRow(r, i) {
    const promoted = hasCup && promotedPerGroup > 0 && i < promotedPerGroup;
    const isLast   = hasCup && promotedPerGroup > 0 && i === promotedPerGroup - 1;
    const medal    = i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`;
    const rowCls   = [
      i===0?"sv-row-1":i===1?"sv-row-2":i===2?"sv-row-3":"",
      promoted?"sv-row-promoted":"",
      isLast?"sv-row-promoted-last":""
    ].filter(Boolean).join(" ");

    // td.sv-td-pos — sticky lewa kolumna #
    const posTd = `<td class="sv-td-pos sv-col-sticky-pos">
      <span class="sv-pos-num">${medal}</span>
      ${promoted?`<span class="sv-promo-arrow" title="Awansuje do pucharu">▶</span>`:""}
    </td>`;
    // td.sv-td-team — sticky, klikalny → profil drużyny
    const teamTd = r.id
      ? `<td class="sv-td-team sv-col-sticky-team sv-td-team--link" data-team-id="${r.id}" title="Otwórz profil drużyny">
          <span class="sv-team-name">${r.team_name}</span>
          ${r.class_name?`<span class="sv-team-cls">${r.class_name}</span>`:""}
          <span class="sv-team-arrow">›</span>
        </td>`
      : `<td class="sv-td-team sv-col-sticky-team">
          <span class="sv-team-name">${r.team_name}</span>
          ${r.class_name?`<span class="sv-team-cls">${r.class_name}</span>`:""}
        </td>`;

    if (isVolleyball) {
      const pd = r.pd ?? 0;
      return `<tr class="sv-tr ${rowCls}">
        ${posTd}${teamTd}
        <td>${r.played}</td>
        <td class="sv-td-w">${r.wins}</td>
        <td class="sv-td-l">${r.losses}</td>
        <td class="sv-td-vb-detail sv-td-vb-sets-detail">${r.gf}</td>
        <td class="sv-td-vb-detail sv-td-vb-sets-detail">${r.ga}</td>
        <td class="sv-td-vb-bil ${bilCls(r.gd)}">${signVal(r.gd)}</td>
        <td class="sv-td-vb-detail sv-td-vb-pts-detail">${r.pf??0}</td>
        <td class="sv-td-vb-detail sv-td-vb-pts-detail">${r.pa??0}</td>
        <td class="sv-td-vb-bil ${bilCls(pd)}">${signVal(pd)}</td>
        <td class="sv-td-pts"><strong>${r.pts}</strong></td>
      </tr>`;
    }

    return `<tr class="sv-tr ${rowCls}">
      ${posTd}${teamTd}
      <td>${r.played}</td>
      <td class="sv-td-w">${r.wins}</td>
      ${hasDraw?`<td class="sv-td-d">${r.draws}</td>`:""}
      <td class="sv-td-l">${r.losses}</td>
      <td class="sv-td-gf">${r.gf}</td>
      <td class="sv-td-ga">${r.ga}</td>
      <td class="${bilCls(r.gd)}">${signVal(r.gd)}</td>
      <td class="sv-td-pts"><strong>${r.pts}</strong></td>
    </tr>`;
  }

  const emptyMsg = !rows.length
    ? `<div class="sv-empty">Brak danych ligowych — mecze zostaną tu pokazane po rozegraniu.</div>`
    : "";

  // Każda grupa na osobnej karcie
  const groupCards = groups.map(group => `
    <div class="sv-group-card">
      ${group.name ? `<div class="sv-group-card-hdr"><span class="sv-group-card-icon">📋</span>${group.name}</div>` : ""}
      <div class="sv-table-wrap">
        <table class="sv-table${isVolleyball ? " sv-table--vb" : ""}">
          ${thead}
          <tbody>
            ${group.rows.length
              ? group.rows.map((r,i) => buildRow(r,i)).join("")
              : `<tr><td colspan="12" class="sv-empty-cell">Brak drużyn w tej grupie</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`).join("");

  return `<div class="sv-league">${emptyMsg}<div class="sv-groups-grid">${groupCards}</div>${legendHtml}</div>`;
}

function buildMatchCard(m, showScore) {
  const card = el("div","match-card");
  const scoreHtml = showScore
    ? `<span class="score-box">${m.score_t1 ?? 0} : ${m.score_t2 ?? 0}</span>`
    : `<span class="score-vs">VS</span>`;
  card.innerHTML = `
    <div class="match-card-top">
      <span class="status-badge status-${m.status}">${m.status}</span>
      <span style="font-size:.74rem;color:var(--muted)">${fmtDate(m.match_date)}${m.match_time?" · "+fmtTime(m.match_time):""}</span>
    </div>
    <div class="match-teams">
      <span class="team-name">${m.team1_name}</span>
      ${scoreHtml}
      <span class="team-name">${m.team2_name}</span>
    </div>
    <div class="match-meta">
      ${m.location     ? `<span>📍 ${m.location}</span>` : ""}
      ${m.referee_name ? `<span>👤 ${m.referee_name}</span>` : ""}
    </div>
  `;
  card.addEventListener("click", () => openMatchDetail(m.id));
  return card;
}

async function openMatchDetail(id) {
  const data = await api(`/matches/${id}`);
  if (!data || data.error) return;
  const { match:m, playerStats, teamStats, sets } = data;
  const played = ["Rozegrany","Walkower"].includes(m.status);

  let html = `
    <span class="discipline-badge ${DISC_CLASS[m.discipline] || ""}">${DISC_EMOJI[m.discipline] || ""} ${m.discipline}</span>
    <span class="status-badge status-${m.status}" style="margin-left:.4rem">${m.status}</span>
    <div class="detail-score-box">
      <div class="detail-team">${m.team1_name}</div>
      <div class="detail-score">${played ? `${m.score_t1}:${m.score_t2}` : "—"}</div>
      <div class="detail-team">${m.team2_name}</div>
    </div>
    ${m.shootout_t1 !== null ? `<p style="text-align:center;color:var(--muted);font-size:.8rem;margin-bottom:.25rem">Karne: ${m.shootout_t1} : ${m.shootout_t2}</p>` : ""}
    <div class="detail-section"><h3>Szczegóły</h3>
      <div class="detail-meta-grid">
        <div class="detail-meta-item"><div class="label">Data</div><div class="value">${fmtDate(m.match_date)}</div></div>
        <div class="detail-meta-item"><div class="label">Godzina</div><div class="value">${fmtTime(m.match_time)||"—"}</div></div>
        <div class="detail-meta-item"><div class="label">Miejsce</div><div class="value">${m.location||"—"}</div></div>
        <div class="detail-meta-item"><div class="label">Sędzia</div><div class="value">${m.referee_name||"—"}</div></div>
        <div class="detail-meta-item"><div class="label">Protokolant</div><div class="value">${m.clerk_name||"—"}</div></div>
      </div>
    </div>
  `;
  if (sets?.length) {
    html += `<div class="detail-section"><h3>Sety</h3><div class="sets-grid">`;
    sets.forEach(s => { html += `<div class="set-chip"><div class="set-label">Set ${s.set_number}</div><div class="set-score">${s.points_t1}:${s.points_t2}</div></div>`; });
    html += `</div></div>`;
  }
  if (teamStats?.length) {
    html += `<div class="detail-section"><h3>Statystyki drużyn</h3>
      <table class="inner-table"><thead><tr><th>Drużyna</th><th>Zmiany</th><th>T-outy</th><th>Faule</th></tr></thead><tbody>`;
    teamStats.forEach(ts => { html += `<tr><td><strong>${ts.team_name}</strong></td><td>${ts.substitutions_used??'—'}</td><td>${ts.timeouts_taken??'—'}</td><td>${ts.team_fouls_count??'—'}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  if (playerStats?.length) {
    const isFoot = m.discipline === "Piłka Nożna";
    const isBask = m.discipline === "Koszykówka";
    if (isBask) {
      const scoreT1 = Number(m.score_t1 ?? 0);
      const scoreT2 = Number(m.score_t2 ?? 0);
      const winner  = scoreT1 > scoreT2 ? 1 : scoreT2 > scoreT1 ? 2 : 0;
      html += `<div class="detail-section"><h3>Sk&#x142;ady dru&#x17c;yn</h3>`;
      [m.team1_name, m.team2_name].forEach((teamName, idx) => {
        const players = playerStats.filter(s => s.team_name === teamName);
        if (!players.length) return;
        const isWinner = (idx === 0 && winner === 1) || (idx === 1 && winner === 2);
        html += `<div class="bsk-squad-block">
          <div class="bsk-squad-title ${isWinner?"bsk-squad-title--win":""}">${teamName}</div>
          <div class="bsk-squad-table-wrap">
            <table class="inner-table bsk-squad-table">
              <thead><tr><th>Nr</th><th>Imię i nazwisko</th><th>Pkt</th><th>+1pkt</th><th>+2pkt</th><th>+3pkt</th><th>Faule</th><th>F.techn.</th></tr></thead>
              <tbody>`;
        players.forEach((s, i) => {
          html += `<tr>
            <td>${i+1}</td>
            <td>${s.is_captain?'<span class="captain-badge">K</span>&nbsp;':""}${s.first_name} ${s.last_name}</td>
            <td><strong>${s.total_points_in_match??0}</strong></td>
            <td>${s.points_1pt??0}</td><td>${s.points_2pt??0}</td><td>${s.points_3pt??0}</td>
            <td>${s.personal_fouls??0}</td><td>${s.technical_fouls??0}</td>
          </tr>`;
        });
        html += `</tbody></table></div></div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="detail-section"><h3>Zawodnicy</h3>
        <table class="inner-table"><thead><tr><th>Zawodnik</th><th>Drużyna</th><th>Pkt</th>${isFoot?"<th>🟡</th><th>🔴</th>":""}</tr></thead><tbody>`;
      playerStats.forEach(s => { html += `<tr><td>${s.is_captain?"© ":""}${s.first_name} ${s.last_name}</td><td style="color:var(--muted)">${s.team_name}</td><td><strong>${s.total_points_in_match??0}</strong></td>${isFoot?`<td>${s.yellow_cards??0}</td><td>${s.red_card?"✓":"—"}</td>`:""}</tr>`; });
      html += `</tbody></table></div>`;
    }
  }
  $("match-detail-content").innerHTML = html;
  $("match-overlay").classList.remove("hidden");
}

$("close-match").addEventListener("click", () => $("match-overlay").classList.add("hidden"));
$("match-overlay").addEventListener("click", e => { if (e.target === $("match-overlay")) $("match-overlay").classList.add("hidden"); });

/* ════════════════════════════════════════════════════════════════════════════
   ZAWODNICY — tabela klasyfikacji strzelców
════════════════════════════════════════════════════════════════════════════ */
async function loadZawodnicy() {
  const disc = activeDiscipline;
  if (disc === "druzyny") { await loadTeamsList(); return; }
  // Jeśli aktywna jest Tabela Generalna — wróć do domyślnej dyscypliny
  if (disc === "ranking" || !["Piłka Nożna","Koszykówka","Siatkówka"].includes(disc)) {
    activeDiscipline = "Piłka Nożna";
    return navigate("Piłka Nożna", "zawodnicy");
  }
  if (disc === "Siatkówka") { $("zawodnicy-list").appendChild(emptyState("🏐","Klasyfikacja zawodników niedostępna dla siatkówki")); return; }

  const c = $("zawodnicy-list"); c.innerHTML = "";

  // ── Koszykówka / Piłka Nożna: tabela klasyfikacji ────────────────────────
  if (disc === "Koszykówka" || disc === "Piłka Nożna") {
    const isBsk  = disc === "Koszykówka";
    const icon   = isBsk ? "🏀" : "⚽";
    const title  = isBsk ? "Klasyfikacja rzucających" : "Klasyfikacja strzelców";
    const ptWord = isBsk ? "punktów" : "goli";
    const prefix = isBsk ? "bsk" : "foot";

    const data = await api(`/top-scorers-detail/${encodeURIComponent(disc)}`);
    if (!data?.length) { c.appendChild(emptyState(icon, `Brak danych statystycznych. Uzupełnij protokoły meczów.`)); return; }

    const allRows = data.filter(r => r.total_points > 0);
    if (!allRows.length) { c.appendChild(emptyState(icon, `Brak zdobytych ${ptWord} w rozegranych meczach.`)); return; }

    const teams   = [...new Set(allRows.map(r => r.team_name))].sort();
    const classes = [...new Set(allRows.map(r => r.class_name).filter(Boolean))].sort();

    const SORT_COLS = isBsk
      ? [
          { key: "total_points",  label: "Pkt", default: true },
          { key: "matches_played",label: "M" },
          { key: "points_1pt",    label: "1pt" },
          { key: "points_2pt",    label: "2pt" },
          { key: "points_3pt",    label: "3pt" },
          { key: "avg",           label: "Śr/m" },
          { key: "name",          label: "Nazwisko" },
        ]
      : [
          { key: "total_points",  label: "Gole", default: true },
          { key: "matches_played",label: "M" },
          { key: "avg",           label: "Śr/m" },
          { key: "name",          label: "Nazwisko" },
        ];

    const colClass = isBsk ? "" : " sv-scorers--football";
    const headCols = isBsk
      ? `<th class="sv-sc-num" title="Mecze rozegrane">M</th>
         <th class="sv-sc-pts sv-sc-pts--main">Pkt</th>
         <th class="sv-sc-sub" title="Rzuty wolne (1 pkt)">1pt</th>
         <th class="sv-sc-sub" title="Rzuty za 2 punkty">2pt</th>
         <th class="sv-sc-sub" title="Rzuty za 3 punkty">3pt</th>
         <th class="sv-sc-avg" title="Punkty na mecz">Śr/m</th>`
      : `<th class="sv-sc-num" title="Mecze rozegrane">M</th>
         <th class="sv-sc-pts sv-sc-pts--main sv-sc-pts--goals">Gole</th>
         <th class="sv-sc-avg" title="Gole na mecz">Śr/m</th>`;

    const legendHtml = isBsk
      ? `<span><strong>M</strong> = mecze rozegrane</span>
         <span><strong>Pkt</strong> = łączne punkty</span>
         <span><strong>1pt</strong> = rzuty wolne</span>
         <span><strong>2pt</strong> = rzuty za 2</span>
         <span><strong>3pt</strong> = rzuty za 3</span>
         <span><strong>Śr/m</strong> = średnia na mecz</span>
         <span>Kliknij zawodnika, aby zobaczyć historię meczów</span>`
      : `<span><strong>M</strong> = mecze rozegrane</span>
         <span><strong>Gole</strong> = łączna liczba goli</span>
         <span><strong>Śr/m</strong> = gole na mecz</span>
         <span>Kliknij zawodnika, aby zobaczyć historię meczów</span>`;

    const wrap = el("div", `sv-scorers${colClass}`);
    wrap.innerHTML = `
      <div class="sv-scorers-header">
        <h3 class="sv-scorers-title">${icon} ${title}</h3>
        <span class="sv-scorers-count" id="${prefix}-sc-count"></span>
      </div>
      <div class="sv-sc-controls">
        <div class="sv-sc-ctrl-row">
          <input class="sv-sc-search" id="${prefix}-sc-search" type="text" placeholder="🔍 Szukaj zawodnika…">
          <select class="sv-sc-select" id="${prefix}-sc-team">
            <option value="">Wszystkie drużyny</option>
            ${teams.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
          ${classes.length > 1 ? `<select class="sv-sc-select" id="${prefix}-sc-class">
            <option value="">Wszystkie klasy</option>
            ${classes.map(cl => `<option value="${cl}">${cl}</option>`).join("")}
          </select>` : `<span id="${prefix}-sc-class" style="display:none"></span>`}
        </div>
        <div class="sv-sc-ctrl-row sv-sc-sort-row">
          <span class="sv-sc-sort-lbl">Sortuj:</span>
          ${SORT_COLS.map(col => `<button class="sv-sc-sort-btn${col.default ? " active desc" : ""}" data-col="${col.key}">${col.label}</button>`).join("")}
          <button class="sv-sc-reset-btn" id="${prefix}-sc-reset">✕ Reset</button>
        </div>
      </div>
      <div class="sv-scorers-table-wrap">
        <table class="sv-scorers-table">
          <thead><tr>
            <th class="sv-sc-medal"></th>
            <th class="sv-sc-player">Zawodnik</th>
            ${headCols}
          </tr></thead>
          <tbody id="${prefix}-sc-tbody"></tbody>
        </table>
      </div>
      <div class="sv-scorers-legend">${legendHtml}</div>`;
    c.appendChild(wrap);

    let sortCol = "total_points", sortDir = "desc";
    let filterTeam = "", filterClass = "", filterSearch = "";
    let openPlayerId = null;   // który zawodnik jest rozwinięty

    function renderTable() {
      let rows = allRows.filter(r => {
        if (filterTeam  && r.team_name  !== filterTeam)  return false;
        if (filterClass && r.class_name !== filterClass)  return false;
        if (filterSearch) {
          const q = filterSearch.toLowerCase();
          if (!`${r.first_name} ${r.last_name}`.toLowerCase().includes(q) &&
              !(r.team_name||"").toLowerCase().includes(q)) return false;
        }
        return true;
      });
      rows.sort((a, b) => {
        let va, vb;
        if (sortCol === "name")     { va = a.last_name; vb = b.last_name; }
        else if (sortCol === "avg") { va = a.matches_played > 0 ? a.total_points/a.matches_played : 0; vb = b.matches_played > 0 ? b.total_points/b.matches_played : 0; }
        else                        { va = Number(a[sortCol])||0; vb = Number(b[sortCol])||0; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ?  1 : -1;
        return 0;
      });

      const tbody = document.getElementById(`${prefix}-sc-tbody`);
      tbody.innerHTML = "";

      rows.forEach((r, idx) => {
        const isTop = sortCol === "total_points" && idx < 3;
        const medal = isTop
          ? (idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉")
          : `<span class="sv-sc-rank">${idx + 1}</span>`;
        const avg = r.matches_played > 0
          ? (r.total_points / r.matches_played).toFixed(1) : "—";
        const teamCls = r.class_name ? `<span class="sv-sc-class-badge">${r.class_name}</span>` : "";

        const dataCols = isBsk
          ? `<td class="sv-sc-num">${r.matches_played}</td>
             <td class="sv-sc-pts sv-sc-pts--main">${r.total_points}</td>
             <td class="sv-sc-sub">${r.points_1pt||0}</td>
             <td class="sv-sc-sub">${r.points_2pt||0}</td>
             <td class="sv-sc-sub">${r.points_3pt||0}</td>
             <td class="sv-sc-avg">${avg}</td>`
          : `<td class="sv-sc-num">${r.matches_played}</td>
             <td class="sv-sc-pts sv-sc-pts--main sv-sc-pts--goals"><span class="foot-goals-num">${r.total_points}</span></td>
             <td class="sv-sc-avg">${avg}</td>`;

        const isOpen = openPlayerId === r.player_id;
        const tr = document.createElement("tr");
        tr.className = `sv-sc-row sv-sc-row--clickable${isTop ? " sv-sc-row--top3" : ""}${isOpen ? " sv-sc-row--open" : ""}`;
        tr.dataset.playerId = r.player_id;
        tr.innerHTML = `
          <td class="sv-sc-medal">${medal}</td>
          <td class="sv-sc-player">
            <span class="sv-sc-name">${r.first_name} ${r.last_name}${r.is_captain ? ' <span class="sv-sc-captain" title="Kapitan">©</span>' : ""}</span>
            <span class="sv-sc-team-inline">${r.team_name}${teamCls}</span>
          </td>
          ${dataCols}`;

        tr.addEventListener("click", () => {
          const wasOpen = openPlayerId === r.player_id;
          openPlayerId = wasOpen ? null : r.player_id;
          renderTable();
        });
        tbody.appendChild(tr);

        if (isOpen) {
          const detailTr = document.createElement("tr");
          detailTr.className = "sv-sc-detail-row";
          detailTr.innerHTML = `<td colspan="10"><div class="sv-sc-detail-wrap">${
            !r.matches?.length
              ? `<div class="sv-sc-detail-empty">Brak danych o meczach</div>`
              : r.matches.map(m => {
                  const date = m.match_date ? m.match_date.slice(0,10) : "—";
                  const pts  = m.total_points_in_match ?? 0;
                  const ptsBadge = pts > 0
                    ? `<span class="sv-sc-match-pts${isBsk ? "" : " sv-sc-match-pts--goal"}">${pts} ${isBsk ? "pkt" : pts === 1 ? "gol" : pts < 5 ? "gole" : "goli"}</span>`
                    : `<span class="sv-sc-match-pts sv-sc-match-pts--zero">0 ${isBsk ? "pkt" : "goli"}</span>`;
                  const breakdown = isBsk && (m.points_1pt || m.points_2pt || m.points_3pt)
                    ? `<span class="sv-sc-match-breakdown">(${m.points_1pt||0}×1 + ${m.points_2pt||0}×2 + ${m.points_3pt||0}×3)</span>` : "";
                  return `
                    <div class="sv-sc-match-row">
                      <span class="sv-sc-match-date">${date}</span>
                      <span class="sv-sc-match-teams">${m.team1_name} <em>vs</em> ${m.team2_name}</span>
                      <span class="sv-sc-match-score">${m.score_t1}:${m.score_t2}</span>
                      <span class="sv-sc-match-stat">${ptsBadge}${breakdown}</span>
                    </div>`;
                }).join("")
          }</div></td>`;
          tbody.appendChild(detailTr);
        }
      });

      document.getElementById(`${prefix}-sc-count`).textContent =
        `${rows.length}${rows.length !== allRows.length ? ` / ${allRows.length}` : ""} zawodnik${rows.length === 1 ? "" : rows.length < 5 ? "ów" : "ów"}`;
    }

    wrap.querySelectorAll(".sv-sc-sort-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const col = btn.dataset.col;
        sortDir = sortCol === col ? (sortDir === "desc" ? "asc" : "desc") : (col === "name" ? "asc" : "desc");
        sortCol = col;
        wrap.querySelectorAll(".sv-sc-sort-btn").forEach(b => b.classList.remove("active","asc","desc"));
        btn.classList.add("active", sortDir);
        renderTable();
      });
    });

    document.getElementById(`${prefix}-sc-search`).addEventListener("input", e => { filterSearch = e.target.value.trim(); renderTable(); });
    document.getElementById(`${prefix}-sc-team`).addEventListener("change", e => { filterTeam = e.target.value; renderTable(); });
    const classEl = document.getElementById(`${prefix}-sc-class`);
    if (classEl?.tagName === "SELECT") classEl.addEventListener("change", e => { filterClass = e.target.value; renderTable(); });
    document.getElementById(`${prefix}-sc-reset`).addEventListener("click", () => {
      filterSearch = ""; filterTeam = ""; filterClass = ""; openPlayerId = null;
      sortCol = "total_points"; sortDir = "desc";
      document.getElementById(`${prefix}-sc-search`).value = "";
      document.getElementById(`${prefix}-sc-team`).value = "";
      if (classEl?.tagName === "SELECT") classEl.value = "";
      wrap.querySelectorAll(".sv-sc-sort-btn").forEach(b => b.classList.remove("active","asc","desc"));
      wrap.querySelector('[data-col="total_points"]').classList.add("active","desc");
      renderTable();
    });

    renderTable();
    return;
  }

  // ── Pozostałe dyscypliny: oryginalna tabela z meczami ────────────────────
  const data = await api(`/player-stats/${encodeURIComponent(disc)}`);
  if (!data?.length) { c.appendChild(emptyState("👤","Brak zawodników")); return; }

  const isFootball = disc === "Piłka Nożna";
  const ptLabel    = isFootball ? "Suma" : "Suma";

  // zbierz unikalne mecze (zachowaj kolejność chronologiczną)
  const matchIds = [];
  const seenIds  = new Set();
  data.forEach(pl => pl.matches.forEach(m => {
    if (!seenIds.has(m.match_id)) { seenIds.add(m.match_id); matchIds.push(m.match_id); }
  }));

  // mapa player_id → match_id → pts
  const ptsMap = {};
  data.forEach(pl => {
    ptsMap[pl.player_id] = {};
    pl.matches.forEach(m => { ptsMap[pl.player_id][m.match_id] = m.total_points_in_match; });
  });

  const wrap = el("div","scorers-table-wrap");
  const table = el("table","scorers-rank-table");

  // nagłówek
  const headCols = matchIds.map((_,i) => `<th class="sr-match">Gra ${i+1}</th>`).join("");
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sr-pos">Pozycja</th>
        <th class="sr-name">Zawodnik</th>
        <th class="sr-class">Klasa</th>
        ${headCols}
        <th class="sr-total">${ptLabel}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  const BATCH = 50;
  let idx = 0;

  function renderBatch() {
    const frag = document.createDocumentFragment();
    const end  = Math.min(idx + BATCH, data.length);
    for (; idx < end; idx++) {
      const pl   = data[idx];
      const rank = idx + 1;
      const tr   = document.createElement("tr");
      if (rank <= 3) tr.classList.add(`sr-top-${rank}`);

      const matchCells = matchIds.map(id => {
        const pts = ptsMap[pl.player_id]?.[id];
        if (pts === undefined || pts === null) return `<td class="sr-match sr-empty"></td>`;
        if (pts === 0) return `<td class="sr-match sr-zero">0</td>`;
        return `<td class="sr-match sr-pts">${pts}</td>`;
      }).join("");

      tr.innerHTML = `
        <td class="sr-pos">${rank}</td>
        <td class="sr-name">${pl.is_captain ? "© " : ""}${pl.first_name} ${pl.last_name}</td>
        <td class="sr-class">${pl.class_name}</td>
        ${matchCells}
        <td class="sr-total">${pl.total_points > 0 ? pl.total_points : "—"}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    if (idx < data.length) requestAnimationFrame(renderBatch);
  }

  requestAnimationFrame(renderBatch);
  wrap.appendChild(table);
  c.appendChild(wrap);
}

async function loadTeamsList() {
  const data = await api("/teams");
  const c = $("zawodnicy-list"); c.innerHTML = "";
  if (!data?.length) { c.appendChild(emptyState("👥","Brak drużyn")); return; }
  data.forEach(t => {
    const card = el("div","team-card");
    card.innerHTML = `
      <div class="team-card-left">
        <h3>${t.team_name}</h3>
        <span class="class-tag">${t.class_name}</span>
        <span class="player-count">👥 ${t.player_count} zawodników</span>
      </div>
      <span class="team-card-arrow">›</span>
    `;
    card.addEventListener("click", () => openTeamDetail(t));
    c.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DRUŻYNY — sidebar + profil
════════════════════════════════════════════════════════════════════════════ */
let allTeams     = null;
let activeTeamId = null;

async function initTeamsView(selectId = null) {
  showView("druzyny");
  if (!allTeams) allTeams = await api("/teams");
  if (!allTeams?.length) return;
  buildTeamsSidebar(allTeams);
  const teamToShow = selectId ? allTeams.find(t => t.id === selectId) : allTeams[0];
  if (teamToShow) loadTeamProfile(teamToShow.id);
}

function buildTeamsSidebar(teams) {
  const list = $("teams-sidebar-list");
  list.innerHTML = "";
  teams.forEach(t => {
    const btn = el("button","sidebar-team-btn");
    btn.dataset.id = t.id;
    const initials = t.team_name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
    btn.innerHTML = `
      <span class="s-logo">${initials}</span>
      <span class="s-info">
        <span class="s-name">${t.team_name}</span>
        <span class="s-class">${t.class_name}</span>
      </span>`;
    btn.addEventListener("click", () => loadTeamProfile(t.id));
    list.appendChild(btn);
  });
}

async function loadTeamProfile(teamId) {
  activeTeamId = teamId;
  document.querySelectorAll(".sidebar-team-btn").forEach(b =>
    b.classList.toggle("active", +b.dataset.id === teamId));
  const activeBtn = document.querySelector(`.sidebar-team-btn[data-id="${teamId}"]`);
  activeBtn?.scrollIntoView({ block:"nearest", inline:"nearest", behavior:"smooth" });

  const data = await api(`/teams/${teamId}/profile`);
  if (!data || data.error) return;
  const { team, players, matches, discStats } = data;

  const main = $("team-profile-main");
  main.innerHTML = "";

  // HEADER
  const initials = team.team_name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
  const header = el("div","tp-header");
  header.innerHTML = `
    <div class="tp-logo">${initials}</div>
    <div class="tp-info">
      <h2>${team.team_name}</h2>
      <span class="tp-class">${team.class_name}</span>
    </div>`;
  main.appendChild(header);

  // STATYSTYKI DYSCYPLIN
  const statsSection = el("div","tp-section");
  statsSection.innerHTML = `<div class="tp-section-title">Statystyki dyscyplin</div>`;
  const grid = el("div","disc-stats-grid");
  [{ key:"Piłka Nożna",emoji:"⚽"},{ key:"Koszykówka",emoji:"🏀"},{ key:"Siatkówka",emoji:"🏐"}]
    .forEach(({ key, emoji }) => {
      const s = discStats[key] || { wins:0, draws:0, losses:0 };
      const card = el("div","disc-stat-card");
      card.innerHTML = `
        <div class="disc-stat-emoji">${emoji}</div>
        <div class="disc-stat-name">${key}</div>
        <div class="disc-wdl">
          <div class="disc-wdl-item"><span class="disc-wdl-num wdl-w">${s.wins ?? 0}</span><span class="disc-wdl-lbl">W</span></div>
          <div class="disc-wdl-item"><span class="disc-wdl-num wdl-d">${s.draws ?? 0}</span><span class="disc-wdl-lbl">R</span></div>
          <div class="disc-wdl-item"><span class="disc-wdl-num wdl-l">${s.losses ?? 0}</span><span class="disc-wdl-lbl">P</span></div>
        </div>`;
      grid.appendChild(card);
    });
  statsSection.appendChild(grid);
  main.appendChild(statsSection);

  // ZAWODNICY
  const playersSection = el("div","tp-section");
  playersSection.innerHTML = `<div class="tp-section-title">Zawodnicy (${players.length})</div>`;

  // Pobierz statystyki szczegółowe dla wszystkich dyscyplin tej drużyny
  const [statsFoot, statsBask] = await Promise.all([
    DB.getTopScorersDetail("Piłka Nożna").catch(() => []),
    DB.getTopScorersDetail("Koszykówka").catch(() => []),
  ]);

  // Zbuduj mapy player_id → dane statystyczne
  const footMap = {};
  (statsFoot||[]).filter(r=>r.total_points>0).forEach(r=>{ footMap[r.player_id]=r; });
  const baskMap = {};
  (statsBask||[]).filter(r=>r.total_points>0).forEach(r=>{ baskMap[r.player_id]=r; });

  const pwrap = el("div","tp-players-wrap");
  const ptable = el("table","tp-players-table tp-players-table--stats");

  ptable.innerHTML = `
    <thead><tr>
      <th class="tp-col-name">Zawodnik</th>
      <th class="tp-col-disc" title="Piłka Nożna — gole">⚽ Gole</th>
      <th class="tp-col-disc" title="Piłka Nożna — mecze">M</th>
      <th class="tp-col-disc tp-col-sep" title="Koszykówka — punkty">🏀 Pkt</th>
      <th class="tp-col-disc" title="Koszykówka — mecze">M</th>
      <th class="tp-col-disc" title="Koszykówka — rzuty za 2">2pt</th>
      <th class="tp-col-disc" title="Koszykówka — rzuty za 3">3pt</th>
    </tr></thead><tbody></tbody>`;

  const ptbody = ptable.querySelector("tbody");

  players.forEach(p => {
    const foot = footMap[p.player_id] || null;
    const bask = baskMap[p.player_id] || null;

    const nameHtml = p.is_captain
      ? `<strong>${p.first_name} ${p.last_name}</strong> <span class="tp-cap-badge" title="Kapitan">©</span>`
      : `${p.first_name} ${p.last_name}`;

    const tr = el("tr","tp-player-row");

    // Wiersz główny
    tr.innerHTML = `
      <td class="tp-player-name tp-col-name">${nameHtml}</td>
      <td class="tp-pts ${foot ? 'tp-pts--has' : ''}">${foot ? `<strong>${foot.total_points}</strong>` : "—"}</td>
      <td class="tp-pts-sub">${foot ? foot.matches_played : "—"}</td>
      <td class="tp-pts tp-col-sep ${bask ? 'tp-pts--has' : ''}">${bask ? `<strong>${bask.total_points}</strong>` : "—"}</td>
      <td class="tp-pts-sub">${bask ? bask.matches_played : "—"}</td>
      <td class="tp-pts-sub">${bask ? (bask.points_2pt||0) : "—"}</td>
      <td class="tp-pts-sub">${bask ? (bask.points_3pt||0) : "—"}</td>`;

    ptbody.appendChild(tr);

    // Wiersze szczegółów meczów (rozwijane po kliknięciu) — tylko jeśli są dane
    if (foot?.matches?.length || bask?.matches?.length) {
      tr.classList.add("tp-player-row--expandable");
      tr.title = "Kliknij aby zobaczyć mecze";

      const detailTr = el("tr","tp-player-detail hidden");
      const allMatches = [];
      (foot?.matches||[]).forEach(m=>allMatches.push({...m, disc:"⚽", ptLabel:"gol"}));
      (bask?.matches||[]).forEach(m=>allMatches.push({...m, disc:"🏀", ptLabel:"pkt"}));
      allMatches.sort((a,b)=>((a.match_date||"")<(b.match_date||"") ? 1 : -1));

      detailTr.innerHTML = `<td colspan="7" class="tp-player-detail-cell">
        <div class="tp-player-detail-inner">
          ${allMatches.filter(m=>m.total_points_in_match>0).map(m=>`
            <div class="tp-match-row">
              <span class="tp-match-disc">${m.disc}</span>
              <span class="tp-match-date">${(m.match_date||"").slice(0,10)}</span>
              <span class="tp-match-vs">${m.team1_name} vs ${m.team2_name}</span>
              <span class="tp-match-score-sm">${m.score_t1}:${m.score_t2}</span>
              <span class="tp-match-pts-badge">${m.total_points_in_match} ${m.ptLabel}</span>
              ${m.disc==="🏀" && (m.points_2pt||m.points_3pt||m.points_1pt)
                ? `<span class="tp-match-bsk-detail">(${m.points_1pt||0}×1 + ${m.points_2pt||0}×2 + ${m.points_3pt||0}×3)</span>`
                : ""}
            </div>`).join("")}
        </div>
      </td>`;

      tr.addEventListener("click", ()=>{
        const open = detailTr.classList.toggle("hidden");
        tr.classList.toggle("tp-player-row--open", !open);
      });
      ptbody.appendChild(detailTr);
    }
  });

  pwrap.appendChild(ptable);
  playersSection.appendChild(pwrap);
  main.appendChild(playersSection);

  // MECZE
  const matchesSection = el("div","tp-section");
  matchesSection.innerHTML = `<div class="tp-section-title">Mecze</div>`;
  const mlist = el("div","tp-matches");
  if (!matches.length) {
    mlist.appendChild(emptyState("📅","Brak meczów"));
  } else {
    matches.forEach(m => {
      const hasScore = ["Rozegrany","Walkower"].includes(m.status);
      const scoreHtml = hasScore
        ? `<span class="score-box">${m.score_t1}:${m.score_t2}</span>`
        : `<span class="score-vs">VS</span>`;
      const card = el("div","match-card");
      card.style.cssText = "position:relative;padding-top:2.1rem";
      card.innerHTML = `
        <span class="tp-match-disc ${DISC_CLASS[m.discipline]||""}">${DISC_EMOJI[m.discipline]||""} ${m.discipline}</span>
        <div class="match-card-top">
          <span class="status-badge status-${m.status}">${m.status}</span>
          <span style="font-size:.74rem;color:var(--muted)">${fmtDate(m.match_date)}${m.match_time?" · "+fmtTime(m.match_time):""}</span>
        </div>
        <div class="match-teams">
          <span class="team-name">${m.team1_name}</span>
          ${scoreHtml}
          <span class="team-name">${m.team2_name}</span>
        </div>
        ${m.location?`<div class="match-meta"><span>📍 ${m.location}</span></div>`:""}`;
      card.addEventListener("click", () => openMatchDetail(m.id));
      mlist.appendChild(card);
    });
  }
  matchesSection.appendChild(mlist);
  main.appendChild(matchesSection);
}

async function openTeamDetail(team) {
  // Przejdź do widoku drużyn i otwórz profil
  showView("druzyny");
  allTeams = null;
  await initTeamsView(team.id);
}


const DOKUMENTY = [
  { icon:"📋", name:"Regulamin turnieju",       desc:"Ogólne zasady rozgrywek",        file:"regulamin.pdf" },
  { icon:"📝", name:"Formularz zgłoszeniowy",   desc:"Zgłoszenie drużyny do turnieju", file:"formularz_zgloszeniowy.pdf" },
  { icon:"✅", name:"Zgoda RODO",               desc:"Klauzula informacyjna RODO",     file:"rodo.pdf" },
  { icon:"👨‍👩‍👦", name:"Zgoda rodzica/opiekuna", desc:"Zgoda na udział w rozgrywkach",  file:"zgoda_rodzica.pdf" },
  { icon:"💳", name:"Potwierdzenie wpisowego",  desc:"Dowód opłaty wpisowego",         file:"potwierdzenie_wpisowego.pdf" },
];

function loadDokumenty() {
  const c = $("dokumenty-list"); c.innerHTML = "";
  DOKUMENTY.forEach(d => {
    const card = el("a","doc-card");
    card.href = `dokumenty/${d.file}`; card.target = "_blank";
    card.innerHTML = `<span class="doc-icon">${d.icon}</span><div class="doc-info"><h3>${d.name}</h3><p>${d.desc}</p></div><span class="doc-arrow">↓</span>`;
    c.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DRABINKA PUCHAROWA — SVG, zawsze renderuje skonfigurowane rundy
════════════════════════════════════════════════════════════════════════════ */

function bkMatchWinner(m) {
  if (!m || m.status !== "Rozegrany") return 0;
  const s1 = Number(m.score_t1 ?? 0), s2 = Number(m.score_t2 ?? 0);
  if (m.shootout_t1 !== null && m.shootout_t2 !== null) {
    const p1 = Number(m.shootout_t1), p2 = Number(m.shootout_t2);
    return p1 > p2 ? 1 : p2 > p1 ? 2 : 0;
  }
  return s1 > s2 ? 1 : s2 > s1 ? 2 : 0;
}

async function buildBracket(containerEl, disc) {
  const [bracketData, fmtAll] = await Promise.all([
    DB.getBracket(disc),
    DB.getTournamentFormat(),
  ]);

  const fmt = fmtAll[disc] || {};
  const CUP_ROUND_ORDER = ["1/16","1/8","1/4","Półfinał","Finał","Inne"];

  // Skonfigurowane rundy z formatu — jeśli brak, wyciągnij z danych
  let configuredRounds = [];
  if (fmt.cup_rounds && fmt.cup_rounds.length) {
    configuredRounds = [...fmt.cup_rounds].sort((a,b) =>
      (CUP_ROUND_ORDER.indexOf(a)===-1?99:CUP_ROUND_ORDER.indexOf(a)) -
      (CUP_ROUND_ORDER.indexOf(b)===-1?99:CUP_ROUND_ORDER.indexOf(b))
    );
  } else if (Array.isArray(bracketData) && bracketData.length) {
    configuredRounds = bracketData.map(r => r.round);
  }

  if (!configuredRounds.length) {
    containerEl.innerHTML = `<div class="sv-empty">Brak skonfigurowanych rund pucharowych.<br>Administrator musi skonfigurować format rozgrywek.</div>`;
    return;
  }

  const NS = "http://www.w3.org/2000/svg";
  const matchesByRound = {};
  if (Array.isArray(bracketData)) {
    bracketData.forEach(r => { matchesByRound[r.round] = r.matches || []; });
  }

  const totalRounds = configuredRounds.length;
  const firstCount  = Math.pow(2, totalRounds - 1); // mecze w 1. rundzie

  // ── Wymiary ───────────────────────────────────────────────────────────────
  const CARD_W   = 230;
  const CARD_H   = 68;
  const COL_GAP  = 52;
  const COL_W    = CARD_W + COL_GAP;
  const SLOT_H   = CARD_H + 28;
  const HEADER_H = 44;
  const WINNER_W = 152;
  const PAD_TOP  = 8;

  const totalHeight = PAD_TOP + HEADER_H + firstCount * SLOT_H + 20;
  const totalWidth  = totalRounds * COL_W - COL_GAP + WINNER_W + 28;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width",  totalWidth);
  svg.setAttribute("height", totalHeight);
  svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
  svg.style.cssText = "display:block;overflow:visible";

  // ── Style SVG ─────────────────────────────────────────────────────────────
  const style = document.createElementNS(NS, "style");
  style.textContent = `
    .bk-card        { fill:#16192a; stroke:#2a2f52; stroke-width:1.5; }
    .bk-card-played { fill:#1a1e36; stroke:#6c63ff; stroke-width:2; }
    .bk-card-tbd    { fill:#0d1020; stroke:#232640; stroke-width:1; stroke-dasharray:4,3; }
    .bk-divline     { stroke:#2a2f52; stroke-width:1; }
    .bk-team-name   { font-family:'Inter',system-ui,sans-serif; font-size:12.5px; fill:#c8d2e8; }
    .bk-team-win    { fill:#ffffff; font-weight:700; }
    .bk-team-lose   { fill:#404666; }
    .bk-team-tbd    { fill:#2e3352; font-style:italic; font-size:11.5px; }
    .bk-score       { font-family:'Inter',system-ui,sans-serif; font-size:14px; font-weight:700; fill:#404666; }
    .bk-score-win   { fill:#ffffff; }
    .bk-score-lose  { fill:#303555; }
    .bk-pen-label   { font-family:system-ui,sans-serif; font-size:9px; fill:#5a6280;
                      text-transform:uppercase; letter-spacing:.06em; }
    .bk-round-hdr   { font-family:'Inter',system-ui,sans-serif; font-size:10px; font-weight:800;
                      fill:#5a6888; text-transform:uppercase; letter-spacing:.1em; }
    .bk-round-line  { stroke:#2a2f52; stroke-width:1; }
    .bk-conn        { stroke:#2a3060; stroke-width:1.5; fill:none;
                      stroke-linecap:round; stroke-linejoin:round; }
    .bk-winner-box  { fill:rgba(255,215,0,.09); stroke:rgba(255,215,0,.45); stroke-width:2; }
    .bk-winner-txt  { font-family:'Inter',system-ui,sans-serif; font-size:12.5px; font-weight:800; fill:#ffd700; }
    .bk-winner-sub  { font-family:system-ui,sans-serif; font-size:9.5px; fill:#7a8199; letter-spacing:.06em; text-transform:uppercase; }
    .bk-trophy      { font-size:20px; }
    .bk-card-link   { cursor:pointer; }
    .bk-card-link:hover .bk-card-played { stroke:#a78bfa; }
    .bk-card-link:hover .bk-card        { stroke:#4a5080; }
    .bk-slot-idx    { font-family:system-ui,sans-serif; font-size:9px; fill:#2e3352; }
  `;
  svg.appendChild(style);

  const cardCenters = [];

  // ── Rysuj rundy ───────────────────────────────────────────────────────────
  configuredRounds.forEach((round, ri) => {
    const count   = Math.pow(2, totalRounds - 1 - ri);
    const spacing = (firstCount / count) * SLOT_H;
    const colX    = ri * COL_W;

    // Nagłówek kolumny
    const hdr = document.createElementNS(NS, "text");
    hdr.setAttribute("x", colX + CARD_W / 2);
    hdr.setAttribute("y", PAD_TOP + 16);
    hdr.setAttribute("text-anchor", "middle");
    hdr.setAttribute("class", "bk-round-hdr");
    hdr.textContent = round;
    svg.appendChild(hdr);

    const hline = document.createElementNS(NS, "line");
    hline.setAttribute("x1", colX); hline.setAttribute("y1", PAD_TOP + 22);
    hline.setAttribute("x2", colX + CARD_W); hline.setAttribute("y2", PAD_TOP + 22);
    hline.setAttribute("class", "bk-round-line");
    svg.appendChild(hline);

    cardCenters[ri] = [];

    for (let si = 0; si < count; si++) {
      const cardY = PAD_TOP + HEADER_H + si * spacing + (spacing - CARD_H) / 2;
      const yCtr  = cardY + CARD_H / 2;

      const m      = (matchesByRound[round] || [])[si] || null;
      const played = m && m.status === "Rozegrany";
      const s1     = played ? Number(m.score_t1 ?? 0) : null;
      const s2     = played ? Number(m.score_t2 ?? 0) : null;
      const w      = played ? bkMatchWinner(m) : 0;
      const t1win  = w === 1, t2win = w === 2;
      const hasPen = played && m.shootout_t1 !== null;
      const isTbd  = !m;

      // Nazwy — z meczu lub placeholder
      const name1 = m ? m.team1_name : "—";
      const name2 = m ? m.team2_name : "—";

      // Grupa elementów karty (klikalność)
      let cardGroup = svg;
      if (m) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "bk-card-link");
        g.addEventListener("click", () => openMatchDetail(m.id));
        svg.appendChild(g);
        cardGroup = g;
      }

      // Prostokąt karty
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", colX); rect.setAttribute("y", cardY);
      rect.setAttribute("width", CARD_W); rect.setAttribute("height", CARD_H);
      rect.setAttribute("rx", 9);
      rect.setAttribute("class", played ? "bk-card bk-card-played" : isTbd ? "bk-card bk-card-tbd" : "bk-card");
      cardGroup.appendChild(rect);

      // Linia podziału
      const div = document.createElementNS(NS, "line");
      div.setAttribute("x1", colX + 8); div.setAttribute("y1", cardY + CARD_H/2);
      div.setAttribute("x2", colX + CARD_W - 8); div.setAttribute("y2", cardY + CARD_H/2);
      div.setAttribute("class", "bk-divline");
      cardGroup.appendChild(div);

      // Pomocnik tekstu
      function addText(text, x, y, cls) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", x); t.setAttribute("y", y);
        t.setAttribute("class", cls);
        t.textContent = text.length > 25 ? text.slice(0,23) + "…" : text;
        cardGroup.appendChild(t);
      }

      // Nazwy drużyn
      const t1cls = isTbd ? "bk-team-name bk-team-tbd"
        : t1win ? "bk-team-name bk-team-win"
        : (played && !t1win) ? "bk-team-name bk-team-lose"
        : "bk-team-name";
      const t2cls = isTbd ? "bk-team-name bk-team-tbd"
        : t2win ? "bk-team-name bk-team-win"
        : (played && !t2win) ? "bk-team-name bk-team-lose"
        : "bk-team-name";

      addText(name1, colX + 10, cardY + 24, t1cls);
      addText(name2, colX + 10, cardY + CARD_H - 12, t2cls);

      // Wyniki
      if (played) {
        function addScore(val, y, cls) {
          const sc = document.createElementNS(NS, "text");
          sc.setAttribute("x", colX + CARD_W - 9); sc.setAttribute("y", y);
          sc.setAttribute("text-anchor", "end");
          sc.setAttribute("class", cls);
          sc.textContent = val;
          cardGroup.appendChild(sc);
        }
        addScore(s1, cardY + 24,          t1win ? "bk-score bk-score-win" : "bk-score bk-score-lose");
        addScore(s2, cardY + CARD_H - 12, t2win ? "bk-score bk-score-win" : "bk-score bk-score-lose");

        if (hasPen) {
          const pen = document.createElementNS(NS, "text");
          pen.setAttribute("x", colX + CARD_W/2);
          pen.setAttribute("y", cardY + CARD_H + 14);
          pen.setAttribute("text-anchor", "middle");
          pen.setAttribute("class", "bk-pen-label");
          pen.textContent = `k. ${m.shootout_t1}:${m.shootout_t2}`;
          cardGroup.appendChild(pen);
        }
      }

      cardCenters[ri][si] = { xR: colX + CARD_W, xL: colX, yCtr };
    }
  });

  // ── Konektory H─V─H ───────────────────────────────────────────────────────
  for (let ri = 0; ri < totalRounds - 1; ri++) {
    const rightCount = Math.pow(2, totalRounds - 2 - ri);
    for (let rsi = 0; rsi < rightCount; rsi++) {
      const left0 = cardCenters[ri][rsi * 2];
      const left1 = cardCenters[ri][rsi * 2 + 1];
      const right = cardCenters[ri + 1]?.[rsi];
      if (!left0 || !left1 || !right) continue;

      const xMid = left0.xR + (right.xL - left0.xR) * 0.5;
      const yMid = (left0.yCtr + left1.yCtr) / 2;

      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", [
        `M ${left0.xR} ${left0.yCtr}`, `H ${xMid}`, `V ${yMid}`,
        `M ${left1.xR} ${left1.yCtr}`, `H ${xMid}`, `V ${yMid}`,
        `M ${xMid} ${yMid}`, `V ${right.yCtr}`, `H ${right.xL}`,
      ].join(" "));
      path.setAttribute("class", "bk-conn");
      svg.appendChild(path);
    }
  }

  // ── Karta Zwycięzcy ───────────────────────────────────────────────────────
  const lastRound  = configuredRounds[totalRounds - 1];
  const finalMatch = (matchesByRound[lastRound] || [])[0];
  let champion = null;
  if (finalMatch && finalMatch.status === "Rozegrany") {
    const fw = bkMatchWinner(finalMatch);
    champion = fw === 1 ? finalMatch.team1_name : fw === 2 ? finalMatch.team2_name : null;
  }

  const champX = totalRounds * COL_W - COL_GAP + 16;
  const champY = totalHeight / 2 - 48;
  const champW = 136, champH = 96;

  // Konektor finał → trofeum
  const fc = cardCenters[totalRounds - 1]?.[0];
  if (fc) {
    const connLine = document.createElementNS(NS, "line");
    connLine.setAttribute("x1", fc.xR); connLine.setAttribute("y1", fc.yCtr);
    connLine.setAttribute("x2", champX); connLine.setAttribute("y2", champY + champH / 2);
    connLine.setAttribute("class", "bk-conn");
    svg.appendChild(connLine);
  }

  // Prostokąt karty zwycięzcy
  const champRect = document.createElementNS(NS, "rect");
  champRect.setAttribute("x", champX); champRect.setAttribute("y", champY);
  champRect.setAttribute("width", champW); champRect.setAttribute("height", champH);
  champRect.setAttribute("rx", 12);
  champRect.setAttribute("class", champion ? "bk-winner-box" : "bk-card bk-card-tbd");
  svg.appendChild(champRect);

  // Trofeum
  const trophy = document.createElementNS(NS, "text");
  trophy.setAttribute("x", champX + champW / 2); trophy.setAttribute("y", champY + 28);
  trophy.setAttribute("text-anchor", "middle"); trophy.setAttribute("class", "bk-trophy");
  trophy.textContent = "🏆";
  svg.appendChild(trophy);

  // Nazwa zwycięzcy
  const champName = document.createElementNS(NS, "text");
  champName.setAttribute("x", champX + champW / 2); champName.setAttribute("y", champY + 56);
  champName.setAttribute("text-anchor", "middle");
  champName.setAttribute("class", "bk-winner-txt");
  champName.textContent = champion ? (champion.length > 17 ? champion.slice(0,15) + "…" : champion) : "?";
  svg.appendChild(champName);

  // Podpis
  const champLbl = document.createElementNS(NS, "text");
  champLbl.setAttribute("x", champX + champW / 2); champLbl.setAttribute("y", champY + 75);
  champLbl.setAttribute("text-anchor", "middle");
  champLbl.setAttribute("class", "bk-winner-sub");
  champLbl.textContent = "Zwycięzca";
  svg.appendChild(champLbl);

  // ── Wstaw SVG ─────────────────────────────────────────────────────────────
  const wrap = document.createElement("div");
  wrap.className = "bk-svg-wrap";
  wrap.appendChild(svg);
  containerEl.innerHTML = "";
  containerEl.appendChild(wrap);
}

/* ════════════════════════════════════════════════════════════════════════════
   DB STATUS
════════════════════════════════════════════════════════════════════════════ */
async function checkStatus() {
  const s = $("db-status");
  try {
    const d = await DB.checkStatus();
    s.textContent = d.ok ? "● Online" : "● Błąd";
    s.className   = `db-status ${d.ok ? "ok" : "error"}`;
  } catch {
    s.textContent = "● Offline"; s.className = "db-status error";
  }
}

/* ── Sekcja Tabela Generalna ─────────────────────────────────────────────── */
async function loadRankingSection() {
  const c = $("ranking-list");
  if (!c) return;
  c.innerHTML = "";
  await renderRankingView(c);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
checkStatus();
getFormat().then(() => navigate("Piłka Nożna", "terminarz"));
/* ════════════════════════════════════════════════════════════════════════════
   TABELA GENERALNA — publiczny widok rankingu
   Wzór: Score = Σ( Pb × Wf × Wd )
     Pb  = percentyl miejsca ligowego  LUB  punkty percentylowe za etap pucharu
          Liga:   Pb = ((N − rank + 1) / N) × 100
          Puchar: Pb = ((N − Rmid + 1) / N) × 100  (Rmid = środek zakresu miejsc)
     Wf  = waga formatu (liga=1.0 / hybryda=0.9 / puchar=0.8 — konfigurowalne)
     Wd  = waga dyscypliny (konfigurowana przez admina, domyślnie 1.0)
     Score = suma punktów ze wszystkich dyscyplin i formatów
════════════════════════════════════════════════════════════════════════════ */

/* ── Konfiguracja dyscyplin ──────────────────────────────────────────────── */
const RK_DISCS = [
  { key: "Piłka Nożna", emoji: "⚽", color: "#22c55e", settingKey: "ranking_wd_football"   },
  { key: "Koszykówka",  emoji: "🏀", color: "#fb923c", settingKey: "ranking_wd_basketball" },
  { key: "Siatkówka",   emoji: "🏐", color: "#a78bfa", settingKey: "ranking_wd_volleyball" },
];

/* ── Konfiguracja wag formatów ───────────────────────────────────────────── */
const RK_FORMAT_WF = {
  liga:    { label: "Liga",     default: 1.0, settingKey: "ranking_wf_liga"    },
  hybryda: { label: "Hybryda",  default: 0.9, settingKey: "ranking_wf_hybryda" },
  puchar:  { label: "Drabinka", default: 0.8, settingKey: "ranking_wf_puchar"  },
};

/* ── Helpers obliczeniowe ────────────────────────────────────────────────── */
function rk_r1(n) { return Math.round(n * 10) / 10; }

function rk_wf(settings, hasLeague, hasCup, phase) {
  const key = (hasLeague && hasCup) ? phase : (hasLeague ? "liga" : "puchar");
  const def = RK_FORMAT_WF[key] ?? RK_FORMAT_WF.liga;
  return parseFloat(settings[def.settingKey] ?? def.default);
}

/* ── Obliczenia rankingu z danych API ────────────────────────────────────── */
function rk_compute(discData, settings) {
  const teamMap = {};

  const ensure = (id, name, cls) => {
    if (!teamMap[id]) teamMap[id] = { id, name, cls: cls || "", comps: [] };
  };

  RK_DISCS.forEach((disc, di) => {
    const data = discData[di];
    if (!data) return;
    const Wd = parseFloat(settings[disc.settingKey] ?? 1.0);

    /* ── LIGA ─────────────────────────────────────────────────────────── */
    if (data.has_league && data.liga?.rows?.length) {
      const rows = data.liga.rows;
      const N    = rows.length;
      const Wf   = rk_wf(settings, data.has_league, data.has_cup, "liga");

      rows.forEach((row, ri) => {
        ensure(row.id, row.team_name, row.class_name);
        if (row.played > 0) {
          const rank = ri + 1;
          // Formuła ligowa: Pb = ((N − rank + 1) / N) × 100
          const Pb   = rk_r1(((N - rank + 1) / N) * 100);
          const pts  = rk_r1(Pb * Wf * Wd);
          teamMap[row.id].comps.push({
            disc: disc.key, emoji: disc.emoji, color: disc.color,
            phase: "liga",
            label: `${rank}. miejsce ligowe`,
            // Pełny zapis obliczenia zapamiętany w komponencie
            formula: `Pb = ((${N} − ${rank} + 1) / ${N}) × 100 = ${Pb}`,
            detail:  `${row.pts} pkt ligi · ${row.wins}W ${row.draws ?? 0}R ${row.losses}P · ${row.gf}:${row.ga}`,
            rank, N, Pb, Wf: rk_r1(Wf), Wd: rk_r1(Wd), pts,
            known: true,
          });
        } else {
          ensure(row.id, row.team_name, row.class_name);
          teamMap[row.id].comps.push({
            disc: disc.key, emoji: disc.emoji, color: disc.color,
            phase: "liga", label: "liga — brak meczów",
            formula: "—", detail: "Nie rozegrano jeszcze żadnego meczu",
            Pb: 0, Wf: rk_r1(rk_wf(settings, data.has_league, data.has_cup, "liga")),
            Wd: rk_r1(Wd), pts: 0, known: false,
          });
        }
      });
    }

    /* ── PUCHAR ───────────────────────────────────────────────────────── */
    if (data.has_cup && data.cup?.teams?.length) {
      const Wf   = rk_wf(settings, data.has_league, data.has_cup, "puchar");
      const Ncup = data.cup.teams[0]?.N_cup || data.cup.teams.length;

      data.cup.teams.forEach(ct => {
        ensure(ct.teamId, ct.teamName, "");
        const Pb   = ct.cupPb || 0;
        const Rmid = ct.cupRankMid ?? "?";
        const pts  = rk_r1(Pb * Wf * Wd);
        const label = ct.wonFinal
          ? "🏆 Mistrz pucharu"
          : (ct.bestRound
              ? `Puchar: ${ct.bestRound} (${ct.placeLabel ?? ""} miejsce)`
              : "puchar — brak meczów");
        // Pełny zapis obliczenia pucharowego
        const formula = Pb > 0
          ? `Pb = ((${Ncup} − ${Rmid} + 1) / ${Ncup}) × 100 = ${Pb}`
          : "—";
        teamMap[ct.teamId].comps.push({
          disc: disc.key, emoji: disc.emoji, color: disc.color,
          phase: "puchar", label, formula,
          detail: Pb > 0
            ? `Rmid=${Rmid} (środek zakresu miejsc etapu), N=${Ncup}`
            : "Nie rozegrano żadnego meczu pucharowego",
          Pb, Wf: rk_r1(Wf), Wd: rk_r1(Wd), pts,
          known: Pb > 0,
        });
      });
    }
  });

  return Object.values(teamMap)
    .filter(t => t.comps.some(c => c.pts > 0 || c.known))
    .map(t => ({
      ...t,
      total: rk_r1(t.comps.reduce((s, c) => s + c.pts, 0)),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pl"));
}

/* ── Główna funkcja widoku ───────────────────────────────────────────────── */
async function renderRankingView(containerEl) {
  containerEl.innerHTML = `<div class="sv-loading"><div class="sv-loading-spin"></div>Ładowanie rankingu…</div>`;

  let settings = {}, discData = [];
  try {
    [settings, ...discData] = await Promise.all([
      DB.getTournamentSettings().catch(() => ({})),
      ...RK_DISCS.map(d => DB.getRankingData(d.key).catch(() => null)),
    ]);
  } catch {
    containerEl.innerHTML = `<div class="sv-empty">Błąd ładowania danych rankingu.</div>`;
    return;
  }

  const ranked = rk_compute(discData, settings);

  if (!ranked.length) {
    containerEl.innerHTML = `<div class="sv-empty">
      Brak danych do obliczenia rankingu.<br>
      Rozegraj mecze w co najmniej jednej dyscyplinie.
    </div>`;
    return;
  }

  containerEl.innerHTML = rk_buildHtml(ranked, settings, discData);

  // Kliknięcie w wiersz → profil drużyny w sekcji Drużyny
  // Kliknięcie w nazwę drużyny → profil
  containerEl.querySelectorAll(".rk-name-btn[data-team-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openTeamDetail({ id: +btn.dataset.teamId });
    });
  });

  // Kalkulator — live obliczenia
  const calcInputs = ["rk-calc-N","rk-calc-rank","rk-calc-wf","rk-calc-wd"];
  const calcUpdate = () => {
    const N    = parseInt(document.getElementById("rk-calc-N")?.value)   || 8;
    const rank = parseInt(document.getElementById("rk-calc-rank")?.value) || 1;
    const Wf   = parseFloat(document.getElementById("rk-calc-wf")?.value) || 1.0;
    const Wd   = parseFloat(document.getElementById("rk-calc-wd")?.value) || 1.0;

    const rankClamped = Math.min(Math.max(rank, 1), N);
    const Pb  = Math.round(((N - rankClamped + 1) / N) * 1000) / 10;
    const pts = Math.round(Pb * Wf * Wd * 10) / 10;

    const valEl = document.getElementById("rk-calc-val");
    const brkEl = document.getElementById("rk-calc-breakdown");
    if (valEl) valEl.textContent = pts;
    if (brkEl) brkEl.innerHTML =
      `Pb = ((${N} &minus; ${rankClamped} + 1) / ${N}) &times; 100 = <strong>${Pb}</strong>`
      + `&emsp;&times; Wf <strong>${Wf}</strong>`
      + `&emsp;&times; Wd <strong>${Wd}</strong>`;
  };
  calcInputs.forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcUpdate);
    document.getElementById(id)?.addEventListener("change", calcUpdate);
  });
  calcUpdate();
}

/* ── Budowanie HTML tabeli ───────────────────────────────────────────────── */
function rk_buildHtml(ranked, settings, discData) {
  const maxTotal = ranked[0]?.total || 1;

  /* ── Legenda wag (pełny zapis konfiguracji) ─────────────────────────── */
  const wfItems = Object.entries(RK_FORMAT_WF).map(([k, def]) => {
    const val = parseFloat(settings[def.settingKey] ?? def.default).toFixed(2);
    return `<span class="rk-cfg-pill">${def.label} <strong>Wf=${val}</strong></span>`;
  }).join("");

  const wdItems = RK_DISCS.map(d => {
    const val = parseFloat(settings[d.settingKey] ?? 1.0).toFixed(2);
    return `<span class="rk-cfg-pill" style="--pill-c:${d.color}">${d.emoji} <strong>Wd=${val}</strong></span>`;
  }).join("");

  /* ── Schemat punktacji pucharowej ───────────────────────────────────── */
  const cupDiscs = discData.filter(d => d?.has_cup && d.cup?.teams?.length);
  let cupSchemeHtml = "";
  if (cupDiscs.length) {
    const examples = [];
    cupDiscs.forEach(cd => {
      const disc = RK_DISCS.find(d => d.key === cd.discipline);
      if (!disc) return;
      const Ncup = cd.cup.teams[0]?.N_cup || cd.cup.teams.length;
      if (!Ncup) return;
      const seen = new Set();
      cd.cup.teams.forEach(t => {
        const stageKey = t.wonFinal ? "_winner_" : t.bestRound;
        if (stageKey && !seen.has(stageKey) && t.cupPb > 0) {
          seen.add(stageKey);
          examples.push({
            emoji: disc.emoji,
            stage: t.wonFinal ? "🏆 Mistrz" : t.bestRound,
            place: t.placeLabel ?? "",
            Rmid:  t.cupRankMid ?? "?",
            pb:    t.cupPb,
            N:     Ncup,
            formula: `((${Ncup} − ${t.cupRankMid ?? "?"} + 1) / ${Ncup}) × 100`,
          });
        }
      });
    });

    if (examples.length) {
      examples.sort((a, b) => b.pb - a.pb);
      cupSchemeHtml = `
        <details class="rk-scheme-box">
          <summary class="rk-scheme-summary">
            🏆 Schemat punktacji pucharowej
            <span class="rk-scheme-toggle-hint">(kliknij aby rozwinąć)</span>
          </summary>
          <div class="rk-scheme-body">
            <div class="rk-scheme-formula-note">
              Formuła pucharowa (identyczna jak ligowa):<br>
              <code>Pb = ((N − R<sub>mid</sub> + 1) / N) × 100</code><br>
              gdzie <strong>N</strong> = liczba drużyn w pucharze,
              <strong>R<sub>mid</sub></strong> = środek zakresu miejsc osiągniętego etapu
            </div>
            <div class="rk-scheme-stages">
              ${examples.map(s => `
                <div class="rk-scheme-row">
                  <span class="rk-scheme-emoji">${s.emoji}</span>
                  <div class="rk-scheme-info">
                    <span class="rk-scheme-stage">${s.stage}${s.place ? ` — ${s.place} miejsce` : ""}</span>
                    <code class="rk-scheme-calc">${s.formula} = ${s.pb}</code>
                  </div>
                  <span class="rk-scheme-pb-val">Pb = <strong>${s.pb}</strong></span>
                </div>`).join("")}
            </div>
          </div>
        </details>`;
    }
  }

  /* ── Wiersze rankingu ───────────────────────────────────────────────── */
  const rows = ranked.map((t, i) => {
    const barPct  = Math.round((t.total / maxTotal) * 100);
    const medal   = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const rowCls  = ["rk-row rk-row--clickable",
      i === 0 ? "rk-row--gold" : i === 1 ? "rk-row--silver" : i === 2 ? "rk-row--bronze" : "",
    ].filter(Boolean).join(" ");

    // Grupuj komponenty po dyscyplinie
    const byDisc = {};
    t.comps.forEach(c => { if (!byDisc[c.disc]) byDisc[c.disc] = []; byDisc[c.disc].push(c); });

    const chips = Object.entries(byDisc).map(([dk, comps]) => {
      const disc   = RK_DISCS.find(d => d.key === dk);
      const subtot = rk_r1(comps.reduce((s, c) => s + c.pts, 0));
      const known  = comps.every(c => c.known);

      // Tooltip z PEŁNYM zapisem obliczeń dla każdego składnika
      const tipLines = comps.map(c => {
        const phaseLbl = c.phase === "liga" ? "📊 Liga" : "🏆 Puchar";
        return [
          `${phaseLbl}: ${c.label}`,
          `  ${c.formula}`,
          `  Score: ${c.Pb} × Wf(${c.Wf}) × Wd(${c.Wd}) = ${c.pts} pkt`,
          `  (${c.detail})`,
        ].join("\n");
      }).join("\n──────────────\n");

      return `<span class="rk-chip ${!known ? "rk-chip--partial" : ""}"
        style="--chip-c:${disc?.color || "#6c63ff"}"
        title="${dk}\n══════════════\n${tipLines}">
        ${disc?.emoji || "🏅"} <strong>${subtot}</strong>${!known ? '<sup class="rk-chip-q">?</sup>' : ""}
      </span>`;
    }).join("");

    return `
      <div class="${rowCls}" data-team-id="${t.id}">
        <div class="rk-medal">${medal}</div>
        <div class="rk-team">
          <button class="rk-name-btn" data-team-id="${t.id}" title="Otwórz profil drużyny">${t.name}<span class="rk-arrow" aria-hidden="true">›</span></button>
          ${t.cls ? `<span class="rk-cls">${t.cls}</span>` : ""}
        </div>
        <div class="rk-chips">${chips}</div>
        <div class="rk-bar-track"><div class="rk-bar-fill" style="width:${barPct}%"></div></div>
        <div class="rk-score"><strong>${t.total}</strong></div>
      </div>`;
  }).join("");

  /* ── Konfiguracja wag do kalkulatora ─────────────────────────────── */
  const calcWfLiga    = parseFloat(settings[RK_FORMAT_WF.liga.settingKey]    ?? RK_FORMAT_WF.liga.default).toFixed(2);
  const calcWfHybryda = parseFloat(settings[RK_FORMAT_WF.hybryda.settingKey] ?? RK_FORMAT_WF.hybryda.default).toFixed(2);
  const calcWfPuchar  = parseFloat(settings[RK_FORMAT_WF.puchar.settingKey]  ?? RK_FORMAT_WF.puchar.default).toFixed(2);
  const calcWdFoot    = parseFloat(settings[RK_DISCS[0].settingKey] ?? 1.0).toFixed(2);
  const calcWdBask    = parseFloat(settings[RK_DISCS[1].settingKey] ?? 1.0).toFixed(2);
  const calcWdVoll    = parseFloat(settings[RK_DISCS[2].settingKey] ?? 1.0).toFixed(2);
  const calcN         = ranked.length || 8;

  /* ── Kompletny widok ────────────────────────────────────────────────── */
  return `
    <div class="rk-view">

      <!-- Konfiguracja wag -->
      <div class="rk-cfg-bar">
        <div class="rk-cfg-group">
          <span class="rk-cfg-label">Wagi formatów:</span>
          ${wfItems}
        </div>
        <div class="rk-cfg-group">
          <span class="rk-cfg-label">Wagi dyscyplin:</span>
          ${wdItems}
        </div>
      </div>

      ${cupSchemeHtml}

      <!-- Nagłówek kolumn -->
      <div class="rk-header-row">
        <span>#</span>
        <span>Drużyna</span>
        <span>Punkty wg dyscyplin <small>(najedź aby zobaczyć obliczenia)</small></span>
        <span></span>
        <span>Score</span>
      </div>

      <!-- Lista drużyn -->
      <div class="rk-list">${rows}</div>

      <!-- Wzór — na dole, uproszczony język -->
      <details class="rk-explain-box">
        <summary class="rk-explain-summary">📐 Jak obliczany jest wynik? <span class="rk-explain-hint">(kliknij)</span></summary>
        <div class="rk-explain-body">
          <p class="rk-explain-lead">
            Każda drużyna zbiera punkty w każdej dyscyplinie osobno, a wynik końcowy to ich suma.
          </p>
          <div class="rk-explain-steps">
            <div class="rk-explain-step">
              <span class="rk-explain-num">1</span>
              <div>
                <strong>Pozycja ligowa → punkty bazowe (Pb)</strong><br>
                Im wyższe miejsce w lidze, tym więcej punktów. Pierwsze miejsce spośród N drużyn daje 100 pkt, ostatnie — 100/N.
                <code class="rk-explain-code">Pb = ((N − miejsce + 1) / N) × 100</code>
                Przykład: 2. miejsce na 8 drużyn = ((8 − 2 + 1) / 8) × 100 = <strong>87.5</strong>
              </div>
            </div>
            <div class="rk-explain-step">
              <span class="rk-explain-num">2</span>
              <div>
                <strong>Mnożnik formatu (Wf)</strong><br>
                Liga waży więcej niż puchar. Aktualne ustawienia:
                Liga × ${calcWfLiga} &nbsp;·&nbsp; Hybryda × ${calcWfHybryda} &nbsp;·&nbsp; Drabinka × ${calcWfPuchar}
              </div>
            </div>
            <div class="rk-explain-step">
              <span class="rk-explain-num">3</span>
              <div>
                <strong>Mnożnik dyscypliny (Wd)</strong><br>
                Administrator może zwiększyć lub zmniejszyć wagę każdej dyscypliny. Aktualne:
                ⚽ × ${calcWdFoot} &nbsp;·&nbsp; 🏀 × ${calcWdBask} &nbsp;·&nbsp; 🏐 × ${calcWdVoll}
              </div>
            </div>
            <div class="rk-explain-step rk-explain-step--final">
              <span class="rk-explain-num">Σ</span>
              <div>
                <strong>Wynik końcowy</strong><br>
                Score = suma (Pb × Wf × Wd) ze wszystkich dyscyplin i formatów, w których drużyna brała udział.
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- Kalkulator punktów -->
      <details class="rk-calc-box" id="rk-calc-box" open>
        <summary class="rk-calc-summary">🧮 Kalkulator punktów <span class="rk-explain-hint">(kliknij)</span></summary>
        <div class="rk-calc-body">
          <div class="rk-calc-row">
            <label class="rk-calc-label">Liczba drużyn w lidze (N)</label>
            <input class="rk-calc-input" id="rk-calc-N" type="number" min="2" max="32" value="${calcN}">
          </div>
          <div class="rk-calc-row">
            <label class="rk-calc-label">Miejsce w lidze (rank)</label>
            <input class="rk-calc-input" id="rk-calc-rank" type="number" min="1" max="32" value="1">
          </div>
          <div class="rk-calc-row">
            <label class="rk-calc-label">Format rozgrywek</label>
            <select class="rk-calc-select" id="rk-calc-wf">
              <option value="${calcWfLiga}">Liga (Wf = ${calcWfLiga})</option>
              <option value="${calcWfHybryda}">Hybryda (Wf = ${calcWfHybryda})</option>
              <option value="${calcWfPuchar}">Drabinka pucharowa (Wf = ${calcWfPuchar})</option>
            </select>
          </div>
          <div class="rk-calc-row">
            <label class="rk-calc-label">Dyscyplina</label>
            <select class="rk-calc-select" id="rk-calc-wd">
              <option value="${calcWdFoot}">⚽ Piłka Nożna (Wd = ${calcWdFoot})</option>
              <option value="${calcWdBask}">🏀 Koszykówka (Wd = ${calcWdBask})</option>
              <option value="${calcWdVoll}">🏐 Siatkówka (Wd = ${calcWdVoll})</option>
            </select>
          </div>
          <div class="rk-calc-result" id="rk-calc-result">
            <div class="rk-calc-result-label">Wynik Score:</div>
            <div class="rk-calc-result-val" id="rk-calc-val">—</div>
            <div class="rk-calc-result-breakdown" id="rk-calc-breakdown"></div>
          </div>
        </div>
      </details>

    </div>`;
}