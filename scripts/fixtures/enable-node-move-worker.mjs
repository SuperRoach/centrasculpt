import {BrowserWorker} from './node-browser-worker.mjs';
globalThis.Worker=BrowserWorker;
