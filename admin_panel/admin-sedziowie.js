/* ════════════════════════════════════════════════════════════════════════════
   SĘDZIOWIE I PROTOKOLANCI
════════════════════════════════════════════════════════════════════════════ */

let spPeople       = [];
let spFilter       = "all";
let spSelectedId   = null;
let spEditId       = null;    // null = add mode, number = edit mode
let spInitDone     = false;

const SP_ROLE_ICON = { "Sędzia": "⚖️", "Protokolant": "📋", "Obie role": "★", "Zawodnik": "👤" };
const SP_ROLE_COLOR= { "Sędzia": "#6c63ff", "Protokolant": "#22c55e", "Obie role": "#f59e0b", "Zawodnik": "#94a3b8" };

function showSpToast(msg, isError = false) {
  const t = $("toast-sp");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${isError ? "toast-error" : "toast-ok"}`;
  clearTimeout(showSpToast._t);
  showSpToast._t = setTimeout(() => t.classList.add("hidden"), 3000);
}

async function loadSedziowie() {
  if (!spInitDone) {
    spInitDone = true;
    // Wire filter tabs
    document.querySelectorAll(".sp-ftab").forEach(b => {
      b.onclick = () => {
        spFilter = b.dataset.role;
        document.querySelectorAll(".sp-ftab").forEach(t => t.classList.toggle("active", t === b));
        renderSpList();
      };
    });
    // Wire add button & modal
    $("sp-add-btn").onclick    = () => openSpModal(null);
    $("sp-modal-close").onclick  = closeSpModal;
    $("sp-modal-cancel").onclick = closeSpModal;
    $("sp-modal-backdrop").onclick = e => { if (e.target === $("sp-modal-backdrop")) closeSpModal(); };
    $("sp-modal-save").onclick   = saveSpModal;
  }
  await refreshSpPeople();
}

async function refreshSpPeople() {
  spPeople = await api("/people") || [];
  renderSpList();
  if (spSelectedId) loadSpDetail(spSelectedId);
}

function renderSpList() {
  const list = $("sp-people-list");
  if (!list) return;

  // Non-player roles
  const STAFF_ROLES = ["Sędzia","Protokolant","Obie role"];
  let filtered = spPeople.filter(p => STAFF_ROLES.includes(p.role));
  if (spFilter !== "all") filtered = filtered.filter(p => p.role === spFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="panel-loading" style="padding:2rem;color:var(--muted)">Brak osób w tej kategorii</div>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <div class="sp-person-row ${p.id === spSelectedId ? "sp-person-row--active" : ""}"
         data-id="${p.id}">
      <div class="sp-person-avatar" style="background:${SP_ROLE_COLOR[p.role]}22;color:${SP_ROLE_COLOR[p.role]}">
        ${SP_ROLE_ICON[p.role] || "👤"}
      </div>
      <div class="sp-person-info">
        <div class="sp-person-name">${p.last_name} ${p.first_name}${p.class_name ? `<span class="sp-person-class">${p.class_name}</span>` : ""}</div>
        <div class="sp-person-role" style="color:${SP_ROLE_COLOR[p.role]}">${p.role}</div>
      </div>
      <button class="sp-edit-btn" data-id="${p.id}" title="Edytuj">✏️</button>
    </div>
  `).join("");

  list.querySelectorAll(".sp-person-row").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest(".sp-edit-btn")) return;
      spSelectedId = Number(row.dataset.id);
      list.querySelectorAll(".sp-person-row").forEach(r => r.classList.toggle("sp-person-row--active", r === row));
      loadSpDetail(spSelectedId);
    });
  });
  list.querySelectorAll(".sp-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openSpModal(Number(btn.dataset.id));
    });
  });
}

async function loadSpDetail(personId) {
  // Show person view, hide empty state
  $("sp-empty-state")?.classList.add("hidden");
  $("sp-person-view")?.classList.remove("hidden");

  const header = $("sp-detail-header");
  const body   = $("sp-detail-body");
  const availBody = $("sp-avail-body");
  if (!header || !body) return;

  body.innerHTML = `<div class="panel-loading">Ładowanie…</div>`;
  if (availBody) availBody.innerHTML = `<div class="panel-loading">Ładowanie…</div>`;

  // Load stats and availability in parallel
  const [data, availRaw] = await Promise.all([
    api(`/people/${personId}/stats`),
    api(`/people/availability?ids=${personId}`),
  ]);

  if (!data || data.error) {
    body.innerHTML = `<div class="panel-loading">Błąd ładowania</div>`;
    return;
  }

  const p     = data.person;
  const slots = Array.isArray(availRaw) ? availRaw : [];

  const classTag = p.class_name ? `<span class="sp-person-class">${p.class_name}</span>` : "";
  const hlActive = plAvailHighlight.includes(p.id);
  const hlCls    = hlActive ? "sp-btn--avail-active" : "";
  const hlLabel  = hlActive ? "📅 Ukryj na kalendarzu" : "📅 Pokaż na kalendarzu";

  header.innerHTML = `
    <div class="sp-detail-title">
      <span class="sp-detail-icon" style="color:${SP_ROLE_COLOR[p.role]}">${SP_ROLE_ICON[p.role]}</span>
      <h2>${p.last_name} ${p.first_name}</h2>
      ${classTag}
    </div>
    <div class="sp-detail-actions">
      <button class="sp-btn sp-btn--ghost sp-btn--sm ${hlCls}" id="av-hl-btn">${hlLabel}</button>
      <button class="sp-btn sp-btn--ghost sp-btn--sm" id="sp-detail-edit">✏️ Edytuj</button>
      <button class="sp-btn sp-btn--danger sp-btn--sm" id="sp-detail-delete">🗑 Usuń</button>
    </div>`;

  $("av-hl-btn").onclick        = () => toggleAvailHighlight(p.id);
  $("sp-detail-edit").onclick   = () => openSpModal(p.id);
  $("sp-detail-delete").onclick = () => deleteSpPerson(p.id, `${p.first_name} ${p.last_name}`);

  // Wire tabs (only once per person load — replace innerHTML so fresh listeners)
  document.querySelectorAll(".sp-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".sp-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sp-tab-panel").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      $(`sp-tab-${tab.dataset.tab}`)?.classList.add("active");
    };
  });
  // Default to info tab
  document.querySelectorAll(".sp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "info"));
  document.querySelectorAll(".sp-tab-panel").forEach(t => t.classList.toggle("active", t.id === "sp-tab-info"));

  // ── Info tab content
  const totalRef    = data.asReferee.length;
  const totalClerk  = data.asClerk.length;
  const playedRef   = data.asReferee.filter(m => m.status === "Rozegrany").length;
  const playedClerk = data.asClerk.filter(m => m.status === "Rozegrany").length;

  const matchTable = (matches, emptyMsg) => {
    if (!matches.length) return `<div class="sp-no-matches">${emptyMsg}</div>`;
    return `<table class="sp-match-table">
      <thead><tr><th>Data</th><th>Mecz</th><th>Dyscyplina</th><th>Wynik</th><th>Status</th></tr></thead>
      <tbody>
        ${matches.map(m => `
          <tr>
            <td>${m.match_date ? fmtDate(m.match_date) : "—"}</td>
            <td class="sp-match-teams">${m.team1_name} <span>vs</span> ${m.team2_name}</td>
            <td>${DISC_EMOJI[m.discipline] || ""} ${m.discipline}</td>
            <td>${m.status === "Rozegrany" ? fmtScoreText(m) : "—"}</td>
            <td><span class="sp-status sp-status--${m.status === "Rozegrany" ? "played" : m.status === "Odwołany" ? "cancelled" : "planned"}">${m.status}</span></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  };

  body.innerHTML = `
    <div class="sp-stats-row">
      <div class="sp-stat-box"><div class="sp-stat-val">${totalRef}</div><div class="sp-stat-lbl">Jako sędzia</div></div>
      <div class="sp-stat-box"><div class="sp-stat-val">${playedRef}</div><div class="sp-stat-lbl">Rozegranych</div></div>
      <div class="sp-stat-box"><div class="sp-stat-val">${totalClerk}</div><div class="sp-stat-lbl">Protokolant</div></div>
      <div class="sp-stat-box"><div class="sp-stat-val">${playedClerk}</div><div class="sp-stat-lbl">Rozegranych</div></div>
    </div>
    ${totalRef > 0 ? `<div class="sp-section"><div class="sp-section-title">⚖️ Mecze jako sędzia</div>${matchTable(data.asReferee, "Brak meczów")}</div>` : ""}
    ${totalClerk > 0 ? `<div class="sp-section"><div class="sp-section-title">📋 Mecze jako protokolant</div>${matchTable(data.asClerk, "Brak meczów")}</div>` : ""}
    ${totalRef === 0 && totalClerk === 0 ? `<div class="sp-empty-detail"><span>📋</span><p>Brak przypisanych meczów.<br>Przypisz tę osobę w Planowaniu rozgrywek.</p></div>` : ""}
  `;

  // ── Avail tab content
  renderAvailSection(personId, slots);
}

function openSpModal(personId) {
  spEditId = personId;
  const person = personId ? spPeople.find(p => p.id === personId) : null;

  $("sp-modal-title").textContent = person ? "Edytuj osobę" : "Dodaj osobę";
  $("sp-f-first").value  = person?.first_name  || "";
  $("sp-f-last").value   = person?.last_name   || "";
  $("sp-f-class").value  = person?.class_name  || "";
  $("sp-f-role").value   = person?.role && person.role !== "Zawodnik" ? person.role : "Sędzia";

  $("sp-modal-backdrop").classList.remove("hidden");
  $("sp-f-first").focus();
}

function closeSpModal() {
  $("sp-modal-backdrop").classList.add("hidden");
  spEditId = null;
}

async function saveSpModal() {
  const first_name = $("sp-f-first").value.trim();
  const last_name  = $("sp-f-last").value.trim();
  const class_name = $("sp-f-class").value.trim();
  const role       = $("sp-f-role").value;

  if (!first_name || !last_name) {
    $("sp-f-first").focus();
    showSpToast("Imię i nazwisko są wymagane", true);
    return;
  }

  const btn = $("sp-modal-save");
  btn.disabled = true; btn.textContent = "Zapisywanie…";

  try {
    let personId;
    if (spEditId) {
      const { error } = await supabase.from('people')
        .update({ first_name, last_name, class_name: class_name||null, role })
        .eq('id', spEditId);
      if (error) throw new Error(error.message);
      personId = spEditId;
    } else {
      const { data: ins, error } = await supabase.from('people')
        .insert({ first_name, last_name, class_name: class_name||null, role })
        .select().single();
      if (error) throw new Error(error.message);
      personId = ins.id;
    }

    // Invalidate people cache used by planning view
    plPeopleCache = null;

    closeSpModal();
    await refreshSpPeople();
    showSpToast(spEditId ? "✓ Zaktualizowano" : "✓ Dodano osobę");
    spSelectedId = personId;
    loadSpDetail(personId);
  } catch(e) {
    showSpToast(`✗ ${e.message}`, true);
  } finally {
    btn.disabled = false; btn.textContent = "💾 Zapisz";
  }
}

async function deleteSpPerson(personId, name) {
  if (!confirm(`Usunąć osobę "${name}" z systemu?\nMecze przypisane do tej osoby stracą sędziego/protokolanta.`)) return;

  try {
    const { error: delErr } = await supabase.from('people').delete().eq('id', personId);
    if (delErr) throw new Error(delErr.message);

    plPeopleCache = null;
    spSelectedId = null;
    $("sp-person-view")?.classList.add("hidden");
    $("sp-empty-state")?.classList.remove("hidden");
    await refreshSpPeople();
    showSpToast("🗑 Usunięto");
  } catch(e) {
    showSpToast(`✗ ${e.message}`, true);
  }
}




/* ════════════════════════════════════════════════════════════════════════════
   DOSTĘPNOŚĆ — numeryczny edytor zakresów godzin
════════════════════════════════════════════════════════════════════════════ */

const DOW_ORDER   = [1,2,3,4,5,6,0];
const AV_DAYS_SHT = ["Nd","Pn","Wt","Śr","Cz","Pt","So"];
const AV_DAYS_FUL = ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"];

function avFrac(frac) {
  const h = Math.floor(frac), m = Math.round((frac - h) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function avParse(str) {
  const x = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!x) return null;
  const h = +x[1], m = +x[2];
  if (h > 23 || m > 59) return null;
  return h + m / 60;
}

/* ── Render: numeric time-range editor ───────────────────────────────────── */
function renderAvailSection(personId, slots) {
  const body = $("sp-avail-body");
  if (!body) return;

  // byDay: dow → [{hs, he}]
  const byDay = {};
  DOW_ORDER.forEach(d => { byDay[d] = []; });
  slots.forEach(s => {
    (byDay[s.day_of_week] = byDay[s.day_of_week] || [])
      .push({ hs: parseFloat(s.hour_start), he: parseFloat(s.hour_end) });
  });
  DOW_ORDER.forEach(d => byDay[d].sort((a, b) => a.hs - b.hs));

  body.innerHTML = `
    <div class="avt-wrap" id="avt-wrap"></div>
    <div class="avt-toolbar">
      <button class="sp-btn sp-btn--ghost sp-btn--sm" id="av-clear-btn">✕ Wyczyść</button>
      <button class="sp-btn sp-btn--primary sp-btn--sm" id="av-save-btn">💾 Zapisz dostępność</button>
    </div>`;

  const wrap = body.querySelector("#avt-wrap");
  DOW_ORDER.forEach(dow => renderDayRow(dow, wrap, byDay));

  // ── Clear all
  body.querySelector("#av-clear-btn").onclick = () => {
    DOW_ORDER.forEach(d => { byDay[d] = []; });
    DOW_ORDER.forEach(dow => renderDayRow(dow, wrap, byDay));
  };

  // ── Save
  body.querySelector("#av-save-btn").onclick = async () => {
    const btn = body.querySelector("#av-save-btn");

    // Collect & validate all inputs before saving
    let hasError = false;
    DOW_ORDER.forEach(dow => {
      const dayEl = wrap.querySelector(`.avt-day[data-dow="${dow}"]`);
      if (!dayEl) return;
      dayEl.querySelectorAll(".avt-slot").forEach(slotEl => {
        const [inStart, inEnd] = slotEl.querySelectorAll(".avt-time-input");
        const hs = avParse(inStart.value);
        const he = avParse(inEnd.value);
        const endErr = he === null || (hs !== null && he <= hs);
        inStart.classList.toggle("avt-error", hs === null);
        inEnd.classList.toggle("avt-error", endErr);
        if (hs === null || endErr) hasError = true;
      });
    });
    if (hasError) { showSpToast("✗ Popraw błędne zakresy godzin", true); return; }

    // Re-collect cleaned data from inputs
    DOW_ORDER.forEach(dow => {
      byDay[dow] = [];
      const dayEl = wrap.querySelector(`.avt-day[data-dow="${dow}"]`);
      if (!dayEl) return;
      dayEl.querySelectorAll(".avt-slot").forEach(slotEl => {
        const [inStart, inEnd] = slotEl.querySelectorAll(".avt-time-input");
        byDay[dow].push({ hs: avParse(inStart.value), he: avParse(inEnd.value) });
      });
      byDay[dow].sort((a, b) => a.hs - b.hs);
    });

    btn.disabled = true; btn.textContent = "Zapisywanie…";
    try {
      const slots = [];
      DOW_ORDER.forEach(dow => (byDay[dow] || []).forEach(r =>
        slots.push({ day_of_week: dow, hour_start: r.hs, hour_end: r.he })
      ));
      const { error: avDel } = await supabase.from('people_availability')
        .delete().eq('person_id', personId);
      if (avDel) throw new Error(avDel.message);
      if (slots.length) {
        const rows = slots.map(s => ({ person_id: personId, day_of_week: s.day_of_week, hour_start: s.hour_start, hour_end: s.hour_end }));
        const { error: avIns } = await supabase.from('people_availability').insert(rows);
        if (avIns) throw new Error(avIns.message);
      }
      plAvailCache[personId] = slots;
      if (plAvailHighlight.includes(personId)) renderCalendar();
      showSpToast("✓ Dostępność zapisana");
    } catch(e) { showSpToast("✗ " + e.message, true); }
    finally { btn.disabled = false; btn.textContent = "💾 Zapisz dostępność"; }
  };
}

function renderDayRow(dow, wrap, byDay) {
  const existing = wrap.querySelector(`.avt-day[data-dow="${dow}"]`);
  if (existing) existing.remove();

  const slots = byDay[dow] || [];
  const dayEl = document.createElement("div");
  dayEl.className = "avt-day";
  dayEl.dataset.dow = dow;

  dayEl.innerHTML = `
    <div class="avt-day-header">
      <span class="avt-day-name">${AV_DAYS_FUL[dow]}</span>
      <button class="avt-add-btn" data-dow="${dow}">+ Dodaj zakres</button>
    </div>
    <div class="avt-slots" id="avt-slots-${dow}">
      ${slots.length === 0
        ? `<span class="avt-empty">Brak zakresów</span>`
        : slots.map((r, i) => slotHTML(dow, i, avFrac(r.hs), avFrac(r.he))).join("")
      }
    </div>`;

  // Insert in correct DOW_ORDER position
  const allDays = [...wrap.querySelectorAll(".avt-day")];
  const insertBefore = allDays.find(el =>
    DOW_ORDER.indexOf(Number(el.dataset.dow)) > DOW_ORDER.indexOf(dow)
  );
  if (insertBefore) wrap.insertBefore(dayEl, insertBefore);
  else wrap.appendChild(dayEl);

  wireSlots(dow, dayEl, byDay, wrap);
}

function slotHTML(dow, idx, startVal, endVal) {
  return `<div class="avt-slot" data-dow="${dow}" data-idx="${idx}">
    <input type="text" class="avt-time-input" value="${startVal}" placeholder="08:00" maxlength="5" autocomplete="off" spellcheck="false" />
    <span class="avt-sep">–</span>
    <input type="text" class="avt-time-input" value="${endVal}" placeholder="16:00" maxlength="5" autocomplete="off" spellcheck="false" />
    <button class="avt-del-btn" title="Usuń zakres">✕</button>
  </div>`;
}

function wireSlots(dow, dayEl, byDay, wrap) {
  const slotsEl = dayEl.querySelector(`#avt-slots-${dow}`);

  dayEl.querySelector(".avt-add-btn").onclick = () => {
    const last = byDay[dow]?.[byDay[dow].length - 1];
    const hs = last ? Math.min(last.he + 0.5, 21) : 8;
    const he = Math.min(hs + 2, 22);
    byDay[dow] = byDay[dow] || [];
    byDay[dow].push({ hs, he });
    slotsEl.querySelector(".avt-empty")?.remove();
    const idx = slotsEl.querySelectorAll(".avt-slot").length;
    slotsEl.insertAdjacentHTML("beforeend", slotHTML(dow, idx, avFrac(hs), avFrac(he)));
    rewireAll(dow, dayEl, byDay, wrap, slotsEl);
    slotsEl.lastElementChild?.querySelector(".avt-time-input")?.focus();
  };

  rewireAll(dow, dayEl, byDay, wrap, slotsEl);
}

function rewireAll(dow, dayEl, byDay, wrap, slotsEl) {
  // Delete buttons
  slotsEl.querySelectorAll(".avt-del-btn").forEach((btn, i) => {
    btn.onclick = () => {
      byDay[dow].splice(i, 1);
      renderDayRow(dow, wrap, byDay);
    };
  });
  // Input live validation + auto-colon
  slotsEl.querySelectorAll(".avt-time-input").forEach(inp => {
    inp.oninput = () => {
      if (/^\d{2}$/.test(inp.value)) inp.value += ":";
      if (inp.value.length >= 5) inp.classList.toggle("avt-error", avParse(inp.value) === null);
      else inp.classList.remove("avt-error");
    };
    inp.onblur = () => {
      const val = avParse(inp.value);
      if (val !== null) inp.value = avFrac(val);
      else if (inp.value !== "") inp.classList.add("avt-error");
    };
  });
}

// ── Calendar highlight control ─────────────────────────────────────────────
async function toggleAvailHighlight(personId) {
  const idx = plAvailHighlight.indexOf(personId);
  if (idx !== -1) {
    plAvailHighlight.splice(idx, 1);
  } else {
    plAvailHighlight.push(personId);
    if (!plAvailCache[personId]) {
      const rows = await api(`/people/availability?ids=${personId}`);
      plAvailCache[personId] = Array.isArray(rows) ? rows : [];
    }
  }
  const btn = $("av-hl-btn");
  if (btn) btn.classList.toggle("sp-btn--avail-active", plAvailHighlight.includes(personId));
  // update count badge on trigger button
  const count = plAvailHighlight.length;
  const cnt = $("pl-avail-count");
  if (cnt) { cnt.textContent = count; cnt.classList.toggle("hidden", count === 0); }
  $("pl-avail-trigger")?.classList.toggle("pl-avail-trigger--active", count > 0);
  renderCalendar();
}

/* ── Avail picker in planning topbar ──────────────────────────────────── */
let plAvailPickerOpen = false;

function initAvailPicker() {
  const trigger  = $("pl-avail-trigger");
  const dropdown = $("pl-avail-dropdown");
  const clearAll = $("pl-avail-clear-all");
  if (!trigger || !dropdown) return;

  trigger.onclick = async (e) => {
    e.stopPropagation();
    plAvailPickerOpen = !plAvailPickerOpen;
    dropdown.classList.toggle("hidden", !plAvailPickerOpen);
    if (plAvailPickerOpen) {
      await renderAvailDropdownList();
    }
  };

  clearAll.onclick = (e) => {
    e.stopPropagation();
    [...plAvailHighlight].forEach(pid => {
      const idx = plAvailHighlight.indexOf(pid);
      if (idx !== -1) plAvailHighlight.splice(idx, 1);
    });
    const cnt = $("pl-avail-count");
    if (cnt) { cnt.textContent = "0"; cnt.classList.add("hidden"); }
    $("pl-avail-trigger")?.classList.remove("pl-avail-trigger--active");
    renderAvailDropdownList();
    renderCalendar();
  };

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (plAvailPickerOpen && !e.target.closest("#pl-avail-wrap")) {
      plAvailPickerOpen = false;
      dropdown.classList.add("hidden");
    }
  });
}

async function renderAvailDropdownList() {
  const list = $("pl-avail-dropdown-list");
  if (!list) return;

  // Ensure people loaded
  if (!plPeopleCache) {
    plPeopleCache = await api("/people") || [];
  }
  const STAFF_ROLES = ["Sędzia","Protokolant","Obie role"];
  const staff = plPeopleCache.filter(p => STAFF_ROLES.includes(p.role));

  if (!staff.length) {
    list.innerHTML = `<div class="pl-avail-dropdown-empty">Brak sędziów / protokolantów</div>`;
    return;
  }

  list.innerHTML = staff.map((p, i) => {
    const active = plAvailHighlight.includes(p.id);
    const colorIdx = plAvailHighlight.indexOf(p.id);
    const color = active ? AVAIL_COLORS[colorIdx % AVAIL_COLORS.length] : null;
    return `<label class="pl-avail-person-row ${active ? "pl-avail-person-row--on" : ""}"
                   data-pid="${p.id}"
                   style="${active ? `--av-c:${color};border-left-color:${color}` : ""}">
      <input type="checkbox" class="pl-avail-cb" data-pid="${p.id}" ${active ? "checked" : ""} />
      <span class="pl-avail-role-dot" style="background:${SP_ROLE_COLOR[p.role] || "#6c63ff"}">
        ${SP_ROLE_ICON[p.role] || "👤"}
      </span>
      <span class="pl-avail-name">${p.last_name} ${p.first_name}${p.class_name ? ` <em>${p.class_name}</em>` : ""}</span>
      <span class="pl-avail-role-tag">${p.role}</span>
      ${active ? `<span class="pl-avail-color-dot" style="background:${color}"></span>` : ""}
    </label>`;
  }).join("");

  list.querySelectorAll(".pl-avail-cb").forEach(cb => {
    cb.addEventListener("change", async (e) => {
      e.stopPropagation();
      const pid = Number(cb.dataset.pid);
      await toggleAvailHighlight(pid);
      renderAvailDropdownList(); // re-render to update colors
    });
  });
}


/* ── Init ────────────────────────────────────────────────────────────────── */
checkStatus();
loadDashboard();