/* ════════════════════════════════════════════════════════════════════════════
   USTAWIENIA TURNIEJU
════════════════════════════════════════════════════════════════════════════ */
const FORMAT_DISCS = [
  { key: "Piłka Nożna", emoji: "⚽", color: "#22c55e",  hasDraw: true  },
  { key: "Koszykówka",  emoji: "🏀", color: "#fb923c",  hasDraw: false },
  { key: "Siatkówka",   emoji: "🏐", color: "#a78bfa",  hasDraw: false },
];
const ALL_CUP_ROUNDS = ["1/16", "1/8", "1/4", "Półfinał", "Finał"];
let adminFmtCache = null;

async function loadTurniej() {
  // zakładki
  document.querySelectorAll(".turniej-tab").forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  document.querySelectorAll(".turniej-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTurniejTab(btn.dataset.tab);
      if (btn.dataset.tab === "ranking") loadRankingTab();
    });
  });

  const [fmt, settings] = await Promise.all([
    api("/tournament-format"),
    api("/tournament-settings"),
  ]);
  adminFmtCache = fmt || {};

  buildDiscCards(adminFmtCache);
  buildRulesTab(settings || {});
  buildInfoTab(settings || {});
}

function switchTurniejTab(tab) {
  document.querySelectorAll(".turniej-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".turniej-panel").forEach(p =>
    p.classList.toggle("active", p.id === `tab-${tab}`));
}

/* ════════════════════════════════════════════════════════════════════════════
   KARTY DYSCYPLIN — format + punktacja + grupy wszystko razem
════════════════════════════════════════════════════════════════════════════ */
function buildDiscCards(fmt) {
  const grid = $("disc-cards-grid");
  grid.innerHTML = "";

  FORMAT_DISCS.forEach(({ key, emoji, color, hasDraw }) => {
    const f   = fmt[key] || {};
    const sid = key.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");

    const card = el("div", "disc-card");
    card.dataset.disc = key;
    card.style.setProperty("--disc-color", color);

    card.innerHTML = `
      <!-- ── nagłówek ── -->
      <div class="dc-header">
        <span class="dc-emoji">${emoji}</span>
        <span class="dc-name">${key}</span>
        <div class="dc-badges" id="dc-badges-${sid}"></div>
      </div>

      <!-- ══ SEKCJA 1: Format rozgrywek ══ -->
      <div class="dc-section">
        <div class="dc-section-title">Format rozgrywek</div>
        <div class="dc-format-options">
          <label class="dc-format-opt ${f.has_league ? "dc-format-opt--on" : ""}" id="dc-opt-liga-${sid}">
            <input type="checkbox" class="dc-chk-league" ${f.has_league ? "checked" : ""} hidden />
            <span class="dc-opt-icon">📊</span>
            <div class="dc-opt-body">
              <div class="dc-opt-title">Liga</div>
              <div class="dc-opt-desc">Tabela punktowa, każdy z każdym</div>
            </div>
            <span class="dc-opt-check">✓</span>
          </label>
          <label class="dc-format-opt ${f.has_cup ? "dc-format-opt--on" : ""}" id="dc-opt-cup-${sid}">
            <input type="checkbox" class="dc-chk-cup" ${f.has_cup ? "checked" : ""} hidden />
            <span class="dc-opt-icon">🏆</span>
            <div class="dc-opt-body">
              <div class="dc-opt-title">Puchar</div>
              <div class="dc-opt-desc">Drabinka eliminacyjna</div>
            </div>
            <span class="dc-opt-check">✓</span>
          </label>
        </div>
      </div>

      <!-- ══ SEKCJA 2: Punktacja ligowa ══ -->
      <div class="dc-section dc-section--league" id="dc-sec-pts-${sid}" ${!f.has_league ? 'style="display:none"' : ""}>
        <div class="dc-section-title">Punktacja ligowa</div>
        <div class="dc-pts-row">
          <div class="dc-pts-item">
            <div class="dc-pts-badge dc-pts-badge--w">W</div>
            <div class="dc-pts-label">Wygrana</div>
            <div class="dc-pts-spin">
              <button class="dc-spin-btn" data-dir="-1" data-target="pts-win-${sid}">−</button>
              <input type="number" id="pts-win-${sid}" class="dc-spin-val" min="0" max="9" value="${f.pts_win ?? 3}" />
              <button class="dc-spin-btn" data-dir="1"  data-target="pts-win-${sid}">+</button>
            </div>
            <div class="dc-pts-unit">pkt</div>
          </div>
          ${hasDraw ? `
          <div class="dc-pts-item">
            <div class="dc-pts-badge dc-pts-badge--d">R</div>
            <div class="dc-pts-label">Remis</div>
            <div class="dc-pts-spin">
              <button class="dc-spin-btn" data-dir="-1" data-target="pts-draw-${sid}">−</button>
              <input type="number" id="pts-draw-${sid}" class="dc-spin-val" min="0" max="9" value="${f.pts_draw ?? 1}" />
              <button class="dc-spin-btn" data-dir="1"  data-target="pts-draw-${sid}">+</button>
            </div>
            <div class="dc-pts-unit">pkt</div>
          </div>` : `
          <div class="dc-pts-item dc-pts-item--disabled">
            <div class="dc-pts-badge dc-pts-badge--d">R</div>
            <div class="dc-pts-label">Remis</div>
            <div class="dc-pts-na">—</div>
          </div>`}
          <div class="dc-pts-item">
            <div class="dc-pts-badge dc-pts-badge--l">P</div>
            <div class="dc-pts-label">Przegrana</div>
            <div class="dc-pts-spin">
              <button class="dc-spin-btn" data-dir="-1" data-target="pts-loss-${sid}">−</button>
              <input type="number" id="pts-loss-${sid}" class="dc-spin-val" min="0" max="9" value="${f.pts_loss ?? 0}" />
              <button class="dc-spin-btn" data-dir="1"  data-target="pts-loss-${sid}">+</button>
            </div>
            <div class="dc-pts-unit">pkt</div>
          </div>
        </div>
      </div>

      <!-- ══ SEKCJA 3: Grupy ligowe ══ -->
      <div class="dc-section dc-section--league" id="dc-sec-groups-${sid}" ${!f.has_league ? 'style="display:none"' : ""}>
        <div class="dc-section-title">Grupy ligowe</div>
        <div class="dc-groups-row">
          <div class="dc-group-field">
            <div class="dc-group-label">Liczba grup</div>
            <div class="dc-group-desc">Ile osobnych tabel ligowych</div>
            <div class="dc-pts-spin">
              <button class="dc-spin-btn" data-dir="-1" data-target="groups-count-${sid}">−</button>
              <input type="number" id="groups-count-${sid}" class="dc-spin-val" min="1" max="16" value="${f.groups_count ?? 1}" />
              <button class="dc-spin-btn" data-dir="1"  data-target="groups-count-${sid}">+</button>
            </div>
          </div>
          <div class="dc-group-divider">×</div>
          <div class="dc-group-field">
            <div class="dc-group-label">Drużyn w grupie</div>
            <div class="dc-group-desc">Ile drużyn w każdej grupie</div>
            <div class="dc-pts-spin">
              <button class="dc-spin-btn" data-dir="-1" data-target="teams-per-${sid}">−</button>
              <input type="number" id="teams-per-${sid}" class="dc-spin-val" min="2" max="32" value="${f.teams_per_group ?? 4}" />
              <button class="dc-spin-btn" data-dir="1"  data-target="teams-per-${sid}">+</button>
            </div>
          </div>
          <div class="dc-group-total" id="dc-total-${sid}"></div>
        </div>
      </div>

      <!-- ══ SEKCJA 4: Rundy pucharowe ══ -->
      <div class="dc-section dc-section--cup" id="dc-sec-rounds-${sid}" ${!f.has_cup ? 'style="display:none"' : ""}>
        <div class="dc-section-title">Rundy pucharowe</div>
        <div class="dc-rounds-list" id="dc-rounds-${sid}">
          ${buildRoundsHtml(f.cup_rounds || [])}
        </div>
      </div>

      <!-- ── stopka ── -->
      <div class="dc-footer">
        <button class="dc-save-btn" id="dc-save-${sid}">Zapisz ustawienia</button>
        <span class="dc-save-status" id="dc-status-${sid}"></span>
      </div>
    `;

    // ── eventy ──────────────────────────────────────────────────────────────

    // toggle format
    card.querySelector(".dc-chk-league").addEventListener("change", () => syncDiscCard(card, sid, hasDraw));
    card.querySelector(".dc-chk-cup").addEventListener("change",    () => syncDiscCard(card, sid, hasDraw));

    // +/- spinbuttony
    card.querySelectorAll(".dc-spin-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const inp = $(`${btn.dataset.target}`);
        if (!inp) return;
        const min  = parseInt(inp.min ?? 0);
        const max  = parseInt(inp.max ?? 99);
        const step = parseInt(inp.step ?? 1) || 1;
        inp.value  = Math.min(max, Math.max(min, (parseInt(inp.value) || 0) + parseInt(btn.dataset.dir) * step));
        if (inp.id.startsWith("groups-count") || inp.id.startsWith("teams-per")) {
          updateGroupTotal(card, sid);
        }
      });
    });

    // klikalne etykiety formatów
    card.querySelectorAll(".dc-format-opt").forEach(label => {
      label.addEventListener("click", () => {
        const chk  = label.querySelector("input[type=checkbox]");
        chk.checked = !chk.checked;
        label.classList.toggle("dc-format-opt--on", chk.checked);
        syncDiscCard(card, sid, hasDraw);
      });
    });

    // klikalne rundy pucharowe
    card.querySelectorAll(".dc-round").forEach(label => {
      label.addEventListener("click", () => {
        const chk = label.querySelector(".dc-round-chk");
        // checkbox zmienia się przez natywny label — małe opóźnienie żeby złapać nową wartość
        requestAnimationFrame(() => {
          label.classList.toggle("dc-round--on", chk.checked);
        });
      });
    });

    // zapisz
    card.querySelector(`#dc-save-${sid}`).addEventListener("click", () => saveDiscCard(key, sid, card, hasDraw));

    // init
    syncDiscCard(card, sid, hasDraw);
    updateGroupTotal(card, sid);
    grid.appendChild(card);
  });
}

function buildRoundsHtml(active) {
  const activeSet = new Set(active);
  return ALL_CUP_ROUNDS.map(r => `
    <label class="dc-round ${activeSet.has(r) ? "dc-round--on" : ""}">
      <input type="checkbox" class="dc-round-chk" value="${r}" ${activeSet.has(r) ? "checked" : ""} hidden />
      <span class="dc-round-label">${r}</span>
      <span class="dc-round-check">✓</span>
    </label>
  `).join("");
}

function syncDiscCard(card, sid, hasDraw) {
  const league = card.querySelector(".dc-chk-league").checked;
  const cup    = card.querySelector(".dc-chk-cup").checked;

  // etykiety opcji
  card.querySelectorAll(".dc-format-opt").forEach(lbl => {
    const chk = lbl.querySelector("input");
    lbl.classList.toggle("dc-format-opt--on", chk.checked);
  });

  // pokaż/ukryj sekcje
  const secPts    = $(`dc-sec-pts-${sid}`);
  const secGroups = $(`dc-sec-groups-${sid}`);
  const secRounds = $(`dc-sec-rounds-${sid}`);
  if (secPts)    secPts.style.display    = league ? "" : "none";
  if (secGroups) secGroups.style.display = league ? "" : "none";
  if (secRounds) secRounds.style.display = cup    ? "" : "none";

  // badges
  const badges = $(`dc-badges-${sid}`);
  if (badges) {
    badges.innerHTML = "";
    if (league) badges.insertAdjacentHTML("beforeend", `<span class="dc-badge dc-badge--league">Liga</span>`);
    if (cup)    badges.insertAdjacentHTML("beforeend", `<span class="dc-badge dc-badge--cup">Puchar</span>`);
    if (!league && !cup) badges.insertAdjacentHTML("beforeend", `<span class="dc-badge dc-badge--none">Brak</span>`);
  }
}

function updateGroupTotal(card, sid) {
  const gc = parseInt($(`groups-count-${sid}`)?.value) || 1;
  const tp = parseInt($(`teams-per-${sid}`)?.value)    || 0;
  const el = $(`dc-total-${sid}`);
  if (el) el.innerHTML = `<span class="dc-total-num">${gc * tp}</span><span class="dc-total-lbl">drużyn łącznie</span>`;
}

async function saveDiscCard(discipline, sid, card, hasDraw) {
  const btn    = $(`dc-save-${sid}`);
  const status = $(`dc-status-${sid}`);
  btn.disabled = true; btn.textContent = "Zapisywanie…"; status.textContent = "";

  const league = card.querySelector(".dc-chk-league").checked;
  const cup    = card.querySelector(".dc-chk-cup").checked;

  const existing = adminFmtCache?.[discipline] || {};

  const payload = {
    has_league:      league,
    has_cup:         cup,
    pts_win:         parseInt($(`pts-win-${sid}`)?.value)     ?? existing.pts_win  ?? 3,
    pts_draw:        hasDraw
                       ? (parseInt($(`pts-draw-${sid}`)?.value) ?? existing.pts_draw ?? 1)
                       : (existing.pts_draw ?? 1),
    pts_loss:        parseInt($(`pts-loss-${sid}`)?.value)    ?? existing.pts_loss ?? 0,
    groups_count:    parseInt($(`groups-count-${sid}`)?.value) ?? existing.groups_count    ?? 1,
    teams_per_group: parseInt($(`teams-per-${sid}`)?.value)   ?? existing.teams_per_group ?? 4,
    cup_rounds:      [...card.querySelectorAll(".dc-round-chk:checked")].map(c => c.value),
  };

  try {
    const r = await fetch(`${API}/tournament-format/${encodeURIComponent(discipline)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const updated = await r.json();
    adminFmtCache[discipline] = updated;

    btn.textContent = "✓ Zapisano";
    btn.classList.add("dc-save-btn--ok");
    showToast(`✓ ${discipline} — ustawienia zapisane`);
    setTimeout(() => {
      btn.textContent = "Zapisz ustawienia";
      btn.classList.remove("dc-save-btn--ok");
      btn.disabled = false;
    }, 2400);
  } catch(e) {
    showToast("✗ Błąd zapisu: " + e.message, true);
    btn.textContent = "Zapisz ustawienia";
    btn.disabled = false;
  }
}

/* ── TAB: Przepisy meczowe ──────────────────────────────────────────────── */

const RULES_DEFS = [
  {
    key:   "Piłka Nożna",
    emoji: "⚽",
    color: "#22c55e",
    sid:   "football",
    sections: [
      {
        title: "⏱ Czas meczu",
        fields: [
          { id: "football_half_duration",        label: "Czas trwania połowy (min)", type: "number", min: 5,  max: 90,  default: 30,  desc: "Czas jednej połowy — łączny czas meczu = 2 × połowa" },
          { id: "football_half_count",           label: "Liczba połów",              type: "number", min: 1,  max: 4,   default: 2,   desc: "Zazwyczaj 2 połowy" },
          { id: "football_overtime_duration",    label: "Czas dogrywki (min)",       type: "number", min: 0,  max: 30,  default: 10,  desc: "Czas jednej połowy dogrywki (0 = brak dogrywki)" },
        ]
      },
      {
        title: "🔄 Zmiany",
        fields: [
          { id: "football_substitutions_limit",  label: "Limit zmian na drużynę",    type: "number", min: 0,  max: 20,  default: 3,   desc: "Maksymalna liczba zmian (0 = bez limitu)" },
          { id: "football_substitutions_per",    label: "Limit zmian liczony",        type: "select", options: ["mecz","połowa","brak"], default: "mecz", desc: "Czy limit dotyczy całego meczu, jednej połowy, czy nie ma limitu" },
        ]
      },
      {
        title: "🎯 Rzuty karne",
        fields: [
          { id: "football_penalty_shootout",  label: "Rzuty karne po remisie",            type: "toggle", default: "1", desc: "Czy remis po dogrywce kończy się serią rzutów karnych" },
          { id: "football_penalty_shooters",  label: "Strzelcy w serii (na drużynę)",      type: "number", min: 1, max: 11, default: 5, desc: "Ilu zawodników z każdej drużyny wykonuje rzuty karne w standardowej serii (standardowo 5)" },
          { id: "football_penalty_wins",      label: "Karnych do wygrania konkursu",       type: "number", min: 1, max: 11, default: 5, desc: "Ile trafionych rzutów potrzeba do wygrania serii — po remisie w serii następuje nagła śmierć (standardowo 5)" },
        ]
      },
    ]
  },
  {
    key:   "Koszykówka",
    emoji: "🏀",
    color: "#fb923c",
    sid:   "basketball",
    sections: [
      {
        title: "⏱ Czas meczu",
        fields: [
          { id: "basketball_periods",            label: "Podział gry",               type: "select", options: ["kwarty","połowy"], default: "kwarty", desc: "Czy mecz jest podzielony na kwarty czy połowy" },
          { id: "basketball_period_duration",    label: "Czas okresu (min)",         type: "number", min: 2, max: 30, default: 10, desc: "Czas trwania jednej kwarty / połowy" },
          { id: "basketball_overtime_duration",  label: "Dogrywka (min)",            type: "number", min: 1, max: 10, default: 5,  desc: "Czas trwania dogrywki" },
        ]
      },
      {
        title: "🔄 Zmiany",
        fields: [
          { id: "basketball_substitutions_limit",label: "Limit zmian na drużynę",    type: "number", min: 0, max: 50, default: 5,   desc: "Maksymalna liczba zmian (0 = bez limitu)" },
          { id: "basketball_substitutions_per",  label: "Limit zmian liczony",        type: "select", options: ["mecz","kwarta/połowa","brak"], default: "mecz", desc: "Czy limit dotyczy całego meczu, każdej kwarty/połowy osobno, czy nie ma limitu" },
        ]
      },
      {
        title: "⏸ Przerwy (timeout)",
        fields: [
          { id: "basketball_timeouts_limit",     label: "Limit timeout na drużynę",  type: "number", min: 0, max: 10, default: 2,   desc: "Liczba dostępnych przerw" },
          { id: "basketball_timeouts_per",       label: "Limit timeout liczony",      type: "select", options: ["mecz","kwarta/połowa","brak"], default: "mecz", desc: "Czy limit dotyczy całego meczu, każdej kwarty/połowy osobno, czy nie ma limitu" },
        ]
      },
      {
        title: "🚫 Faule",
        fields: [
          { id: "basketball_team_foul_limit",    label: "Limit fauli drużyny",       type: "number", min: 1, max: 20, default: 5,   desc: "Po przekroczeniu — rzuty osobiste dla rywala" },
          { id: "basketball_team_fouls_per",     label: "Limit fauli liczony",        type: "select", options: ["połowa","mecz"], default: "połowa", desc: "Czy reset następuje po każdej połowie / kwarcie" },
          { id: "basketball_player_foul_limit",  label: "Maks. faule osobiste zawodnika", type: "number", min: 1, max: 10, default: 5, desc: "Po osiągnięciu — zawodnik odpada z gry" },
          { id: "basketball_tech_foul_limit",    label: "Maks. faule techniczne zawodnika", type: "number", min: 1, max: 5, default: 2, desc: "Po osiągnięciu — zawodnik odpada z gry" },
        ]
      },
    ]
  },
  {
    key:   "Siatkówka",
    emoji: "🏐",
    color: "#a78bfa",
    sid:   "volleyball",
    sections: [
      {
        title: "🏆 Sety",
        fields: [
          { id: "volleyball_sets_to_win",        label: "Sety potrzebne do wygranej", type: "number", min: 1, max: 4, default: 3, desc: "np. 3 dla formatu BO5, 2 dla BO3" },
          { id: "volleyball_points_per_set",     label: "Punkty do wygrania seta",    type: "number", min: 10, max: 50, default: 25, desc: "Standardowo 25 punktów" },
          { id: "volleyball_advantage_rule",     label: "Przewaga w secie",           type: "toggle", default: "1", desc: "Wymagana 2-punktowa przewaga przy równym wyniku" },
          { id: "volleyball_tiebreak_points",    label: "Punkty w tiebreaku",         type: "number", min: 5, max: 25, default: 15, desc: "Standardowo 15 punktów" },
          { id: "volleyball_tiebreak_advantage", label: "Przewaga w tiebreaku",       type: "toggle", default: "1", desc: "Wymagana 2-punktowa przewaga w tiebreaku" },
        ]
      },
      {
        title: "🔄 Zmiany",
        fields: [
          { id: "volleyball_substitutions_limit",label: "Limit zmian na drużynę",    type: "number", min: 0, max: 20, default: 6,  desc: "Maksymalna liczba zmian (0 = bez limitu)" },
          { id: "volleyball_substitutions_per",  label: "Limit zmian liczony",        type: "select", options: ["set","mecz","brak"], default: "set", desc: "Czy limit dotyczy każdego seta osobno, całego meczu, czy nie ma limitu" },
        ]
      },
      {
        title: "⏸ Przerwy (timeout)",
        fields: [
          { id: "volleyball_timeouts_limit",     label: "Limit timeout na drużynę",  type: "number", min: 0, max: 5,  default: 2,  desc: "Liczba dostępnych przerw" },
          { id: "volleyball_timeouts_per",       label: "Limit timeout liczony",      type: "select", options: ["set","mecz","brak"], default: "set", desc: "Czy limit dotyczy każdego seta osobno, całego meczu, czy nie ma limitu" },
        ]
      },
    ]
  },
];

function buildRulesTab(s) {
  const grid = $("rules-cards-grid");
  if (!grid) return;
  grid.innerHTML = "";

  RULES_DEFS.forEach(({ key, emoji, color, sid, sections }) => {
    const card = el("div", "disc-card");
    card.style.setProperty("--disc-color", color);

    let sectionsHtml = sections.map(sec => `
      <div class="dc-section">
        <div class="dc-section-title">${sec.title}</div>
        <div class="rules-fields-grid">
          ${sec.fields.map(f => buildRuleFieldHtml(f, s)).join("")}
        </div>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="dc-header">
        <span class="dc-emoji">${emoji}</span>
        <span class="dc-name">${key}</span>
      </div>
      ${sectionsHtml}
      <div class="dc-footer">
        <button class="dc-save-btn" id="rules-save-${sid}">Zapisz przepisy</button>
        <span class="dc-save-status" id="rules-status-${sid}"></span>
      </div>
    `;

    // wire toggle clicks
    card.querySelectorAll(".rules-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const isOn = btn.dataset.val === "1";
        btn.dataset.val = isOn ? "0" : "1";
        btn.classList.toggle("rules-toggle--on", !isOn);
        btn.querySelector(".rules-toggle-label").textContent = !isOn ? "Tak" : "Nie";
      });
    });

    // wire spinners
    card.querySelectorAll(".dc-spin-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const inp = card.querySelector(`#${btn.dataset.target}`);
        if (!inp) return;
        const min = parseInt(inp.min ?? 0);
        const max = parseInt(inp.max ?? 99);
        inp.value = Math.min(max, Math.max(min, (parseInt(inp.value) || 0) + parseInt(btn.dataset.dir)));
      });
    });

    card.querySelector(`#rules-save-${sid}`).addEventListener("click", () => saveRules(key, sid, card, sections));

    grid.appendChild(card);
  });
}

function buildRuleFieldHtml(f, s) {
  const val = s[f.id] !== undefined ? s[f.id] : f.default;
  if (f.type === "toggle") {
    const isOn = val === "1" || val === true || val === 1;
    return `
      <div class="rules-field">
        <div class="rules-field-label">${f.label}</div>
        <div class="rules-field-desc">${f.desc}</div>
        <button class="rules-toggle ${isOn ? "rules-toggle--on" : ""}" data-id="${f.id}" data-val="${isOn ? "1" : "0"}">
          <span class="rules-toggle-knob"></span>
          <span class="rules-toggle-label">${isOn ? "Tak" : "Nie"}</span>
        </button>
      </div>`;
  }
  if (f.type === "select") {
    const opts = f.options.map(o => `<option value="${o}" ${val == o ? "selected" : ""}>${o.charAt(0).toUpperCase() + o.slice(1)}</option>`).join("");
    return `
      <div class="rules-field">
        <div class="rules-field-label">${f.label}</div>
        <div class="rules-field-desc">${f.desc}</div>
        <select class="rules-select" id="${f.id}">${opts}</select>
      </div>`;
  }
  // number
  return `
    <div class="rules-field">
      <div class="rules-field-label">${f.label}</div>
      <div class="rules-field-desc">${f.desc}</div>
      <div class="dc-pts-spin rules-spin">
        <button class="dc-spin-btn" data-dir="-1" data-target="${f.id}">−</button>
        <input type="number" id="${f.id}" class="dc-spin-val" min="${f.min}" max="${f.max}" value="${val}" />
        <button class="dc-spin-btn" data-dir="1" data-target="${f.id}">+</button>
      </div>
    </div>`;
}

async function saveRules(discipline, sid, card, sections) {
  const btn    = $(`rules-save-${sid}`);
  const status = $(`rules-status-${sid}`);
  btn.disabled = true; btn.textContent = "Zapisywanie…"; status.textContent = "";

  const body = {};
  sections.forEach(sec => {
    sec.fields.forEach(f => {
      if (f.type === "toggle") {
        const toggle = card.querySelector(`.rules-toggle[data-id="${f.id}"]`);
        body[f.id] = toggle ? toggle.dataset.val : f.default;
      } else if (f.type === "select") {
        const sel = card.querySelector(`#${f.id}`);
        body[f.id] = sel ? sel.value : f.default;
      } else {
        const inp = card.querySelector(`#${f.id}`);
        body[f.id] = inp ? inp.value : f.default;
      }
    });
  });

  try {
    const r = await fetch(`${API}/tournament-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    showToast(`✓ ${discipline} — przepisy zapisane`);
    btn.textContent = "✓ Zapisano"; btn.classList.add("dc-save-btn--ok");
    setTimeout(() => { btn.textContent = "Zapisz przepisy"; btn.classList.remove("dc-save-btn--ok"); btn.disabled = false; }, 2400);
  } catch(e) {
    showToast("✗ Błąd zapisu: " + e.message, true);
    btn.textContent = "Zapisz przepisy"; btn.disabled = false;
  }
}

/* ── TAB: Informacje ogólne ─────────────────────────────────────────────── */
function buildInfoTab(s) {
  const form = $("settings-info-form");
  form.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">🏆 Turniej</div>
      <div class="settings-fields">
        <div class="settings-field settings-field--wide">
          <label class="settings-label">Nazwa turnieju</label>
          <input class="settings-input" id="si-name" type="text"
            value="${esc(s.name || "")}" placeholder="np. Mistrzostwa Szkoły 2025" maxlength="120" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Data rozpoczęcia</label>
          <input class="settings-input settings-input--sm" id="si-date-from" type="date" value="${s.date_from || ""}" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Data zakończenia</label>
          <input class="settings-input settings-input--sm" id="si-date-to" type="date" value="${s.date_to || ""}" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Lokalizacja / obiekt</label>
          <input class="settings-input" id="si-location" type="text"
            value="${esc(s.location || "")}" placeholder="np. Hala Sportowa SP7" maxlength="100" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Organizator</label>
          <input class="settings-input" id="si-organizer" type="text"
            value="${esc(s.organizer || "")}" placeholder="np. Samorząd Uczniowski" maxlength="100" />
        </div>
        <div class="settings-field settings-field--wide">
          <label class="settings-label">Opis / hasło turnieju</label>
          <textarea class="settings-input settings-textarea" id="si-description"
            placeholder="Krótki opis turnieju…" maxlength="500">${esc(s.description || "")}</textarea>
        </div>
      </div>
      <div class="settings-actions">
        <button class="save-btn" id="btn-save-info">Zapisz informacje</button>
        <span class="settings-status" id="status-info"></span>
      </div>
    </div>
  `;
  $("btn-save-info").addEventListener("click", saveInfo);
}

async function saveInfo() {
  const btn = $("btn-save-info");
  btn.disabled = true; btn.textContent = "…";
  const body = {
    name:        $("si-name").value.trim(),
    date_from:   $("si-date-from").value,
    date_to:     $("si-date-to").value,
    location:    $("si-location").value.trim(),
    organizer:   $("si-organizer").value.trim(),
    description: $("si-description").value.trim(),
  };
  try {
    const r = await fetch(`${API}/tournament-settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    showToast("✓ Informacje zapisane");
    btn.textContent = "✓ Zapisano"; btn.classList.add("saved");
    setTimeout(() => { btn.textContent = "Zapisz informacje"; btn.classList.remove("saved"); btn.disabled = false; }, 2200);
  } catch(e) {
    showToast("✗ Błąd: " + e.message, true);
    btn.textContent = "Zapisz informacje"; btn.disabled = false;
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const esc    = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const safeId = s => s.replace(/\s+/g,"-").replace(/[^a-zA-Z0-9-]/g,"");