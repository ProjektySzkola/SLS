/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadUpcomingMatches(),
    loadRecentResults(),
  ]);
}

async function loadStats() {
  const [teams, allMatches] = await Promise.all([
    api("/teams"),
    api("/matches"),
  ]);

  if (teams) {
    $("stat-teams").textContent = teams.length;
    const totalPlayers = teams.reduce((s, t) => s + (t.player_count || 0), 0);
    $("stat-players").textContent = totalPlayers;
  }

  if (allMatches) {
    const planned = allMatches.filter(m => m.status === "Planowany").length;
    const played  = allMatches.filter(m => m.status === "Rozegrany").length;
    $("stat-planned").textContent = planned;
    $("stat-played").textContent  = played;
  }
}

async function loadUpcomingMatches() {
  const data = await api("/matches");
  const c = $("upcoming-matches");
  if (!data) { c.innerHTML = `<div class="panel-loading">Błąd ładowania</div>`; return; }

  const upcoming = data
    .filter(m => m.status === "Planowany")
    .slice(0, 6);

  if (!upcoming.length) {
    c.innerHTML = `<div class="panel-loading">Brak zaplanowanych meczów</div>`;
    return;
  }

  c.innerHTML = "";
  upcoming.forEach(m => c.appendChild(buildDashMatchRow(m, false)));
}

async function loadRecentResults() {
  const data = await api("/matches?status=Rozegrany");
  const c = $("recent-results");
  if (!data) { c.innerHTML = `<div class="panel-loading">Błąd ładowania</div>`; return; }

  const recent = data.slice(-6).reverse();

  if (!recent.length) {
    c.innerHTML = `<div class="panel-loading">Brak rozegranych meczów</div>`;
    return;
  }

  c.innerHTML = "";
  recent.forEach(m => c.appendChild(buildDashMatchRow(m, true)));
}

function buildDashMatchRow(m, showScore) {
  const row = el("div","dash-match dash-match--clickable");
  row.dataset.matchId = m.id;
  const discClass = DISC_CLASS[m.discipline] || "";
  const discEmoji = DISC_EMOJI[m.discipline] || "";
  const scoreHtml = showScore
    ? `<span class="dm-score">${fmtScore(m)}</span>`
    : `<span class="dm-date">${fmtDate(m.match_date)}${m.match_time ? " " + fmtTime(m.match_time) : ""}</span>`;

  row.innerHTML = `
    <span class="dm-disc ${discClass}">${discEmoji}</span>
    <div class="dm-teams">
      <span>${m.team1_name}</span>
      <span class="dm-vs">vs</span>
      <span>${m.team2_name}</span>
    </div>
    ${scoreHtml}
    <span class="status-badge status-${m.status}">${m.status}</span>
    <span class="dm-goto" title="Otwórz szczegóły meczu">→</span>
  `;
  row.addEventListener("click", () => navigateToMatch(m.id));
  return row;
}