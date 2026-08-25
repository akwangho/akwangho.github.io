#!/usr/bin/env node
/**
 * Automated input/state tests for game.js.
 *
 * Mocks the DOM (canvas ctx, Image, listeners), imports a copy of game.js with
 * internals exported, then drives frames and synthesizes keyboard events to
 * verify:
 *   - crouch release fix (ground / mid-air landing / pipe top / low ceiling)
 *   - small player ignores down-crouch; window blur clears stuck keys
 *   - Konami code on title: sound + 99 lives + stage select
 *   - 'fly' wing flight; 'super' invincibility + pit/lava rescue respawn
 */
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SRC = new URL("../game.js", import.meta.url).pathname;
const TMP = "/tmp/.gamedrv.mjs";

// ---------- DOM mocks ----------
const listeners = {};
const rafQ = [];
let oscCount = 0;

const ctxStub = new Proxy({}, {
  get: () => () => {},
  set: () => true,
});
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
class FakeImage {
  constructor() { this.width = 16; this.height = 16; }
  set src(_v) { queueMicrotask(() => this.onload && this.onload()); }
}
globalThis.Image = FakeImage;

// ---------- build driver module with exports appended ----------
const src = readFileSync(SRC, "utf8");
const exportsStmt = `
export { state, paused, player, keys, lives, score, levelIdx, konamiOn, titleSel,
         cheatFly, cheatSuper, LEVELS, grid, camX, TILE, VIEW_H, frame, timeLeft,
         bananaCount, pipes, enemies, resetLevel, damagePlayer };
`;
writeFileSync(TMP, src + exportsStmt);

const ns = await import(pathToFileURL(TMP));

// ---------- helpers ----------
const kd = (code) => listeners.keydown.forEach((f) => f({ code, preventDefault() {} }));
const ku = (code) => listeners.keyup.forEach((f) => f({ code }));
const pump = async (n) => { for (let i = 0; i < n; i++) { const cb = rafQ.shift(); if (cb) await cb(); } };
const tap = async (code) => { kd(code); await pump(1); ku(code); await pump(1); };

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}
async function waitTitle(maxMs = 5000) {
  const t0 = Date.now();
  while (ns.state === "loading" && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 5));
  await pump(3);
}
async function startGame() { ok(ns.state === "title", "at title"); await tap("Enter"); await pump(5); ok(ns.state === "play", "game started"); }

const T = ns.TILE;
function placeBig(x, y) { ns.player.big = true; ns.player.h = 72; ns.player.x = x; ns.player.y = y; ns.player.vx = 0; ns.player.vy = 0; ns.player.crouching = false; }

try {
  // ================= T1 crouch on open ground releases =================
  console.log("T1: crouch release on open ground");
  await waitTitle();
  await startGame();
  placeBig(3 * T + 24, 9 * T);
  await pump(4);
  ok(ns.player.onGround, "standing on ground");
  kd("ArrowDown"); await pump(4);
  ok(ns.player.crouching === true, "crouches while Down held");
  ku("ArrowDown"); await pump(6);
  ok(ns.player.crouching === false, "stands up after releasing Down (bug fix)");
  const x0 = ns.player.x;
  kd("ArrowLeft"); await pump(30); ku("ArrowLeft"); await pump(4);
  ok(ns.player.x < x0 - 20, "can walk left after uncrouch");

  // ================= T2 down held during jump/landing =================
  console.log("T2: Down during jump -> land crouched -> recover");
  kd("Space"); await pump(2);
  ok(!ns.player.onGround, "airborne after jump");
  kd("ArrowDown");
  let guard = 0;
  while (!ns.player.onGround && guard++ < 120) await pump(1);
  await pump(3);
  ok(guard < 120, "landed from jump");
  ok(ns.player.crouching === true, "lands in crouch while Down held");
  ku("ArrowDown"); await pump(6);
  ok(ns.player.crouching === false, "stands up after landing crouch release");
  const rx = ns.player.x;
  kd("ArrowRight"); await pump(25); ku("ArrowRight"); await pump(4);
  ok(ns.player.x > rx + 15, "walks right again");

  // ================= T3 crouch on top of a pipe =================
  console.log("T3: crouch on pipe top releases");
  placeBig(28.5 * T, 7 * T); // pipe at cols 28-29, height 2 -> top row 7
  await pump(4);
  ok(ns.player.onGround, "standing on pipe");
  kd("ArrowDown"); await pump(4);
  ok(ns.player.crouching === true, "crouches on pipe");
  ku("ArrowDown"); await pump(6);
  ok(ns.player.crouching === false, "stands up on pipe after release");

  // ================= T4 low ceiling blocks standing, then allows =================
  console.log("T4: low ceiling keeps crouch until clear");
  placeBig(10.5 * T, 9 * T);
  await pump(4);
  ns.grid[7][10] = 1; ns.grid[7][11] = 1;
  kd("ArrowDown"); await pump(4);
  ok(ns.player.crouching === true, "crouched under ceiling");
  ku("ArrowDown"); await pump(8);
  ok(ns.player.crouching === true, "stays crouched while ceiling overhead");
  ns.grid[7][10] = 0; ns.grid[7][11] = 0;
  await pump(8);
  ok(ns.player.crouching === false, "stands once ceiling removed");

  // ================= T5 small player unaffected by Down =================
  console.log("T5: small player ignores Down");
  ns.player.big = false; ns.player.h = 46; ns.player.crouching = false;
  await pump(2);
  kd("ArrowDown"); await pump(4);
  ok(ns.player.crouching === false, "small player never crouches");
  const sx = ns.player.x;
  kd("ArrowRight"); await pump(20); ku("ArrowRight"); ku("ArrowDown"); await pump(4);
  ok(ns.player.x > sx + 15, "small player walks with Down held");

  // ================= T6 blur clears keys =================
  console.log("T6: window blur clears held keys");
  kd("ArrowRight"); kd("ArrowDown");
  listeners.blur.forEach((f) => f());
  await pump(2);
  ok(!ns.keys.right && !ns.keys.down && !ns.keys.jump && !ns.keys.left && !ns.keys.run, "keys cleared on blur");
  const bx = ns.player.x;
  await pump(30);
  ok(Math.abs(ns.player.x - bx) < 12, "player does not keep walking after blur");

  // ================= drain lives to reach title naturally =================
  console.log("-- draining lives to return to title --");
  let safety = 0;
  while (ns.state !== "title" && safety++ < 40000) {
    if (ns.state === "play" || ns.state === "dead") { ns.player.y = VIEW_H_SAFE(); await pump(200); }
    else await pump(60);
    if (ns.state === "gameover") { await tap("Enter"); }
  }
  ok(ns.state === "title", "back on title screen");

  // ================= T7 Konami code =================
  console.log("T7: Konami code unlocks cheats");
  ok(ns.konamiOn === false, "cheats locked before code");
  const oscBefore = oscCount;
  const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  for (const c of seq) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.konamiOn === true, "konami unlocked");
  ok(ns.lives === 99, "lives set to 99");
  const oscDelta = oscCount - oscBefore;
  ok(oscDelta >= 7, `unlock jingle played (${oscDelta} oscillator events)`);

  // wrong sequence must not unlock anything weird / retrigger
  for (const c of ["ArrowUp", "ArrowUp"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.konamiOn === true && ns.state === "title", "partial sequence harmless");

  // stage select
  await tap("ArrowRight"); await tap("ArrowRight");
  ok(ns.titleSel === 2, "stage select moves right (1-3)");
  await tap("Enter"); await pump(5);
  ok(ns.state === "play" && ns.LEVELS[ns.levelIdx].name === "1-3", "started selected stage 1-3");
  ok(ns.lives === 99, "99 lives carried into game");

  // ================= T8 fly cheat =================
  console.log("T8: 'fly' grants flight");
  placeBig(3 * T + 24, 9 * T);
  ns.player.big = false; ns.player.h = 46; // fly as small monkey
  await pump(3);
  for (const c of ["KeyF", "KeyL", "KeyY"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.fly === true, "fly enabled by typing F-L-Y");
  kd("Space");
  await pump(40);
  const airY = ns.player.y;
  ok(!ns.player.onGround && airY < 9 * T - 30, "hovers/rises while jump held (y=" + Math.round(airY) + ")");
  await pump(30);
  ok(!ns.player.onGround, "still airborne under sustained flight");
  ku("Space");
  guard = 0; while (!ns.player.onGround && guard++ < 150) await pump(1);
  ok(guard < 150, "falls and lands after releasing jump");

  // ================= T9 super cheat =================
  console.log("T9: 'super' grants invincibility + pit rescue");
  for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.paused === false, "P inside 'super' did not pause the game");
  ok(ns.player.super === true, "super enabled by typing S-U-P-E-R");

  // enemy contact does no damage
  const px = ns.player.x, py = ns.player.y;
  ns.enemies.push({ x: px + 6, y: py, vx: 0, vy: 0, w: 36, h: 40, state: "walk", t: 0, active: true, dead: false, hitDir: 0 });
  await pump(6);
  ok(ns.state === "play", "enemy contact while super: no death");
  ns.enemies.length = 0;

  // lava rescue
  const col = Math.floor(ns.player.x / T) + 4;
  const saveA = ns.grid[9][col], saveB = ns.grid[10][col];
  ns.grid[9][col] = 10; ns.grid[10][col] = 10;
  kd("ArrowRight");
  guard = 0;
  while (guard++ < 240 && ns.state === "play" && !(ns.player.invuln > 90)) await pump(1);
  ku("ArrowRight"); await pump(2);
  ok(ns.state === "play", "survived lava touch while super");
  ok(ns.player.x >= ns.camX && ns.player.x < ns.camX + 8 * T, "respawned near left of screen (x=" + Math.round(ns.player.x) + ", camX=" + Math.round(ns.camX) + ")");
  ns.grid[9][col] = saveA; ns.grid[10][col] = saveB;
  await pump(130); // let rescue invuln expire

  // bottomless pit rescue
  ns.player.y = ns.VIEW_H + 200;
  await pump(3);
  ok(ns.state === "play", "survived pit fall while super");
  ok(ns.player.x >= ns.camX && ns.player.x < ns.camX + 8 * T, "pit fall respawned near left of screen");

  // toggle off
  for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.super === false && ns.paused === false, "typing super again toggles off");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
} finally {
  try { unlinkSync(TMP); } catch {}
}

function VIEW_H_SAFE() { return 9999; }
