/* ── Config ─────────────────────────────────────────────────────────────── */
const API = null; // nie używana po migracji
// supabase pochodzi z window.supabase — ustawiane przez admin.html

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)              e.className  = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const loader  = on => $("loader").classList.toggle("hidden", !on);

function parseLocalDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const fmtDate = d => {
  if (!d) return "—";
  const parsed = (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    ? parseLocalDate(d) : new Date(d);
  return parsed.toLocaleDateString("pl-PL", { day:"2-digit", month:"short" });
};
const fmtTime = t => t ? t.slice(0,5) : "";

function hasShootout(m) {
  return m != null && m.shootout_t1 != null && m.shootout_t1 !== "";
}

function fmtSideScore(m, side) {
  const base = side === 1 ? m.score_t1 : m.score_t2;
  const pen  = side === 1 ? m.shootout_t1 : m.shootout_t2;
  if (base == null) return "—";
  if (hasShootout(m)) return `${base} <sup class="pen-sup">(${pen}k.)</sup>`;
  return String(base);
}

function fmtScore(m) {
  if (m.score_t1 == null) return "—";
  const base = `${m.score_t1}:${m.score_t2}`;
  if (hasShootout(m)) return `${base} <span class="pen-inline">(${m.shootout_t1}:${m.shootout_t2} k.)</span>`;
  return base;
}

function fmtScoreText(m) {
  if (m.score_t1 == null) return "—";
  const base = `${m.score_t1}:${m.score_t2}`;
  if (hasShootout(m)) return `${base} (${m.shootout_t1}:${m.shootout_t2} k.)`;
  return base;
}

function matchWinner(m) {
  const s1 = Number(hasShootout(m) ? m.shootout_t1 : m.score_t1 ?? 0);
  const s2 = Number(hasShootout(m) ? m.shootout_t2 : m.score_t2 ?? 0);
  return s1 > s2 ? 1 : s2 > s1 ? 2 : 0;
}

const DISC_CLASS = {
  "Piłka Nożna": "disc-football",
  "Koszykówka":  "disc-basketball",
  "Siatkówka":   "disc-volleyball",
};
const DISC_EMOJI = {
  "Piłka Nożna": "⚽",
  "Koszykówka":  "🏀",
  "Siatkówka":   "🏐",
};

/* ── Mapowanie prostych endpointów ──────────────────────────────────────── */
const ENDPOINT_MAP = {
  '/people':             () => supabase.from('people').select('*'),
  '/matches':            () => supabase.from('matches_full').select('*'),
  '/tournament-format':  () => supabase.from('tournament_format').select('*'),
  '/tournament-settings':() => supabase.from('tournament_settings').select('*'),
};

/* ── matchEndpoint ──────────────────────────────────────────────────────── */
function matchEndpoint(path) {

  // /teams — z liczeniem graczy
  if (path === '/teams') {
    return async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*, players(count)');
      if (error) return { data: null, error };
      const flat = (data || []).map(t => ({
        ...t,
        player_count: t.players?.[0]?.count ?? 0,
      }));
      return { data: flat, error: null };
    };
  }

  // /matches?discipline=X
  const discMatch = path.match(/^\/matches\?discipline=(.+)$/);
  if (discMatch) {
    const disc = decodeURIComponent(discMatch[1]);
    return () => supabase.from('matches_full').select('*')
                         .eq('discipline', disc)
                         .order('match_date').order('match_time');
  }

  // /matches?status=X
  const statusMatch = path.match(/^\/matches\?status=(.+)$/);
  if (statusMatch) {
    return () => supabase.from('matches_full').select('*')
                         .eq('status', decodeURIComponent(statusMatch[1]));
  }

  // /matches/:id
  const matchId = path.match(/^\/matches\/(\d+)$/);
  if (matchId) {
    const id = parseInt(matchId[1]);
    return async () => {
      const [matchRes, setsRes, playerStatsRes, teamStatsRes, logsRes] = await Promise.all([
        supabase.from('matches_full').select('*').eq('id', id).single(),
        supabase.from('match_periods').select('*').eq('match_id', id).order('set_number'),
        supabase.from('player_stats_full').select('*').eq('match_id', id),
        supabase.from('match_team_stats').select('*, teams(team_name)').eq('match_id', id),
        supabase.from('match_logs').select('*').eq('match_id', id).order('created_at'),
      ]);
      const m = matchRes.data;
      if (!m) return null;
      return {
        match: m,
        sets: setsRes.data || [],
        playerStats: playerStatsRes.data || [],
        teamStats: (teamStatsRes.data || []).map(ts => ({
          ...ts, team_name: ts.teams?.team_name
        })),
        logs: logsRes.data || [],
      };
    };
  }

  // /teams/:id/players
  const teamPlayers = path.match(/^\/teams\/(\d+)\/players$/);
  if (teamPlayers) {
    const tid = parseInt(teamPlayers[1]);
    return async () => {
      const { data, error } = await supabase.from('players')
        .select('*, people(first_name, last_name, class_name, role)')
        .eq('team_id', tid);
      if (error) return { data: null, error };
      const flat = (data || []).map(p => ({
        ...p,
        first_name: p.people?.first_name,
        last_name:  p.people?.last_name,
        class_name: p.people?.class_name,
        role:       p.people?.role,
      }));
      return { data: flat, error: null };
    };
  }

  // /teams/:id/profile
  const teamProfile = path.match(/^\/teams\/(\d+)\/profile$/);
  if (teamProfile) {
    const tid = parseInt(teamProfile[1]);
    return async () => {
      const [teamRes, playersRes] = await Promise.all([
        supabase.from('teams').select('*').eq('id', tid).single(),
        supabase.from('players').select('*, people(first_name, last_name, class_name, role)').eq('team_id', tid),
      ]);
      if (teamRes.error) return null;
      return {
        team: teamRes.data,
        players: (playersRes.data || []).map(p => ({
          ...p,
          first_name: p.people?.first_name,
          last_name:  p.people?.last_name,
          class_name: p.people?.class_name,
          role:       p.people?.role,
        })),
      };
    };
  }

  // /standings-custom/:discipline
  const standings = path.match(/^\/standings-custom\/(.+)$/);
  if (standings) {
    const disc = decodeURIComponent(standings[1]);
    return async () => {
      const { data: fmt } = await supabase.from('tournament_format')
        .select('*').eq('discipline', disc).single();
      const { data: rows } = await supabase.from('standings_raw')
        .select('*').eq('discipline', disc);
      const pts_win  = fmt?.pts_win  ?? 3;
      const pts_draw = fmt?.pts_draw ?? 1;
      const pts_loss = fmt?.pts_loss ?? 0;
      const withPts = (rows||[]).map(r => ({
        ...r,
        gd:  (r.gf||0) - (r.ga||0),
        pts: (r.wins||0)*pts_win + (r.draws||0)*pts_draw + (r.losses||0)*pts_loss,
      })).sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      return { rows: withPts, format: fmt };
    };
  }

  // /bracket/:discipline
  const bracket = path.match(/^\/bracket\/(.+)$/);
  if (bracket) {
    const disc = decodeURIComponent(bracket[1]);
    return async () => {
      const { data } = await supabase.from('matches_full').select('*')
        .eq('discipline', disc).eq('match_type', 'puchar');
      const ROUND_ORDER = ['1/16','1/8','1/4','Półfinał','Finał'];
      (data||[]).sort((a,b) =>
        ROUND_ORDER.indexOf(a.cup_round) - ROUND_ORDER.indexOf(b.cup_round));
      const byRound = {};
      (data||[]).forEach(m => {
        if (!byRound[m.cup_round]) byRound[m.cup_round] = { round: m.cup_round, matches: [] };
        byRound[m.cup_round].matches.push(m);
      });
      return Object.values(byRound);
    };
  }

  // /top-scorers-detail/:discipline
  const scorers = path.match(/^\/top-scorers-detail\/(.+)$/);
  if (scorers) {
    const disc = decodeURIComponent(scorers[1]);
    return async () => {
      const { data } = await supabase.from('player_stats_full').select('*')
        .eq('discipline', disc).eq('status', 'Rozegrany');
      const players = {};
      (data||[]).forEach(s => {
        if (!players[s.player_id]) players[s.player_id] = {
          player_id: s.player_id, first_name: s.first_name, last_name: s.last_name,
          team_name: s.team_name, class_name: s.class_name,
          total_points: 0, matches_played: 0,
          points_1pt: 0, points_2pt: 0, points_3pt: 0, matches: [],
        };
        const p = players[s.player_id];
        p.total_points   += (s.total_points_in_match || 0);
        p.matches_played += 1;
        p.points_1pt     += (s.points_1pt || 0);
        p.points_2pt     += (s.points_2pt || 0);
        p.points_3pt     += (s.points_3pt || 0);
        p.matches.push(s);
      });
      return { data: Object.values(players).sort((a,b) => b.total_points - a.total_points), error: null };
    };
  }

  // /ranking-data/:discipline
  const rankingData = path.match(/^\/ranking-data\/(.+)$/);
  if (rankingData) {
    const disc = decodeURIComponent(rankingData[1]);
    return async () => {
      const { data: fmt } = await supabase.from('tournament_format')
        .select('*').eq('discipline', disc).single();
      const { data: standingRows } = await supabase.from('standings_raw')
        .select('*').eq('discipline', disc);
      const { data: bracketMatches } = await supabase.from('matches_full')
        .select('*').eq('discipline', disc).eq('match_type','puchar');
      return {
        discipline: disc,
        has_league: fmt?.has_league || false,
        has_cup:    fmt?.has_cup    || false,
        liga:       { rows: standingRows || [], format: fmt },
        cup:        { teams: bracketMatches || [] },
      };
    };
  }

  // /player-stats/:discipline
  const playerStats = path.match(/^\/player-stats\/(.+)$/);
  if (playerStats) {
    const disc = decodeURIComponent(playerStats[1]);
    return () => supabase.from('player_stats_full').select('*')
      .eq('discipline', disc).eq('status', 'Rozegrany');
  }

  // /people/:id/stats
  const peopleStats = path.match(/^\/people\/(\d+)\/stats$/);
  if (peopleStats) {
    const pid = parseInt(peopleStats[1]);
    return () => supabase.from('player_stats_full').select('*')
      .eq('person_id', pid);
  }

  // /people/availability?ids=X
  const availMatch = path.match(/^\/people\/availability\?ids=(.+)$/);
  if (availMatch) {
    const ids = decodeURIComponent(availMatch[1]).split(',').map(Number);
    return () => supabase.from('people_availability').select('*')
      .in('person_id', ids);
  }

  // /matches?discipline=X&match_type=Y
  const discTypeMatch = path.match(/^\/matches\?discipline=([^&]+)&match_type=(.+)$/);
  if (discTypeMatch) {
    const disc = decodeURIComponent(discTypeMatch[1]);
    const type = decodeURIComponent(discTypeMatch[2]);
    return () => supabase.from('matches_full').select('*')
      .eq('discipline', disc).eq('match_type', type)
      .order('match_date').order('match_time');
  }

  // /seeding/:discipline/liga lub /seeding/:discipline/puchar
  const seedingTyped = path.match(/^\/seeding\/([^/]+)\/(liga|puchar)$/);
  if (seedingTyped) {
    const disc = decodeURIComponent(seedingTyped[1]);
    const type = seedingTyped[2];
    return () => supabase.from('seeding')
      .select('*, teams(team_name, class_name)')
      .eq('discipline', disc)
      .eq('type', type)
      .order('position');
  }

  // /seeding/:discipline
  const seedingDisc = path.match(/^\/seeding\/([^/]+)$/);
  if (seedingDisc) {
    const disc = decodeURIComponent(seedingDisc[1]);
    return () => supabase.from('seeding')
      .select('*, teams(team_name, class_name)')
      .eq('discipline', disc)
      .order('position');
  }

  // Prosty endpoint bez parametrów
  if (ENDPOINT_MAP[path]) return ENDPOINT_MAP[path];
  console.warn('api(): nieznany endpoint:', path);
  return null;
}

/* ── api() ──────────────────────────────────────────────────────────────── */
async function api(path) {
  loader(true);
  try {
    const fn = matchEndpoint(path);
    if (!fn) return null;
    const result = await fn();
    if (result && typeof result === 'object' && 'data' in result) {
      if (result.error) { console.error('Supabase:', result.error); return null; }
      return result.data;
    }
    return result;
  } catch(e) {
    console.error('api():', e);
    return null;
  } finally {
    loader(false);
  }
}

/* ── Eksport globalny ───────────────────────────────────────────────────── */
window.supabase       = supabase;
window.api            = api;
window.$              = $;
window.el             = el;
window.loader         = loader;
window.fmtDate        = fmtDate;
window.fmtTime        = fmtTime;
window.fmtScore       = fmtScore;
window.fmtSideScore   = fmtSideScore;
window.fmtScoreText   = fmtScoreText;
window.matchWinner    = matchWinner;
window.hasShootout    = hasShootout;
window.DISC_CLASS     = DISC_CLASS;
window.DISC_EMOJI     = DISC_EMOJI;
window.parseLocalDate = parseLocalDate;