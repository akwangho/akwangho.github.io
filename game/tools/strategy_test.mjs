#!/usr/bin/env node
/**
 * 不同玩家策略的完整破台測試（1-1 → 4-4 → 結局）
 * 用法：node tools/strategy_test.mjs [grounded|fire]
 */
import { boot } from "./harness.mjs";

const MODE = process.argv[2] || "grounded";
const { ns, kd, ku, pump, tap, waitTitle } = await boot();
const T = ns.TILE;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

try {
  await waitTitle();

  // ---- Konami 解鎖 ----
  const KSEQ = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
                "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
                "KeyB", "KeyA"];
  for (const c of KSEQ) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.konamiOn === true, "konami unlocked");
  while (ns.titleSel !== 0) await tap("ArrowRight");
  await tap("Enter"); await pump(5);
  ok(ns.state === "play" && ns.levelIdx === 0, "started 1-1");

  // ---- 依策略啟用能力 ----
  if (MODE === "grounded") {
    for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
    ok(ns.player.super === true, "super enabled (grounded)");
    ns.player.big = true; ns.player.h = 72;      // 視同已吃蘑菇
  } else if (MODE === "fire") {
    for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
    ns.player.fire = true; ns.player.big = true; ns.player.h = 72;
    ok(ns.player.fire === true, "fire flower enabled");
  }

  const cleared = [];
  let framesThisLevel = 0, lvlMaxX = -1, noProgress = 0;
  let flyForced = false;
  let hopOn = false, hopPhase = 0;
  let fireCd = 0;
  let deaths = 0;
  let budget = 300000;
  let prev = ns.state;

  const CODE = { left: "ArrowLeft", right: "ArrowRight", jump: "Space" };
  const held = { left: false, right: false, jump: false };
  const hold = (k, on) => {
    if (on && !held[k]) kd(CODE[k]);
    if (!on && held[k]) ku(CODE[k]);
    held[k] = on;
  };

  while (cleared.length < ns.LEVELS.length && budget-- > 0) {
    const st = ns.state;
    if (st !== "play") {
      if (st === "clear") {
        let g = 0;
        while (ns.state === "clear" && g++ < 4000) { await pump(1); if (g > 130 && g % 30 === 0) kd("Enter"); }
        ku("Enter"); await pump(6);
        prev = ns.state; continue;
      }
      if (st === "dead") { deaths++; let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1); prev = ns.state; continue; }
      prev = ns.state; continue;
    }
    if (prev !== "play") { framesThisLevel = 0; lvlMaxX = -1; noProgress = 0; }
    framesThisLevel++;
    const p = ns.player;
    if (p.x > lvlMaxX + 2) { lvlMaxX = p.x; noProgress = 0; } else noProgress++;
    if (noProgress > 16000) {
      fail++; console.log(`  FAIL ${ns.LEVELS[ns.levelIdx].name}: stuck at (${Math.round(p.x)},${Math.round(p.y)})`);
      break;
    }
    if (noProgress > 0 && noProgress % 3000 === 0)
      console.log(`    [trace] ${ns.LEVELS[ns.levelIdx].name} nop=${noProgress} pos=(${Math.round(p.x)},${Math.round(p.y)}) t=${ns.timeLeft}`);

    // ---- 感知 ----
    const footTy = Math.max(0, Math.floor((p.y - 1) / T));
    const aheadTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 10) / T));
    const wallAhead = ns.solidAt(aheadTx, footTy) || ns.solidAt(aheadTx, footTy - 1);
    let floorAhead = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (ns.solidAt(aheadTx, ty) || ns.solidAt(Math.min(ns.levelW - 1, aheadTx + 1), ty)) { floorAhead = true; break; }
    let elevatedAhead = false;
    outer:
    for (let cx = aheadTx; cx <= Math.min(ns.levelW - 1, aheadTx + 3); cx++)
      for (let cy = Math.max(0, footTy - 4); cy <= footTy - 1; cy++)
        if (ns.solidAt(cx, cy)) { elevatedAhead = true; break outer; }
    let enemyNear = false;
    for (const en of ns.enemies)
      if (!en.dead && en.active && en.state === "walk" && Math.abs(en.x - p.x) < 70) { enemyNear = true; break; }

    // ---- Boss 戰：等暈眩 → 跳踩 ----
    let bossMode = false;
    if (ns.boss && !ns.boss.dead && p.x > ns.boss.minX - 320) {
      bossMode = true;
      noProgress = 0;
      const b = ns.boss;
      if (!b.awake) kd("ArrowRight");               // 走進場喚醒
      const dxz = p.x - b.x;
      if (b.dizzy > 0) {
        if (Math.abs(dxz) > 20) { hold("right", p.x < b.x); hold("left", p.x > b.x); }
        else { hold("right", false); hold("left", false); }
        hold("jump", true);
      } else {
        // 保持距離：太近就後退，遠就前進
        const safe = MODE === "fire" ? 150 : 170;
        if (p.x < b.x - safe) { hold("right", true); hold("left", false); }
        else if (p.x > b.x + safe) { hold("left", true); hold("right", false); }
        else {
          const backDir = b.face > 0 ? -1 : 1;
          if (backDir < 0) { hold("left", true); hold("right", false); }
          else { hold("right", true); hold("left", false); }
        }
        hold("jump", false);
      }
      await pump(1);
      prev = ns.state;
      continue;
    }

    // ---- 一般移動：責務週期跳躍 ----
    const needJump = wallAhead || !floorAhead || elevatedAhead || enemyNear;
    if (needJump) hopPhase++; else if (hopPhase > 0) hopPhase--;
    hold("jump", hopPhase % 26 < 18);
    hold("right", true); hold("left", false);

    // 火球流丟火球
    if (MODE === "fire" && fireCd <= 0 && enemyNear) { kd("KeyX"); fireCd = 40; }

    await pump(1);
    if (fireCd > 0) fireCd--;

    // 過關處理
    if (st !== "clear" && ns.state === "clear") {
      const nm = ns.LEVELS[ns.levelIdx].name;
      cleared.push(nm);
      console.log(`  CLEAR ${nm} (${cleared.length}/16, score=${ns.score})`);
      let g = 0;
      while (ns.state === "clear" && g++ < 4000) { await pump(1); if (g > 130 && g % 30 === 0) kd("Enter"); }
      ku("Enter"); await pump(6);
      prev = ns.state;
      continue;
    }
    if (st === "play" && ns.state === "dead") {
      deaths++;
      console.log(`  DEATH #${deaths} on ${nm} at frame ${framesThisLevel}`);
      let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1);
    }
    prev = ns.state;
  }
  for (const k of ["left", "right", "jump"]) hold(k, false);

  ok(cleared.length === ns.LEVELS.length,
     `${MODE}: ${cleared.length}/16 全部通關`);
  if (cleared.length === ns.LEVELS.length) {
    await pump(120);
    await tap("Enter"); await pump(60);
    ok(ns.state === "ending", "ending reached");
  }

  console.log(`\n[${MODE}] RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("STRATEGY TEST CRASH:", err);
  process.exit(1);
}
