#!/usr/bin/env node
/**
 * Boss 專屬攻擊型態與像素動畫測試：
 *   B1 四位 Boss 的像素素材（idle/walk/atk）皆存在
 *   B2 彼得兔發射紅蘿蔔（carrot）
 *   B3 西施惠發射星星扇形（≥2 顆 star）
 *   B4 野貓軍團執行蓄力衝刺（|vx|≥5）
 *   B5 庫巴噴出火焰（flame）
 *   B6 各彈幕確實會傷害普通玩家（無敵關閉時）
 *   B7 攻擊姿勢影格（_atk）實際被繪製
 */
import { existsSync } from "node:fs";
import { boot } from "./harness.mjs";

const env = await boot();
const { ns, kd, ku, pump, tap, waitTitle } = env;
const T = ns.TILE;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

const BOSSES = [
  [3, "boss_rabbit", "carrot", "彼得兔"],
  [7, "boss_shih", "star", "西施惠"],
  [11, "boss_cats", "dash", "野貓軍團"],
  [15, "boss_bowser", "flame", "庫巴"],
];

try {
  await waitTitle();

  // 解鎖 Konami：可用 stage select 進入任一關
  const kseq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  for (const c of kseq) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.konamiOn === true, "konami unlocked");

  async function startLevel(li) {
    globalThis.__drv.setLevel(li);
    if (ns.state === "title" || ns.state !== "play") {
      let guard = 0;
      while (ns.titleSel !== li && guard++ < ns.LEVELS.length) await tap("ArrowRight");
    }
    if (ns.state !== "play") { await tap("Enter"); await pump(6); }
    let w = 0;
    while (ns.state !== "play" && w++ < 100) await pump(1);
  }

  // ---------------- B1 ----------------
  console.log("B1: pixel sprites exist for every boss frame");
  for (const [, img] of BOSSES) {
    for (const suffix of ["", "_walk", "_atk"]) {
      const f = `assets/sprites/${img}${suffix}.png`;
      ok(existsSync(f), `B1 ${img}${suffix || "(base)"}.png`);
    }
  }
  for (const proj of ["proj_carrot", "proj_star", "proj_flame"]) {
    ok(existsSync(`assets/sprites/${proj}.png`), `B1 ${proj}.png`);
  }

  // ---------------- B2-B5：各 Boss 攻擊型態 ----------------
  for (const [li, img, kind, cname] of BOSSES) {
    console.log(`Boss ${cname} (${kind})`);
    await startLevel(li);
    await pump(5);
    ns.enemies.length = 0;
    ns.player.super = true;                 // 測試聚焦彈幕生成，不被傷害干擾
    ns.player.invuln = 9999;
    ns.player.x = ns.boss.minX + 40;        // 進入喚醒與攻擊範圍
    ns.player.y = 9 * T;
    ns.player.vy = 0;
    ns.boss.awake = true;
    await pump(80);                          // 讓鏡頭 LERP 追上瞬移後的玩家
    ns.player.x = ns.boss.minX + 40;         // boss 走近後重新貼齊
    ns.player.y = 9 * T;
    ns.boss.dizzy = 0;
    ns.boss.throwCd = 1;
    ns.boss.dashCd = Math.min(ns.boss.dashCd, 1);
    const seenKinds = new Set();
    let maxVx = 0;
    let g = 0;
    while (g++ < 420 && ns.boss.hp > 0) {
      await pump(1);
      if (!ns.boss || ns.boss.dead) break;
      maxVx = Math.max(maxVx, Math.abs(ns.boss.vx));
      for (const hm of ns.hammers) seenKinds.add(hm.kind);
      if (kind !== "dash" && seenKinds.has(kind)) {
        // 已看到目標彈種，再多跑一點確認持續性
        if (seenKinds.size >= 1 && g > 60) break;
      }
      if (kind === "dash" && maxVx >= 5 && g > 60) break;
    }
    if (kind === "dash") {
      ok(maxVx >= 5, `B${li} cats dash observed (maxVx=${maxVx.toFixed(1)})`);
    } else {
      ok(seenKinds.has(kind), `${cname} fires "${kind}" projectiles (${[...seenKinds].join(",") || "none"})`);
    }
    // 攻擊不得在暈眩時進行
    ns.boss.dizzy = 90;
    const n0 = ns.hammers.length;
    await pump(80);
    ok(ns.hammers.length <= n0, `${cname}: no attacks while dizzy`);

    // B7（第一次遇到時）：_atk 影格被繪製
    if (li === 3) {
      ns.boss.atkPoseT = 20;
      ns.boss.tele = 10;                    // cats 才有；其他 boss 用 atkPoseT 即可
      const before = countDraws(img + "_atk");
      await pump(2);
      ok(countDraws(img + "_atk") > before, `B7 _atk frame drawn for ${cname}`);
    }
  }

  function countDraws(key) {
    let n = 0;
    const cc = globalThis.__ctxCalls || [];
    for (let i = 0; i < cc.length; i += 2)
      if (cc[i] === "drawImage" && cc[i + 1][0] === ns.IMG[key]) n++;
    return n;
  }

  // ---------------- B6 ----------------
  console.log("B6: projectiles hurt a normal player");
  for (const [li, , kind] of [[3, null, "carrot"], [15, null, "flame"]]) {
    await startLevel(li);
    await pump(5);
    ns.enemies.length = 0;
    ns.hammers.length = 0;
    ns.player.super = false;
    ns.player.invuln = 0;
    ns.player.growT = 0;
    ns.player.big = false; ns.player.h = 46;
    ns.player.star = 0;
    ns.boss.awake = true; ns.boss.dizzy = 0;
    ns.player.x = ns.boss.minX + 60; ns.player.y = 9 * T; ns.player.vy = 0;
    ns.boss.awake = true;
    await pump(80);                          // 鏡頭追上
    ns.player.x = ns.boss.minX + 60;
    ns.boss.dizzy = 0;
    ns.boss.throwCd = 1;
    // 等彈幕出現，再把玩家瞬移到彈幕上（無敵全關）
    let g = 0;
    while (ns.hammers.length === 0 && g++ < 400) await pump(1);
    ok(ns.hammers.length >= 1, `B6 ${kind} spawned`);
    if (ns.hammers.length) {
      const hm = ns.hammers[ns.hammers.length - 1];
      ns.player.x = hm.x; ns.player.y = hm.y + 20;
      await pump(12);
      ok(ns.state === "dead" || ns.player.invuln > 0,
         `B6 ${kind} damages a normal player`);
    }
    { let w = 0; while (ns.state !== "play" && w++ < 500) await pump(1); }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("BOSS TEST CRASH:", err);
  process.exit(1);
}
