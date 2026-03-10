/* ════════════════════════════════════════════════════════════════════════════
   DRUŻYNY — lista + skład z edycją
════════════════════════════════════════════════════════════════════════════ */
let activeTeamId = null;

async function loadAdminTeams() {
  const data = await api("/teams");
  const c = $("admin-teams-list");
  if (!data?.length) { c.innerHTML = `<div class="panel-loading">Brak drużyn</div>`; }

  // przycisk dodaj drużynę
  const addTeamBtn = $("add-team-btn");
  if (addTeamBtn) {
    addTeamBtn.replaceWith(addTeamBtn.cloneNode(true)); // usuń stare listenery
    $("add-team-btn").addEventListener("click", showAddTeamModal);
  }

  if (!data?.length) return;
  c.innerHTML = "";
  data.forEach(t => {
    const row = el("div", "team-row");
    row.dataset.id = t.id;
    row.innerHTML = `
      <div class="team-row-info">
        <span class="team-row-name">${t.team_name}</span>
        <span class="team-row-class">${t.class_name}</span>
      </div>
      <span class="team-row-count">👥 ${t.player_count}</span>
      <span class="team-row-arrow">›</span>
    `;
    row.addEventListener("click", () => selectTeam(t.id, t.team_name));
    c.appendChild(row);
  });

  // załaduj pierwszą drużynę domyślnie
  if (data.length) selectTeam(data[0].id, data[0].team_name);
}

async function selectTeam(teamId, teamName) {
  activeTeamId = teamId;

  // podświetl aktywną drużynę
  document.querySelectorAll(".team-row").forEach(r =>
    r.classList.toggle("active", +r.dataset.id === teamId)
  );

  $("team-players-header").innerHTML = `
    <h2>${teamName}</h2>
    <div class="header-btn-group">
      <button class="panel-add-btn" id="add-player-btn">+ Dodaj zawodnika</button>
      <button class="panel-add-btn panel-import-btn" id="bulk-import-btn">📋 Importuj listę</button>
    </div>
  `;
  $("team-players-body").innerHTML = `<div class="panel-loading">Ładowanie…</div>`;

  const [teamData, players] = await Promise.all([
    api(`/teams/${teamId}/profile`),
    api(`/teams/${teamId}/players`),
  ]);

  const body = $("team-players-body");
  body.innerHTML = "";

  // ── formularz edycji drużyny ──────────────────────────────────────────────
  if (teamData?.team) {
    const t = teamData.team;
    const formWrap = el("div", "team-edit-form");
    formWrap.innerHTML = `
      <div class="team-edit-title">
        <span class="team-edit-icon">🏅</span>
        Ustawienia drużyny
      </div>
      <div class="team-edit-fields">
        <div class="team-edit-field">
          <label class="team-edit-label" for="edit-team-name">Nazwa drużyny</label>
          <input id="edit-team-name" class="team-edit-input" type="text"
            value="${t.team_name}" placeholder="Nazwa drużyny" maxlength="100" />
        </div>
        <div class="team-edit-field">
          <label class="team-edit-label" for="edit-team-class">Klasa</label>
          <input id="edit-team-class" class="team-edit-input team-edit-input--sm" type="text"
            value="${t.class_name}" placeholder="np. 3A" maxlength="10" />
        </div>
        <div class="team-edit-actions">
          <button class="save-btn" id="save-team-btn">Zapisz zmiany</button>
          <span class="team-edit-status" id="team-edit-status"></span>
          <button class="delete-team-btn" id="delete-team-btn" title="Usuń drużynę">🗑 Usuń drużynę</button>
        </div>
      </div>
    `;

    const saveBtn = formWrap.querySelector("#save-team-btn");
    saveBtn.addEventListener("click", () => saveTeam(teamId));

    const deleteTeamBtn = formWrap.querySelector("#delete-team-btn");
    deleteTeamBtn.addEventListener("click", () => confirmDeleteTeam(teamId, t.team_name));

    body.appendChild(formWrap);

    const divider = el("div", "team-edit-divider");
    divider.innerHTML = `<span>Zawodnicy</span>`;
    body.appendChild(divider);
  }

  renderPlayersTable(players, body);

  // przycisk dodawania zawodnika — podpinamy po renderowaniu
  const addPlayerBtn = $("add-player-btn");
  if (addPlayerBtn) addPlayerBtn.addEventListener("click", () => showAddPlayerModal(teamId));

  // przycisk hurtowego importu
  const bulkImportBtn = $("bulk-import-btn");
  if (bulkImportBtn) bulkImportBtn.addEventListener("click", () => showBulkImportModal(teamId, teamName));
}

async function saveTeam(teamId) {
  const nameInput  = $("edit-team-name");
  const classInput = $("edit-team-class");
  const btn        = $("save-team-btn");
  const status     = $("team-edit-status");

  const newName  = nameInput.value.trim();
  const newClass = classInput.value.trim();
  if (!newName) { showToast("✗ Nazwa drużyny nie może być pusta", true); return; }

  btn.disabled = true;
  btn.textContent = "…";
  status.textContent = "";

  try {
    const { data: updated, error } = await supabase
      .from("teams")
      .update({ team_name: newName, class_name: newClass })
      .eq("id", teamId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // aktualizuj sidebar
    const row = document.querySelector(`.team-row[data-id="${teamId}"]`);
    if (row) {
      row.querySelector(".team-row-name").textContent  = updated.team_name;
      row.querySelector(".team-row-class").textContent = updated.class_name;
    }
    $("team-players-header").innerHTML = `<h2>${updated.team_name}</h2>`;

    showToast("✓ Dane drużyny zapisane");
    btn.textContent = "✓ Zapisano";
    btn.classList.add("saved");
    setTimeout(() => { btn.textContent = "Zapisz zmiany"; btn.classList.remove("saved"); btn.disabled = false; }, 2000);
  } catch(e) {
    showToast("✗ Błąd zapisu: " + e.message, true);
    btn.textContent = "Zapisz zmiany";
    btn.disabled = false;
  }
}

function renderPlayersTable(players, body = $("team-players-body")) {
  if (!players?.length) {
    body.appendChild(el("div", "panel-loading", "Brak zawodników w tej drużynie"));
    return;
  }

  const wrap  = el("div", "players-table-wrap");
  const table = el("table", "players-edit-table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Zawodnik</th>
        <th>Klasa</th>
        <th title="Kapitan">© Kpt.</th>
        <th title="Zgoda RODO">RODO</th>
        <th title="Zgoda na uczestnictwo">Udział</th>
        <th title="Wpłacone wpisowe">Wpisowe (zł)</th>
        <th class="col-actions"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  players.forEach(p => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    tr.innerHTML = `
      <td class="player-name-cell">
        <strong>${p.first_name} ${p.last_name}</strong>
      </td>
      <td class="player-class-cell">${p.class_name}</td>
      <td class="center-cell">
        <label class="toggle-wrap">
          <input type="checkbox" class="field-captain" ${p.is_captain ? "checked" : ""} />
          <span class="toggle"></span>
        </label>
      </td>
      <td class="center-cell">
        <label class="toggle-wrap">
          <input type="checkbox" class="field-rodo" ${p.rodo_consent ? "checked" : ""} />
          <span class="toggle"></span>
        </label>
      </td>
      <td class="center-cell">
        <label class="toggle-wrap">
          <input type="checkbox" class="field-participation" ${p.participation_consent ? "checked" : ""} />
          <span class="toggle"></span>
        </label>
      </td>
      <td>
        <input type="number" class="fee-input field-fee" min="0" step="0.01"
          value="${p.entry_fee_paid ?? 0}" placeholder="0.00" />
      </td>
      <td class="col-actions">
        <div class="col-actions-inner">
          <button class="save-btn">Zapisz</button>
          <button class="delete-player-btn" title="Usuń zawodnika">🗑</button>
        </div>
      </td>
    `;

    tr.querySelector(".save-btn").addEventListener("click", () => savePlayer(tr, p.id));
    tr.querySelector(".delete-player-btn").addEventListener("click", () =>
      confirmDeletePlayer(p.id, `${p.first_name} ${p.last_name}`, tr)
    );

    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  body.appendChild(wrap);
}

async function savePlayer(tr, playerId) {
  const btn = tr.querySelector(".save-btn");
  btn.disabled = true;
  btn.textContent = "…";

  const payload = {
    is_captain:             tr.querySelector(".field-captain").checked      ? 1 : 0,
    rodo_consent:           tr.querySelector(".field-rodo").checked         ? 1 : 0,
    participation_consent:  tr.querySelector(".field-participation").checked ? 1 : 0,
    entry_fee_paid:         parseFloat(tr.querySelector(".field-fee").value) || 0,
  };

  try {
    const { error } = await supabase
      .from("players")
      .update(payload)
      .eq("id", playerId);
    if (error) throw new Error(error.message);
    showToast("✓ Zapisano zmiany");
    btn.textContent = "✓ Zapisano";
    btn.classList.add("saved");
    setTimeout(() => { btn.textContent = "Zapisz"; btn.classList.remove("saved"); btn.disabled = false; }, 2000);
  } catch(e) {
    showToast("✗ Błąd zapisu: " + e.message, true);
    btn.textContent = "Zapisz";
    btn.disabled = false;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   MODAL POTWIERDZENIA
════════════════════════════════════════════════════════════════════════════ */
function showConfirmModal({ title, lines, confirmLabel = "Usuń", onConfirm }) {
  // usuń poprzedni jeśli istnieje
  document.getElementById("confirm-modal")?.remove();

  const overlay = el("div", "confirm-overlay");
  overlay.id = "confirm-modal";

  const box = el("div", "confirm-box");
  box.innerHTML = `
    <div class="confirm-icon">⚠️</div>
    <div class="confirm-title">${title}</div>
    <div class="confirm-lines">${lines.map(l => `<p>${l}</p>`).join("")}</div>
    <div class="confirm-step" id="confirm-step-1">
      <p class="confirm-hint">Krok 1 z 2 — potwierdź operację</p>
      <div class="confirm-btns">
        <button class="confirm-btn-cancel">Anuluj</button>
        <button class="confirm-btn-next confirm-btn-danger">Tak, chcę usunąć →</button>
      </div>
    </div>
    <div class="confirm-step hidden" id="confirm-step-2">
      <p class="confirm-hint confirm-hint--red">Krok 2 z 2 — ostateczne potwierdzenie</p>
      <div class="confirm-btns">
        <button class="confirm-btn-cancel">Anuluj</button>
        <button class="confirm-btn-ok confirm-btn-danger">${confirmLabel}</button>
      </div>
    </div>
  `;

  box.querySelector(".confirm-btn-cancel") && box.querySelectorAll(".confirm-btn-cancel").forEach(b =>
    b.addEventListener("click", () => overlay.remove())
  );
  box.querySelector(".confirm-btn-next").addEventListener("click", () => {
    box.querySelector("#confirm-step-1").classList.add("hidden");
    box.querySelector("#confirm-step-2").classList.remove("hidden");
  });
  box.querySelector(".confirm-btn-ok").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* ── Usuń zawodnika ──────────────────────────────────────────────────────── */
function confirmDeletePlayer(playerId, playerName, trEl) {
  showConfirmModal({
    title: "Usuń zawodnika",
    lines: [
      `Zawodnik: <strong>${playerName}</strong>`,
      "Zostaną usunięte wszystkie statystyki tego zawodnika ze wszystkich meczów.",
    ],
    confirmLabel: "🗑 Usuń zawodnika",
    onConfirm: () => deletePlayer(playerId, trEl),
  });
}

async function deletePlayer(playerId, trEl) {
  try {
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) throw new Error(error.message);
    // animowane usunięcie wiersza
    trEl.classList.add("row-deleting");
    setTimeout(() => trEl.remove(), 350);
    showToast("✓ Zawodnik usunięty");
  } catch(e) {
    showToast("✗ Błąd usuwania: " + e.message, true);
  }
}

/* ── Usuń drużynę ────────────────────────────────────────────────────────── */
function confirmDeleteTeam(teamId, teamName) {
  showConfirmModal({
    title: "Usuń drużynę",
    lines: [
      `Drużyna: <strong>${teamName}</strong>`,
      "Zostaną usunięci wszyscy zawodnicy oraz ich statystyki.",
      "Mecze tej drużyny zostaną oznaczone jako <strong>Odwołane</strong>.",
    ],
    confirmLabel: "🗑 Usuń drużynę",
    onConfirm: () => deleteTeam(teamId),
  });
}

async function deleteTeam(teamId) {
  try {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) throw new Error(error.message);
    showToast("✓ Drużyna usunięta");
    // wyczyść panel
    $("team-players-header").innerHTML = `<h2>Wybierz drużynę</h2>`;
    $("team-players-body").innerHTML   = `<div class="panel-loading">Kliknij drużynę aby zobaczyć skład</div>`;
    // usuń z sidebara i załaduj następną
    const row = document.querySelector(`.team-row[data-id="${teamId}"]`);
    row?.remove();
    const next = document.querySelector(".team-row");
    if (next) next.click();
  } catch(e) {
    showToast("✗ Błąd usuwania: " + e.message, true);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   DODAJ DRUŻYNĘ
════════════════════════════════════════════════════════════════════════════ */
function showAddTeamModal() {
  document.getElementById("add-modal")?.remove();

  const overlay = el("div", "confirm-overlay");
  overlay.id = "add-modal";
  overlay.innerHTML = `
    <div class="confirm-box add-modal-box">
      <div class="confirm-icon">🏅</div>
      <div class="confirm-title">Nowa drużyna</div>
      <div class="add-form">
        <div class="add-field">
          <label class="add-label">Nazwa drużyny *</label>
          <input id="new-team-name" class="team-edit-input" type="text"
            placeholder="np. Olimpijczycy" maxlength="100" />
        </div>
        <div class="add-field">
          <label class="add-label">Klasa</label>
          <input id="new-team-class" class="team-edit-input team-edit-input--sm" type="text"
            placeholder="np. 3A" maxlength="10" />
        </div>
      </div>
      <div class="confirm-btns" style="margin-top:.75rem">
        <button class="confirm-btn-cancel">Anuluj</button>
        <button class="confirm-btn-save">✓ Utwórz drużynę</button>
      </div>
      <p class="add-error hidden" id="add-team-error"></p>
    </div>
  `;

  overlay.querySelector(".confirm-btn-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector(".confirm-btn-save").addEventListener("click", async () => {
    const name  = overlay.querySelector("#new-team-name").value.trim();
    const cls   = overlay.querySelector("#new-team-class").value.trim();
    const errEl = overlay.querySelector("#add-team-error");

    if (!name) { errEl.textContent = "Nazwa drużyny jest wymagana."; errEl.classList.remove("hidden"); return; }

    const btn = overlay.querySelector(".confirm-btn-save");
    btn.disabled = true; btn.textContent = "…";

    try {
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ team_name: name, class_name: cls || null })
        .select()
        .single();
      if (error) throw new Error(error.message);
      overlay.remove();
      showToast("✓ Drużyna utworzona");
      // dołącz do listy i zaznacz
      appendTeamRow(team);
      selectTeam(team.id, team.team_name);
    } catch(e) {
      errEl.textContent = "Błąd: " + e.message;
      errEl.classList.remove("hidden");
      btn.disabled = false; btn.textContent = "✓ Utwórz drużynę";
    }
  });

  // focus po wyrenderowaniu
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector("#new-team-name").focus(), 50);
}

function appendTeamRow(team) {
  const c = $("admin-teams-list");
  // usuń komunikat "brak drużyn" jeśli istnieje
  c.querySelector(".panel-loading")?.remove();

  const row = el("div", "team-row");
  row.dataset.id = team.id;
  row.innerHTML = `
    <div class="team-row-info">
      <span class="team-row-name">${team.team_name}</span>
      <span class="team-row-class">${team.class_name || "—"}</span>
    </div>
    <span class="team-row-count">👥 0</span>
    <span class="team-row-arrow">›</span>
  `;
  row.addEventListener("click", () => selectTeam(team.id, team.team_name));
  c.appendChild(row);
}

/* ════════════════════════════════════════════════════════════════════════════
   HURTOWY IMPORT ZAWODNIKÓW
   Obsługiwane formaty (każda linia = jeden zawodnik):
     Jan Kowalski
     Jan Kowalski  3A
     Jan Kowalski, 3A
     Jan Kowalski; 3A
════════════════════════════════════════════════════════════════════════════ */

function parseBulkList(raw) {
  const results = [];
  const errors  = [];

  raw.split("\n").forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/[\t,;]+/).map(p => p.trim()).filter(Boolean);
    let firstName = "", lastName = "", className = "";

    if (parts.length === 1) {
      const words = parts[0].split(/\s+/);
      if (words.length < 2) {
        errors.push(`Linia ${idx + 1}: „${trimmed}" — brak nazwiska`);
        return;
      }
      firstName = words[0];
      lastName  = words.slice(1).join(" ");
    } else if (parts.length === 2) {
      const words = parts[0].split(/\s+/);
      if (words.length >= 2) {
        firstName = words[0];
        lastName  = words.slice(1).join(" ");
        className = parts[1];
      } else {
        firstName = parts[0];
        lastName  = parts[1];
      }
    } else {
      firstName = parts[0];
      lastName  = parts[1];
      className = parts[2];
    }

    if (!firstName || !lastName) {
      errors.push(`Linia ${idx + 1}: „${trimmed}" — nie można odczytać imienia/nazwiska`);
      return;
    }
    results.push({ first_name: firstName, last_name: lastName, class_name: className });
  });

  return { results, errors };
}

function showBulkImportModal(teamId, teamName) {
  document.getElementById("bulk-import-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "bi-overlay";
  overlay.id = "bulk-import-modal";

  overlay.innerHTML = `
    <div class="bi-modal">

      <!-- NAGŁÓWEK -->
      <div class="bi-header">
        <div class="bi-header-left">
          <span class="bi-header-icon">📋</span>
          <div>
            <div class="bi-title">Hurtowy import zawodników</div>
            <div class="bi-subtitle">🏅 ${teamName}</div>
          </div>
        </div>
        <button class="bi-close" id="bi-close">✕</button>
      </div>

      <!-- KROKI (pasek) -->
      <div class="bi-steps-bar">
        <div class="bi-step bi-step--active" data-step="1">
          <span class="bi-step-num">1</span>
          <span class="bi-step-label">Lista</span>
        </div>
        <div class="bi-step-line"></div>
        <div class="bi-step" data-step="2">
          <span class="bi-step-num">2</span>
          <span class="bi-step-label">Opcje</span>
        </div>
        <div class="bi-step-line"></div>
        <div class="bi-step" data-step="3">
          <span class="bi-step-num">3</span>
          <span class="bi-step-label">Podgląd</span>
        </div>
      </div>

      <!-- KROK 1 — wklejanie listy -->
      <div class="bi-panel" id="bi-panel-1">
        <div class="bi-format-hint">
          <span class="bi-hint-title">Format wejściowy</span>
          <div class="bi-hint-examples">
            <code>Jan Kowalski</code>
            <code>Jan Kowalski  3A</code>
            <code>Jan Kowalski, 3A</code>
            <code>Jan Kowalski; 3A</code>
          </div>
        </div>
        <textarea id="bi-textarea" class="bi-textarea"
          placeholder="Wklej listę zawodników tutaj…&#10;&#10;Jan Kowalski&#10;Anna Nowak  3A&#10;Piotr Wiśniewski, 2B"></textarea>
        <div class="bi-field-error hidden" id="bi-err-1"></div>
      </div>

      <!-- KROK 2 — domyślne opcje -->
      <div class="bi-panel hidden" id="bi-panel-2">
        <div class="bi-defaults-label">Ustaw domyślne wartości dla wszystkich importowanych zawodników</div>
        <div class="bi-opts-grid">

          <label class="bi-opt" id="bi-opt-rodo">
            <div class="bi-opt-left">
              <span class="bi-opt-icon">🔐</span>
              <div class="bi-opt-text">
                <span class="bi-opt-name">Zgoda RODO</span>
                <span class="bi-opt-desc">Zawodnik wyraził zgodę RODO</span>
              </div>
            </div>
            <div class="bi-toggle-wrap">
              <input type="checkbox" id="def-rodo" class="bi-cb" />
              <span class="bi-toggle"></span>
            </div>
          </label>

          <label class="bi-opt" id="bi-opt-participation">
            <div class="bi-opt-left">
              <span class="bi-opt-icon">✅</span>
              <div class="bi-opt-text">
                <span class="bi-opt-name">Zgoda na udział</span>
                <span class="bi-opt-desc">Zawodnik ma zgodę na uczestnictwo</span>
              </div>
            </div>
            <div class="bi-toggle-wrap">
              <input type="checkbox" id="def-participation" class="bi-cb" />
              <span class="bi-toggle"></span>
            </div>
          </label>

          <label class="bi-opt" id="bi-opt-captain">
            <div class="bi-opt-left">
              <span class="bi-opt-icon">©️</span>
              <div class="bi-opt-text">
                <span class="bi-opt-name">Kapitan</span>
                <span class="bi-opt-desc">Oznacz wszystkich jako kapitan (rzadkie)</span>
              </div>
            </div>
            <div class="bi-toggle-wrap">
              <input type="checkbox" id="def-captain" class="bi-cb" />
              <span class="bi-toggle"></span>
            </div>
          </label>

          <div class="bi-opt bi-opt--fee">
            <div class="bi-opt-left">
              <span class="bi-opt-icon">💰</span>
              <div class="bi-opt-text">
                <span class="bi-opt-name">Wpisowe (zł)</span>
                <span class="bi-opt-desc">Kwota wpłaconego wpisowego</span>
              </div>
            </div>
            <input type="number" id="def-fee" class="bi-fee-input"
              min="0" step="0.01" value="0" placeholder="0.00" />
          </div>

        </div>
      </div>

      <!-- KROK 3 — podgląd + zapis -->
      <div class="bi-panel hidden" id="bi-panel-3">

        <!-- Podsumowanie -->
        <div class="bi-summary-row">
          <span class="bi-summary-ok" id="bi-summary-ok"></span>
          <span class="bi-summary-warn hidden" id="bi-summary-warn"></span>
        </div>

        <!-- Błędy parsowania (zwijane) -->
        <div class="bi-parse-errors hidden" id="bi-parse-errors"></div>

        <!-- Tabela podglądu -->
        <div class="bi-table-wrap">
          <table class="bi-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Imię</th>
                <th>Nazwisko</th>
                <th>Klasa</th>
                <th title="RODO">🔐</th>
                <th title="Udział">✅</th>
                <th title="Kapitan">©</th>
                <th>Wpisowe</th>
              </tr>
            </thead>
            <tbody id="bi-tbody"></tbody>
          </table>
        </div>

        <!-- Pasek postępu (ukryty do czasu zapisu) -->
        <div class="bi-progress hidden" id="bi-progress">
          <div class="bi-progress-track">
            <div class="bi-progress-fill" id="bi-progress-fill"></div>
          </div>
          <div class="bi-progress-text" id="bi-progress-text">Przygotowanie…</div>
        </div>

      </div>

      <!-- STOPKA -->
      <div class="bi-footer">
        <button class="bi-btn bi-btn--ghost" id="bi-btn-cancel">Anuluj</button>
        <div class="bi-footer-right">
          <button class="bi-btn bi-btn--ghost bi-btn--back hidden" id="bi-btn-back">← Wstecz</button>
          <button class="bi-btn bi-btn--primary" id="bi-btn-next">Dalej →</button>
        </div>
      </div>

    </div>
  `;

  /* ── referencje ──────────────────────────────────────────────────────── */
  const q = sel => overlay.querySelector(sel);
  let parsedPlayers = [];
  let step = 1;
  const TOTAL_STEPS = 3;

  /* ── pasek kroków ────────────────────────────────────────────────────── */
  function updateStepsBar(n) {
    overlay.querySelectorAll(".bi-step").forEach(s => {
      const sn = +s.dataset.step;
      s.classList.toggle("bi-step--active",    sn === n);
      s.classList.toggle("bi-step--done",      sn < n);
      s.classList.remove("bi-step--active");
      if (sn === n) s.classList.add("bi-step--active");
      else if (sn < n) s.classList.add("bi-step--done");
    });
  }

  function goToStep(n) {
    step = n;
    for (let i = 1; i <= TOTAL_STEPS; i++)
      q(`#bi-panel-${i}`).classList.toggle("hidden", i !== n);

    updateStepsBar(n);

    q("#bi-btn-back").classList.toggle("hidden", n === 1);
    q("#bi-btn-cancel").classList.toggle("hidden", n === TOTAL_STEPS && q("#bi-progress") && !q("#bi-progress").classList.contains("hidden"));

    if (n === 1)      { q("#bi-btn-next").textContent = "Dalej →"; q("#bi-btn-next").disabled = false; }
    else if (n === 2) { q("#bi-btn-next").textContent = "Podgląd →"; q("#bi-btn-next").disabled = false; }
    else if (n === 3) { q("#bi-btn-next").textContent = `💾 Zapisz ${parsedPlayers.length} zawodników`; q("#bi-btn-next").disabled = false; }
  }

  /* ── zamknij ─────────────────────────────────────────────────────────── */
  const close = () => overlay.remove();
  q("#bi-close").addEventListener("click", close);
  q("#bi-btn-cancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  /* ── toggle kart opcji ───────────────────────────────────────────────── */
  overlay.querySelectorAll(".bi-opt .bi-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.closest(".bi-opt").classList.toggle("bi-opt--on", cb.checked);
    });
  });

  /* ── wstecz ──────────────────────────────────────────────────────────── */
  q("#bi-btn-back").addEventListener("click", () => {
    if (step > 1) goToStep(step - 1);
  });

  /* ── buduj podgląd (krok 3) ──────────────────────────────────────────── */
  function buildPreview() {
    const rodo    = q("#def-rodo").checked;
    const part    = q("#def-participation").checked;
    const capt    = q("#def-captain").checked;
    const fee     = parseFloat(q("#def-fee").value) || 0;
    const check   = v => v ? "✓" : "—";

    const tbody = q("#bi-tbody");
    tbody.innerHTML = "";
    parsedPlayers.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="bi-td-num">${i + 1}</td>
        <td>${p.first_name}</td>
        <td><strong>${p.last_name}</strong></td>
        <td class="bi-td-class">${p.class_name || `<span class="bi-dash">—</span>`}</td>
        <td class="bi-td-flag ${rodo  ? "bi-flag--yes" : ""}">${check(rodo)}</td>
        <td class="bi-td-flag ${part  ? "bi-flag--yes" : ""}">${check(part)}</td>
        <td class="bi-td-flag ${capt  ? "bi-flag--yes" : ""}">${check(capt)}</td>
        <td class="bi-td-fee">${fee > 0 ? fee.toFixed(2) + " zł" : `<span class="bi-dash">—</span>`}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ── NEXT / SAVE ─────────────────────────────────────────────────────── */
  q("#bi-btn-next").addEventListener("click", async () => {

    /* ── Krok 1 → 2: parsuj listę ──── */
    if (step === 1) {
      const raw   = q("#bi-textarea").value;
      const errEl = q("#bi-err-1");
      if (!raw.trim()) {
        errEl.textContent = "Wklej listę zawodników.";
        errEl.classList.remove("hidden");
        return;
      }
      errEl.classList.add("hidden");

      const { results, errors } = parseBulkList(raw);
      if (!results.length) {
        errEl.textContent = "Nie znaleziono żadnych poprawnych zawodników.";
        errEl.classList.remove("hidden");
        return;
      }
      parsedPlayers = results;
      goToStep(2);
      return;
    }

    /* ── Krok 2 → 3: pokaż podgląd ── */
    if (step === 2) {
      // odśwież podsumowanie
      const raw = q("#bi-textarea").value;
      const { errors } = parseBulkList(raw);

      q("#bi-summary-ok").textContent  = `✓ Gotowych do zapisania: ${parsedPlayers.length}`;
      const warnEl = q("#bi-summary-warn");
      const errBox = q("#bi-parse-errors");
      if (errors.length) {
        warnEl.textContent = `⚠ Pominięto ${errors.length} ${errors.length === 1 ? "linię" : "linii"}`;
        warnEl.classList.remove("hidden");
        errBox.innerHTML = errors.map(e => `<div class="bi-err-item">${e}</div>`).join("");
        errBox.classList.remove("hidden");
      } else {
        warnEl.classList.add("hidden");
        errBox.classList.add("hidden");
      }

      buildPreview();
      goToStep(3);
      return;
    }

    /* ── Krok 3: ZAPIS ───────────────── */
    if (step === 3) {
      const defaults = {
        rodo_consent:          q("#def-rodo").checked          ? 1 : 0,
        participation_consent: q("#def-participation").checked  ? 1 : 0,
        is_captain:            q("#def-captain").checked        ? 1 : 0,
        entry_fee_paid:        parseFloat(q("#def-fee").value)  || 0,
      };

      // zablokuj UI
      q("#bi-btn-next").disabled = true;
      q("#bi-btn-back").classList.add("hidden");
      q("#bi-btn-cancel").classList.add("hidden");
      q("#bi-progress").classList.remove("hidden");

      const fill   = q("#bi-progress-fill");
      const text   = q("#bi-progress-text");
      let saved = 0, failed = 0;

      for (let i = 0; i < parsedPlayers.length; i++) {
        const p   = parsedPlayers[i];
        const pct = Math.round((i / parsedPlayers.length) * 100);
        fill.style.width  = pct + "%";
        text.textContent  = `Zapisywanie ${i + 1} / ${parsedPlayers.length} — ${p.first_name} ${p.last_name}`;

        try {
          // Utwórz osobę, potem gracza
          const { data: person, error: pe } = await supabase
            .from("people")
            .insert({ first_name: p.first_name, last_name: p.last_name, class_name: p.class_name || null, role: "Zawodnik" })
            .select()
            .single();
          if (pe) throw new Error(pe.message);
          const { error: plE } = await supabase
            .from("players")
            .insert({ team_id: teamId, person_id: person.id, ...defaults });
          if (plE) throw new Error(plE.message);
          saved++;
        } catch (e) {
          failed++;
          console.warn(`Błąd: ${p.first_name} ${p.last_name}:`, e.message);
        }
      }

      fill.style.width = "100%";
      fill.classList.add("bi-progress-fill--done");
      text.textContent = failed === 0
        ? `✓ Zaimportowano ${saved} zawodników!`
        : `Zapisano ${saved}, błędy: ${failed}`;

      showToast(
        failed === 0
          ? `✓ Zaimportowano ${saved} zawodników`
          : `⚠️ Zapisano ${saved}, błędy: ${failed}`,
        failed > 0
      );

      setTimeout(async () => {
        overlay.remove();
        await selectTeam(teamId, teamName);
        const row = document.querySelector(`.team-row[data-id="${teamId}"]`);
        if (row) {
          const players = await api(`/teams/${teamId}/players`);
          const cnt = row.querySelector(".team-row-count");
          if (cnt) cnt.textContent = `👥 ${players?.length ?? "?"}`;
        }
      }, 1400);
    }
  });

  document.body.appendChild(overlay);
  setTimeout(() => q("#bi-textarea").focus(), 60);
}