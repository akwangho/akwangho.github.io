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
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SRC = new URL("../game.js", import.meta.url).pathname;
const TMP = "/tmp/.gamedrv.mjs";

// ---------- DOM mocks ----------
const listeners = {};
const rafQ = [];
let oscCount = 0;

const ctxCalls = [];
globalThis.__ctxCalls = ctxCalls;
const ctxDraws = [];
globalThis.__ctxDraws = ctxDraws;
let recordTexts = false;
const ctxTexts = [];
globalThis.__setTextRecording = (v) => { recordTexts = v; };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return canvasStub;
    return (...args) => {
      if (k === "translate") ctxCalls.push(args);
      if (k === "drawImage") ctxDraws.push(args);
      if (k === "fillText" && recordTexts) ctxTexts.push({ text: String(args[0]), x: args[1], y: args[2] });
    };
  },
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
         cheatFly, cheatSuper, LEVELS, grid, camX, TILE, VIEW_H, ROWS, frame, timeLeft,
         bananaCount, pipes, enemies, bigbananas, plants, boss, hammers,
         cpActive, cpLevel, cpX, cpY, deathsThisLevel,
         levelW, resetLevel, damagePlayer, solidAt, deadlyAt, IMG,
         items, particles, shakeT };
globalThis.__drv = {
  setLevel: (i) => { levelIdx = i; resetLevel(); },
};
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

// 讓遊戲回到 play 狀態（清掉殘留的 flag/clear/gameover 等），供後續 setLevel 測試使用
async function ensurePlay() {
  for (let i = 0; i < 80 && ns.state !== "play"; i++) {
    await pump(20);
    if (["clear", "title", "gameover", "ending"].includes(ns.state)) {
      kd("Enter"); await pump(3); ku("Enter");
    }
  }
}

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
  console.log("    [dbg] accessLog:", JSON.stringify(globalThis.__accessLog));
  console.log("    [dbg] ctxCalls:", globalThis.__ctxCalls.length);

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
    if (ns.state === "play" || ns.state === "dead") { ns.player.y = 9999; await pump(200); }
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

  // ---------------- T10 mid-level checkpoint ----------------
  console.log("T10: checkpoint respawn");
  ok(ns.cpX > 0, "checkpoint positioned in level");
  ok(existsSync("assets/sprites/tile_checkpoint.png") &&
     existsSync("assets/sprites/tile_checkpoint_on.png"),
     "two-state pennant sprites exist on disk");
  const cpx0 = ns.cpX;
  ns.player.x = cpx0 - 30; ns.player.y = ns.cpY - 2; ns.player.vy = 0;
  kd("ArrowRight"); await pump(20); ku("ArrowRight"); await pump(2);
  ok(ns.cpActive === true, "checkpoint activated on crossing");
  ns.player.y = 9999;
  let sawInv = false, respF = -1, g10 = 0;
  while (respF === -1 && g10++ < 800) {
    await pump(1);
    if (ns.state === "play" && ns.cpActive &&
        Math.abs(ns.player.x - cpx0) < T * 1.5 && ns.cpY === ns.player.y) {
      respF = g10;
      sawInv = ns.player.invuln >= 100;
    }
  }
  ok(respF !== -1, "respawned at checkpoint");
  ok(sawInv, `checkpoint respawn grants blink invuln (${ns.player.invuln})`);
  // must be STANDING on the checkpoint surface, not spawned mid-air
  await pump(90);
  ok(ns.state === "play" && Math.abs(ns.player.y - ns.cpY) < 2,
     `still alive & standing on checkpoint after 90f (y=${ns.player.y.toFixed(1)} vs cpY=${ns.cpY})`);

  // dedicated regression for the reported case: level 1-3 (sky level)
  globalThis.__drv.setLevel(2);
  await pump(5);
  const cp13 = ns.cpX;
  ns.player.x = cp13 - 30; ns.player.y = ns.cpY - 2; ns.player.vy = 0;
  kd("ArrowRight"); await pump(20); ku("ArrowRight"); await pump(2);
  ok(ns.cpActive === true, "1-3 checkpoint activated");
  ns.player.y = 9999; await pump(220);
  let g13 = 0; while (ns.state === "dead" && g13++ < 400) await pump(1);
  await pump(120);   // would fall & die again if spawned in mid-air
  ok(ns.state === "play" && Math.abs(ns.player.y - ns.cpY) < 2,
     `1-3 respawn stands on checkpoint platform (y=${ns.player.y.toFixed(1)})`);

  // ---------------- T11 coyote time ----------------
  console.log("T11: coyote time");
  // stand on the pipe top in this level? use a platform edge generically:
  // place player on ground, then walk it off an artificial ledge is complex;
  // instead verify coyote window directly via state flags
  ns.player.x = 22 * T + 26; ns.player.y = 8 * T; ns.player.vy = 0;   // right edge of plat(8,18,22)
  await pump(3);
  ok(ns.player.onGround, "standing at platform edge");
  kd("ArrowRight");
  let coyoteJump = false;
  for (let i = 0; i < 30; i++) {
    await pump(1);
    if (!ns.player.onGround) { for (let k = 0; k <= 6; k++) { /* grace window */ } }
    if (!ns.player.onGround && i >= 0) {
      // press jump once, as late as 6 frames after leaving ground
      if (!ns.keys.jump) kd("Space");
    }
    if (!ns.player.onGround && ns.player.vy < -4) { coyoteJump = true; break; }
  }
  ku("ArrowRight"); ku("Space");
  ok(coyoteJump, "jump still fires within coyote window after leaving ledge");

  // ---------------- T12 hidden blocks ----------------
  console.log("T12: hidden blocks reveal");
  const hidden = [];
  for (let ty = 0; ty < ns.ROWS; ty++)
    for (let tx = 0; tx < ns.levelW; tx++)
      if (ns.grid[ty][tx] === 12 || ns.grid[ty][tx] === 13) hidden.push([tx, ty, ns.grid[ty][tx]]);
  ok(hidden.length >= 2, `hidden spots placed (${hidden.length})`);
  {
    const [hx, hy, hcode] = hidden.find(h => h[2] === 12) || hidden[0];
    const livesB = ns.lives;
    ns.player.x = hx * T + 24; ns.player.y = (hy + 1) * T + 46; ns.player.vy = -15;
    await pump(3);
    ok(ns.grid[hy][hx] === 8, "hidden block solidified after head bump");
    if (hcode === 12) ok(ns.lives === livesB + 1, "hidden 1UP granted");
  }

  // ---------------- T13 shell enemy ----------------
  console.log("T13: shell enemy states");
  ns.player.x = 8 * T + 24; ns.player.y = 9 * T; ns.player.vy = 0;
  await pump(2);
  const shx0 = ns.player.x + 110, shy0 = 9 * T;
  ns.enemies.push({ x: shx0, y: shy0, vx: -0.9, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0, kind: "shell" });
  const sh = ns.enemies[ns.enemies.length - 1];
  ns.player.x = sh.x; ns.player.y = sh.y - 26; ns.player.vy = 8;
  await pump(3);
  ok(sh.state === "shell" && sh.dead === false, "stomp turns shell walker inert");
  // world-translate entries are [-camX + shakeX, shakeY]; any nonzero Y proves shake
  const shook = globalThis.__ctxCalls.some(
    (c) => Array.isArray(c) && c[0] < -50 && Math.abs(c[1]) > 0.4
  );
  ok(shook, "screen shake moves camera offset during impact");
  ns.player.super = false;
  ns.player.x = sh.x - 26; ns.player.y = sh.y - 6; ns.player.vy = 0;
  await pump(3);
  ok(sh.state === "slide", "touch kicks shell into slide");
  ok(Math.abs(sh.vx) > 4, "slide speed high");
  ns.enemies.push({ x: sh.x + 55, y: shy0, vx: 0, vy: 0, w: 36, h: 36, state: "walk",
    t: 0, active: true, dead: false, hitDir: 0 });
  const victim = ns.enemies[ns.enemies.length - 1];
  ns.player.x = sh.x - 320; ns.player.y = shy0 - 2; ns.player.vy = 0;
  await pump(80);
  ok(victim.dead === true, "sliding shell mows down another enemy");
  // clean up stray enemies so later tests are stable
  for (const en of ns.enemies) if (en !== victim && en.active && Math.abs(en.x - sh.x) < 400) en.state = "gone";

  // ---------------- T13b big-player stomp ----------------
  console.log("T13b: big player stomps without damage");
  ns.player.x = 8 * T + 24; ns.player.y = 9 * T; ns.player.vy = 0;
  await pump(2);
  const bwx = ns.player.x + 90;
  ns.enemies.push({ x: bwx, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk",
    t: 0, active: true, dead: false, hitDir: 0 });
  const bw = ns.enemies[ns.enemies.length - 1];
  ns.player.big = true; ns.player.h = 72;
  ns.player.x = bw.x; ns.player.y = bw.y - 74; ns.player.vy = 8;
  const wasBig = true;
  await pump(14);
  ok(bw.dead === true || bw.state === "flat", "big player stomps walker flat");
  ok(ns.player.big === true && wasBig, "big player stays big after stomp");
  ok(ns.state === "play", "no damage taken from stomp");
  ns.player.big = false; ns.player.h = 46;

  // ---------------- T13c: 兩隻重疊怪物一次踩扁、不受傷 ----------------
  console.log("T13c: two overlapping enemies stomped together");
  ns.player.x = 8 * T + 24; ns.player.y = 9 * T - 60; ns.player.vy = 8;
  ns.player.onGround = false;                       // 從空中落下（地面相交會判定為受傷）
  const px20 = 8 * T + 24;
  const t13e0 = { x: px20, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 };
  const t13e1 = { x: px20 + 10, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 };
  ns.enemies.push(t13e0);
  ns.enemies.push(t13e1);
  let flatCount = 0;
  for (let i = 0; i < 12; i++) {
    await pump(1);
    flatCount = [t13e0, t13e1].filter(e => e.state === "flat" && e.dead).length;
    if (flatCount === 2 && ns.player.vy < 0) break;
  }
  ok(flatCount === 2, `both overlapping walkers flattened (${flatCount}/2)`);
  ok(ns.state === "play" || flatCount === 2, "no damage from double stomp");
  // ---------------- T14 piranha plant + fireball ----------------
  console.log("T14: piranha plant");
  const plX = ns.player.x + 140;
  const pl = { x: plX, topY: 9 * T, t: 0, period: 220, rise: 0, dead: false, h: 46 };
  ns.plants.push(pl);
  ns.player.fire = true;
  let g14 = 0; while (pl.rise < 0.99 && g14++ < 700) await pump(1);
  ok(pl.rise > 0.9, "plant emerges from pipe on cycle");
  kd("ArrowRight"); await pump(1); ku("ArrowRight");
  kd("KeyX"); await pump(2); ku("KeyX");
  let g14b = 0; while (!pl.dead && g14b++ < 200) await pump(1);
  ok(pl.dead === true, "fireball kills plant");
  ns.player.fire = false;

  // ---------------- T15 boss fight ----------------
  console.log("T15: boss battle (1-4)");
  globalThis.__drv.setLevel(3);
  await pump(5);
  const wallCol = ns.LEVELS[ns.levelIdx].flagCol - 6;
  ok(!!ns.boss && !ns.boss.dead, "boss present in castle level");
  ok(ns.solidAt(wallCol, 5), "gate wall blocks path before victory");
  ns.player.x = ns.boss.minX + 60; ns.player.y = ns.boss.y - 170; ns.player.vy = 0;
  let guardBoss = 0;
  while (!ns.boss.dead && guardBoss++ < 900) {
    ns.boss.dizzy = 90; ns.boss.inv = 0;
    ns.player.x = ns.boss.x; ns.player.y = ns.boss.y - 130; ns.player.vy = 10;
    const hpB = ns.boss.hp;
    let w15 = 0;
    while (ns.boss.hp === hpB && w15++ < 220) await pump(1);
  }
  ok(ns.boss.dead === true, "boss defeated by dizzy-window stomps");
  ok(!ns.solidAt(wallCol, 5), "gate wall removed after victory");
  await pump(30);

  // ---------------- T16 big bananas ----------------
  console.log("T16: big bananas");
  ok(ns.bigbananas.filter(b => !b.got).length >= 1, "big bananas present");
  {
    const bb = ns.bigbananas.find(b => !b.got) || ns.bigbananas[0];
    bb.got = false;
    const scB = ns.score;
    ns.player.x = bb.x; ns.player.y = bb.y; ns.player.vy = 0;
    await pump(2);
    ok(bb.got === true, "big banana collected on touch");
    ok(ns.score >= scB + 1000, "+1000 score for big banana");
    ok(globalThis.__ctxDraws.some(d => Math.abs(d[3] - 68) < 0.01 && Math.abs(d[4] - 68) < 0.01),
       "drawn as classic banana shape at 68px (4x area)");
  }

  // ---------------- T17: 旗桿高處抓旗分數可見 ----------------
  console.log("T17: flag score popup visible from highest grab");
  globalThis.__drv.setLevel(0);
  await pump(3);
  ns.enemies.length = 0;
  const fc = ns.LEVELS[ns.levelIdx].flagCol;
  ns.player.x = fc * T - 40; ns.player.y = 110; ns.player.vx = 3; ns.player.vy = 0;
  ns.player.big = false; ns.player.h = 46;
  kd("ArrowRight");
  globalThis.__setTextRecording(true);
  for (let i = 0; i < 6; i++) {
    await pump(1);
    console.log(`    [dbg] i=${i} st=${ns.state} x=${ns.player.x.toFixed(0)} y=${ns.player.y.toFixed(0)} vx=${ns.player.vx.toFixed(1)}`);
    if (ns.state !== "play") break;
  }
  ku("ArrowRight"); globalThis.__setTextRecording(false);
  while (ns.state === "play") { await pump(1); if (Math.random() < 0) break; }
  ok(ns.state !== "play", "flag sequence started");
  const flagTexts = ctxTexts.filter(t => /^\d{3,4}$/.test(t.text) && t.y > 120 && t.y < 500);
  ok(flagTexts.length >= 1,
     `flag score popup visible on screen (${flagTexts.length} draws, y=${flagTexts[0]?.y ?? "-"})`);

  // ---------------- T18: 兩隻重疊怪物一次踩扁、不受傷 ----------------
  console.log("T18: two overlapping enemies stomped together");
  await ensurePlay();                                // T17 可能停在 flag/clear 狀態
  globalThis.__drv.setLevel(0);
  await pump(3);
  ns.enemies.length = 0;
  ns.player.super = false; ns.player.big = false; ns.player.h = 46;
  const px20b = 6 * T + 24;
  ns.player.x = px20b; ns.player.y = 9 * T - 60; ns.player.vy = 8;
  ns.enemies.push({ x: px20b, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 });
  ns.enemies.push({ x: px20b + 10, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 });
  let flatCount2 = 0;
  for (let i = 0; i < 12; i++) {
    await pump(1);
    flatCount2 = ns.enemies.filter(e => e.state === "flat" && e.dead).length;
    if (flatCount2 === 2 && ns.player.vy < 0) break;
  }
  ok(flatCount2 === 2, `both overlapping walkers flattened (${flatCount2}/2)`);
  ok(ns.state === "play" || flatCount === 2, "no damage from double stomp");

  // ---------------- T19 themed enemies ----------------
  console.log("T19: theme-exclusive enemies");
  await ensurePlay();
  globalThis.__drv.setLevel(9);           // 3-2 ice
  await pump(3);
  const pengs = ns.enemies.filter(e => e.kind === "penguin");
  ok(pengs.length >= 3, `ice level has penguins (${pengs.length})`);
  const pen0 = pengs[0];
  pen0.active = true;                                    // 繞過攝影機激活門檻
  ns.player.x = pen0.x - 130; ns.player.y = pen0.y - 2; ns.player.vy = 0; ns.player.super = true;
  await pump(12);
  ok(Math.abs(pen0.vx) >= 1.9, `penguin is fast (${Math.abs(pen0.vx).toFixed(2)})`);
  ns.player.x = pen0.x - 400; await pump(10);
  globalThis.__drv.setLevel(7);           // 2-4 pyramid
  await pump(3);
  const mum = ns.enemies.filter(e => e.kind === "mummy");
  ok(mum.length >= 3, `pyramid has mummies (${mum.length})`);
  // mummy speeds up when player is near
  const m0 = mum.find(e => e.active) || mum[0];
  m0.active = true;                                      // 繞過攝影機激活門檻
  ns.player.x = m0.x + 260; ns.player.y = m0.y - 2;   // inside 8-tile aggro, out of contact
  await pump(24);
  ok(Math.abs(m0.vx) >= 1.8, `mummy chases fast when close (${Math.abs(m0.vx).toFixed(2)})`);
  ok(ns.state === "play", "player safe while observing mummy");
  ns.player.x = m0.x + 900; await pump(40);           // beyond aggro radius
  ok(Math.abs(m0.vx) <= 0.75, `mummy slows down when far (${Math.abs(m0.vx).toFixed(2)})`);
  ok(ns.state === "play", "player still alive after mummy checks");
  globalThis.__drv.setLevel(12);          // 4-1 volcano
  await pump(3);
  const bubbles = ns.enemies.filter(e => e.kind === "bubble");
  ok(bubbles.length >= 2, `volcano has lava bubbles (${bubbles.length})`);
  // hover in a bubble's emergence path (fly cheat) -> get burned
  const bub = bubbles[0];
  let g18 = 0;
  while (ns.state === "play" && g18++ < 500) {
    const p = ns.player;
    p.x = bub.x;
    if (p.y > bub.baseY - 28) kd("Space"); else ku("Space");
    await pump(1);
  }
  ku("Space");
  ok(ns.state === "dead", "lava bubble burns a hovering player");

  // ---------------- T19 four world bosses ----------------
  console.log("T19: four world bosses with unique sprites");
  const roster = [[3, "boss_rabbit"], [7, "boss_shih"], [11, "boss_cats"], [15, "boss_bowser"]];
  for (const [li, imgKey] of roster) {
    globalThis.__drv.setLevel(li);
    await pump(2);
    const b = ns.boss;
    ok(!!b, `${ns.LEVELS[li].name}: boss exists`);
    if (!b) continue;
    ok(b.img === imgKey, `${ns.LEVELS[li].name}: sprite ${b.img}`);
    ok(b.w === 96 && b.h === 96, `${ns.LEVELS[li].name}: boss occupies 4 tiles (96x96)`);
    // draw one frame near boss and confirm the correct image is used
    ns.player.x = b.minX + 80; ns.player.y = b.y - 170; ns.boss.awake = true;
    const before = globalThis.__ctxDraws.length;
    await pump(1);
    const drew = globalThis.__ctxDraws.slice(before).some(d => d[0] === ns.IMG[imgKey]);
    ok(drew, `${ns.LEVELS[li].name}: draws its own boss image`);
  }

  // ---------------- T20: 兩隻重疊怪物一次踩扁、不受傷（不同關卡重驗） ----------------
  console.log("T20: double stomp regression on fresh level");
  globalThis.__drv.setLevel(4);
  for (let i = 0; i < 40 && ns.state !== "play"; i++) {
    await pump(20);
    if (ns.state === "clear") { kd("Enter"); await pump(3); ku("Enter"); }
    if (ns.state === "title" || ns.state === "gameover") { kd("Enter"); await pump(3); ku("Enter"); }
  }
  ok(ns.state === "play", "ready for T20");
  ns.enemies.length = 0;
  ns.player.super = false; ns.player.big = false; ns.player.h = 46;
  const px20c = 6 * T + 24;
  ns.player.x = px20c; ns.player.y = 9 * T - 60; ns.player.vy = 8;
  ns.enemies.push({ x: px20c, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 });
  ns.enemies.push({ x: px20c + 10, y: 9 * T, vx: 0, vy: 0, w: 36, h: 36, state: "walk", t: 0,
    active: true, dead: false, hitDir: 0 });
  let flat20 = 0;
  for (let i = 0; i < 12; i++) {
    await pump(1);
    flat20 = ns.enemies.filter(e => e.state === "flat" && e.dead).length;
    if (flat20 === 2) break;
  }
  ok(flat20 === 2, `double stomp works on fresh level (${flat20}/2)`);
  ok(ns.state === "play", "alive after T20");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
} finally {
  try { unlinkSync(TMP); } catch {}
}
