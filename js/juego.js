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
// Fase 3A anti doble-tap: mientras es true, Acierto/Pasar no hacen nada.
// Se activa al pulsar (deshabilitando los botones al momento) y se libera
// cuando showNextPhrase muestra la nueva frase (o al resumir/pausar).
let antiDoubleTap = false;

// Tiempo seleccionado en el setup por equipo (indice 1..N)
let setupTimes = {};
// Orden de juego de los equipos: "manual" (orden de escritura) | "random" (barajado)
let setupOrderMode = "manual";

// ---- Helpers de botones de accion ----
function disableActionButtons(disabled) {
    const c = document.getElementById("btnCorrect");
    const p = document.getElementById("btnPass");
    if (c) c.disabled = disabled;
    if (p) p.disabled = disabled;
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
    gameState.turnHistory.push({ phrase: gameState.currentPhrase, correct: null });
    displayPhrase(); // NO cambia el modificador (regla nueva)
    // Fase 3A: la nueva frase ya está en pantalla -> reactivar Acierto/Pasar
    // (si el turno sigue en marcha; si no, siguen deshabilitados).
    disableActionButtons(!(gameState.isRunning && gameState.roundStarted));
    antiDoubleTap = false;
}

// ---- Modificador (REGLA NUEVA: fijo por turno; lo decide el DADO) ----
function displayModifier() {
    const m = gameState.currentModifier;
    if (!m) return;
    const disp = document.getElementById("modifierDisplay");
    applyModifierIcon(document.getElementById("modifierEmoji"), m);
    document.getElementById("modifierName").textContent = m.name;
    document.getElementById("modifierDesc").textContent = modifierDescription(m);
    if (disp) {
        disp.style.display = "flex"; // chip compacta en el header (nunca display:none)
        // Fase 1A: tocar la pill del modo expande/contrae la descripción.
        // onclick directo (sin id nuevo) para que el conductor lea la regla
        // del turno sin pausar. El emoji + nombre SIEMPRE están visibles.
        if (!disp.dataset.tapBound) {
            disp.dataset.tapBound = "1";
            disp.addEventListener("click", () => {
                if (disp.classList.contains("expanded")) {
                    disp.classList.remove("expanded");
                } else {
                    disp.classList.add("expanded");
                }
            });
        }
    }
}

// Icono del modificador: en AEIOU muestra la vocal ELEGIDA del turno
// (mejora 2026-08-25: antes el icono era siempre el emoji fijo 🅰️).
function applyModifierIcon(el, m) {
    if (!el || !m) return;
    const isVowels = m.type === "vowels";
    el.textContent = isVowels ? (gameState.aeiouVowel || "a").toUpperCase() : m.emoji;
    el.classList.toggle("vowel-icon", isVowels);
}

// Descripcion dinamica: en AEIOU se muestra la vocal del turno en curso
// (arranca en A y sube con cada acierto: a→e→i→o→u→a…).
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
    const catEl = document.querySelector(".phrase-category");
    if (catEl) {
        // Fase 1D: categoria como pista (MODISMO / REFRÁN / POP / ANUNCIO / CANCIÓN)
        catEl.textContent = (phrase.categoria || "").toUpperCase();
        catEl.style.display = phrase.categoria ? "" : "none";
    }
    // Fix livebug 3 (AEIOU): frase ESCRITA NORMAL; el jugador cambia las
    // vocales al hablar. El icono/descripcion del modo indica la vocal a usar.
    document.getElementById("phraseText").textContent = phrase.texto;
}

// ---- AEIOU: vocal actual del turno (se avanza en cada acierto en markCorrect) ----
// La frase se muestra ESCRITA NORMAL; el jugador cambia las vocales AL HABLAR.
// El icono y la descripcion del modo indican la vocal a usar (a/e/i/o/u).
const AEIOU_VOWELS = ["a", "e", "i", "o", "u"];

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
        disableActionButtons(false); // Fix livebug 1: habilitar Acierto/Pasar al arrancar
        antiDoubleTap = false;
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
    disableActionButtons(true);
    updatePauseButton(false);

    // 🎲 El jugador LANZA el dado para elegir el modificador de este turno
    showDiceScreen(team);

    // Turno NUEVO pendiente de jugar: si se reanuda desde aquí, toca jugarlo
    // (no repetir el anterior) (fix 2026-08-25).
    gameState.resumeAdvance = false;
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
            // Fase 2A: AEIOU arranca SIEMPRE en la vocal 'a' (decisión de
            // Héctor, 2026-08-25: nada de vocal aleatoria). Después de cada
            // acierto sube a la siguiente vocal (a→e→i→o→u→a…).
            if (res.type === "vowels") {
                gameState.aeiouVowel = "a";
            }
            face.textContent = res.emoji;
            face.classList.remove("rolling");
            applyModifierIcon(face, res);
            applyModifierIcon(document.getElementById("diceResultEmoji"), res);
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
    updatePauseButton(false);
    showScreen("screenGame");
    displayModifier();
    showNextPhrase(); // registra la primera frase en turnHistory
    setLiveHits(0);
    schedulePreTurn();
    gameState.resumeAdvance = false; // turno en curso -> reanudar lo rehace desde el dado
    persistState();
}

// ---- Marcar acierto / pasar (A3, B2, B4) ----
function markCorrect() {
    // Guard (Fase 3A anti doble-tap): bloqueo INMEDIATO del doble-tap ANTES
    // de evaluar el resto. Si ya estamos procesando un tap, salimos.
    if (antiDoubleTap) return;
    antiDoubleTap = true;
    disableActionButtons(true);
    // Guard: solo si corre el turno y queda tiempo
    if (!gameState.isRunning || !gameState.roundStarted) return;
    if (Temporizador.getRemainingSeconds() <= 0) return;
    const team = gameState.teams[gameState.currentTeamIndex];
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last) last.correct = true;
    gameState.roundScores[team] = (gameState.roundScores[team] || 0) + 1;
    setLiveHits(gameState.roundScores[team]);
    vibrate(40);
    // Fase 2A: en AEIOU, cada acierto AVANZA la vocal (a→e→i→o→u→a…)
    if (gameState.currentModifier && gameState.currentModifier.type === "vowels") {
        const idx = AEIOU_VOWELS.indexOf(gameState.aeiouVowel);
        gameState.aeiouVowel = AEIOU_VOWELS[(idx + 1) % AEIOU_VOWELS.length];
        const disp = document.getElementById("modifierDisplay");
        applyModifierIcon(document.getElementById("modifierEmoji"), gameState.currentModifier);
        document.getElementById("modifierDesc").textContent = modifierDescription(gameState.currentModifier);
        if (disp) disp.style.display = "flex";
    }
    showNextPhrase(); // la siguiente frase ya se sustituye con la vocal ACTUAL
}

function markPass() {
    // Guard (Fase 3A anti doble-tap)
    if (antiDoubleTap) return;
    antiDoubleTap = true;
    disableActionButtons(true);
    if (!gameState.isRunning || !gameState.roundStarted) return;
    if (Temporizador.getRemainingSeconds() <= 0) return;
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last) last.correct = false;
    vibrate(20);
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
        disableActionButtons(gameState.roundStarted === false);
        updatePauseButton(false);
        if (gameState.roundStarted) {
            antiDoubleTap = false;
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
    const last = gameState.turnHistory[gameState.turnHistory.length - 1];
    if (last && last.correct === null) last.correct = false;

    const team = gameState.teams[gameState.currentTeamIndex];
    const points = gameState.turnHistory.filter(t => t.correct === true).length;
    gameState.turnPoints = points;
    gameState.roundScores[team] = points;
    gameState.totalScores[team] = (gameState.totalScores[team] || 0) + points;

    // El turno guardado YA se jugó: al reanudar hay que avanzar al siguiente
    // equipo/ronda (fix 2026-08-25: sin esto el mismo equipo repetía turno).
    gameState.resumeAdvance = true;

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
    item.correct = !wasCorrect;
    const points = gameState.turnHistory.filter(t => t.correct === true).length;
    gameState.turnPoints = points;
    gameState.roundScores[team] = points;
    gameState.totalScores[team] = (gameState.totalScores[team] || 0) + (wasCorrect ? -1 : 1);
    // Fase 3D: la corrección también sobrevive a una recarga (persistState)
    persistState();
    renderTurnSummary();
}

// ---- Continuar desde el resumen -> fin de ronda / fin de turno ----
function continueFromSummary() {
    const team = gameState.teams[gameState.currentTeamIndex];
    const points = gameState.turnPoints || 0;
    const isLastTeamOfRound = gameState.currentTeamIndex >= gameState.teams.length - 1;

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

    // Fase 1B: pantalla honesta. Si quedan equipos por jugar en esta ronda,
    // esto es un FIN DE TURNO (no de ronda): título/botón lo dicen. Solo el
    // ÚLTIMO equipo de la ronda ve "¡Fin de Ronda!" / "Siguiente Ronda".
    const endTitle = document.querySelector(".round-end-title");
    const endBtn = document.getElementById("nextRoundBtn");
    if (endTitle) {
        endTitle.textContent = isLastTeamOfRound ? "¡Fin de Ronda!" : "Fin de Turno";
    }
    if (endBtn) {
        endBtn.textContent = isLastTeamOfRound ? "Siguiente Ronda" : "Siguiente equipo";
    }

    // El turno actual ya se jugó (estamos en su fin de ronda): el snapshot
    // debe indicar que al reanudar toca AVANZAR, no repetir el turno.
    gameState.resumeAdvance = true;
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
// Fase 1C: si tras güiner Y puntos totales persiste el empate, se muestra
// EMPATE en vez de coronar a uno solo (no se silencia).
function finishGame() {
    clearPersistedState();
    // La partida ya terminó: ocultar "Continuar Partida" si se vuelve al menú
    const btnResume = document.getElementById("btnResume");
    if (btnResume) btnResume.style.display = "none";
    const ranking = Object.entries(gameState.totalScores)
        .map(([name, pts]) => ({ name, pts, guin: gameState.guiner[name] || 0 }))
        // Opción 2 (Héctor 2026-08-25): campeón por PUNTOS TOTALES; güiner desempata
        .sort((a, b) => (b.pts - a.pts) || (b.guin - a.guin));

    const top = ranking[0];
    // Empate total: mismos puntos Y mismas güiner -> EMPATE honesto (no coronar solo)
    const tied = ranking.filter(e => e.pts === top.pts && e.guin === top.guin);
    const isTie = tied.length > 1;

    const championNameEl = document.getElementById("championName");
    const championEmojiEl = document.querySelector(".champion-emoji");
    const kickerEl = document.querySelector(".final-container .screen-kicker");
    if (isTie) {
        // Empate total: mostrarlo explícitamente, no silenciarlo
        championNameEl.textContent = "EMPATE";
        if (championEmojiEl) championEmojiEl.textContent = "🤝";
        if (kickerEl) kickerEl.textContent = "EMPATE FINAL";
        const names = tied.map(e => teamLabel(e.name)).join(" · ");
        championNameEl.title = names;
        // Aciertos y güiner de los empatados (idénticos entre ellos)
        document.getElementById("finalPoints").textContent = gameState.totalScores[top.name];
        document.getElementById("finalGuiner").textContent = gameState.guiner[top.name] || 0;
    } else {
        const champion = top.name;
        championNameEl.textContent = teamLabel(champion); // "Equipo N · Nombre"
        if (championEmojiEl) championEmojiEl.textContent = "👑";
        if (kickerEl) kickerEl.textContent = "CAMPEÓN";
        document.getElementById("finalPoints").textContent = gameState.totalScores[champion];
        document.getElementById("finalGuiner").textContent = gameState.guiner[champion] || 0;
    }

    // Podio + lista completa de equipos (muestra puntos y güiner de todos)
    renderPodio(ranking);
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
        currentRound: 1,
        currentTeamIndex: 0,
        isRunning: false,
        roundStarted: false,
        phraseBag: [],
        currentPhrase: "",
        currentModifier: null,
        aeiouVowel: null,
        roundScores: {},
        totalScores: {},
        guiner: {},
        totalTime: 0,
        timeLeft: 0,
        turnHistory: [],
        turnPoints: 0,
        totalRounds: TOTAL_ROUNDS,
        teamNumbers: {},
        resumeAdvance: false
    };
    setupTimes = {};
    // setupOrderMode NO se resetea: la preferencia de orden persiste en la sesion
}

// ---- Navegacion ----
function goToHome() {
    if (!maybeConfirmExit()) return;
    Temporizador.cancel();
    if (preTurnTimeout !== null) { clearTimeout(preTurnTimeout); preTurnTimeout = null; }
    resetGame();
    clearPersistedState(); // salir adrede: no ofrecer continuar una partida abandonada
    const btnResume = document.getElementById("btnResume");
    if (btnResume) btnResume.style.display = "none";
    showScreen("screenHome");
}

// ---- Terminar partida a mitad (botón ⏹) ----
// Pide confirmación, borra la partida guardada (para que NO aparezca
// "Continuar Partida") y vuelve al menú principal.
function endGameEarly() {
    if (!gameState.teams || gameState.teams.length === 0) return;
    if (!window.confirm("¿Terminar la partida? Se perderá todo el progreso.")) return;
    Temporizador.cancel();
    if (preTurnTimeout !== null) { clearTimeout(preTurnTimeout); preTurnTimeout = null; }
    resetGame();
    clearPersistedState();
    const btnResume = document.getElementById("btnResume");
    if (btnResume) btnResume.style.display = "none";
    showScreen("screenHome");
}

// ---- Continuar partida interrumpida (recarga accidental) ----
// El estado se persiste en cada hito (startNewTurn, startTurnFromDice, endTurn,
// continueFromSummary). Si la pagina se recarga por un gesto del navegador
// (pull-to-refresh en movil, etc.), el boton "Continuar Partida" restaura
// el marcador y la ronda y vuelve al dado del equipo que le toca jugar.
function resumeGame() {
    if (!loadPersistedState()) {
        showScreen("screenHome");
        return;
    }
    // Estado de turno limpio: no reanudamos timers automaticamente; el equipo
    // actual relanza el dado y sigue la partida con el marcador restaurado.
    gameState.isRunning = false;
    gameState.roundStarted = false;
    gameState.turnHistory = [];
    gameState.turnPoints = 0;
    gameState.currentModifier = null;
    gameState.aeiouVowel = null;

    // Si el turno guardado YA se jugó (snapshot de endTurn/fin de ronda),
    // AVANZAR al siguiente equipo/ronda en vez de repetir el turno jugado
    // (fix 2026-08-25: al reanudar se repetía el turno/ronda del mismo equipo).
    if (gameState.resumeAdvance) {
        gameState.resumeAdvance = false;
        nextRound();
        return;
    }

    const team = gameState.teams[gameState.currentTeamIndex];
    // Recalcular el tiempo del turno: el snapshot NO guarda totalTime y, sin
    // esto, el temporizador arrancaba con 0s -> turno instantaneo (fix 2026-08-25).
    gameState.totalTime = (gameState.teamTimes[team] || 300) / 10;
    gameState.timeLeft = gameState.totalTime;
    updateTimerDisplay(gameState.totalTime, gameState.totalTime);

    setupRoundProgress();
    updateScoreboard();
    updateRoundProgress();
    setLiveHits(0);
    disableActionButtons(true);
    updatePauseButton(false);
    showDiceScreen(team);
    persistState();
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
        `;
        container.appendChild(div);
        if (setupTimes[i] === undefined) setupTimes[i] = 300; // 30s por defecto (B1: un solo boton 30s)
    }

    // Marcar activo el tiempo por defecto de cada equipo
    for (let i = 1; i <= count; i++) {
        const t = setupTimes[i] || 300;
        document.querySelectorAll(`[data-team="${i}"][data-time]`).forEach(btn => {
            btn.classList.toggle("active", parseInt(btn.dataset.time, 10) === t);
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
    gameState.aeiouVowel = null;

    teams.forEach((team, idx) => {
        gameState.totalScores[team] = 0;
        gameState.guiner[team] = 0;
        // mapear el tiempo seleccionado por indice
        gameState.teamTimes[team] = times[idx + 1] || 300;
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
    updateTeamCount();
    // Si hay una partida interrumpida guardada, ofrecer continuarla
    // (mejora 2026-08-25: antes una recarga accidental perdía la partida).
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const snap = JSON.parse(raw);
            if (snap && Array.isArray(snap.teams) && snap.teams.length > 0) {
                const btnResume = document.getElementById("btnResume");
                if (btnResume) btnResume.style.display = "";
            }
        }
    } catch (e) { /* sin almacenamiento: ignorar */ }
});

if (typeof module !== "undefined") {
    module.exports = {
        startNewTurn, showNextPhrase, markCorrect, markPass, pauseGame,
        endTurn, nextRound, assignGuiners, finishGame, resetGame,
        goToHome, goToSetup, updateTeamCount, selectTeamTime, startGame,
        resumeGame, endGameEarly,
        toggleInstructions, changeNextTeamTime, schedulePreTurn, refillBag,
        rollModifier, startTurnFromDice, toggleTurnResult, continueFromSummary,
        showDiceScreen, updateRoundsCount
    };
}
