// QMEC v2 - ui.js
// Render de pantallas, marcador, ranking, podio, contador de aciertos en vivo,
// toggle Mostrar/Ocultar frase, progreso de ronda y utilidades de accesibilidad.

// ---- Navegacion de pantallas ----
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(screenId);
    if (el) el.classList.add("active");
}

// ---- Marcador (A4: escapar nombres en TODOS los innerHTML) ----
function updateScoreboard() {
    const container = document.getElementById("scoreboardTeams");
    if (!container) return;
    const activeTeam = gameState.teams[gameState.currentTeamIndex];
    container.innerHTML = gameState.teams.map(team => {
        const isActive = team === activeTeam;
        const pts = gameState.totalScores[team] || 0;
        const guin = gameState.guiner[team] || 0;
        const label = teamLabel(team); // "Equipo N · Nombre"
        return `
            <div class="scoreboard-team ${isActive ? "active" : ""}">
                <div class="scoreboard-name" title="${esc(team)}">${esc(label)}</div>
                <div class="scoreboard-points">${pts}</div>
                <div class="scoreboard-guiner">🏆 ${guin}</div>
            </div>
        `;
    }).join("");
}

// ---- Progreso de ronda (C2: los puntos SÍ se mueven) ----
function updateRoundProgress() {
    const container = document.getElementById("roundProgress");
    if (!container) return;
    const dots = container.querySelectorAll(".round-dot");
    dots.forEach((dot, idx) => {
        // La ronda actual (1..10) corresponde al indice currentRound-1
        if (idx === gameState.currentRound - 1) {
            dot.classList.add("active");
        } else {
            dot.classList.remove("active");
        }
    });
}

function setupRoundProgress() {
    const container = document.getElementById("roundProgress");
    if (!container) return;
    container.innerHTML = "";
    const rounds = gameState.totalRounds || TOTAL_ROUNDS;
    for (let i = 0; i < rounds; i++) {
        const dot = document.createElement("div");
        dot.className = "round-dot";
        dot.id = `dot-${i}`;
        container.appendChild(dot);
    }
    updateRoundProgress();
}

// ---- Contador de aciertos en vivo (B2) ----
function setLiveHits(n) {
    const el = document.getElementById("liveHits");
    if (el) el.textContent = `Aciertos: ${n}`;
}

// ---- Vibration helper (mejora) ----
function vibrate(ms) {
    try {
        if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
}

// ---- Ranking fin de ronda (A4: escapar) ----
function updateRoundEndRanking() {
    const ranking = Object.entries(gameState.totalScores)
        .sort((a, b) => b[1] - a[1])
        .map((entry, idx) => ({ name: entry[0], points: entry[1], pos: idx + 1 }));

    const container = document.getElementById("roundEndRanking");
    if (!container) return;
    container.innerHTML = ranking.map(item => `
        <div class="ranking-item">
            <span class="ranking-position">#${item.pos}</span>
            <span class="ranking-name">${esc(teamLabel(item.name))}</span>
            <span class="ranking-points">${item.points}pts</span>
        </div>
    `).join("");
}

// ---- Podio final (A4: escapar) ----
function renderPodio(ranking) {
    const podiumContainer = document.getElementById("podiumContainer");
    if (!podiumContainer) return;
    podiumContainer.innerHTML = "";
    const medals = ["🥇", "🥈", "🥉"];
    const podiumClasses = ["first", "second", "third"];
    // Podio de 3 (oro/plata/bronce) por PUNTOS totales (criterio de victoria)
    ranking.slice(0, 3).forEach((entry, idx) => {
        const name = entry.name;
        const pts = entry.pts;
        const guin = entry.guin || 0;
        const div = document.createElement("div");
        div.className = "podium-place";
        div.innerHTML = `
            <div class="podium-medal">${medals[idx]}</div>
            <div class="podium-name">${esc("" + (idx + 1) + ". " + teamLabel(name))}</div>
            <div class="podium-bar ${podiumClasses[idx]}">${pts}</div>
            <div class="podium-guiner">🎯 ${guin}</div>
        `;
        podiumContainer.appendChild(div);
    });

    // Lista completa de TODOS los equipos con sus puntos y güiner
    const teamsBox = document.querySelector(".final-teams");
    if (teamsBox) {
        teamsBox.innerHTML = "";
        const title = document.createElement("div");
        title.className = "final-teams-title";
        title.textContent = "Puntos por equipo";
        teamsBox.appendChild(title);
        ranking.forEach((entry, idx) => {
            const row = document.createElement("div");
            row.className = "final-team-row";
            row.innerHTML = `
                <span class="final-team-pos">${idx + 1}</span>
                <span class="final-team-name">${esc(teamLabel(entry.name))}</span>
                <span class="final-team-pts">${entry.pts}</span>
                <span class="final-team-guin">🎯 ${entry.guin || 0}</span>
            `;
            teamsBox.appendChild(row);
        });
    }
}

// ---- Resumen del turno (frases acertadas/falladas + correccion) ----
// Las tarjetas se muestran EN EL ORDEN EN QUE SALIERON durante el turno
// (decision de Hector 2026-08-24: el barajado aqui generaba caos al corregir).
function renderTurnSummary() {
    const list = document.getElementById("turnSummaryList");
    if (!list) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    document.getElementById("turnSummaryTeam").textContent = teamLabel(team); // "Equipo N · Nombre"
    document.getElementById("turnSummaryPoints").textContent = gameState.turnPoints || 0;

    list.innerHTML = "";
    gameState.turnHistory.forEach((item, idx) => {
        const isCorrect = item.correct === true;
        const isPending = item.correct === null;
        const row = document.createElement("div");
        row.className = "turn-summary-item " + (isCorrect ? "ok" : "miss");
        row.innerHTML = `
            <span class="turn-summary-icon">${isCorrect ? "✔" : (isPending ? "·" : "✖")}</span>
            <span class="turn-summary-phrase">${esc(item.phrase.texto)}</span>
            <button type="button" class="turn-summary-toggle" onclick="toggleTurnResult(${idx})" aria-label="Corregir">🔄</button>
        `;
        list.appendChild(row);
    });
}

// ---- Confirmacion al salir con partida en curso (C6) ----
function maybeConfirmExit() {
    if (gameState.isRunning || gameState.roundStarted) {
        return window.confirm("¿Seguro que quieres salir? La partida en curso se perderá.");
    }
    return true;
}

if (typeof module !== "undefined") {
    module.exports = {
        showScreen, updateScoreboard, updateRoundProgress, setupRoundProgress,
        setLiveHits, vibrate,
        updateRoundEndRanking, renderPodio, maybeConfirmExit, renderTurnSummary
    };
}
