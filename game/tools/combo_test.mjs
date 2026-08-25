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
  ns.player.big = false; ns.player.h = 46;
  ku("ArrowLeft"); ku("ArrowRight"); ku("ArrowDown"); ku("Space"); ku("ShiftLeft");
  if (!ns.player.super) {
    // 用輸入指令開啟無敵，確保 cheatSuper 旗標同步（之後可正確切換）
    for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  }
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

  // ---------------- K8: 'big' 作弊：小→大→火焰花＋火球 ----------------
  console.log("K8: 'big' cheat: small -> big -> fire + fireball");
  await kSetup();
  ok(ns.player.big === false && ns.player.fire === false, "K8 starts small & not fire");
  for (const c of ["KeyB", "KeyI", "KeyG"]) { kd(c); await pump(1); ku(c); await pump(1); }
  let g8 = 0;
  while (!ns.player.big && g8++ < 100) await pump(1);
  ok(ns.player.big === true && ns.player.h === 72, "K8 first input grows like mushroom");
  ns.enemies.length = 0;                                  // 變大後清場避免碰撞雜訊
  await pump(2);
  for (const c of ["KeyB", "KeyI", "KeyG"]) { kd(c); await pump(1); ku(c); await pump(1); }
  g8 = 0;
  while (!ns.player.fire && g8++ < 100) await pump(1);
  ok(ns.player.fire === true && ns.player.big === true, "K8 second input grants fire flower");
  kd("KeyX"); await pump(2); ku("KeyX"); await pump(2);
  ok(ns.shots.length >= 1, `K8 fireball thrown (${ns.shots.length})`);
  const fireB = ns.player.fire, bigB = ns.player.big, xB = ns.player.x;
  for (const c of ["KeyB", "KeyI", "KeyG"]) { kd(c); await pump(1); ku(c); await pump(1); }
  await pump(45);
  ok(ns.player.fire === fireB && ns.player.big === bigB && Number.isFinite(ns.player.x),
     "K8 extra input at max power is harmless");
  // 部分輸入 "bi" 不會誤觸，也不影響後續
  kd("KeyB"); await pump(1); ku("KeyB"); kd("KeyI"); await pump(1); ku("KeyI");
  kd("ArrowRight"); await pump(3); ku("ArrowRight");
  await pump(120);                                        // 等 cheat idle 清空
  ok(ns.player.big === bigB && ns.paused === false, "K8 partial 'bi' harmless, no pause");

  // ---------------- K9: 空中連打 Down 觸發多次下壓，座標有限 ----------------
  console.log("K9: airborne Down-mash chains pounds safely");
  await kSetup();
  ns.player.big = true; ns.player.h = 72;
  ns.player.x = 103 * T + 24; ns.player.y = 6 * T;        // 1-1 長直線上空（避開 100-101 的磚）
  ns.player.onGround = false;
  await pump(1);
  let sawPound = false, mashOk = true, poundLandings = 0, wasPounding = false;
  for (let i = 0; i < 90; i++) {
    if (i % 8 === 0) kd("ArrowDown");
    else if (i % 8 === 4) ku("ArrowDown");
    await pump(1);
    if (ns.player.pounding) sawPound = true;
    if (wasPounding && !ns.player.pounding) poundLandings++;
    wasPounding = ns.player.pounding;
    if (!Number.isFinite(ns.player.x) || !Number.isFinite(ns.player.y)) { mashOk = false; break; }
    if (ns.state !== "play") break;
  }
  ku("ArrowDown");
  ok(mashOk, "K9 coordinates finite during mash");
  ok(sawPound, "K9 pound state observed while mashing Down");
  ok(poundLandings >= 1, `K9 pounds resolved on landing (${poundLandings})`);

  // ---------------- K10: 下壓時按住 Left+Right → 垂直直落 ----------------
  console.log("K10: pound with Left+Right held drops straight");
  await kSetup();
  ns.player.big = true; ns.player.h = 72;
  ns.player.x = 102 * T + 24; ns.player.y = 6 * T; ns.player.vx = 3;
  ns.player.onGround = false;
  kd("ArrowLeft"); kd("ArrowRight"); kd("ArrowDown");
  await pump(3);
  ok(ns.player.pounding === true, "K10 pound engages despite L+R held");
  const k10x = ns.player.x;
  await pump(6);
  ok(Math.abs(ns.player.x - k10x) < 6, `K10 near-vertical drop (dx=${(ns.player.x - k10x).toFixed(1)})`);
  ku("ArrowLeft"); ku("ArrowRight"); ku("ArrowDown");
  let g10c = 0;
  while (!ns.player.onGround && g10c++ < 200) await pump(1);
  ok(ns.player.onGround && ns.state === "play", "K10 lands safely");

  // ---------------- K11: 下壓撞敵人彈起後立刻轉向逃跑 ----------------
  console.log("K11: pound-stomp bounce then steer away safely");
  await kSetup();
  ns.player.super = false;
  ns.player.big = true; ns.player.h = 72;
  ns.player.x = 30 * T + 24; ns.player.y = 7 * T;
  ns.player.onGround = false;
  ns.enemies.push({ x: 30 * T + 24, y: 9 * T, vx: 0, vy: 0, w: 36, h: 40,
    state: "walk", t: 0, active: true, dead: false, hitDir: 0 });
  kd("ArrowDown"); await pump(2);
  let g11 = 0;
  while (g11++ < 200 && !(ns.player.vy < -4)) await pump(1);   // 彈起
  ku("ArrowDown");
  kd("ArrowLeft");                                             // 彈起瞬間反向
  let g11b = 0;
  while (g11b++ < 240 && !(ns.player.onGround)) await pump(1);
  ku("ArrowLeft");
  ok(g11b < 240 || ns.player.onGround, "K11 landed after bounce-steer");
  ok(ns.state === "play" || ns.enemies[0].dead, "K11 unharmed after pound-kill bounce");

  // ---------------- K12: Super 無敵 × 岩漿：可行走、下壓安全 ----------------
  console.log("K12: super walks on lava + pounds it safely");
  await kSetup();
  for (let x = 30; x <= 33; x++) { ns.grid[9][x] = 10; ns.grid[10][x] = 10; }
  ns.player.x = 30 * T + 24; ns.player.y = 9 * T; ns.player.vx = 0;
  kd("ShiftRight"); kd("ArrowRight");
  let g12 = 0;
  while (g12++ < 200 && ns.player.x < 34 * T + 20 && ns.state === "play") await pump(1);
  ku("ArrowRight"); ku("ShiftRight");
  ok(ns.player.x >= 34 * T + 16, `K12 walked across lava (x=${ns.player.x.toFixed(0)})`);
  ok(ns.state === "play", "K12 alive after lava walk");
  // 無敵下壓岩漿表面（大隻才能下壓）
  ns.player.x = 31 * T + 24; ns.player.y = 6 * T; ns.player.vy = 0;
  ns.player.vx = 0;
  ns.player.big = true; ns.player.h = 72;
  ns.player.onGround = false; ns.player.downHeld = false;
  kd("ArrowDown");
  let g12b = 0;
  while (!ns.player.onGround && g12b++ < 200) await pump(1);
  const shakeAtImpact = ns.shakeT;
  ku("ArrowDown");
  ok(ns.state === "play" && Math.abs(ns.player.y - 9 * T) < 2, `K12 pounded onto lava safely (y=${ns.player.y.toFixed(1)})`);
  ok(shakeAtImpact > 0 || ns.shakeT > 0, `K12 impact shake present on lava pound (shakeT=${shakeAtImpact})`);

  // ---------------- K13: Super 關閉後岩漿恢復致命 ----------------
  console.log("K13: toggling super off restores lava lethality");
  for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
  ok(ns.player.super === false && ns.cheatSuper === false, "K13 super off via input");
  ns.player.x = 32 * T + 24; ns.player.y = 8 * T; ns.player.vx = 0; ns.player.vy = 5;
  ns.player.invuln = 0;
  let g13 = 0;
  while (g13++ < 120 && ns.state === "play") await pump(1);
  ok(ns.state === "dead", "K13 lava kills non-super player again");
  { let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1); }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("COMBO TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
