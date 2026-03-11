/* normFmt() zdefiniowane globalnie w admin-globals.js */
/* ── normSeed: spłaszcza rekord seeding (join z teams) ───────────────── */
function normSeed(s) {
  // BUG-FIX: id musi być zawsze liczbą całkowitą — parseInt() zapobiega błędom
  // porównania string vs number w matchExists() i _matchKey()
  const rawId = s.team_id ?? s.id;
  return {
    ...s,
    id:         parseInt(rawId, 10),
    team_name:  s.teams?.team_name  ?? s.team_name  ?? '?',
    class_name: s.teams?.class_name ?? s.class_name ?? '',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   PLANOWANIE ROZGRYWEK — Calendar + Match Queue
════════════════════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────────────────── */
let plQueue       = [];          // { id, disc, type, team1, team2, label, scheduled: {date,hour,min,court,duration} | null }
let plScheduled   = [];          // matches already on calendar (placed from queue)
let plCalView     = "week";      // "week" | "day"
let plAvailHighlight = [];        // array of person_ids to highlight
let plAvailCache     = {};        // personId -> [{day_of_week,hour_start,hour_end}]
let plCalDate     = new Date();  // anchor date
let plGenDisc     = "Piłka Nożna";
let plGenType     = "liga";
let plQueueFilter = "all";
let plDragItem    = null;        // { matchId, fromCalendar: bool }
let plDirtyCount  = 0;
let plModalMatch  = null;        // match being edited
let plInitDone    = false;

const AVAIL_COLORS = ["#6c63ff","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899"];

const DISC_COLOR = {
  "Piłka Nożna": "#22c55e",
  "Koszykówka":  "#fb923c",
  "Siatkówka":   "#a78bfa",
};
const CAL_START_H = 7;    // calendar starts at 07:00
const CAL_END_H   = 22;   // calendar ends at 22:00
const HOUR_PX     = 64;   // px per hour
const DAY_W_WEEK  = "calc((100% - 60px) / 7)"; // used in CSS variables

/* ── Entry point ───────────────────────────────────────────────────────── */
async function loadPlanowanie() {
  if (plInitDone) { renderCalendar(); renderQueue(); return; }
  plInitDone = true;
  plCalDate  = new Date();

  // Load ALL matches from server (scheduled and unscheduled)
  const existing = await api("/matches") || [];
  existing.forEach(m => {
    const id = "srv_" + m.id;
    const hasDate = !!(m.match_date && m.match_date !== "0000-00-00");
    const entry = {
      id, serverId: m.id, disc: m.discipline, type: m.match_type || "liga",
      team1: { id: m.team1_id, name: m.team1_name },
      team2: { id: m.team2_id, name: m.team2_name },
      label: `${m.team1_name} – ${m.team2_name}`,
      refereeId:  m.referee_id  || null,
      clerkId:    m.clerk_id    || null,
      scheduled: hasDate ? {
        date: m.match_date.slice(0,10),
        hour: m.match_time ? parseInt(m.match_time.slice(0,2)) : 10,
        min:  m.match_time ? parseInt(m.match_time.slice(3,5)) : 0,
        court: m.court || "",
        duration: m.duration_min || 60,
      } : null,
    };
    // P4 FIX: zarejestruj mecz w _serverMatchKeys żeby matchExists() wiedział o nim
    // nawet po odświeżeniu strony bez pełnego reload
    _serverMatchKeys.add(_matchKey(m.discipline, m.match_type || "liga", m.team1_id, m.team2_id));
    if (hasDate) plScheduled.push(entry);
    else         plQueue.push(entry);
  });

  // Load people for referee/clerk selects
  await loadPeopleSelects();

  // Wire toolbar buttons
  $("pl-cal-prev").onclick  = () => { shiftCal(-1); renderCalendar(); };
  $("pl-cal-next").onclick  = () => { shiftCal(+1); renderCalendar(); };
  $("pl-cal-today").onclick = () => { plCalDate = new Date(); renderCalendar(); };
  $("pl-generate-btn").onclick   = openGenWizard;
  $("pl-new-match-btn").onclick  = openNewMatchModal;
  $("pl-save-all-btn")?.addEventListener("click", saveAllToServer);
  $("pl-save-bar-btn")?.addEventListener("click", saveAllToServer);

  // B1: Przycisk "Zamknij ligę → awansuj do pucharu"
  $("pl-close-league-btn")?.addEventListener("click", openCloseLeagueModal);

  // D1: Przycisk "Kolejna runda pucharu"
  $("pl-next-cup-btn")?.addEventListener("click", openNextCupRoundModal);

  // Init availability picker
  initAvailPicker();

  // Queue toggle
  const toggleQueue = () => {
    const panel = $("pl-queue-panel");
    const btn   = $("pl-queue-toggle");
    panel.classList.toggle("open");
    btn.classList.toggle("active", panel.classList.contains("open"));
  };
  $("pl-queue-toggle").onclick = toggleQueue;
  $("pl-queue-close").onclick  = () => {
    $("pl-queue-panel").classList.remove("open");
    $("pl-queue-toggle").classList.remove("active");
  };

  // Match edit modal buttons
  $("pl-modal-close").onclick      = closePlModal;
  $("pl-modal-cancel").onclick     = closePlModal;
  $("pl-modal-backdrop").onclick   = e => { if (e.target === $("pl-modal-backdrop")) closePlModal(); };
  $("pl-modal-save").onclick       = savePlModal;
  $("pl-modal-remove").onclick     = removeFromModal;
  $("pl-modal-unschedule").onclick = unschedulePlMatch;
  $("pl-confirm-yes").onclick      = deletePlMatch;
  $("pl-confirm-no").onclick       = hidePlDeleteConfirm;

  // Generator wizard modal
  $("pl-gen-close").onclick    = closeGenWizard;
  $("pl-gen-backdrop").onclick = e => { if (e.target === $("pl-gen-backdrop")) closeGenWizard(); };

  // New match modal
  $("pl-nm-close").onclick  = closeNewMatchModal;
  $("pl-nm-cancel").onclick = closeNewMatchModal;
  $("pl-nm-backdrop").onclick = e => { if (e.target === $("pl-nm-backdrop")) closeNewMatchModal(); };
  $("pl-nm-add").onclick    = addNewMatch;
  $("pl-nm-disc").onchange  = () => populateNmTeams();
  $("pl-nm-team1").onchange = () => checkNmDuplicate();
  $("pl-nm-team2").onchange = () => checkNmDuplicate();

  document.querySelectorAll(".pl-view-tab").forEach(b =>
    b.onclick = () => { plCalView = b.dataset.view; document.querySelectorAll(".pl-view-tab").forEach(t => t.classList.toggle("active", t === b)); renderCalendar(); }
  );
  document.querySelectorAll(".pl-qf").forEach(b =>
    b.onclick = () => { plQueueFilter = b.dataset.disc; document.querySelectorAll(".pl-qf").forEach(t => t.classList.toggle("active", t === b)); renderQueue(); }
  );

  renderCalendar();
  renderQueue();
}

/* ── Load people into referee/clerk selects ─────────────────────────────── */
let plPeopleCache = null;
async function loadPeopleSelects() {
  if (!plPeopleCache) {
    plPeopleCache = await api("/people") || [];
  }
  const referees  = plPeopleCache.filter(p => ["Sędzia","Obie role"].includes(p.role));
  const clerks    = plPeopleCache.filter(p => ["Protokolant","Obie role"].includes(p.role));

  const refSel   = $("pl-field-referee");
  const clerkSel = $("pl-field-clerk");
  if (!refSel || !clerkSel) return;

  const buildOptions = (sel, people) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">— brak —</option>` +
      people.map(p => `<option value="${p.id}">${p.last_name} ${p.first_name}${p.class_name ? " ("+p.class_name+")" : ""}</option>`).join("");
    if (cur) sel.value = cur;
  };
  buildOptions(refSel,   referees);
  buildOptions(clerkSel, clerks);
}

/* ── Calendar navigation ───────────────────────────────────────────────── */
function shiftCal(dir) {
  if (plCalView === "week") plCalDate = addDays(plCalDate, dir * 7);
  else                      plCalDate = addDays(plCalDate, dir);
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function weekStart(d) {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Mon start
  r.setDate(r.getDate() + diff);
  return r;
}

/* ════════════════════════════════════════════════════════════════════════════
   GENERATOR MECZY — wizard modalny
   Kolejność:  1) Walidacja prereq  2) Podgląd co zostanie wygenerowane
               3) Opcje nadpisania  4) Generowanie wybranych bloków
════════════════════════════════════════════════════════════════════════════ */

/* ── Stan wizarda ──────────────────────────────────────────────────────── */
let _genFmt     = {};   // { disc → Tournament_Format }
let _genSeeds   = {};   // { disc_liga / disc_puchar → [] }
let _genPreview = [];   // lista bloków { disc, type, round, pairs[], existing }

/* ── Zamknij fazę ligową → awans do pucharu ─────────────────────────────── */
async function openCloseLeagueModal() {
  // BUGFIX BUG-7: /tournament-format zwraca obiekt { disc: fmt }, nie tablicę
  const fmtMap   = normFmt(await api("/tournament-format"));
  const eligible = Object.values(fmtMap).filter(f => f.has_league && f.has_cup);

  if (!eligible.length) {
    showPlToast("Żadna dyscyplina nie ma włączonej ligi i pucharu jednocześnie.", true);
    return;
  }

  const modal = document.createElement("div");
  modal.id = "pl-close-league-backdrop";
  modal.className = "pl-gen-backdrop";
  modal.innerHTML = `
    <div class="pl-gen-modal" style="max-width:540px">
      <div class="pl-gen-modal-header">
        <span>🏁 Zamknij fazę ligową → awans do pucharu</span>
        <button class="pl-gen-close" id="pl-cl-close">✕</button>
      </div>
      <div class="pl-gen-modal-body" id="pl-cl-body">
        <p style="margin:.5rem 0 1rem;font-size:.9rem;color:var(--muted)">
          Funkcja pobiera aktualną tabelę ligową i automatycznie ustawia awansujące drużyny
          w rozstawieniu pucharowym. <strong>Poprzednie rozstawienie pucharowe zostanie nadpisane.</strong>
        </p>
        <div style="display:flex;flex-direction:column;gap:.75rem">
          ${eligible.map(f => {
            const cupRounds = Array.isArray(f.cup_rounds) ? f.cup_rounds : JSON.parse(f.cup_rounds || "[]");
            const cupSize   = Math.max(2, Math.pow(2, cupRounds.length));
            const advance   = Math.round(cupSize / (f.groups_count || 1));
            return `
              <div class="pl-gen-block" style="padding:.75rem 1rem">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
                  <div>
                    <strong>${f.discipline}</strong>
                    <span style="font-size:.8rem;color:var(--muted);margin-left:.5rem">
                      ${f.groups_count} gr. × ${advance} awansujących = ${cupSize} drużyn w pucharze
                    </span>
                  </div>
                  <button class="dc-save-btn pl-cl-exec-btn" data-disc="${f.discipline}"
                          style="white-space:nowrap;padding:.35rem .75rem;font-size:.85rem">
                    Zamknij ligę
                  </button>
                </div>
                <div class="pl-cl-result" id="pl-cl-result-${f.discipline.replace(/\s/g,'_')}"></div>
              </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.classList.remove("hidden");

  // Close
  modal.querySelector("#pl-cl-close").onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  // Execute per discipline
  modal.querySelectorAll(".pl-cl-exec-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const disc = btn.dataset.disc;
      const resultEl = modal.querySelector(`#pl-cl-result-${disc.replace(/\s/g,'_')}`);
      btn.disabled = true;
      btn.textContent = "…";
      resultEl.innerHTML = `<span style="color:var(--muted);font-size:.82rem">Przetwarzam…</span>`;

      try {
        const ligaSeeds = await api(`/seeding/${encodeURIComponent(disc)}/liga`);
        const standingsData = await api(`/standings-custom/${encodeURIComponent(disc)}`);
        const fmt = standingsData?.format || {};
        const groups = fmt.groups_count || 1;
        const perGroup = fmt.teams_per_group || 4;
        // advance_per_group nie istnieje w schemacie — liczymy: połowa drużyn w grupie
        const advPerGroup = fmt.advance_per_group || Math.max(1, Math.ceil(perGroup / 2));
        const standingRows = standingsData?.rows || [];
        const promoted = [];
        for (let g = 0; g < groups; g++) {
          const groupTeams = (ligaSeeds || []).map(normSeed).filter(s => Math.floor(s.position / perGroup) === g);
          // Sortuj według kolejności w tabeli (standings)
          const groupIds = groupTeams.map(t => t.id);
          const groupStandings = standingRows.filter(r => groupIds.includes(r.team_id));
          groupStandings.slice(0, advPerGroup).forEach(r => {
            const seed = groupTeams.find(t => t.id === r.team_id);
            if (seed) promoted.push(seed);
          });
          // Jeśli brak statystyk — bierz po pozycji rozstawienia
          if (!groupStandings.length) groupTeams.slice(0, advPerGroup).forEach(s => promoted.push(s));
        }
        await supabase.from('seeding').delete().eq('discipline', disc).eq('type', 'puchar');
        if (promoted.length) {
          await supabase.from('seeding').insert(promoted.map((s, i) => ({ discipline: disc, type: 'puchar', team_id: s.id, position: i })));
        }
        const data = { ok: true, promoted: promoted.length, advance_per_group: advPerGroup, groups };

        if (data.ok) {
          resultEl.innerHTML = `<span style="color:var(--success,#22c55e);font-size:.82rem">
            ✅ ${data.promoted} drużyn awansowało (${data.advance_per_group} z każdej z ${data.groups} grup).
            Rozstawienie pucharowe zaktualizowane.
          </span>`;
          btn.textContent   = "✔ Gotowe";
          btn.style.background = "var(--success,#22c55e)";
          _genSeeds[disc + "_puchar"] = null;
          showPlToast(`${disc}: awans do pucharu zaktualizowany (${data.promoted} drużyn)`);
          // Odśwież widok sportowy drabinki jeśli jest otwarty
          if (typeof loadSportView === "function") loadSportView(disc);
        } else {
          resultEl.innerHTML = `<span style="color:var(--danger,#ef4444);font-size:.82rem">⚠ ${data.error}</span>`;
          btn.disabled = false;
          btn.textContent = "Zamknij ligę";
        }
      } catch(e) {
        resultEl.innerHTML = `<span style="color:var(--danger,#ef4444);font-size:.82rem">Błąd: ${e.message}</span>`;
        btn.disabled = false;
        btn.textContent = "Zamknij ligę";
      }
    });
  });
}

/* ── Zewnętrzne odświeżenie planera (wywoływane z admin-sport.js) ────────── */
async function forceReloadServerMatches() {
  if (!plInitDone) return; // planer nie był jeszcze otwarty — pomijamy
  const fresh = await api("/matches") || [];
  // Zresetuj lokalne tablice i przeładuj ze świeżych danych serwera
  plQueue     = [];
  plScheduled = [];
  _serverMatchKeys.clear();
  fresh.forEach(m => {
    const id = "srv_" + m.id;
    const hasDate = !!(m.match_date && m.match_date !== "0000-00-00");
    const entry = {
      id, serverId: m.id, disc: m.discipline, type: m.match_type || "liga",
      team1: { id: m.team1_id, name: m.team1_name },
      team2: { id: m.team2_id, name: m.team2_name },
      label: `${m.team1_name} – ${m.team2_name}`,
      refereeId: m.referee_id  || null,
      clerkId:   m.clerk_id    || null,
      cup_round: m.cup_round   || null,
      round:     m.cup_round   || null,
      scheduled: hasDate ? {
        date:  m.match_date.slice(0,10),
        hour:  m.match_time ? parseInt(m.match_time.slice(0,2)) : 10,
        min:   m.match_time ? parseInt(m.match_time.slice(3,5)) : 0,
        court: m.court || "",
        duration: m.duration_min || 60,
      } : null,
    };
    _serverMatchKeys.add(_matchKey(m.discipline, m.match_type || "liga", m.team1_id, m.team2_id));
    if (hasDate) plScheduled.push(entry);
    else         plQueue.push(entry);
  });
  renderCalendar();
  renderQueue();
  updateSaveBar();
}

/* ── Otwórz wizard ─────────────────────────────────────────────────────── */
async function openGenWizard() {
  const body = $("pl-gen-modal-body");
  body.innerHTML = `<div class="panel-loading">Analizuję stan turnieju…</div>`;
  $("pl-gen-backdrop").classList.remove("hidden");

  // Zawsze przeładuj świeże dane (nie cache)
  const [fmtAll, teams, freshMatches] = await Promise.all([
    api("/tournament-format"),
    api("/teams"),
    api("/matches"),
  ]);
  _genFmt = normFmt(fmtAll);

  // BUG-FIX: Przebuduj _serverMatchKeys ze świeżych danych bazy —
  // bez tego matchExists() nie wykrywa meczów zapisanych w poprzedniej sesji
  // ani po zmianie rozstawienia, co powoduje generowanie duplikatów.
  _serverMatchKeys.clear();
  (freshMatches || []).forEach(m => {
    _serverMatchKeys.add(_matchKey(m.discipline, m.match_type || "liga", m.team1_id, m.team2_id));
  });

  // Pobierz seedy dla wszystkich dyscyplin
  const DISCS = ["Piłka Nożna","Koszykówka","Siatkówka"];
  await Promise.all(DISCS.flatMap(d => [
    api(`/seeding/${encodeURIComponent(d)}/liga`).then(r  => { _genSeeds[d+"_liga"]   = r || []; }),
    api(`/seeding/${encodeURIComponent(d)}/puchar`).then(r=> { _genSeeds[d+"_puchar"] = r || []; }),
  ]));

  body.innerHTML = buildGenWizardHtml(DISCS, teams || []);
  wireGenWizard(body, DISCS);
}

function closeGenWizard() {
  $("pl-gen-backdrop").classList.add("hidden");
}

/* ── Buduj HTML wizarda ────────────────────────────────────────────────── */
function buildGenWizardHtml(DISCS, teams) {
  // Zbierz istniejące mecze per disc+type
  const allMatches = [...plQueue, ...plScheduled];

  const blocks = [];  // { key, disc, type, label, prereqOk, prereqMsg, pairs, existingCount }

  for (const disc of DISCS) {
    const fmt        = _genFmt[disc] || {};
    const ligaSeeds  = _genSeeds[disc+"_liga"]  || [];
    const pucharSeeds= _genSeeds[disc+"_puchar"]|| [];
    const emoji      = DISC_EMOJI[disc] || "🏅";

    // ── LIGA ──────────────────────────────────────────────────────────────
    if (fmt.has_league) {
      const assignedSeeds = ligaSeeds.filter(s => s.position >= 0);
      const groups     = fmt.groups_count    || 1;
      const perGroup   = fmt.teams_per_group || assignedSeeds.length;

      let prereqOk  = true;
      let prereqMsg = "";

      if (!assignedSeeds.length) {
        prereqOk  = false;
        prereqMsg = "Brak rozstawienia — przypisz drużyny do grup w sekcji Rozstawienie.";
      } else if (assignedSeeds.length < 2) {
        prereqOk  = false;
        prereqMsg = "Za mało drużyn w rozstawieniu (minimum 2).";
      } else {
        // P9 FIX: Sprawdź czy każda grupa ma minimum 2 drużyny
        const groupCounts = {};
        assignedSeeds.forEach(t => {
          const gIdx = Math.floor(t.position / perGroup);
          groupCounts[gIdx] = (groupCounts[gIdx] || 0) + 1;
        });
        const emptyGroups = Object.entries(groupCounts).filter(([, cnt]) => cnt < 2);
        if (emptyGroups.length > 0) {
          const groupLabels = "ABCDEFGH";
          const names = emptyGroups.map(([g]) => `Gr ${groupLabels[g] || (+g+1)}`).join(", ");
          prereqOk  = false;
          prereqMsg = `Za mało drużyn w grupach (min. 2 na grupę): ${names}. Uzupełnij rozstawienie.`;
        }
      }

      // Oblicz pary
      const pairs = prereqOk ? computeLeaguePairs(disc, fmt, ligaSeeds) : [];
      const existingCount = allMatches.filter(m => m.disc === disc && m.type === "liga").length;
      const newCount = pairs.filter(p => !matchExists(disc,"liga",p.t1.id,p.t2.id)).length;

      blocks.push({
        key: disc+"_liga", disc, type:"liga",
        label: `${emoji} ${disc} — Liga`,
        groups, perGroup,
        prereqOk, prereqMsg,
        pairs, existingCount, newCount,
        groupSummary: buildGroupSummary(ligaSeeds, groups, perGroup),
      });
    }

    // ── PUCHAR ────────────────────────────────────────────────────────────
    if (fmt.has_cup) {
      const directSeeds = pucharSeeds.filter(s => s.position >= 0);
      let prereqOk  = true;
      let prereqMsg = "";
      let sourceLabel = "";

      if (directSeeds.length >= 2) {
        sourceLabel = `Rozstawienie pucharowe (${directSeeds.length} drużyn)`;
      } else if (ligaSeeds.filter(s => s.position >= 0).length >= 2) {
        sourceLabel = "Generowane z rozstawienia ligowego";
        if (!fmt.has_league) {
          prereqOk  = false;
          prereqMsg = "Brak rozstawienia pucharowego i ligowego.";
        }
      } else {
        prereqOk  = false;
        prereqMsg = "Brak rozstawienia. Uzupełnij sekcję Rozstawienie.";
      }

      const pairs = prereqOk ? computeCupPairs(disc, fmt) : [];
      const existingCount = allMatches.filter(m => m.disc === disc && m.type === "puchar").length;
      const newCount = pairs.filter(p => p.t1?.id && p.t2?.id && !matchExists(disc,"puchar",p.t1.id,p.t2.id)).length;
      const cupRounds = Array.isArray(fmt.cup_rounds) ? fmt.cup_rounds : [];

      blocks.push({
        key: disc+"_puchar", disc, type:"puchar",
        label: `${emoji} ${disc} — Puchar`,
        cupRounds, sourceLabel,
        prereqOk, prereqMsg,
        pairs, existingCount, newCount,
      });
    }
  }

  if (!blocks.length) {
    return `<div class="pl-gen-empty">Żaden format rozgrywek nie jest włączony.<br>Włącz ligę lub puchar w <strong>Ustawieniach turnieju</strong>.</div>`;
  }

  const rows = blocks.map(b => {
    const statusIcon = !b.prereqOk ? "🔴" : b.existingCount > 0 ? "🟡" : "🟢";
    const statusTip  = !b.prereqOk ? "Brak wymaganych danych"
                     : b.existingCount > 0 ? `${b.existingCount} meczów już istnieje`
                     : "Gotowe do generowania";

    const prereqNote = !b.prereqOk
      ? `<div class="pl-gen-prereq-err">⚠ ${b.prereqMsg}</div>`
      : "";

    const groupInfo = b.groupSummary
      ? `<div class="pl-gen-group-summary">${b.groupSummary}</div>`
      : "";

    const sourceInfo = b.sourceLabel
      ? `<div class="pl-gen-source">📌 Źródło: ${b.sourceLabel}</div>`
      : "";

    const cupInfo = b.cupRounds?.length
      ? `<div class="pl-gen-source">🏆 Rundy: ${b.cupRounds.join(" → ")}</div>`
      : "";

    let pairsHtml = "";
    if (b.prereqOk && b.pairs.length) {
      const visiblePairs = b.pairs.slice(0, 6);
      const more = b.pairs.length - 6;
      pairsHtml = `
        <div class="pl-gen-pairs">
          ${visiblePairs.map(p => {
            const n1 = p.t1?.team_name || p.t1?.name || "?";
            const n2 = p.t2?.team_name || p.t2?.name || "?";
            const dup = p.t1?.id && p.t2?.id && matchExists(b.disc, b.type, p.t1.id, p.t2.id);
            return `<span class="pl-gen-pair ${dup ? "pl-gen-pair--dup" : ""}" title="${dup ? "Już istnieje" : "Nowy mecz"}">
              ${n1} <em>vs</em> ${n2}${dup ? " ✓" : ""}
            </span>`;
          }).join("")}
          ${more > 0 ? `<span class="pl-gen-pair-more">+${more} więcej…</span>` : ""}
        </div>`;
    }

    const canGenerate = b.prereqOk && b.newCount > 0;
    const allExist    = b.prereqOk && b.newCount === 0 && b.pairs.length > 0;

    // Existing count info
    let existInfo = "";
    if (b.existingCount > 0) {
      existInfo = `
        <div class="pl-gen-exist-row">
          <span class="pl-gen-exist-badge">📋 ${b.existingCount} meczów w systemie</span>
          <button class="pl-gen-del-btn" data-key="${b.key}" title="Usuń wszystkie mecze tego bloku z kolejki i bazy">
            🗑 Wyczyść blok
          </button>
        </div>`;
    }

    return `
    <div class="pl-gen-block ${!b.prereqOk ? "pl-gen-block--disabled" : ""}" data-key="${b.key}">
      <div class="pl-gen-block-header">
        <label class="pl-gen-block-check">
          <input type="checkbox" class="pl-gen-cb" data-key="${b.key}"
            ${!canGenerate ? "disabled" : "checked"} />
          <span class="pl-gen-block-title">${b.label}</span>
        </label>
        <span class="pl-gen-status" title="${statusTip}">${statusIcon}
          ${b.newCount > 0 ? `<strong>+${b.newCount} nowych</strong>` : allExist ? "wszystkie istnieją" : ""}
        </span>
      </div>
      ${prereqNote}
      ${groupInfo}
      ${sourceInfo}
      ${cupInfo}
      ${existInfo}
      ${pairsHtml}
    </div>`;
  }).join("");

  const anyCanGen = blocks.some(b => b.prereqOk && b.newCount > 0);

  return `
  <div class="pl-gen-wizard">
    <div class="pl-gen-legend">
      <span>🟢 Gotowe</span><span>🟡 Częściowo istnieje</span><span>🔴 Brak danych</span>
      <span class="pl-gen-legend-check">✓ zaznaczone = istniejące pary pominięte</span>
    </div>
    <div class="pl-gen-blocks">${rows}</div>
    <div class="pl-gen-footer">
      <label class="pl-gen-reload-lbl">
        <input type="checkbox" id="pl-gen-force-reload" />
        Wymuś przeładowanie (zignoruj lokalne zmiany)
      </label>
      <div style="flex:1"></div>
      <button class="pl-btn pl-btn--ghost" onclick="closeGenWizard()">Anuluj</button>
      <button class="pl-btn pl-btn--generate" id="pl-gen-run-btn" ${!anyCanGen ? "disabled" : ""}>
        ⚡ Generuj zaznaczone
      </button>
    </div>
  </div>`;
}

function buildGroupSummary(seeds, groups, perGroup) {
  const assigned = seeds.filter(s => s.position >= 0);
  if (!assigned.length) return "";
  const groupLabels = "ABCDEFGH";
  const groupMap = {};
  assigned.forEach(t => {
    const g = Math.floor(t.position / perGroup);
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(t.team_name);
  });
  return Object.entries(groupMap).map(([g, names]) =>
    `<span class="pl-gen-group-chip">Gr ${groupLabels[g]}: ${names.join(", ")}</span>`
  ).join("");
}

/* ── Podpinanie eventów w wizardzie ─────────────────────────────────────── */
function wireGenWizard(body, DISCS) {
  // Wyczyść blok
  body.querySelectorAll(".pl-gen-del-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const [disc, type] = key.split("_");
      await clearMatchBlock(disc, type, btn);
    });
  });

  // Generuj
  $("pl-gen-run-btn")?.addEventListener("click", async () => {
    const checked = [...body.querySelectorAll(".pl-gen-cb:checked:not(:disabled)")].map(cb => cb.dataset.key);
    if (!checked.length) return;
    await runGeneration(checked, DISCS);
  });
}

/* ── Usuń cały blok meczów ─────────────────────────────────────────────── */
async function clearMatchBlock(disc, type, triggerBtn) {
  if (!confirm(`Usunąć WSZYSTKIE mecze: ${disc} / ${type}?
Tej operacji nie można cofnąć.`)) return;
  if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = "Usuwam…"; }

  // Usuń z serwera
  const toDelete = [...plQueue, ...plScheduled].filter(m => m.disc === disc && m.type === type && m.serverId);
  for (const m of toDelete) {
    try { await supabase.from('matches').delete().eq('id', m.serverId); } catch(e) {}
  }

  // Usuń lokalnie
  plQueue     = plQueue.filter(m => !(m.disc === disc && m.type === type));
  plScheduled = plScheduled.filter(m => !(m.disc === disc && m.type === type));

  renderCalendar();
  renderQueue();
  updateSaveBar();

  // Odśwież wizard
  await openGenWizard();
  showPlToast(`🗑 Wyczyszczono mecze: ${disc} / ${type}`);
}

/* ── Uruchom generowanie zaznaczonych bloków ─────────────────────────────── */
async function runGeneration(checkedKeys, DISCS) {
  const btn = $("pl-gen-run-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Generuję…"; }

  const forceReload = $("pl-gen-force-reload")?.checked;
  if (forceReload) {
    // Czyść lokalny cache meczów żeby matchExists() działał na danych z bazy
    plInitDone = false;
    const existing = await api("/matches") || [];
    // Zaktualizuj listę bez usuwania lokalnych bez serverId
    existing.forEach(m => {
      const id = "srv_" + m.id;
      // P4 FIX: odśwież _serverMatchKeys
      _serverMatchKeys.add(_matchKey(m.discipline, m.match_type || "liga", m.team1_id, m.team2_id));
      if (!plQueue.some(q => q.id === id) && !plScheduled.some(s => s.id === id)) {
        const hasDate = !!(m.match_date && m.match_date !== "0000-00-00");
        const entry = {
          id, serverId: m.id, disc: m.discipline, type: m.match_type || "liga",
          team1: { id: m.team1_id, name: m.team1_name },
          team2: { id: m.team2_id, name: m.team2_name },
          label: `${m.team1_name} – ${m.team2_name}`,
          refereeId: m.referee_id || null, clerkId: m.clerk_id || null,
          scheduled: hasDate ? {
            date: m.match_date.slice(0,10),
            hour: m.match_time ? parseInt(m.match_time.slice(0,2)) : 10,
            min:  m.match_time ? parseInt(m.match_time.slice(3,5)) : 0,
            court: m.court || "", duration: m.duration_min || 60,
          } : null,
        };
        if (hasDate) plScheduled.push(entry);
        else         plQueue.push(entry);
      }
    });
    plInitDone = true;
  }

  const fmtAll = _genFmt;
  let totalAdded = 0;

  for (const key of checkedKeys) {
    const underIdx = key.lastIndexOf("_");
    const disc = key.slice(0, underIdx);
    const type = key.slice(underIdx + 1);
    const fmt  = fmtAll[disc] || {};
    let added = 0;
    if (type === "liga")   added = await generateLeagueMatches(disc, fmt);
    if (type === "puchar") added = await generateCupMatches(disc, fmt);
    totalAdded += added;
  }

  closeGenWizard();
  renderQueue();
  renderCalendar();
  updateSaveBar();
  showPlToast(totalAdded > 0
    ? `✓ Dodano ${totalAdded} nowych meczów do kolejki`
    : "ℹ Nie dodano nowych meczów — wszystkie pary już istnieją",
    totalAdded === 0);
}

/* ── Oblicz pary ligowe (do podglądu) ──────────────────────────────────── */
function computeLeaguePairs(disc, fmt, seeds) {
  const groups   = fmt.groups_count    || 1;
  const perGroup = fmt.teams_per_group || seeds.length;
  const groupMap = {};
  seeds.map(normSeed).filter(s => s.position >= 0).forEach(t => {
    const g = Math.floor(t.position / perGroup);
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(t);
  });
  const pairs = [];
  Object.values(groupMap).forEach(gTeams => {
    for (let i = 0; i < gTeams.length; i++)
      for (let j = i+1; j < gTeams.length; j++)
        pairs.push({ t1: gTeams[i], t2: gTeams[j] });
  });
  return pairs;
}

/* ── Oblicz pary pucharowe (do podglądu) ────────────────────────────────── */
function computeCupPairs(disc, fmt) {
  const directSeeds = (_genSeeds[disc+"_puchar"] || []).filter(s => s.position >= 0).sort((a,b)=>a.position-b.position);
  if (directSeeds.length >= 2) {
    const pairs = [];
    for (let i = 0; i < directSeeds.length - 1; i += 2)
      pairs.push({ t1: directSeeds[i], t2: directSeeds[i+1] });
    return pairs;
  }
  // P2 FIX: używamy aktualnej kolejności z tabeli (rankStandings) jeśli dostępna,
  // w przeciwnym razie fallback do pozycji rozstawienia ligowego.
  const ligaSeeds = (_genSeeds[disc+"_liga"] || []).filter(s => s.position >= 0);
  if (!ligaSeeds.length) return [];
  const groups   = fmt.groups_count    || 1;
  const perGroup = fmt.teams_per_group || 4;
  const cupRounds= Array.isArray(fmt.cup_rounds) ? fmt.cup_rounds : ["Półfinał","Finał"];
  const cupSize  = Math.max(2, Math.pow(2, cupRounds.length));
  const advance  = Math.round(cupSize / groups); // BUGFIX BUG-3: spójność z serwerem
  const groupLabels = "ABCDEFGH";
  const groupMap = {};
  ligaSeeds.forEach(t => {
    const g = Math.floor(t.position / perGroup);
    if (!groupMap[g]) groupMap[g] = [];
    // Podgląd: używamy pozycji z rozstawienia (tabela nie jest jeszcze dostępna sync)
    groupMap[g].push({ ...t, place: (t.position % perGroup) + 1 });
  });
  Object.values(groupMap).forEach(arr => arr.sort((a,b)=>a.place-b.place));
  return buildCupPairsFromGroups(groupMap, groups, advance, groupLabels);
}

/* ════════════════════════════════════════════════════════════════════════════
   NOWY POJEDYNCZY MECZ
════════════════════════════════════════════════════════════════════════════ */

let _nmTeamsCache = null;

async function openNewMatchModal() {
  $("pl-nm-backdrop").classList.remove("hidden");
  $("pl-nm-dup-warn").style.display = "none";
  $("pl-nm-round").value = "";

  if (!_nmTeamsCache) {
    _nmTeamsCache = await api("/teams") || [];
  }
  populateNmTeams();
}

function closeNewMatchModal() {
  $("pl-nm-backdrop").classList.add("hidden");
}

function populateNmTeams() {
  const disc   = $("pl-nm-disc").value;
  const teams  = _nmTeamsCache || [];
  const sel1   = $("pl-nm-team1");
  const sel2   = $("pl-nm-team2");
  const opts   = `<option value="">— wybierz —</option>` +
    teams.map(t => `<option value="${t.id}" data-name="${t.team_name}">${t.team_name}${t.class_name?" ("+t.class_name+")":""}</option>`).join("");
  sel1.innerHTML = opts;
  sel2.innerHTML = opts;
  checkNmDuplicate();
}

function checkNmDuplicate() {
  const disc = $("pl-nm-disc").value;
  const id1  = parseInt($("pl-nm-team1").value);
  const id2  = parseInt($("pl-nm-team2").value);
  const type = $("pl-nm-type").value;
  const warn = $("pl-nm-dup-warn");
  if (id1 && id2 && id1 !== id2) {
    const dup = matchExists(disc, type, id1, id2);
    warn.style.display = dup ? "" : "none";
  } else {
    warn.style.display = "none";
  }
}

function addNewMatch() {
  const disc  = $("pl-nm-disc").value;
  const type  = $("pl-nm-type").value;
  const round = $("pl-nm-round").value.trim() || (type === "liga" ? "Liga" : type === "puchar" ? "Puchar" : "Mecz");
  const sel1  = $("pl-nm-team1");
  const sel2  = $("pl-nm-team2");
  const id1   = parseInt(sel1.value);
  const id2   = parseInt(sel2.value);

  if (!id1 || !id2)      { alert("Wybierz obie drużyny."); return; }
  if (id1 === id2)       { alert("Drużyny muszą być różne."); return; }

  const name1 = sel1.options[sel1.selectedIndex].dataset.name;
  const name2 = sel2.options[sel2.selectedIndex].dataset.name;

  plQueue.push({
    id:    genId(disc, type, id1, id2),
    disc, type,
    team1: { id: id1, name: name1 },
    team2: { id: id2, name: name2 },
    label: `${name1} – ${name2}`,
    round, cup_round: type === "puchar" ? round : null,
    scheduled: null, _new: true,
  });

  closeNewMatchModal();
  renderQueue();
  updateSaveBar();

  // Otwórz panel kolejki
  $("pl-queue-panel").classList.add("open");
  $("pl-queue-toggle").classList.add("active");

  showPlToast(`✓ Dodano: ${name1} – ${name2}`);
}

/* ── Liga: round-robin w każdej grupie osobno ────────────────────────────── */
async function generateLeagueMatches(disc, fmt) {
  const seeds = await api(`/seeding/${encodeURIComponent(disc)}/liga`);
  if (!seeds?.length) return 0;

  const groups   = fmt.groups_count    || 1;
  const perGroup = fmt.teams_per_group || seeds.length;
  const groupLabels = "ABCDEFGH";

  const groupMap = {};
  seeds.map(normSeed).filter(s => s.position >= 0).forEach(t => {
    const gIdx = Math.floor(t.position / perGroup);
    const sIdx = t.position % perGroup;
    if (!groupMap[gIdx]) groupMap[gIdx] = [];
    groupMap[gIdx].push({ ...t, sIdx });
  });

  let added = 0;

  Object.entries(groupMap).forEach(([gIdxStr, gTeams]) => {
    const gIdx   = parseInt(gIdxStr);
    const gLabel = groupLabels[gIdx] || String(gIdx + 1);
    gTeams.sort((a, b) => a.sIdx - b.sIdx);

    // P9 FIX: Pomiń grupy z mniej niż 2 drużynami — nie da się rozegrać meczy
    if (gTeams.length < 2) {
      console.warn(`generateLeagueMatches: grupa ${gLabel} ma tylko ${gTeams.length} drużynę — pomijam`);
      return;
    }

    for (let i = 0; i < gTeams.length; i++) {
      for (let j = i + 1; j < gTeams.length; j++) {
        const t1 = gTeams[i], t2 = gTeams[j];
        if (matchExists(disc, "liga", t1.id, t2.id)) continue;

        plQueue.push({
          id: genId(disc, "liga", t1.id, t2.id),
          disc, type: "liga",
          team1: { id: t1.id, name: t1.team_name },
          team2: { id: t2.id, name: t2.team_name },
          label: `${t1.team_name} – ${t2.team_name}`,
          groupLabel: gLabel,
          round: `Grupa ${gLabel}`,
          scheduled: null, _new: true,
        });
        added++;
      }
    }
  });

  return added;
}

/* ── Puchar: pary z pozycji grupowych ───────────────────────────────────── */
async function generateCupMatches(disc, fmt) {
  const cupSeeds    = await api(`/seeding/${encodeURIComponent(disc)}/puchar`);
  const directSeeds = cupSeeds?.map(normSeed).filter(s => s.position >= 0).sort((a,b) => a.position - b.position);

  if (directSeeds?.length >= 2) {
    let added = 0;
    const cupRounds  = Array.isArray(fmt.cup_rounds) ? fmt.cup_rounds : ["1/4","Półfinał","Finał"];
    const firstRound = cupRounds[0] || "1/16";

    // BUGFIX BUG-6: ostrzeżenie gdy nieparzysta liczba seedów (ostatnia drużyna dostaje BYE)
    if (directSeeds.length % 2 !== 0) {
      const byeTeam = directSeeds[directSeeds.length - 1];
      showPlToast(
        `⚠ Nieparzysta liczba seedów (${directSeeds.length}) dla ${disc} — drużyna ` +
        `"${byeTeam.team_name}" otrzymuje wolny los (BYE). Przypisz jej rywala ręcznie lub usuń jeden seed.`,
        true
      );
    }

    for (let i = 0; i < directSeeds.length - 1; i += 2) {
      const t1 = directSeeds[i], t2 = directSeeds[i + 1];
      if (!t1 || !t2) continue;
      if (matchExists(disc, "puchar", t1.id, t2.id)) continue;

      plQueue.push({
        id: genId(disc, "puchar", t1.id, t2.id),
        disc, type: "puchar",
        team1: { id: t1.id, name: t1.team_name },
        team2: { id: t2.id, name: t2.team_name },
        label: `${t1.team_name} – ${t2.team_name}`,
        seedLabel: `#${i+1} vs #${i+2}`,
        round: firstRound, cup_round: firstRound,
        scheduled: null, _new: true,
      });
      added++;
    }
    return added;
  }

  return await generateCupFromLeagueGroups(disc, fmt);
}

/* ── Puchar z grup ligowych ─────────────────────────────────────────────── */
async function generateCupFromLeagueGroups(disc, fmt) {
  const ligaSeeds = await api(`/seeding/${encodeURIComponent(disc)}/liga`);
  if (!ligaSeeds?.length) return 0;

  const groups     = fmt.groups_count    || 1;
  const perGroup   = fmt.teams_per_group || 4;
  const cupRounds  = Array.isArray(fmt.cup_rounds) ? fmt.cup_rounds : ["Półfinał","Finał"];
  const cupSize    = Math.max(2, Math.pow(2, cupRounds.length));
  // BUGFIX BUG-3: Math.round — spójność z serwerem (server.js:1613), unika ułamkowego advance
  const advance    = Math.round(cupSize / groups);
  const firstRound = cupRounds[0] || "Półfinał";
  const groupLabels = "ABCDEFGH";

  // P2 FIX: pobierz aktualną tabelę ligową z serwera zamiast opierać się na
  // pozycjach rozstawienia (które są pozycjami startowymi, nie wynikami).
  let standingsMap = {};
  try {
    const standingsData = await api(`/standings-custom/${encodeURIComponent(disc)}`);
    const standingsRows = standingsData?.rows || standingsData || [];
    // Mapa: team_id → miejsce w tabeli (1-based, w kolejności z serwera)
    standingsRows.forEach((row, idx) => {
      standingsMap[row.id] = { rank: idx + 1, pts: row.pts, gd: row.gd, gf: row.gf };
    });
  } catch(e) {
    console.warn("generateCupFromLeagueGroups: nie udało się pobrać tabeli, fallback do pozycji rozstawienia", e);
  }

  const groupMap = {};
  ligaSeeds.map(normSeed).filter(s => s.position >= 0).forEach(t => {
    const gIdx = Math.floor(t.position / perGroup);
    if (!groupMap[gIdx]) groupMap[gIdx] = [];
    // Użyj miejsca z tabeli wyników; fallback do pozycji rozstawienia
    const standing = standingsMap[t.id];
    const place = standing ? standing.rank : (t.position % perGroup) + 1;
    groupMap[gIdx].push({ ...t, place, _pts: standing?.pts ?? 0, _gd: standing?.gd ?? 0 });
  });
  // Sortuj każdą grupę wg faktycznych wyników (miejsce w tabeli), nie wg seed
  Object.values(groupMap).forEach(arr => arr.sort((a, b) => a.place - b.place));

  const pairs = buildCupPairsFromGroups(groupMap, groups, advance, groupLabels);

  let added = 0;
  pairs.forEach(({ t1, t2, label1, label2 }) => {
    const id1 = t1?.id ?? 0, id2 = t2?.id ?? 0;
    if (!t1 && !t2) return;
    if (t1 && t2 && matchExists(disc, "puchar", id1, id2)) return;

    const team1 = t1 ? { id: t1.id, name: t1.team_name } : { id: null, name: label1 };
    const team2 = t2 ? { id: t2.id, name: t2.team_name } : { id: null, name: label2 };
    if (!team1.id && !team2.id) return;

    plQueue.push({
      id: genId(disc, "puchar", id1, id2),
      disc, type: "puchar",
      team1, team2,
      label: `${team1.name} – ${team2.name}`,
      seedLabel: `${label1} vs ${label2}`,
      round: firstRound, cup_round: firstRound,
      scheduled: null, _new: true,
    });
    added++;
  });

  return added;
}

/* ── Budowanie par pucharowych z grup ────────────────────────────────────── */
function buildCupPairsFromGroups(groupMap, numGroups, advance, groupLabels) {
  const pairs = [];

  // ── JEDNA GRUPA ──────────────────────────────────────────────────────────
  if (numGroups === 1) {
    const teams = groupMap[0] || [];
    const limit = Math.min(teams.length, advance);
    for (let i = 0; i + 1 < limit; i += 2) {
      pairs.push({ t1: teams[i], t2: teams[i+1], label1: `${i+1}. Gr A`, label2: `${i+2}. Gr A` });
    }
    // BYE przy nieparzystej liczbie awansujących
    if (limit % 2 !== 0 && teams[limit - 1]) {
      pairs.push({ t1: teams[limit - 1], t2: null, label1: `${limit}. Gr A`, label2: "BYE" });
    }
    return pairs;
  }

  // ── DWIE GRUPY ───────────────────────────────────────────────────────────
  // BUGFIX BUG-1: oryginał wykonywał 2×push() per iterację → podwójne pary.
  // Poprawka: jedna para per p, schemat krzyżowy (p.GrA vs (advance-1-p).GrB).
  if (numGroups === 2) {
    const grA = groupMap[0] || [], grB = groupMap[1] || [];
    for (let p = 0; p < advance; p++) {
      const t1 = grA[p], t2 = grB[advance - 1 - p];
      if (!t1 && !t2) continue;
      pairs.push({
        t1, t2,
        label1: `${p+1}. Gr A`,
        label2: `${advance-p}. Gr B`,
      });
    }
    return pairs;
  }

  // ── CZTERY GRUPY (UEFA cross-bracket) ────────────────────────────────────
  // BUGFIX BUG-2: ten sam problem co numGroups=2 — podwójne push().
  // Schemat: A↔B i C↔D, każda para grup generuje advance par w jedną stronę
  // i advance par w stronę odwrotną (osobne pętle, jeden push() każda).
  if (numGroups === 4) {
    const crossPairs = [[0,1],[2,3]];
    for (const [gW, gR] of crossPairs) {
      const grW = groupMap[gW] || [], grR = groupMap[gR] || [];
      for (let p = 0; p < advance; p++) {
        pairs.push({
          t1: grW[p], t2: grR[advance - 1 - p],
          label1: `${p+1}. Gr ${groupLabels[gW]}`,
          label2: `${advance-p}. Gr ${groupLabels[gR]}`,
        });
      }
      for (let p = 0; p < advance; p++) {
        pairs.push({
          t1: grR[p], t2: grW[advance - 1 - p],
          label1: `${p+1}. Gr ${groupLabels[gR]}`,
          label2: `${advance-p}. Gr ${groupLabels[gW]}`,
        });
      }
    }
    return pairs;
  }

  // ── OGÓLNA FORMUŁA (3, 5, 6, 7, 8 grup) ─────────────────────────────────
  for (let gIdx = 0; gIdx < Math.floor(numGroups / 2); gIdx++) {
    const oppIdx = numGroups - 1 - gIdx;
    if (gIdx === oppIdx) break;
    const grL = groupMap[gIdx]   || [];
    const grR = groupMap[oppIdx] || [];
    for (let p = 0; p < advance; p++) {
      pairs.push({
        t1: grL[p], t2: grR[advance-1-p],
        label1: `${p+1}. Gr ${groupLabels[gIdx]}`,
        label2: `${advance-p}. Gr ${groupLabels[oppIdx]}`,
      });
      pairs.push({
        t1: grR[p], t2: grL[advance-1-p],
        label1: `${p+1}. Gr ${groupLabels[oppIdx]}`,
        label2: `${advance-p}. Gr ${groupLabels[gIdx]}`,
      });
    }
  }
  return pairs;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
// P4 FIX: Zbiór kluczy meczów pobranych z serwera — uzupełniany przy ładowaniu
// i przy każdym generowaniu. Zapobiega duplikatom po odświeżeniu strony.
const _serverMatchKeys = new Set();

function _matchKey(disc, type, id1, id2) {
  // BUG-FIX: parseInt() zapewnia że klucze są zawsze liczbowe,
  // bez względu czy id pochodzi z bazy (string) czy z JS (number)
  const n1 = parseInt(id1, 10);
  const n2 = parseInt(id2, 10);
  const [a, b] = n1 < n2 ? [n1, n2] : [n2, n1];
  return `${disc}|${type}|${a}|${b}`;
}

function matchExists(disc, type, id1, id2) {
  // BUG-FIX: parseInt() zapewnia spójność typów przy porównywaniu ID
  const n1 = parseInt(id1, 10);
  const n2 = parseInt(id2, 10);
  // Sprawdź lokalny cache JS
  const localFound = [...plQueue, ...plScheduled].some(m =>
    m.disc === disc && m.type === type &&
    ((parseInt(m.team1.id, 10) === n1 && parseInt(m.team2.id, 10) === n2) ||
     (parseInt(m.team1.id, 10) === n2 && parseInt(m.team2.id, 10) === n1))
  );
  if (localFound) return true;
  // P4 FIX: Sprawdź też zbiór meczów z bazy (załadowany przy inicie / generowaniu)
  return _serverMatchKeys.has(_matchKey(disc, type, n1, n2));
}

function genId(disc, type, id1, id2) {
  return `q_${disc}_${type}_${id1}_${id2}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}

/* ── Queue rendering ────────────────────────────────────────────────────── */
function renderQueue() {
  const list  = $("pl-queue-list");
  if (!list) return;

  const filtered = plQueue.filter(m => plQueueFilter === "all" || m.disc === plQueueFilter);
  const total    = plQueue.length;

  // Update both badge elements
  [$("pl-queue-count"), $("pl-queue-count-inner")].forEach(el => { if (el) el.textContent = total; });

  if (!filtered.length) {
    list.innerHTML = `<div class="pl-queue-empty"><span>📋</span><p>Brak meczy w kolejce.<br>Kliknij „Generuj" aby dodać.</p></div>`;
    return;
  }

  list.innerHTML = "";
  filtered.forEach(match => {
    const card = document.createElement("div");
    card.className = "pl-match-card";
    card.dataset.id = match.id;
    card.draggable = true;
    card.style.setProperty("--disc-c", DISC_COLOR[match.disc] || "#6c63ff");

    const typeLabel = match.type === "liga"
      ? `📊 ${match.round || "Liga"}`
      : `🏆 ${match.round || "Puchar"}`;
    const seedInfo = match.seedLabel ? `<div class="pl-mc-seed">${match.seedLabel}</div>` : "";
    card.innerHTML = `
      <div class="pl-mc-disc">${DISC_EMOJI[match.disc] || "🏅"} ${match.disc}</div>
      <div class="pl-mc-teams">${match.team1.name}<br><small>vs</small><br>${match.team2.name}</div>
      <div class="pl-mc-meta">${typeLabel}</div>
      ${seedInfo}
    `;

    card.addEventListener("dragstart", e => {
      plDragItem = { matchId: match.id, fromCalendar: false };
      card.classList.add("pl-mc--dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => card.classList.remove("pl-mc--dragging"));
    card.addEventListener("click", () => openPlModal(match.id, false));

    list.appendChild(card);
  });
}

/* ── Calendar rendering ─────────────────────────────────────────────────── */
function renderCalendar() {
  const cal = $("pl-calendar");
  if (!cal) return;

  const days = getCalDays();
  updateCalTitle(days);

  const totalHours = CAL_END_H - CAL_START_H;

  let html = `<div class="pl-cal-inner">`;

  // ── Header row
  html += `<div class="pl-cal-header">
    <div class="pl-cal-gutter"></div>`;
  days.forEach(d => {
    const isToday = isSameDay(d, new Date());
    const dayNames = ["Nd","Pn","Wt","Śr","Cz","Pt","So"];
    html += `<div class="pl-cal-day-head ${isToday ? "pl-cal-day-head--today" : ""}">
      <span class="pl-cal-dayname">${dayNames[d.getDay()]}</span>
      <span class="pl-cal-daynum ${isToday ? "today-dot" : ""}">${d.getDate()}</span>
    </div>`;
  });
  html += `</div>`;

  // ── Time grid
  html += `<div class="pl-cal-body">
    <div class="pl-cal-time-col">`;
  for (let h = CAL_START_H; h <= CAL_END_H; h++) {
    html += `<div class="pl-cal-hour-label" style="top:${(h-CAL_START_H)*HOUR_PX}px">${String(h).padStart(2,"0")}:00</div>`;
  }
  html += `</div>`;  // end time-col

  // ── Day columns
  days.forEach(d => {
    const dateStr = fmtISODate(d);
    const isToday = isSameDay(d, new Date());
    html += `<div class="pl-cal-col ${isToday ? "pl-cal-col--today" : ""}" data-date="${dateStr}" style="height:${totalHours * HOUR_PX}px">`;

    // hour grid lines
    for (let h = CAL_START_H; h <= CAL_END_H; h++) {
      html += `<div class="pl-cal-grid-line" style="top:${(h-CAL_START_H)*HOUR_PX}px"></div>`;
    }

    // ── Availability bands ────────────────────────────────────────────────
    if (plAvailHighlight.length) {
      const dow = d.getDay();
      const slotW = 100 / plAvailHighlight.length;
      plAvailHighlight.forEach((pid, pIdx) => {
        const slots = (plAvailCache[pid] || []).filter(s => s.day_of_week === dow);
        const color = AVAIL_COLORS[pIdx % AVAIL_COLORS.length];
        const personObj = (plPeopleCache||[]).find(p => p.id === pid);
        const label = personObj ? personObj.last_name : String(pid);
        slots.forEach(s => {
          const clampStart = Math.max(s.hour_start, CAL_START_H);
          const clampEnd   = Math.min(s.hour_end,   CAL_END_H);
          if (clampEnd <= clampStart) return;
          const topPx = (clampStart - CAL_START_H) * HOUR_PX;
          const hPx   = (clampEnd   - clampStart)  * HOUR_PX;
          html += `<div class="pl-avail-band"
            style="top:${topPx}px;height:${hPx}px;--av-c:${color};left:calc(${pIdx * slotW}%);width:calc(${slotW}% - 1px)"
            title="${label}: ${String(s.hour_start).padStart(2,'0')}:00–${String(s.hour_end).padStart(2,'0')}:00"></div>`;
        });
      });
    }

    // scheduled matches for this day
    const dayMatches = [...plQueue.filter(m => m.scheduled?.date === dateStr),
                        ...plScheduled.filter(m => m.scheduled?.date === dateStr)];

    // Group by court for volleyball (up to 3 courts side by side)
    const placed = layoutMatches(dayMatches);
    placed.forEach(({ match, left, width }) => {
      const s = match.scheduled;
      const topPx = ((s.hour + s.min/60) - CAL_START_H) * HOUR_PX;
      const durPx = (s.duration / 60) * HOUR_PX;
      const inQueue = plQueue.some(q => q.id === match.id);
      const missingRef   = !match.refereeId;
      const missingClerk = !match.clerkId;
      const missingBadge = (missingRef || missingClerk) && !inQueue
        ? `<div class="pl-ev-warn" title="${[missingRef ? 'Brak sędziego' : '', missingClerk ? 'Brak protokolanta' : ''].filter(Boolean).join(', ')}">
            ${missingRef ? '<span class="pl-ev-warn-item">⚑ Sędzia</span>' : ''}
            ${missingClerk ? '<span class="pl-ev-warn-item">⚑ Protokolant</span>' : ''}
           </div>` : '';
      html += `<div class="pl-cal-event ${inQueue ? "pl-cal-event--queue" : "pl-cal-event--saved"}${(missingRef || missingClerk) && !inQueue ? " pl-cal-event--warn" : ""}"
        data-match-id="${match.id}"
        style="top:${topPx}px; height:${Math.max(durPx,28)}px; left:${left}; width:${width};
               --disc-c:${DISC_COLOR[match.disc] || "#6c63ff"}">
        <div class="pl-ev-time">${padT(s.hour)}:${padT(s.min)}${s.court ? " · B"+s.court : ""}${match.round ? ` · ${match.round}` : ""}</div>
        <div class="pl-ev-teams">${match.team1.name}<br>${match.team2.name}</div>
        ${match.seedLabel ? `<div class="pl-ev-seed">${match.seedLabel}</div>` : ""}
        ${missingBadge}
      </div>`;
    });

    html += `</div>`; // end col
  });

  html += `</div>`; // end body
  html += `</div>`; // end inner

  cal.innerHTML = html;

  // Drop zones on columns
  cal.querySelectorAll(".pl-cal-col").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("pl-col--over");

      // Calculate time at cursor
      const rect    = col.getBoundingClientRect();
      const relY    = e.clientY - rect.top + col.scrollTop;
      const fractHr = relY / HOUR_PX;
      let hour = Math.floor(CAL_START_H + fractHr);
      let min  = Math.round(((CAL_START_H + fractHr) - hour) * 60);
      if (min >= 60) { hour++; min = 0; }
      hour = Math.max(CAL_START_H, Math.min(CAL_END_H - 1, hour));
      min  = Math.max(0, Math.min(59, min));

      // Time bubble
      let bubble = col.querySelector(".pl-drag-time");
      if (!bubble) {
        bubble = document.createElement("div");
        bubble.className = "pl-drag-time";
        col.appendChild(bubble);
      }
      bubble.textContent = `${padT(hour)}:${padT(min)}`;
      bubble.style.top = `${relY - 10}px`;

      // Horizontal snap line
      let line = col.querySelector(".pl-drag-line");
      if (!line) {
        line = document.createElement("div");
        line.className = "pl-drag-line";
        col.appendChild(line);
      }
      line.style.top = `${relY}px`;
    });
    col.addEventListener("dragleave", e => {
      // Only remove if truly leaving the column (not entering a child)
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove("pl-col--over");
        col.querySelector(".pl-drag-time")?.remove();
        col.querySelector(".pl-drag-line")?.remove();
      }
    });
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("pl-col--over");
      col.querySelector(".pl-drag-time")?.remove();
      col.querySelector(".pl-drag-line")?.remove();
      if (!plDragItem) return;
      const dateStr = col.dataset.date;
      const rect    = col.getBoundingClientRect();
      const relY    = e.clientY - rect.top + col.scrollTop;
      const fractHr = relY / HOUR_PX;
      let hour = Math.floor(CAL_START_H + fractHr);
      let min  = Math.round(((CAL_START_H + fractHr) - hour) * 60);
      if (min >= 60) { hour++; min = 0; }
      hour = Math.max(CAL_START_H, Math.min(CAL_END_H - 1, hour));
      min  = Math.max(0, Math.min(59, min));

      scheduleMatch(plDragItem.matchId, dateStr, hour, min);
      plDragItem = null;
    });
  });

  // Click on events
  cal.querySelectorAll(".pl-cal-event").forEach(ev => {
    ev.addEventListener("click", e => {
      e.stopPropagation();
      const id = ev.dataset.matchId;
      const inQueue = plQueue.some(q => q.id === id);
      openPlModal(id, !inQueue);
    });
    // drag from calendar back or to other slot
    ev.draggable = true;
    ev.addEventListener("dragstart", e => {
      plDragItem = { matchId: ev.dataset.matchId, fromCalendar: true };
      ev.classList.add("pl-ev--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    });
    ev.addEventListener("dragend", () => ev.classList.remove("pl-ev--dragging"));
  });

  updateSaveBar();
}

function layoutMatches(matches) {
  if (!matches.length) return [];

  // Sort by start time
  const sorted = [...matches].sort((a, b) => {
    const sa = a.scheduled, sb = b.scheduled;
    return (sa.hour * 60 + sa.min) - (sb.hour * 60 + sb.min);
  });

  // Build overlap groups (events that overlap in time get split into columns)
  const result   = [];
  const columns  = []; // each column = array of {match, endMin}

  sorted.forEach(m => {
    const s       = m.scheduled;
    const startMin = s.hour * 60 + s.min;
    const endMin   = startMin + (s.duration || 60);

    // Find first column where this event doesn't overlap with the last one
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastEnd = columns[c][columns[c].length - 1].endMin;
      if (startMin >= lastEnd) {
        columns[c].push({ match: m, endMin });
        placed = true;
        break;
      }
    }
    if (!placed) columns.push([{ match: m, endMin }]);
  });

  // Assign widths/lefts based on column count within each overlap group
  // First find max simultaneous columns for each event
  sorted.forEach(m => {
    const s        = m.scheduled;
    const startMin = s.hour * 60 + s.min;
    const endMin   = startMin + (s.duration || 60);

    // Find which column this match is in
    let colIdx = -1;
    for (let c = 0; c < columns.length; c++) {
      if (columns[c].some(e => e.match.id === m.id)) { colIdx = c; break; }
    }

    // Count how many columns overlap with this event's time range
    const overlapCols = columns.filter(col =>
      col.some(e => {
        const es = e.match.scheduled;
        const eStart = es.hour * 60 + es.min;
        const eEnd   = eStart + (es.duration || 60);
        return eStart < endMin && eEnd > startMin;
      })
    );

    const total = overlapCols.length;
    const myCol = overlapCols.indexOf(columns[colIdx]);

    const GAP  = 3;  // px gap between columns
    const pct  = 100 / total;
    const left  = myCol === 0 ? "1px" : `calc(${myCol * pct}% + ${GAP}px)`;
    const width = total === 1
      ? "calc(100% - 2px)"
      : `calc(${pct}% - ${GAP + (myCol === 0 ? 1 : 0)}px)`;

    result.push({ match: m, left, width, total, colIdx: myCol });
  });

  return result;
}

function scheduleMatch(id, dateStr, hour, min) {
  // Find in queue first
  let match = plQueue.find(m => m.id === id);
  const fromScheduled = !match;
  if (!match) match = plScheduled.find(m => m.id === id);
  if (!match) return;

  const duration = match.scheduled?.duration || (match.disc === "Koszykówka" ? 45 : match.disc === "Siatkówka" ? 75 : 60);
  const court    = match.scheduled?.court || (match.disc === "Siatkówka" ? "1" : "");

  match.scheduled = { date: dateStr, hour, min, court, duration };
  if (match.serverId) match._dirty = true;

  if (!fromScheduled) {
    // move from queue to scheduled
    plQueue = plQueue.filter(m => m.id !== id);
    plScheduled.push(match);
    plDirtyCount++;
    updateSaveBar();
    renderQueue();
  } else {
    plDirtyCount++;
    updateSaveBar();
  }

  renderCalendar();
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
function openPlModal(id, fromCalendar) {
  let match = plQueue.find(m => m.id === id) || plScheduled.find(m => m.id === id);
  if (!match) return;
  plModalMatch = { id, fromCalendar };

  $("pl-modal-title").textContent = `${DISC_EMOJI[match.disc]} ${match.disc} · ${match.type === "liga" ? "Liga" : "Puchar"}`;
  $("pl-modal-teams").innerHTML   = `
    <div class="pl-modal-team">${match.team1.name}</div>
    <div class="pl-modal-vs">vs</div>
    <div class="pl-modal-team">${match.team2.name}</div>`;

  const s = match.scheduled || {};
  $("pl-field-date").value     = s.date     || fmtISODate(new Date());
  $("pl-field-hour").value     = s.hour     !== undefined ? s.hour : 10;
  $("pl-field-min").value      = s.min      !== undefined ? s.min  : 0;
  $("pl-field-duration").value = s.duration !== undefined ? s.duration : 60;
  $("pl-field-court").value    = s.court    || "";
  $("pl-field-referee").value  = match.refereeId  || "";
  $("pl-field-clerk").value    = match.clerkId    || "";

  // Show court select only for volleyball
  $("pl-field-court-wrap").style.display = match.disc === "Siatkówka" ? "" : "none";

  $("pl-modal-backdrop").classList.remove("hidden");
}

function closePlModal() {
  $("pl-modal-backdrop").classList.add("hidden");
  plModalMatch = null;
}

async function savePlModal() {
  if (!plModalMatch) return;
  const { id } = plModalMatch;

  const date       = $("pl-field-date").value;
  const hour       = parseInt($("pl-field-hour").value) || 0;
  const min        = parseInt($("pl-field-min").value)  || 0;
  const duration   = parseInt($("pl-field-duration").value) || 60;
  const court      = $("pl-field-court").value || "";
  const refereeId  = parseInt($("pl-field-referee").value)  || null;
  const clerkId    = parseInt($("pl-field-clerk").value)    || null;

  const scheduled = date ? { date, hour, min, court, duration } : null;

  let match = plQueue.find(m => m.id === id) || plScheduled.find(m => m.id === id);
  if (!match) { closePlModal(); return; }

  match.refereeId = refereeId;
  match.clerkId   = clerkId;
  match.scheduled = scheduled;

  // If already saved to DB — PATCH referee/clerk immediately
  if (match.serverId) {
    try {
      await supabase.from('matches').update({
          referee_id:  refereeId,
          clerk_id:    clerkId,
          match_date:  scheduled?.date   || null,
          match_time:  scheduled ? `${padT(scheduled.hour)}:${padT(scheduled.min)}:00` : null,
          status:      "Planowany",
          court:       court || null,
          duration_min: duration,
        }).eq('id', match.serverId);
    } catch(e) {
      showPlToast("✗ Błąd zapisu sędziego/protokolanta", true);
    }
    match._dirty = false;
  } else {
    match._dirty = true;
  }

  // Move between lists
  const inQueue = plQueue.some(m => m.id === id);
  if (inQueue && scheduled) {
    plQueue = plQueue.filter(m => m.id !== id);
    plScheduled.push(match);
  } else if (!inQueue && !scheduled) {
    plScheduled = plScheduled.filter(m => m.id !== id);
    plQueue.push(match);
  }

  plDirtyCount++;
  closePlModal();
  renderCalendar();
  renderQueue();
  updateSaveBar();
}

function removeFromModal() {
  // Show confirm panel instead of acting immediately
  showPlDeleteConfirm();
}

function showPlDeleteConfirm() {
  const panel = $("pl-confirm-panel");
  if (panel) panel.classList.remove("hidden");
}

function hidePlDeleteConfirm() {
  const panel = $("pl-confirm-panel");
  if (panel) panel.classList.add("hidden");
}

async function deletePlMatch() {
  if (!plModalMatch) return;
  const { id } = plModalMatch;
  const match = [...plQueue, ...plScheduled].find(m => m.id === id);
  if (!match) { closePlModal(); return; }

  // If saved to server — DELETE from DB
  if (match.serverId) {
    try {
      const { error: delMErr } = await supabase.from('matches').delete().eq('id', match.serverId);
      if (delMErr) throw new Error(delMErr.message);
    } catch(e) {
      showPlToast("✗ Błąd usuwania meczu z bazy", true);
      hidePlDeleteConfirm();
      return;
    }
  }

  plQueue     = plQueue.filter(m => m.id !== id);
  plScheduled = plScheduled.filter(m => m.id !== id);

  hidePlDeleteConfirm();
  closePlModal();
  renderCalendar();
  renderQueue();
  updateSaveBar();
  showPlToast("🗑 Mecz usunięty");
}

async function unschedulePlMatch() {
  if (!plModalMatch) return;
  const { id } = plModalMatch;
  const match = plScheduled.find(m => m.id === id) || plQueue.find(m => m.id === id);
  if (!match) { closePlModal(); return; }

  // Clear date/time in DB if saved
  if (match.serverId) {
    try {
      const { error: unschErr } = await supabase.from('matches').update(
        { match_date: null, match_time: null, status: "Planowany" }
      ).eq('id', match.serverId);
      if (unschErr) throw new Error(unschErr.message);
    } catch(e) {
      showPlToast("✗ Błąd cofania przypisania", true);
      return;
    }
  }

  // Move to queue, clear scheduled
  plScheduled = plScheduled.filter(m => m.id !== id);
  match.scheduled = null;
  match._dirty = false;
  if (!plQueue.some(m => m.id === id)) plQueue.push(match);

  closePlModal();
  renderCalendar();
  renderQueue();
  updateSaveBar();
  showPlToast("↩ Mecz cofnięty do kolejki");
}

/* ── Save all to server ─────────────────────────────────────────────────── */
async function saveAllToServer() {
  // Save new matches without serverId (both queued and scheduled)
  const allMatches = [...plQueue, ...plScheduled];
  const toCreate   = allMatches.filter(m => !m.serverId);
  const toUpdate   = allMatches.filter(m => m.serverId && m._dirty);

  if (!toCreate.length && !toUpdate.length) {
    showPlToast("ℹ Brak zmian do zapisania");
    return;
  }

  const btn = $("pl-save-all-btn") || $("pl-save-bar-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Zapisywanie…"; }

  let ok = 0, fail = 0;

  // CREATE new
  for (const m of toCreate) {
    const s = m.scheduled;
    const body = {
      discipline:  m.disc,
      match_type:  m.type,
      team1_id:    m.team1.id,
      team2_id:    m.team2.id,
      match_date:  s?.date   || null,
      match_time:  s ? `${padT(s.hour)}:${padT(s.min)}:00` : null,
      status:      "Planowany",
      court:       s?.court  || null,
      duration_min: s?.duration || 60,
      cup_round:   m.cup_round || null,
    };
    try {
      const { data: saved, error: insErr } = await supabase.from('matches').insert(body).select().single();
      if (insErr) throw new Error(insErr.message);
      m.serverId = saved.id;
      // P4 FIX: zarejestruj w _serverMatchKeys po udanym zapisie
      _serverMatchKeys.add(_matchKey(m.disc, m.type, m.team1.id, m.team2.id));
      ok++;
    } catch(e) {
      console.error("Save match error:", e);
      fail++;
    }
  }

  // UPDATE existing with new date/time (dirty flag)
  for (const m of toUpdate) {
    const s = m.scheduled;
    const body = {
      match_date:  s?.date   || null,
      match_time:  s ? `${padT(s.hour)}:${padT(s.min)}:00` : null,
      status:      "Planowany",
      court:       s?.court  || null,
      duration_min: s?.duration || 60,
    };
    try {
      const { error: updErr } = await supabase.from('matches').update(body).eq('id', m.serverId);
      if (updErr) throw new Error(updErr.message);
      m._dirty = false;
      ok++;
    } catch(e) {
      console.error("Update match error:", e);
      fail++;
    }
  }

  plDirtyCount = 0;
  updateSaveBar();
  if (btn) { btn.disabled = false; btn.textContent = "💾 Zapisz zmiany"; }
  renderCalendar();
  renderQueue();

  showPlToast(fail ? `✓ Zapisano ${ok}, błąd ${fail}` : `✓ Zapisano ${ok} meczy!`, !!fail);
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function getCalDays() {
  if (plCalView === "week") {
    const start = weekStart(plCalDate);
    return Array.from({length:7}, (_,i) => addDays(start, i));
  }
  return [new Date(plCalDate)];
}

function updateCalTitle(days) {
  const el = $("pl-cal-title");
  if (!el) return;
  if (days.length === 1) {
    el.textContent = days[0].toLocaleDateString("pl-PL", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  } else {
    const a = days[0], b = days[6];
    el.textContent = `${a.getDate()} – ${b.getDate()} ${b.toLocaleDateString("pl-PL",{month:"long",year:"numeric"})}`;
  }
}

function updateSaveBar() {
  const allMatches = [...plQueue, ...plScheduled];
  const unsaved = allMatches.filter(m => !m.serverId || m._dirty).length;
  const bar = $("pl-save-bar");
  if (!bar) return;
  const countEl = $("pl-unsaved-count");
  if (countEl) countEl.textContent = unsaved;
  bar.classList.remove("hidden");
  bar.classList.toggle("pl-save-bar--visible", unsaved > 0);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function fmtISODate(d) {
  return `${d.getFullYear()}-${padT(d.getMonth()+1)}-${padT(d.getDate())}`;
}

function padT(n) { return String(n).padStart(2,"0"); }

function showPlToast(msg, isError = false) {
  const t = $("toast-pl");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${isError ? "toast-error" : "toast-ok"}`;
  clearTimeout(showPlToast._t);
  showPlToast._t = setTimeout(() => t.classList.add("hidden"), 3200);
}

/* ── Generator kolejnej rundy pucharu ───────────────────────────────────── */
async function generateNextCupRound(disc, fromRound, toRound) {
  const all = await api(`/matches?discipline=${encodeURIComponent(disc)}&match_type=puchar`) || [];

  // Synchronizuj _serverMatchKeys z aktualną odpowiedzią serwera,
  // żeby matchExists() działało nawet gdy Planowanie nie było otwarte
  all.forEach(m => _serverMatchKeys.add(_matchKey(m.discipline || disc, m.match_type || "puchar", m.team1_id, m.team2_id)));

  const allRoundMatches = all.filter(m => m.cup_round === fromRound);

  if (!allRoundMatches.length) {
    return {
      added: 0,
      error: `Brak meczów rundy "${fromRound}" dla ${disc}. Czy generowanie rundy zostało wykonane?`,
    };
  }

  // BUGFIX BUG-4: sprawdź czy wszystkie mecze rundy są zakończone
  const unfinished = allRoundMatches.filter(
    m => m.status !== "Rozegrany" && m.status !== "Walkower" && m.status !== "Odwołany"
  );
  if (unfinished.length > 0) {
    const names = unfinished.map(m => `${m.team1_name} – ${m.team2_name}`).join(", ");
    return {
      added: 0,
      error: `Runda "${fromRound}" nie jest zakończona. Nierozegrane mecze (${unfinished.length}): ${names}.`,
    };
  }

  const playedMatches = allRoundMatches.filter(m => m.status === "Rozegrany");
  if (!playedMatches.length) {
    return {
      added: 0,
      error: `Brak rozegranych meczów w rundzie "${fromRound}" (wszystkie odwołane lub walkower).`,
    };
  }

  // Wyłoń zwycięzców — z obsługą remisów (BUGFIX BUG-5)
  const winners      = [];
  const drawWarnings = [];

  for (const m of playedMatches) {
    const eff1 = m.shootout_t1 != null ? Number(m.shootout_t1) : Number(m.score_t1 ?? -1);
    const eff2 = m.shootout_t2 != null ? Number(m.shootout_t2) : Number(m.score_t2 ?? -1);

    if (eff1 < 0 || eff2 < 0) {
      drawWarnings.push(`${m.team1_name} – ${m.team2_name}: brak wyniku`);
      continue;
    }

    if (eff1 > eff2) {
      winners.push({ id: m.team1_id, team_name: m.team1_name });
    } else if (eff2 > eff1) {
      winners.push({ id: m.team2_id, team_name: m.team2_name });
    } else {
      // BUGFIX BUG-5: remis bez rzutów karnych — zbieramy, nie pomijamy
      drawWarnings.push(`${m.team1_name} – ${m.team2_name}: remis ${eff1}:${eff2} (brak rzutów karnych!)`);
    }
  }

  if (drawWarnings.length > 0) {
    return {
      added: 0,
      error: `Nie można generować rundy "${toRound}" — nierozstrzygnięte mecze (${drawWarnings.length}):`,
      warnings: drawWarnings,
    };
  }

  if (winners.length < 2) {
    return {
      added: 0,
      error: `Za mało zwycięzców rundy "${fromRound}" (${winners.length}). Sprawdź wyniki meczów.`,
    };
  }

  // Ostrzeżenie o BYE przy nieparzystej liczbie zwycięzców
  const byeWarnings = [];
  if (winners.length % 2 !== 0) {
    byeWarnings.push(
      `Nieparzysta liczba zwycięzców (${winners.length}) — drużyna ` +
      `"${winners[winners.length - 1].team_name}" automatycznie awansuje (wolny los / BYE).`
    );
  }

  let added = 0;
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const t1 = winners[i], t2 = winners[i + 1];
    if (matchExists(disc, "puchar", t1.id, t2.id)) continue;

    plQueue.push({
      id: genId(disc, "puchar", t1.id, t2.id),
      disc, type: "puchar",
      team1: { id: t1.id, name: t1.team_name },
      team2: { id: t2.id, name: t2.team_name },
      label: `${t1.team_name} – ${t2.team_name}`,
      seedLabel: `Zwycięzca pary ${i/2 + 1} vs Zwycięzca pary ${i/2 + 2}`,
      round: toRound, cup_round: toRound,
      scheduled: null, _new: true,
    });
    added++;
  }

  return { added, warnings: byeWarnings };
}

// Eksponuj dla wizarda — otwórz modal generatora kolejnej rundy
async function openNextCupRoundModal() {
  // BUGFIX BUG-8: /tournament-format zwraca obiekt, nie tablicę
  const fmtMap   = normFmt(await api("/tournament-format"));
  const eligible = Object.values(fmtMap).filter(f => f.has_cup);
  if (!eligible.length) {
    showPlToast("Żadna dyscyplina nie ma włączonego pucharu.", true);
    return;
  }

  // UX-1: pobierz mecze pucharowe dla wszystkich dyscyplin jednorazowo
  const allCupMatchesByDisc = {};
  await Promise.all(eligible.map(async f => {
    const matches = await api(`/matches?discipline=${encodeURIComponent(f.discipline)}&match_type=puchar`) || [];
    allCupMatchesByDisc[f.discipline] = matches;
  }));

  // UX-1: wskaźnik gotowości rundy — ile meczów ukończonych
  function buildRoundReadiness(disc, roundName) {
    const matches      = allCupMatchesByDisc[disc] || [];
    const roundMatches = matches.filter(m => m.cup_round === roundName);
    if (!roundMatches.length) {
      return { html: `<span style="color:var(--muted);font-size:.75rem">brak meczów</span>`, ready: false };
    }
    const done  = roundMatches.filter(m => m.status === "Rozegrany" || m.status === "Walkower").length;
    const total = roundMatches.length;
    const allDone = done === total;
    const color = allDone ? "var(--success,#22c55e)" : "var(--warning,#f59e0b)";
    return {
      html:  `<span style="font-size:.75rem;color:${color}">${allDone ? "✅" : "⏳"} ${done}/${total} meczów ukończonych</span>`,
      ready: allDone,
    };
  }

  const modal = document.createElement("div");
  modal.id = "pl-next-cup-backdrop";
  modal.className = "pl-gen-backdrop";

  // Kolejność rund pucharowych (musi być spójna z svEndLeague i admin-sport.js)
  const CUP_ROUND_ORDER = ['1/16','1/8','1/4','Półfinał','Finał'];
  function parseCupRounds(raw) {
    const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
    return [...arr].sort((a, b) => {
      const ai = CUP_ROUND_ORDER.indexOf(a); const bi = CUP_ROUND_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  const discOptions = eligible.map(f => {
    const cupRounds = parseCupRounds(f.cup_rounds);
    const roundOpts = cupRounds.map((r, i) => `<option value="${i}">${r}</option>`).join("");
    const firstReadiness = cupRounds[0] ? buildRoundReadiness(f.discipline, cupRounds[0]) : { html: "", ready: false };
    return `
      <div class="pl-gen-block" style="padding:.75rem 1rem;margin-bottom:.5rem">
        <strong>${f.discipline}</strong>
        <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;flex-wrap:wrap">
          <label style="font-size:.82rem">Z rundy:</label>
          <select class="pl-nc-from" data-disc="${f.discipline}" data-rounds='${JSON.stringify(cupRounds)}' style="font-size:.82rem;padding:.25rem">
            ${roundOpts}
          </select>
          <span class="pl-nc-readiness" data-disc="${f.discipline}" style="min-width:140px">${firstReadiness.html}</span>
          <label style="font-size:.82rem">→ Do rundy:</label>
          <select class="pl-nc-to" data-disc="${f.discipline}" style="font-size:.82rem;padding:.25rem">
            ${roundOpts}
          </select>
          <button class="dc-save-btn pl-nc-gen-btn" data-disc="${f.discipline}"
                  style="padding:.3rem .7rem;font-size:.82rem"
                  ${!firstReadiness.ready ? `disabled title="Najpierw ukończ mecze bieżącej rundy"` : ""}>
            Generuj
          </button>
          <span class="pl-nc-result" style="font-size:.8rem;color:var(--muted)"></span>
        </div>
      </div>`;
  }).join("");

  modal.innerHTML = `
    <div class="pl-gen-modal" style="max-width:580px">
      <div class="pl-gen-modal-header">
        <span>⏭ Generuj kolejną rundę pucharu</span>
        <button class="pl-gen-close" id="pl-nc-close">✕</button>
      </div>
      <div class="pl-gen-modal-body">
        <p style="margin:.25rem 0 .75rem;font-size:.85rem;color:var(--muted)">
          Zbiera zwycięzców wybranej rundy i tworzy mecze kolejnej rundy w kolejce.
          Przycisk "Generuj" odblokuje się gdy wszystkie mecze rundy źródłowej są ukończone.
        </p>
        ${discOptions}
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.classList.remove("hidden");
  modal.querySelector("#pl-nc-close").onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  // UX-1: aktualizuj wskaźnik gotowości i stan przycisku po zmianie rundy
  modal.querySelectorAll(".pl-nc-from").forEach(sel => {
    sel.addEventListener("change", () => {
      const disc      = sel.dataset.disc;
      const rounds    = parseCupRounds(JSON.parse(sel.dataset.rounds || "[]"));
      const toSel     = modal.querySelector(`.pl-nc-to[data-disc="${disc}"]`);
      const genBtn    = modal.querySelector(`.pl-nc-gen-btn[data-disc="${disc}"]`);
      const readEl    = modal.querySelector(`.pl-nc-readiness[data-disc="${disc}"]`);
      toSel.value     = Math.min(parseInt(sel.value) + 1, toSel.options.length - 1);
      const selRound  = rounds[parseInt(sel.value)];
      if (selRound) {
        const r = buildRoundReadiness(disc, selRound);
        readEl.innerHTML  = r.html;
        genBtn.disabled   = !r.ready;
        genBtn.title      = r.ready ? "" : "Najpierw ukończ mecze bieżącej rundy";
      }
    });
    // Init selektora "do"
    const disc  = sel.dataset.disc;
    const toSel = modal.querySelector(`.pl-nc-to[data-disc="${disc}"]`);
    sel.value   = 0;
    toSel.value = Math.min(1, toSel.options.length - 1);
  });

  modal.querySelectorAll(".pl-nc-gen-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const disc      = btn.dataset.disc;
      const fromSel   = modal.querySelector(`.pl-nc-from[data-disc="${disc}"]`);
      const toSel     = modal.querySelector(`.pl-nc-to[data-disc="${disc}"]`);
      const rounds    = JSON.parse(fromSel.dataset.rounds || "[]");
      const fromRound = rounds[parseInt(fromSel.value)];
      const toRound   = rounds[parseInt(toSel.value)];
      const resultEl  = btn.nextElementSibling;

      if (!fromRound || !toRound) { resultEl.textContent = "Brak rund."; return; }
      if (fromRound === toRound)  { resultEl.textContent = "Wybierz różne rundy."; return; }

      btn.disabled    = true;
      btn.textContent = "…";
      resultEl.textContent = "";

      // UX-2: generateNextCupRound zwraca obiekt { added, error?, warnings? }
      const result = await generateNextCupRound(disc, fromRound, toRound);
      btn.textContent = "Generuj";

      if (result.error) {
        btn.disabled = false;
        resultEl.style.color = "var(--danger,#ef4444)";
        let html = `❌ ${result.error}`;
        if (result.warnings?.length) {
          html += `<ul style="margin:.25rem 0 0 1rem;font-size:.78rem">` +
            result.warnings.map(w => `<li>${w}</li>`).join("") + `</ul>`;
        }
        resultEl.innerHTML = html;
      } else if (result.added > 0) {
        // ── Zapisz nowe mecze bezpośrednio na serwer ─────────────────────
        resultEl.style.color = "var(--muted)";
        resultEl.textContent = "💾 Zapisuję na serwer…";

        const newMatches = plQueue.filter(m => m._new && !m.serverId && m.disc === disc && m.type === "puchar" && m.cup_round === toRound);
        let saved = 0, saveFail = 0;

        for (const m of newMatches) {
          try {
            const { data: cupData, error: cupErr } = await supabase.from('matches').insert({
                discipline:  m.disc,
                match_type:  'puchar',
                cup_round:   m.cup_round,
                team1_id:    m.team1.id,
                team2_id:    m.team2.id,
                status:      'Planowany',
              }).select().single();
            if (cupErr) throw new Error(cupErr.message);
            m.serverId = cupData.id;
            m._new     = false;
            _serverMatchKeys.add(_matchKey(m.disc, m.type, m.team1.id, m.team2.id));
            saved++;
          } catch(e) {
            console.error("Save cup match error:", e);
            saveFail++;
          }
        }

        btn.disabled = false;

        // ── Odśwież widok sportowy drabinki ──────────────────────────────
        if (typeof loadSportView === "function") {
          loadSportView(disc);
        }

        renderQueue();
        updateSaveBar();

        // ── Komunikat końcowy ─────────────────────────────────────────────
        resultEl.style.color = saveFail === 0 ? "var(--success,#22c55e)" : "var(--warning,#f59e0b)";
        let html = saveFail === 0
          ? `✅ ${saved} meczów rundy <strong>${toRound}</strong> zapisanych — drabinka odświeżona`
          : `⚠ Zapisano ${saved}/${saved + saveFail} meczów (${saveFail} błędów)`;
        if (result.warnings?.length) {
          html += `<br><span style="color:var(--warning,#f59e0b);font-size:.78rem">` +
            result.warnings.join(" · ") + `</span>`;
        }
        resultEl.innerHTML = html;
      } else {
        btn.disabled = false;
        resultEl.style.color = "var(--muted)";
        resultEl.textContent = "ℹ Brak nowych meczów do dodania (wszystkie już istnieją).";
      }
    });
  });
}