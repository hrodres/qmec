// QMEC v2 - estado.js
// Estado global + persistencia opcional en localStorage.
// Nombres de equipo permitidos duplicados: el estado usa IDs internos
// estables (los propios nombres de equipo con sufijo si hacen falta), pero
// para el marcador usamos SIEMPRE un identificador unico (teamId) para evitar
// colisiones cuando dos equipos se llaman igual.

const TOTAL_ROUNDS = 10; // valor por defecto; el usuario elige en el setup
const LS_KEY = "qmec_state_v2";

// Identificador estable para un equipo. Si hay nombres repetidos, anadimos
// un sufijo "(2)", "(3)" etc. Solo para mostrar; el estado interno se indexa
// por este displayName unico.
function makeTeamIds(names) {
    const counts = {};
    const result = [];
    for (const raw of names) {
        const name = raw || "Equipo";
        if (counts[name] === undefined) {
            counts[name] = 0;
            result.push(name);
        } else {
            counts[name] += 1;
            result.push(`${name} (${counts[name] + 1})`);
        }
    }
    return result;
}

// Estado de partida. Los mapas (roundScores, totalScores, guiner, teamTimes)
// se indexan por el displayName unico de cada equipo.
let gameState = {
    teams: [],            // lista de displayNames unicos
    teamTimes: {},        // { displayName: segundos }
    teamDiscards: {},     // { displayName: limite de descartes/turno (0..5 | Infinity) }
    teamNumbers: {},      // { displayName: numero original del equipo en el setup (1..N) }
    currentRound: 1,
    totalRounds: TOTAL_ROUNDS, // rondas elegidas en el setup (default 10)
    currentTeamIndex: 0,
    isRunning: false,
    roundStarted: false,
    usedPhrases: [],      // frases ya usadas en ESTE turno (mazo del turno)
    phraseBag: [],        // mazo barajado (shuffle bag) de frases del turno
    currentPhrase: "",
    currentModifier: null,
    lastModifierIndex: -1,// para evitar repetir el modificador del turno anterior
    roundScores: {},
    totalScores: {},
    guiner: {},           // { displayName: tarjetas }
    roundStartedAt: 0,    // timestamp de inicio del temporizador (Date.now)
    totalTime: 0,         // segundos del turno actual
    timeLeft: 0,          // segundos restantes (decimal interno)
    turnHistory: [],      // frases del turno actual: [{ phrase, correct|null }]
    turnPoints: 0,        // puntos del turno actual (recalculables en el resumen)
};

// ---- Persistencia ligera (nombres de equipo, tiempos, records) ----
// Solo guardamos configuracion y records de sesiones previas; la partida en
// curso NO se rehidrata (el juego se juega de un tirón), pero si el usuario
// recarga en medio de una partida, restauramos marcador y ronda para no
// perder el progreso.
function persistState() {
    try {
        const snap = {
            teams: gameState.teams,
            teamTimes: gameState.teamTimes,
            teamDiscards: gameState.teamDiscards,
            teamNumbers: gameState.teamNumbers,
            currentRound: gameState.currentRound,
            totalRounds: gameState.totalRounds,
            currentTeamIndex: gameState.currentTeamIndex,
            roundScores: gameState.roundScores,
            totalScores: gameState.totalScores,
            guiner: gameState.guiner,
            isRunning: false // no reanudamos timers automaticamente
        };
        localStorage.setItem(LS_KEY, JSON.stringify(snap));
    } catch (e) { /* almacenamiento no disponible: ignorar */ }
}

function loadPersistedState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return false;
        const snap = JSON.parse(raw);
        if (!snap || !Array.isArray(snap.teams) || snap.teams.length === 0) return false;
        gameState.teams = snap.teams;
        gameState.teamTimes = snap.teamTimes || {};
        gameState.teamDiscards = snap.teamDiscards || {};
        gameState.teamNumbers = snap.teamNumbers || {};
        gameState.currentRound = snap.currentRound || 1;
        gameState.totalRounds = snap.totalRounds || TOTAL_ROUNDS;
        gameState.currentTeamIndex = snap.currentTeamIndex || 0;
        gameState.roundScores = snap.roundScores || {};
        gameState.totalScores = snap.totalScores || {};
        gameState.guiner = snap.guiner || {};
        return true;
    } catch (e) {
        return false;
    }
}

function clearPersistedState() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
}

// ---- Etiqueta visible de un equipo: "Equipo N · Nombre" ----------------
// Si el jugador no puso nombre (displayName por defecto "Equipo N"), se
// muestra solo "Equipo N". Si hay nombre personalizado: "Equipo N · Nombre".
function teamLabel(team) {
    if (!team) return "";
    const n = gameState.teamNumbers && gameState.teamNumbers[team]
        ? gameState.teamNumbers[team]
        : (gameState.teams.indexOf(team) + 1 || 1);
    if (team === `Equipo ${n}`) return team; // nombre por defecto
    return `Equipo ${n} · ${team}`;
}

// ---- Utilidad: escapar HTML para insertar nombres de equipo (A4) ----
function esc(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/`/g, "&#96;");
}

if (typeof module !== "undefined") {
    module.exports = {
        TOTAL_ROUNDS, LS_KEY, makeTeamIds, teamLabel,
        getGameState: () => gameState,
        setGameState: (s) => { gameState = s; },
        persistState, loadPersistedState, clearPersistedState, esc
    };
}
