import * as Juce from "./juce/index.js";

console.log("--- Running JUICE Backend ---");
console.log(window.__JUCE__.backend);

const maxMeowDuration = 225; // ms
// If TIMED_OFF is false, notes auto-close after maxMeowDuration (current behavior).
// If TIMED_OFF is true, cats stay open until a 'noteoff' event arrives for that note.
const TIMED_OFF = false;
// Adjust this to shift which octave maps to the top row. For MIDI note N,
// octave is computed as Math.floor(N/12) - 1. Row = (octave - START_OCTAVE) % 3.
const START_OCTAVE = 2;
// How long (ms) to keep the cat visible after a close/noteoff arrives
const STAY_DURATION = 200;
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

// Constants - 12 pitch classes (12 cats per row, 3 rows)
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// State shared with the p5 sketch
let openImage, closeImage;

// Represent cats as a 3x12 matrix: rows x pitch-class
const ROWS = 3;
const cats = Array.from({ length: ROWS }, () => notes.map((name) => ({ name, open: false, visible: false, lastOpened: 0, hideTimer: null })));

// Helper: open a cat's mouth by pitch-class index
function openCat(row, pitchIdx) {
    if (!cats[row] || !cats[row][pitchIdx]) return;
    const c = cats[row][pitchIdx];
    // cancel any pending hide
    if (c.hideTimer) {
        clearTimeout(c.hideTimer);
        c.hideTimer = null;
    }
    c.open = true;
    c.visible = true;
    c.lastOpened = Date.now();
    if (TIMED_OFF) {
        setTimeout(() => {
            if (Date.now() - c.lastOpened >= maxMeowDuration - 10) {
                // schedule close which will start the stay timer
                closeCat(row, pitchIdx);
            }
        }, maxMeowDuration + 20);
    }
}

function closeCat(row, pitchIdx) {
    if (!cats[row] || !cats[row][pitchIdx]) return;
    const c = cats[row][pitchIdx];
    c.open = false;
    // clear any existing hide timer
    if (c.hideTimer) {
        clearTimeout(c.hideTimer);
        c.hideTimer = null;
    }
    // keep visible for STAY_DURATION, then hide
    c.hideTimer = setTimeout(() => {
        c.visible = false;
        c.hideTimer = null;
    }, STAY_DURATION);
}

// Helper: parse payload (string or number) to pitch-class index (0-11). Returns -1 if unknown.
// Parse incoming event payload and try to extract MIDI number, pitch-class and octave.
// Returns object { pitchIdx: 0-11 or -1, midi: number|null, octave: number|null }
function parseNotePayload(event) {
    const payload = typeof event === "string" || typeof event === 'number' ? event : event?.detail ?? event;
    if (payload == null) return { pitchIdx: -1, midi: null, octave: null };

    // Numeric MIDI
    if (typeof payload === 'number' || (/^-?\d+$/.test(String(payload).trim()))) {
        const midi = typeof payload === 'number' ? payload : parseInt(String(payload).trim(), 10);
        if (!Number.isNaN(midi)) {
            const pitchIdx = ((midi % 12) + 12) % 12;
            const octave = Math.floor(midi / 12) - 1;
            return { pitchIdx, midi, octave };
        }
    }

    const s = String(payload).trim();
    // Match note like C4 or C#3
    const m = s.match(/^([A-G]#?)(-?\d+)?/i);
    if (!m) return { pitchIdx: -1, midi: null, octave: null };
    const pitch = m[1].toUpperCase();
    const pitchIdx = notes.indexOf(pitch);
    const octave = m[2] != null ? parseInt(m[2], 10) : null;
    return { pitchIdx: pitchIdx >= 0 ? pitchIdx : -1, midi: null, octave };
}

// Generic handlers for note on/off events
function handleNoteOn(event) {
    const parsed = parseNotePayload(event);
    if (parsed.pitchIdx < 0) return;
    let row = 1; // default to middle row when octave unknown
    if (parsed.octave != null) {
        row = (((parsed.octave - START_OCTAVE) % ROWS) + ROWS) % ROWS;
    }
    console.log("Note on -> opening cat:", notes[parsed.pitchIdx], "row", row);
    openCat(row, parsed.pitchIdx);
}

function handleNoteOff(event) {
    const parsed = parseNotePayload(event);
    if (parsed.pitchIdx < 0) return;
    if (parsed.octave != null) {
        const row = (((parsed.octave - START_OCTAVE) % ROWS) + ROWS) % ROWS;
        console.log("Note off -> closing cat:", notes[parsed.pitchIdx], "row", row);
        closeCat(row, parsed.pitchIdx);
    } else {
        // If no octave info, close all rows for that pitch
        for (let r = 0; r < ROWS; ++r) closeCat(r, parsed.pitchIdx);
        console.log("Note off -> closing all rows for:", notes[parsed.pitchIdx]);
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

        const cols = notes.length;
        const rows = ROWS;
        const slotW = (p.width - padding * 2) / cols;
        const slotH = (p.height - padding * 2) / rows;

        for (let r = 0; r < rows; ++r) {
            for (let i = 0; i < cols; ++i) {
                const cat = cats[r][i];
                const x = padding + slotW * i + slotW / 2;
                const y = padding + slotH * r + slotH / 2;
                // only render if visible (default is hidden)
                if (!cat.visible) continue;

                const img = cat.open ? openImage : closeImage;
                if (img) {
                    const maxImgW = slotW * 0.9;
                    const maxImgH = slotH * 0.9;
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
                p.text(cat.name, x, y + slotH * 0.4);

                // slight glow when open
                if (cat.open) {
                    p.stroke(255, 200, 100, 150);
                    p.noFill();
                    p.strokeWeight(2);
                }
            }
        }
    };
});
