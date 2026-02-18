// selector.js - dynamic sketch loader
const sketches = [
  './p5animation.js',
  './p5fft.js',
  './p5fft3d.js',
  './threeanimation.js'
];

let state = {
  index: -1,
  mod: null,
  cleanup: null
};

async function loadSketch(index) {
  index = ((index % sketches.length) + sketches.length) % sketches.length;
  // DOM-level cleanup: remove canvases and contents so new sketch can mount cleanly
  try {
    const sketchDiv = document.getElementById('sketch');
    if (sketchDiv) sketchDiv.innerHTML = '';
    // remove any canvases or webgl canvases appended to body (three.js renderer uses this)
    document.querySelectorAll('canvas').forEach(c => {
      // keep non-sketch canvases if needed by checking attributes in future
      c.remove();
    });
  } catch (e) {
    console.warn('Error during DOM cleanup', e);
  }

  // call any cleanup from previous sketch
  try {
    if (typeof state.cleanup === 'function') await state.cleanup();
  } catch (e) {
    console.error('Error during previous sketch cleanup', e);
  }
  state.cleanup = null;

  const path = sketches[index];
  try {
    // import with cache-busting so top-level side-effects run each time
    const importPath = `${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
    console.log('Importing sketch:', importPath);
    const mod = await import(importPath);
    state.mod = mod;
    state.index = index;

    // Resolve start/init function
    let starter = mod.default ?? mod.init ?? mod.start;
    let stopper = mod.destroy ?? mod.stop;

    let maybeCleanup = null;
    if (typeof starter === 'function') {
      try { maybeCleanup = starter(); } catch (e) { console.error('Error running starter', e); }
    } else if (starter && typeof starter === 'object' && typeof starter.init === 'function') {
      try { maybeCleanup = starter.init(); } catch (e) { console.error('Error running starter.init', e); }
      if (!stopper && typeof starter.destroy === 'function') stopper = starter.destroy;
    }

    if (typeof maybeCleanup === 'function') state.cleanup = maybeCleanup;
    else if (typeof stopper === 'function') state.cleanup = () => stopper();
    else state.cleanup = null;
    console.log('Sketch loaded:', path, 'current index:', state.index);
  } catch (err) {
    console.error('Failed to load sketch:', path, err);
  }
}

function nextSketch() { 
    console.log("Loading next sketch...");
    loadSketch((state.index === -1 ? 0 : state.index + 1)); 
}

function setupButton() {
  const btn = document.getElementById('nextbtn');
  if (!btn) return;
  btn.addEventListener('click', () => nextSketch());
}

// Expose API for easy switching
window.SketchSelector = {
  loadSketch,
  nextSketch,
  sketches,
  getCurrentIndex: () => state.index
};

document.addEventListener('DOMContentLoaded', () => {
  setupButton();
  loadSketch(0);
});

export default window.SketchSelector;
