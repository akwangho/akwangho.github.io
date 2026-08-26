/**
 * botlib.mjs — 共用自動駕駛機器人。
 * 沉澱 strategy_test 歷代修正：坑緣強制重按、預測式剎車、矮牆短跳／低天花板中弧、
 * SUPER 液面行走感知、Boss 戰暈眩踩踏、不變量監控。
 */

export async function konamiStart(env, li = 0) {
  const { ns, kd, ku, pump, tap, waitTitle } = env;
  await waitTitle();
  const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
               "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  for (const c of seq) { kd(c); await pump(1); ku(c); await pump(1); }
  let g = 0;
  while (ns.titleSel !== li && g++ < ns.LEVELS.length) await tap("ArrowRight");
  await tap("Enter"); await pump(6);
  return { konami: ns.konamiOn, levelIdx: ns.levelIdx };
}

export async function typeWord(env, codes) {
  const { kd, ku, pump } = env;
  for (const c of codes) { kd(c); await pump(1); ku(c); await pump(1); }
}

export const WORDS = {
  super: ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"],
  fly: ["KeyF", "KeyL", "KeyY"],
};

export function createBot(env, opts = {}) {
  const { ns, kd, ku, pump } = env;
  const T = ns.TILE;
  const o = {
    super: true, small: false, fire: false,
    poundAggro: true, assistSuper: false, backjump: true,
    invariants: true, stallLimit: 16000,
    ...opts,
  };

  const CODE = { left: "ArrowLeft", right: "ArrowRight", jump: "Space",
                 down: "ArrowDown", run: "ShiftLeft" };
  const held = { left: false, right: false, jump: false, down: false, run: false };
  const hold = (k, on) => {
    if (on && !held[k]) kd(CODE[k]);
    if (!on && held[k]) ku(CODE[k]);
    held[k] = on;
  };

  const cleared = [];
  let endedSeen = false;
  let jumpLatch = 0, jumpHold = 0, gapHold = false, lastRun = false, hopMode = 0, airF = 0;
  let gapPlatR = 0, gapLandY = 0, gapBrake = false, gapLaunchX = null;
  let lvlMaxX = -1, noProgress = 0, framesThisLevel = 0, prevLevelIdx = -1;
  let deaths = 0, violations = 0, poundedFrames = 0, assistUsed = false;
  let fireCd = 0, graceBad = 0;
  let vault = 0, vaultT = 0;
  let stuckX = -9999, stuckT = 0;

  function maintainForm() {
    const p = ns.player;
    if (o.small) {
      if (p.big) { p.big = false; }
      p.h = p.crouching ? 46 : 46;
    } else {
      if (!p.big || (o.fire && !p.fire)) {
        p.big = true;
        if (o.fire) p.fire = true;
        p.h = p.crouching ? 46 : 72;
      }
    }
    if (o.super && !p.super && !assistUsed) {
      // 死亡重生後 cheatSuper 旗標仍會保留；只有直接被外部關閉時需要補
      p.super = true;
    }
  }

  function checkInvariants(p) {
    if (!o.invariants) return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        !Number.isFinite(p.vx) || !Number.isFinite(p.vy) ||
        Math.abs(p.x) > 50000 || Math.abs(p.y) > 20000) violations++;
    for (const en of ns.enemies) {
      if (en.active && !en.dead &&
          (!Number.isFinite(en.x) || !Number.isFinite(en.y) ||
           Math.abs(en.x) > 40000 || Math.abs(en.y) > 40000)) violations++;
    }
    if (![...ns.hammers].every(hm => Number.isFinite(hm.x) && Number.isFinite(hm.y))) violations++;
  }

  async function step() {
    const st = ns.state;

    // ---- 過關偵測：由 clear 排水完成後確認 ----
    if (st === "clear") {
      const beforeIdx = ns.levelIdx;
      let g = 0;
      while (ns.state === "clear" && g++ < 5000) {
        await pump(1);
        if (g > 130 && g % 30 === 0) kd("Enter");
      }
      ku("Enter"); await pump(6);
      if (ns.levelIdx !== beforeIdx && !cleared.includes(ns.LEVELS[beforeIdx].name)) {
        cleared.push(ns.LEVELS[beforeIdx].name);
        console.log(`  CLEAR ${ns.LEVELS[beforeIdx].name} (${cleared.length}/16)`);
        lvlMaxX = -1; noProgress = 0; framesThisLevel = 0;
        bot._prevScore = ns.score;
      }
      return null;
    }
    if (st === "ending" && !endedSeen) {
      endedSeen = true;
      cleared.push(ns.LEVELS[ns.LEVELS.length - 1].name);
      return "ending";
    }

    if (st === "dead") {
      deaths++;
      let g = 0;
      while (ns.state === "dead" && g++ < 400) await pump(1);
      maintainForm();
      return null;
    }
    if (st !== "play") {
      if (st === "title" || st === "gameover") { kd("Enter"); await pump(3); ku("Enter"); }
      else await pump(1);
      return null;
    }

    framesThisLevel++;
    const p = ns.player;
    maintainForm();
    // 累積式卡死偵測：長時間停在 ±12px 內（不分滯空/落地）
    if (Math.abs(p.x - stuckX) < 12) stuckT++; else { stuckX = p.x; stuckT = 0; }
    const wedged = stuckT > 360 && o.backjump;
    if (p.pounding) poundedFrames++;

    if (framesThisLevel === 1 || lvlMaxX < 0) { lvlMaxX = Math.max(lvlMaxX, p.x); }
    if (p.x > lvlMaxX + 2) { lvlMaxX = p.x; noProgress = 0; }
    else noProgress++;
    if (o.assistSuper && !assistUsed && (noProgress > 11000 || deaths >= 25)) {
      assistUsed = true;
      await typeWord(env, WORDS.super);
      p.super = true;
    }

    checkInvariants(p);

    // ---- Boss 戰 ----
    const footTy = Math.max(0, Math.floor((p.y - 1) / T));
    if (ns.boss && !ns.boss.dead && p.x > ns.boss.minX - 320) {
      noProgress = 0;
      const b = ns.boss;
      if (!b.awake) kd("ArrowRight");
      if (b.dizzy > 0) {
        if (Math.abs(p.x - b.x) > 20) { hold("right", p.x < b.x); hold("left", p.x > b.x); }
        else { hold("right", false); hold("left", false); }
        hold("jump", true);
      } else {
        const safe = 170;
        if (p.x < b.x - safe) { hold("right", true); hold("left", false); }
        else if (p.x > b.x + safe) { hold("left", true); hold("right", false); }
        else {
          const back = b.face > 0 ? -1 : 1;
          hold("left", back < 0); hold("right", back > 0);
        }
        hold("jump", false);
      }
      await pump(1);
      return null;
    }

    // ---- 感知 ----
    const aheadTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 10) / T));
    const frontTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 4) / T));
    const botSolid = (tx, ty) => ns.solidAt(tx, ty) || (p.super && ns.deadlyAt(tx, ty));
    const wallAhead = botSolid(aheadTx, footTy) || botSolid(aheadTx, footTy - 1);
    let floorAhead = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (botSolid(aheadTx, ty) || botSolid(Math.min(ns.levelW - 1, aheadTx + 1), ty)) { floorAhead = true; break; }
    let groundUnderFront = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (botSolid(frontTx, ty)) { groundUnderFront = true; break; }

    const colFloorTy = (cx) => {
      for (let ty = Math.max(0, footTy - 4); ty < ns.ROWS; ty++) {
        const c = ns.grid[ty][cx];
        if (c === 12 || c === 13) continue;
        if (p.super && (c === 10 || c === 11)) return ty;
        if (c !== 0 && c !== 10 && c !== 11) return ty;
        if (c === 10 || c === 11) return -1;
      }
      return -1;
    };
    const gapAtEdge = !floorAhead && !groundUnderFront;

    let gapW = 99, landRise = 0, landW = 0, gapStartCol = -1, gapLandTy = -1;
    {
      let i = frontTx;
      while (i < ns.levelW && colFloorTy(i) !== -1) i++;
      if (i >= ns.levelW) gapW = 0;
      else {
        gapStartCol = i;
        let j = i;
        while (j < ns.levelW && colFloorTy(j) === -1) j++;
        gapW = j - i;
        const lt = j < ns.levelW ? colFloorTy(j) : -1;
        if (lt !== -1) {
          landRise = (footTy + 1) - lt;
          let k = j;
          while (k < ns.levelW && colFloorTy(k) === lt) { landW++; k++; }
        }
      }
    }

    if (p.onGround && !gapAtEdge) gapHold = false;
    const runwayOK = gapStartCol !== -1 && gapStartCol * T - p.x >= 96;
    if (gapAtEdge && p.onGround) {
      if (!gapHold) gapLaunchX = p.x;
      gapHold = true;
      gapPlatR = (gapStartCol + gapW) * T;
      gapLandY = gapLandTy * T;
    }

    const wallClose = wallAhead && (p.x + p.w / 2 + 16 >= aheadTx * T);
    let wallH = -1;
    if (wallClose) {
      let ty = footTy;
      while (ty >= 0 && ns.solidAt(aheadTx, ty)) { wallH++; ty--; }
    }
    const needJump = wallClose || gapAtEdge;
    if (needJump) jumpLatch = 24;
    else if (jumpLatch > 0) jumpLatch--;

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

    let wantJump = jumpLatch > 0 || gapHold;
    if (hopMode && !p.onGround) airF++;
    if (wantJump && hopMode && !p.onGround && airF >= (hopMode === 2 ? 16 : 10) &&
        ns.player.vy < -6) wantJump = false;
    const jhMax = !floorAhead ? 4 : 12;
    if (wantJump && ns.keys.jump && p.onGround && ++jumpHold > jhMax) {
      wantJump = false; jumpHold = 0;
    } else if (!ns.keys.jump) jumpHold = 0;
    hold("jump", wantJump);

    if (p.onGround) {
      lastRun = gapW >= 4 || landRise >= 1 ||
                ((gapW >= 4 || landRise >= 1) && runwayOK);
    }
    if (p.onGround) gapBrake = false;
    if (gapHold && !p.onGround && gapPlatR > 0 && gapLandY > 0 && ns.player.vy > 0) {
      const g = 0.55, vy = ns.player.vy;
      const dy = Math.max(0, p.y - gapLandY);
      const tFall = (vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
      if (p.x + ns.player.vx * tFall > gapPlatR + 30) gapBrake = true;
    }
    if (gapBrake) {
      ku("ShiftLeft"); held.run = false;
      hold("right", true); hold("left", false);
    } else {
      hold("right", true); hold("left", false); hold("run", lastRun);
    }
    if (gapAtEdge && p.onGround) {
      if (ns.keys.jump) { ku(CODE.jump); held.jump = false; }
      kd(CODE.jump); held.jump = true;
    }

    // ---- 貼牆助跑保險：原地跳不過的矮牆（小隻常見）→ 後退助跑滿速衝跳 ----
    if (o.backjump) {
      const wallFaceX = (gapStartCol !== -1 ? gapStartCol : aheadTx) * T;
      if (vault === 0 && wedged) {
        vault = 1; vaultT = 80;
        bot._retreatFrom = p.x;
        ku(CODE.jump); held.jump = false;            // 先鬆開跳，避免持續原地小跳
      }
      if (vault === 1) {                              // 後退拉開 ≥160px 助跑
        hold("right", false); hold("left", true); hold("run", false); hold("jump", false);
        if (p.x <= wallFaceX - 160 || vaultT-- <= 0) { vault = 2; vaultT = 240; }
      } else if (vault === 2) {                        // 滿速助跑，距牆 84px 提前滿弧起跳
        hold("left", false); hold("right", true); hold("run", true);
        const distToWall = wallFaceX - (p.x + p.w / 2);
        if (p.onGround && distToWall <= 84 && distToWall > -12) {
          if (ns.keys.jump) { ku(CODE.jump); held.jump = false; }
          kd(CODE.jump); held.jump = true;
          airF = 0; hopMode = 0;
          vault = 3; vaultT = 140;
        } else if (vaultT-- <= 0) { vault = 0; stuckT = 0; }
      } else if (vault === 3) {                        // 滯空越牆：保持右+滿弧
        hold("right", true); hold("run", true);
        if (p.onGround && !wallAhead || vaultT-- <= 0) { vault = 0; stuckT = 0; }
      }
    }

    // 下壓流
    if (o.poundAggro && !gapHold && !wallClose) {
      const foe = ns.enemies.find(en => !en.dead && en.active &&
        (en.state === "walk" || en.state === "fly" || en.state === "shell" || en.state === "slide") &&
        Math.abs(en.x - p.x) < 80 && en.y > p.y - 40);
      if (foe && !p.onGround && !held.down) { kd(CODE.down); held.down = true; }
    }
    if (held.down && (p.onGround || !o.poundAggro)) { ku(CODE.down); held.down = false; }

    // 火球流
    if (o.fire && fireCd <= 0) {
      const foeNear = ns.enemies.some(en => !en.dead && en.active &&
        en.state === "walk" && Math.abs(en.x - p.x) < 200);
      if (foeNear) { kd("KeyX"); fireCd = 40; }
    }

    await pump(1);
    if (fireCd > 0) fireCd--;

    if (ns.state === "dead") {
      deaths++;
      let g = 0;
      while (ns.state === "dead" && g++ < 400) await pump(1);
      maintainForm();
    }
    return null;
  }

  const bot = {
    _vaultDbg() { return `${vault}/${vaultT}/${stuckT}`; },
    cleared, get done() { return cleared.length >= ns.LEVELS.length; },
    get deaths() { return deaths; },
    get violations() { return violations; },
    get poundedFrames() { return poundedFrames; },
    get noProgress() { return noProgress; },
    get framesThisLevel() { return framesThisLevel; },
    get levelIdx() { return ns.levelIdx; },
    assistUsed: () => assistUsed,
    step, releaseAll() { for (const k of Object.keys(held)) if (held[k]) { ku(CODE[k]); held[k] = false; } },
  };
  return bot;
}
