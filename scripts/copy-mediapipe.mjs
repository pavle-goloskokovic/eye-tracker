// Copies the MediaPipe WASM runtime from node_modules into public/ so the
// app can run fully offline. Runs automatically on install, dev and build.
import { cpSync, mkdirSync } from 'node:fs';

const from = 'node_modules/@mediapipe/tasks-vision/wasm';
const to = 'public/mediapipe/wasm';

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`Copied MediaPipe WASM runtime to ${to}`);
