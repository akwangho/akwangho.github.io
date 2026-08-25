#!/usr/bin/env node
/**
 * 地震下壓（ground pound）專項測試：
 *   P1 小隻角色空中按下 → 不觸發
 *   P2 大隻空中新按下 → 觸發、急降更快、橫向急減、落地震動
 *   P3 地面已按住下再跳 → 不觸發（需空中新按）
 *   P4 空地落地：只有震動＋塵土，地形不變
 *   P5 下壓磚塊 → 破壞＋碎片
 *   P6 下壓問號磚(M) → 變 used、獎勵擠出並吃到火焰花
 *   P7 下壓命中敵人 → 擊殺、彈起、無傷
 *   P8 落點兩側敵人被衝擊波／貫穿一起擊倒
 *   P9 水管頂下壓：不破壞、只震動
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
  p.super = true;                 // 避免意外死亡干擾測試
  p.fire = false; p.star = 0; p.invuln = 0;
  ku("ArrowLeft"); ku("ArrowRight"); ku("ArrowDown"); ku("Space");
}

function placeBig(x, y) {
  const p = ns.player;
  p.big = true; p.h = 72; p.fire = false;
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.crouching = false; p.pounding = false; p.downHeld = false;
  p.growT = 0; p.growMode = null;
  p.onGround = false;                      // 瞬移到空中：清除前幀落地狀態
}

async function waitLand(maxF = 240) {
  let g = 0;
  while (!ns.player.onGround && g++ < maxF) await pump(1);
  return g < maxF;
}

try {
  await waitTitle();
  // 解鎖 Konami（與實戰環境一致）
  const kseq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  for (const c of kseq) await tap(c);
  await tap("Enter"); await pump(5);
  ok(ns.state === "play", "game started on 1-1");

  // ---------------- P1 ----------------
  console.log("P1: small player never pounds");
  await fresh();
  ns.player.big = false; ns.player.h = 46;
  ns.player.x = 6 * T + 24; ns.player.y = 7 * T; ns.player.vy = 0;
  kd("Space"); await pump(2); ku("Space");
  ok(!ns.player.onGround, "P1 airborne");
  kd("ArrowDown"); await pump(2);
  ok(ns.player.pounding !== true, "P1 small: pound NOT engaged");
  const smallVy = ns.player.vy;
  ku("ArrowDown"); await waitLand(); await pump(2);

  // ---------------- P2 ----------------
  console.log("P2: big airborne fresh-Down engages fast pound");
  await fresh();
  placeBig(6 * T + 24, 7 * T);
  kd("Space"); await pump(2); ku("Space");
  kd("ArrowDown"); await pump(2);
  ok(ns.player.pounding === true, "P2 pound engaged");
  ok(ns.player.vy >= Math.max(9, smallVy + 4), `P2 falls faster (pound vy=${ns.player.vy.toFixed(1)} vs small ${smallVy.toFixed(1)})`);
  await pump(6);
  ok(Math.abs(ns.player.vx) < 0.4, `P2 horizontal drift damped (vx=${ns.player.vx.toFixed(2)})`);
  ku("ArrowDown");
  ok(await waitLand(), "P2 landed");
  ok(ns.shakeT > 0, `P2 landing shakes screen (shakeT=${ns.shakeT})`);
  ok(ns.player.pounding === false, "P2 pound ends on landing");

  // ---------------- P3 ----------------
  console.log("P3: Down held from ground jump does NOT pound");
  await fresh();
  placeBig(6 * T + 24, 9 * T);
  await pump(2);
  kd("ArrowDown"); await pump(4);          // 先蹲
  kd("Space"); await pump(6);              // 按住下跳躍
  ok(!ns.player.onGround, "P3 airborne while holding Down");
  ok(ns.player.pounding !== true, "P3 held-Down jump does not trigger pound");
  ku("Space"); ku("ArrowDown");
  await waitLand(); await pump(2);

  // ---------------- P4 ----------------
  console.log("P4: bare-ground impact = shake + dust, terrain intact");
  await fresh();
  placeBig(8 * T + 24, 6 * T);
  const snap = ns.grid.map((row) => Array.from(row));
  kd("Space"); await pump(1); ku("Space");
  kd("ArrowDown");                          // 空中新按下（懸空 vy 小也會觸發）
  await waitLand();
  ku("ArrowDown");
  ok(ns.shakeT > 0, `P4 impact shake (shakeT=${ns.shakeT})`);
  let gridSame = true;
  for (let ty = 0; ty < ns.ROWS; ty++)
    for (let tx = 0; tx < ns.levelW; tx++)
      if (snap[ty][tx] !== ns.grid[ty][tx]) gridSame = false;
  ok(gridSame, "P4 terrain unchanged on bare ground");
  ok(ns.particles.some(pt => pt.type === "smoke"), "P4 dust puffs spawned");

  // ---------------- P5 ----------------
  console.log("P5: pound smashes brick");
  await fresh();
  placeBig(24 * T + 24, 3 * T);
  ns.grid[6][24] = 4;                       // 玩家正下方造磚
  kd("ArrowDown");
  await waitLand();                         // 第一次落地 = 磚塊頂
  ku("ArrowDown");
  ok(ns.grid[6][24] === 0, "P5 brick destroyed by pound");
  ok(ns.particles.some(pt => pt.type === "shard"), "P5 brick shards fly");
  await waitLand(); await pump(4);          // 掉回地面

  // ---------------- P6 ----------------
  console.log("P6: pound squeezes rewards out of ?-blocks");
  await fresh();
  const ban0 = ns.bananaCount;
  placeBig(24 * T + 24, 3 * T);
  ns.grid[6][24] = 5;                       // ? 磚（香蕉獎勵）
  kd("ArrowDown");
  await waitLand();
  ku("ArrowDown");
  ok(ns.grid[6][24] === 8, "P6a ? block spent (used tile)");
  ok(ns.bananaCount === ban0 + 1, `P6a reward squeezed out (+${ns.bananaCount - ban0} banana)`);
  await waitLand(); await pump(4);

  await fresh();
  placeBig(24 * T + 24, 3 * T);
  ns.grid[6][24] = 6;                       // M 問號磚（火焰花）
  kd("ArrowDown");
  await waitLand();
  ku("ArrowDown");
  ok(ns.grid[6][24] === 8, "P6b M block spent (used tile)");
  let g6 = 0;
  while (!ns.player.fire && g6++ < 200) await pump(1);
  ok(ns.player.fire === true, "P6b flower absorbed -> fire form");
  await pump(40);

  // ---------------- P7 ----------------
  console.log("P7: pound onto enemy kills it, player bounces unharmed");
  await fresh();
  ns.player.super = false;                  // 驗證真的無傷
  placeBig(30 * T + 24, 7 * T);
  ns.enemies.push({ x: 30 * T + 24, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 0, active: true, dead: false, hitDir: 0 });
  const sc0 = ns.score;
  kd("ArrowDown");
  let g7 = 0;
  while (g7++ < 240 && !(ns.enemies[0].dead)) await pump(1);
  ok(ns.enemies[0].dead === true, "P7 enemy killed by pound");
  ok(ns.score > sc0, `P7 stomp score awarded (+${ns.score - sc0})`);
  g7 = 0;
  while (!(ns.player.vy < -4) && g7++ < 60) await pump(1);
  ok(g7 < 60 || ns.player.vy < -4, "P7 bounce impulse after pound kill");
  ku("ArrowDown");
  ok(ns.state === "play", "P7 player unharmed");
  await waitLand(); await pump(4);

  // ---------------- P8 ----------------
  console.log("P8: flanking enemies crushed via pierce/shockwave");
  await fresh();
  ns.player.super = false;
  placeBig(40 * T + 24, 5 * T);
  ns.enemies.push({ x: 40 * T + 24 - 26, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 2, active: true, dead: false, hitDir: 0 });
  ns.enemies.push({ x: 40 * T + 24 + 26, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 4, active: true, dead: false, hitDir: 0 });
  kd("ArrowDown");
  let g8 = 0;
  while (g8++ < 400 && !(ns.enemies[0].dead && ns.enemies[1].dead)) await pump(1);
  ku("ArrowDown");
  ok(ns.enemies[0].dead && ns.enemies[1].dead,
     `P8 both enemies dead (${ns.enemies[0].dead}/${ns.enemies[1].dead})`);
  ok(ns.state === "play", "P8 player safe");

  // ---------------- P9 ----------------
  console.log("P9: pounding a pipe top is safe & non-destructive");
  await fresh();
  placeBig(29 * T, 5 * T);                  // pipe(28,2): cols28-29，頂 row7
  kd("ArrowDown");
  await waitLand();
  ku("ArrowDown");
  ok(ns.grid[7][28] === 9 && ns.grid[7][29] === 9, "P9 pipe tiles intact");
  ok(ns.state === "play" && ns.player.onGround, "P9 standing on pipe, alive");

  // ---------------- P10: 下壓後立即跳（landing buffer）----------------
  console.log("P10: jump buffered just before pound landing fires immediately");
  await fresh();
  placeBig(102 * T + 24, 5 * T);            // 1-1 長直線上空
  kd("ArrowDown"); await pump(3);
  ok(ns.player.pounding === true, "P10 pounding");
  let g10 = 0;
  while (ns.player.y < 8 * T && g10++ < 200) await pump(1);   // 接近地面
  kd("Space");                              // 落地前輸入跳躍（buffer 7f 內落地）
  await waitLand();
  g10 = 0;
  while (ns.player.onGround && g10++ < 20) await pump(1);
  ku("ArrowDown"); ku("Space");
  ok(!ns.player.onGround && ns.player.vy < -4, "P10 buffered jump launched right after pound landing");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("POUND TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
