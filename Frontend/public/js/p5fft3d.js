import * as Juce from "./juce/index.js";

// p5fft3d.js - 3D waterfall-style FFT visualizer using Viber's fftframe events

const windowSize = 50;
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

const buffer = new SlidingWindow(windowSize);


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
  const rx = 200;
  const ix = Math.max(2, Math.floor(rx / 20));
  const ry = 200;
  const iy = Math.max(2, Math.floor(ry / 10));

  p.setup = () => {
    const c = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
    c.parent('sketch');
    p.noSmooth();
    p.strokeWeight(1);
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
    p.fill(255, 255, 255, 10);
    p.stroke(150);
    p.strokeWeight(1);

    p.orbitControl(1, 1, 1);

    let spectrum = currFFTFrame;
    const energyb = energyFromBands(spectrum, 0, 0.1);
    const energyt = energyFromBands(spectrum, 0.5, 1);
    buffer.push([spectrum, energyb, energyt]);

    for (let x = -rx; x <= rx; x += ix) {

      const bufferIndex = Math.floor(p.map(x, -rx, rx, 0, windowSize - 1));

      const spec = buffer.get(bufferIndex)[0];
      let _energyb = buffer.get(bufferIndex)[1] || 0;
      let _energyt = buffer.get(bufferIndex)[2] || 0;
      // Backend sends normalized magnitudes in 0..1. Map them to 0..255
      const eb = p.constrain(_energyb, 0, 1);
      const et = p.constrain(_energyt, 0, 1);
      const bassColor = p.map(eb, 0, 1, 40, 255);    // stronger bass -> more red
      const trebleColor = p.map(et, 0, 1, 40, 255);  // stronger treble -> more blue
      const midMix = p.map((eb + et) / 2, 0, 1, 40, 180);
      p.fill(bassColor, midMix, trebleColor, 200);
      p.stroke(bassColor * 0.6, midMix * 0.6, trebleColor * 0.6, 180);
      if (!spec || !spec.length) continue;

      p.push();

      p.beginShape();
      p.vertex(x, p.height / 4, -ry);

      for (let y = -ry; y <= ry; y += iy) {

        const speci = Math.floor(
          p.map(y, -ry, ry, 0, spec.length - 1)
        );

        const mag = spec[speci] || 0;
        // plugin now sends normalized 0..1 magnitudes; use directly
        // const norm = p.constrain(mag, 0, 1);
        const spech = p.map(mag, 0, 1, p.height / 2, 0) - p.height / 4;

        p.vertex(x, spech, y);
      }

      p.vertex(x, p.height / 4, ry);
      p.vertex(x, p.height / 4, -ry);
      p.endShape(p.CLOSE);
      p.pop();
    }
  };

});
// let fft
// let song

// const vert = true
// const horiz = false

// const rx = 200
// const ix = rx/20
// const ry = 200
// const iy = ry/10

// let windowSize = 150
// let buffer = new SlidingWindow(windowSize)

// function preload() {
//     song = loadSound('glue.m4a')
// }

// function setup() {
//   createCanvas(windowWidth, windowHeight, WEBGL)

//   fft = new p5.FFT()
//   fft.setInput(song)
//   // song.play()
// }

// function mousePressed() {
//   if (!song.isPlaying()) {
//     song.loop()
//   }
// }

// function draw() {
//   background(20)
//   fill(255, 255, 255, 0.1) 
//   stroke(150)
//   strokeWeight(1)
  
//   orbitControl(1, 1, 1)
  
//   let spectrum = fft.analyze()
//   let energyb = fft.getEnergy("bass")
//   let energyt = fft.getEnergy("treble")
//   buffer.push([spectrum, energyb, energyt])
  
//   for (let x=-rx; x<=rx; x+=ix) {
//     let bufferi = floor(map(x, -rx, rx, 0, windowSize - 1))
//     let spec = buffer.get(bufferi)[0]
//     let _energyb = buffer.get(bufferi)[1]
//     let _energyt = buffer.get(bufferi)[2]
//     fill(255 - _energyb / 1.5, 255 - _energyb, 255 - _energyb)
//     stroke(255 - _energyt, 255 - _energyt, 255 - _energyt, 100)
    
//     beginShape()
//     vertex(x, height/4, -ry)
//     for (let y=-ry; y<=ry; y+=iy) {
//       let speci = floor(map(y, -ry, ry, 0, spec.length - 1))
//       let spech = map(spec[speci], 0, 255, height / 2, 0) - height / 4
      
//       if (vert) {
//         vertex(x, spech, y)
//       }
//     }
//     vertex(x, height/4, -ry)
//     endShape()
//     // prevpts = pts
//   }
// }