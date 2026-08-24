// QMEC v2 - temporizador.js
// Temporizador anclado a Date.now() (no setInterval de 100ms a ciegas).
// Calcula el resto real contra un timestamp. Pausable/resumible, con
// cancelacion limpia. Evita acumulacion de intervalos (A3).

(function (global) {
    let intervalId = null;
    let onTickCb = null;
    let onEndCb = null;

    // Estado interno del temporizador
    let running = false;
    let endTime = 0;        // timestamp (ms) en que termina
    let remainingMs = 0;    // cuando esta pausado, cuanto queda
    let totalMs = 0;

    function clearTimer() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    // Calcula el resto real (en ms) contra Date.now()
    function computeRemainingMs() {
        if (running) {
            return Math.max(0, endTime - Date.now());
        }
        return remainingMs;
    }

    function tick() {
        const rem = computeRemainingMs();
        const totalSec = totalMs / 1000;
        const remSec = rem / 1000;
        if (onTickCb) onTickCb(remSec, totalSec);
        if (rem <= 0) {
            // Tiempo agotado
            running = false;
            clearTimer();
            if (onEndCb) onEndCb();
        }
    }

    function start(totalSeconds, callbacks) {
        clearTimer();
        onTickCb = callbacks && callbacks.onTick ? callbacks.onTick : null;
        onEndCb = callbacks && callbacks.onEnd ? callbacks.onEnd : null;
        totalMs = totalSeconds * 1000;
        remainingMs = totalMs;
        endTime = Date.now() + totalMs;
        running = true;
        // Primer tick inmediato
        tick();
        if (running) {
            // Intervalo ~150ms: suficiente fluidez, bajo coste. El resto real
            // se calcula contra el timestamp, no por decremento ciego.
            intervalId = setInterval(tick, 150);
        }
    }

    function pause() {
        if (!running) return;
        remainingMs = Math.max(0, endTime - Date.now());
        running = false;
        clearTimer();
    }

    function resume() {
        if (running || remainingMs <= 0) return;
        endTime = Date.now() + remainingMs;
        running = true;
        tick();
        if (running) {
            intervalId = setInterval(tick, 150);
        }
    }

    function cancel() {
        running = false;
        remainingMs = 0;
        clearTimer();
        onTickCb = null;
        onEndCb = null;
    }

    function isRunning() { return running; }

    function getRemainingSeconds() {
        return computeRemainingMs() / 1000;
    }

    const api = { start, pause, resume, cancel, isRunning, getRemainingSeconds };
    if (typeof module !== "undefined") module.exports = api;
    global.Temporizador = api;
})(typeof window !== "undefined" ? window : globalThis);
