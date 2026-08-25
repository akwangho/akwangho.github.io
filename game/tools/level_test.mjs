#!/usr/bin/env node
/**
 * Level-by-level acceptance tests.
 *
 * Part A - static structural validation of every level:
 *   flag/castle placement, spawn clearance, pickups & enemies present,
 *   deadly-pit widths crossable, and jump-reachability (BFS over standable
 *   surfaces with Mario-physics bounds) from spawn to the flag.
 *
 * Part B - a live bot plays the game start to finish: Konami unlock,
 *   stage select, fly+super cheats, then walks/jumps/flies through every
 *   course, exercising flag -> walkoff -> clear -> next-level -> ending.
 */
import { boot } from "./harness.mjs";

const { ns, kd, ku, pump, tap, waitTitle, cleanup } = await boot();
const T = ns.TILE;

let pass = 0, fail = 0;
const problems = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; problems.push(msg); console.log("  FAIL " + msg); }
}

// ---------------- Part A: structural validation ----------------
console.log("== Part A: structural validation of all 16 levels ==");
for (let i = 0; i < ns.LEVELS.length; i++) {
  globalThis.__drv.setLevel(i);
  const name = ns.LEVELS[i].name;
  const issues = [];
  const solid = (tx, ty) => ns.solidAt(tx, ty);

  if (!(ns.LEVELS[i].castleCol > ns.LEVELS[i].flagCol)) issues.push("castle behind flag");
  if (ns.grid[8][ns.LEVELS[i].flagCol] !== 3) issues.push("no flag base block");
  let landing = false;
  for (let tx = Math.max(0, ns.LEVELS[i].flagCol - 4); tx <= Math.min(ns.levelW - 1, ns.LEVELS[i].flagCol + 1); tx++)
    if (solid(tx, 9) || solid(tx, 8)) { landing = true; break; }
  if (!landing) issues.push("no landing ground near flag");

  // spawn clearance: cols 1..4 must have headroom
  for (let tx = 1; tx <= 4; tx++)
    for (let ty = 5; ty <= 8; ty++)
      if (solid(tx, ty)) issues.push(`spawn blocked at ${tx},${ty}`);

  if (ns.bananas.length === 0) issues.push("no bananas placed");
  if (ns.enemies.length === 0) issues.push("no enemies placed");

  // gameplay extras
  let hiddenCount = 0;
  for (let ty = 0; ty < ns.ROWS; ty++)
    for (let tx = 0; tx < ns.levelW; tx++)
      if (ns.grid[ty][tx] === 12 || ns.grid[ty][tx] === 13) hiddenCount++;
  if (hiddenCount < 2) issues.push(`hidden blocks ${hiddenCount} < 2`);
  if (ns.bigbananas.length !== 3) issues.push(`big bananas ${ns.bigbananas.length} !== 3`);
  if (!(ns.cpX > 0)) {
    issues.push("no checkpoint placed");
  } else {
    const walkerX = ns.enemies.filter(e => e.kind !== "fly").map(e => e.x);
    const minD = walkerX.length ? Math.min(...walkerX.map(ex => Math.abs(ns.cpX - ex))) : Infinity;
    if (minD < ns.TILE * 5) issues.push(`checkpoint only ${minD.toFixed(0)}px from enemy spawn`);
    const ctxCp = Math.floor(ns.cpX / ns.TILE), ctyCp = Math.floor(ns.cpY / ns.TILE);
    if (!solid(ctxCp, ctyCp)) issues.push(`checkpoint spawn not on solid ground @${ctxCp},${ctyCp}`);
    if (solid(ctxCp, ctyCp - 1)) issues.push(`checkpoint spawn head blocked @${ctxCp},${ctyCp}`);
  }
  const expectBoss = [3, 7, 11, 15].includes(i);
  if (expectBoss && !ns.boss) issues.push("missing boss");
  if (!expectBoss && ns.boss) issues.push("unexpected boss");
  if (expectBoss) {
    for (let ty = 5; ty <= 8; ty++)
      if (ns.grid[ty][ns.LEVELS[i].flagCol - 6] !== 14)
        issues.push(`gate wall missing at row ${ty}`);
    if (ns.grid[4][ns.LEVELS[i].flagCol - 6] === 14)
      issues.push("gate wall too tall (row 4 filled)");
  }

  // 重疊零容忍：香蕉/大金蕉/敵人不得嵌在實心方塊裡
  const solidNow2 = (tx, ty) => {
    if (ty < 0 || ty >= ns.ROWS || tx < 0 || tx >= ns.levelW) return true;
    const c = ns.grid[ty][tx];
    return c !== 0 && c !== 10 && c !== 11 && c !== 12 && c !== 13;
  };
  let embCount = 0;
  ns.bigbananas.forEach(b => { const cx = Math.floor(b.x / ns.TILE), cy = Math.floor(b.y / ns.TILE);
    if (cy < 2 || solidNow2(cx,cy) || solidNow2(cx,cy-1)) { embCount++; issues.push(`big banana embedded @${cx},${cy}`); } });
  ns.bananas.forEach(b => { const cx = Math.floor(b.x / ns.TILE), cy = Math.floor(b.y / ns.TILE);
    if (cy < 2 || solidNow2(cx,cy)) { embCount++; issues.push(`banana embedded @${cx},${cy}`); } });
  ns.enemies.forEach(e => { if (e.state === "bubble" || e.kind === "fly") return;
    const hx = Math.floor(e.x / ns.TILE), hy = Math.floor((e.y - e.h) / ns.TILE);
    if (hy < 2 || solidNow2(hx,hy)) { embCount++; issues.push(`${e.kind||"walk"} embedded @${hx},${hy}`); } });

  // 尾端無立足連續不得超過 6 格（衝刺跳可及）
  let tailRun = 0, tailMax = 0;
  for (let tx = Math.max(1, ns.LEVELS[i].flagCol - 20); tx <= Math.min(ns.levelW - 1, ns.LEVELS[i].flagCol + 3); tx++) {
    let st = false;
    for (let ty = 2; ty < ns.ROWS; ty++) if (solid(tx,ty) && !solid(tx,ty-1)) { st = true; break; }
    if (!st) { tailRun++; tailMax = Math.max(tailMax, tailRun); } else tailRun = 0;
  }
  if (tailMax > 6) issues.push(`tail gap ${tailMax} tiles before flag`);

  // deadly pits: contiguous lava/water spans must be <=7 wide or bridged
  let span = 0;
  for (let x = 0; x < ns.levelW; x++) {
    const deadlyRow = ns.deadlyAt(x, 9) || ns.deadlyAt(x, 10);
    const bridge = solid(x, 9) || solid(x, 8) || solid(x, 7);
    if (deadlyRow && !bridge) span++;
    else { if (span > 7) issues.push(`deadly pit width ${span} ending @${x} too wide`); span = 0; }
  }
  if (span > 7) issues.push(`deadly pit width ${span} at level end`);

  // jump reachability: BFS over standable surfaces
  // node=(tx,ty surface top). edge if |dx|<=6 and dy within [-3 up, +12 down]
  if (i === 3 || i === 15) {          // boss gate wall is removable on victory
    for (let ty = 2; ty <= 8; ty++) ns.grid[ty][ns.LEVELS[i].flagCol - 6] = 0;
  }
  const standable = [];
  const idOf = new Map();
  for (let tx = 0; tx < ns.levelW; tx++)
    for (let ty = 2; ty < ns.ROWS; ty++)
      if (solid(tx, ty) && !solid(tx, ty - 1)) { idOf.set(tx + "," + ty, standable.length); standable.push([tx, ty]); }
  const adj = standable.map(() => []);
  for (let a = 0; a < standable.length; a++) {
    const [ax, ay] = standable[a];
    for (let b = 0; b < standable.length; b++) {
      if (a === b) continue;
      const [bx, by] = standable[b];
      const dx = bx - ax, dy = by - ay; // dy>0 means lower on screen = downward, easier
      if (Math.abs(dx) >= 1 && Math.abs(dx) <= 6 && dy >= -3 && dy <= 12) adj[a].push(b);
    }
  }
  const startIdx = standable.findIndex(([tx, ty]) => tx >= 1 && tx <= 4 && ty === 9);
  const goalIdx = standable.findIndex(([tx]) => Math.abs(tx - ns.LEVELS[i].flagCol) <= 2);
  if (startIdx < 0 || goalIdx < 0) issues.push("missing start/goal surface");
  else {
    const seen = new Uint8Array(standable.length);
    const q = [startIdx]; seen[startIdx] = 1;
    while (q.length) {
      const cur = q.pop();
      if (cur === goalIdx) break;
      for (const nxt of adj[cur]) if (!seen[nxt]) { seen[nxt] = 1; q.push(nxt); }
    }
    if (!seen[goalIdx]) issues.push("flag NOT reachable from spawn by jumping");
  }

  if (issues.length === 0) console.log(`  OK   ${name}`);
  else { fail += issues.length; issues.forEach((m) => { problems.push(`${name}: ${m}`); console.log(`  FAIL ${name}: ${m}`); }); }
}

// ---------------- Part B: live playthrough of all levels ----------------
console.log("== Part B: live playthrough (Konami -> stage select -> bot plays every course) ==");
await waitTitle();
ok(ns.state === "title", "title reached");

const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
for (const c of seq) await tap(c);
ok(ns.konamiOn && ns.lives === 99, "konami unlocked, 99 lives");

// navigate selector to stage 1-1 regardless of where it starts
let nav = 0;
while (ns.titleSel !== 0 && nav++ < ns.LEVELS.length) await tap("ArrowRight");
ok(ns.titleSel === 0, "stage selector on 1-1");
await tap("Enter"); await pump(5);
ok(ns.state === "play" && ns.levelIdx === 0, "game started on 1-1");

// enable cheats for the bot
for (const c of ["KeyF", "KeyL", "KeyY"]) await tap(c);
for (const c of ["KeyS", "KeyU", "KeyP", "KeyE", "KeyR"]) await tap(c);
ok(ns.player.fly && ns.player.super, "bot has fly+super");

const cleared = [];
let budget = 150000; // hard cap on simulated frames for the whole run
let framesInPlay = 0;
let jumpLatch = 0;
let prev = ns.state;
let lvlMaxX = -1, noProgress = 0, lastFrameX = 0;
let pinFrames = 0, lastPinX = 0;
let wedgeF = 0, dropT = 0, lastPinY = 0;
let framesThisLevel = 0;

while (cleared.length < ns.LEVELS.length && budget-- > 0) {
  const st = ns.state;

  if (st === "play") {
    if (prev !== "play") { lvlMaxX = -1; noProgress = 0; }
    framesThisLevel++;
    const p = ns.player;
    // genuine forward motion resets the stall counter (respawn setbacks are ok)
    if (p.x > lvlMaxX + 2) { lvlMaxX = p.x; noProgress = 0; }
    else if (p.x > lastFrameX + 0.5) { noProgress = Math.max(0, noProgress - 2); }
    else noProgress++;
    lastFrameX = p.x;
    if (noProgress > 0 && noProgress % 3000 === 0) console.log(`    ... ${ns.LEVELS[ns.levelIdx].name} no-progress ${noProgress} pos=(${Math.round(p.x)},${Math.round(p.y)})`);
    if (framesThisLevel > 0 && framesThisLevel % 1500 === 0)
      console.log(`    [trace] ${ns.LEVELS[ns.levelIdx].name} f=${framesThisLevel} pos=(${Math.round(p.x)},${Math.round(p.y)}) bossHp=${ns.boss ? ns.boss.hp : "-"} time=${ns.timeLeft}`);

    // --- bot policy: hold right; pulse jump when blocked / gap / enemy ahead ---
    const footTy = Math.max(0, Math.floor((p.y - 1) / T));
    const aheadTx = Math.min(ns.levelW - 1, Math.floor((p.x + p.w / 2 + 10) / T));
    const wallAhead = ns.solidAt(aheadTx, footTy) || ns.solidAt(aheadTx, footTy - 1) || ns.solidAt(aheadTx, footTy - 2);
    let floorAhead = false;
    for (let ty = footTy; ty < ns.ROWS; ty++)
      if (ns.solidAt(aheadTx, ty) || ns.solidAt(Math.min(ns.levelW - 1, aheadTx + 1), ty)) { floorAhead = true; break; }
    let enemyNear = false;
    for (const en of ns.enemies)
      if (!en.dead && en.active && en.state === "walk" && Math.abs(en.x - p.x) < 70) { enemyNear = true; break; }
    // proactive hop onto elevated platforms (avoid wedging under low corridors)
    let elevatedAhead = false;
    outer:
    for (let cx = aheadTx; cx <= Math.min(ns.levelW - 1, aheadTx + 3); cx++)
      for (let cy = Math.max(0, footTy - 4); cy <= footTy - 1; cy++)
        if (ns.solidAt(cx, cy)) { elevatedAhead = true; break outer; }

    // ---- boss fight override ----
    let engaged = false;
    if (ns.boss && !ns.boss.dead && p.x > ns.boss.minX - 320) {
      engaged = true;
      noProgress = 0;
      const b = ns.boss;
      // universal unwedge: completely stationary -> drop everything briefly
      if (Math.abs(p.x - lastPinX) < 1 && Math.abs(p.y - lastPinY) < 1) wedgeF++; else wedgeF = 0;
      lastPinX = p.x; lastPinY = p.y;
      if (wedgeF > 45) { dropT = 14; wedgeF = 0; }
      const wantY = b.dizzy > 0 ? b.y - b.h - 6 : b.y - b.h - 100;
      if (!b.awake) kd("ArrowRight");
      if (dropT > 0) {
        dropT--;
        ku("Space"); ku("ArrowRight");
      } else {
        if (forceJump || p.y > wantY + 4) kd("Space"); else ku("Space");
        if (Math.abs(p.x - b.x) > 14) {
          if (p.x < b.x) { ku("ArrowLeft"); kd("ArrowRight"); }
          else { ku("ArrowRight"); kd("ArrowLeft"); }
        } else { ku("ArrowLeft"); ku("ArrowRight"); }
      }
      // hop over small steps while repositioning near the boss
      if (Math.abs(p.x - lastPinX) < 1 && p.onGround) pinFrames++; else pinFrames = 0;
      lastPinX = p.x;
      var forceJump = pinFrames > 25;
      if (forceJump) pinFrames = 0;
    } else {
      if (ns.keys.left) ku("ArrowLeft");
      const needJump = wallAhead || !floorAhead || enemyNear || elevatedAhead;
      if (needJump) jumpLatch = 24;         // hold jump long enough to clear obstacles
      else if (jumpLatch > 0) jumpLatch--;
      if (jumpLatch > 0) { if (!ns.keys.jump) kd("Space"); }
      else if (ns.keys.jump) ku("Space");
      if (!ns.keys.right) kd("ArrowRight");
    }

    if (noProgress > 9000) {
      console.log(`STALL lvl=${ns.LEVELS[ns.levelIdx].name} pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) vx=${p.vx.toFixed(2)} vy=${p.vy.toFixed(2)} onG=${p.onGround} lvlMaxX=${Math.round(lvlMaxX)} camX=${Math.round(ns.camX)} timeLeft=${ns.timeLeft} lives=${ns.lives}`);
      const cx0 = Math.max(0, Math.floor(p.x / T) - 3);
      for (let ty = Math.max(0, footTy - 4); ty <= Math.min(ns.ROWS - 1, footTy + 2); ty++) {
        let row = `  row${ty}: `;
        for (let tx = cx0; tx <= cx0 + 8; tx++) row += String(ns.grid[ty][tx]).padEnd(2);
        console.log(row);
      }
      for (const en of ns.enemies) if (en.active && !en.dead && Math.abs(en.x - p.x) < 150)
        console.log(`  enemy @(${Math.round(en.x)},${Math.round(en.y)}) st=${en.state}`);
      ok(false, `${ns.LEVELS[ns.levelIdx].name}: bot made no progress for 9000 frames`);
      break;
    }
  }

  await pump(1);

  if (st !== "clear" && ns.state === "clear") {
    const lvlName = ns.LEVELS[ns.levelIdx].name;
    cleared.push(lvlName);
    console.log(`  CLEAR ${lvlName}  (score=${ns.score}, lives=${ns.lives})`);
    ok(ns.lives >= 99, `${lvlName}: lives >= 99 after clear (got ${ns.lives}, 1UPs allowed)`);
    try {
      const rmap = JSON.parse(globalThis.localStorage.getItem("smb_rank_v1") || "{}");
      ok(!!rmap[lvlName], `${lvlName}: rank saved (${rmap[lvlName] || "none"})`);
    } catch (e) { ok(false, `${lvlName}: rank read failed`); }
    ok(Number.isFinite(ns.player.x) && Number.isFinite(ns.player.y), `${lvlName}: player coords finite`);
    // bonus drain then advance to next course
    let guard = 0;
    while (ns.state === "clear" && guard++ < 4000) { await pump(1); if (guard > 120 && guard % 30 === 0) kd("Enter"); }
    ku("Enter");
    await pump(5);
  }
  if (st === "play" && ns.state === "dead") {
    ok(false, `${ns.LEVELS[ns.levelIdx].name}: bot died despite super`);
    let guard = 0;
    while (ns.state === "dead" && guard++ < 400) await pump(1);
  }
  prev = ns.state;
}
ku("ArrowRight"); ku("Space");

ok(cleared.length === ns.LEVELS.length, `all ${ns.LEVELS.length} courses cleared (${cleared.join(", ")})`);
if (ns.state === "ending") {
  console.log("  ENDING reached after final course");
  await pump(200);
  await tap("Enter");
  ok(ns.state === "title", "back to title after ending");
} else {
  ok(false, `expected ending state, got ${ns.state}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (problems.length) { console.log("problems:"); problems.forEach((p) => console.log("  - " + p)); }
cleanup();
process.exit(fail ? 1 : 0);
