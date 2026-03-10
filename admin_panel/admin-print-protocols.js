/* ── flatSettings: [{key,value}] → {key: value}, lub passthrough jeśli już obiekt ── */
function flatSettings(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) return Object.fromEntries(raw.map(r => [r.key, r.value]));
  return raw; // już obiekt {key: value}
}

/* ════════════════════════════════════════════════════════════════════════════
   PROTOKOŁY DO DRUKU — podgląd w panelu inline (jak w sekcji Meczów)
   Przycisk Drukuj/PDF otwiera nowe okno z @page A4 landscape i wywołuje print()
════════════════════════════════════════════════════════════════════════════ */

/* ── Inicjalizacja przycisków panelu (wywoływana po załadowaniu DOM) ──────── */
function initPrintProtocolPanel() {
  const panel    = document.getElementById("pp-pdf-panel");
  const closeBtn = document.getElementById("pp-pdf-close");
  const printBtn = document.getElementById("pp-pdf-print");

  if (!panel || !closeBtn || !printBtn) return;

  closeBtn.onclick = () => panel.classList.add("hidden");

  printBtn.onclick = () => {
    const body = document.getElementById("pp-pdf-body");
    if (!body) return;
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html lang="pl"><head>
      <meta charset="UTF-8">
      <title>Protokół do druku</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0;
            -webkit-print-color-adjust:exact !important;
            print-color-adjust:exact !important; }
        body { font-family:Arial,Helvetica,sans-serif; font-size:9px;
               color:#000; background:#fff; }
        input { font-family:Arial,Helvetica,sans-serif; color:#000;
                background:transparent; }
        @media print { @page { size: A4 portrait; margin: 8mm 10mm; } }
      </style>
    </head><body>${body.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
}

/* Inicjalizuj gdy DOM gotowy */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPrintProtocolPanel);
} else {
  initPrintProtocolPanel();
}

/* ── Dispatcher ───────────────────────────────────────────────────────────── */
async function generatePrintProtocol(sport) {
  if      (sport === "basketball")        await generateBasketballPrintProtocol();
  else if (sport === "football")          await generateFootballPrintProtocol();
  else if (sport === "volleyball")        await generateVolleyballPrintProtocol();
  else if (sport === "football-penalty")  await generatePenaltyShootoutProtocol();
}

/* ── Helper: pokaż panel i wstaw HTML ────────────────────────────────────── */
function showPrintPanel(titleLabel, htmlContent) {
  const panel = document.getElementById("pp-pdf-panel");
  const body  = document.getElementById("pp-pdf-body");
  const title = document.getElementById("pp-pdf-title");

  if (!panel || !body) return;

  if (title) title.textContent = titleLabel;
  body.innerHTML = htmlContent;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ════════════════════════════════════════════════════════════════════════════
   KOSZYKÓWKA — protokół A4 poziomo, BW
════════════════════════════════════════════════════════════════════════════ */
async function generateBasketballPrintProtocol() {
  const raw = flatSettings(await api('/tournament-settings')) ?? {};
  const s = raw || {};

  /* ── ustawienia ─────────────────────────────────────────────────────────── */
  const periodMode    = s.basketball_periods || "kwarty";
  const periodCount   = periodMode === "połowy" ? 2 : 4;
  const isHalves      = periodCount === 2;
  const QNAMES        = isHalves ? ["P1","P2"] : ["Q1","Q2","Q3","Q4"];

  const timeoutsLimit = parseInt(s.basketball_timeouts_limit       ?? 2);
  const timeoutsPer   = (s.basketball_timeouts_per                 || "mecz").trim();
  const subsLimit     = parseInt(s.basketball_substitutions_limit  ?? 5);
  const subsPer       = (s.basketball_substitutions_per            || "mecz").trim();
  const teamFoulLimit = parseInt(s.basketball_team_foul_limit      ?? 5);
  const teamFoulsPer  = (s.basketball_team_fouls_per               || "połowa").trim();
  const playerFoulLim = parseInt(s.basketball_player_foul_limit    ?? 5);
  const techFoulLim   = parseInt(s.basketball_tech_foul_limit      ?? 2);

  const tournName = s.name      || "";
  const tournDate = s.date_from ? s.date_from.slice(0, 10) : "";
  const tournLoc  = s.location  || "";

  const toPerPeriod  = timeoutsPer  !== "mecz";
  const subPerPeriod = subsPer      !== "mecz";
  const tfPerPeriod  = teamFoulsPer !== "mecz";

  const PC  = "-webkit-print-color-adjust:exact;print-color-adjust:exact";
  const now = new Date().toLocaleString("pl-PL");

  /* ── helper: n checkboxów w jednym rzędzie ──────────────────────────────── */
  function cbs(n, size) {
    n    = Math.min(n || 0, 20);
    size = size || 9;
    if (n <= 0) return "";
    return Array.from({length: n}, () =>
      `<span style="display:inline-block;width:${size}px;height:${size}px;
        border:0.35pt solid #000;margin:0 1px;flex-shrink:0;${PC}"></span>`
    ).join("");
  }

  /* ── style ──────────────────────────────────────────────────────────────── */
  const TH  = `border:0.35pt solid #000;font-size:9.5px;font-weight:700;text-align:center;
               background:#fff;padding:3px 4px;${PC}`;
  const THA = `${TH}`;
  const THB = `${TH};border-left:0.5pt solid #000;`;
  const TD  = `border:0.35pt solid #000;padding:3px 4px;font-size:10px;text-align:center;${PC}`;
  const TDG = `${TD}`;
  const TK  = `border:0.35pt solid #000;padding:3px 6px;font-size:9.5px;font-weight:700;
               white-space:nowrap;${PC}`;
  const TV  = `border:0.35pt solid #000;padding:3px 6px;font-size:10px;${PC}`;

  /* ═══════════════════════════════════════════════════════════════════════════
     BLOK DRUŻYNY
  ═══════════════════════════════════════════════════════════════════════════ */
  function teamBlock(letter) {

    /* faule drużyny — inline Q1:[][][] Q2:[][][] */
    const foulGroups = tfPerPeriod
      ? QNAMES.map(q =>
          `<span style="white-space:nowrap;margin-right:6px">
            <span style="font-size:9px;font-weight:700">${q}:</span>
            ${cbs(Math.min(teamFoulLimit, 8), 9)}
          </span>`
        ).join("")
      : cbs(Math.min(teamFoulLimit, 12), 9);

    const foulInline = `<span style="font-size:9px;font-weight:700;margin-right:5px;white-space:nowrap">Faule drużyny (limit ${teamFoulLimit}/${teamFoulsPer}):</span>${foulGroups}`;

    /* tabela zawodników */
    const playerRows = Array.from({length: 10}, (_, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#fff";
      const c  = (w, ex) =>
        `<td style="${TD};width:${w};background:${bg};height:20px;padding:2px 3px;${ex||""}"></td>`;
      const cbCell = (n, w) =>
        `<td style="${TD};width:${w};background:${bg};height:20px;padding:2px 3px;">
          <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                      justify-content:center;align-items:center;gap:1px">
            ${cbs(n, 10)}
          </div>
        </td>`;
      return `<tr>
        ${c("18px")}
        ${c("130px","text-align:left;")}
        ${c("80px")}
        <td style="${TD};width:24px;background:${bg};font-weight:700;
                   border-left:0.5pt solid #000;height:20px;padding:2px 3px;"></td>
        ${c("20px")} ${c("20px")} ${c("20px")}
        ${cbCell(playerFoulLim, "36px")}
        ${cbCell(techFoulLim,   "26px")}
      </tr>`;
    }).join("");

    const pTH = (w, lbl, ex) =>
      `<th style="${TH};width:${w};${ex||""}">${lbl}</th>`;

    const playerTable = `<table style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          ${pTH("18px","Nr")}
          ${pTH("130px","Imię i nazwisko","text-align:left;padding-left:4px;")}
          ${pTH("80px","Punkty na żywo <span style='font-size:8px;font-weight:400'>(notatki)</span>")}
          ${pTH("24px","Pkt","border-left:0.5pt solid #000;")}
          ${pTH("20px","+1")} ${pTH("20px","+2")} ${pTH("20px","+3")}
          ${pTH("36px","Faule")}
          ${pTH("26px","Techn.")}
        </tr>
      </thead>
      <tbody>${playerRows}</tbody>
    </table>`;

    return `<div style="margin-bottom:2px">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-bottom:1px;gap:6px;border-bottom:0.5pt solid #000;padding-bottom:2px">
        <div style="font-size:11px;font-weight:700;white-space:nowrap">
          Drużyna ${letter}:
          <span style="display:inline-block;border-bottom:0.35pt solid #000;min-width:140px;margin-left:4px;vertical-align:bottom"></span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;flex-shrink:0">${foulInline}</div>
      </div>
      ${playerTable}
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PRAWA KOLUMNA — przebieg meczu (puste pole)
  ═══════════════════════════════════════════════════════════════════════════ */
  function gameFlowSection() {
    return `<div style="flex:1;display:flex;flex-direction:column;margin-bottom:4px">
      <div style="font-size:10px;font-weight:700;background:#fff;border:1pt solid #000;border-bottom:none;padding:4px 6px;text-align:center;${PC}">
        Przebieg meczu
      </div>
      <div style="border:1pt solid #000;border-top:none;flex:1;min-height:20px;${PC}"></div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TABELA KWARTALNY WYNIK + PRZERWY + ZMIANY
  ═══════════════════════════════════════════════════════════════════════════ */
  function resultsTable() {
    const noteTO  = `<span style="font-size:8px;font-weight:400;display:block">(${timeoutsLimit}/${timeoutsPer})</span>`;
    const noteSub = `<span style="font-size:8px;font-weight:400;display:block">(${subsLimit}/${subsPer})</span>`;

    function actionCell(idx, limit, perPeriod, borderLeft) {
      const bl = borderLeft ? "border-left:0.5pt solid #000;" : "";
      if (!perPeriod && idx > 0)
        return `<td style="${TDG};width:44px;${bl}"></td>`;
      return `<td style="${TD};width:44px;${bl}">
        <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                    justify-content:center;align-items:center;gap:1px;padding:2px">
          ${cbs(limit)}
        </div>
      </td>`;
    }

    const rows = QNAMES.map((q, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#fff";
      return `<tr>
        <td style="${TD};width:28px;font-weight:700;background:${bg}">${q}</td>
        <td style="${TD};width:40px;background:${bg};font-size:11px">__ : __</td>
        ${actionCell(i, timeoutsLimit, toPerPeriod,  false)}
        ${actionCell(i, subsLimit,     subPerPeriod, false)}
        ${actionCell(i, timeoutsLimit, toPerPeriod,  true)}
        ${actionCell(i, subsLimit,     subPerPeriod, false)}
      </tr>`;
    }).join("");

    return `<table style="border-collapse:collapse;width:100%;font-size:8px">
      <thead>
        <tr>
          <th rowspan="2" style="${TH};width:28px">${isHalves?"Poł.":"Kw."}</th>
          <th rowspan="2" style="${TH};width:40px">Wynik</th>
          <th colspan="2" style="${THA}">
            <input type="text" placeholder="Nazwa drużyny A"
              style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                     width:100%;font-size:10px;font-weight:700;text-align:center;
                     outline:none;padding:1px 2px;font-family:Arial,sans-serif">
          </th>
          <th colspan="2" style="${THB}">
            <input type="text" placeholder="Nazwa drużyny B"
              style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                     width:100%;font-size:8px;font-weight:700;text-align:center;
                     outline:none;padding:1px 2px;font-family:Arial,sans-serif">
          </th>
        </tr>
        <tr>
          <th style="${THA}">Przerwa${noteTO}</th>
          <th style="${THA}">Zmiana${noteSub}</th>
          <th style="${THB}">Przerwa${noteTO}</th>
          <th style="${TH}">Zmiana${noteSub}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          <td style="${TD};width:28px;font-weight:700">DG</td>
          <td style="${TD};width:40px;font-size:11px">__ : __</td>
          ${actionCell(QNAMES.length, timeoutsLimit, toPerPeriod,  false)}
          ${actionCell(QNAMES.length, subsLimit,     subPerPeriod, false)}
          ${actionCell(QNAMES.length, timeoutsLimit, toPerPeriod,  true)}
          ${actionCell(QNAMES.length, subsLimit,     subPerPeriod, false)}
        </tr>
      </tbody>
    </table>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DOLNY PANEL
  ═══════════════════════════════════════════════════════════════════════════ */
  function bottomPanel() {
    const matchFields = [
      ["Turniej:",        tournName],
      ["Data:",           tournDate],
      ["Miejsce:",        tournLoc],
      ["Boisko nr:",      ""],
      ["Etap / kolejka:", ""],
      ["Godzina rozp.:",  ""],
    ];

    const matchRows = matchFields.map(([lbl, val]) =>
      `<tr>
        <td style="${TK}">${lbl}</td>
        <td style="${TV}">
          <input type="text" value="${val}"
            style="border:none;background:transparent;width:100%;font-size:10px;
                   outline:none;padding:0;font-family:Arial,sans-serif">
        </td>
      </tr>`
    ).join("");

    const refRows = ["Sędzia I:","Sędzia II:","Protokolant:","Asyst. prot.:"].map(lbl =>
      `<tr>
        <td style="${TK}">${lbl}</td>
        <td style="${TV}">
          <input type="text"
            style="border:none;background:transparent;width:100%;font-size:8px;
                   outline:none;padding:0;font-family:Arial,sans-serif">
        </td>
      </tr>`
    ).join("");

    return `<div style="border-top:1pt solid #000;padding-top:4px">

      <!-- WYNIK MECZU — nad tabelą wyników -->
      <div style="margin-bottom:5px;border-bottom:0.5pt solid #000;padding-bottom:5px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span style="font-size:10px;font-weight:700;white-space:nowrap">WYNIK MECZU:</span>
          <input type="text" placeholder="Drużyna A"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   min-width:100px;font-size:11px;text-align:center;outline:none;
                   padding:1px 4px;font-family:Arial,sans-serif">
          <span style="font-size:22px;font-weight:900;letter-spacing:3px">__ : __</span>
          <input type="text" placeholder="Drużyna B"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   min-width:100px;font-size:11px;text-align:center;outline:none;
                   padding:1px 4px;font-family:Arial,sans-serif">
        </div>
        ${resultsTable()}
      </div>

      <!-- DANE MECZU + SĘDZIOWIE — po 50% -->
      <div style="display:flex;gap:0;align-items:flex-start">
        <div style="flex:0 0 50%;box-sizing:border-box;border-right:0.5pt solid #000;padding-right:5px;margin-right:5px">
          <div style="font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;padding-bottom:1px;margin-bottom:2px">DANE MECZU</div>
          <table style="border-collapse:collapse;width:100%">
            ${matchRows}
          </table>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;padding-bottom:1px;margin-bottom:2px">SĘDZIOWIE I OBSŁUGA</div>
          <table style="border-collapse:collapse;width:100%">
            ${refRows}
          </table>
        </div>
      </div>

    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HTML PROTOKOŁU (wstrzykiwany do pp-pdf-body)
  ═══════════════════════════════════════════════════════════════════════════ */
  const infoLine = [tournName, tournDate, tournLoc].filter(Boolean).join("  ·  ");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;
                             background:#fff;width:190mm;height:277mm;padding:4mm 5mm;
                             display:flex;flex-direction:column;
                             -webkit-print-color-adjust:exact;print-color-adjust:exact">

    <!-- NAGŁÓWEK -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                border-bottom:1pt solid #000;padding-bottom:3px;margin-bottom:4px;gap:12px">
      <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">
        PROTOKÓŁ MECZU KOSZYKÓWKI${tournName ? ` — ${tournName}` : ""}
      </div>
      <div style="display:flex;align-items:baseline;gap:14px;font-size:10px;white-space:nowrap;flex-shrink:0">
        <span>Nr protokołu:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:70px;font-size:10px;outline:none;text-align:center;font-family:Arial,sans-serif">
        </span>
        <span>Data:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:80px;font-size:10px;outline:none;text-align:center;font-family:Arial,sans-serif"
                 value="${tournDate}">
        </span>
      </div>
    </div>

    <!-- DRUŻYNY — 100% szerokości -->
    <div style="margin-bottom:4px">
      ${teamBlock("A")}
      <div style="border-top:0.5pt dashed #000;margin:4px 0"></div>
      ${teamBlock("B")}
    </div>

    <!-- PRZEBIEG MECZU — 100% szerokości, wysokość ~jednej listy -->
    ${gameFlowSection()}

    <!-- DOLNY PANEL -->
    ${bottomPanel()}

  </div>`;

  showPrintPanel("📄 Protokół koszykówki — do druku", html);
}
/* ════════════════════════════════════════════════════════════════════════════
   PIŁKA NOŻNA — protokół A4 poziomo, BW
════════════════════════════════════════════════════════════════════════════ */
async function generateFootballPrintProtocol() {
  const raw = flatSettings(await api('/tournament-settings')) ?? {};
  const s = raw || {};

  /* ── ustawienia ─────────────────────────────────────────────────────────── */
  const halfCount       = parseInt(s.football_half_count         ?? 2);
  const subsLimit       = parseInt(s.football_substitutions_limit ?? 5);
  const subsPer         = (s.football_substitutions_per           || "mecz").trim();
  const penaltyShooters = parseInt(s.football_penalty_shooters   ?? 5);
  const hasPenalty      = (s.football_penalty_shootout            || "tak") === "tak";

  const subPerPeriod = subsPer !== "mecz";

  const tournName = s.name      || "";
  const tournDate = s.date_from ? s.date_from.slice(0, 10) : "";
  const tournLoc  = s.location  || "";

  const HALF_NAMES = halfCount === 1 ? ["P1"]
                   : halfCount === 2 ? ["P1", "P2"]
                   : halfCount === 3 ? ["P1", "P2", "P3"]
                   : ["P1", "P2", "P3", "P4"];

  const PC  = "-webkit-print-color-adjust:exact;print-color-adjust:exact";

  /* ── helper: n checkboxów w jednym rzędzie ──────────────────────────────── */
  function cbs(n, size) {
    n    = Math.min(n || 0, 20);
    size = size || 9;
    if (n <= 0) return "";
    return Array.from({length: n}, () =>
      `<span style="display:inline-block;width:${size}px;height:${size}px;
        border:0.35pt solid #000;margin:0 1px;flex-shrink:0;${PC}"></span>`
    ).join("");
  }

  /* ── style ──────────────────────────────────────────────────────────────── */
  const TH  = `border:0.35pt solid #000;font-size:9.5px;font-weight:700;text-align:center;
               background:#fff;padding:3px 4px;${PC}`;
  const THA = `${TH};background:#fff;`;
  const THB = `${TH};background:#fff;border-left:0.5pt solid #000;`;
  const TD  = `border:0.35pt solid #000;padding:3px 4px;font-size:10px;text-align:center;${PC}`;
  const TDG = `${TD};background:#fff;`;
  const TK  = `border:0.35pt solid #000;padding:3px 6px;font-size:9.5px;font-weight:700;
               white-space:nowrap;background:#fff;${PC}`;
  const TV  = `border:0.35pt solid #000;padding:3px 6px;font-size:10px;${PC}`;

  /* ═══════════════════════════════════════════════════════════════════════════
     BLOK DRUŻYNY (10 zawodników)
  ═══════════════════════════════════════════════════════════════════════════ */
  function teamBlock(letter) {

    /* tabela kolumn zmian per połowa — tylko jeśli per połowę */
    const subsHeaderCells = HALF_NAMES.map(h =>
      `<th style="${TH};width:36px">${h}</th>`
    ).join("");

    const subsCells = subPerPeriod
      ? HALF_NAMES.map(() =>
          `<td style="${TD};width:36px">
            <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                        justify-content:center;align-items:center;gap:1px;padding:2px 1px">
              ${cbs(Math.min(subsLimit, 8))}
            </div>
          </td>`
        ).join("")
      : `<td colspan="${halfCount}" style="${TD}">
          <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                      justify-content:center;align-items:center;gap:1px;padding:2px">
            ${cbs(Math.min(subsLimit, 12))}
          </div>
        </td>`;

    /* tabela zawodników — 10 wierszy */
    const playerRows = Array.from({length: 10}, (_, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#fff";
      const c  = (w, ex) =>
        `<td style="${TD};width:${w};background:${bg};height:20px;padding:2px 3px;${ex||""}"></td>`;

      /* żółte kartki: 2 checkboxy (bo max 2) */
      const yellowCell = `<td style="${TD};width:32px;background:${bg};height:20px;padding:2px 3px;">
          <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                      justify-content:center;align-items:center;gap:1px">
            ${cbs(2, 10)}
          </div>
        </td>`;

      /* czerwona kartka: 1 checkbox */
      const redCell = `<td style="${TD};width:18px;background:${bg};height:20px;padding:2px 3px;">
          <div style="display:flex;justify-content:center;align-items:center">
            ${cbs(1, 11)}
          </div>
        </td>`;

      return `<tr>
        ${c("18px")}
        ${c("120px","text-align:left;")}
        ${c("50px")}
        <td style="${TD};width:22px;background:${bg};font-weight:700;
                   border-left:0.5pt solid #000;height:20px;padding:2px 3px;"></td>
        ${yellowCell}
        ${redCell}
      </tr>`;
    }).join("");

    const pTH = (w, lbl, ex) =>
      `<th style="${TH};width:${w};${ex||""}">${lbl}</th>`;

    const playerTable = `<table style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          ${pTH("18px","Nr")}
          ${pTH("120px","Imię i nazwisko","text-align:left;padding-left:4px;")}
          ${pTH("50px","Gole na żywo <span style='font-size:6px;font-weight:400'>(notatki)</span>")}
          ${pTH("22px","Gole","border-left:0.5pt solid #000;")}
          ${pTH("32px","Żółte")}
          ${pTH("18px","Czerw.")}
        </tr>
      </thead>
      <tbody>${playerRows}</tbody>
    </table>`;

    return `<div style="margin-bottom:2px">
      <div style="margin-bottom:1px">
        <div style="font-size:11px;font-weight:700;white-space:nowrap">
          Drużyna ${letter}:
          <span style="display:inline-block;border-bottom:0.35pt solid #000;min-width:140px;margin-left:4px;vertical-align:bottom"></span>
        </div>
      </div>
      ${playerTable}
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PRAWA KOLUMNA — przebieg meczu (puste pole) + notatka z meczu na dole
  ═══════════════════════════════════════════════════════════════════════════ */
  function gameFlowSection() {
    return `<div style="flex:1;display:flex;flex-direction:column;margin-bottom:4px">
      <div style="font-size:10px;font-weight:700;background:#fff;border:1pt solid #000;border-bottom:none;padding:4px 6px;text-align:center;${PC}">
        Przebieg meczu
      </div>
      <div style="border:1pt solid #000;border-top:none;flex:1;min-height:20px;${PC}"></div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TABELA WYNIKÓW PER POŁOWA + ZMIANY
  ═══════════════════════════════════════════════════════════════════════════ */
  function resultsTable() {
    const noteSub = `<span style="font-size:8px;font-weight:400;display:block">(${subsLimit}/${subsPer})</span>`;

    function actionCell(idx, limit, perPeriod, borderLeft) {
      const bl = borderLeft ? "border-left:0.5pt solid #000;" : "";
      if (!perPeriod && idx > 0)
        return `<td style="${TDG};width:44px;${bl}"></td>`;
      return `<td style="${TD};width:44px;${bl}">
        <div style="display:flex;flex-direction:row;flex-wrap:nowrap;
                    justify-content:center;align-items:center;gap:1px;padding:2px">
          ${cbs(Math.min(limit, 6))}
        </div>
      </td>`;
    }

    const rows = HALF_NAMES.map((h, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#fff";
      return `<tr>
        <td style="${TD};width:28px;font-weight:700;background:${bg}">${h}</td>
        <td style="${TD};width:40px;background:${bg};font-size:11px">__ : __</td>
        ${actionCell(i, subsLimit, subPerPeriod, false)}
        ${actionCell(i, subsLimit, subPerPeriod, true)}
      </tr>`;
    }).join("");

    /* wiersz dogrywki */
    const otRow = `<tr>
      <td style="${TD};width:28px;font-weight:700">DG</td>
      <td style="${TD};width:40px;font-size:11px">__ : __</td>
      ${actionCell(HALF_NAMES.length, subsLimit, subPerPeriod, false)}
      ${actionCell(HALF_NAMES.length, subsLimit, subPerPeriod, true)}
    </tr>`;

    return `<table style="border-collapse:collapse;width:100%;font-size:8px">
      <thead>
        <tr>
          <th rowspan="2" style="${TH};width:28px">Poł.</th>
          <th rowspan="2" style="${TH};width:40px">Wynik</th>
          <th style="${THA}">
            <input type="text" placeholder="Nazwa drużyny A"
              style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                     width:100%;font-size:10px;font-weight:700;text-align:center;
                     outline:none;padding:1px 2px;font-family:Arial,sans-serif">
          </th>
          <th style="${THB}">
            <input type="text" placeholder="Nazwa drużyny B"
              style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                     width:100%;font-size:8px;font-weight:700;text-align:center;
                     outline:none;padding:1px 2px;font-family:Arial,sans-serif">
          </th>
        </tr>
        <tr>
          <th style="${TH}">Zmiana${noteSub}</th>
          <th style="${TH}">Zmiana${noteSub}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${otRow}
      </tbody>
    </table>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DOLNY PANEL
  ═══════════════════════════════════════════════════════════════════════════ */
  function bottomPanel() {
    const matchFields = [
      ["Turniej:",        tournName],
      ["Data:",           tournDate],
      ["Miejsce:",        tournLoc],
      ["Boisko nr:",      ""],
      ["Etap / kolejka:", ""],
      ["Godzina rozp.:",  ""],
    ];

    const CELL = `border:0.35pt solid #000;padding:3px 5px;font-size:10px;${PC}`;
    const CELLLBL = `border:0.35pt solid #000;padding:3px 5px;font-size:10px;font-weight:700;white-space:nowrap;${PC}`;

    const matchRows = matchFields.map(([lbl, val]) =>
      `<tr>
        <td style="${CELLLBL}">${lbl}</td>
        <td style="${CELL}">
          <input type="text" value="${val}"
            style="border:none;background:transparent;width:100%;font-size:10px;
                   outline:none;padding:0;font-family:Arial,sans-serif">
        </td>
      </tr>`
    ).join("");

    const refCells = ["Sędzia główny:","Sędzia asystent:","Protokolant I:","Protokolant II:"];
    const refRows2 = refCells.map(lbl =>
      `<tr>
        <td style="${TK}">${lbl}</td>
        <td style="${TV}">
          <input type="text" style="border:none;background:transparent;width:100%;
                 font-size:10px;outline:none;padding:0;font-family:Arial,sans-serif">
        </td>
      </tr>`
    ).join("");

    return `<div style="border-top:1pt solid #000;padding-top:4px">

      <!-- WYNIK MECZU + tabela wyników — 100% szerokości -->
      <div style="margin-bottom:5px;border-bottom:0.5pt solid #000;padding-bottom:5px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span style="font-size:10px;font-weight:700;white-space:nowrap">WYNIK MECZU:</span>
          <input type="text" placeholder="Drużyna A"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   min-width:100px;font-size:11px;text-align:center;outline:none;
                   padding:1px 4px;font-family:Arial,sans-serif">
          <span style="font-size:22px;font-weight:900;letter-spacing:3px">__ : __</span>
          <input type="text" placeholder="Drużyna B"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   min-width:100px;font-size:11px;text-align:center;outline:none;
                   padding:1px 4px;font-family:Arial,sans-serif">
        </div>
        ${resultsTable()}
      </div>

      <!-- DANE MECZU + SĘDZIOWIE — po 50% -->
      <div style="display:flex;gap:0;align-items:flex-start">
        <div style="flex:0 0 50%;box-sizing:border-box;border-right:0.5pt solid #000;padding-right:5px;margin-right:5px">
          <div style="font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;padding-bottom:1px;margin-bottom:2px">DANE MECZU</div>
          <table style="border-collapse:collapse;width:100%">
            ${matchRows}
          </table>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;padding-bottom:1px;margin-bottom:2px">SĘDZIOWIE I OBSŁUGA</div>
          <table style="border-collapse:collapse;width:100%">
            ${refRows2}
          </table>
        </div>
      </div>

    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HTML PROTOKOŁU (wstrzykiwany do pp-pdf-body)
  ═══════════════════════════════════════════════════════════════════════════ */
  const infoLine = [tournName, tournDate, tournLoc].filter(Boolean).join("  ·  ");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;
                             background:#fff;width:190mm;height:277mm;padding:4mm 5mm;
                             display:flex;flex-direction:column;
                             -webkit-print-color-adjust:exact;print-color-adjust:exact">

    <!-- NAGŁÓWEK -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                border-bottom:1pt solid #000;padding-bottom:3px;margin-bottom:4px;gap:12px">
      <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">
        PROTOKÓŁ MECZU PIŁKI NOŻNEJ${tournName ? ` — ${tournName}` : ""}
      </div>
      <div style="display:flex;align-items:baseline;gap:14px;font-size:10px;white-space:nowrap;flex-shrink:0">
        <span>Nr protokołu:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:70px;font-size:10px;outline:none;text-align:center;font-family:Arial,sans-serif">
        </span>
        <span>Data:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:80px;font-size:10px;outline:none;text-align:center;font-family:Arial,sans-serif"
                 value="${tournDate}">
        </span>
      </div>
    </div>

    <!-- DRUŻYNY — 100% szerokości -->
    <div style="margin-bottom:4px">
      ${teamBlock("A")}
      <div style="border-top:0.5pt dashed #000;margin:4px 0"></div>
      ${teamBlock("B")}
    </div>

    <!-- PRZEBIEG MECZU — 100% szerokości, wysokość ~jednej listy -->
    ${gameFlowSection()}

    <!-- DOLNY PANEL -->
    ${bottomPanel()}

  </div>`;

  showPrintPanel("📄 Protokół piłki nożnej — do druku", html);
}
/* ════════════════════════════════════════════════════════════════════════════
   SIATKÓWKA — protokół A4 pionowo, BW
   Układ od góry:
     1. NAGŁÓWEK
     2. Skład A (50%) | Skład B (50%)  — jeden wiersz
     3. Ustawienia początkowe — sety poziomo, każdy: [3×2]──[3×2]
     4. Punkty setów — sety poziomo, 2 kolumny bez ramek wierszy, wynik z kropkami  ← flex:1
     5. Wynik meczu (85%) | Notatka (15%)
     6. Dane meczu (50%) | Sędziowie (50%)
════════════════════════════════════════════════════════════════════════════ */
async function generateVolleyballPrintProtocol() {
  const raw = flatSettings(await api('/tournament-settings')) ?? {};
  const s = raw || {};

  /* ── ustawienia ─────────────────────────────────────────────────────────── */
  const setCount      = parseInt(s.volleyball_set_count           ?? 5);
  const timeoutsLimit = parseInt(s.volleyball_timeouts_limit      ?? 2);
  const timeoutsPer   = (s.volleyball_timeouts_per                || "set").trim();
  const subsLimit     = parseInt(s.volleyball_substitutions_limit ?? 6);
  const subsPer       = (s.volleyball_substitutions_per           || "set").trim();

  const toPerSet  = timeoutsPer !== "mecz";
  const subPerSet = subsPer     !== "mecz";

  const tournName = s.name      || "";
  const tournDate = s.date_from ? s.date_from.slice(0, 10) : "";
  const tournLoc  = s.location  || "";

  const SET_NAMES = Array.from({length: setCount}, (_, i) => `S${i + 1}`);

  const PC = "-webkit-print-color-adjust:exact;print-color-adjust:exact";

  /* ── helper: n checkboxów ────────────────────────────────────────────────── */
  function cbs(n, size) {
    n    = Math.min(n || 0, 20);
    size = size || 9;
    if (n <= 0) return "";
    return Array.from({length: n}, () =>
      `<span style="display:inline-block;width:${size}px;height:${size}px;
        border:0.35pt solid #000;margin:0 1px;flex-shrink:0;${PC}"></span>`
    ).join("");
  }

  /* ── style — identyczne z koszykówką / piłką nożną ──────────────────────── */
  const TH   = `border:0.35pt solid #000;font-size:9.5px;font-weight:700;text-align:center;
                background:#fff;padding:2px 3px;${PC}`;
  const THB  = `${TH};border-left:0.5pt solid #000;`;
  const TD   = `border:0.35pt solid #000;padding:2px 3px;font-size:10px;text-align:center;${PC}`;
  const TK   = `border:0.35pt solid #000;padding:2px 4px;font-size:9.5px;font-weight:700;
                white-space:nowrap;${PC}`;
  const TV   = `border:0.35pt solid #000;padding:2px 4px;font-size:10px;${PC}`;
  const SHDR = `font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;
                padding-bottom:1px;margin-bottom:2px`;

  /* ═══════════════════════════════════════════════════════════════════════════
     BLOK DRUŻYNY — nr | imię i nazwisko | funkcja  (10 zawodników)
  ═══════════════════════════════════════════════════════════════════════════ */
  function teamBlock(letter) {
    const rows = Array.from({length: 10}, (_, i) =>
      `<tr>
        <td style="${TD};width:20px;height:20px;padding:2px 3px;"></td>
        <td style="${TD};text-align:left;padding:2px 4px;height:20px;"></td>
        <td style="${TD};width:50px;height:20px;padding:2px 3px;"></td>
      </tr>`
    ).join("");

    return `<div>
      <div style="font-size:11px;font-weight:700;margin-bottom:1px">
        Drużyna ${letter}:
        <span style="display:inline-block;border-bottom:0.35pt solid #000;
                     min-width:90px;margin-left:4px;vertical-align:bottom"></span>
      </div>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="${TH};width:20px">Nr</th>
          <th style="${TH};text-align:left;padding-left:4px">Imię i nazwisko</th>
          <th style="${TH};width:50px">Funkcja</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:7px;font-style:italic;color:#888;margin-top:1px;text-align:right">
        wiersz 1 — wpisz libero &nbsp;·&nbsp; wiersz 2 — wpisz kapitana
      </div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     USTAWIENIA POCZĄTKOWE
     Każdy set: etykieta | [grid 2×3] ── [grid 2×3]
     Sety ustawione poziomo w jednym wierszu
  ═══════════════════════════════════════════════════════════════════════════ */
  function rotationSection() {
    /* Siatka 3 wiersze × 2 kolumny — zgodnie ze schematem boiska siatkarskiego */
    const cw = 18; /* szerokość komórki */
    const ch = 16; /* wysokość komórki */
    const cell = `<td style="border:0.35pt solid #000;width:${cw}px;height:${ch}px;
                              padding:0;${PC}"></td>`;
    const grid = `<table style="border-collapse:collapse">
      <tbody>
        <tr>${cell}${cell}</tr>
        <tr>${cell}${cell}</tr>
        <tr>${cell}${cell}</tr>
      </tbody>
    </table>`;
    /* pionowa kreska między siatkami drużyn */
    const sep = `<div style="border-left:1pt solid #000;height:100%;margin:0 4px;
                              align-self:stretch"></div>`;

    const setBlocks = SET_NAMES.map(sn =>
      `<div style="display:flex;flex-direction:column;align-items:center;
                   flex:1;padding:0 2px">
        <div style="font-size:9px;font-weight:700;margin-bottom:2px">${sn}</div>
        <div style="display:flex;align-items:stretch">${grid}${sep}${grid}</div>
      </div>`
    ).join("");

    return `<div style="border:1pt solid #000;padding:3px 2px">
      <div style="${SHDR}">USTAWIENIE POCZĄTKOWE</div>
      <div style="display:flex;align-items:flex-start">${setBlocks}</div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PUNKTY SETÓW — flex:1, wypełnia całą dostępną wysokość
     Każdy set: nagłówek | 2 kolumny bez ramek poziomych | wynik z kropkami na dole
     Wynik zapisany bezpośrednio pod kolumnami — tylko linia dolna oddziela
  ═══════════════════════════════════════════════════════════════════════════ */
  function setPointsSection() {
    /* każdy set zajmuje równą część szerokości */
    const setCols = SET_NAMES.map(sn => {
      /* dwie kolumny liczbowe — bez ramek poziomych wewnątrz, tylko separator pionowy */
      const colContent = `<div style="display:flex;flex:1;min-height:0">
        <!-- kolumna A -->
        <div style="flex:1;border-right:0.5pt solid #000;display:flex;
                    flex-direction:column">
          <div style="font-size:8px;font-weight:700;text-align:center;
                      border-bottom:0.35pt solid #000;padding:1px;flex-shrink:0">A</div>
          <div style="flex:1;"></div>
        </div>
        <!-- kolumna B -->
        <div style="flex:1;display:flex;flex-direction:column">
          <div style="font-size:8px;font-weight:700;text-align:center;
                      border-bottom:0.35pt solid #000;padding:1px;flex-shrink:0">B</div>
          <div style="flex:1;"></div>
        </div>
      </div>`;

      /* wynik z kropkami np.  25 . 23 */
      const scoreRow = `<div style="border-top:0.5pt solid #000;padding:2px 1px;
                                    text-align:center;font-size:10px;font-weight:700;
                                    letter-spacing:1px;flex-shrink:0">
        <span style="display:inline-block;width:20px;border-bottom:1pt solid #000"></span>
        <span style="font-size:9px">.</span>
        <span style="display:inline-block;width:20px;border-bottom:1pt solid #000"></span>
      </div>`;

      return `<div style="flex:1;border:1pt solid #000;margin:0 1px;
                          display:flex;flex-direction:column;min-height:0">
        <!-- nagłówek seta -->
        <div style="font-size:9.5px;font-weight:700;text-align:center;padding:2px;
                    border-bottom:0.5pt solid #000;flex-shrink:0">${sn}</div>
        ${colContent}
        ${scoreRow}
      </div>`;
    }).join("");

    return `<div style="flex:1;display:flex;flex-direction:column;min-height:0;
                        border-top:0.5pt solid #000;padding-top:3px;margin-top:3px">
      <div style="${SHDR}">PUNKTY SETÓW</div>
      <div style="flex:1;display:flex;min-height:0">${setCols}</div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     WYNIK MECZU — 100% szerokości, wąskie kolumny przerw/zmian
  ═══════════════════════════════════════════════════════════════════════════ */
  function wynikAndNotatkaSec() {
    function actionCell(si, limit, perSet, extraBorder) {
      const bl = extraBorder ? "border-left:0.5pt solid #000;" : "";
      if (!perSet && si > 0) return `<td style="border:none;${bl}"></td>`;
      return `<td style="${TD};${bl}">
        <div style="display:flex;flex-wrap:nowrap;justify-content:center;
                    align-items:center;gap:1px;padding:1px">${cbs(limit, 8)}</div>
      </td>`;
    }

    /* wylicz wąską stałą szerokość kolumn akcji */
    const toW  = `${Math.min(timeoutsLimit, 6) * 10 + 6}px`;
    const subW = `${Math.min(subsLimit,     6) * 10 + 6}px`;

    const headerRow = `<tr>
      <th rowspan="2" style="${TH};width:24px">Set</th>
      <th rowspan="2" style="${TH};width:36px">Wynik</th>
      <th colspan="2" style="${TH}">
        <input type="text" placeholder="Drużyna A"
          style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:100%;font-size:9.5px;font-weight:700;text-align:center;
                 outline:none;padding:0 2px;font-family:Arial,sans-serif">
      </th>
      <th colspan="2" style="${THB}">
        <input type="text" placeholder="Drużyna B"
          style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 width:100%;font-size:9.5px;font-weight:700;text-align:center;
                 outline:none;padding:0 2px;font-family:Arial,sans-serif">
      </th>
    </tr><tr>
      <th style="${TH};width:${toW}">Przerwa<span style="font-size:7px;font-weight:400;display:block">(${timeoutsLimit}/${timeoutsPer})</span></th>
      <th style="${TH};width:${subW}">Zmiana<span style="font-size:7px;font-weight:400;display:block">(${subsLimit}/${subsPer})</span></th>
      <th style="${THB};width:${toW}">Przerwa</th>
      <th style="${TH};width:${subW}">Zmiana</th>
    </tr>`;

    const dataRows = SET_NAMES.map((sn, si) => `<tr>
      <td style="${TD};font-weight:700">${sn}</td>
      <td style="${TD};font-size:11px">__ : __</td>
      ${actionCell(si, timeoutsLimit, toPerSet,  false)}
      ${actionCell(si, subsLimit,     subPerSet, false)}
      ${actionCell(si, timeoutsLimit, toPerSet,  true)}
      ${actionCell(si, subsLimit,     subPerSet, true)}
    </tr>`).join("");

    const wynikHeader = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
      <span style="font-size:10px;font-weight:700;white-space:nowrap">WYNIK MECZU:</span>
      <input type="text" placeholder="Drużyna A"
        style="border:none;border-bottom:0.35pt solid #000;background:transparent;
               flex:1;font-size:11px;text-align:center;outline:none;
               padding:1px 4px;font-family:Arial,sans-serif">
      <span style="font-size:20px;font-weight:900;letter-spacing:2px">__ : __</span>
      <input type="text" placeholder="Drużyna B"
        style="border:none;border-bottom:0.35pt solid #000;background:transparent;
               flex:1;font-size:11px;text-align:center;outline:none;
               padding:1px 4px;font-family:Arial,sans-serif">
    </div>`;

    return `<div style="border-top:0.5pt solid #000;padding-top:3px;margin-top:3px">
      ${wynikHeader}
      <table style="border-collapse:collapse;width:100%;font-size:9px">
        <thead>${headerRow}</thead>
        <tbody>${dataRows}</tbody>
      </table>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DANE MECZU (50%) | SĘDZIOWIE (50%)
  ═══════════════════════════════════════════════════════════════════════════ */
  function bottomRow() {
    const matchFields = [
      ["Turniej:",        tournName],
      ["Data:",           tournDate],
      ["Miejsce:",        tournLoc],
      ["Hala / boisko:",  ""],
      ["Etap / kolejka:", ""],
      ["Godzina rozp.:",  ""],
    ];
    const matchRows = matchFields.map(([lbl, val]) => `<tr>
      <td style="${TK}">${lbl}</td>
      <td style="${TV}"><input type="text" value="${val}"
        style="border:none;background:transparent;width:100%;font-size:10px;
               outline:none;padding:0;font-family:Arial,sans-serif"></td>
    </tr>`).join("");

    const refs = ["Sędzia I:", "Sędzia II:", "Protokolant:", "Asyst. prot.:"];
    const refRows = refs.map(lbl => `<tr>
      <td style="${TK}">${lbl}</td>
      <td style="${TV}"><input type="text"
        style="border:none;background:transparent;width:100%;font-size:10px;
               outline:none;padding:0;font-family:Arial,sans-serif"></td>
    </tr>`).join("");

    return `<div style="display:flex;gap:0;border-top:0.5pt solid #000;
                        padding-top:3px;margin-top:3px;align-items:flex-start">
      <div style="flex:0 0 50%;border-right:0.5pt solid #000;padding-right:5px;
                  margin-right:5px;box-sizing:border-box">
        <div style="${SHDR}">DANE MECZU</div>
        <table style="border-collapse:collapse;width:100%">${matchRows}</table>
      </div>
      <div style="flex:1;min-width:0">
        <div style="${SHDR}">SĘDZIOWIE I OBSŁUGA MECZU</div>
        <table style="border-collapse:collapse;width:100%">${refRows}</table>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ZŁOŻENIE HTML
  ══════════════════════════════════════════════════════════════════════════ */
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;
                             background:#fff;width:190mm;height:277mm;padding:4mm 5mm;
                             display:flex;flex-direction:column;box-sizing:border-box;
                             -webkit-print-color-adjust:exact;print-color-adjust:exact">

    <!-- NAGŁÓWEK -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                border-bottom:1pt solid #000;padding-bottom:3px;margin-bottom:4px;gap:12px;
                flex-shrink:0">
      <div style="font-size:12px;font-weight:900;text-transform:uppercase;
                  letter-spacing:.05em;white-space:nowrap">
        PROTOKÓŁ MECZU SIATKÓWKI${tournName ? ` — ${tournName}` : ""}
      </div>
      <div style="display:flex;align-items:baseline;gap:14px;font-size:10px;
                  white-space:nowrap;flex-shrink:0">
        <span>Nr protokołu:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;
                 background:transparent;width:70px;font-size:10px;outline:none;
                 text-align:center;font-family:Arial,sans-serif">
        </span>
        <span>Data:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;
                 background:transparent;width:80px;font-size:10px;outline:none;
                 text-align:center;font-family:Arial,sans-serif" value="${tournDate}">
        </span>
      </div>
    </div>

    <!-- 1. SKŁADY — dwie drużyny obok siebie -->
    <div style="display:flex;gap:0;flex-shrink:0;margin-bottom:3px;
                border-bottom:0.5pt solid #000;padding-bottom:3px">
      <div style="flex:1;min-width:0;border-right:0.5pt solid #000;
                  padding-right:5px;margin-right:5px">
        ${teamBlock("A")}
      </div>
      <div style="flex:1;min-width:0">
        ${teamBlock("B")}
      </div>
    </div>

    <!-- 2. USTAWIENIA POCZĄTKOWE — sety poziomo -->
    <div style="flex-shrink:0;margin-bottom:3px">
      ${rotationSection()}
    </div>

    <!-- 3. PUNKTY SETÓW — flex:1, zajmuje całą pozostałą przestrzeń -->
    ${setPointsSection()}

    <!-- 4. WYNIK MECZU — 100% szerokości -->
    <div style="flex-shrink:0">
      ${wynikAndNotatkaSec()}
    </div>

    <!-- 5. DANE MECZU (50%) | SĘDZIOWIE (50%) -->
    <div style="flex-shrink:0">
      ${bottomRow()}
    </div>

  </div>`;

  showPrintPanel("📄 Protokół siatkówki — do druku", html);
}


/* ════════════════════════════════════════════════════════════════════════════
   RZUTY KARNE — protokół A4 pionowo, BW
   Układ:
     NAGŁÓWEK
     ┌─────────────────────────────────────────────────────────────────────┐
     │ Drużyna A (50%) │ Drużyna B (50%)                                   │
     │  nr │ Imię i nazwisko │ Pozycja   nr │ Imię i nazwisko │ Pozycja   │
     │  1 wiersz bramkarz + shootersPerRound wierszy strzelców             │
     ├─────────────────────────────────────────────────────────────────────┤
     │         Seria │ Nr strzelającego │ Drużyna A │ Drużyna B            │
     │         wiersze dynamiczne: shootersPerRound × maxRounds             │
     │         grubsza linia między pętlami                                │
     ├─────────────────────────────────────────────────────────────────────┤
     │ WYNIK RZUTÓW KARNYCH                                                │
     │ DANE MECZU (50%) │ SĘDZIOWIE (50%)                                  │
     └─────────────────────────────────────────────────────────────────────┘
════════════════════════════════════════════════════════════════════════════ */
async function generatePenaltyShootoutProtocol() {
  const raw = flatSettings(await api('/tournament-settings')) ?? {};
  const s = raw || {};

  /* ── ustawienia ─────────────────────────────────────────────────────── */
  const shootersPerRound = parseInt(s.football_penalty_shooters ?? 5);
  const preferredRounds  = 4;
  const maxSafeRows      = 35;
  const maxRounds        = Math.max(1, Math.min(preferredRounds, Math.floor(maxSafeRows / shootersPerRound)));
  const totalRows        = shootersPerRound * maxRounds;
  const defaultRound     = 1;

  const tournName = s.name      || "";
  const tournDate = s.date_from ? s.date_from.slice(0, 10) : "";
  const tournLoc  = s.location  || "";

  const PC   = "-webkit-print-color-adjust:exact;print-color-adjust:exact";

  /* ── style (identyczne z piłką nożną) ──────────────────────────────── */
  const TH  = `border:0.35pt solid #000;font-size:9.5px;font-weight:700;text-align:center;
               background:#fff;padding:3px 4px;${PC}`;
  const THB = `${TH};border-left:0.5pt solid #000;`;
  const TD  = `border:0.35pt solid #000;padding:3px 4px;font-size:10px;text-align:center;${PC}`;
  const TK  = `border:0.35pt solid #000;padding:3px 6px;font-size:9.5px;font-weight:700;
               white-space:nowrap;${PC}`;
  const TV  = `border:0.35pt solid #000;padding:3px 6px;font-size:10px;${PC}`;
  const SHDR = `font-size:10px;font-weight:700;border-bottom:0.5pt solid #000;
                padding-bottom:1px;margin-bottom:2px`;

  /* ── checkbox ──────────────────────────────────────────────────────── */
  function cb(size) {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;
      border:0.35pt solid #000;flex-shrink:0;${PC}"></span>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BLOK DRUŻYNY
     Wiersze: 1 bramkarz + shootersPerRound strzelców (razem 1+shootersPerRound)
  ═══════════════════════════════════════════════════════════════════════ */
  function teamBlock(letter) {
    /* wiersz 0 = bramkarz, wiersze 1..shootersPerRound = strzelcy */
    const rowCount = 1 + shootersPerRound;
    const rows = Array.from({length: rowCount}, (_, i) => {
      const pos      = i === 0 ? "Bramkarz" : "Strzelec";
      const posColor = i === 0 ? "color:#333;font-style:italic" : "color:#555;font-style:italic";
      const numLabel = i === 0 ? "Br" : String(i);
      return `<tr>
        <td style="${TD};width:22px;height:18px;padding:1px 2px;font-weight:700">${numLabel}</td>
        <td style="${TD};text-align:left;padding:1px 5px;height:18px;"></td>
        <td style="${TD};width:60px;height:18px;padding:1px 3px;
                   font-size:8.5px;${posColor}">${pos}</td>
      </tr>`;
    }).join("");

    return `<div>
      <div style="font-size:11px;font-weight:700;margin-bottom:2px">
        Drużyna ${letter}:
        <span style="display:inline-block;border-bottom:0.35pt solid #000;
                     min-width:110px;margin-left:4px;vertical-align:bottom"></span>
      </div>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="${TH};width:22px">Nr</th>
          <th style="${TH};text-align:left;padding-left:5px">Imię i nazwisko</th>
          <th style="${TH};width:60px">Pozycja</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TABELA SERII RZUTÓW
     Kolumny: Seria | Nr strzelającego | Drużyna A | Drużyna B
     Numer strzelającego cyklicznie 1..shootersPerRound
     Grubsza linia (1pt) oddziela każdą pętlę
  ═══════════════════════════════════════════════════════════════════════ */
  function shootoutTable() {
    /* komórki wyniku puste */
    const resultTD = (extraLeft) => {
      const bl = extraLeft ? "border-left:0.5pt solid #000;" : "";
      return `<td style="${TD};${bl}"></td>`;
    };

    const rows = Array.from({length: totalRows}, (_, i) => {
      const seriaNum   = i + 1;
      const shooterIdx = i % shootersPerRound;
      /* strzelcy numerowani 1..shootersPerRound — bramkarz nie strzela karnych */
      const shooterNum = String(shooterIdx + 1);
      const roundNum   = Math.floor(i / shootersPerRound) + 1;
      const loopBorder = (i > 0 && shooterIdx === 0) ? "border-top:1pt solid #000;" : "";
      const star       = roundNum === defaultRound
        ? `<span style="font-size:8px;margin-left:1px">★</span>` : "";

      return `<tr>
        <td style="${TD};width:32px;font-weight:700;font-size:11px;${loopBorder}">${seriaNum}${star}</td>
        <td style="${TD};width:100px;font-size:13px;font-weight:800;${loopBorder}">${shooterNum}</td>
        ${resultTD(false).replace('<td style="', `<td style="${loopBorder}`)}
        ${resultTD(true).replace('<td style="', `<td style="${loopBorder}`)}
      </tr>`;
    }).join("");

    const legend = `<div style="font-size:9px;margin-bottom:3px;color:#000">
      Oznaczanie: <strong>✓</strong> trafiony &nbsp;&nbsp;<strong>✗</strong> chybiony / obroniony
      &nbsp;&nbsp;<span style="font-size:8px">★ = domyślna seria</span>
    </div>`;

    const header = `<thead>
      <tr>
        <th rowspan="2" style="${TH};width:32px">Seria</th>
        <th rowspan="2" style="${TH};width:100px">Nr<br>strzelającego</th>
        <th style="${TH}">
          <input type="text" placeholder="Drużyna A"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   width:100%;font-size:9.5px;font-weight:700;text-align:center;
                   outline:none;padding:0 2px;font-family:Arial,sans-serif">
        </th>
        <th style="${THB}">
          <input type="text" placeholder="Drużyna B"
            style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                   width:100%;font-size:9.5px;font-weight:700;text-align:center;
                   outline:none;padding:0 2px;font-family:Arial,sans-serif">
        </th>
      </tr>
      <tr>
        <th style="${TH}">Wynik</th>
        <th style="${THB}">Wynik</th>
      </tr>
    </thead>`;

    return legend + `<table style="border-collapse:collapse;width:100%">
      ${header}
      <tbody>${rows}</tbody>
    </table>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DOLNY PAS — wynik + dane meczu (50%) + sędziowie (50%)
  ═══════════════════════════════════════════════════════════════════════ */
  function bottomSection() {
    return `<div style="border-top:1pt solid #000;padding-top:4px;margin-top:3px;flex-shrink:0">

      <!-- WYNIK RZUTÓW KARNYCH -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;
                  border-bottom:0.5pt solid #000;padding-bottom:3px">
        <span style="font-size:10px;font-weight:700;white-space:nowrap">
          WYNIK RZUTÓW KARNYCH:
        </span>
        <input type="text" placeholder="Drużyna A"
          style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 flex:1;font-size:11px;text-align:center;outline:none;
                 padding:1px 4px;font-family:Arial,sans-serif">
        <span style="font-size:22px;font-weight:900;letter-spacing:3px">__ : __</span>
        <input type="text" placeholder="Drużyna B"
          style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 flex:1;font-size:11px;text-align:center;outline:none;
                 padding:1px 4px;font-family:Arial,sans-serif">
      </div>

      <!-- DOTYCZY MECZU -->
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:10px;font-weight:700;white-space:nowrap">Dotyczy meczu:</span>
        <input type="text" placeholder="np. Drużyna A – Drużyna B, etap, data, godzina, boisko…"
          style="border:none;border-bottom:0.35pt solid #000;background:transparent;
                 flex:1;font-size:11px;outline:none;padding:1px 4px;
                 font-family:Arial,sans-serif">
      </div>

    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ZŁOŻENIE HTML
  ═══════════════════════════════════════════════════════════════════════ */
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;
                             background:#fff;width:190mm;height:277mm;padding:4mm 5mm;
                             display:flex;flex-direction:column;box-sizing:border-box;
                             -webkit-print-color-adjust:exact;print-color-adjust:exact">

    <!-- NAGŁÓWEK -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                border-bottom:1pt solid #000;padding-bottom:3px;margin-bottom:4px;
                gap:12px;flex-shrink:0">
      <div style="font-size:12px;font-weight:900;text-transform:uppercase;
                  letter-spacing:.05em;white-space:nowrap">
        PROTOKÓŁ RZUTÓW KARNYCH${tournName ? ` — ${tournName}` : ""}
      </div>
      <div style="display:flex;align-items:baseline;gap:14px;font-size:10px;
                  white-space:nowrap;flex-shrink:0">
        <span>Nr protokołu:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;
                 background:transparent;width:70px;font-size:10px;outline:none;
                 text-align:center;font-family:Arial,sans-serif">
        </span>
        <span>Data:
          <input type="text" style="border:none;border-bottom:0.35pt solid #000;
                 background:transparent;width:80px;font-size:10px;outline:none;
                 text-align:center;font-family:Arial,sans-serif" value="${tournDate}">
        </span>
      </div>
    </div>

    <!-- SKŁADY — dwie drużyny obok siebie (50%/50%) -->
    <div style="display:flex;gap:0;flex-shrink:0;
                border:1pt solid #000;padding:4px 5px;margin-bottom:4px">
      <div style="flex:1;min-width:0;border-right:0.5pt solid #000;
                  padding-right:6px;margin-right:6px">
        ${teamBlock("A")}
      </div>
      <div style="flex:1;min-width:0">
        ${teamBlock("B")}
      </div>
    </div>

    <!-- TABELA SERII — flex:1 wypełnia pozostałe miejsce -->
    <div style="flex:1;display:flex;flex-direction:column;min-height:0;margin-bottom:3px">
      <div style="${SHDR}">SERIA RZUTÓW KARNYCH
        <span style="font-size:8px;font-weight:400;margin-left:8px">
          ${shootersPerRound} strzelców / runda &nbsp;·&nbsp;
          ${maxRounds} rundy &nbsp;·&nbsp;
          łącznie ${totalRows} rzutów &nbsp;·&nbsp; ★ = domyślna seria
        </span>
      </div>
      ${shootoutTable()}
    </div>

    <!-- WYNIK + DANE + SĘDZIOWIE -->
    ${bottomSection()}

  </div>`;

  showPrintPanel("📄 Protokół rzutów karnych — do druku", html);
}