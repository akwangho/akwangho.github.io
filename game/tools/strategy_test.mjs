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
  if (MODE === "grounded" || MODE === "pound") {
    for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
    ok(ns.player.super === true, `super enabled (${MODE})`);
    ns.player.big = true; ns.player.h = 72;      // 視同已吃蘑菇
  } else if (MODE === "fire") {
    for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) { kd(c); await pump(1); ku(c); await pump(1); }
    ns.player.fire = true; ns.player.big = true; ns.player.h = 72;
    ok(ns.player.fire === true, "fire flower enabled");
  }

  const cleared = [];
  let framesThisLevel = 0, lvlMaxX = -1, noProgress = 0;
  let jumpLatch = 0, jumpHold = 0, gapHold = false, lastRun = false, hopMode = 0, airF = 0, gapPlatR = 0, gapLandY = 0;
  let gapBrake = false, gapLaunchX = null;
  let fireCd = 0;
  let deaths = 0;
  let budget = 300000;
  let prev = ns.state;

  const CODE = { left: "ArrowLeft", right: "ArrowRight", jump: "Space", down: "ArrowDown", run: "ShiftLeft" };
  const held = { left: false, right: false, jump: false, down: false, run: false };
  const hold = (k, on) => {
    if (on && !held[k]) kd(CODE[k]);
    if (!on && held[k]) ku(CODE[k]);
    held[k] = on;
  };

  let lastLvlIdx = ns.levelIdx;
  while (cleared.length < ns.LEVELS.length && budget-- > 0) {
    // 過關偵測：levelIdx 前進 = 剛完成一關（涵蓋 flag→walkoff→clear 所有路徑）
    if (ns.levelIdx !== lastLvlIdx) {
      const done = ns.LEVELS[lastLvlIdx].name;
      cleared.push(done);
      console.log(`  CLEAR ${done} (${cleared.length}/16, score=${ns.score})`);
      lastLvlIdx = ns.levelIdx;
      noProgress = 0; lvlMaxX = -1;
    }
    const st = ns.state;
    if (st !== "play") {
      if (st === "clear") {
        let g = 0;
        while (ns.state === "clear" && g++ < 4000) { await pump(1); if (g > 130 && g % 30 === 0) kd("Enter"); }
        ku("Enter"); await pump(6);
        prev = ns.state; continue;
      }
      if (st === "dead") { deaths++; let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1); prev = ns.state; continue; }
      // flag / walkoff / title / ending …：必須持續推進動畫，否則會空轉燒光預算
      if (st === "title" || st === "gameover") { kd("Enter"); await pump(3); ku("Enter"); }
      else await pump(1);
      prev = ns.state; continue;
    }
    if (prev !== "play") { framesThisLevel = 0; lvlMaxX = -1; noProgress = 0; }
    framesThisLevel++;
    const p = ns.player;
    // 死亡重生會失去蘑菇／火花：立即補回（測試策略需要固定體型）
    if (!p.big || (MODE === "fire" && !p.fire)) {
      if (MODE === "fire") { p.big = true; p.fire = true; }
      else { p.big = true; }
      p.h = p.crouching ? 46 : 72;
    }
    if (p.x > lvlMaxX + 2) { lvlMaxX = p.x; noProgress = 0; } else noProgress++;
    if (noProgress > 16000) {
      fail++; console.log(`  FAIL ${ns.LEVELS[ns.levelIdx].name}: stuck at (${Math.round(p.x)},${Math.round(p.y)})`);
      console.log(`    [dump] st=${ns.state} vx=${p.vx.toFixed(2)} vy=${p.vy.toFixed(2)} onG=${p.onGround} crouch=${p.crouching} pound=${p.pounding} keys=${JSON.stringify(ns.keys)} latch=${jumpLatch} super=${p.super} big=${p.big} fly=${p.fly}`);
      const dFoot = Math.max(0, Math.floor((p.y - 1) / T));
      const cx0 = Math.max(0, Math.floor(p.x / T) - 3);
      for (let ty = Math.max(0, dFoot - 5); ty <= Math.min(ns.ROWS - 1, dFoot + 2); ty++) {
        let row = `    row${ty}: `;
        for (let tx = cx0; tx <= cx0 + 9; tx++) row += String(ns.grid[ty][tx]).padEnd(2);
        console.log(row);
      }
      for (const en of ns.enemies) if (!en.dead && en.active && Math.abs(en.x - p.x) < 200)
        console.log(`    [enemy] @(${Math.round(en.x)},${Math.round(en.y)}) st=${en.state} kind=${en.kind || "-"}`);
      break;
    }
    if (noProgress > 0 && noProgress % 3000 === 0)
      console.log(`    [trace] ${ns.LEVELS[ns.levelIdx].name} nop=${noProgress} pos=(${Math.round(p.x)},${Math.round(p.y)}) t=${ns.timeLeft}`);

    // ---- 感知 ----
    const footTy = Math.max(0, Math.floor((p.y - 1) / T));
    const aheadTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 10) / T));
    const botSolidPre = (tx, ty) => ns.solidAt(tx, ty) || (p.super && ns.deadlyAt(tx, ty));
    const wallAhead = botSolidPre(aheadTx, footTy) || botSolidPre(aheadTx, footTy - 1);
    let floorAhead = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (botSolidPre(aheadTx, ty) || botSolidPre(Math.min(ns.levelW - 1, aheadTx + 1), ty)) { floorAhead = true; break; }
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

    // ---- 一般移動：jumpLatch 策略（障礙／深坑前 24f 長按跳，確保起跳完整）----
    const frontTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 4) / T));
    // SUPER 無敵時，岩漿／水是可行走地面
    const botSolid = (tx, ty) => ns.solidAt(tx, ty) || (p.super && ns.deadlyAt(tx, ty));
    let groundUnderFront = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (botSolid(frontTx, ty)) { groundUnderFront = true; break; }

    // 量測前方坑寬與落點高度：決定走路跳（短）或跑跳（遠／高）
    // 注意：隱藏磚（12/13）不算成路徑地板，否則會截斷落點平台寬度
    const colFloorTy = (cx) => {
      for (let ty = Math.max(0, footTy - 4); ty < ns.ROWS; ty++) {
        const c = ns.grid[ty][cx];
        if (c === 12 || c === 13) continue;
        if (p.super && (c === 10 || c === 11)) return ty;   // 無敵：液面可站立
        if (c !== 0 && c !== 10 && c !== 11) return ty;
        if (c === 10 || c === 11) return -1;               // 岩漿／水＝沒有地板
      }
      return -1;
    };
    // 坑緣判定：正前方沒有地板就算抵達邊緣（提前偵測會讓起跳點後移、距離不足）
    const gapAtEdge = !floorAhead && !groundUnderFront;

    let gapW = 99, landRise = 0, landW = 0, gapStartCol = -1, gapLandTy = -1;
    {
      let i = frontTx;
      while (i < ns.levelW && colFloorTy(i) !== -1) i++;     // 先走完當前立足地板
      if (i >= ns.levelW) gapW = 0;
      else {
        gapStartCol = i;
        let j = i;
        while (j < ns.levelW && colFloorTy(j) === -1) j++;   // 數坑寬
        gapW = j - i;
        const lt = j < ns.levelW ? colFloorTy(j) : -1;
        // footTy 是身體行，支撐面是 footTy+1；landRise>0 代表落點比腳下高
        if (lt !== -1) {
          landRise = (footTy + 1) - lt;
          gapLandTy = lt;
          let k = j;                                         // 落點平台寬度
          while (k < ns.levelW && colFloorTy(k) === lt) { landW++; k++; }
        }
      }
    }

    // 坑緣武裝（量測後）：記錄起跳點、對岸平台右緣與落點高度，供滿跳與預測剎車使用
    const runwayOK = gapStartCol !== -1 && gapStartCol * T - p.x >= 96;   // 助跑是否足夠
    if (gapAtEdge && p.onGround) {
      if (!gapHold) gapLaunchX = p.x;
      gapHold = true;
      gapPlatR = (gapStartCol + gapW) * T;
      gapLandY = gapLandTy * T;
    } else if (p.onGround) {
      gapHold = false; gapPlatR = 0; gapLandY = 0;
    }

    // 跳躍 buffer 只吃 keydown 邊緣：持續按住不會二段起跳，
    // 因此落地後若仍卡住，強制放開一幀再重按（模擬玩家連打）
    // 牆壁要「貼近才跳」：過早起跳會飛越矮牆／水管，落進後方深坑
    const wallClose = wallAhead && (p.x + p.w / 2 + 16 >= aheadTx * T);
    // 量測牆高：≤2 格用「短跳」落在牆頂，更高的牆才滿弧越過（-1＝未量測）
    // 必須與 wallAhead 用同一欄（aheadTx），並從身體行（footTy）起掃，才含腳邊那格
    let wallH = -1;
    if (wallClose) {
      let ty = footTy;
      while (ty >= 0 && ns.solidAt(aheadTx, ty)) { wallH++; ty--; }
    }
    const needJump = wallClose || gapAtEdge;
    if (needJump) jumpLatch = 24;
    else if (jumpLatch > 0) jumpLatch--;
    // 短／中弧旗標：每個落地幀刷新。
    //  mode1＝矮牆或窄坑：滯空 10 幀放手（頂點約 160px），落在牆頂／浮磚上
    //  mode2＝頭頂有天花板：滯空 16 幀放手（頂點約 210px），避免滿跳 218px 撞頭截斷弧線落水
    //  深坑邊緣在無天花板時永遠滿弧
    if (p.onGround) {
      let lowCeil = false;
      {
        const cx = Math.floor(p.x / T);
        for (let ty = 0; ty <= footTy - 3 && !lowCeil; ty++)
          if (ty >= 0 && ns.solidAt(cx, ty)) lowCeil = true;
      }
      if (lowCeil) hopMode = 2;
      else if (wallClose && wallH >= 0 && wallH <= 2 && !gapAtEdge) hopMode = 1;
      else if (gapAtEdge && gapW >= 1 && gapW <= 2 && landRise <= 0) hopMode = 1;
      else hopMode = 0;
      if (!ns.keys.jump) airF = 0;
    }
    // 跳躍 buffer 只吃 keydown 邊緣：持續按住不會二段起跳，
    // 因此落地後若仍卡住，強制放開一幀再重按（模擬玩家連打）
    let wantJump = jumpLatch > 0 || gapHold;
    if (hopMode && !p.onGround) airF++;
    if (wantJump && hopMode && !p.onGround && airF >= (hopMode === 2 ? 16 : 10) && ns.player.vy < -6) wantJump = false;
    const jhMax = !floorAhead ? 4 : 12;   // 窄台／坑緣快速重按，長地面穩定節奏
    if (wantJump && ns.keys.jump && p.onGround && ++jumpHold > jhMax) { wantJump = false; jumpHold = 0; }
    else if (!ns.keys.jump) jumpHold = 0;
    hold("jump", wantJump);
    // 跑/走只在「落地時」依坑寬決定並凍結到下次落地，
    // 避免空中身體行變化導致重測而關掉跑步、縮短弧線
    if (p.onGround) {
      // 跑跳條件：遠坑／高差必跑；帶高度差的窄坑只在助跑足夠時跑（否則用穩定的走路小跳）
      lastRun = gapW >= 5 || landRise >= 2 ||
                ((gapW >= 4 || landRise >= 1) && (runwayOK || gapW >= 4));
    }
    // 深坑跳躍的空中剎車：過了坑約 3/4 且開始下墜 → 放開方向與跑步，精準落在對岸
    // 預測式空中剎車：下墜段若「預計落點」會衝過對岸平台右緣 → 放開 Shift
    // （max 鉗位把水平速度壓回走路速，讓他落在平台內；方向鍵保持向前）
    if (p.onGround) gapBrake = false;
    if (gapHold && !p.onGround && gapPlatR > 0 && gapLandY > 0 && ns.player.vy > 0) {
      const g = 0.55, vy = ns.player.vy;
      const dy = Math.max(0, p.y - gapLandY);
      const tFall = (vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
      const predX = p.x + ns.player.vx * tFall;
      if (predX > gapPlatR + 30) gapBrake = true;   // 只攔「明確飛過平台末端」的過衝
    }
    if (gapBrake) {
      ku("ShiftLeft"); held.run = false;
      hold("right", true); hold("left", false);
    } else {
      hold("right", true); hold("left", false); hold("run", lastRun);
    }
    // 坑緣保險：只要還站在坑邊，每幀強制「放開→重按」跳躍，
    // 保證 buffer 永遠新鮮、必定在邊緣起跳（杜絕按住舊鍵走下坑）
    if (gapAtEdge && p.onGround) {
      if (ns.keys.jump) { ku(CODE.jump); held.jump = false; }
      kd(CODE.jump); held.jump = true;
    }
    if (gapAtEdge && p.onGround && !ns.keys.jump) gapLaunchX = null;

    // 下壓流：空中且下方／前方近處有敵人 → 新按下鍵砸擊（貫穿擊殺）
    // 跨坑飛行中禁止下壓（短弧會讓跳距不足、落水）
    if (MODE === "pound" && !gapHold && !wallClose) {
      const foe = ns.enemies.find(en => !en.dead && en.active &&
        (en.state === "walk" || en.state === "fly" || en.state === "shell" || en.state === "slide") &&
        Math.abs(en.x - p.x) < 80 && en.y > p.y - 40);
      if (foe && !p.onGround && !held.down) { kd(CODE.down); held.down = true; }
    }
    if (held.down && (p.onGround || MODE !== "pound")) { ku(CODE.down); held.down = false; }

    // 火球流丟火球
    if (MODE === "fire" && fireCd <= 0 && enemyNear) { kd("KeyX"); fireCd = 40; }

    await pump(1);
    if (fireCd > 0) fireCd--;
    if (process.env.STLVL !== undefined && ns.levelIdx === +process.env.STLVL && !p.onGround && ns.frame % 4 === 0)
      console.log(`    [air] ${ns.LEVELS[ns.levelIdx].name} x=${p.x | 0} y=${p.y | 0} vx=${p.vx.toFixed(1)} vy=${p.vy.toFixed(1)} j=${ns.keys.jump ? 1 : 0} r=${ns.keys.run ? 1 : 0} gb=${gapBrake ? 1 : 0} gh=${gapHold ? 1 : 0} gw=${gapW}`);
    if (process.env.STLVL !== undefined && ns.levelIdx === +process.env.STLVL && p.onGround && ns.frame % 10 === 0)
      console.log(`    [bot] ${ns.LEVELS[ns.levelIdx].name} x=${p.x | 0} y=${p.y | 0} vx=${p.vx.toFixed(1)} latch=${jumpLatch} gh=${gapHold ? 1 : 0} gw=${gapW} lr=${landRise} run=${lastRun ? 1 : 0} kr=${ns.keys.right ? 1 : 0} hw=${p.hitWall ? 1 : 0} t=${ns.timeLeft}`);

    if (st === "play" && ns.state === "dead") {
      deaths++;
      console.log(`  DEATH #${deaths} on ${ns.LEVELS[ns.levelIdx].name} at frame ${framesThisLevel}`);
      let g = 0; while (ns.state === "dead" && g++ < 400) await pump(1);
    }
    prev = ns.state;
  }
  for (const k of ["left", "right", "jump", "down", "run"]) hold(k, false);

  // 最終關（4-4）完成時 levelIdx 不會前進，而是直接進入結局：補記一筆
  if (ns.state === "ending" && cleared.length === ns.LEVELS.length - 1) {
    const done = ns.LEVELS[ns.LEVELS.length - 1].name;
    cleared.push(done);
    console.log(`  CLEAR ${done} (${cleared.length}/16, score=${ns.score})`);
  }

  ok(cleared.length === ns.LEVELS.length,
     `${MODE}: ${cleared.length}/16 全部通關`);
  if (cleared.length === ns.LEVELS.length) {
    await pump(140);
    ok(ns.state === "ending", "ending reached");
    await tap("Enter"); await pump(60);
    ok(ns.state === "title", "returned to title after ending");
  }

  console.log(`\n[${MODE}] RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("STRATEGY TEST CRASH:", err);
  try {
    console.log(`[state-dump] state=${ns.state} lvl=${ns.LEVELS[ns.levelIdx].name} score=${ns.score} time=${ns.timeLeft} bananas=${ns.bananaCount} lives=${ns.lives} px=${ns.player?.x} py=${ns.player?.y}`);
    console.log(`[state-dump] enemies=${ns.enemies.length} shots=${ns.shots.length} fireballs=${ns.fireballs.length} items=${ns.items.length} particles=${ns.particles.length} popups=${ns.popups.length}`);
  } catch {}
  process.exit(1);
}
