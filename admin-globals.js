/* ── Config ─────────────────────────────────────────────────────────────── */
// const API = "http://localhost:3001/api";
// Stara zmienna zostawiona tylko dla bezpośrednich fetch()
// w plikach admina — zostanie usunięta w kolejnych krokach


import { supabase } from '../supabase-client.js';
const API = null; // nie używana po migracji

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)              e.className  = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const loader  = on => $("loader").classList.toggle("hidden", !on);
// Parsuje "YYYY-MM-DD" jako lokalną datę (unika przesunięcia UTC → -1 dzień)
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
const fmtTime = t  => t ? t.slice(0,5) : "";

/* ── Wynik meczu z rzutami karnymi ──────────────────────────────────────── */

/**
 * Czy mecz zakończył się rzutami karnymi?
 */
function hasShootout(m) {
  return m != null && m.shootout_t1 != null && m.shootout_t1 !== "";
}

/**
 * Wynik jednej strony: "2" lub "2 (4k.)" jeśli były rzuty karne.
 * side = 1 | 2
 */
function fmtSideScore(m, side) {
  const base = side === 1 ? m.score_t1 : m.score_t2;
  const pen  = side === 1 ? m.shootout_t1 : m.shootout_t2;
  if (base == null) return "—";
  if (hasShootout(m)) return `${base} <sup class="pen-sup">(${pen}k.)</sup>`;
  return String(base);
}

/**
 * Wynik obu stron do inline: "1:0" lub "1:0 (3:2 k.)" jeśli były rzuty karne.
 */
function fmtScore(m) {
  if (m.score_t1 == null) return "—";
  const base = `${m.score_t1}:${m.score_t2}`;
  if (hasShootout(m)) return `${base} <span class="pen-inline">(${m.shootout_t1}:${m.shootout_t2} k.)</span>`;
  return base;
}

/**
 * Wynik obu stron plain-text (bez HTML) np. do title/tooltip.
 */
function fmtScoreText(m) {
  if (m.score_t1 == null) return "—";
  const base = `${m.score_t1}:${m.score_t2}`;
  if (hasShootout(m)) return `${base} (${m.shootout_t1}:${m.shootout_t2} k.)`;
  return base;
}

/**
 * Który team wygrał uwzględniając rzuty karne?
 * Zwraca 1, 2, lub 0 (remis — tylko liga bez dogrywki).
 */
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

// async function api(path) {
//   loader(true);
//   try {
//     const r = await fetch(API + path);
//     if (!r.ok) throw new Error(`HTTP ${r.status}`);
//     return await r.json();
//   } catch(e) {
//     console.error("API:", e);
//     return null;
//   } finally {
//     loader(false);
//   }
// }
// Mapowanie endpointów → tabele Supabase
// Używane przez api() do prostych zapytań GET
const ENDPOINT_MAP = {
  '/teams':              () => supabase.from('teams').select('*'),
  '/people':             () => supabase.from('people').select('*'),
  '/matches':            () => supabase.from('matches_full').select('*'),
  '/tournament-format':  () => supabase.from('tournament_format').select('*'),
  '/tournament-settings':() => supabase.from('tournament_settings').select('*'),
};

// Regex do endpointów z parametrami
function matchEndpoint(path) {
  // /matches?discipline=X
  const discMatch = path.match(/^\/matches\?discipline=(.+)$/);
  if (discMatch) {
    const disc = decodeURIComponent(discMatch[1]);
    return () => supabase.from('matches_full').select('*')
                         .eq('discipline', disc)
                         .order('match_date').order('match_time');
  }
  // /matches?status=Rozegrany
  const statusMatch = path.match(/^\/matches\?status=(.+)$/);
  if (statusMatch) {
    return () => supabase.from('matches_full').select('*')
                         .eq('status', decodeURIComponent(statusMatch[1]));
  }
  // /matches/:id — szczegóły pojedynczego meczu
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
      // Odtwórz format odpowiedzi serwera
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
    return () => supabase.from('players')
      .select('*, people(first_name, last_name)')
      .eq('team_id', tid);
  }
  // Prosty endpoint bez parametrów
  if (ENDPOINT_MAP[path]) return ENDPOINT_MAP[path];
  console.warn('api(): nieznany endpoint:', path);
  return null;
}

async function api(path) {
  loader(true);
  try {
    const fn = matchEndpoint(path);
    if (!fn) return null;
    const result = await fn();
    // Supabase zwraca { data, error } lub bezpośredni obiekt
    if (result && typeof result === 'object' && 'data' in result) {
      if (result.error) { console.error('Supabase:', result.error); return null; }
      return result.data;
    }
    return result; // złożone zapytania zwracają już gotowy obiekt
  } catch(e) {
    console.error('api():', e);
    return null;
  } finally {
    loader(false);
  }
}
/* ── Eksport globalny (wymagany bo pozostałe skrypty nie są modułami) ──── */
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