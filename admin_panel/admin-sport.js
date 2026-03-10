/* ── normFmt: konwertuje tablicę tournament_format → mapę {disc: fmt} ──── */
function normFmt(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const map = {};
    raw.forEach(f => { if (f.discipline) map[f.discipline] = f; });
    return map;
  }
  return raw;
}

/* ════════════════════════════════════════════════════════════════════════════
   WIDOKI SPORTOWE — tabele ligowe + drabinka pucharowa
   Używa punktacji z Tournament_Format (pts_win / pts_draw / pts_loss)
════════════════════════════════════════════════════════════════════════════ */

const SV_DISC_KEY = {
  "Piłka Nożna": "football",
  "Koszykówka":  "basketball",
  "Siatkówka":   "volleyball",
};

const SV_COLOR = {
  "Piłka Nożna": "#22c55e",
  "Koszykówka":  "#fb923c",
  "Siatkówka":   "#a78bfa",
};

const CUP_ROUND_ORDER = ["1/16","1/8","1/4","Półfinał","Finał","Inne"];

// ── Główna funkcja ładująca ───────────────────────────────────────────────────

async function loadSportView(discipline) {
  const slug  = SV_DISC_KEY[discipline];
  const bodyEl  = $(`sv-${slug}-body`);
  const tabsEl  = $(`sv-${slug}-tabs`);
  const badgesEl = $(`sv-${slug}-badges`);

  bodyEl.innerHTML = `<div class="panel-loading">Ładowanie danych…</div>`;
  tabsEl.innerHTML = "";
  badgesEl.innerHTML = "";

  // Pobierz format, tabelę i bracket równolegle
  const [fmtAll, standingsData, bracketData, matchesData] = await Promise.all([
    api('/tournament-format'),
    api(`/standings-custom/${encodeURIComponent(discipline)}`),
    api(`/bracket/${encodeURIComponent(discipline)}`),
    api(`/matches?discipline=${encodeURIComponent(discipline)}`),
  ]);

  const fmt = fmtAll[discipline] || {};
  const hasLeague = !!fmt.has_league;
  const hasCup    = !!fmt.has_cup;

  // Badges formatu
  badgesEl.innerHTML = [
    hasLeague ? `<span class="sv-badge sv-badge--league">📊 Liga</span>` : "",
    hasCup    ? `<span class="sv-badge sv-badge--cup">🏆 Puchar</span>`  : "",
    !hasLeague && !hasCup ? `<span class="sv-badge sv-badge--none">— brak formatu —</span>` : "",
  ].join("");

  // Zakładki
  const tabs = [];
  if (hasLeague) tabs.push({ id: "liga",    label: "📊 Tabela ligowa" });
  if (hasCup)    tabs.push({ id: "puchar",  label: "🏆 Drabinka pucharowa" });
  tabs.push({ id: "terminarz", label: "📅 Terminarz" });
  if (discipline === "Piłka Nożna")  tabs.push({ id: "strzelcy", label: "⚽ Strzelcy" });
  if (discipline === "Koszykówka")   tabs.push({ id: "strzelcy", label: "🏀 Rzucający" });

  tabsEl.innerHTML = tabs.map((t, i) =>
    `<button class="sv-tab ${i === 0 ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
  ).join("");

  tabsEl.querySelectorAll(".sv-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll(".sv-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      svShowTab(slug, btn.dataset.tab, { fmt, standingsData, bracketData, matchesData, discipline });
    });
  });

  // Pokaż pierwszą zakładkę
  const firstTab = tabs[0]?.id || "terminarz";
  svShowTab(slug, firstTab, { fmt, standingsData, bracketData, matchesData, discipline });
}

// ── Przełączanie zakładki ─────────────────────────────────────────────────────

function svShowTab(slug, tab, ctx) {
  const bodyEl = $(`sv-${slug}-body`);

  document.querySelectorAll(`#sv-${slug}-tabs .sv-tab`).forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );

  if (tab === "liga") {
    bodyEl.innerHTML = svBuildLeague(ctx);

    // Toggle SW/SP i P+/P− w tabeli siatkówkowej
    bodyEl.querySelectorAll('.sv-th-toggle').forEach(th => {
      th.addEventListener('click', () => {
        const table  = th.closest('table');
        const which  = th.dataset.toggle;           // "sets" | "pts"
        const active = table.classList.toggle(`sv-vb-show-${which}`);
        th.querySelector('.sv-toggle-icon').textContent = active ? '⊖' : '⊕';
      });
    });

    // Podepnij przycisk końca fazy ligowej
    const discSlug = ctx.discipline.replace(/\s/g, '-');
    const endBtn = document.getElementById(`sv-end-btn-${discSlug}`);
    if (endBtn) {
      endBtn.addEventListener("click", async () => {
        const confirmed = confirm(
          `Zakończyć fazę ligową dla ${ctx.discipline}?\n\nZostaną automatycznie utworzone mecze pierwszej rundy pucharu z awansującymi drużynami.`
        );
        if (!confirmed) return;

        endBtn.disabled = true;
        endBtn.textContent = '⏳ Tworzę parowania…';

        const result = await svEndLeague(ctx.discipline, ctx.fmt, ctx.standingsData);

        if (result.ok) {
          endBtn.closest('.sv-end-league').innerHTML = `
            <div class="sv-end-success">
              ✅ Utworzono ${result.created} meczów w rundzie <strong>${result.firstRound}</strong>.<br>
              <div class="sv-end-pairs">
                ${result.pairs.map(p => `<span class="sv-pair-chip">${p.t1.label} <em>${p.t1.team_name}</em> vs <em>${p.t2.team_name}</em> ${p.t2.label}</span>`).join('')}
              </div>
              Przeładowuję drabinkę i planer…
            </div>`;

          // Odśwież cały widok sportowy — pobierze świeże bracketData z serwera
          await loadSportView(ctx.discipline);

          // Powiadom moduł planowania o nowych meczach (jeśli był załadowany)
          if (typeof initPlanowanie === 'function') {
            await initPlanowanie();
          } else if (typeof forceReloadServerMatches === 'function') {
            await forceReloadServerMatches();
          }
        } else {
          endBtn.disabled = false;
          endBtn.textContent = 'Zakończ fazę ligową → losuj parowania';
          alert(`Błąd: ${result.msg}`);
        }
      });
    }
  }

  if (tab === "terminarz") {
    bodyEl.innerHTML = svBuildSchedule(ctx);
    // Delegowany click — każdy wiersz meczu otwiera zakładkę Mecze
    bodyEl.addEventListener("click", e => {
      const row = e.target.closest("[data-match-id]");
      if (row && row.dataset.matchId) navigateToMatch(Number(row.dataset.matchId));
    });
  }
  if (tab === "puchar") {
    bodyEl.innerHTML = '';
    svBuildBracket(ctx, bodyEl);
  }
  if (tab === "strzelcy") {
    bodyEl.innerHTML = `<div class="panel-loading">Ładowanie klasyfikacji…</div>`;
    svLoadAndRenderScorers(bodyEl, ctx.discipline);
  }
}

// ── TABELA LIGOWA ─────────────────────────────────────────────────────────────

function svBuildLeague({ fmt, standingsData, discipline }, containerEl) {
  if (!standingsData || !standingsData.rows) {
    return `<div class="sv-empty">Brak danych ligowych.<br>Upewnij się że format „Liga" jest włączony.</div>`;
  }

  const { rows, format } = standingsData;

  const isFootball   = discipline === 'Piłka Nożna';
  const isVolleyball = discipline === 'Siatkówka';
  const hasDraw      = isFootball;

  const groupsCount   = Math.max(1, fmt.groups_count  || 1);
  const teamsPerGroup = Math.max(2, fmt.teams_per_group || rows.length);
  const hasCup        = !!fmt.has_cup;

  // ── Ile drużyn awansuje z każdej grupy ───────────────────────────────────
  let promotedPerGroup = 0;
  let promoNote = '';
  if (hasCup && fmt.cup_rounds && fmt.cup_rounds.length) {
    const ROUND_ORDER = ['1/16','1/8','1/4','Półfinał','Finał'];
    const sorted = [...fmt.cup_rounds].sort((a,b) =>
      (ROUND_ORDER.indexOf(a) === -1 ? 99 : ROUND_ORDER.indexOf(a)) -
      (ROUND_ORDER.indexOf(b) === -1 ? 99 : ROUND_ORDER.indexOf(b))
    );
    const totalRounds       = sorted.length;
    const firstRoundMatches = Math.pow(2, totalRounds - 1);
    const totalPromoted     = firstRoundMatches * 2;
    promotedPerGroup = Math.ceil(totalPromoted / groupsCount);
    promoNote = `${promotedPerGroup} ${promotedPerGroup === 1 ? 'drużyna awansuje' : promotedPerGroup < 5 ? 'drużyny awansują' : 'drużyn awansuje'} do pucharu`;
  }

  // ── Podziel na grupy ─────────────────────────────────────────────────────
  let groups = [];
  if (groupsCount > 1) {
    for (let g = 0; g < groupsCount; g++) {
      const slice = rows.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup);
      groups.push({ name: `Grupa ${String.fromCharCode(65 + g)}`, letter: String.fromCharCode(65 + g), rows: slice });
    }
  } else {
    groups = [{ name: null, letter: 'A', rows }];
  }

  // ── Legenda ──────────────────────────────────────────────────────────────
  const legendNote = isVolleyball
    ? `<span class="sv-sport-note" title="Bil.S = bilans setów (SW−SP) · Bil.P = bilans małych punktów (P+−P−)">🏐 Bil.S = bilans setów · Bil.P = bilans pkt małych</span>`
    : discipline === 'Koszykówka'
    ? `<span class="sv-sport-note">🏀 P+/P− = punkty zdobyte/stracone</span>`
    : '';

  const ptsInfo = `
    <div class="sv-pts-legend">
      <span>Punktacja:</span>
      <span class="sv-pts-w">W = ${format.pts_win} pkt</span>
      ${hasDraw ? `<span class="sv-pts-d">R = ${format.pts_draw} pkt</span>` : ''}
      <span class="sv-pts-l">P = ${format.pts_loss} pkt</span>
      ${legendNote}
      ${hasCup && promotedPerGroup ? `<span class="sv-promo-note">🏆 ${promoNote}</span>` : ''}
    </div>`;

  // ── Nagłówki kolumn ───────────────────────────────────────────────────────
  const thead = isVolleyball ? `
    <tr>
      <th class="sv-th-pos">#</th>
      <th class="sv-th-team">Drużyna</th>
      <th title="Mecze rozegrane">M</th>
      <th title="Wygrane mecze">W</th>
      <th title="Przegrane mecze">P</th>
      <th title="Sety wygrane — kliknij Bil.S żeby zobaczyć szczegóły" class="sv-th-vb-detail sv-th-vb-sets-detail">SW</th>
      <th title="Sety przegrane — kliknij Bil.S żeby zobaczyć szczegóły" class="sv-th-vb-detail sv-th-vb-sets-detail">SP</th>
      <th title="Bilans setów (SW − SP) · kliknij aby rozwinąć/zwinąć SW i SP" class="sv-th-vb-bil sv-th-toggle" data-toggle="sets">Bil.S <span class="sv-toggle-icon">⊕</span></th>
      <th title="Małe punkty zdobyte — kliknij Bil.P żeby zobaczyć szczegóły" class="sv-th-vb-detail sv-th-vb-pts-detail">P+</th>
      <th title="Małe punkty stracone — kliknij Bil.P żeby zobaczyć szczegóły" class="sv-th-vb-detail sv-th-vb-pts-detail">P−</th>
      <th title="Bilans małych punktów (P+ − P−) · kliknij aby rozwinąć/zwinąć P+ i P−" class="sv-th-vb-bil sv-th-toggle" data-toggle="pts">Bil.P <span class="sv-toggle-icon">⊕</span></th>
      <th title="Punkty ligowe" class="sv-th-pts">Pkt</th>
    </tr>` : `
    <tr>
      <th class="sv-th-pos">#</th>
      <th class="sv-th-team">Drużyna</th>
      <th title="Mecze rozegrane">M</th>
      <th title="Wygrane">W</th>
      ${hasDraw ? `<th title="Remisy">R</th>` : ''}
      <th title="Przegrane">P</th>
      <th title="${isFootball ? 'Bramki zdobyte' : 'Punkty zdobyte'}">${isFootball ? 'G+' : 'P+'}</th>
      <th title="${isFootball ? 'Bramki stracone' : 'Punkty stracone'}">${isFootball ? 'G−' : 'P−'}</th>
      <th title="${isFootball ? 'Bilans bramkowy' : 'Bilans punktów'}">${isFootball ? 'Bil.G' : 'Bil.P'}</th>
      <th title="Punkty ligowe" class="sv-th-pts">Pkt</th>
    </tr>`;

  // ── Wiersze tabeli ────────────────────────────────────────────────────────
  function buildRow(r, i, gi) {
    const promoted  = hasCup && promotedPerGroup > 0 && i < promotedPerGroup;
    const isLast    = hasCup && promotedPerGroup > 0 && i === promotedPerGroup - 1;
    const medalIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    const rowClass  = `${i === 0 ? 'sv-row-1' : i === 1 ? 'sv-row-2' : i === 2 ? 'sv-row-3' : ''} ${promoted ? 'sv-row-promoted' : ''} ${isLast ? 'sv-row-promoted-last' : ''}`;

    const sign   = v => v > 0 ? `+${v}` : String(v);
    const bilCls = v => v > 0 ? 'sv-td-pos-gd' : v < 0 ? 'sv-td-neg-gd' : '';

    const posTd = `
      <td class="sv-td-pos">
        <span class="sv-pos-num">${medalIcon}</span>
        ${promoted ? `<span class="sv-promo-arrow" title="Awansuje do pucharu">▶</span>` : ''}
      </td>`;
    const teamTd = `
      <td class="sv-td-team">
        <span class="sv-team-name">${r.team_name}</span>
        ${r.class_name ? `<span class="sv-team-cls">${r.class_name}</span>` : ''}
      </td>`;

    if (isVolleyball) {
      const pd = r.pd ?? 0;
      return `
        <tr class="sv-tr ${rowClass}" data-team-id="${r.id}" data-team-name="${r.team_name}" data-group="${gi}" data-rank="${i}">
          ${posTd}${teamTd}
          <td>${r.played}</td>
          <td class="sv-td-w">${r.wins}</td>
          <td class="sv-td-l">${r.losses}</td>
          <td class="sv-td-vb-detail sv-td-vb-sets-detail sv-td-gf">${r.gf}</td>
          <td class="sv-td-vb-detail sv-td-vb-sets-detail sv-td-ga">${r.ga}</td>
          <td class="sv-td-vb-bil ${bilCls(r.gd)}">${sign(r.gd)}</td>
          <td class="sv-td-vb-detail sv-td-vb-pts-detail sv-td-gf">${r.pf ?? 0}</td>
          <td class="sv-td-vb-detail sv-td-vb-pts-detail sv-td-ga">${r.pa ?? 0}</td>
          <td class="sv-td-vb-bil ${bilCls(pd)}">${sign(pd)}</td>
          <td class="sv-td-pts"><strong>${r.pts}</strong></td>
        </tr>`;
    }

    return `
      <tr class="sv-tr ${rowClass}" data-team-id="${r.id}" data-team-name="${r.team_name}" data-group="${gi}" data-rank="${i}">
        ${posTd}${teamTd}
        <td>${r.played}</td>
        <td class="sv-td-w">${r.wins}</td>
        ${hasDraw ? `<td class="sv-td-d">${r.draws}</td>` : ''}
        <td class="sv-td-l">${r.losses}</td>
        <td class="sv-td-gf">${r.gf}</td>
        <td class="sv-td-ga">${r.ga}</td>
        <td class="${bilCls(r.gd)}">${sign(r.gd)}</td>
        <td class="sv-td-pts"><strong>${r.pts}</strong></td>
      </tr>`;
  }

  // ── Tabele grup ──────────────────────────────────────────────────────────
  const tables = groups.map((group, gi) => `
    ${group.name ? `<div class="sv-group-name">${group.name}</div>` : ''}
    <div class="sv-table-wrap">
      <table class="sv-table${isVolleyball ? ' sv-table--vb' : ''}">
        <thead>${thead}</thead>
        <tbody>
          ${group.rows.map((r, i) => buildRow(r, i, gi)).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  // ── Przycisk końca fazy ligowej ──────────────────────────────────────────
  const endBtn = hasCup && promotedPerGroup > 0 ? `
    <div class="sv-end-league" id="sv-end-league-${discipline.replace(/\s/g,'-')}">
      <div class="sv-end-league-info">
        <strong>🏁 Koniec fazy ligowej</strong>
        <span>Automatycznie wypełni pierwszą rundę pucharu awansującymi drużynami.</span>
      </div>
      <button class="sv-end-league-btn" id="sv-end-btn-${discipline.replace(/\s/g,'-')}">
        Zakończ fazę ligową → losuj parowania
      </button>
    </div>` : '';

  return `<div class="sv-league">${ptsInfo}${tables}${endBtn}</div>`;
}

// ── LOGIKA KOŃCA FAZY LIGOWEJ ─────────────────────────────────────────────────

async function svEndLeague(discipline, fmt, standingsData) {
  const ROUND_ORDER = ['1/16','1/8','1/4','Półfinał','Finał'];

  const groupsCount   = Math.max(1, fmt.groups_count   || 1);
  const teamsPerGroup = Math.max(2, fmt.teams_per_group || 4);
  const rows          = standingsData.rows || [];

  // Sortuj rundy
  const sorted = [...(fmt.cup_rounds || [])].sort((a,b) =>
    (ROUND_ORDER.indexOf(a) === -1 ? 99 : ROUND_ORDER.indexOf(a)) -
    (ROUND_ORDER.indexOf(b) === -1 ? 99 : ROUND_ORDER.indexOf(b))
  );
  const totalRounds        = sorted.length;
  const firstRound         = sorted[0];
  const firstRoundMatches  = Math.pow(2, totalRounds - 1);
  const totalPromoted      = firstRoundMatches * 2;
  const promotedPerGroup   = Math.ceil(totalPromoted / groupsCount);

  // Podziel tabele na grupy
  const groups = [];
  for (let g = 0; g < groupsCount; g++) {
    groups.push(rows.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup));
  }

  // Zbierz awansujących: [rank0][rank1]... z każdej grupy
  // promoted[rank][groupIndex] = team
  const promoted = [];
  for (let rank = 0; rank < promotedPerGroup; rank++) {
    promoted.push(groups.map(g => g[rank] || null).filter(Boolean));
  }

  // ── Parowanie krzyżowe ────────────────────────────────────────────────────
  // Standardowe puchary: 1.A vs 2.B, 1.B vs 2.A, 1.C vs 2.D, 1.D vs 2.C...
  // Ogólna zasada dla N grup i K awansujących: tworzymy firstRoundMatches par
  // Budujemy listę awansujących po rankach, krzyżując grupy
  const advancers = []; // lista { team_id, team_name, label: "1.A" }

  if (promotedPerGroup === 1) {
    // Każda grupa daje 1 drużynę → parujemy krzyżowo: A vs B, C vs D...
    groups.forEach((g, gi) => {
      if (g[0]) advancers.push({ ...g[0], label: `1.${String.fromCharCode(65+gi)}` });
    });
  } else {
    // Kilka awansujących z grupy — rank po rank, krzyżując
    for (let rank = 0; rank < promotedPerGroup; rank++) {
      groups.forEach((g, gi) => {
        if (g[rank]) advancers.push({ ...g[rank], label: `${rank+1}.${String.fromCharCode(65+gi)}` });
      });
    }
  }

  // Sparuj listę w pary dla 1. rundy pucharu
  // Klasyczne parowanie: pierwsza połowa vs druga połowa odwrotnie
  const half    = Math.floor(advancers.length / 2);
  const topHalf = advancers.slice(0, half);
  const botHalf = advancers.slice(half).reverse();

  const pairs = topHalf.map((t, i) => ({
    t1: t,
    t2: botHalf[i] || null,
  })).filter(p => p.t1 && p.t2);

  if (!pairs.length) {
    return { ok: false, msg: 'Brak wystarczającej liczby awansujących do stworzenia par.' };
  }

  // ── Sprawdź czy mecze w 1. rundzie już istnieją ───────────────────────────
  const existingBracket = await api(`/bracket/${encodeURIComponent(discipline)}`) || [];
  const firstRoundData  = (existingBracket.find(r => r.round === firstRound)?.matches) || [];
  if (firstRoundData.length > 0) {
    return { ok: false, msg: `Mecze w rundzie „${firstRound}" już istnieją. Usuń je najpierw.` };
  }

  // ── Utwórz mecze ─────────────────────────────────────────────────────────
  let created = 0;
  for (const pair of pairs) {
    const { error: sportMatchErr } = await supabase.from('matches').insert({
        discipline,
        match_type: 'puchar',
        cup_round:  firstRound,
        team1_id:   pair.t1.id,
        team2_id:   pair.t2.id,
        status:     'Planowany',
      });
    if (!sportMatchErr) created++;
  }

  return { ok: true, created, pairs, firstRound };
}


// ── DRABINKA PUCHAROWA — jquery.bracket ──────────────────────────────────────

function svBuildBracket({ bracketData, fmt }, containerEl) {
  const ROUND_ORDER = ['1/16','1/8','1/4','Półfinał','Finał'];

  // ── 1. Ustal rundy ────────────────────────────────────────────────────────
  let configuredRounds = (fmt.cup_rounds && fmt.cup_rounds.length)
    ? [...fmt.cup_rounds]
    : (bracketData && bracketData.length ? bracketData.map(r => r.round) : []);

  configuredRounds = [...new Set(configuredRounds)].sort((a, b) => {
    const ai = ROUND_ORDER.indexOf(a); const bi = ROUND_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (!configuredRounds.length) {
    containerEl.innerHTML = `<div class="sv-empty">Brak skonfigurowanych rund pucharowych.<br>Przejdź do <strong>Ustawienia turnieju</strong> i włącz format Puchar.</div>`;
    return;
  }

  // ── 2. Mapa meczów po rundzie ─────────────────────────────────────────────
  const matchesByRound = {};
  (bracketData || []).forEach(({ round, matches }) => { matchesByRound[round] = matches; });

  const totalRounds = configuredRounds.length;

  // ── 3. Oblicz zwycięzców propagowanych do kolejnych rund ─────────────────
  // propagated[roundIdx][slotIdx] = nazwa drużyny lub null
  const propagated = Array.from({ length: totalRounds }, () => []);

  configuredRounds.forEach((round, ri) => {
    const count = Math.pow(2, totalRounds - 1 - ri);
    const rMatches = matchesByRound[round] || [];
    for (let si = 0; si < count; si++) {
      const m = rMatches[si];
      let winner = null;
      if (m && m.status === 'Rozegrany') {
        const w = matchWinner(m);
        winner = w === 1 ? m.team1_name : w === 2 ? m.team2_name : null;
      }
      propagated[ri][si] = winner;
    }
  });

  // ── 4. Wymiary layoutu ────────────────────────────────────────────────────
  const CARD_W   = 192;   // szerokość karty meczu
  const CARD_H   = 72;    // wysokość karty
  const COL_GAP  = 48;    // odległość między kolumnami
  const COL_W    = CARD_W + COL_GAP;

  const firstCount  = Math.pow(2, totalRounds - 1);
  const SLOT_H      = Math.max(CARD_H + 20, 100); // minimalna przestrzeń na mecz
  const totalHeight = firstCount * SLOT_H + 60;   // +60 na nagłówki
  const totalWidth  = totalRounds * COL_W + 40;

  // ── 5. Zbuduj SVG ─────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('width',  totalWidth);
  svg.setAttribute('height', totalHeight);
  svg.setAttribute('class',  'bk-svg');
  svg.style.overflow = 'visible';

  // CSS wbudowany w SVG
  const style = document.createElementNS(NS, 'style');
  style.textContent = `
    .bk-card       { fill: var(--bg2,#1a1d27); stroke: var(--border,#2e3250); stroke-width:1.5; rx:8; }
    .bk-card-played{ stroke: #22c55e; stroke-width: 2; }
    .bk-card-tbd   { opacity: .6; }
    .bk-divline    { stroke: var(--border,#2e3250); stroke-width:1; }
    .bk-team-name  { font-family: system-ui,sans-serif; font-size:12px; fill:var(--text,#e0e4f3); }
    .bk-team-win   { font-weight:700; fill:#22c55e; }
    .bk-team-lose  { fill: var(--muted,#6b7280); }
    .bk-team-tbd   { fill: var(--muted,#6b7280); font-style:italic; }
    .bk-score      { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:800; }
    .bk-score-win  { fill:#22c55e; }
    .bk-score-lose { fill:var(--muted,#6b7280); }
    .bk-round-hdr  { font-family:system-ui,sans-serif; font-size:11px; font-weight:700;
                     fill:var(--muted,#6b7280); text-transform:uppercase; letter-spacing:.06em; }
    .bk-conn       { stroke:var(--border,#2e3250); stroke-width:1.5; fill:none;
                     stroke-linecap:round; stroke-linejoin:round; }
    .bk-winner-box { fill:rgba(255,215,0,.08); stroke:rgba(255,215,0,.4); stroke-width:2; }
    .bk-winner-txt { font-family:system-ui,sans-serif; font-size:13px; font-weight:800; fill:#ffd700; }
    .bk-winner-lbl { font-family:system-ui,sans-serif; font-size:10px; fill:var(--muted,#6b7280); text-transform:uppercase; letter-spacing:.07em; }
  `;
  svg.appendChild(style);

  // Zapamiętaj środki Y kart per kolumna do rysowania konektorów
  const cardCenters = []; // cardCenters[col][slot] = { x1, xR, yCtr }

  // ── 6. Rysuj kolumny ──────────────────────────────────────────────────────
  const HEADER_H = 36;

  configuredRounds.forEach((round, ri) => {
    const count   = Math.pow(2, totalRounds - 1 - ri);
    const spacing = (firstCount / count) * SLOT_H;
    const colX    = ri * COL_W;

    // Nagłówek rundy
    const hdr = document.createElementNS(NS, 'text');
    hdr.setAttribute('x', colX + CARD_W / 2);
    hdr.setAttribute('y', 18);
    hdr.setAttribute('text-anchor', 'middle');
    hdr.setAttribute('class', 'bk-round-hdr');
    hdr.textContent = round;
    svg.appendChild(hdr);

    cardCenters[ri] = [];

    for (let si = 0; si < count; si++) {
      const cardY = HEADER_H + si * spacing + (spacing - CARD_H) / 2;
      const yCtr  = cardY + CARD_H / 2;

      // Pobierz dane meczu
      const m = (matchesByRound[round] || [])[si] || null;
      const played = m && m.status === 'Rozegrany';
      // Wynik do wyświetlenia (podstawowy)
      const s1 = played ? Number(m.score_t1 ?? 0) : null;
      const s2 = played ? Number(m.score_t2 ?? 0) : null;
      // Zwycięstwo z uwzględnieniem rzutów karnych
      const w = played ? matchWinner(m) : 0;
      const t1win = w === 1;
      const t2win = w === 2;
      const hasPen = played && hasShootout(m);

      // Nazwy drużyn — z meczu lub propagowane z poprzedniej rundy
      let name1, name2;
      if (m) {
        name1 = m.team1_name;
        name2 = m.team2_name;
      } else {
        name1 = (ri > 0 ? propagated[ri - 1][si * 2]     : null) || 'TBD';
        name2 = (ri > 0 ? propagated[ri - 1][si * 2 + 1] : null) || 'TBD';
      }

      const isTbd = !m;

      // Karta tła
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', colX); rect.setAttribute('y', cardY);
      rect.setAttribute('width', CARD_W); rect.setAttribute('height', CARD_H);
      rect.setAttribute('rx', 8);
      rect.setAttribute('class', `bk-card ${played ? 'bk-card-played' : isTbd ? 'bk-card-tbd' : ''}`);
      if (m) {
        rect.setAttribute('data-match-id', m.id);
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => navigateToMatch(m.id));
      }
      svg.appendChild(rect);

      // Linia podziału
      const divY = cardY + CARD_H / 2;
      const div = document.createElementNS(NS, 'line');
      div.setAttribute('x1', colX + 4); div.setAttribute('y1', divY);
      div.setAttribute('x2', colX + CARD_W - 4); div.setAttribute('y2', divY);
      div.setAttribute('class', 'bk-divline');
      svg.appendChild(div);

      // Pomocnicza funkcja: tekst obcięty
      function addTeamText(name, yPos, cls) {
        const txt = document.createElementNS(NS, 'text');
        const maxW = played ? CARD_W - 36 : CARD_W - 12;
        txt.setAttribute('x', colX + 8);
        txt.setAttribute('y', yPos);
        txt.setAttribute('class', `bk-team-name ${cls}`);
        const shortName = name.length > 22 ? name.slice(0, 20) + '…' : name;
        txt.textContent = shortName;
        if (m) {
          txt.style.cursor = 'pointer';
          txt.addEventListener('click', () => navigateToMatch(m.id));
        }
        svg.appendChild(txt);
      }

      // Drużyna 1 (górna)
      const t1cls = isTbd ? 'bk-team-tbd' : t1win ? 'bk-team-win' : t2win ? 'bk-team-lose' : '';
      addTeamText(name1, cardY + 23, t1cls);

      // Drużyna 2 (dolna)
      const t2cls = isTbd ? 'bk-team-tbd' : t2win ? 'bk-team-win' : t1win ? 'bk-team-lose' : '';
      addTeamText(name2, cardY + CARD_H - 12, t2cls);

      // Wynik
      if (played) {
        function addScore(val, yPos, cls) {
          const sc = document.createElementNS(NS, 'text');
          sc.setAttribute('x', colX + CARD_W - 8);
          sc.setAttribute('y', yPos);
          sc.setAttribute('text-anchor', 'end');
          sc.setAttribute('class', `bk-score ${cls}`);
          sc.textContent = val;
          svg.appendChild(sc);
        }
        addScore(s1, cardY + 23,           t1win ? 'bk-score-win' : 'bk-score-lose');
        addScore(s2, cardY + CARD_H - 12,  t2win ? 'bk-score-win' : 'bk-score-lose');

        // Rzuty karne — mały napis pod kartą
        if (hasPen) {
          const penTxt = document.createElementNS(NS, 'text');
          penTxt.setAttribute('x', colX + CARD_W / 2);
          penTxt.setAttribute('y', cardY + CARD_H + 13);
          penTxt.setAttribute('text-anchor', 'middle');
          penTxt.setAttribute('class', 'bk-pen-label');
          penTxt.textContent = `k. ${m.shootout_t1}:${m.shootout_t2}`;
          svg.appendChild(penTxt);
        }
      }

      cardCenters[ri][si] = { xR: colX + CARD_W, xL: colX, yCtr };
    }
  });

  // ── 7. Konektory SVG ──────────────────────────────────────────────────────
  for (let ri = 0; ri < totalRounds - 1; ri++) {
    const leftCount  = Math.pow(2, totalRounds - 1 - ri);
    const rightCount = Math.pow(2, totalRounds - 2 - ri);

    for (let rsi = 0; rsi < rightCount; rsi++) {
      const topSlot = rsi * 2;
      const botSlot = rsi * 2 + 1;

      const left0 = cardCenters[ri][topSlot];
      const left1 = cardCenters[ri][botSlot];
      const right = cardCenters[ri + 1][rsi];

      if (!left0 || !left1 || !right) continue;

      const xMidL = left0.xR + (right.xL - left0.xR) * 0.45;
      const yMid  = (left0.yCtr + left1.yCtr) / 2;
      const xMidR = left0.xR + (right.xL - left0.xR) * 0.55;

      const d = [
        `M ${left0.xR} ${left0.yCtr}`,  // wychodzi z prawej krawędzi górnego
        `H ${xMidL}`,                    // poziomo w prawo
        `V ${yMid}`,                     // pionowo do środka
        `M ${left1.xR} ${left1.yCtr}`,  // wychodzi z prawej krawędzi dolnego
        `H ${xMidL}`,                    // poziomo w prawo
        `V ${yMid}`,                     // pionowo do środka (spotykają się)
        `M ${xMidL} ${yMid}`,           // ze środka
        `H ${xMidR}`,                    // krótki gap (opcjonalny, tu ciągły)
        `V ${right.yCtr}`,               // pionowo do poziomu docelowego
        `H ${right.xL}`,                 // poziomo do lewej krawędzi następnego
      ].join(' ');

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'bk-conn');
      svg.appendChild(path);
    }
  }

  // ── 8. Zwycięzca turnieju ─────────────────────────────────────────────────
  const lastRound  = configuredRounds[totalRounds - 1];
  const finalMatch = (matchesByRound[lastRound] || [])[0];
  let champion = null;
  if (finalMatch && finalMatch.status === 'Rozegrany') {
    const fw = matchWinner(finalMatch);
    champion = fw === 1 ? finalMatch.team1_name : fw === 2 ? finalMatch.team2_name : null;
  }

  const champX = totalRounds * COL_W - COL_GAP / 2;
  const champY = totalHeight / 2 - 40;
  const champW = 160, champH = 80;

  // Połączenie z finałem
  const fc = cardCenters[totalRounds - 1]?.[0];
  if (fc && champion) {
    const connLine = document.createElementNS(NS, 'line');
    connLine.setAttribute('x1', fc.xR); connLine.setAttribute('y1', fc.yCtr);
    connLine.setAttribute('x2', champX); connLine.setAttribute('y2', champY + champH / 2);
    connLine.setAttribute('class', 'bk-conn');
    svg.appendChild(connLine);
  }

  // Karta zwycięzcy
  const champRect = document.createElementNS(NS, 'rect');
  champRect.setAttribute('x', champX); champRect.setAttribute('y', champY);
  champRect.setAttribute('width', champW); champRect.setAttribute('height', champH);
  champRect.setAttribute('rx', 10);
  champRect.setAttribute('class', champion ? 'bk-winner-box' : 'bk-card bk-card-tbd');
  svg.appendChild(champRect);

  const trophy = document.createElementNS(NS, 'text');
  trophy.setAttribute('x', champX + champW / 2); trophy.setAttribute('y', champY + 22);
  trophy.setAttribute('text-anchor', 'middle'); trophy.setAttribute('font-size', '18');
  trophy.textContent = '🏆';
  svg.appendChild(trophy);

  const champName = document.createElementNS(NS, 'text');
  champName.setAttribute('x', champX + champW / 2); champName.setAttribute('y', champY + 48);
  champName.setAttribute('text-anchor', 'middle');
  champName.setAttribute('class', 'bk-winner-txt');
  champName.textContent = champion
    ? (champion.length > 18 ? champion.slice(0, 16) + '…' : champion)
    : '?';
  svg.appendChild(champName);

  const champLbl = document.createElementNS(NS, 'text');
  champLbl.setAttribute('x', champX + champW / 2); champLbl.setAttribute('y', champY + 66);
  champLbl.setAttribute('text-anchor', 'middle');
  champLbl.setAttribute('class', 'bk-winner-lbl');
  champLbl.textContent = 'Zwycięzca';
  svg.appendChild(champLbl);

  // ── 9. Wstaw SVG do kontenera ─────────────────────────────────────────────
  containerEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'bk-svg-wrap';
  wrap.appendChild(svg);
  containerEl.appendChild(wrap);
}

// ── KLASYFIKACJA STRZELCÓW / RZUCAJĄCYCH ─────────────────────────────────────

async function svLoadAndRenderScorers(containerEl, discipline) {
  const data = await api(`/top-scorers-detail/${encodeURIComponent(discipline)}`);

  if (!data || data.error) {
    containerEl.innerHTML = `<div class="sv-empty">Brak danych statystycznych.<br>Uzupełnij protokoły meczów aby zobaczyć klasyfikację.</div>`;
    return;
  }

  containerEl.innerHTML = svBuildScorers(data, discipline);
}

function svBuildScorers(rows, discipline) {
  const isFootball   = discipline === "Piłka Nożna";
  const isBasketball = discipline === "Koszykówka";

  const activeRows = rows.filter(r => r.total_points > 0);
  if (!activeRows.length) {
    return `<div class="sv-empty">Brak zdobytych ${isFootball ? "goli" : "punktów"} w rozegranych meczach.<br>Klasyfikacja pojawi się po uzupełnieniu protokołów.</div>`;
  }

  const maxPts = activeRows[0]?.total_points || 1;

  const headerCols = isBasketball
    ? `<th class="sv-sc-num">M</th><th class="sv-sc-pts sv-sc-pts--main">Pkt</th><th class="sv-sc-sub" title="Rzuty wolne (1 pkt)">1pt</th><th class="sv-sc-sub" title="Rzuty za 2 punkty">2pt</th><th class="sv-sc-sub" title="Rzuty za 3 punkty">3pt</th><th class="sv-sc-sub" title="Faule osobiste">Faule</th>`
    : `<th class="sv-sc-num">M</th><th class="sv-sc-pts sv-sc-pts--main">Gole</th>${isFootball ? `<th class="sv-sc-sub" title="Żółte kartki">🟡</th><th class="sv-sc-sub" title="Czerwone kartki">🔴</th>` : ""}`;

  const rowsHtml = activeRows.map((r, idx) => {
    const pct = Math.round((r.total_points / maxPts) * 100);
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `<span class="sv-sc-rank">${idx + 1}</span>`;

    const extraCols = isBasketball
      ? `<td class="sv-sc-num">${r.matches_played}</td>
         <td class="sv-sc-pts sv-sc-pts--main">${r.total_points}</td>
         <td class="sv-sc-sub">${r.points_1pt || 0}</td>
         <td class="sv-sc-sub">${r.points_2pt || 0}</td>
         <td class="sv-sc-sub">${r.points_3pt || 0}</td>
         <td class="sv-sc-sub">${r.personal_fouls || 0}</td>`
      : `<td class="sv-sc-num">${r.matches_played}</td>
         <td class="sv-sc-pts sv-sc-pts--main">${r.total_points}</td>
         ${isFootball ? `<td class="sv-sc-sub">${r.yellow_cards || 0}</td><td class="sv-sc-sub">${r.red_cards || 0}</td>` : ""}`;

    const avgPts = r.matches_played > 0
      ? (r.total_points / r.matches_played).toFixed(1)
      : "—";

    return `
      <tr class="sv-sc-row ${idx < 3 ? "sv-sc-row--top3" : ""}">
        <td class="sv-sc-medal">${medal}</td>
        <td class="sv-sc-player">
          <div class="sv-sc-name">${r.first_name} ${r.last_name}${r.is_captain ? ' <span class="sv-sc-captain" title="Kapitan">©</span>' : ''}</div>
          <div class="sv-sc-team">${r.team_name}${r.class_name ? ` · ${r.class_name}` : ""}</div>
          <div class="sv-sc-bar-wrap"><div class="sv-sc-bar" style="width:${pct}%"></div></div>
        </td>
        ${extraCols}
        <td class="sv-sc-avg" title="${isFootball ? "Gole" : "Punkty"} na mecz">${avgPts}</td>
      </tr>`;
  }).join("");

  const discipline_label = isFootball ? "⚽ Klasyfikacja strzelców" : "🏀 Klasyfikacja rzucających";
  const pts_label        = isFootball ? "Gole" : "Pkt";
  const avg_label        = isFootball ? "Śr/m" : "Śr/m";

  return `
    <div class="sv-scorers">
      <div class="sv-scorers-header">
        <h3 class="sv-scorers-title">${discipline_label}</h3>
        <span class="sv-scorers-count">${activeRows.length} zawodnik${activeRows.length === 1 ? "" : activeRows.length < 5 ? "ów" : "ów"}</span>
      </div>
      <div class="sv-scorers-table-wrap">
        <table class="sv-scorers-table">
          <thead>
            <tr>
              <th class="sv-sc-medal"></th>
              <th class="sv-sc-player">Zawodnik</th>
              ${headerCols}
              <th class="sv-sc-avg" title="${pts_label} na mecz">${avg_label}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${isBasketball ? `
      <div class="sv-scorers-legend">
        <span><strong>Pkt</strong> = łączne punkty</span>
        <span><strong>1pt</strong> = rzuty wolne</span>
        <span><strong>2pt</strong> = rzuty za 2</span>
        <span><strong>3pt</strong> = rzuty za 3</span>
        <span><strong>Faule</strong> = faule osobiste</span>
        <span><strong>Śr/m</strong> = średnia na mecz</span>
      </div>` : `
      <div class="sv-scorers-legend">
        <span><strong>M</strong> = mecze rozegrane</span>
        <span><strong>🟡</strong> = żółte kartki</span>
        <span><strong>🔴</strong> = czerwone kartki</span>
        <span><strong>Śr/m</strong> = gole na mecz</span>
      </div>`}
    </div>`;
}

// ── TERMINARZ ─────────────────────────────────────────────────────────────────

function svBuildSchedule({ matchesData, discipline }) {
  const matches = Array.isArray(matchesData) ? matchesData : [];

  if (!matches.length) {
    return `<div class="sv-empty">Brak meczów dla tej dyscypliny.</div>`;
  }

  // Grupuj po statusie
  const upcoming = matches.filter(m => m.status === "Planowany");
  const played   = matches.filter(m => m.status === "Rozegrany");
  const other    = matches.filter(m => m.status !== "Planowany" && m.status !== "Rozegrany");

  function matchRow(m) {
    const played = m.status === "Rozegrany";
    const w = played ? matchWinner(m) : 0;
    return `
    <div class="sv-sched-row sv-sched-${m.status.toLowerCase()} sv-sched-row--clickable" data-match-id="${m.id}">
      <div class="sv-sched-date">
        <span>${m.match_date ? m.match_date.slice(0,10) : "—"}</span>
        <span class="sv-sched-time">${m.match_time ? m.match_time.slice(0,5) : ""}</span>
      </div>
      <div class="sv-sched-teams">
        <span class="${played && w === 1 ? "sv-winner" : ""}">${m.team1_name}</span>
        <span class="sv-sched-score">
          ${played
            ? `<strong>${m.score_t1}:${m.score_t2}</strong>${hasShootout(m) ? `<span class="sv-sched-pen" title="Rzuty karne">(${m.shootout_t1}:${m.shootout_t2} k.)</span>` : ""}`
            : `<span class="sv-sched-vs">vs</span>`}
        </span>
        <span class="${played && w === 2 ? "sv-winner" : ""}">${m.team2_name}</span>
      </div>
      <div class="sv-sched-info">
        <span class="sv-sched-type ${m.match_type === "puchar" ? "sv-type-cup" : "sv-type-liga"}">
          ${m.match_type === "puchar" ? "🏆" : "📊"} ${m.match_type === "puchar" ? (m.cup_round || "Puchar") : "Liga"}
        </span>
        ${m.location ? `<span class="sv-sched-loc">📍 ${m.location}</span>` : ""}
      </div>
      <span class="sv-sched-goto" title="Otwórz szczegóły">→</span>
    </div>`;
  }

  const sections = [];

  if (upcoming.length) sections.push(`
    <div class="sv-sched-section">
      <div class="sv-sched-section-hdr sv-sched-hdr--plan">📅 Zaplanowane (${upcoming.length})</div>
      ${upcoming.map(matchRow).join("")}
    </div>`);

  if (played.length) sections.push(`
    <div class="sv-sched-section">
      <div class="sv-sched-section-hdr sv-sched-hdr--played">✅ Rozegrane (${played.length})</div>
      ${played.slice().reverse().map(matchRow).join("")}
    </div>`);

  if (other.length) sections.push(`
    <div class="sv-sched-section">
      <div class="sv-sched-section-hdr">Inne (${other.length})</div>
      ${other.map(matchRow).join("")}
    </div>`);

  return `<div class="sv-schedule">${sections.join("")}</div>`;
}