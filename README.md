# ¿Qué me estás container? (QMEC) — v2

**Party game** single-page en español: equipos adivinan frases típicas españolas
(refranes y expresiones) con un modificador que lo complica todo. 10 rondas,
temporizador por turno, tarjetas **güiner** (ganador de ronda) y podio final.

> Versión 2 profesional del juego de Héctor. Cero dependencias, cero build:
> HTML + CSS + JS plano (sin ES modules) → funciona abriendo `index.html`
> directamente o sirviéndolo con cualquier servidor estático.

🌐 **Web:** https://hrodres.github.io/qmec/
📦 **Repo:** https://github.com/hrodres/qmec

---

## Cómo se juega

1. En **Configurar**, elige de 2 a 6 equipos, ponles nombre y su tiempo (15/30/45/60s).
2. Empieza la partida. Cada turno:
   - Se elige **UNA vez** un modificador y se muestra durante **2 segundos**.
   - **Regla v2 (nueva):** ese mismo modificador se mantiene fijo durante **TODO el turno**.
     No cambia con cada frase (en la v1 sí lo hacía). Al pasar el turno a otro
     equipo / nueva ronda, se lanza el dado de nuevo: el resultado es
     **totalmente aleatorio** (el modificador se puede repetir respecto al
     turno anterior; no hay exclusiones).
   - El descriptor lee la frase original y la explica aplicando el modificador;
     su equipo adivina.
3. Botones **✔ Acierto** (+1) y **✖ Pasar** (sin punto). Hay un **contador de
   aciertos en vivo** grande sobre la frase.
4. Botón **🙈 Ocultar frase** para que el descriptor la lea y la oculte al pasar
   el dispositivo (anti-peek).
5. Al agotarse el tiempo: fin de turno → ranking → (opcional) cambiar el tiempo
   del próximo equipo → **Siguiente Ronda**.
6. Al acabar cada ronda, el equipo con **más aciertos** recibe una **tarjeta güiner**.
   En **empate nadie** la recibe (se mantiene así a propósito).
7. Tras 10 rondas: **podio** y campeón (**por tarjetas güiner**; en empate de
   güiner, decide el número de aciertos).

### Modificadores (6)

| Emoji | Nombre | Qué toca |
|------|--------|----------|
| 🍆 | Berenjena | Sustituye la palabra en MAYÚSCULAS por "BERENJENA" |
| 🔄 | Del Revés | Lee la frase de atrás hacia adelante, palabra por palabra |
| 🤪 | Oski | Añade "-OSKI" al final de cada palabra |
| 🅰️ | AeIoU | Cambia todas las vocales por la vocal del turno. Arranca en **A** y, tras **cada acierto**, sube a la siguiente (A→E→I→O→U→A…) |
| 👅 | Lengua Fuera | ¡Sacando la lengua al hablar! |
| 🎭 | Interpreta | Sin sonido: ¡mímica! |

> Nota: el modificador solo indica **cómo describir** la frase; siempre se
> muestra la frase original en la tarjeta.

---

## Ejecutar en local

- **Opción A (sin servidor):** abre `index.html` en el navegador (doble clic).
  Funciona en `file://` porque no usa ES modules.
- **Opción B (recomendada):** sirve la carpeta:
  ```bash
  cd qmec
  python3 -m http.server 8000
  # abre http://localhost:8000/
  ```

---

## Estructura del proyecto

```
qmec/
├── index.html          # estructura semántica de pantallas + <link>/<script>
├── css/
│   └── styles.css      # todo el CSS (dark theme, animaciones, safe-areas, reduced-motion)
├── js/
│   ├── frases.js       # const FRASES = [...] (228 frases exactas de la v1)
│   ├── modificadores.js# const MODIFICADORES = [...] (6)
│   ├── estado.js       # estado global + persistencia localStorage + esc()
│   ├── temporizador.js # timer anclado a Date.now() (pausable, sin dobles intervalos)
│   ├── juego.js        # lógica de partida (regla del modificador fijo, todos los fixes)
│   └── ui.js           # render de pantallas, marcador, ranking, podio, live hits
├── data/
│   └── frases.json     # las 228 frases + modificadores en JSON (fuente de datos)
├── v1/
│   └── index.html      # la v1 original single-file (intocada, tag v1.0.0)
├── README.md
└── .gitignore
```

---

## Changelog v1 → v2

### Nueva regla de juego (decisión de Héctor)
- El modificador se elige **una sola vez** al inicio del turno y se mantiene
  **fijo durante todo el turno** (antes se re-rollaba en cada frase). El dado
  es **totalmente aleatorio**: puede repetir el modificador del turno anterior.
- **AEIOU (Fase 2A):** la vocal arranca **siempre en A** y sube con cada
  acierto (A→E→I→O→U→A…). Se muestra en el icono del modo y se aplica a la
  frase en pantalla.

### Fixes obligatorios implementados
- **A1 (crítico):** mazo *shuffle bag* (Fisher–Yates) sin bucle infinito; se
  rebaraja al agotarse. Eliminado el `do/while` con `includes`.
- **A2 (crítico):** `assignGuiners()` se ejecuta **siempre** al acabar ronda,
  incluida la **ronda 10**, antes de decidir si es fin de juego.
- **A3 (crítico):** `markCorrect/markPass` exigen `isRunning`/`roundStarted`;
  `pauseGame` cancela el timeout pre-turno y deshabilita los botones; el timer
  anclado a `Date.now()` evita acumulación de intervalos.
- **A4 (crítico):** escapado de nombres de equipo en **todos** los `innerHTML`
  (marcador, ranking, podio) vía `esc()`.
- **B1:** un solo botón 30s por defecto en el setup (eliminado duplicado).
- **B2:** contador de aciertos en vivo durante el turno.
- **B3:** toggle **Mostrar/Ocultar frase** (anti-peek).
- **B4:** fin de turno sin carrera (`roundStarted=false` antes de sumar;
  `markCorrect/markPass` comprueban `timeLeft>0`).
- **B5:** `resetGame`/`goToHome` limpian intervalos **y** timeouts pendientes.

### Menores / mejoras
- **C2:** los *dots* de progreso de ronda sí se mueven.
- **C3:** comentario con el número real de frases (228).
- **C4:** "Tarjetas" (ortografía correcta) manteniendo "güiner" con ñ.
- **C5:** `user-select: none` limitado a botones/controles; el texto de frases
  sigue seleccionable.
- **C6:** confirmación al salir de una partida en curso.
- **C7:** empates de ronda documentados (nadie recibe güiner).
- Mejoras: `prefers-reduced-motion`, safe-areas (notch), `oninput` en el slider,
  `focus-visible`, `aria-live` en el temporizador, `navigator.vibrate()` en
  Acierto/Pasar, nombres de equipo duplicados con IDs estables (`Equipo 1`,
  `Equipo 1 (2)`…).

---

## Créditos

- Juego original y reglas: **Héctor** (`hrodres`).
- v2 (estructura profesional, fixes y regla del modificador fijo): derivado de
  la v1 single-file.
- 228 frases populares españolas extraídas de la v1.

## Licencia

Uso personal / party game. Sin dependencias de terceros.
