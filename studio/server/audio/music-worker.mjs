// Worker thread entry: renders one music bed to a WAV file (see ensureMusic in music.mjs).
import { parentPort, workerData } from 'node:worker_threads';
import { writeBed } from './music.mjs';

const { name, duration, file } = workerData;
await writeBed(name, duration, file);
parentPort.postMessage('done');
