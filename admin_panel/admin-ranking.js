/* ════════════════════════════════════════════════════════════════════════════
   TABELA GENERALNA — obliczenia z bazy danych
   Pb_liga  = ((N − rank + 1) / N) × 100  (percentyl miejsca)
   Pb_puchar = punkty za etap (100/85/65/45/25/10)
   Score    = Σ( Pb × Wf × Wd )
════════════════════════════════════════════════════════════════════════════ */

const RANKING_DISCS = [
  { key: "Piłka Nożna",  emoji: "⚽", color: "#22c55e",  settingKey: "ranking_wd_football"   },
  { key: "Koszykówka",   emoji: "🏀", color: "#fb923c",  settingKey: "ranking_wd_basketball" },
  { key: "Siatkówka",    emoji: "🏐", color: "#a78bfa",  settingKey: "ranking_wd_volleyball" },
];

const FORMAT_WF = {
  liga:    { label: "Liga",     default: 1.0, settingKey: "ranking_wf_liga"    },
  hybryda: { label: "Hybryda",  default: 0.9, settingKey: "ranking_wf_hybryda" },
  puchar:  { label: "Drabinka", default: 0.8, settingKey: "ranking_wf_puchar"  },
};

// Punkty bazowe pucharowe obliczane percentylowo w server.js (cupPb)
// Wzór: ((N_cup - R_mid + 1) / N_cup) × 100 — ta sama formuła co liga

/* ══════════════════════════════════════════════════════════════════════════
   WIDOK
══════════════════════════════════════════════════════════════════════════ */

async function loadRankingView() {
  const bodyEl = $("ranking-view-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div class="panel-loading">Ładowanie danych…</div>';

  const [settings] = await Promise.all([ api("/tournament-settings") ]);
  const s = settings || {};

  const discData = await Promise.all(
    RANKING_DISCS.map(d =>
      api(`/ranking-data/${encodeURIComponent(d.key)}`)
    )
  );

  const ranked = computeRankingFromDB(discData, s);

  if (!ranked.length) {
    bodyEl.innerHTML = '<div class="sv-empty">Brak drużyn w tabeli.<br>Dodaj drużyny i przypisz je do rozstawienia ligowego.</div>';
    return;
  }

  bodyEl.innerHTML = buildRankingTableHtml(ranked, s, discData);
}

/* ══════════════════════════════════════════════════════════════════════════
   USTAWIENIA
══════════════════════════════════════════════════════════════════════════ */

async function loadRankingTab() {
  const root = $("ranking-root");
  if (!root) return;
  root.innerHTML = '<div class="settings-loading">Ładowanie…</div>';

  // 7.3 FIX: Pobieramy też ranking-data żeby schemat pucharowy pokazywał
  // rzeczywiste wartości Pb z serwera, nie statyczne/hardcoded.
  const [settings, fmtAll, ...discData] = await Promise.all([
    api("/tournament-settings"),
    api("/tournament-format"),
    ...RANKING_DISCS.map(d =>
      api(`/ranking-data/${encodeURIComponent(d.key)}`)
    ),
  ]);

  root.innerHTML = buildRankingSettingsHtml(settings || {}, fmtAll || {}, discData);
  wireRankingSettingsEvents(root);
}

/* ══════════════════════════════════════════════════════════════════════════
   OBLICZENIA
══════════════════════════════════════════════════════════════════════════ */

function round1(n) { return Math.round(n * 10) / 10; }

function getWf(settings, hasLeague, hasCup, phase) {
  const key = (hasLeague && hasCup) ? phase : (hasLeague ? "liga" : "puchar");
  return parseFloat(settings[FORMAT_WF[key]?.settingKey] ?? FORMAT_WF[key]?.default ?? 1.0);
}

function computeRankingFromDB(discData, settings) {
  const teamMap = {};
  const ensureTeam = (id, name, cls) => {
    if (!teamMap[id]) teamMap[id] = { id, name, cls: cls || "", components: [] };
  };

  RANKING_DISCS.forEach((disc, di) => {
    const data = discData[di];
    if (!data) return;
    const Wd = parseFloat(settings[disc.settingKey] ?? 1.0);

    // LIGA — uwzględnij WSZYSTKIE drużyny z tabeli, nawet bez rozegranych meczów
    if (data.has_league && data.liga && data.liga.rows && data.liga.rows.length) {
      const rows = data.liga.rows;
      const N    = rows.length;
      const Wf   = getWf(settings, data.has_league, data.has_cup, "liga");

      rows.forEach((row, ri) => {
        ensureTeam(row.id, row.team_name, row.class_name);
        if (row.played > 0) {
          const rank = ri + 1;
          const Pb   = ((N - rank + 1) / N) * 100;
          const pts  = round1(Pb * Wf * Wd);
          teamMap[row.id].components.push({
            disc: disc.key, emoji: disc.emoji, color: disc.color,
            phase: "liga",
            label: `${rank}. miejsce w lidze`,
            detail: `${row.pts} pkt · ${row.wins}W ${row.draws}R ${row.losses}P · ${row.gf}:${row.ga}`,
            rank, N, Pb: round1(Pb), Wf, Wd, pts, known: true, isStage: false,
          });
        } else {
          // Drużyna zgłoszona ale bez meczów — pokazuj w tabeli z zerami
          teamMap[row.id].components.push({
            disc: disc.key, emoji: disc.emoji, color: disc.color,
            phase: "liga", label: "liga — brak meczów", detail: "Nie rozegrano jeszcze żadnego meczu",
            Pb: 0, Wf, Wd, pts: 0, known: false, isStage: false,
          });
        }
      });
    }

    // PUCHAR
    if (data.has_cup && data.cup && data.cup.teams && data.cup.teams.length) {
      const Wf   = getWf(settings, data.has_league, data.has_cup, "puchar");
      const Ncup = data.cup.teams[0]?.N_cup || data.cup.teams.length;
      data.cup.teams.forEach(ct => {
        ensureTeam(ct.teamId, ct.teamName, "");
        const Pb   = ct.cupPb || 0;
        const pts  = round1(Pb * Wf * Wd);
        const Rmid = ct.cupRankMid != null ? ct.cupRankMid : "?";
        const label = ct.wonFinal
          ? "🏆 Mistrz pucharu"
          : (ct.bestRound ? `Puchar: ${ct.bestRound} (${ct.placeLabel} miejsce)` : "puchar — brak meczów");
        const detail = Pb > 0
          ? `Pb=((${Ncup}−${Rmid}+1)/${Ncup})×100=${Pb} · Wf=${Wf} · Wd=${Wd}`
          : "Nie rozegrano jeszcze żadnego meczu";
        teamMap[ct.teamId].components.push({
          disc: disc.key, emoji: disc.emoji, color: disc.color,
          phase: "puchar", label, detail,
          Pb, Wf, Wd, pts, known: Pb > 0, isStage: false,
        });
      });
    }
  });

  // Zwróć WSZYSTKIE drużyny z jakimkolwiek komponentem (nie tylko te z pts > 0)
  return Object.values(teamMap)
    .map(t => ({
      ...t,
      total: round1(t.components.reduce((s, c) => s + c.pts, 0)),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/* ══════════════════════════════════════════════════════════════════════════
   HTML TABELI
══════════════════════════════════════════════════════════════════════════ */

function buildRankingTableHtml(ranked, settings, discData) {
  const maxTotal = ranked[0]?.total || 1;

  const rows = ranked.map((t, i) => {
    const barPct = Math.round((t.total / maxTotal) * 100);
    const medal  = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`;

    // Grupuj komponenty po dyscyplinie
    const byDisc = {};
    t.components.forEach(c => {
      if (!byDisc[c.disc]) byDisc[c.disc] = [];
      byDisc[c.disc].push(c);
    });

    const chips = Object.entries(byDisc).map(([dk, comps]) => {
      const disc     = RANKING_DISCS.find(d => d.key === dk);
      const total    = round1(comps.reduce((s,c) => s+c.pts, 0));
      const allKnown = comps.every(c => c.known);
      const hasStage = comps.some(c => c.isStage && c.known);
      const tipLines = comps.map(c =>
        (c.phase === "liga" ? "📊 " : "🏆 ") + c.label + ": Pb=" + c.Pb + " × Wf=" + c.Wf + " × Wd=" + c.Wd + " = " + c.pts + " pkt\n   " + c.detail
      ).join("\n");
      return `<span class="rk-score-chip ${!allKnown ? "rk-score-chip--partial" : ""} ${hasStage ? "rk-score-chip--stage" : ""}"
              style="--chip-color:${disc?.color || "#6c63ff"}" title="${dk}\n${tipLines}">
        ${disc?.emoji || "🏅"} <strong>${total}</strong>${hasStage ? '<span class="rk-chip-stage">~</span>' : ""}${!allKnown ? '<span class="rk-chip-warn">?</span>' : ""}
      </span>`;
    }).join("");

    const hasApprox = t.components.some(c => c.isStage && c.known);

    return `<div class="rk-row ${i===0?"rk-row--1":i===1?"rk-row--2":i===2?"rk-row--3":""}">
      <div class="rk-pos">${medal}</div>
      <div class="rk-team-info">
        <span class="rk-team-name">${t.name}</span>
        ${t.cls ? '<span class="sv-team-cls">'+t.cls+'</span>' : ""}
      </div>
      <div class="rk-breakdown">${chips}</div>
      <div class="rk-bar-wrap"><div class="rk-bar" style="width:${barPct}%"></div></div>
      <div class="rk-total"><strong>${t.total}</strong>${hasApprox ? '<span class="rk-approx" title="Zawiera punkty za etap pucharu (przybliżone)">~</span>' : ""}</div>
    </div>`;
  }).join("");

  const wfLegend = Object.entries(FORMAT_WF).map(([k,def]) => {
    const val = parseFloat(settings[def.settingKey] ?? def.default).toFixed(1);
    return `<span class="rk-legend-item"><em>${def.label}</em> Wf=${val}</span>`;
  }).join("");

  const wdLegend = RANKING_DISCS.map(d => {
    const val = parseFloat(settings[d.settingKey] ?? 1.0).toFixed(1);
    return `<span class="rk-legend-item">${d.emoji} Wd=${val}</span>`;
  }).join("");

  const cupScheme = buildCupSchemeHtml(discData);

  return `<div class="rk-view">
    <div class="rk-legend-bar">
      <span class="rk-legend-group"><span class="rk-legend-label">Wagi formatów:</span>${wfLegend}</span>
      <span class="rk-legend-group"><span class="rk-legend-label">Wagi dyscyplin:</span>${wdLegend}</span>
      <button class="rk-legend-edit" onclick="navigate('turniej')">⚙️ Zmień wagi</button>
    </div>
    ${cupScheme}
    <div class="rk-preview-header">
      <span>#</span><span>Drużyna / Klasa</span><span>Punkty wg dyscyplin</span><span></span><span>Score</span>
    </div>
    <div class="rk-list">${rows}</div>
    <div class="rk-formula-note">
      Najedź na chip dyscypliny aby zobaczyć składowe (Pb × Wf × Wd).
      <strong>~</strong> = punkty za etap pucharu.
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   SCHEMAT PUNKTACJI PUCHAROWEJ
══════════════════════════════════════════════════════════════════════════ */

function buildCupSchemeHtml(discData) {
  const cupDiscs = (discData || []).filter(d => d && d.has_cup && d.cup && d.cup.teams && d.cup.teams.length > 0);
  if (!cupDiscs.length) return "";

  // Zbierz przykładowe Pb z danych — żeby pokazać realne wartości
  const examples = [];
  cupDiscs.forEach(cd => {
    const disc = RANKING_DISCS.find(d => d.key === cd.discipline);
    if (!disc) return;
    const Ncup = cd.cup.teams[0]?.N_cup || cd.cup.teams.length;
    if (!Ncup) return;
    // Zbierz unikalne etapy z danymi Pb
    const seen = new Set();
    cd.cup.teams.forEach(t => {
      if (t.bestRound && !seen.has(t.bestRound) && t.cupPb > 0) {
        seen.add(t.bestRound);
        examples.push({ disc: disc.emoji, stage: t.wonFinal ? "🏆 Mistrz" : t.bestRound, place: t.placeLabel, pb: t.cupPb, N: Ncup });
      }
    });
  });

  if (!examples.length) return "";

  examples.sort((a,b) => b.pb - a.pb);

  const stagesHtml = examples.map(s =>
    `<div class="rk-scheme-step">
      <div class="rk-scheme-icon">${s.disc}</div>
      <div class="rk-scheme-info">
        <span class="rk-scheme-round">${s.stage}</span>
        <span class="rk-scheme-place">${s.place ? s.place+" miejsce" : ""} (N=${s.N})</span>
      </div>
      <div class="rk-scheme-pb">Pb = <strong>${s.pb}</strong></div>
    </div>`
  ).join("");

  return `<details class="rk-scheme-box">
    <summary class="rk-scheme-title">🏆 Schemat punktacji pucharowej <span class="rk-scheme-note">(kliknij aby rozwinąć)</span></summary>
    <div class="rk-scheme-stages">${stagesHtml}</div>
    <div class="rk-scheme-desc">
      Pb pucharowe = <code>((N − R<sub>mid</sub> + 1) / N) × 100</code> — ta sama formuła co liga.<br>
      R<sub>mid</sub> = środek zakresu miejsc wyznaczonych przez osiągnięty etap. N = liczba drużyn w pucharze.
    </div>
  </details>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   USTAWIENIA HTML
══════════════════════════════════════════════════════════════════════════ */

function buildRankingSettingsHtml(s, fmtMap, discData) {
  const wfRows = Object.entries(FORMAT_WF).map(([key, def]) => {
    const val = parseFloat(s[def.settingKey] ?? def.default).toFixed(1);
    return `<div class="rk-wf-row">
      <div class="rk-wf-label"><span class="rk-wf-name">${def.label}</span><span class="rk-wf-key">${key}</span></div>
      <div class="rk-slider-wrap">
        <input type="range" class="rk-slider" id="rk-wf-${key}" min="0.1" max="2.0" step="0.1" value="${val}" data-setting="${def.settingKey}" />
        <span class="rk-slider-val" id="rk-wf-val-${key}">${val}</span>
      </div>
    </div>`;
  }).join("");

  const wdCards = RANKING_DISCS.map(d => {
    const val  = parseFloat(s[d.settingKey] ?? 1.0).toFixed(1);
    const fmt  = fmtMap[d.key] || {};
    const wfK  = fmt.has_league && fmt.has_cup ? "hybryda" : fmt.has_league ? "liga" : "puchar";
    const wfV  = parseFloat(s[FORMAT_WF[wfK]?.settingKey] ?? FORMAT_WF[wfK]?.default ?? 1.0).toFixed(1);
    const fmtL = fmt.has_league && fmt.has_cup ? "Hybryda" : fmt.has_league ? "Liga" : fmt.has_cup ? "Drabinka" : "—";
    return `<div class="rk-disc-card" style="--dc:${d.color}">
      <div class="rk-disc-header">
        <span class="rk-disc-emoji">${d.emoji}</span>
        <div class="rk-disc-info">
          <span class="rk-disc-name">${d.key}</span>
          <span class="rk-disc-fmt">Format: ${fmtL} · Wf = ${wfV}</span>
        </div>
        <div class="rk-disc-wd-wrap">
          <span class="rk-disc-wd-label">Wd</span>
          <span class="rk-disc-wd-val" id="rk-wd-val-${d.settingKey}">${val}</span>
        </div>
      </div>
      <div class="rk-slider-wrap rk-slider-wrap--disc">
        <span class="rk-sl-min">0.1</span>
        <input type="range" class="rk-slider" id="rk-wd-${d.settingKey}" min="0.1" max="3.0" step="0.1" value="${val}" data-setting="${d.settingKey}" />
        <span class="rk-sl-max">3.0</span>
      </div>
    </div>`;
  }).join("");

  // P3 FIX: CUP_STAGE_PB było niezdefiniowane — powodowało ReferenceError.
  // 7.3 FIX: Schemat pucharowy czerpie dane z serwera (cupPb z ranking-data),
  // nie ze statycznych/hardcoded wartości. buildCupSchemeHtml renderuje realne Pb.
  const cupSchemeHtml = discData && discData.length
    ? buildCupSchemeHtml(discData)
    : `<div class="rk-scheme-box rk-scheme-box--settings">
        <div class="rk-scheme-title">🏆 Punkty pucharowe</div>
        <div class="rk-scheme-desc" style="padding:.5rem .75rem;font-size:.8rem;color:var(--muted)">
          Obliczane percentylowo: <code>Pb = ((N − R<sub>mid</sub> + 1) / N) × 100</code><br>
          Gdzie N = liczba drużyn w pucharze, R<sub>mid</sub> = środkowe miejsce etapu.<br>
          Identyczna formuła co liga — skala automatycznie dostosowuje się do liczby drużyn.<br>
          <em>Brak danych pucharowych — rozegraj mecze aby zobaczyć realne wartości Pb.</em>
        </div>
      </div>`;

  return `<div class="rk-root">
    <div class="rk-formula-box">
      <div class="rk-formula-title">📐 Wzór obliczeniowy</div>
      <div class="rk-formula">
        <span class="rk-f-total">Score</span><span class="rk-f-eq">=</span>
        <span class="rk-f-sum">Σ</span><span class="rk-f-paren">(</span>
        <span class="rk-f-pb">Pb</span><span class="rk-f-op">×</span>
        <span class="rk-f-wf">Wf</span><span class="rk-f-op">×</span>
        <span class="rk-f-wd">Wd</span><span class="rk-f-paren">)</span>
      </div>
      <div class="rk-formula-legend">
        <span><strong class="rk-f-pb">Pb</strong> = percentyl miejsca ligowego LUB punkty za etap pucharu</span>
        <span><strong class="rk-f-wf">Wf</strong> = waga formatu</span>
        <span><strong class="rk-f-wd">Wd</strong> = waga dyscypliny</span>
      </div>
    </div>

    <div class="rk-section">
      <div class="rk-section-title">⚖️ Wagi formatów (Wf)</div>
      <div class="rk-wf-list">${wfRows}</div>
    </div>

    <div class="rk-section">
      <div class="rk-section-title">🎯 Wagi dyscyplin (Wd)</div>
      <div class="rk-disc-list">${wdCards}</div>
    </div>

    ${cupSchemeHtml}

    <div class="rk-save-row">
      <button class="dc-save-btn" id="rk-save-btn">💾 Zapisz wagi</button>
      <span class="dc-save-status" id="rk-save-status"></span>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   EVENTY USTAWIEŃ
══════════════════════════════════════════════════════════════════════════ */

function wireRankingSettingsEvents(root) {
  root.querySelectorAll(".rk-slider").forEach(sl => {
    sl.addEventListener("input", () => {
      const v = parseFloat(sl.value).toFixed(1);
      const el1 = root.querySelector(`#rk-wf-val-${sl.id.replace("rk-wf-","")}`);
      const el2 = root.querySelector(`#rk-wd-val-${sl.dataset.setting}`);
      if (el1) el1.textContent = v;
      if (el2) el2.textContent = v;
    });
  });

  root.querySelector("#rk-save-btn")?.addEventListener("click", async () => {
    const btn    = root.querySelector("#rk-save-btn");
    const status = root.querySelector("#rk-save-status");
    btn.disabled = true; btn.textContent = "Zapisywanie…";

    const body = {};
    root.querySelectorAll(".rk-slider[data-setting]").forEach(sl => {
      body[sl.dataset.setting] = parseFloat(sl.value).toFixed(1);
    });

    const result = await saveTournamentSettings(body);
    btn.disabled = false; btn.textContent = "💾 Zapisz wagi";

    if (result && !result.error) {
      status.textContent = "✓ Zapisano"; status.style.color = "var(--green)";
      setTimeout(() => { status.textContent = ""; }, 2500);
    } else {
      status.textContent = "✗ Błąd: " + (result?.error || "nieznany"); status.style.color = "var(--red)";
    }
  });
}