#!/usr/bin/env node
/** 按鍵組合邊際測試：在乾淨受控環境下驗證各種同時/連續按鍵的行為。 */
import { boot } from "./harness.mjs";

const { ns, kd, ku, pump, tap, waitTitle } = await boot();
const T = ns.TILE;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

// 每組測試前的乾淨環境：重進 1-1、清空敵人、關閉方向鍵
async function kSetup() {
  globalThis.__drv.setLevel(0);
  if (ns.state === "title") { await tap("Enter"); }
  await pump(3);
  ns.enemies.length = 0;
  ns.player.super = true;
  ns.player.big = false; ns.player.h = 46;
  ku("ArrowLeft"); ku("ArrowRight"); ku("ArrowDown"); ku("Space"); ku("ShiftLeft");
}

try {
  await waitTitle();
  // 解鎖 Konami（K7 需要在遊戲中輸入作弊碼）
  const kseq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  for (const c of kseq) await tap(c);
  await tap("ArrowLeft"); await tap("ArrowRight");   // 清掉殘留序列
  ok(ns.konamiOn === true, "konami unlocked for combo tests");

  // ---------------- K1: Left+Right 同時按住 ----------------
  console.log("K1: Left+Right held together");
  await kSetup();
  ns.player.x = 6 * T + 24; ns.player.y = 9 * T;
  await pump(2);
  const kx0 = ns.player.x;
  kd("ArrowLeft"); kd("ArrowRight"); await pump(15);
  ok(Math.abs(ns.player.x - kx0) < 4, `no movement when L+R held (dx=${(ns.player.x - kx0).toFixed(1)})`);
  ku("ArrowLeft"); await pump(8); ku("ArrowRight");
  ok(ns.player.vx > 0.5 || Math.abs(ns.player.vx) > 0.5, "releases into clean motion");

  // ---------------- K2: 落地前按跳躍（jump buffer） ----------------
  console.log("K2: jump buffered before landing fires immediately");
  await kSetup();
  kd("Space"); await pump(3); ku("Space");          // 第一次跳躍
  let landed = -1, rejump = false;
  for (let i = 0; i < 120 && !rejump; i++) {
    await pump(1);
    if (ns.player.onGround && landed === -1) {
      landed = i;
      kd("Space");                                   // 落地瞬間立刻再按 → buffer 生效
      continue;
    }
    if (landed !== -1 && !ns.player.onGround && ns.player.vy < -4) { rejump = true; break; }
    if (landed !== -1 && i - landed > 25) break;     // 沒有二段跳 → buffer 失效
  }
  ku("Space");
  ok(landed >= 0, "first jump landed");
  ok(rejump, "second jump fired immediately via input buffer");

  // ---------------- K3: 大角色在天花板下蹲姿跳躍 ----------------
  console.log("K3: big crouch-jump under ceiling stays sane");
  await kSetup();
  ns.player.big = true; ns.player.h = 72;
  ns.player.x = 10.5 * T + 24; ns.player.y = 9 * T;
  await pump(2);
  ns.grid[7][10] = 1; ns.grid[7][11] = 1;
  kd("ArrowDown"); await pump(3);
  const yCrouch = ns.player.y;
  kd("Space"); await pump(8);
  ok(Number.isFinite(ns.player.y) && ns.player.y >= 7 * T - 1,
     `head bonk keeps player under ceiling (y=${ns.player.y.toFixed(1)})`);
  ok(ns.player.crouching === true, `still crouching under ceiling (down=${ns.keys.down})`);
  ku("Space"); ku("ArrowDown");
  ns.grid[7][10] = 0; ns.grid[7][11] = 0;
  await pump(4);

  // ---------------- K4: 跑步跳比走路跳遠 ----------------
  console.log("K4: run-jump farther than walk-jump");
  async function jumpDistance(withRun) {
    await kSetup();
    ns.player.x = 100 * T + 24; ns.player.y = 9 * T;        // 1-1 cols 99-116 長直線
    await pump(2);
    if (withRun) kd("ShiftLeft");
    kd("ArrowRight"); await pump(16);                       // 加速
    const sx = ns.player.x;
    kd("Space"); await pump(2);
    let gJ = 0;
    while (!ns.player.onGround && gJ++ < 120) await pump(1);
    ku("Space"); if (withRun) ku("ShiftLeft"); ku("ArrowRight"); await pump(2);
    return ns.player.x - sx;
  }
  const walkD = await jumpDistance(false);
  const runD = await jumpDistance(true);
  ok(runD > walkD * 1.1, `run jump (${Math.round(runD)}) beats walk jump (${Math.round(walkD)})`);

  // ---------------- K5: 連打 Space 25 次 ----------------
  console.log("K5: rapid space mashing stays finite");
  await kSetup();
  let airTransitions = 0, wasAirM = false;
  for (let i = 0; i < 50; i++) {
    if (i % 2 === 0) kd("Space"); else ku("Space");
    await pump(1);
    const airNow = !ns.player.onGround;
    if (airNow && !wasAirM) airTransitions++;
    wasAirM = airNow;
    if (!Number.isFinite(ns.player.y)) break;
  }
  ku("Space");
  ok(airTransitions >= 3, `rapid mashing produced jumps (${airTransitions})`);
  ok(Number.isFinite(ns.player.y), "position finite throughout mashing");

  // ---------------- K6: 死亡動畫期間亂按不會出事 ----------------
  console.log("K6: inputs during death animation are safe");
  await kSetup();
  ns.player.super = false;                                   // 讓死亡可以發生
  ns.player.y = 9999; await pump(6);
  kd("ArrowLeft"); kd("Space"); kd("ArrowRight"); kd("ArrowDown"); kd("KeyX");
  await pump(10);
  ku("ArrowLeft"); ku("Space"); ku("ArrowRight"); ku("ArrowDown"); ku("KeyX");
  ok(["dead", "play"].includes(ns.state), "state machine unaffected by inputs during death");
  let gK6 = 0; while (ns.state === "dead" && gK6++ < 400) await pump(1);
  ok(ns.state === "play", "respawned normally after death anim");

  // ---------------- K7: fly 重複輸入切換 ----------------
  console.log("K7: repeated 'fly' toggles ability");
  await kSetup();
  const flyB = ns.player.fly;
  for (const c of ["KeyF", "KeyL", "KeyY"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.fly === !flyB, "first fly-sequence toggles");
  for (const c of ["KeyF", "KeyL", "KeyY"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.fly === flyB, "second fly-sequence toggles back");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("COMBO TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
