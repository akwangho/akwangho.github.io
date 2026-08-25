#!/usr/bin/env node
/**
 * 隨機輸入模糊測試：以固定種子的偽隨機按鍵流轟炸遊戲，
 * 驗證不變數（合法狀態、有限座標、分數/生命不為 NaN）在任何輸入下都不會被破壞。
 */
import { boot } from "./harness.mjs";

const FRAMES = parseInt(process.argv[2] || "30000", 10);
let seed = 987654321;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const { ns, kd, ku, pump, tap, waitTitle } = await boot();

const listeners = globalThis.__harnessListeners;
const POOL = ["ArrowLeft", "ArrowRight", "Space", "ArrowDown", "ShiftLeft",
              "KeyX", "KeyZ", "KeyW", "KeyA", "KeyS", "KeyD",
              "KeyQ", "Digit1", "KeyF", "KeyL", "KeyY",
              "KeyU", "KeyE", "KeyR", "KeyP", "KeyM", "Enter",
              "KeyB", "KeyG", "KeyI"];

const held = [];
let fails = 0;
function bad(msg) { fails++; console.log("  FUZZ-FAIL: " + msg); }

const VALID_STATES = new Set(["loading", "title", "play", "dead", "flag", "walkoff", "clear", "gameover", "ending"]);

try {
  await waitTitle();
  // 解鎖 Konami 讓作弊碼也在壓力範圍內
  const seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  for (const c of seq) { kd(c); await pump(1); ku(c); await pump(1); }
  // 從 1-1 開始
  while (ns.titleSel !== 0 && ns.konamiOn) await tap("ArrowRight").then(() => {});
  await tap("Enter"); await pump(5);

  let pausedFrames = 0;
    let transitions = 0, prev = ns.state;

  for (let f = 0; f < FRAMES; f++) {
    // ---- 隨機按鍵 ----
    if (rnd() < 0.05 && held.length < 4) {
      const c = POOL[Math.floor(rnd() * POOL.length)];
      if (!held.includes(c)) { kd(c); held.push(c); }
    }
    if (rnd() < 0.04 && held.length) {
      const i = Math.floor(rnd() * held.length);
      ku(held[i]); held.splice(i, 1);
    }
    if (rnd() < 0.001) {                                   // 偶發 blur
      (globalThis.__harnessListeners?.blur || []).forEach(fn => fn({}));
      held.length = 0;
    }

    await pump(1);
    f++;

    // ---- 不變數檢查 ----
    if (!VALID_STATES.has(ns.state)) bad(`illegal state ${ns.state}`);
    if (ns.state === "play") {
      if (!Number.isFinite(ns.player.x) || !Number.isFinite(ns.player.y))
        bad(`NaN position (${ns.player.x},${ns.player.y})`);
      if (!Number.isFinite(ns.score) || ns.score < 0) bad(`negative score ${ns.score}`);
    }
    if (Number.isFinite(ns.lives) && ns.lives < -1) bad(`lives below -1: ${ns.lives}`);

    // ---- 狀態推進輔助（讓模糊測試能持續深入各狀態）----
    if (ns.state === "title" && rnd() < 0.03) { kd("Enter"); }
    if (ns.state === "gameover" && rnd() < 0.02) kd("Enter");
    if (ns.state === "ending" && rnd() < 0.02) kd("Enter");
    if (ns.paused && rnd() < 0.2) tap("KeyP");             // 別永遠卡在暫停
    if (ns.state === "clear" && rnd() < 0.02) tap("Enter");
    if (ns.paused) pausedFrames++;

    if (ns.state !== prev) { transitions++; prev = ns.state; }
  }

  let pass = 0;
  function ok(cond, msg) {
    if (cond) { pass++; console.log("  PASS " + msg); }
    else { fails++; console.log("  FAIL " + msg); }
  }
  ok(fails === 0, `fuzz invariants hold (${fails} violations)`);
  ok(pausedFrames < FRAMES * 0.5, `not stuck paused (${pausedFrames} frames)`);
  console.log(`  states/transitions seen: ${transitions}, held keys at end: ${held.length}`);
  console.log(`\nFUZZ RESULT: ${pass} passed, ${fails} failed over ${FRAMES} frames`);
  process.exit(fails ? 1 : 0);
} catch (err) {
  console.error("FUZZ CRASH:", err);
  process.exit(1);
}

