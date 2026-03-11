/* ── Config ─────────────────────────────────────────────────────────────── */
const API = null; // nie używana po migracji
// supabase pochodzi z window.supabase — ustawiane przez admin.html

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)               e.className  = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const loader = on => $("loader").classList.toggle("hidden", !on);

function parseLocalDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const fmtDate = d => {
  if (!d) return "—";
  const parsed = (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    ? parseLocalDate(d) : new Date(d);
  return parsed.toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
};
const fmtTime = t => t ? t.slice(0, 5) : "";

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

const ROUND_ORDER = ['1/16', '1/8', '1/4', 'Półfinał', 'Finał'];

/* ── normFmt: tablica tournament_format → mapa {disc: fmt} ──────────── */
function normFmt(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const m = {};
    raw.forEach(f => { if (f.discipline) m[f.discipline] = f; });
    return m;
  }
  return raw;
}

/* ═══════════════════════════════════════════════════════════════════════════
   READ — matchEndpoint (GET)
   ═══════════════════════════════════════════════════════════════════════════ */

const ENDPOINT_MAP = {
  '/people':             () => supabase.from('people').select('*').order('last_name').order('first_name'),
  '/matches':            () => supabase.from('matches_full').select('*'),
  '/tournament-format':  () => supabase.from('tournament_format').select('*'),
  '/tournament-settings':() => supabase.from('tournament_settings').select('*').then(r => {
    if (r.error || !r.data) return r;
    return { data: Object.fromEntries(r.data.map(row => [row.key, row.value])), error: null };
  }),
};

function matchEndpoint(path) {

  /* ── /teams ── */
  if (path === '/teams') {
    return async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*, players(count)')
        .order('team_name');
      if (error) return { data: null, error };
      const flat = (data || []).map(t => ({
        ...t,
        player_count: t.players?.[0]?.count ?? 0,
      }));
      return { data: flat, error: null };
    };
  }

  /* ── /teams/:id ── */
  const teamById = path.match(/^\/teams\/(\d+)$/);
  if (teamById) {
    const tid = parseInt(teamById[1]);
    return () => supabase.from('teams').select('*').eq('id', tid).single();
  }

  /* ── /matches?discipline=X&match_type=Y ── (MUSI być przed samym discipline=X) */
  const discTypeMatch = path.match(/^\/matches\?discipline=([^&]+)&match_type=([^&]+)$/);
  if (discTypeMatch) {
    const disc = decodeURIComponent(discTypeMatch[1]);
    const type = decodeURIComponent(discTypeMatch[2]);
    return () => supabase.from('matches_full').select('*')
      .eq('discipline', disc).eq('match_type', type)
      .order('match_date').order('match_time');
  }

  /* ── /matches?discipline=X ── */
  const discMatch = path.match(/^\/matches\?discipline=([^&]+)$/);
  if (discMatch) {
    const disc = decodeURIComponent(discMatch[1]);
    return () => supabase.from('matches_full').select('*')
      .eq('discipline', disc)
      .order('match_date').order('match_time');
  }

  /* ── /matches?status=X ── */
  const statusMatch = path.match(/^\/matches\?status=([^&]+)$/);
  if (statusMatch) {
    return () => supabase.from('matches_full').select('*')
      .eq('status', decodeURIComponent(statusMatch[1]));
  }

  /* ── /matches/:id ── pełne dane meczu z przetworzonymi koszami/setami/połowami */
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

      const sets = setsRes.data || [];
      const teamStats = (teamStatsRes.data || []).map(ts => ({
        ...ts, team_name: ts.teams?.team_name,
      }));

      // ── Kwarty koszykówki (set_number 1–5) ──
      const quartersArray = sets
        .filter(s => s.set_number >= 1 && s.set_number <= 5)
        .map(s => ({
          quarter: s.set_number,
          t1:  s.points_t1  ?? null,
          t2:  s.points_t2  ?? null,
          to1: s.to_t1      ?? null,
          to2: s.to_t2      ?? null,
          zm1: s.subs_t1    ?? null,
          zm2: s.subs_t2    ?? null,
        }));
      const quarterTotals = {
        to1: quartersArray.reduce((a, r) => a + (r.to1 || 0), 0),
        to2: quartersArray.reduce((a, r) => a + (r.to2 || 0), 0),
        zm1: quartersArray.reduce((a, r) => a + (r.zm1 || 0), 0),
        zm2: quartersArray.reduce((a, r) => a + (r.zm2 || 0), 0),
      };

      // ── Połowy piłki nożnej (set_number 1–4) ──
      const FOOT_PERIOD_LABELS = ["1. połowa", "2. połowa", "Dogrywka I", "Dogrywka II"];
      const footParts = sets
        .filter(s => s.set_number >= 1 && s.set_number <= 4)
        .map(s => ({
          label: FOOT_PERIOD_LABELS[s.set_number - 1] || `Część ${s.set_number}`,
          t1:  s.points_t1 ?? 0,
          t2:  s.points_t2 ?? 0,
          zm1: s.subs_t1   ?? 0,
          zm2: s.subs_t2   ?? 0,
        }));

      // ── Rzuty karne ──
      const hasPenalty = m.shootout_t1 != null && m.shootout_t2 != null;
      const penaltyScore = hasPenalty
        ? { t1: Number(m.shootout_t1), t2: Number(m.shootout_t2) }
        : null;

      return {
        match:         m,
        sets,
        playerStats:   playerStatsRes.data || [],
        teamStats,
        logs:          logsRes.data || [],
        quarters:      quartersArray,
        quarterTotals,
        footParts,
        penaltyScore,
      };
    };
  }

  /* ── /matches/:id/sets-data ── */
  const setsData = path.match(/^\/matches\/(\d+)\/sets-data$/);
  if (setsData) {
    const id = parseInt(setsData[1]);
    return () => supabase.from('match_periods').select('*')
      .eq('match_id', id).order('set_number');
  }

  /* ── /matches/:id/logs ── */
  const matchLogs = path.match(/^\/matches\/(\d+)\/logs$/);
  if (matchLogs) {
    const id = parseInt(matchLogs[1]);
    return () => supabase.from('match_logs').select('*')
      .eq('match_id', id).order('created_at');
  }

  /* ── /match-player-stats-by-match/:match_id ── */
  const mpsByMatch = path.match(/^\/match-player-stats-by-match\/(\d+)$/);
  if (mpsByMatch) {
    const mid = parseInt(mpsByMatch[1]);
    return () => supabase.from('match_player_stats').select('*').eq('match_id', mid);
  }

  /* ── /match-team-stats-by-match/:match_id/:team_id ── */
  const mtsByMatch = path.match(/^\/match-team-stats-by-match\/(\d+)\/(\d+)$/);
  if (mtsByMatch) {
    const mid = parseInt(mtsByMatch[1]);
    const tid = parseInt(mtsByMatch[2]);
    return async () => {
      const { data, error } = await supabase.from('match_team_stats').select('*')
        .eq('match_id', mid).eq('team_id', tid).single();
      return { data: data || {}, error };
    };
  }

  /* ── /teams/:id/players ── */
  const teamPlayers = path.match(/^\/teams\/(\d+)\/players$/);
  if (teamPlayers) {
    const tid = parseInt(teamPlayers[1]);
    return async () => {
      const { data, error } = await supabase.from('players')
        .select('*, people(first_name, last_name, class_name, role)')
        .eq('team_id', tid)
        .order('is_captain', { ascending: false });
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

  /* ── /teams/:id/profile ── pełny profil z meczami i statystykami */
  const teamProfile = path.match(/^\/teams\/(\d+)\/profile$/);
  if (teamProfile) {
    const tid = parseInt(teamProfile[1]);
    return async () => {
      const [teamRes, playersRes, matchesRes, mpsRes] = await Promise.all([
        supabase.from('teams').select('*').eq('id', tid).single(),
        supabase.from('players')
          .select('*, people(first_name, last_name, class_name, role)')
          .eq('team_id', tid)
          .order('is_captain', { ascending: false }),
        supabase.from('matches_full').select('*')
          .or(`team1_id.eq.${tid},team2_id.eq.${tid}`)
          .order('match_date').order('match_time'),
        supabase.from('player_stats_full').select('*')
          .eq('team_id', tid),
      ]);
      if (teamRes.error) return null;

      // Statystyki per zawodnik — sumowane z player_stats_full
      const statsByPlayer = {};
      (mpsRes.data || []).forEach(s => {
        if (!statsByPlayer[s.player_id]) {
          statsByPlayer[s.player_id] = {
            pts_football: 0, pts_basketball: 0, pts_volleyball: 0, pts_total: 0,
            yellow_cards: 0, red_cards: 0, personal_fouls: 0, technical_fouls: 0,
            matches_played: 0,
          };
        }
        const st = statsByPlayer[s.player_id];
        const pts = s.total_points_in_match || 0;
        if (s.discipline === 'Piłka Nożna')  st.pts_football    += pts;
        if (s.discipline === 'Koszykówka')    st.pts_basketball  += pts;
        if (s.discipline === 'Siatkówka')     st.pts_volleyball  += pts;
        st.pts_total      += pts;
        st.yellow_cards   += (s.yellow_cards   || 0);
        st.red_cards      += (s.red_cards      || 0);
        st.personal_fouls += (s.personal_fouls || 0);
        st.technical_fouls+= (s.technical_fouls|| 0);
        st.matches_played += 1;
      });

      // W/D/L per dyscyplina
      const DISCS = ['Piłka Nożna', 'Koszykówka', 'Siatkówka'];
      const discStats = {};
      DISCS.forEach(disc => {
        const dMatches = (matchesRes.data || []).filter(
          m => m.discipline === disc && m.status === 'Rozegrany'
        );
        let wins = 0, draws = 0, losses = 0;
        dMatches.forEach(m => {
          const w = matchWinner(m);
          const side = m.team1_id === tid ? 1 : 2;
          if (w === 0) draws++;
          else if (w === side) wins++;
          else losses++;
        });
        discStats[disc] = { played: dMatches.length, wins, draws, losses };
      });

      return {
        team: teamRes.data,
        players: (playersRes.data || []).map(p => ({
          ...p,
          first_name:    p.people?.first_name,
          last_name:     p.people?.last_name,
          class_name:    p.people?.class_name,
          role:          p.people?.role,
          ...(statsByPlayer[p.id] || {
            pts_football: 0, pts_basketball: 0, pts_volleyball: 0, pts_total: 0,
            yellow_cards: 0, red_cards: 0, personal_fouls: 0, technical_fouls: 0,
            matches_played: 0,
          }),
        })),
        matches:   matchesRes.data || [],
        discStats,
      };
    };
  }

  /* ── /standings-custom/:discipline ── */
  const standings = path.match(/^\/standings-custom\/(.+)$/);
  if (standings) {
    const disc = decodeURIComponent(standings[1]);
    return async () => {
      // Pobierz format, drużyny z seeding (WSZYSTKIE zgłoszone) i rozegrane mecze
      const [fmtRes, seedRes, playedRes] = await Promise.all([
        supabase.from('tournament_format').select('*').eq('discipline', disc).single(),
        supabase.from('seeding').select('team_id, teams(id, team_name, class_name)')
          .eq('discipline', disc).eq('type', 'liga').order('position'),
        supabase.from('standings_raw').select('*').eq('discipline', disc),
      ]);

      const fmt      = fmtRes.data;
      const pts_win  = fmt?.pts_win  ?? 3;
      const pts_draw = fmt?.pts_draw ?? 1;
      const pts_loss = fmt?.pts_loss ?? 0;

      // Zbuduj mapę wyników dla drużyn które już grały
      const playedMap = {};
      (playedRes.data || []).forEach(r => { playedMap[r.team_id] = r; });

      // Połącz: WSZYSTKIE drużyny z seeding, uzupełnij zerami jeśli nie grały
      const seedTeams = (seedRes.data || []).map(s => s.teams).filter(Boolean);

      // Fallback: jeśli brak seeding — użyj standings_raw (stare zachowanie)
      const baseList = seedTeams.length > 0
        ? seedTeams.map(t => {
            const r = playedMap[t.id] || {};
            return {
              team_id:    t.id,
              team_name:  t.team_name,
              class_name: t.class_name,
              played:     Number(r.played  || 0),
              wins:       Number(r.wins    || 0),
              draws:      Number(r.draws   || 0),
              losses:     Number(r.losses  || 0),
              gf:         Number(r.gf      || 0),
              ga:         Number(r.ga      || 0),
            };
          })
        : (playedRes.data || []).map(r => ({ ...r,
            played: Number(r.played || 0), wins: Number(r.wins || 0),
            draws:  Number(r.draws  || 0), losses: Number(r.losses || 0),
            gf:     Number(r.gf     || 0), ga: Number(r.ga || 0),
          }));

      let withPts = baseList.map(r => ({
        ...r,
        gd:  r.gf - r.ga,
        pts: r.wins * pts_win + r.draws * pts_draw + r.losses * pts_loss,
      }));

      // Siatkówka: pobierz bilans setów z match_periods
      if (disc === 'Siatkówka') {
        const { data: matchesVol } = await supabase.from('matches')
          .select('id, team1_id, team2_id')
          .eq('discipline', 'Siatkówka').eq('status', 'Rozegrany').eq('match_type', 'liga');

        if (matchesVol && matchesVol.length) {
          const matchIds = matchesVol.map(m => m.id);
          const { data: periods } = await supabase.from('match_periods')
            .select('match_id, points_t1, points_t2').in('match_id', matchIds);

          const matchMap = {};
          matchesVol.forEach(m => { matchMap[m.id] = m; });

          const setStats = {};
          (periods || []).forEach(p => {
            const m = matchMap[p.match_id];
            if (!m) return;
            [m.team1_id, m.team2_id].forEach(tid => {
              if (!setStats[tid]) setStats[tid] = { sw: 0, sl: 0, pf: 0, pa: 0 };
            });
            const w1 = p.points_t1 > p.points_t2;
            setStats[m.team1_id].sw += w1 ? 1 : 0;
            setStats[m.team1_id].sl += w1 ? 0 : 1;
            setStats[m.team1_id].pf += p.points_t1;
            setStats[m.team1_id].pa += p.points_t2;
            setStats[m.team2_id].sw += w1 ? 0 : 1;
            setStats[m.team2_id].sl += w1 ? 1 : 0;
            setStats[m.team2_id].pf += p.points_t2;
            setStats[m.team2_id].pa += p.points_t1;
          });

          withPts = withPts.map(r => {
            const sm = setStats[r.team_id] || { sw: 0, sl: 0, pf: 0, pa: 0 };
            return { ...r, gf: sm.sw, ga: sm.sl, gd: sm.sw - sm.sl,
                     pf: sm.pf, pa: sm.pa, pd: sm.pf - sm.pa };
          });
          withPts.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.pd - a.pd || b.pf - a.pf);
        } else {
          withPts.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
        }
      } else {
        withPts.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      }

      return { rows: withPts, format: fmt, discipline: disc };
    };
  }

  /* ── /bracket/:discipline ── */
  const bracket = path.match(/^\/bracket\/(.+)$/);
  if (bracket) {
    const disc = decodeURIComponent(bracket[1]);
    return async () => {
      const { data } = await supabase.from('matches_full').select('*')
        .eq('discipline', disc).eq('match_type', 'puchar');
      (data || []).sort((a, b) =>
        ROUND_ORDER.indexOf(a.cup_round) - ROUND_ORDER.indexOf(b.cup_round));
      const byRound = {};
      (data || []).forEach(m => {
        if (!byRound[m.cup_round]) byRound[m.cup_round] = { round: m.cup_round, matches: [] };
        byRound[m.cup_round].matches.push(m);
      });
      return Object.values(byRound);
    };
  }

  /* ── /top-scorers-detail/:discipline ── */
  const scorers = path.match(/^\/top-scorers-detail\/(.+)$/);
  if (scorers) {
    const disc = decodeURIComponent(scorers[1]);
    return async () => {
      // Pobierz istniejące statystyki z rozegranych meczów
      const { data: statsData } = await supabase.from('player_stats_full').select('*')
        .eq('discipline', disc).eq('status', 'Rozegrany');

      // Pobierz WSZYSTKICH zawodników ze wszystkich drużyn (niezależnie czy grali)
      const { data: allPlayers } = await supabase.from('players')
        .select('id, team_id, is_captain, people(first_name, last_name, class_name), teams(team_name, class_name)');

      const players = {};

      // Najpierw wstaw WSZYSTKICH zawodników z zerowymi statystykami
      (allPlayers || []).forEach(pl => {
        players[pl.id] = {
          player_id:     pl.id,
          first_name:    pl.people?.first_name  || '',
          last_name:     pl.people?.last_name   || '',
          team_name:     pl.teams?.team_name    || '',
          class_name:    pl.teams?.class_name   || pl.people?.class_name || '',
          is_captain:    pl.is_captain,
          total_points:  0,
          matches_played:0,
          points_1pt:    0,
          points_2pt:    0,
          points_3pt:    0,
          goals:         0,
          assists:       0,
          matches:       [],
        };
      });

      // Nadpisz/uzupełnij danymi z rozegranych meczów
      (statsData || []).forEach(s => {
        // Jeśli zawodnik nie był w allPlayers (np. usunięty), i tak go dodaj
        if (!players[s.player_id]) {
          players[s.player_id] = {
            player_id:     s.player_id,
            first_name:    s.first_name,
            last_name:     s.last_name,
            team_name:     s.team_name,
            class_name:    s.class_name,
            total_points:  0,
            matches_played:0,
            points_1pt:    0,
            points_2pt:    0,
            points_3pt:    0,
            goals:         0,
            assists:       0,
            matches:       [],
          };
        }
        const p = players[s.player_id];
        p.total_points    += (s.total_points_in_match || 0);
        p.matches_played  += 1;
        p.points_1pt      += (s.points_1pt || 0);
        p.points_2pt      += (s.points_2pt || 0);
        p.points_3pt      += (s.points_3pt || 0);
        p.goals           += (s.goals      || 0);
        p.assists         += (s.assists    || 0);
        p.matches.push(s);
      });

      // Sortuj: najpierw ci z punktami/golami, potem reszta alfabetycznie
      const sorted = Object.values(players).sort((a, b) => {
        const scoreA = a.total_points || a.goals || 0;
        const scoreB = b.total_points || b.goals || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.last_name || '').localeCompare(b.last_name || '');
      });

      return { data: sorted, error: null };
    };
  }

  /* ── /ranking-data/:discipline ── */
  const rankingData = path.match(/^\/ranking-data\/(.+)$/);
  if (rankingData) {
    const disc = decodeURIComponent(rankingData[1]);
    return async () => {
      const [fmtRes, seedRes, playedRes, bracketRes] = await Promise.all([
        supabase.from('tournament_format').select('*').eq('discipline', disc).single(),
        supabase.from('seeding').select('team_id, teams(id, team_name, class_name)')
          .eq('discipline', disc).eq('type', 'liga').order('position'),
        supabase.from('standings_raw').select('*').eq('discipline', disc),
        supabase.from('matches_full').select('*').eq('discipline', disc).eq('match_type', 'puchar'),
      ]);

      const fmt      = fmtRes.data;
      const pts_win  = fmt?.pts_win  ?? 3;
      const pts_draw = fmt?.pts_draw ?? 1;
      const pts_loss = fmt?.pts_loss ?? 0;

      // Zbuduj mapę wyników
      const playedMap = {};
      (playedRes.data || []).forEach(r => { playedMap[r.team_id] = r; });

      // WSZYSTKIE drużyny z seeding, uzupełnione zerami jeśli nie grały
      const seedTeams = (seedRes.data || []).map(s => s.teams).filter(Boolean);
      const baseList  = seedTeams.length > 0
        ? seedTeams.map(t => {
            const r = playedMap[t.id] || {};
            return {
              id: t.id, team_name: t.team_name, class_name: t.class_name,
              played:  Number(r.played  || 0), wins:   Number(r.wins   || 0),
              draws:   Number(r.draws   || 0), losses: Number(r.losses || 0),
              gf:      Number(r.gf      || 0), ga:     Number(r.ga     || 0),
            };
          })
        : (playedRes.data || []).map(r => ({ ...r,
            id: r.team_id,
            played: Number(r.played || 0), wins: Number(r.wins || 0),
            draws:  Number(r.draws  || 0), losses: Number(r.losses || 0),
            gf:     Number(r.gf     || 0), ga:    Number(r.ga     || 0),
          }));

      const ligaResult = baseList.map(r => ({
        ...r,
        gd:  r.gf - r.ga,
        pts: r.wins * pts_win + r.draws * pts_draw + r.losses * pts_loss,
      })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      ligaResult.forEach((t, i) => { t.liga_rank = i + 1; });

      // Puchar — wyznacz najdalszy etap każdej drużyny
      const cupMap = {};
      const ensure = (id, name) => {
        if (!cupMap[id]) cupMap[id] = {
          teamId: id, teamName: name,
          bestRoundIdx: -1, bestRound: null, wonFinal: false,
        };
      };
      const bracketMatches = bracketRes.data || [];
      bracketMatches.forEach(m => {
        const rIdx = ROUND_ORDER.indexOf(m.cup_round);
        ensure(m.team1_id, m.team1_name);
        ensure(m.team2_id, m.team2_name);
        [m.team1_id, m.team2_id].forEach(tid => {
          if (rIdx > cupMap[tid].bestRoundIdx) {
            cupMap[tid].bestRoundIdx = rIdx;
            cupMap[tid].bestRound    = m.cup_round;
          }
        });
        if (m.status === 'Rozegrany') {
          const s1 = m.shootout_t1 ?? m.score_t1 ?? 0;
          const s2 = m.shootout_t2 ?? m.score_t2 ?? 0;
          const winnerId = s1 > s2 ? m.team1_id : m.team2_id;
          if (m.cup_round === 'Finał') cupMap[winnerId].wonFinal = true;
        }
      });

      const cupPlaceLabel = (rIdx, wonFinal) => {
        if (rIdx < 0) return null;
        const round = ROUND_ORDER[rIdx];
        if (round === 'Finał')    return wonFinal ? '1.' : '2.';
        if (round === 'Półfinał') return '3–4.';
        if (round === '1/4')      return '5–8.';
        if (round === '1/8')      return '9–16.';
        if (round === '1/16')     return '17–32.';
        return null;
      };

      const cupData = Object.values(cupMap).map(t => ({
        ...t,
        placeLabel: cupPlaceLabel(t.bestRoundIdx, t.wonFinal),
      }));

      return {
        discipline: disc,
        has_league: !!(fmt?.has_league),
        has_cup:    !!(fmt?.has_cup),
        liga:  { rows: ligaResult, format: { pts_win, pts_draw, pts_loss }, total: ligaResult.length },
        cup:   { teams: cupData, total: cupData.length,
                 rounds: ROUND_ORDER.filter(r => bracketMatches.some(m => m.cup_round === r)) },
      };
    };
  }

  /* ── /player-stats/:discipline ── */
  const playerStats = path.match(/^\/player-stats\/(.+)$/);
  if (playerStats) {
    const disc = decodeURIComponent(playerStats[1]);
    return () => supabase.from('player_stats_full').select('*')
      .eq('discipline', disc).eq('status', 'Rozegrany');
  }

  /* ── /people/:id/stats ── */
  const peopleStats = path.match(/^\/people\/(\d+)\/stats$/);
  if (peopleStats) {
    const pid = parseInt(peopleStats[1]);
    return async () => {
      const [personRes, refMatches, clerkMatches] = await Promise.all([
        supabase.from('people').select('*').eq('id', pid).single(),
        supabase.from('matches_full').select('*').eq('referee_id', pid).order('match_date', { ascending: false }),
        supabase.from('matches_full').select('*').eq('clerk_id', pid).order('match_date', { ascending: false }),
      ]);
      if (personRes.error) return { data: null, error: personRes.error };
      return {
        data: {
          person:    personRes.data,
          asReferee: refMatches.data  || [],
          asClerk:   clerkMatches.data || [],
        },
        error: null,
      };
    };
  }

  /* ── /people/availability?ids=X ── */
  const availMatch = path.match(/^\/people\/availability\?ids=(.+)$/);
  if (availMatch) {
    const ids = decodeURIComponent(availMatch[1]).split(',').map(Number);
    return () => supabase.from('people_availability').select('*').in('person_id', ids);
  }

  /* ── /seeding/:discipline/(liga|puchar) ── */
  const seedingTyped = path.match(/^\/seeding\/([^/]+)\/(liga|puchar)$/);
  if (seedingTyped) {
    const disc = decodeURIComponent(seedingTyped[1]);
    const type = seedingTyped[2];
    return () => supabase.from('seeding')
      .select('*, teams(team_name, class_name)')
      .eq('discipline', disc).eq('type', type)
      .order('position');
  }

  /* ── /seeding/:discipline ── */
  const seedingDisc = path.match(/^\/seeding\/([^/]+)$/);
  if (seedingDisc) {
    const disc = decodeURIComponent(seedingDisc[1]);
    return () => supabase.from('seeding')
      .select('*, teams(team_name, class_name)')
      .eq('discipline', disc)
      .order('position');
  }

  /* ── Proste endpointy bez parametrów ── */
  if (ENDPOINT_MAP[path]) return ENDPOINT_MAP[path];
  console.warn('api(): nieznany endpoint:', path);
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   READ api(path)
   ═══════════════════════════════════════════════════════════════════════════ */
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
  } catch (e) {
    console.error('api():', e);
    return null;
  } finally {
    loader(false);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRITE — apiPost / apiPatch / apiDelete / apiPut
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Helpers wewnętrzne ── */
function _sbErr(res, label) {
  if (res.error) { console.error(`[${label}]`, res.error); return true; }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────
   MECZE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Utwórz mecz.
 * Body: { discipline, match_type, team1_id, team2_id, match_date, match_time,
 *         status, court, duration_min, cup_round, referee_id, clerk_id }
 */
async function createMatch(body) {
  loader(true);
  try {
    const {
      discipline, team1_id, team2_id,
      match_type = 'liga', cup_round = null,
      match_date = null, match_time = null,
      status = 'Planowany', court = null,
      duration_min = 60, referee_id = null, clerk_id = null,
    } = body;

    if (!discipline || !team1_id || !team2_id)
      return { error: 'Wymagane pola: discipline, team1_id, team2_id' };

    const { data, error } = await supabase.from('matches').insert([{
      discipline, match_type, cup_round,
      team1_id, team2_id,
      match_date, match_time, status, court,
      duration_min, referee_id, clerk_id,
    }]).select().single();

    if (error) return { error: error.message };
    // Zwróć wzbogacone dane z widoku
    const full = await supabase.from('matches_full').select('*').eq('id', data.id).single();
    return full.data || data;
  } finally { loader(false); }
}

/**
 * Zaktualizuj mecz (dowolne pola).
 * Dozwolone: match_date, match_time, status, cup_round, match_type,
 *            score_t1, score_t2, shootout_t1, shootout_t2,
 *            referee_id, clerk_id, location, referee_notes, referee_note,
 *            court, duration_min
 */
async function updateMatch(id, body) {
  loader(true);
  try {
    const ALLOWED = [
      'match_date', 'match_time', 'status', 'cup_round', 'match_type',
      'score_t1', 'score_t2', 'shootout_t1', 'shootout_t2',
      'referee_id', 'clerk_id', 'location', 'referee_notes', 'referee_note',
      'court', 'duration_min',
    ];
    const patch = {};
    ALLOWED.forEach(k => { if (k in body) patch[k] = body[k] ?? null; });
    if (!Object.keys(patch).length) return { error: 'Brak pól do aktualizacji' };

    const { error } = await supabase.from('matches').update(patch).eq('id', id);
    if (error) return { error: error.message };
    const full = await supabase.from('matches_full').select('*').eq('id', id).single();
    return full.data || { ok: true };
  } finally { loader(false); }
}

/** Usuń mecz (kaskada w bazie obsługuje powiązane rekordy). */
async function deleteMatch(id) {
  loader(true);
  try {
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) return { error: error.message };
    return { deleted: true, id: Number(id) };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   DRUŻYNY
   ───────────────────────────────────────────────────────────────────────── */

/** Utwórz drużynę. Body: { team_name, class_name } */
async function createTeam(body) {
  loader(true);
  try {
    const { team_name, class_name = '' } = body;
    if (!team_name?.trim()) return { error: 'Nazwa drużyny jest wymagana' };
    const { data, error } = await supabase.from('teams')
      .insert([{ team_name: team_name.trim(), class_name: class_name.trim() }])
      .select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/** Zaktualizuj drużynę. Body: { team_name?, class_name? } */
async function updateTeam(id, body) {
  loader(true);
  try {
    const patch = {};
    if (body.team_name !== undefined) patch.team_name = body.team_name;
    if (body.class_name !== undefined) patch.class_name = body.class_name;
    if (!Object.keys(patch).length) return { error: 'Brak pól do aktualizacji' };
    const { data, error } = await supabase.from('teams').update(patch).eq('id', id).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/**
 * Usuń drużynę.
 * UWAGA: FK w bazie ma ON DELETE CASCADE dla players i seeding.
 * Mecze z tą drużyną NIE mają kaskady — usuwamy je ręcznie.
 */
async function deleteTeam(id) {
  loader(true);
  try {
    // Znajdź mecze tej drużyny i usuń powiązane dane
    const { data: affectedMatches } = await supabase.from('matches').select('id')
      .or(`team1_id.eq.${id},team2_id.eq.${id}`);

    if (affectedMatches && affectedMatches.length) {
      const matchIds = affectedMatches.map(m => m.id);
      // Kolejność usuwania: stats → periods → logs → matches
      await supabase.from('match_player_stats').delete().in('match_id', matchIds);
      await supabase.from('match_team_stats').delete().in('match_id', matchIds);
      await supabase.from('match_periods').delete().in('match_id', matchIds);
      await supabase.from('match_logs').delete().in('match_id', matchIds);
      await supabase.from('matches').delete().in('id', matchIds);
    }

    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) return { error: error.message };
    return { ok: true, deleted_id: id };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   ZAWODNICY
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Dodaj zawodnika do drużyny.
 * Body: { team_id, first_name, last_name, class_name, is_captain,
 *         rodo_consent, participation_consent, entry_fee_paid, person_id? }
 * Jeśli person_id podany — dołącza istniejącą osobę.
 * Jeśli nie — tworzy nową osobę w tabeli people.
 */
async function createPlayer(body) {
  loader(true);
  try {
    const {
      team_id, first_name, last_name, class_name = '',
      is_captain = false, rodo_consent = false,
      participation_consent = false, entry_fee_paid = 0,
      person_id,
    } = body;

    if (!team_id) return { error: 'Drużyna jest wymagana' };

    let personId = person_id;
    if (!personId) {
      if (!first_name?.trim() || !last_name?.trim())
        return { error: 'Imię i nazwisko są wymagane' };

      const { data: newPerson, error: pErr } = await supabase.from('people')
        .insert([{
          first_name: first_name.trim(),
          last_name:  last_name.trim(),
          class_name: class_name.trim() || null,
          role:       'Zawodnik',
        }]).select().single();
      if (pErr) return { error: pErr.message };
      personId = newPerson.id;
    }

    const { data, error } = await supabase.from('players')
      .insert([{
        person_id: personId, team_id,
        is_captain, rodo_consent, participation_consent,
        entry_fee_paid,
      }]).select('*, people(first_name, last_name, class_name, role)').single();

    if (error) return { error: error.message };
    return {
      ...data,
      first_name: data.people?.first_name,
      last_name:  data.people?.last_name,
      class_name: data.people?.class_name,
      role:       data.people?.role,
    };
  } finally { loader(false); }
}

/**
 * Zaktualizuj zawodnika.
 * Body: { is_captain?, rodo_consent?, participation_consent?, entry_fee_paid? }
 */
async function updatePlayer(id, body) {
  loader(true);
  try {
    const ALLOWED = ['is_captain', 'rodo_consent', 'participation_consent', 'entry_fee_paid'];
    const patch = {};
    ALLOWED.forEach(k => { if (k in body) patch[k] = body[k]; });
    if (!Object.keys(patch).length) return { error: 'Brak pól do aktualizacji' };
    const { data, error } = await supabase.from('players').update(patch).eq('id', id)
      .select('*, people(first_name, last_name, class_name, role)').single();
    if (error) return { error: error.message };
    return {
      ...data,
      first_name: data.people?.first_name,
      last_name:  data.people?.last_name,
      class_name: data.people?.class_name,
    };
  } finally { loader(false); }
}

/** Usuń zawodnika (kaskada usuwa match_player_stats). */
async function deletePlayer(id) {
  loader(true);
  try {
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) return { error: error.message };
    return { ok: true, deleted_id: id };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   OSOBY (Sędziowie / Protokolanci)
   ───────────────────────────────────────────────────────────────────────── */

/** Utwórz osobę. Body: { first_name, last_name, class_name, role } */
async function createPerson(body) {
  loader(true);
  try {
    const { first_name, last_name, class_name = '', role = 'Sędzia' } = body;
    if (!first_name?.trim() || !last_name?.trim())
      return { error: 'Imię i nazwisko są wymagane' };
    const VALID_ROLES = ['Zawodnik', 'Sędzia', 'Protokolant', 'Obie role'];
    const { data, error } = await supabase.from('people')
      .insert([{
        first_name: first_name.trim(),
        last_name:  last_name.trim(),
        class_name: class_name.trim() || null,
        role:       VALID_ROLES.includes(role) ? role : 'Sędzia',
      }]).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/** Zaktualizuj osobę. Body: { first_name?, last_name?, class_name?, role? } */
async function updatePerson(id, body) {
  loader(true);
  try {
    const VALID_ROLES = ['Zawodnik', 'Sędzia', 'Protokolant', 'Obie role'];
    const patch = {};
    if (body.first_name !== undefined) patch.first_name = body.first_name.trim();
    if (body.last_name  !== undefined) patch.last_name  = body.last_name.trim();
    if (body.class_name !== undefined) patch.class_name = body.class_name?.trim() || null;
    if (body.role       !== undefined) patch.role       = VALID_ROLES.includes(body.role) ? body.role : undefined;
    if (!Object.keys(patch).length) return { error: 'Brak pól do aktualizacji' };
    const { data, error } = await supabase.from('people').update(patch).eq('id', id).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/** Usuń osobę (sprawdza czy nie jest zawodnikiem). */
async function deletePerson(id) {
  loader(true);
  try {
    const { data: asPlayer } = await supabase.from('players').select('id').eq('person_id', id).maybeSingle();
    if (asPlayer) return { error: 'Nie można usunąć — osoba jest zawodnikiem w drużynie' };
    // Wyczyść referencje w meczach
    await supabase.from('matches').update({ referee_id: null }).eq('referee_id', id);
    await supabase.from('matches').update({ clerk_id:   null }).eq('clerk_id',   id);
    const { error } = await supabase.from('people').delete().eq('id', id);
    if (error) return { error: error.message };
    return { deleted: true, id: Number(id) };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   DOSTĘPNOŚĆ SĘDZIÓW
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zastąp całą dostępność osoby (idempotentny PUT).
 * slots: [{ day_of_week, hour_start, hour_end }, ...]
 */
async function saveAvailability(personId, slots) {
  loader(true);
  try {
    // Usuń stare
    await supabase.from('people_availability').delete().eq('person_id', personId);
    if (!Array.isArray(slots) || !slots.length)
      return { saved: 0, slots: [] };

    const valid = slots.filter(s =>
      s.day_of_week >= 0 && s.day_of_week <= 6 &&
      s.hour_start >= 0 && s.hour_end <= 24 && s.hour_start < s.hour_end
    ).map(s => ({
      person_id:   personId,
      day_of_week: s.day_of_week,
      hour_start:  parseFloat(s.hour_start),
      hour_end:    parseFloat(s.hour_end),
    }));

    if (!valid.length) return { saved: 0, slots: [] };
    const { data, error } = await supabase.from('people_availability').insert(valid).select();
    if (error) return { error: error.message };
    return { saved: data.length, slots: data };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   FORMAT TURNIEJU
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zapisz/zaktualizuj format dyscypliny (upsert po discipline).
 * Body: { has_league, has_cup, pts_win, pts_draw, pts_loss,
 *         teams_per_group, groups_count, cup_rounds[] }
 */
async function saveTournamentFormat(discipline, body) {
  loader(true);
  try {
    const patch = {
      discipline,
      has_league:      body.has_league      ?? false,
      has_cup:         body.has_cup         ?? false,
      pts_win:         body.pts_win         ?? 3,
      pts_draw:        body.pts_draw        ?? 1,
      pts_loss:        body.pts_loss        ?? 0,
      teams_per_group: body.teams_per_group ?? 4,
      groups_count:    body.groups_count    ?? 1,
      cup_rounds:      body.cup_rounds      ?? ['1/4', 'Półfinał', 'Finał'],
    };

    if (patch.teams_per_group < 2) return { error: 'teams_per_group musi być ≥ 2' };
    if (patch.groups_count    < 1) return { error: 'groups_count musi być ≥ 1' };

    const { data, error } = await supabase.from('tournament_format')
      .upsert(patch, { onConflict: 'discipline' }).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   USTAWIENIA TURNIEJU
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zaktualizuj ustawienia ogólne (upsert per klucz).
 * Body: { name?, date_from?, date_to?, location?, organizer?, ...etc }
 */
async function saveTournamentSettings(body) {
  loader(true);
  try {
    const ALLOWED = [
      'name', 'date_from', 'date_to', 'location', 'organizer', 'description',
      'football_half_duration', 'football_half_count', 'football_overtime_duration',
      'football_substitutions_limit', 'football_substitutions_per',
      'football_penalty_shootout', 'football_penalty_shooters', 'football_penalty_wins',
      'basketball_periods', 'basketball_period_duration', 'basketball_overtime_duration',
      'basketball_substitutions_limit', 'basketball_substitutions_per',
      'basketball_timeouts_limit', 'basketball_timeouts_per',
      'basketball_team_foul_limit', 'basketball_team_fouls_per',
      'basketball_player_foul_limit', 'basketball_tech_foul_limit',
      'volleyball_sets_to_win', 'volleyball_points_per_set', 'volleyball_advantage_rule',
      'volleyball_tiebreak_points', 'volleyball_tiebreak_advantage',
      'volleyball_substitutions_limit', 'volleyball_substitutions_per',
      'volleyball_timeouts_limit', 'volleyball_timeouts_per',
    ];
    const rows = Object.entries(body)
      .filter(([k]) => ALLOWED.includes(k))
      .map(([k, v]) => ({ key: k, value: String(v ?? '') }));

    if (!rows.length) return { error: 'Brak dozwolonych pól' };
    const { error } = await supabase.from('tournament_settings')
      .upsert(rows, { onConflict: 'key' });
    if (error) return { error: error.message };
    // Zwróć pełne ustawienia jako {key: value}
    const { data } = await supabase.from('tournament_settings').select('*');
    return Object.fromEntries((data || []).map(r => [r.key, r.value]));
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   ROZSTAWIENIE (SEEDING)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zapisz rozstawienie (zastępuje istniejące dla discipline+type).
 * seeds: [{ team_id, position }, ...]
 */
async function saveSeeding(discipline, type, seeds) {
  loader(true);
  try {
    if (!discipline || !type || !Array.isArray(seeds))
      return { error: 'Wymagane: discipline, type, seeds[]' };

    await supabase.from('seeding').delete()
      .eq('discipline', discipline).eq('type', type);

    if (!seeds.length) return { ok: true, saved: 0 };

    const rows = seeds.map(s => ({
      discipline, type,
      team_id:  s.team_id,
      position: s.position,
    }));

    const { data, error } = await supabase.from('seeding').insert(rows).select();
    if (error) return { error: error.message };
    return { ok: true, saved: data.length };
  } finally { loader(false); }
}

/**
 * Zamknij ligę i wyłoń awansujących do pucharu.
 * Oblicza tabelę z rozegranych meczów i wstawia top drużyny do Seeding(type='puchar').
 */
async function closeLeague(discipline) {
  loader(true);
  try {
    const { data: fmt } = await supabase.from('tournament_format')
      .select('*').eq('discipline', discipline).single();
    if (!fmt) return { error: 'Brak Tournament_Format dla dyscypliny: ' + discipline };

    const pts_win  = fmt.pts_win  ?? 3;
    const pts_draw = fmt.pts_draw ?? 1;
    const pts_loss = fmt.pts_loss ?? 0;
    const groups   = fmt.groups_count    || 1;
    const perGroup = fmt.teams_per_group || 4;
    const cupRounds = Array.isArray(fmt.cup_rounds) ? fmt.cup_rounds : ['Półfinał', 'Finał'];
    const cupSize   = Math.max(2, Math.pow(2, cupRounds.length));
    const advance   = Math.round(cupSize / groups);

    const { data: ligaSeeds } = await supabase.from('seeding').select('team_id, position')
      .eq('discipline', discipline).eq('type', 'liga');
    if (!ligaSeeds || !ligaSeeds.length)
      return { error: 'Brak rozstawienia ligowego. Uzupełnij sekcję Rozstawienie.' };

    const { data: matches } = await supabase.from('matches')
      .select('team1_id, team2_id, score_t1, score_t2, shootout_t1, shootout_t2')
      .eq('discipline', discipline).eq('match_type', 'liga').eq('status', 'Rozegrany');

    // Oblicz statystyki per drużyna
    const stats = {};
    ligaSeeds.forEach(s => {
      stats[s.team_id] = { team_id: s.team_id, position: s.position, pts: 0, gd: 0, gf: 0, ga: 0 };
    });
    (matches || []).forEach(m => {
      const s1 = stats[m.team1_id], s2 = stats[m.team2_id];
      if (!s1 || !s2) return;
      const g1 = Number(m.score_t1 ?? 0), g2 = Number(m.score_t2 ?? 0);
      const e1 = m.shootout_t1 != null ? Number(m.shootout_t1) : g1;
      const e2 = m.shootout_t2 != null ? Number(m.shootout_t2) : g2;
      s1.gf += g1; s1.ga += g2; s1.gd = s1.gf - s1.ga;
      s2.gf += g2; s2.ga += g1; s2.gd = s2.gf - s2.ga;
      if (e1 > e2) { s1.pts += pts_win;  s2.pts += pts_loss; }
      else if (e1 < e2) { s1.pts += pts_loss; s2.pts += pts_win; }
      else { s1.pts += pts_draw; s2.pts += pts_draw; }
    });

    // Podziel na grupy i posortuj
    const groupMap = {};
    Object.values(stats).forEach(t => {
      const gIdx = Math.floor(t.position / perGroup);
      if (!groupMap[gIdx]) groupMap[gIdx] = [];
      groupMap[gIdx].push(t);
    });
    Object.values(groupMap).forEach(arr =>
      arr.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    );

    // Wyłoń awansujących
    const cupSeeds = [];
    for (let rank = 0; rank < advance; rank++) {
      for (let gIdx = 0; gIdx < groups; gIdx++) {
        const team = (groupMap[gIdx] || [])[rank];
        if (!team) continue;
        cupSeeds.push({ team_id: team.team_id, position: rank * groups + gIdx });
      }
    }

    if (!cupSeeds.length)
      return { error: 'Nie znaleziono drużyn do awansu. Czy mecze ligowe są rozegrane?' };

    // Zapisz rozstawienie pucharowe
    await supabase.from('seeding').delete()
      .eq('discipline', discipline).eq('type', 'puchar');
    const rows = cupSeeds.map(s => ({
      discipline, type: 'puchar',
      team_id: s.team_id, position: s.position,
    }));
    const { error } = await supabase.from('seeding').insert(rows);
    if (error) return { error: error.message };

    return { ok: true, promoted: cupSeeds.length, advance_per_group: advance, groups, seeds: cupSeeds };
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   STATYSTYKI GRACZA (MECZ)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Upsert statystyk zawodnika w meczu.
 * Body: { match_id, player_id, team_id, points_1pt, points_2pt, points_3pt,
 *         goals, assists, yellow_cards, red_cards, personal_fouls, technical_fouls }
 */
async function savePlayerStats(body) {
  loader(true);
  try {
    const {
      match_id, player_id, team_id,
      points_1pt = 0, points_2pt = 0, points_3pt = 0,
      goals = 0, assists = 0,
      yellow_cards = 0, red_cards = 0,
      personal_fouls = 0, technical_fouls = 0,
    } = body;

    if (!match_id || !player_id) return { error: 'Wymagane: match_id, player_id' };

    // UWAGA: total_points_in_match jest GENERATED ALWAYS — nie przekazujemy go do bazy
    const row = {
      match_id, player_id, team_id,
      points_1pt, points_2pt, points_3pt,
      goals, assists,
      yellow_cards, red_cards,
      personal_fouls, technical_fouls,
    };

    const { data, error } = await supabase.from('match_player_stats')
      .upsert(row, { onConflict: 'match_id,player_id' }).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/**
 * Zaktualizuj pojedyncze pola statystyk zawodnika.
 * Dozwolone: points_1pt, points_2pt, points_3pt, goals, assists,
 *            yellow_cards, red_cards, personal_fouls, technical_fouls
 */
async function updatePlayerStats(matchId, playerId, body) {
  loader(true);
  try {
    const ALLOWED = [
      'points_1pt', 'points_2pt', 'points_3pt',
      'goals', 'assists',
      'yellow_cards', 'red_cards',
      'personal_fouls', 'technical_fouls',
    ];
    const patch = {};
    ALLOWED.forEach(k => { if (k in body) patch[k] = body[k]; });
    if (!Object.keys(patch).length) return { error: 'Brak pól do aktualizacji' };

    const { data, error } = await supabase.from('match_player_stats')
      .update(patch)
      .eq('match_id', matchId).eq('player_id', playerId)
      .select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   STATYSTYKI DRUŻYNY (MECZ)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Upsert statystyk drużyny w meczu.
 * Body: { match_id, team_id, timeouts_taken, substitutions_used, team_fouls_count }
 */
async function saveTeamStats(body) {
  loader(true);
  try {
    const {
      match_id, team_id,
      timeouts_taken = 0, substitutions_used = 0, team_fouls_count = 0,
    } = body;
    if (!match_id || !team_id) return { error: 'Wymagane: match_id, team_id' };

    const { data, error } = await supabase.from('match_team_stats')
      .upsert({
        match_id, team_id,
        timeouts_taken, substitutions_used, team_fouls_count,
      }, { onConflict: 'match_id,team_id' }).select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/** Zaktualizuj pola statystyk drużyny. */
async function updateTeamStats(matchId, teamId, body) {
  loader(true);
  try {
    const ALLOWED = ['timeouts_taken', 'substitutions_used', 'team_fouls_count', 'fouls', 'timeouts'];
    const patch = {};
    ALLOWED.forEach(k => { if (k in body) patch[k] = body[k]; });
    if (!Object.keys(patch).length) return { error: 'Brak pól' };
    const { data, error } = await supabase.from('match_team_stats')
      .update(patch).eq('match_id', matchId).eq('team_id', teamId)
      .select().single();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   SETY / KWARTY / POŁOWY (match_periods)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zastąp wszystkie sety/kwarty/połowy meczu.
 * sets: [{ set_number, points_t1, points_t2, to_t1, to_t2, subs_t1, subs_t2 }, ...]
 */
async function savePeriods(matchId, sets) {
  loader(true);
  try {
    if (!Array.isArray(sets)) return { error: 'sets musi być tablicą' };
    await supabase.from('match_periods').delete().eq('match_id', matchId);
    if (!sets.length) return { ok: true, saved: 0 };

    const rows = sets.map(s => ({
      match_id:   matchId,
      set_number: s.set_number,
      points_t1:  s.points_t1  ?? 0,
      points_t2:  s.points_t2  ?? 0,
      to_t1:      s.to_t1      ?? 0,
      to_t2:      s.to_t2      ?? 0,
      subs_t1:    s.subs_t1    ?? 0,
      subs_t2:    s.subs_t2    ?? 0,
    }));

    const { data, error } = await supabase.from('match_periods').insert(rows).select();
    if (error) return { error: error.message };
    return data;
  } finally { loader(false); }
}

/* ─────────────────────────────────────────────────────────────────────────
   LOGI MECZU (match_logs)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Zapisz logi meczu (zastępuje istniejące).
 * logs: [{ type/action_type, text/description, time/event_time }, ...]
 */
async function saveLogs(matchId, logs) {
  loader(true);
  try {
    if (!Array.isArray(logs)) return { error: 'logs musi być tablicą' };
    await supabase.from('match_logs').delete().eq('match_id', matchId);
    if (!logs.length) return { ok: true, saved: 0 };

    const rows = logs.map(l => ({
      match_id:    matchId,
      event_type:  (l.type || l.action_type || l.event_type || 'info').slice(0, 30),
      description: (l.text || l.description || '').slice(0, 500),
      event_time:  l.time  || l.log_time || l.event_time || null,
    }));

    const { data, error } = await supabase.from('match_logs').insert(rows).select();
    if (error) return { error: error.message };
    return { ok: true, saved: data.length };
  } finally { loader(false); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Eksport globalny
   ═══════════════════════════════════════════════════════════════════════════ */
window.supabase             = supabase;
window.api                  = api;
window.$                    = $;
window.el                   = el;
window.loader               = loader;
window.fmtDate              = fmtDate;
window.fmtTime              = fmtTime;
window.fmtScore             = fmtScore;
window.fmtSideScore         = fmtSideScore;
window.fmtScoreText         = fmtScoreText;
window.matchWinner          = matchWinner;
window.hasShootout          = hasShootout;
window.DISC_CLASS           = DISC_CLASS;
window.DISC_EMOJI           = DISC_EMOJI;
window.parseLocalDate       = parseLocalDate;

// Operacje zapisu
window.createMatch          = createMatch;
window.updateMatch          = updateMatch;
window.deleteMatch          = deleteMatch;
window.createTeam           = createTeam;
window.updateTeam           = updateTeam;
window.deleteTeam           = deleteTeam;
window.createPlayer         = createPlayer;
window.updatePlayer         = updatePlayer;
window.deletePlayer         = deletePlayer;
window.createPerson         = createPerson;
window.updatePerson         = updatePerson;
window.deletePerson         = deletePerson;
window.saveAvailability     = saveAvailability;
window.saveTournamentFormat = saveTournamentFormat;
window.saveTournamentSettings = saveTournamentSettings;
window.saveSeeding          = saveSeeding;
window.closeLeague          = closeLeague;
window.savePlayerStats      = savePlayerStats;
window.updatePlayerStats    = updatePlayerStats;
window.saveTeamStats        = saveTeamStats;
window.updateTeamStats      = updateTeamStats;
window.savePeriods          = savePeriods;
window.saveLogs             = saveLogs;
window.normFmt              = normFmt;