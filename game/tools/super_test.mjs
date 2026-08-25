#!/usr/bin/env node
/**
 * SUPER 無敵模式專項測試：
 *   S1 無敵時從空中落到岩漿 → 站在岩漿表面上，不被救援
 *   S2 無敵時用走的横渡岩漿 → 到達對岸
 *   S3 無敵關閉後岩漿恢復致命（迴歸）
 *   S4 火球穿過無敵玩家（不消失、不傷害）
 *   S5 鎖鏈錘穿過無敵玩家
 *   S6 無敵時倒數時間凍結；關閉後恢復走動
 *   S7 下壓遮蔽：磚塊下方的怪物不受衝擊波傷害；無遮蔽的怪物會被擊倒
 *   S8 無敵時下壓岩漿表面：只有震動、安全無事
 */
import { boot } from "./harness.mjs";

const { ns, kd, ku, pump, tap, waitTitle } = await boot();
const T = ns.TILE;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

async function fresh() {
  globalThis.__drv.setLevel(0);
  if (ns.state === "title") { await tap("Enter"); await pump(5); }
  await pump(2);
  ns.enemies.length = 0;
  const p = ns.player;
  p.super = true; p.fire = false; p.star = 0; p.invuln = 0;
  p.big = true; p.h = 72;
  ku("ArrowLeft"); ku("ArrowRight"); ku("ArrowDown"); ku("Space"); ku("ShiftLeft");
}

function carveLava(a, b) {
  for (let x = a; x <= b; x++) { ns.grid[9][x] = 10; ns.grid[10][x] = 10; }
}

try {
  await waitTitle();
  const kseq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  for (const c of kseq) await tap(c);
  await tap("Enter"); await pump(5);
  ok(ns.state === "play", "game started");

  // ---------------- S1 ----------------
  console.log("S1: super falls onto lava and STANDS on it");
  await fresh();
  carveLava(18, 28);                        // 避開磚塊群（cols21-25）與問號磚（row3 col23）
  ns.player.x = 27 * T + 12; ns.player.y = 3 * T; ns.player.vy = 0;
  ns.player.onGround = false;
  let g1 = 0;
  while (!ns.player.onGround && g1++ < 200) await pump(1);
  ok(ns.player.onGround && Math.abs(ns.player.y - 9 * T) < 2,
     `S1 standing ON lava surface (y=${ns.player.y.toFixed(1)})`);
  ok(ns.state === "play" && ns.player.invuln < 90, "S1 no rescue/invuln triggered");
  await pump(30);
  ok(ns.state === "play", "S1 still alive standing on lava after 30f");

  // ---------------- S2 ----------------
  console.log("S2: super walks across the lava span");
  ns.player.x = 15 * T + 24; ns.player.y = 9 * T; ns.player.vx = 0;
  await pump(2);
  kd("ShiftLeft"); kd("ArrowRight");
  let g2 = 0;
  while (g2++ < 240 && ns.player.x < 26 * T + 40 && ns.state === "play") await pump(1);
  ku("ArrowRight"); ku("ShiftLeft");
  ok(ns.player.x >= 26 * T + 36, `S2 crossed to the far side (x=${ns.player.x.toFixed(0)})`);
  ok(ns.state === "play", "S2 alive after crossing");
  await pump(2);

  // ---------------- S3 ----------------
  console.log("S3: without super the same lava is lethal (regression)");
  ns.player.super = false;
  ns.player.x = 23 * T + 24; ns.player.y = 8 * T; ns.player.vx = 0; ns.player.vy = 4;
  let g3 = 0;
  while (g3++ < 120 && ns.state === "play") await pump(1);
  ok(ns.state === "dead", "S3 lava kills a non-super player");
  { let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1); }

  // ---------------- S4 ----------------
  console.log("S4: fireballs pass through a super player");
  await fresh();
  ns.player.x = 10 * T + 24; ns.player.y = 9 * T; ns.player.vy = 0;
  ns.enemies.push({ x: 10 * T + 24, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 0, active: true, dead: false, hitDir: 0 });   // 擋住玩家不亂跑
  ns.fireballs.push({ x: ns.player.x + 60, y: 9 * T - 40, y0: 9 * T, vy: -2, t: 0 });
  const fb0 = ns.fireballs.length;
  await pump(30);
  ok(ns.state === "play", "S4 unharmed by fireball contact");
  ok(ns.fireballs.length === fb0 || ns.fireballs.length === fb0 - 1,
     `S4 fireball not instantly consumed (${ns.fireballs.length}/${fb0})`);
  ns.enemies.length = 0;

  // ---------------- S5 ----------------
  console.log("S5: hammers pass through a super player");
  globalThis.__drv.setLevel(3);            // 1-4 castle（boss 關有 hammers 陣列）
  await pump(3);
  ns.enemies.length = 0;
  {
    const p = ns.player;
    p.super = true; p.big = true; p.h = 72;
    p.x = 20 * T; p.y = 9 * T; p.vx = 0; p.vy = 0;
    ns.hammers.push({ x: p.x, y: p.y - 40, vx: 0, vy: 0, t: 380 });   // 幾乎超時的錘
    await pump(6);
    ok(ns.state === "play", "S5 unharmed by hammer contact");
  }

  // ---------------- S6 ----------------
  console.log("S6: countdown freezes while super, resumes after toggling off");
  globalThis.__drv.setLevel(0);
  await pump(2);
  ns.enemies.length = 0;
  {   // 用「輸入指令」開啟，確保 cheatSuper 旗標同步
    for (const c of ["KeyS","KeyU","KeyP","KeyE","KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  }
  ok(ns.player.super === true, "S6 super enabled via cheat input");
  const t0 = ns.timeLeft;
  await pump(110);
  ok(ns.timeLeft === t0, `S6 time frozen during super (${t0} -> ${ns.timeLeft})`);
  for (const c of ["KeyS","KeyU","KeyP","KeyE","KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.super === false && ns.paused === false, "S6 super toggled off cleanly");
  const t1 = ns.timeLeft;
  await pump(110);
  ok(ns.timeLeft <= t1 - 3, `S6 time resumes after off (${t1} -> ${ns.timeLeft})`);

  // ---------------- S7 ----------------
  console.log("S7: pound shockwave blocked by bricks above the enemy");
  await fresh();
  ns.player.super = false;                 // 下壓與無敵互不相干，關閉以貼近實戰
  ns.enemies.length = 0;
  for (let x = 30; x <= 32; x++) ns.grid[6][x] = 4;   // 磚架 row6 cols30-32
  const walkerB = { x: 38 * T + 24, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 0, active: true, dead: false, hitDir: 0 };    // 無遮蔽開闊地
  const walkerA = { x: 30 * T + 36, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 0, active: true, dead: false, hitDir: 0 };    // 磚架正下方走廊
  ns.enemies.push(walkerA);
  ns.enemies.push(walkerB);
  // S7a：壓在磚架上 → 架下walker免疫
  ns.player.x = 31 * T + 24; ns.player.y = 3 * T; ns.player.vy = 6;
  ns.player.onGround = false;
  kd("ArrowDown");
  let g7 = 0;
  while (!ns.player.onGround && g7++ < 200) await pump(1);
  await pump(4);
  ku("ArrowDown");
  await pump(3);                            // 讓遊戲登記「已放開」（否則 downHeld 殘留）
  ok(walkerA.dead !== true && walkerA.state === "walk",
     `S7a occluded walker survived (state=${walkerA.state})`);
  ok(ns.shakeT > 0, `S7a pound impact happened (shakeT=${ns.shakeT})`);
  // S7b：壓在開闊地 walker 旁邊 → 被擊倒（落點貼著他，漂移不會脫離半徑）
  walkerB.x = 38 * T + 24; walkerB.y = 9 * T;
  ns.player.x = walkerB.x; ns.player.y = 5 * T; ns.player.vy = 6;
  ns.player.onGround = false; ns.player.downHeld = false;
  kd("ArrowDown");
  g7 = 0;
  while (g7++ < 300 && !(walkerB.dead)) await pump(1);
  ku("ArrowDown");
  ku("ArrowDown");
  ok(walkerB.dead === true, "S7b exposed walker crushed by shockwave");
  ok(ns.state === "play", "S7 player safe throughout");
  { let g = 0; while (!ns.player.onGround && g++ < 200) await pump(1); await pump(4); }

  // ---------------- S8 ----------------
  console.log("S8: pounding a lava surface while super is safe");
  await fresh();
  carveLava(18, 28);
  ns.player.x = 27 * T + 12; ns.player.y = 5 * T; ns.player.vy = 0;
  ns.player.onGround = false;
  kd("ArrowDown");
  let g8 = 0;
  while (!ns.player.onGround && g8++ < 200) await pump(1);
  ku("ArrowDown");
  ok(ns.state === "play" && ns.player.pounding === false, "S8 pound landed on lava safely");
  ok(Math.abs(ns.player.y - 9 * T) < 2, `S8 rested on lava surface (y=${ns.player.y.toFixed(1)})`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("SUPER TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
