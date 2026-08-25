// QMEC v2 - 6 modificadores (extraidos exactos de la v1)
const MODIFICADORES = [
    {
        id: 0,
        emoji: "🍆",
        name: "BERENJENA",
        type: "berenjena",
        desc: "Sustituye la palabra en MAYÚSCULAS por 'BERENJENA'"
    },
    {
        id: 1,
        emoji: "🔄",
        name: "DEL REVÉS",
        type: "reverse",
        desc: "Lee la frase de atrás hacia adelante palabra por palabra"
    },
    {
        id: 2,
        emoji: "🤪",
        name: "OSKI",
        type: "oski",
        desc: "Añade '-OSKI' al final de cada palabra"
    },
    {
        id: 3,
        emoji: "🅰️",
        name: "AEIOU",
        type: "vowels",
        desc: "Cambia todas las vocales por la vocal del turno (A→E→I→O→U por acierto)"
    },
    {
        id: 4,
        emoji: "👅",
        name: "LENGUA FUERA",
        type: "tongue",
        desc: "¡SACANDO LA LENGUA!"
    },
    {
        id: 5,
        emoji: "🎭",
        name: "INTERPRETA",
        type: "mime",
        desc: "¡SIN SONIDO - MÍMICA!"
    },
];

if (typeof module !== 'undefined') { module.exports = { MODIFICADORES }; }
