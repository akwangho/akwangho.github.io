/** Shared DOM-mock harness for driving game.js inside Node. */
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SRC = new URL("../game.js", import.meta.url).pathname;
const TMP = "/tmp/.gamedrv.mjs";

export async function boot() {
  const listeners = {};
  const rafQ = [];
  let oscCount = 0;

  const ctxStub = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvasStub = {
    width: 960, height: 528,
    getContext: () => ctxStub,
    addEventListener: () => {},
  };
  globalThis.window = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
  };
  class FakeAudioCtx {
    constructor() { this.currentTime = 0; this.destination = {}; this.state = "running"; }
    resume() {}
    createOscillator() {
      oscCount++;
      return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  globalThis.window.AudioContext = FakeAudioCtx;
  globalThis.document = {
    getElementById: () => canvasStub,
    createElement: () => ({ width: 2, height: 2 }),
    querySelectorAll: () => [],
  };
  globalThis.requestAnimationFrame = (cb) => { rafQ.push(cb); };
  const storeMap = {};
  globalThis.localStorage = {
    getItem: (k) => (k in storeMap ? storeMap[k] : null),
    setItem: (k, v) => { storeMap[k] = String(v); },
  };
  class FakeImage {
    constructor() { this.width = 16; this.height = 16; }
    set src(_v) { queueMicrotask(() => this.onload && this.onload()); }
  }
  globalThis.Image = FakeImage;

  const src = readFileSync(SRC, "utf8");
  const exportsStmt = `
export { state, paused, player, keys, lives, score, levelIdx, konamiOn, titleSel,
         cheatFly, cheatSuper, LEVELS, grid, camX, TILE, VIEW_H, ROWS, frame,
         timeLeft, bananaCount, pipes, enemies, items, shots, fireballs, bananas,
         levelW, resetLevel, damagePlayer, solidAt, deadlyAt,
         boss, plants, bigbananas, hammers, cpActive, cpLevel, cpX, cpY,
         deathsThisLevel, lastRank };
globalThis.__drv = {
  setLevel: (i) => { levelIdx = i; resetLevel(); },
};
`;
  writeFileSync(TMP, src + exportsStmt);
  const ns = await import(pathToFileURL(TMP) + `?t=${Date.now()}`);

  const kd = (code) => listeners.keydown.forEach((f) => f({ code, preventDefault() {} }));
  const ku = (code) => listeners.keyup.forEach((f) => f({ code }));
  const pump = async (n) => { for (let i = 0; i < n; i++) { const cb = rafQ.shift(); if (cb) await cb(); } };
  const tap = async (code) => { kd(code); await pump(1); ku(code); await pump(1); };

  async function waitTitle(maxMs = 5000) {
    const t0 = Date.now();
    while (ns.state === "loading" && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 5));
    await pump(3);
  }

  return { ns, kd, ku, pump, tap, waitTitle, oscCountRef: () => oscCount, cleanup() { try { unlinkSync(TMP); } catch {} } };
}
