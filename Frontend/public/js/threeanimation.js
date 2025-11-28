import * as Juce from "./juce/index.js";
import * as THREE from 'three';

console.log("--- Running JUICE Backend ---");
console.log(window.__JUCE__.backend);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
document.body.appendChild(renderer.domElement);

// FFT
window.__JUCE__.backend.addEventListener("fftframe", (event) => {
    const magnitudeArray = event.split(',').map(parseFloat);
    console.log("FFT Frame:", magnitudeArray);
});

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Constants
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const octaves = [-2, -1, 0, 1, 2, 3, 4];
const columnSpacing = 1.1;  // Now for notes
const rowSpacing = 1.1;     // Now for octaves

const noteMap = {};  // { "C1": 0, ..., "B4": 47 }
const cubes = [];

let cubeIndex = 0;
notes.forEach((note, col) => {
    octaves.forEach((octave, row) => {
        const name = `${note}${octave}`;
        noteMap[name] = cubeIndex;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x44ff88 });
        const cube = new THREE.Mesh(geometry, material);

        cube.position.x = col * columnSpacing;   // Notes on x-axis
        cube.position.y = 0;
        cube.position.z = row * rowSpacing;      // Octaves on z-axis
        cube.velocity = 0;

        scene.add(cube);
        cubes.push(cube);
        cubeIndex++;
    });
});

// Adjust camera to top-down angle
const centerX = (notes.length - 1) * columnSpacing / 2;
const centerZ = (octaves.length - 1) * rowSpacing / 2;

camera.position.set(centerX, 20, centerZ + 10);  // Higher up, angled down
camera.lookAt(new THREE.Vector3(centerX, 0, centerZ));

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// JUCE notechange handler
window.__JUCE__.backend.addEventListener("notechange", (event) => {
    const noteName = typeof event === "string" ? event : event?.detail ?? event;
    console.log("Note change event:", noteName);
    const index = noteMap[noteName];
    if (index !== undefined) {
        cubes[index].velocity = 0.4;
        cubes[index].material.color.set(0xffffff); // Make brighter/more white
    }
});

// Physics animation
const gravity = 0.05;
function animate() {
    cubes.forEach(cube => {
        if (cube.velocity !== 0 || cube.position.y > 0) {
            cube.position.y += cube.velocity;
            cube.velocity -= gravity;

            // Set color gradient based on height
            const normalizedHeight = Math.min(Math.max(cube.position.y / 5, 0), 1); // Normalize height (0 to 1)
            const color = new THREE.Color().lerpColors(
                new THREE.Color(0x44ff88), // Base color
                new THREE.Color(0xffffff), // Brighter color
                normalizedHeight
            );
            cube.material.color.set(color);

            if (cube.position.y < 0) {
                cube.position.y = 0;
                cube.velocity = 0;
                cube.material.color.set(0x44ff88); // Reset to original color
            }
        }
    });

    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
