// QMEC v2 - juego.js
// Logica de partida. Incluye:
//  - REGLA NUEVA: el modificador se elige UNA sola vez al inicio del turno y
//    se mantiene fijo durante TODO el turno (no se re-rolla por frase).
//  - A1: mazo shuffle bag (Fisher-Yates) sin bucle infinito.
//  - A2: assignGuiners() SIEMPRE al acabar ronda (incluida la 10).
//  - A3: guards isRunning/roundStarted; timer anclado a Date.now (sin dobles
//    intervalos); pauseGame cancela pre-turn timeout y deshabilita botones.
//  - A4: nombres escapados en los innerHTML (en ui.js).
//  - B1: un solo boton 30s por equipo en setup.
//  - B2: contador de aciertos en vivo.
//  - B3: toggle Mostrar/Ocultar frase.
//  - B4: fin de turno sin carrera (roundStarted=false antes de sumar;
//    markCorrect/markPass comprueban timeLeft>0).
//  - B5: resetGame limpia intervalos y timeouts pendientes.
//  - C2: dots de progreso que se mueven.
//  - C5/C6/C7 + mejoras (prefers-reduced-motion en CSS, vibrate, aria-live,
//    nombres duplicados con IDs estables, oninput slider, focus-visible).

// preTurnTimeout: timeout de 2s que muestra el modificador antes de iniciar
// la cuenta atras. Debe poder cancelarse en pausa/reset (A3, B5).
let preTurnTimeout = null;
let pausedBeforeStart = false;

// Tiempo seleccionado en el setup por equipo (indice 1..N)
let setupTimes = {};
// Limite de descartes por turno elegido en el setup por equipo (0..5 | Infinity)
let setupDiscards = {};
// Orden de juego de los equipos: "manual" (orden de escritura) | "random" (barajado)
let setupOrderMode = "manual";

// ---- Helpers de botones de accion ----
function disableActionButtons(disabled) {
    const c = document.getElementById("btnCorrect");
    const p = document.getElementById("btnPass");
    const d = document.getElementById("btnDiscard");
    if (c) c.disabled = disabled;
    if (p) p.disabled = disabled;
    if (d) d.disabled = disabled;
}

function updatePauseButton(paused) {
    const b = document.getElementById("pauseBtn");
    if (!b) return;
    b.textContent = paused ? "▶" : "⏸";
    b.setAttribute("aria-label", paused ? "Reanudar" : "Pausar");
}

// ---- Mazo shuffle bag (A1) ----
function refillBag() {
    gameState.phraseBag = FRASES.slice();
    for (let i = gameState.phraseBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = gameState.phraseBag[i];
        gameState.phraseBag[i] = gameState.phraseBag[j];
        gameState.phraseBag[j] = tmp;
    }
}

function showNextPhrase() {
    if (gameState.phraseBag.length === 0) {
        refillBag();
    }
    gameState.currentPhrase = gameState.phraseBag.pop();
    // Registro para el resumen del turno (pendiente: null -> se resuelve al pulsar)
    gameState.turnHistory.push({ phrase: gameState.currentPhrase, correct: null, discarded: false });
    displayPhrase(); // NO cambia el modificador (regla nueva)
}

// ---- Modificador (REGLA NUEVA: fijo por turno; lo decide el DADO) ----
function displayModifier() {
    const m = gameState.currentModifier;
    if (!m) return;
    const disp = document.getElementById("modifierDisplay");
    document.getElementById("modifierEmoji").textContent = m.emoji;
    document.getElementById("modifierName").textContent = m.name;
    document.getElementById("modifierDesc").textContent = modifierDescription(m);
    if (disp) disp.style.display = "block";
}

// Descripcion dinamica: en AEIOU se muestra la vocal elegida para el turno
// (a/e/i/o/u aleatoria), no siempre la "a" (mejora 2026-08-25).
function modifierDescription(m) {
    if (!m) return "";
    if (m.type === "vowels") {
        const v = gameState.aeiouVowel || "a";
        return `Cambia todas las vocales por la vocal «${v.toUpperCase()}»`;
    }
    return m.desc;
}

function displayPhrase() {
    // El modificador ya esta fijado para el turno; solo actualizamos la frase.
    const phrase = gameState.currentPhrase;
    document.getElementById("phraseText").textContent = phrase;
}

// ---- Temporizador display ----
function updateTimerDisplay(remSec, totalSec) {
    const display = document.getElementById("timerDisplay");
    const bar = document.getElementById("timerBar");
    const total = Math.max(1, totalSec);
    const secs = Math.max(0, remSec);
    const mm = Math.floor(secs / 60);
    const ss = Math.floor(secs % 60);
    display.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

    const pct = Math.max(0, Math.min(100, (secs / total) * 100));
    bar.style.width = pct + "%";

    display.classList.remove("warning", "critical");
    const criticalT = total * 0.17;
    const warningT = total * 0.33;
    if (secs <= criticalT) display.classList.add("critical");
    else if (secs <= warningT) display.classList.add("warning");
}

// ---- Pre-turn: muestra modificador 2s antes de iniciar cuenta atras ----
function schedulePreTurn() {
    if (preTurnTimeout !== null) clearTimeout(preTurnTimeout);
    preTurnTimeout = setTimeout(() => {
        preTurnTimeout = null;
        if (!gameState.isRunning) return; // pausado/reset durante la intro
        gameState.roundStarted = true;
        setPhraseVisible(true);
        Temporizador.start(gameState.totalTime, {
            onTick: (remSec, totalSec) => updateTimerDisplay(remSec, totalSec),
            onEnd: () => endTurn()
        });
    }, 2000);
}

// ---- Inicio de turno ----
function startNewTurn() {
    const team = gameState.teams[gameState.currentTeamIndex];
    // teamTimes se guarda en DECISEGUNDOS (150/300/450/600 = 15/30/45/60s);
    // el Temporizador espera SEGUNDOS -> convertir aqui (fix unidades 2026-08-24).
    gameState.totalTime = (gameState.teamTimes[team] || 300) / 10;
    gameState.timeLeft = gameState.totalTime;
    // Mostrar el tiempo CONFIGURADO del turno desde el inicio (antes arrancaba
    // el marcador con el default 00:30 hasta que el timer tomaba el control).
    updateTimerDisplay(gameState.totalTime, gameState.totalTime);
    gameState.isRunning = false;   // aun no corre: esperamos al dado
    gameState.roundStarted = false;
    gameState.roundScores[team] = 0;
    // NOTA: el mazo (phraseBag) es GLOBAL de la partida: se baraja UNA vez
    // al inicio (startGame) y solo se re-mezcla cuando se agotan todas las
    // tarjetas (refillBag dentro de showNextPhrase). NO se resetea por turno.
    gameState.turnHistory = [];
    gameState.turnPoints = 0;

    document.getElementById("teamName").textContent = teamLabel(team); // "Equipo N · Nombre" (seguro)
    document.getElementById("currentRound").textContent = gameState.currentRound;

    updateScoreboard();
    updateRoundProgress();

    setLiveHits(0);
    setPhraseVisible(true);
    disableActionButtons(true);
    updatePauseButton(false);

    // 🎲 El jugador LANZA el dado para elegir el modificador de este turno
    showDiceScreen(team);

    persistState();
}

// ---- Dado de modificador (el jugador lanza; resultado TOTALMENTE aleatorio) ----
let diceInterval = null;

function showDiceScreen(team) {
    document.getElementById("diceTeamName").textContent = teamLabel(team); // "Equipo N · Nombre"
    // Indicar la ronda actual del total (mejora 2026-08-25)
    const roundInfo = document.getElementById("diceRoundInfo");
    if (roundInfo) roundInfo.textContent = `RONDA ${gameState.currentRound}/${gameState.totalRounds}`;
    document.getElementById("diceFace").textContent = "🎲";
    document.getElementById("diceFace").classList.remove("rolling");
    document.getElementById("rollBtn").style.display = "";
    document.getElementById("rollBtn").disabled = false;
    document.getElementById("diceResult").style.display = "none";
    showScreen("screenDice");
}

function rollModifier() {
    const btn = document.getElementById("rollBtn");
    if (btn.disabled) return;
    btn.disabled = true;
    const face = document.getElementById("diceFace");
    face.classList.add("rolling");
    const emojis = MODIFICADORES.map(m => m.emoji);
    let count = 0;
    const maxSpins = 14 + Math.floor(Math.random() * 4); // ~1.3-1.6s de giro
    if (diceInterval) clearInterval(diceInterval);
    diceInterval = setInterval(() => {
        face.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        count++;
        if (count >= maxSpins) {
            clearInterval(diceInterval);
            diceInterval = null;
            // Resultado final: TOTALMENTE aleatorio, sin exclusiones
            const res = MODIFICADORES[Math.floor(Math.random() * MODIFICADORES.length)];
            gameState.currentModifier = res;
            // AEIOU: eligir UNA vocal aleatoria (a/e/i/o/u) para el turno
            // (mejora 2026-08-25: antes "jugaba" siempre con la a).
            if (res.type === "vowels") {
                gameState.aeiouVowel = ["a", "e", "i", "o", "u"][Math.floor(Math.random() * 5)];
            }
            face.textContent = res.emoji;
            face.classList.remove("rolling");
            document.getElementById("diceResultEmoji").textContent = res.emoji;
            document.getElementById("diceResultName").textContent = res.name;
            document.getElementById("diceResultDesc").textContent = modifierDescription(res);
            document.getElementById("diceResult").style.display = "flex";
            btn.style.display = "none";
        }
    }, 90);
}

function startTurnFromDice() {
    if (!gameState.currentModifier) return;
    gameState.isRunning = true;
    disableActionButtons(false);
    updateDiscardButton(); // texto con el limite del equipo ("🗑 Descartar (0/3)")
    updatePauseButton(false);
    showScreen("screenGame");
    displayModifier();
    showNextPhrase(); // registra la primera frase en turnHistory
    setLiveHits(0);
    setPhraseVisible(true);
    schedulePreTurn();
    persistState();
}

// ---- Marcar acierto / pasar (A3, B2, B4) ----
function markCorrect() {
    // Guard: solo si corre el turno y queda tiempo
    if (!gameState.isRunning || !gameState.roundStarted) return;
    if (Temporizador.getRemainingSeconds() <= 0) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last) last.correct = true;
    gameState.roundScores[team] = (gameState.roundScores[team] || 0) + 1;
    setLiveHits(gameState.roundScores[team]);
    vibrate(40);
    showNextPhrase();
}

function markPass() {
    if (!gameState.isRunning || !gameState.roundStarted) return;
    if (Temporizador.getRemainingSeconds() <= 0) return;
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last) last.correct = false;
    vibrate(20);
    showNextPhrase();
}

// ---- Descartar tarjeta (respetando el limite por turno elegido para el equipo) ----
function updateDiscardButton() {
    const btn = document.getElementById("btnDiscard");
    if (!btn) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    const limit = gameState.teamDiscards[team] !== undefined ? gameState.teamDiscards[team] : 3;
    const used = gameState.turnHistory.filter(t => t.discarded === true).length;
    const label = limit === Infinity ? "∞" : String(limit);
    btn.textContent = `🗑 Descartar (${used}/${label})`;
    // No pisar el disabled global durante pausa/pre-turn: solo limitamos aqui
    if (gameState.isRunning && gameState.roundStarted) {
        btn.disabled = limit !== Infinity && used >= limit;
    }
}

function markDiscard() {
    if (!gameState.isRunning || !gameState.roundStarted) return;
    if (Temporizador.getRemainingSeconds() <= 0) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    const limit = gameState.teamDiscards[team] !== undefined ? gameState.teamDiscards[team] : 3;
    const used = gameState.turnHistory.filter(t => t.discarded === true).length;
    if (limit !== Infinity && used >= limit) {
        updateDiscardButton(); // ya no quedan descartes este turno
        return;
    }
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last) last.discarded = true;
    vibrate(15);
    updateDiscardButton();
    showNextPhrase();
}

// ---- Pausa / reanudar (A3, B5) ----
function pauseGame() {
    if (gameState.isRunning) {
        // Cancelar pre-turn timeout si esta pendiente
        if (preTurnTimeout !== null) {
            clearTimeout(preTurnTimeout);
            preTurnTimeout = null;
            pausedBeforeStart = true;
        } else {
            Temporizador.pause();
        }
        gameState.isRunning = false;
        disableActionButtons(true);
        updatePauseButton(true);
    } else {
        // Reanudar
        if (!pausedBeforeStart && !gameState.roundStarted) {
            // estado inconsistente: forzar reinicio de turno
            pausedBeforeStart = false;
        }
        gameState.isRunning = true;
        disableActionButtons(false);
        updateDiscardButton(); // re-aplicar limite del equipo al reanudar
        updatePauseButton(false);
        if (gameState.roundStarted) {
            Temporizador.resume();
        } else {
            pausedBeforeStart = false;
            schedulePreTurn();
        }
    }
}

// ---- Fin de turno (B4: roundStarted=false ANTES de sumar) ----
function endTurn() {
    gameState.roundStarted = false;
    gameState.isRunning = false;
    Temporizador.cancel();
    if (preTurnTimeout !== null) {
        clearTimeout(preTurnTimeout);
        preTurnTimeout = null;
    }
    disableActionButtons(true);
    updatePauseButton(false);

    // La frase que quedaba en pantalla sin responder cuenta como fallada
    // (salvo si se descarto: las 🗑 no puntuan ni cuentan como fallo)
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last && last.correct === null && !last.discarded) last.correct = false;

    const team = gameState.teams[gameState.currentTeamIndex];
    const points = gameState.turnHistory.filter(t => t.correct === true).length;
    gameState.turnPoints = points;
    gameState.roundScores[team] = points;
    gameState.totalScores[team] = (gameState.totalScores[team] || 0) + points;

    renderTurnSummary();
    persistState();
    showScreen("screenTurnSummary");
}

// ---- Correccion desde el resumen del turno ----
function toggleTurnResult(index) {
    const item = gameState.turnHistory[index];
    if (!item) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    const wasCorrect = item.correct === true;
    if (item.discarded) {
        // La descartaste por error: se convierte en acierto
        item.discarded = false;
        item.correct = true;
    } else {
        item.correct = !wasCorrect;
    }
    const points = gameState.turnHistory.filter(t => t.correct === true).length;
    gameState.turnPoints = points;
    gameState.roundScores[team] = points;
    gameState.totalScores[team] = (gameState.totalScores[team] || 0) + (wasCorrect ? -1 : 1);
    renderTurnSummary();
}

// ---- Continuar desde el resumen -> fin de ronda ----
function continueFromSummary() {
    const team = gameState.teams[gameState.currentTeamIndex];
    const points = gameState.turnPoints || 0;

    // Indicar la ronda actual del total en el fin de ronda (mejora 2026-08-25)
    const roundEndInfo = document.getElementById("roundEndRoundInfo");
    if (roundEndInfo) roundEndInfo.textContent = `RONDA ${gameState.currentRound}/${gameState.totalRounds}`;

    document.getElementById("roundEndTeam").textContent = teamLabel(team); // "Equipo N · Nombre"
    document.getElementById("roundEndPoints").textContent = points;
    document.getElementById("roundEndTotal").textContent = gameState.totalScores[team] || 0;
    updateRoundEndRanking();

    // Mostrar opcion de cambiar tiempo si hay siguiente equipo
    const nextTeamIndex = gameState.currentTeamIndex + 1;
    if (nextTeamIndex < gameState.teams.length && gameState.currentRound < gameState.totalRounds) {
        const nextTeam = gameState.teams[nextTeamIndex];
        document.getElementById("nextTeamInfo").textContent = `Próximo: ${teamLabel(nextTeam)}`;
        document.getElementById("timeChangeSection").style.display = "block";
        const currentTime = gameState.teamTimes[nextTeam];
        document.querySelectorAll(".time-change-options .time-btn").forEach(btn => {
            btn.classList.remove("active");
            if (parseInt(btn.dataset.time, 10) === currentTime) {
                btn.classList.add("active");
            }
        });
    } else {
        document.getElementById("timeChangeSection").style.display = "none";
    }

    persistState();
    showScreen("screenRoundEnd");
}

function changeNextTeamTime(seconds) {
    const nextTeamIndex = gameState.currentTeamIndex + 1;
    if (nextTeamIndex < gameState.teams.length) {
        const nextTeam = gameState.teams[nextTeamIndex];
        gameState.teamTimes[nextTeam] = seconds;
        document.querySelectorAll(".time-change-options .time-btn").forEach(btn => {
            btn.classList.remove("active");
            if (parseInt(btn.dataset.time, 10) === seconds) {
                btn.classList.add("active");
            }
        });
    }
}

// ---- Siguiente ronda (A2: assignGuiners SIEMPRE, incl ronda 10) ----
function nextRound() {
    if (gameState.currentTeamIndex < gameState.teams.length - 1) {
        gameState.currentTeamIndex++;
        showScreen("screenGame");
        startNewTurn();
    } else {
        // Se acabo el turno del ultimo equipo de la ronda -> asignar güiner
        // de ESTA ronda (A2: tambien para la ronda 10).
        assignGuiners();
        if (gameState.currentRound < gameState.totalRounds) {
            gameState.currentRound++;
            gameState.currentTeamIndex = 0;
            showScreen("screenGame");
            startNewTurn();
        } else {
            finishGame();
        }
    }
}

// ---- Asignar tarjeta güiner de la ronda (C7: empate => nadie la recibe) ----
function assignGuiners() {
    const roundScores = {};
    gameState.teams.forEach(team => {
        roundScores[team] = gameState.roundScores[team] || 0;
    });
    const maxScore = Math.max(0, ...Object.values(roundScores));
    const winners = Object.entries(roundScores).filter(e => e[1] === maxScore).map(e => e[0]);
    // Unico ganador y con puntos > 0 recibe la tarjeta güiner.
    if (winners.length === 1 && maxScore > 0) {
        gameState.guiner[winners[0]] = (gameState.guiner[winners[0]] || 0) + 1;
    }
}

// ---- Fin de juego / podio ----
// Campeón por TARJETAS GÜINER; en empate de güiner, decide el nº de aciertos
// (mejora 2026-08-25: antes se decidía solo por puntos/aciertos).
function finishGame() {
    clearPersistedState();
    const ranking = Object.entries(gameState.totalScores)
        .map(([name, pts]) => ({ name, pts, guin: gameState.guiner[name] || 0 }))
        .sort((a, b) => (b.guin - a.guin) || (b.pts - a.pts));
    const champion = ranking[0].name;
    document.getElementById("championName").textContent = teamLabel(champion); // "Equipo N · Nombre"
    document.getElementById("finalPoints").textContent = gameState.totalScores[champion];
    document.getElementById("finalGuiner").textContent = gameState.guiner[champion] || 0;

    // Podio: muestra las tarjetas güiner (criterio de victoria), no los puntos
    renderPodio(ranking.map(e => [e.name, e.guin]));
    showScreen("screenFinal");
}

// ---- Reset (B5: limpia timers/timeouts) ----
function resetGame() {
    Temporizador.cancel();
    if (preTurnTimeout !== null) {
        clearTimeout(preTurnTimeout);
        preTurnTimeout = null;
    }
    pausedBeforeStart = false;
    gameState = {
        teams: [],
        teamTimes: {},
        teamDiscards: {},
        currentRound: 1,
        currentTeamIndex: 0,
        isRunning: false,
        roundStarted: false,
        usedPhrases: [],
        phraseBag: [],
        currentPhrase: "",
        currentModifier: null,
        aeiouVowel: null,
        lastModifierIndex: -1,
        roundScores: {},
        totalScores: {},
        guiner: {},
        roundStartedAt: 0,
        totalTime: 0,
        timeLeft: 0,
        turnHistory: [],
        turnPoints: 0,
        totalRounds: TOTAL_ROUNDS,
        teamDiscards: {},
        teamNumbers: {}
    };
    setupTimes = {};
    setupDiscards = {};
    // setupOrderMode NO se resetea: la preferencia de orden persiste en la sesion
}

// ---- Navegacion ----
function goToHome() {
    if (!maybeConfirmExit()) return;
    Temporizador.cancel();
    if (preTurnTimeout !== null) { clearTimeout(preTurnTimeout); preTurnTimeout = null; }
    resetGame();
    showScreen("screenHome");
}

function goToSetup() {
    if (!maybeConfirmExit()) return;
    Temporizador.cancel();
    if (preTurnTimeout !== null) { clearTimeout(preTurnTimeout); preTurnTimeout = null; }
    resetGame();
    showScreen("screenSetup");
    updateTeamCount();
    // Restaurar el selector de orden (la preferencia persiste en la sesion)
    document.querySelectorAll("[data-order]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.order === setupOrderMode);
    });
}

// ---- Setup ----
function toggleInstructions() {
    const el = document.getElementById("instructions");
    if (el) el.classList.toggle("open");
}

function updateTeamCount() {
    const count = parseInt(document.getElementById("numTeams").value, 10);
    document.getElementById("teamCount").textContent = count;

    const container = document.getElementById("teamsContainer");
    container.innerHTML = "";

    for (let i = 1; i <= count; i++) {
        const div = document.createElement("div");
        div.className = "team-setup-group";
        div.innerHTML = `
            <div class="team-input-group">
                <label for="team${i}">Equipo ${i}</label>
                <input type="text" id="team${i}" placeholder="Ej: Los Campeones" maxlength="20">
            </div>
            <div class="team-input-group">
                <label for="time${i}">⏱ Tiempo</label>
                <div class="time-options-setup">
                    <button type="button" class="time-btn" data-team="${i}" data-time="150" onclick="selectTeamTime(${i}, 150)">15s</button>
                    <button type="button" class="time-btn" data-team="${i}" data-time="300" onclick="selectTeamTime(${i}, 300)">30s</button>
                    <button type="button" class="time-btn" data-team="${i}" data-time="450" onclick="selectTeamTime(${i}, 450)">45s</button>
                    <button type="button" class="time-btn" data-team="${i}" data-time="600" onclick="selectTeamTime(${i}, 600)">60s</button>
                </div>
            </div>
            <div class="team-input-group">
                <label for="discard${i}">🗑 Descartar por turno (máx)</label>
                <div class="time-options-setup">
                    <button type="button" class="time-btn" data-team="${i}" data-discard="0" onclick="selectTeamDiscard(${i}, 0)">0</button>
                    <button type="button" class="time-btn" data-team="${i}" data-discard="1" onclick="selectTeamDiscard(${i}, 1)">1</button>
                    <button type="button" class="time-btn" data-team="${i}" data-discard="2" onclick="selectTeamDiscard(${i}, 2)">2</button>
                    <button type="button" class="time-btn" data-team="${i}" data-discard="3" onclick="selectTeamDiscard(${i}, 3)">3</button>
                    <button type="button" class="time-btn" data-team="${i}" data-discard="inf" onclick="selectTeamDiscard(${i}, 'inf')">∞</button>
                </div>
            </div>
        `;
        container.appendChild(div);
        if (setupTimes[i] === undefined) setupTimes[i] = 300; // 30s por defecto (B1: un solo boton 30s)
        if (setupDiscards[i] === undefined) setupDiscards[i] = 0; // 0 descartes/turno por defecto (solo si el equipo lo activa)
    }

    // Marcar activo el tiempo y el limite de descartes por defecto de cada equipo
    for (let i = 1; i <= count; i++) {
        const t = setupTimes[i] || 300;
        document.querySelectorAll(`[data-team="${i}"][data-time]`).forEach(btn => {
            btn.classList.toggle("active", parseInt(btn.dataset.time, 10) === t);
        });
        const d = setupDiscards[i];
        document.querySelectorAll(`[data-team="${i}"][data-discard]`).forEach(btn => {
            const bv = btn.dataset.discard === "inf" ? Infinity : parseInt(btn.dataset.discard, 10);
            btn.classList.toggle("active", bv === d);
        });
    }
}

function updateRoundsCount() {
    const el = document.getElementById("numRounds");
    if (!el) return;
    document.getElementById("roundsCount").textContent = el.value;
}

function selectTeamTime(teamIndex, seconds) {
    setupTimes[teamIndex] = seconds;
    document.querySelectorAll(`[data-team="${teamIndex}"][data-time]`).forEach(btn => {
        btn.classList.toggle("active", parseInt(btn.dataset.time, 10) === seconds);
    });
}

// ---- Limite de descartes por turno (configurable por equipo en el setup) ----
function selectTeamDiscard(teamIndex, value) {
    setupDiscards[teamIndex] = value === "inf" ? Infinity : parseInt(value, 10);
    const v = setupDiscards[teamIndex];
    document.querySelectorAll(`[data-team="${teamIndex}"][data-discard]`).forEach(btn => {
        const bv = btn.dataset.discard === "inf" ? Infinity : parseInt(btn.dataset.discard, 10);
        btn.classList.toggle("active", bv === v);
    });
}

// ---- Orden de juego: manual (orden de escritura) o aleatorio (barajado) ----
function selectOrderMode(mode) {
    setupOrderMode = mode === "random" ? "random" : "manual";
    document.querySelectorAll("[data-order]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.order === setupOrderMode);
    });
}

function startGame() {
    const count = parseInt(document.getElementById("numTeams").value, 10);
    const rawNames = [];
    const times = {};
    for (let i = 1; i <= count; i++) {
        const name = (document.getElementById(`team${i}`).value || "").trim();
        rawNames.push(name || `Equipo ${i}`);
        times[i] = setupTimes[i] || 300;
    }

    // IDs estables: si hay nombres repetidos, anadir sufijo (2), (3)...
    const teams = makeTeamIds(rawNames);

    // Rondas configurables (feature: se eligen al inicio del juego)
    const rounds = parseInt(document.getElementById("numRounds").value, 10);
    gameState.totalRounds = rounds >= 2 && rounds <= 20 ? rounds : TOTAL_ROUNDS;
    const totalLbl = document.getElementById("totalRounds");
    if (totalLbl) totalLbl.textContent = gameState.totalRounds;

    gameState.currentRound = 1;
    gameState.currentTeamIndex = 0;
    gameState.roundScores = {};
    gameState.totalScores = {};
    gameState.guiner = {};
    gameState.lastModifierIndex = -1;

    teams.forEach((team, idx) => {
        gameState.totalScores[team] = 0;
        gameState.guiner[team] = 0;
        // mapear el tiempo y el limite de descartes seleccionados por indice
        gameState.teamTimes[team] = times[idx + 1] || 300;
        gameState.teamDiscards[team] = setupDiscards[idx + 1] !== undefined ? setupDiscards[idx + 1] : 0;
        gameState.teamNumbers[team] = idx + 1; // numero ORIGINAL del setup ("Equipo N · Nombre")
    });

    // Orden de juego: manual (orden de escritura) o aleatorio (barajado)
    let playOrder = teams.slice();
    if (setupOrderMode === "random") {
        for (let i = playOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = playOrder[i];
            playOrder[i] = playOrder[j];
            playOrder[j] = tmp;
        }
    }
    gameState.teams = playOrder;

    // Mazo global: barajar TODAS las tarjetas UNA vez al iniciar la partida.
    // Cuando se agoten, showNextPhrase() re-mezcla y sigue (refillBag).
    gameState.phraseBag = [];
    refillBag();

    showScreen("screenGame");
    setupRoundProgress();
    startNewTurn();
}

// Inicializar pantalla de inicio
document.addEventListener("DOMContentLoaded", () => {
    // Si hay estado persistido de una partida interrumpida, ofrecemos
    // continuar? Por simplicidad, arrancamos en inicio limpio.
    updateTeamCount();
});

if (typeof module !== "undefined") {
    module.exports = {
        startNewTurn, showNextPhrase, markCorrect, markPass, markDiscard, pauseGame,
        endTurn, nextRound, assignGuiners, finishGame, resetGame,
        goToHome, goToSetup, updateTeamCount, selectTeamTime, startGame,
        toggleInstructions, changeNextTeamTime, schedulePreTurn, refillBag,
        rollModifier, startTurnFromDice, toggleTurnResult, continueFromSummary,
        showDiceScreen, updateRoundsCount
    };
}
