import * as Juce from "./juce/index.js";

console.log("--- Running JUICE Backend ---");
console.log(window.__JUCE__.backend);

const maxMeowDuration = 225; // ms
// If TIMED_OFF is false, notes auto-close after maxMeowDuration (current behavior).
// If TIMED_OFF is true, cats stay open until a 'noteoff' event arrives for that note.
const TIMED_OFF = false;
const sketchContainer = "sketch";

let currFFTFrame = null;

// FFT
window.__JUCE__.backend.addEventListener("fftframe", (event) => {
    const payload = typeof event === 'string' ? event : (event?.detail ?? '');
    if (typeof payload === 'string' && payload.length) {
        const magnitudeArray = payload.split(',').map(parseFloat);
        if (magnitudeArray.some((x) => x > 0)) {
            console.log("FFT Frame:", magnitudeArray);
        }
        // console.log("FFT Frame:", magnitudeArray);
        currFFTFrame = magnitudeArray;
    }
});

// Constants - 12 pitch classes (one cat per note)
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// State shared with the p5 sketch
let openImage, closeImage;

// Represent each cat (one per pitch class)
const cats = notes.map((name) => ({ name, open: false, lastOpened: 0 }));

// Helper: open a cat's mouth by pitch-class index
function openCatByIndex(i) {
    if (!cats[i]) return;
    cats[i].open = true;
    cats[i].lastOpened = Date.now();
    // schedule close to ensure it won't stay open longer than maxMeowDuration
    if (TIMED_OFF) {
        setTimeout(() => {
            // only close if it hasn't been reopened since
            if (Date.now() - cats[i].lastOpened >= maxMeowDuration - 10) {
                cats[i].open = false;
            }
        }, maxMeowDuration + 20);
    }
}

// Close a cat immediately (used for explicit noteoff behavior)
function closeCatByIndex(i) {
    if (!cats[i]) return;
    cats[i].open = false;
}

// Helper: parse payload (string or number) to pitch-class index (0-11). Returns -1 if unknown.
function parseNoteToIndex(event) {
    const payload = typeof event === "string" || typeof event === 'number' ? event : event?.detail ?? event;
    if (payload == null) return -1;

    // If payload is an actual number type, treat as MIDI number.
    if (typeof payload === 'number') {
        const idx = ((payload % 12) + 12) % 12;
        return idx;
    }

    const s = String(payload).trim();
    if (!s) return -1;

    // If the payload is numeric text (e.g., "60"), parse as MIDI number
    if (/^-?\d+$/.test(s)) {
        const midi = parseInt(s, 10);
        if (!Number.isNaN(midi)) {
            return ((midi % 12) + 12) % 12;
        }
    }

    // Try to extract pitch-class like C, C#, D, etc.
    const m = s.match(/^([A-G]#?)/i);
    if (!m) return -1;
    const pitch = m[1].toUpperCase();
    const idx = notes.indexOf(pitch);
    return idx >= 0 ? idx : -1;
}

// Generic handlers for note on/off events
function handleNoteOn(event) {
    const idx = parseNoteToIndex(event);
    if (idx >= 0) {
        console.log("Note on -> opening cat:", notes[idx]);
        openCatByIndex(idx);
    }
}

function handleNoteOff(event) {
    const idx = parseNoteToIndex(event);
    if (idx >= 0) {
        console.log("Note off -> closing cat:", notes[idx]);
        closeCatByIndex(idx);
    }
}

// Wire up JUCE events
window.__JUCE__.backend.addEventListener("notechange", handleNoteOn);
window.__JUCE__.backend.addEventListener("noteoff", handleNoteOff);

// p5 instance-mode sketch (works under ES modules)
new p5((p) => {
    const padding = 20;
    p.preload = () => {
        // reuse the same open/close images for each cat
        openImage = p.loadImage("images/open.jpg");
        closeImage = p.loadImage("images/close.jpeg");
    };

    p.setup = () => {
        let canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent(sketchContainer);
        p.background(0);
        p.imageMode(p.CENTER);
        p.noSmooth();
    };

    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    p.draw = () => {
        p.background(0);

        const total = cats.length;
        const slotW = (p.width - padding * 2) / total;
        const cx = padding + slotW / 2;
        const y = p.height / 2;

        for (let i = 0; i < total; ++i) {
            const cat = cats[i];
            const x = padding + slotW * i + slotW / 2;
            const img = cat.open ? openImage : closeImage;
            if (img) {
                // fit image into slot while keeping aspect ratio
                const maxImgW = slotW * 0.8;
                const maxImgH = p.height * 0.8;
                let iw = img.width || maxImgW;
                let ih = img.height || maxImgH;
                const scale = Math.min(maxImgW / iw, maxImgH / ih, 1);
                iw *= scale;
                ih *= scale;
                p.image(img, x, y, iw, ih);
            }

            // draw note label below
            p.fill(255);
            p.noStroke();
            p.textAlign(p.CENTER, p.TOP);
            p.textSize(12);
            // p.text(cat.name, x, p.height - 20);

            // slight glow when open
            if (cat.open) {
                p.stroke(255, 200, 100, 150);
                p.noFill();
                p.strokeWeight(2);
                // p.ellipse(x, y, slotW * 0.9, p.height * 0.9);
            }
        }
    };
});
