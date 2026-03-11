/* normFmt() zdefiniowane globalnie w admin-globals.js */

/* ════════════════════════════════════════════════════════════════════════════
   DODAJ ZAWODNIKA
════════════════════════════════════════════════════════════════════════════ */
function showAddPlayerModal(teamId) {
  document.getElementById("add-modal")?.remove();

  const overlay = el("div", "confirm-overlay");
  overlay.id = "add-modal";
  overlay.innerHTML = `
    <div class="confirm-box add-modal-box">
      <div class="confirm-icon">👤</div>
      <div class="confirm-title">Nowy zawodnik</div>
      <div class="add-form">
        <div class="add-row">
          <div class="add-field">
            <label class="add-label">Imię *</label>
            <input id="new-p-first" class="team-edit-input" type="text" placeholder="Jan" maxlength="50" />
          </div>
          <div class="add-field">
            <label class="add-label">Nazwisko *</label>
            <input id="new-p-last" class="team-edit-input" type="text" placeholder="Kowalski" maxlength="50" />
          </div>
        </div>
        <div class="add-field">
          <label class="add-label">Klasa</label>
          <input id="new-p-class" class="team-edit-input team-edit-input--sm" type="text" placeholder="np. 3A" maxlength="10" />
        </div>
        <div class="add-checkboxes">
          <label class="add-check-label">
            <input type="checkbox" id="new-p-captain" />
            <span>© Kapitan</span>
          </label>
          <label class="add-check-label">
            <input type="checkbox" id="new-p-rodo" />
            <span>📄 Zgoda RODO</span>
          </label>
          <label class="add-check-label">
            <input type="checkbox" id="new-p-parent" />
            <span>👨‍👩‍👦 Zgoda uczestnictwa</span>
          </label>
        </div>
        <div class="add-field">
          <label class="add-label">Wpisowe (zł)</label>
          <input id="new-p-fee" class="team-edit-input team-edit-input--sm fee-input" type="number" min="0" step="0.01" value="0" />
        </div>
      </div>
      <div class="confirm-btns" style="margin-top:.75rem">
        <button class="confirm-btn-cancel">Anuluj</button>
        <button class="confirm-btn-save">✓ Dodaj zawodnika</button>
      </div>
      <p class="add-error hidden" id="add-player-error"></p>
    </div>
  `;

  overlay.querySelector(".confirm-btn-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector(".confirm-btn-save").addEventListener("click", async () => {
    const first  = overlay.querySelector("#new-p-first").value.trim();
    const last   = overlay.querySelector("#new-p-last").value.trim();
    const cls    = overlay.querySelector("#new-p-class").value.trim();
    const cap    = overlay.querySelector("#new-p-captain").checked;
    const rodo   = overlay.querySelector("#new-p-rodo").checked;
    const parent = overlay.querySelector("#new-p-parent").checked;
    const fee    = parseFloat(overlay.querySelector("#new-p-fee").value) || 0;
    const errEl  = overlay.querySelector("#add-player-error");

    if (!first || !last) { errEl.textContent = "Imię i nazwisko są wymagane."; errEl.classList.remove("hidden"); return; }

    const btn = overlay.querySelector(".confirm-btn-save");
    btn.disabled = true; btn.textContent = "…";

    try {
      const result = await createPlayer({
        team_id:               teamId,
        first_name:            first,
        last_name:             last,
        class_name:            cls || null,
        is_captain:            cap,
        rodo_consent:          rodo,
        participation_consent: parent,
        entry_fee_paid:        fee,
      });
      if (result?.error) throw new Error(result.error);
      overlay.remove();
      showToast("✓ Zawodnik dodany");
      // odśwież skład drużyny
      selectTeam(teamId, $("team-players-header").querySelector("h2").textContent);
    } catch(e) {
      errEl.textContent = "Błąd: " + e.message;
      errEl.classList.remove("hidden");
      btn.disabled = false; btn.textContent = "✓ Dodaj zawodnika";
    }
  });

  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector("#new-p-first").focus(), 50);
}

/* ════════════════════════════════════════════════════════════════════════════
   ROZSTAWIENIE — DRAG-TO-SLOT
════════════════════════════════════════════════════════════════════════════ */
let srDisc      = "Piłka Nożna";
let srType      = "liga";
let srAllTeams  = [];
let srPool      = [];
let srSlots     = [];
let srGroups    = 2;
let srTeamsPerG = 4;
let srCupSize   = 8;
let srDragging  = null;
let srFmt       = null;
let srLocked    = false;
let srDirty     = false;

/* ── status / blokada ─────────────────────────────────────────────────────── */
function srMarkDirty() {
  if (srDirty) return;
  srDirty = true;
  srUpdateStatus();
}
function srMarkClean() {
  srDirty = false;
  srUpdateStatus();
}
function srUpdateStatus() {
  const el = $("sr-status");
  if (!el) return;
  if (srLocked) {
    el.textContent = "🔒 Zablokowano";
    el.className = "sr-status sr-status--locked";
  } else if (srDirty) {
    el.textContent = "● Niezapisano";
    el.className = "sr-status sr-status--dirty";
  } else {
    el.textContent = "✓ Zapisano";
    el.className = "sr-status sr-status--saved";
  }
}
function srUpdateLockBtn() {
  const btn = $("sr-lock-btn");
  if (!btn) return;
  if (srLocked) {
    btn.textContent = "🔒 Zablokowane";
    btn.classList.add("sr-btn--locked");
  } else {
    btn.textContent = "🔓 Odblokowane";
    btn.classList.remove("sr-btn--locked");
  }
  ["sr-random-btn","sr-clear-btn","sr-save-btn"].forEach(id => {
    const b = $(id); if (b) b.disabled = srLocked;
  });
  const ws = $("sr-workspace");
  if (ws) ws.classList.toggle("sr-workspace--locked", srLocked);
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
async function loadRozstawienie() {
  document.querySelectorAll(".sr-disc-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sr-disc-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      srDisc = btn.dataset.disc;
      srInitWorkspace();
    });
  });
  document.querySelectorAll(".sr-type-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sr-type-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      srType = btn.dataset.type;
      srInitWorkspace();
    });
  });
  $("sr-random-btn").addEventListener("click", srRandomize);
  $("sr-clear-btn").addEventListener("click",  srClear);
  $("sr-save-btn").addEventListener("click",   srSave);
  $("sr-lock-btn").addEventListener("click", () => {
    srLocked = !srLocked;
    srUpdateLockBtn();
    srUpdateStatus();
    srRender();
    showSeedToast(srLocked ? "🔒 Rozstawienie zablokowane" : "🔓 Rozstawienie odblokowane");
  });

  srInitWorkspace();
}

async function srInitWorkspace() {
  const ws = $("sr-workspace");
  ws.innerHTML = `<div class="panel-loading">Ładowanie…</div>`;

  const [fmtAllRaw, teamsRaw, seedRaw] = await Promise.all([
    api("/tournament-format"),
    api("/teams"),
    api(`/seeding/${encodeURIComponent(srDisc)}/${srType}`),
  ]);

  const fmtAll = normFmt(fmtAllRaw);
  srFmt = fmtAll?.[srDisc] || {};
  srAllTeams = teamsRaw || [];

  // liga — z formatu
  srGroups    = srFmt.groups_count    || 2;
  srTeamsPerG = srFmt.teams_per_group || 4;

  // puchar — rozmiar z cup_rounds (liczba rund = potęga 2)
  const cupRounds = Array.isArray(srFmt.cup_rounds) ? srFmt.cup_rounds : ["1/4","Półfinał","Finał"];
  srCupSize = Math.max(4, Math.pow(2, cupRounds.length));

  // zbuduj puste sloty
  srSlots = srType === "liga" ? srBuildLeagueSlots() : srBuildCupSlots();

  // wgraj zapisane rozstawienie (position = indeks slotu, -1 = pula)
  if (seedRaw?.length) {
    seedRaw.filter(t => t.position >= 0 && t.position < srSlots.length).forEach(t => {
      // BUG-FIX: parseInt() zapobiega duplikacji drużyny w slocie i puli
      // gdy team_id z Supabase jest stringiem a teams[].id liczbą
      srSlots[t.position].team = {
        id:         parseInt(t.team_id ?? t.id, 10),
        team_name:  t.teams?.team_name  ?? t.team_name,
        class_name: t.teams?.class_name ?? t.class_name,
      };
    });
  }

  // pula = nieprzypisane
  const assignedIds = new Set(srSlots.filter(s => s.team).map(s => s.team.id));
  srPool = srAllTeams.filter(t => !assignedIds.has(parseInt(t.id, 10)));

  srMarkClean();
  srUpdateLockBtn();
  srRender();
}

function srBuildLeagueSlots() {
  const slots = [];
  for (let g = 0; g < srGroups; g++)
    for (let s = 0; s < srTeamsPerG; s++)
      slots.push({ gIdx: g, sIdx: s, team: null, key: `g${g}_s${s}` });
  return slots;
}

function srBuildCupSlots() {
  const slots = [];
  for (let s = 0; s < srCupSize; s++)
    slots.push({ gIdx: 0, sIdx: s, team: null, key: `c${s}` });
  return slots;
}

/* ── Render ───────────────────────────────────────────────────────────────── */
function srRender() {
  const ws = $("sr-workspace");
  ws.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "sr-wrap";

  // Lewa: pula
  wrap.appendChild(srRenderPool());

  // Prawa: struktura
  const right = document.createElement("div");
  right.className = "sr-right";
  right.appendChild(srType === "liga" ? srRenderLeague() : srRenderCup());
  wrap.appendChild(right);

  ws.appendChild(wrap);
}

/* ── PULA ─────────────────────────────────────────────────────────────────── */
function srRenderPool() {
  const panel = document.createElement("div");
  panel.className = "sr-pool-panel";

  const header = document.createElement("div");
  header.className = "sr-pool-header";
  header.innerHTML = `
    <span class="sr-pool-title">Pula drużyn</span>
    <span class="sr-pool-count" id="sr-pool-count">${srPool.length}</span>
  `;
  panel.appendChild(header);

  const list = document.createElement("div");
  list.className = "sr-pool-list";
  list.id = "sr-pool-list";

  if (srPool.length === 0) {
    list.innerHTML = `<div class="sr-pool-done"><span>✅</span><span>Wszystkie przypisane</span></div>`;
  } else {
    srPool.forEach((t, i) => {
      const chip = srMakeChip(t, "pool", i);
      list.appendChild(chip);
    });
  }

  // drop na pulę (zwrot ze slotu)
  list.addEventListener("dragover", e => { if (srLocked) return; e.preventDefault(); list.classList.add("sr-pool-list--over"); });
  list.addEventListener("dragleave", () => list.classList.remove("sr-pool-list--over"));
  list.addEventListener("drop", e => {
    e.preventDefault();
    list.classList.remove("sr-pool-list--over");
    if (!srDragging) return;
    if (srDragging.source === "slot") {
      // wyciągnij z slotu → wróć do puli
      const slot = srSlots.find(s => s.key === srDragging.slotKey);
      if (slot && slot.team) {
        srPool.push(slot.team);
        slot.team = null;
        srDragging = null;
        srMarkDirty();
        srRender();
      }
    }
  });

  panel.appendChild(list);
  return panel;
}

/* ── CHIP drużyny ─────────────────────────────────────────────────────────── */
function srMakeChip(team, source, idxOrKey) {
  const chip = document.createElement("div");
  chip.className = "sr-chip";
  chip.draggable = !srLocked;
  const initials = team.team_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
  chip.innerHTML = `
    <span class="sr-chip-avatar">${initials}</span>
    <span class="sr-chip-name">${team.team_name}</span>
    <span class="sr-chip-class">${team.class_name}</span>
  `;

  chip.addEventListener("dragstart", e => {
    srDragging = { source, poolIdx: source === "pool" ? idxOrKey : null, slotKey: source === "slot" ? idxOrKey : null, team };
    chip.classList.add("sr-chip--dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  chip.addEventListener("dragend", () => chip.classList.remove("sr-chip--dragging"));

  return chip;
}

/* ── LIGA ─────────────────────────────────────────────────────────────────── */
function srRenderLeague() {
  const wrap = document.createElement("div");
  wrap.className = "sr-league-wrap";

  // grupy
  const grid = document.createElement("div");
  grid.className = "sr-groups-grid";

  for (let g = 0; g < srGroups; g++) {
    const groupEl = document.createElement("div");
    groupEl.className = "sr-group";
    const gLabel = String.fromCharCode(65 + g); // A, B, C...
    groupEl.innerHTML = `<div class="sr-group-title">Grupa ${gLabel}</div>`;

    for (let s = 0; s < srTeamsPerG; s++) {
      const key = `g${g}_s${s}`;
      const slot = srSlots.find(sl => sl.key === key);
      const slotEl = srMakeSlot(slot || { key, team: null }, s + 1);
      groupEl.appendChild(slotEl);
    }
    grid.appendChild(groupEl);
  }
  wrap.appendChild(grid);

  return wrap;
}

function srChangeGroups(delta) {
  const next = Math.max(1, Math.min(8, srGroups + delta));
  if (next === srGroups) return;
  // usuń lub dodaj sloty
  if (next < srGroups) {
    // zwróć drużyny usuniętych grup do puli
    for (let g = next; g < srGroups; g++) {
      for (let s = 0; s < srTeamsPerG; s++) {
        const key = `g${g}_s${s}`;
        const slot = srSlots.find(sl => sl.key === key);
        if (slot?.team) { srPool.push(slot.team); }
      }
    }
    srSlots = srSlots.filter(sl => sl.gIdx < next);
  } else {
    for (let g = srGroups; g < next; g++)
      for (let s = 0; s < srTeamsPerG; s++)
        srSlots.push({ gIdx: g, sIdx: s, team: null, key: `g${g}_s${s}` });
  }
  srGroups = next;
  srRender();
}

function srChangeTeamsPerGroup(delta) {
  const next = Math.max(2, Math.min(16, srTeamsPerG + delta));
  if (next === srTeamsPerG) return;
  if (next < srTeamsPerG) {
    // zwróć do puli drużyny z usuniętych slotów
    for (let g = 0; g < srGroups; g++) {
      for (let s = next; s < srTeamsPerG; s++) {
        const key = `g${g}_s${s}`;
        const slot = srSlots.find(sl => sl.key === key);
        if (slot?.team) { srPool.push(slot.team); }
      }
    }
    srSlots = srSlots.filter(sl => sl.sIdx < next);
  } else {
    for (let g = 0; g < srGroups; g++)
      for (let s = srTeamsPerG; s < next; s++)
        srSlots.push({ gIdx: g, sIdx: s, team: null, key: `g${g}_s${s}` });
  }
  srTeamsPerG = next;
  srRender();
}

/* ── PUCHAR — prawdziwa drabinka ──────────────────────────────────────────── */
function srRenderCup() {
  const wrap = document.createElement("div");
  wrap.className = "sr-cup-wrap";

  // kontener drabinki z poziomym scrollem
  const bracketOuter = document.createElement("div");
  bracketOuter.className = "sr-bracket-outer";

  const bracketEl = document.createElement("div");
  bracketEl.className = "sr-bracket";
  bracketEl.id = "sr-bracket-el";

  // ile rund
  const rounds = Math.log2(srCupSize);          // np. 8 → 3 rundy (1/4, 1/2, Finał)
  const roundNames = buildRoundNames(srCupSize);

  // slot konf per runda
  const SLOT_H    = 68;   // px wysokość jednego slotu (zawodnik)
  const MATCH_H   = SLOT_H * 2 + 4;   // dwa sloty + separator
  const MATCH_GAP = 24;   // odstęp między meczami
  const ROUND_W   = 230;  // szerokość jednej rundy
  const CON_W     = 40;   // szerokość kolumny łączników

  // oblicz wysokość canvas dla każdej rundy
  // runda 0 = pierwsza runda: srCupSize/2 meczów
  const matchesInRound = r => srCupSize / Math.pow(2, r + 1);
  const roundH = r => {
    const n = matchesInRound(r);
    return n * MATCH_H + (n - 1) * MATCH_GAP;
  };
  const maxH = roundH(0) + 40; // +padding

  // ── renderuj rundy ──────────────────────────────────────────────────────
  for (let r = 0; r < rounds; r++) {
    const isFirst = r === 0;
    const nMatches = matchesInRound(r);

    const col = document.createElement("div");
    col.className = `sr-bracket-col ${isFirst ? "sr-bracket-col--first" : ""}`;
    col.style.cssText = `width:${ROUND_W}px; height:${maxH}px; position:relative;`;

    // nagłówek rundy
    const rh = document.createElement("div");
    rh.className = "sr-bracket-round-hdr";
    rh.textContent = roundNames[r];
    col.appendChild(rh);

    // odstęp pionowy dla wyśrodkowania meczów
    const totalH = nMatches * MATCH_H + (nMatches - 1) * MATCH_GAP;
    const topPad = (maxH - totalH) / 2;

    for (let m = 0; m < nMatches; m++) {
      const matchTop = topPad + m * (MATCH_H + MATCH_GAP);

      const matchEl = document.createElement("div");
      matchEl.className = "sr-bm";
      matchEl.style.cssText = `position:absolute; top:${matchTop}px; left:0; width:${ROUND_W}px;`;

      if (isFirst) {
        // runda 1 — sloty z drag&drop
        const iA = m * 2;
        const iB = m * 2 + 1;
        const slotA = srSlots.find(s => s.key === `c${iA}`) || { key: `c${iA}`, team: null };
        const slotB = srSlots.find(s => s.key === `c${iB}`) || { key: `c${iB}`, team: null };

        const seedA = document.createElement("div");
        seedA.className = "sr-bm-seed";
        seedA.innerHTML = `<span class="sr-bm-seednum">${iA + 1}</span>`;
        seedA.appendChild(srMakeSlot(slotA, null, true));

        const div = document.createElement("div");
        div.className = "sr-bm-div";

        const seedB = document.createElement("div");
        seedB.className = "sr-bm-seed";
        seedB.innerHTML = `<span class="sr-bm-seednum">${iB + 1}</span>`;
        seedB.appendChild(srMakeSlot(slotB, null, true));

        matchEl.appendChild(seedA);
        matchEl.appendChild(div);
        matchEl.appendChild(seedB);
      } else {
        // późniejsze rundy — placeholder "Zwycięzca pary X"
        const prevMatches = matchesInRound(r - 1);
        const srcA = m * 2;
        const srcB = m * 2 + 1;
        matchEl.innerHTML = `
          <div class="sr-bm-placeholder">Zw. pary ${srcA + 1}</div>
          <div class="sr-bm-div"></div>
          <div class="sr-bm-placeholder">Zw. pary ${srcB + 1}</div>
        `;
      }

      col.appendChild(matchEl);
    }

    bracketEl.appendChild(col);

    // kolumna łączników SVG (między rundami, poza ostatnią)
    if (r < rounds - 1) {
      const conCol = document.createElement("div");
      conCol.className = "sr-bracket-con";
      conCol.style.cssText = `width:${CON_W}px; height:${maxH}px; position:relative; flex-shrink:0;`;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", CON_W);
      svg.setAttribute("height", maxH);
      svg.style.cssText = "position:absolute; top:0; left:0; overflow:visible;";

      const nA = matchesInRound(r);
      const nB = matchesInRound(r + 1);
      const totalHA = nA * MATCH_H + (nA - 1) * MATCH_GAP;
      const totalHB = nB * MATCH_H + (nB - 1) * MATCH_GAP;
      const topA = (maxH - totalHA) / 2;
      const topB = (maxH - totalHB) / 2;

      for (let m = 0; m < nA; m += 2) {
        // центр верхнего матча (слот B нижней половины)
        const topMatchCenterY = topA + m * (MATCH_H + MATCH_GAP) + MATCH_H / 2;
        // центр нижнего матча
        const botMatchCenterY = topA + (m + 1) * (MATCH_H + MATCH_GAP) + MATCH_H / 2;
        // центр результирующего матча следующей рунды
        const nextMatchIdx = m / 2;
        const nextMatchCenterY = topB + nextMatchIdx * (MATCH_H + MATCH_GAP) + MATCH_H / 2;
        const midY = (topMatchCenterY + botMatchCenterY) / 2;

        // linia od górnego → środek pionowy
        drawConnector(svg, 0, topMatchCenterY, CON_W, nextMatchCenterY, midY);
        drawConnector(svg, 0, botMatchCenterY, CON_W, nextMatchCenterY, midY);
      }

      conCol.appendChild(svg);
      bracketEl.appendChild(conCol);
    }
  }

  bracketOuter.appendChild(bracketEl);
  wrap.appendChild(bracketOuter);

  return wrap;
}

function drawConnector(svg, x1, y1, x2, y2, midY) {
  // pozioma linia od wyjścia meczu → środek pionowy
  const hLine1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hLine1.setAttribute("x1", x1); hLine1.setAttribute("y1", y1);
  hLine1.setAttribute("x2", x2 / 2); hLine1.setAttribute("y2", y1);
  hLine1.setAttribute("stroke", "var(--border)"); hLine1.setAttribute("stroke-width", "1.5");
  svg.appendChild(hLine1);

  // pionowa linia łącząca dwa mecze
  const vLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  vLine.setAttribute("x1", x2 / 2); vLine.setAttribute("y1", y1);
  vLine.setAttribute("x2", x2 / 2); vLine.setAttribute("y2", y2);
  vLine.setAttribute("stroke", "var(--border)"); vLine.setAttribute("stroke-width", "1.5");
  svg.appendChild(vLine);

  // pozioma linia do następnej rundy
  const hLine2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hLine2.setAttribute("x1", x2 / 2); hLine2.setAttribute("y1", y2);
  hLine2.setAttribute("x2", x2); hLine2.setAttribute("y2", y2);
  hLine2.setAttribute("stroke", "var(--border)"); hLine2.setAttribute("stroke-width", "1.5");
  svg.appendChild(hLine2);
}

function buildRoundNames(cupSize) {
  const names = [];
  let s = cupSize;
  while (s >= 2) {
    if (s === 2)  names.push("Finał");
    else if (s === 4)  names.push("Półfinał");
    else if (s === 8)  names.push("Ćwierćfinał");
    else               names.push(`1/${s / 2}`);
    s /= 2;
  }
  return names;
}

function srResizeCup(newSize) {
  if (newSize === srCupSize) return;
  if (newSize < srCupSize) {
    // zwróć do puli z usuniętych slotów
    for (let i = newSize; i < srCupSize; i++) {
      const slot = srSlots.find(s => s.key === `c${i}`);
      if (slot?.team) srPool.push(slot.team);
    }
    srSlots = srSlots.filter(s => {
      const m = s.key.match(/^c(\d+)$/);
      return !m || parseInt(m[1]) < newSize;
    });
  } else {
    for (let i = srCupSize; i < newSize; i++)
      srSlots.push({ gIdx: 0, sIdx: i, team: null, key: `c${i}` });
  }
  srCupSize = newSize;
  srRender();
}

/* ── SLOT ─────────────────────────────────────────────────────────────────── */
function srMakeSlot(slot, posLabel, compact = false) {
  const el = document.createElement("div");
  el.className = `sr-slot ${compact ? "sr-slot--compact" : ""} ${slot.team ? "sr-slot--filled" : "sr-slot--empty"}`;
  el.dataset.key = slot.key;

  if (slot.team) {
    const t = slot.team;
    const initials = t.team_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    el.innerHTML = `
      ${posLabel ? `<span class="sr-slot-pos">${posLabel}</span>` : ""}
      <span class="sr-slot-avatar">${initials}</span>
      <div class="sr-slot-info">
        <span class="sr-slot-name">${t.team_name}</span>
        <span class="sr-slot-class">${t.class_name}</span>
      </div>
      ${srLocked ? "" : '<button class="sr-slot-remove" title="Usuń">✕</button>'}
    `;
    el.querySelector(".sr-slot-remove")?.addEventListener("click", e => {
      e.stopPropagation();
      srPool.push(slot.team);
      slot.team = null;
      srMarkDirty();
      srRender();
    });
    // przeciąganie z zajętego slotu
    el.draggable = !srLocked;
    if (!srLocked) {
      el.addEventListener("dragstart", e => {
        srDragging = { source:"slot", slotKey: slot.key, team: slot.team };
        el.classList.add("sr-slot--dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => el.classList.remove("sr-slot--dragging"));
    }
  } else {
    el.innerHTML = `
      ${posLabel ? `<span class="sr-slot-pos">${posLabel}</span>` : ""}
      <span class="sr-slot-placeholder">+ Przeciągnij drużynę</span>
    `;
  }

  // drop na slot
  el.addEventListener("dragover", e => {
    if (srLocked) return;
    e.preventDefault();
    el.classList.add("sr-slot--over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("sr-slot--over"));
  el.addEventListener("drop", e => {
    e.preventDefault();
    el.classList.remove("sr-slot--over");
    if (srLocked || !srDragging) return;

    const incoming = srDragging.team;
    const oldSlot  = srDragging.source === "slot" ? srSlots.find(s => s.key === srDragging.slotKey) : null;

    if (slot.team) {
      // zamień miejscami
      if (oldSlot) {
        oldSlot.team = slot.team;
      } else {
        // przyszedł z puli — wróć obecnego do puli
        srPool.push(slot.team);
        // usuń incoming z puli
        const pi = srPool.findIndex(t => t.id === incoming.id);
        if (pi >= 0) srPool.splice(pi, 1);
      }
    } else {
      // pusty slot
      if (oldSlot) {
        oldSlot.team = null;
      } else {
        // usuń z puli
        const pi = srPool.findIndex(t => t.id === incoming.id);
        if (pi >= 0) srPool.splice(pi, 1);
      }
    }

    slot.team  = incoming;
    srDragging = null;
    srMarkDirty();
    srRender();
  });

  return el;
}

/* ── Losuj ────────────────────────────────────────────────────────────────── */
function srRandomize() {
  // zbierz wszystkie drużyny, przetasuj, wróć do puli i slotów
  const all = [
    ...srPool,
    ...srSlots.filter(s => s.team).map(s => s.team),
  ];
  // Fisher-Yates
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  // wyczyść sloty
  srSlots.forEach(s => s.team = null);
  // wypełnij sloty
  let ai = 0;
  srSlots.forEach(s => { if (ai < all.length) { s.team = all[ai++]; } });
  srPool = all.slice(ai);

  srMarkDirty();
  srRender();
  showSeedToast("🎲 Wylosowano rozstawienie!");
}

/* ── Wyczyść ─────────────────────────────────────────────────────────────── */
function srClear() {
  const all = [
    ...srPool,
    ...srSlots.filter(s => s.team).map(s => s.team),
  ];
  srSlots.forEach(s => s.team = null);
  // deduplikuj
  const seen = new Set();
  srPool = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  srPool.sort((a,b) => a.team_name.localeCompare(b.team_name, "pl"));
  srMarkDirty();
  srRender();
  showSeedToast("✕ Wyczyszczono wszystkie sloty");
}

/* ── Zapisz ───────────────────────────────────────────────────────────────── */
async function srSave() {
  const btn = $("sr-save-btn");
  btn.disabled = true; btn.textContent = "Zapisywanie…";

  const seeds = srSlots
    .map((s, i) => s.team ? { team_id: s.team.id, position: i } : null)
    .filter(Boolean);

  try {
    const result = await saveSeeding(srDisc, srType, seeds);
    if (result?.error) throw new Error(result.error);

    srMarkClean();
    showSeedToast("✓ Rozstawienie zapisane!");
    btn.textContent = "✓ Zapisano";
    btn.classList.add("sr-btn--saved");
    setTimeout(() => {
      btn.textContent = "💾 Zapisz";
      btn.classList.remove("sr-btn--saved");
      btn.disabled = false;
    }, 2400);
  } catch(e) {
    showSeedToast("✗ Błąd: " + e.message, true);
    btn.textContent = "💾 Zapisz";
    btn.disabled = false;
  }
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
let seedToastTimer = null;
function showSeedToast(msg, isError = false) {
  const t = $("toast-seed");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${isError ? "toast-error" : "toast-ok"}`;
  clearTimeout(seedToastTimer);
  seedToastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}


let toastTimer = null;
function showToast(msg, isError = false) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${isError ? "toast-error" : "toast-ok"}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3000);
}