import * as Juce from "./juce/index.js";

// p5fft3d.js - 3D waterfall-style FFT visualizer using Viber's fftframe events

// Configuration: tweak these to change behaviour/appearance
// - `NUM_CIRCLES`: how many FFT frames (circles) are kept in the history (time depth)
// - `CIRCLE_SPAN`: total horizontal span (pixels) across which circles are placed
// - `CIRCLE_RADIUS`: base radius (pixels) of each circle
// - `HORIZONTAL_STEP_DIV` / `ANGLE_STEP_DIV`: divisors used to compute sampling resolution
const NUM_CIRCLES = 75;
const CIRCLE_SPAN = 1000;
const CIRCLE_RADIUS = 50;
const HORIZONTAL_STEP_DIV = 10;
const ANGLE_STEP_DIV = 30;
class SlidingWindow {
    constructor(maxLength) {
        this.maxLength = maxLength;
        this.window = new Array(maxLength);  // This holds the last `l` pushed elements
        this.currentIndex = 0;
        this.count = 0;  // To track how many elements have been pushed
    }

    // Push a new element (array in this case)
    push(newElement) {
        // If the window is full, overwrite the current index
        this.window[this.currentIndex] = newElement;
        
        // Increment the index and wrap it around using modulo
        this.currentIndex = (this.currentIndex + 1) % this.maxLength;
        
        // Track how many elements have been pushed
        if (this.count < this.maxLength) {
            this.count++;
        }
    }

    // Get the ith element (from the back of the buffer)
    get(i) {
        if (i >= this.count) {
            if (this.window.length == 0) {
              throw new Error("out of luck buddy")
            }
            return this.window[0]
        }

        // Get the element that was pushed i-th times ago
        const index = (this.currentIndex - 1 - i + this.maxLength) % this.maxLength;
        return this.window[index];
    }
}

const buffer = new SlidingWindow(NUM_CIRCLES);


let currFFTFrame = null;
// Listen for fftframe events (string payload of comma-separated magnitudes)
window.__JUCE__.backend.addEventListener('fftframe', (event) => {
  const payload = typeof event === 'string' ? event : (event?.detail ?? '');
  if (typeof payload === 'string' && payload.length) {
    const mags = payload.split(',').map(s => parseFloat(s) || 0);
    currFFTFrame = mags;
  }
});

new p5((p) => {

    // y is FFT bin
    // x is time
    // Derived layout & sampling values (based on top-level config constants)
    const rx = CIRCLE_SPAN / 2; // half horizontal span
    const ix = Math.max(2, Math.floor(rx / HORIZONTAL_STEP_DIV)); // horizontal sampling step
    const ry = CIRCLE_RADIUS; // base radius for each circle
    const iy = Math.max(2, Math.floor(ry / ANGLE_STEP_DIV)); // angular sampling step

    p.setup = () => {
        const c = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        c.parent('sketch');
        p.noSmooth();
        p.strokeWeight(1);
        // Ensure both front and back faces are rendered and transparent blending works
        const gl = p._renderer && p._renderer.GL;
        if (gl) {
        //   gl.disable(gl.CULL_FACE);
        //   gl.enable(gl.BLEND);
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          // Disable depth testing so overlapping transparent faces blend consistently.
          // If you want correct occlusion instead of uniform blending, comment this out.
          gl.disable(gl.DEPTH_TEST);
        }
    };

    p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

    function energyFromBands(spec, startFrac, endFrac) {
        if (!spec || !spec.length) return 0;
        const start = Math.floor(spec.length * startFrac);
        const end = Math.max(start + 1, Math.floor(spec.length * endFrac));
        let sum = 0;
        for (let i = start; i < end; ++i) sum += spec[i];
        return sum / (end - start + 1);
    }

  p.draw = () => {
    p.background(20);
    // p.fill(255, 255, 255, 10);
    p.stroke(150);
    p.strokeWeight(1);

    p.orbitControl(1, 1, 1);

    let spectrum = currFFTFrame;
    const energyb = energyFromBands(spectrum, 0, 0.1);
    const energyt = energyFromBands(spectrum, 0.5, 1);
    buffer.push([spectrum, energyb, energyt]);

    for (let x = -rx; x <= rx; x += ix) {

      const bufferIndex = Math.floor(p.map(x, -rx, rx, 0, NUM_CIRCLES - 1));

      const spec = buffer.get(bufferIndex)[0];
      let _energyb = buffer.get(bufferIndex)[1] || 0;
      let _energyt = buffer.get(bufferIndex)[2] || 0;

      p.fill(0, 0, _energyt * 255, p.map(x, -rx, rx, 10, 0));
      p.stroke(p.map(_energyb, 0, 1, 0, 255), 0, 0, p.map(x, -rx, rx, 255, 50));
      if (!spec || !spec.length) continue;

      p.push();

      p.beginShape();
    //   p.vertex(x, p.height / 4, -ry);

      for (let y = -ry; y <= ry; y += iy) {

        const speci = Math.floor(
          p.map(y, -ry, ry, 0, spec.length - 1)
        );

        const mag = spec[speci] || 0;
        // plugin now sends normalized 0..1 magnitudes; use directly
        // const norm = p.constrain(mag, 0, 1);
        const spech = p.map(mag, 0, 1, p.height / 2, 0) - p.height / 4;

        // p.vertex(x, spech, y);
        // map -ry, ry to -PI, PI for circular layout
        const angle = p.map(y, -ry, ry, -p.PI, p.PI);
        const radius = p.max(0, ry - spech);  // base radius plus magnitude-based offset
        const vx = x;
        const vz = Math.cos(angle) * radius;
        const vy = Math.sin(angle) * radius;
        p.vertex(vx, vy, vz);
      }

    //   p.vertex(x, p.height / 4, ry);
    //   p.vertex(x, p.height / 4, -ry);
      p.endShape(p.CLOSE);
      p.pop();
    }
  };

});
