import * as Juce from "./juce/index.js";

// Simple p5.js FFT visualizer that listens for 'fftframe' events
const sketchContainer = "sketch";
let currFFTFrame = null;

window.__JUCE__.backend.addEventListener("fftframe", (event) => {
  const payload = typeof event === 'string' ? event : (event?.detail ?? '');
  if (typeof payload === 'string' && payload.length) {
    const magnitudeArray = payload.split(',').map(parseFloat);
    currFFTFrame = magnitudeArray;
  }
});

new p5((p) => {
  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent(sketchContainer);
    p.noSmooth();
    p.colorMode(p.HSB, 255);
    p.textAlign(p.CENTER, p.CENTER);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    p.background(12);

    if (!currFFTFrame) {
      p.fill(255);
      p.textSize(14);
      p.text('Awaiting FFT frames...', p.width / 2, p.height / 2);
      return;
    }

    const bins = currFFTFrame.length;
    const barW = Math.max(2, p.width / bins);

    for (let i = 0; i < bins; ++i) {
      // frontend now receives normalized 0..1 magnitudes from the plugin
      const norm = p.constrain(currFFTFrame[i] || 0, 0, 1);
      const h = norm * p.height;

      const x = i * barW;
      const hue = p.map(i, 0, bins, 200, 360);
      p.fill(hue % 255, 200, 255);
      p.noStroke();
      p.rect(x, p.height - h, barW, h);
    }
  };
});
