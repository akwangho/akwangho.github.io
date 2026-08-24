"use strict";

const TILE = 48, VIEW_W = 960, VIEW_H = 528, ROWS = 11;
const GRAV = 0.55, MAXFALL = 13;
const MAX_WALK = 3.4, MAX_RUN = 5.2, ACC_WALK = 0.28, ACC_RUN = 0.38, FRICTION = 0.82;
const JUMP_VY = -15.5, STOMP_BOUNCE = -9, STOMP_BOUNCE_HELD = -14;
const BIG_SCALE = 0.61, SMALL_SCALE = 0.378;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const SPRITES = [
  "idle", "idle2", "skid", "walk_r1", "walk_r2", "run_r1", "run_r2", "jump_r", "fall_r",
  "hurt", "ko", "dead", "powerup", "powerdown",
  "tile_grass", "tile_dirt", "tile_brick", "tile_qblock", "tile_used", "tile_solid",
  "tile_pipe", "flag_cloth",
  "banana", "item_star", "item_mushroom",
  "fx_sparkle", "fx_smoke",
  "enemy_a", "enemy_b", "enemy_flat",
  "face1",
];
const IMG = {};

const keys = { left: false, right: false, jump: false, run: false };
let jumpBuffer = 0;
let anyEnter = false;

function bindKey(code, down) {
  switch (code) {
    case "ArrowLeft": case "KeyA": keys.left = down; return true;
    case "ArrowRight": case "KeyD": keys.right = down; return true;
    case "Space": case "KeyZ": case "KeyK": case "ArrowUp": case "KeyW":
      if (down && !keys.jump) jumpBuffer = 7;
      keys.jump = down; return true;
    case "ShiftLeft": case "ShiftRight": case "KeyX": case "KeyJ":
      keys.run = down; return true;
    case "Enter":
      if (down) anyEnter = true; return true;
    case "KeyP":
      if (down) togglePause(); return true;
    case "KeyM":
      if (down) toggleMusic(); return true;
  }
  return false;
}
window.addEventListener("keydown", (e) => {
  const handled = bindKey(e.code, true);
  if (handled || ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
  initAudioOnce();
});
window.addEventListener("keyup", (e) => bindKey(e.code, false));

document.querySelectorAll("#touch .btn").forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => {
    e.preventDefault(); initAudioOnce();
    if (k === "jump" && !keys.jump) jumpBuffer = 7;
    keys[k] = true;
    if (state !== "play") anyEnter = true;
  };
  const off = (e) => { e.preventDefault(); keys[k] = false; };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off);
  b.addEventListener("pointerleave", off);
});
canvas.addEventListener("pointerdown", () => { initAudioOnce(); if (state !== "play") anyEnter = true; });

let actx = null, musicOn = true, musicTimer = null, musicPos = 0, musicNext = 0, musicTempo = 1;
function initAudioOnce() {
  if (actx) { if (actx.state === "suspended") actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  startMusicLoop();
}
function tone(f0, f1, dur, type, vol, when) {
  if (!actx || !musicOn) return;
  const t = actx.currentTime + (when || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function sfx(name) {
  switch (name) {
    case "jump": tone(260, 620, 0.16, "square", 0.12); break;
    case "banana": tone(988, 988, 0.06, "square", 0.12); tone(1319, 1319, 0.22, "square", 0.12, 0.06); break;
    case "stomp": tone(320, 90, 0.12, "square", 0.16); break;
    case "bump": tone(140, 90, 0.08, "square", 0.14); break;
    case "brick": tone(220, 60, 0.15, "sawtooth", 0.16); break;
    case "item": tone(523, 784, 0.12, "square", 0.1); break;
    case "power": [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.09, "square", 0.11, i * 0.07)); break;
    case "shrink": [784, 659, 523, 392, 330].forEach((f, i) => tone(f, f, 0.09, "square", 0.11, i * 0.08)); break;
    case "die": [988, 932, 880, 784, 698, 659, 587, 523, 392, 330, 262].forEach((f, i) => tone(f, f, 0.11, "square", 0.12, 0.3 + i * 0.09)); break;
    case "oneup": [1319, 1568, 2093, 1760, 2349, 2637].forEach((f, i) => tone(f, f, 0.08, "square", 0.12, i * 0.09)); break;
    case "flag": [262, 330, 392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, "square", 0.12, i * 0.11)); break;
    case "tick": tone(1200, 1200, 0.03, "square", 0.08); break;
    case "kick": tone(400, 800, 0.1, "square", 0.12); break;
  }
}
const LEAD = [[72, 1], [0, 1], [76, 1], [0, 1], [79, 1], [0, 1], [76, 1], [0, 1], [81, 1], [79, 1], [76, 1], [0, 1], [74, 1], [0, 1], [72, 1], [0, 1], [74, 1], [0, 1], [77, 1], [0, 1], [81, 1], [0, 1], [77, 1], [0, 1], [79, 1], [77, 1], [76, 1], [74, 1], [0, 1], [0, 1], [72, 1], [0, 1]];
const BASS = [[48, 2], [0, 2], [55, 2], [0, 2], [53, 2], [0, 2], [55, 2], [0, 2], [50, 2], [0, 2], [53, 2], [0, 2], [48, 2], [55, 2], [48, 2], [0, 2]];
const midiF = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusicLoop() {
  if (musicTimer) return;
  musicNext = actx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!actx || !musicOn) return;
    const playing = state === "play" && !paused;
    const eighth = 0.185 / musicTempo;
    while (musicNext < actx.currentTime + 0.35) {
      if (playing) {
        const l = LEAD[musicPos % LEAD.length], b = BASS[musicPos % BASS.length];
        const when = musicNext - actx.currentTime;
        if (l[0]) tone(midiF(l[0]), midiF(l[0]), eighth * l[1] * 0.9, "square", 0.045, when);
        if (b[0]) tone(midiF(b[0]), midiF(b[0]), eighth * b[1] * 0.9, "triangle", 0.09, when);
      }
      musicNext += eighth;
      musicPos++;
    }
  }, 100);
}
function toggleMusic() { musicOn = !musicOn; }
function togglePause() { if (state === "play") paused = !paused; }

let state = "loading", paused = false, frame = 0;
let score = 0, bananaCount = 0, lives = 5, timeLeft = 300, timeTick = 0;
let camX = 0;
let player, enemies, bananas, items, pops, particles, popups, bumps;
let levelW = 204, grid = [], pipes = [];
const flagCol = 172, castleCol = 180;
let flagClothY = 0, flagDone = false;
let clearTimer = 0, bonusLeft = 0, deadTimer = 0, hurryPlayed = false;

function buildLevel() {
  grid = Array.from({ length: ROWS }, () => new Int8Array(levelW));
  pipes = [[28, 2], [36, 3], [44, 4], [52, 4], [128, 2]];
  const ground = (a, b) => { for (let x = a; x <= b; x++) { grid[9][x] = 1; grid[10][x] = 2; } };
  ground(0, 63); ground(66, 95); ground(99, 116); ground(119, 143); ground(146, levelW - 1);
  const blocks = (y, x, s) => {
    const m = { B: 4, "?": 5, M: 6, "*": 7 };
    [...s].forEach((c, i) => { if (m[c]) grid[y][x + i] = m[c]; });
  };
  blocks(6, 17, "?");
  blocks(6, 21, "B?BMB"); blocks(3, 23, "?");
  blocks(6, 68, "B?B"); blocks(3, 69, "?");
  blocks(3, 76, "BBBBBBBB");
  blocks(6, 77, "B?B");
  blocks(6, 100, "?*");
  blocks(6, 135, "BMB");
  blocks(6, 147, "B?B?B"); blocks(3, 149, "B");
  const stair = (x0, n, dir) => {
    for (let i = 0; i < n; i++) {
      const h = dir > 0 ? i + 1 : n - i;
      for (let j = 0; j < h; j++) grid[8 - j][x0 + i] = 3;
    }
  };
  stair(106, 4, 1); stair(111, 4, -1); stair(120, 4, 1); stair(158, 8, 1);
  pipes.forEach(([px, h]) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < h; j++) grid[8 - j][px + i] = 9;
  });
  grid[8][flagCol] = 3;

  bananas = [];
  const bRow = (y, x0, n) => {
    for (let i = 0; i < n; i++) bananas.push({ x: (x0 + i) * TILE + 24, y: y * TILE + 24, t: Math.random() * 100 });
  };
  bRow(8, 10, 3); bRow(6, 32, 3); bRow(7, 63, 4); bRow(2, 78, 4); bRow(6, 95, 5);
  bRow(8, 104, 2); bRow(8, 110, 1); bRow(5, 116, 4); bRow(7, 125, 2); bRow(7, 143, 4);
  bRow(8, 154, 3); bRow(7, 167, 4);

  enemies = [];
  [26, 33, 41, 50, 74, 80, 82, 91, 103, 115, 131, 133, 140, 150, 155, 168].forEach((x) => {
    enemies.push({ x: x * TILE + 24, y: 9 * TILE, vx: -1.1, vy: 0, w: 36, h: 40, state: "walk", t: 0, active: false, dead: false, hitDir: 0 });
  });
}

function resetLevel() {
  buildLevel();
  items = []; pops = []; particles = []; popups = []; bumps = [];
  player = {
    x: 2.5 * TILE, y: 9 * TILE, vx: 0, vy: 0, w: 40, h: 72,
    big: false, onGround: false, face: 1, animT: 0, stompChain: 0,
    invuln: 0, star: 0, growT: 0, growMode: null, skid: false, hitDir: 0,
  };
  camX = 0; timeLeft = 300; timeTick = 0; hurryPlayed = false;
  flagClothY = 2 * TILE + 6; flagDone = false; clearTimer = 0; bonusLeft = 0;
  musicTempo = 1; musicPos = 0;
}

function solidAt(tx, ty) {
  if (tx < 0 || tx >= levelW) return true;
  if (ty < 0 || ty >= ROWS) return false;
  return grid[ty][tx] > 0;
}

function rectVsGrid(e, onBump) {
  e.hitWall = false; e.hitDir = 0;
  e.x += e.vx;
  let x0 = Math.floor((e.x - e.w / 2) / TILE), x1 = Math.floor((e.x + e.w / 2 - 0.01) / TILE);
  let y0 = Math.floor((e.y - e.h) / TILE), y1 = Math.floor((e.y - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    if (e.vx > 0 && solidAt(x1, ty)) { e.x = x1 * TILE - e.w / 2; e.hitWall = true; e.hitDir = -1; e.vx = 0; }
    else if (e.vx < 0 && solidAt(x0, ty)) { e.x = (x0 + 1) * TILE + e.w / 2; e.hitWall = true; e.hitDir = 1; e.vx = 0; }
    x0 = Math.floor((e.x - e.w / 2) / TILE); x1 = Math.floor((e.x + e.w / 2 - 0.01) / TILE);
  }
  e.y += e.vy;
  e.onGround = false;
  x0 = Math.floor((e.x - e.w / 2) / TILE); x1 = Math.floor((e.x + e.w / 2 - 0.01) / TILE);
  y0 = Math.floor((e.y - e.h) / TILE); y1 = Math.floor((e.y - 0.01) / TILE);
  if (e.vy >= 0) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(tx, y1)) { e.y = y1 * TILE; e.vy = 0; e.onGround = true; break; }
    }
  } else {
    let best = -1, bestOv = 0;
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(tx, y0)) {
        const ov = Math.min(e.x + e.w / 2, (tx + 1) * TILE) - Math.max(e.x - e.w / 2, tx * TILE);
        if (ov > bestOv) { bestOv = ov; best = tx; }
      }
    }
    if (best >= 0) {
      e.y = (y0 + 1) * TILE + e.h; e.vy = 0;
      if (onBump) onBump(best, y0);
    }
  }
}

function addScore(n, x, y, label) {
  score += n;
  if (x !== undefined) popups.push({ x, y, t: 0, text: label || String(n) });
}

function collectBanana(x, y) {
  bananaCount++;
  addScore(200);
  sfx("banana");
  particles.push({ type: "spark", x, y, vx: 0, vy: 0, t: 0 });
  if (bananaCount % 100 === 0) {
    lives++;
    sfx("oneup");
    popups.push({ x: player.x, y: player.y - 90, t: 0, text: "1UP!" });
  }
}

function bumpBlock(tx, ty) {
  const code = grid[ty][tx];
  if (code === 0 || code === 2) return;
  if (code === 8 || code === 9 || code === 1 || code === 3) { sfx("bump"); return; }
  bumps.push({ tx, ty, t: 0 });
  const bx = tx * TILE + 24, byTop = ty * TILE;
  enemies.forEach((en) => {
    if (!en.dead && en.state === "walk" && Math.abs(en.y - byTop) < 8 && Math.abs(en.x - bx) < TILE) flipKill(en, 100);
  });
  if (code === 5) {
    grid[ty][tx] = 8;
    pops.push({ x: bx, y: byTop, vy: -7.2, t: 0 });
    collectBanana(bx, byTop - 20);
  } else if (code === 6) {
    grid[ty][tx] = 8;
    items.push({ kind: "mush", x: bx, y: byTop + 20, blockY: byTop, vx: 0, vy: 0, w: 36, h: 36, state: "emerge", et: 0, hitDir: 0 });
    sfx("item");
  } else if (code === 7) {
    grid[ty][tx] = 8;
    items.push({ kind: "star", x: bx, y: byTop + 20, blockY: byTop, vx: 0, vy: 0, w: 36, h: 36, state: "emerge", et: 0, hitDir: 0 });
    sfx("item");
  } else if (code === 4) {
    if (player.big) {
      grid[ty][tx] = 0;
      addScore(50);
      sfx("brick");
      for (let i = 0; i < 4; i++) {
        particles.push({
          type: "shard",
          x: bx + (i % 2 ? 10 : -10), y: byTop + 12 + (i < 2 ? -8 : 8),
          vx: (i % 2 ? 1 : -1) * (1.4 + Math.random()), vy: -5 - Math.random() * 2,
          rot: Math.random() * 6, t: 0,
        });
      }
    } else sfx("bump");
  }
}

function flipKill(en, pts) {
  en.state = "flip"; en.vy = -7; en.vx = 1.2 * (Math.random() < 0.5 ? -1 : 1);
  en.dead = true;
  addScore(pts, en.x, en.y - 50);
  sfx("kick");
}

function damagePlayer() {
  if (player.invuln > 0 || player.star > 0 || state !== "play" || player.growT > 0) return;
  if (player.big) {
    player.big = false;
    player.growMode = "shrink"; player.growT = 40;
    player.invuln = 130;
    sfx("shrink");
  } else killPlayer();
}

function killPlayer() {
  state = "dead"; deadTimer = 0;
  player.vx = 0; player.vy = 0;
  sfx("die");
}

function updatePlayer() {
  const p = player;
  if (p.growT > 0) {
    p.growT--;
    if (p.growT === 0) {
      if (p.growMode === "grow") { p.big = true; p.h = 72; }
      else { p.h = 46; }
      p.growMode = null;
    }
    return;
  }
  const acc = keys.run ? ACC_RUN : ACC_WALK;
  const max = keys.run ? MAX_RUN : MAX_WALK;
  if (keys.left && !keys.right) { p.vx -= acc; p.face = -1; }
  else if (keys.right && !keys.left) { p.vx += acc; p.face = 1; }
  else if (p.onGround) p.vx *= FRICTION;
  if (Math.abs(p.vx) < 0.05) p.vx = 0;
  p.vx = Math.max(-max, Math.min(max, p.vx));
  p.skid = p.onGround && ((keys.left && p.vx > 1.6) || (keys.right && p.vx < -1.6));

  if (jumpBuffer > 0 && p.onGround) {
    p.vy = JUMP_VY;
    p.onGround = false;
    jumpBuffer = 0;
    sfx("jump");
  }
  if (jumpBuffer > 0) jumpBuffer--;
  if (!keys.jump && p.vy < -6) p.vy = -6;
  p.vy = Math.min(MAXFALL, p.vy + GRAV);

  rectVsGrid(p, bumpBlock);
  if (p.onGround) p.stompChain = 0;
  p.x = Math.max(p.w / 2, Math.min(levelW * TILE - p.w / 2, p.x));

  if (p.invuln > 0) p.invuln--;
  if (p.star > 0) { p.star--; if (p.star === 0) musicTempo = hurryPlayed ? 1.25 : 1; }

  if (p.y > VIEW_H + 80) { killPlayer(); return; }

  if (p.x >= flagCol * TILE - 24) startFlag();
}

function startFlag() {
  state = "flag";
  player.vx = 0; player.vy = 0;
  player.x = flagCol * TILE - 2;
  const h = Math.max(1, Math.round((8 * TILE - player.y) / TILE));
  addScore(400 + h * 100, player.x, player.y - 90);
  sfx("flag");
  musicPos = 0;
}

function updateFlag() {
  const p = player;
  const baseY = 8 * TILE;
  if (p.y < baseY) {
    p.y = Math.min(baseY, p.y + 4.5);
    flagClothY = Math.min(7.2 * TILE, flagClothY + 4.5);
  } else if (!flagDone) {
    flagDone = true;
    state = "walkoff";
    p.face = 1;
  }
}

function updateWalkoff() {
  const p = player;
  p.vy = Math.min(MAXFALL, p.vy + GRAV);
  p.vx = 2.2;
  rectVsGrid(p, null);
  if (p.hitWall && p.onGround) p.vy = -9;
  p.animT += 1.4;
  const doorX = (castleCol + 3) * TILE + 24;
  if (p.x >= doorX) {
    state = "clear";
    clearTimer = 0;
    bonusLeft = timeLeft * 10;
  }
}

function overlap(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 6 && a.y > b.y - b.h && a.y - a.h < b.y;
}

function updateEnemies() {
  enemies.forEach((en) => {
    if (en.state === "gone") return;
    if (!en.active) {
      if (en.x < camX + VIEW_W + 80 && en.x > camX - 160) en.active = true;
      else return;
    }
    en.t++;
    if (en.state === "walk") {
      en.vy = Math.min(MAXFALL, en.vy + GRAV);
      if (en.vx === 0) en.vx = -1.1;
      rectVsGrid(en, null);
      if (en.hitWall) en.vx = 1.1 * en.hitDir;
      if (en.y > VIEW_H + 80) en.state = "gone";
    } else if (en.state === "flat") {
      if (en.t > 30) en.state = "gone";
    } else if (en.state === "flip") {
      en.vy += GRAV;
      en.x += en.vx; en.y += en.vy;
      if (en.y > VIEW_H + 120) en.state = "gone";
    }
  });
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead || a.state !== "walk" || !a.active) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead || b.state !== "walk" || !b.active) continue;
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2) {
        const s = Math.sign(a.x - b.x) || 1;
        a.vx = Math.abs(a.vx) * s;
        b.vx = -Math.abs(b.vx) * s;
      }
    }
  }
  if (state !== "play" || player.growT > 0) return;
  if (player.star > 0) {
    enemies.forEach((en) => {
      if (!en.dead && en.state === "walk" && en.active && overlap(player, en)) {
        player.stompChain = Math.min(player.stompChain + 1, 5);
        flipKill(en, 100 * Math.pow(2, player.stompChain - 1));
      }
    });
  }
  enemies.forEach((en) => {
    if (en.dead || en.state !== "walk" || !en.active) return;
    if (!overlap(player, en)) return;
    const stomp = player.vy > 1.5 && (player.y - en.y + en.h) < en.h * 0.75;
    if (stomp) {
      en.state = "flat"; en.t = 0; en.dead = true;
      player.stompChain = Math.min(player.stompChain + 1, 5);
      addScore(100 * Math.pow(2, player.stompChain - 1), en.x, en.y - 46);
      player.vy = keys.jump ? STOMP_BOUNCE_HELD : STOMP_BOUNCE;
      player.onGround = false;
      sfx("stomp");
      particles.push({ type: "smoke", x: en.x, y: en.y - 20, vx: 0, vy: 0, t: 0 });
    } else damagePlayer();
  });
}

function updateItems() {
  items = items.filter((it) => {
    if (it.state === "emerge") {
      it.et++;
      it.y -= TILE / 45;
      if (it.et >= 45) {
        it.state = "move";
        it.vx = it.kind === "star" ? 2.2 : 1.6;
        it.vy = it.kind === "star" ? -6 : 0;
      }
    } else {
      it.vy = Math.min(MAXFALL, it.vy + (it.kind === "star" ? 0.4 : GRAV));
      rectVsGrid(it, null);
      if (it.hitWall) it.vx = (Math.abs(it.vx) || 1.6) * it.hitDir;
      if (it.kind === "star" && it.onGround) it.vy = -8.5;
      if (it.y > VIEW_H + 80) return false;
    }
    if (state === "play" && player.growT === 0 && overlap(player, it)) {
      addScore(1000, it.x, it.y - 40);
      if (it.kind === "mush") {
        if (!player.big) { player.growMode = "grow"; player.growT = 40; }
      } else {
        player.star = 480;
        musicTempo = 1.3;
      }
      sfx("power");
      return false;
    }
    return true;
  });
  pops = pops.filter((cp) => {
    cp.t++;
    cp.vy += 0.5;
    cp.y += cp.vy;
    return cp.t < 34;
  });
}

function updateParticles() {
  particles = particles.filter((pt) => {
    pt.t++;
    if (pt.type === "shard") {
      pt.vy += 0.45; pt.x += pt.vx; pt.y += pt.vy; pt.rot += 0.2;
      return pt.y < VIEW_H + 40;
    }
    if (pt.type === "spark") return pt.t < 24;
    if (pt.type === "smoke") return pt.t < 26;
    return false;
  });
  popups = popups.filter((pu) => { pu.t++; pu.y -= 1.1; return pu.t < 55; });
  bumps = bumps.filter((b) => { b.t++; return b.t < 12; });
}

function updateTime() {
  timeTick++;
  if (timeTick >= 24) {
    timeTick = 0;
    timeLeft--;
    if (timeLeft === 100 && !hurryPlayed) { hurryPlayed = true; if (player.star <= 0) musicTempo = 1.25; sfx("tick"); }
    if (timeLeft <= 0) { timeLeft = 0; killPlayer(); }
  }
}

function updateCamera() {
  const target = player.x - VIEW_W * 0.42;
  camX += (target - camX) * 0.18;
  camX = Math.max(0, Math.min(levelW * TILE - VIEW_W, camX));
}

function draw() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (state === "loading") { drawLoading(); return; }
  drawBackground();
  ctx.save();
  ctx.translate(-Math.round(camX), 0);
  drawCastle();
  drawFlag();
  drawTiles();
  drawBananas();
  drawItems();
  drawPops();
  enemies.forEach(drawEnemy);
  if (state !== "clear") drawPlayer();
  drawParticles();
  drawPopups();
  ctx.restore();
  drawHUD();
  if (state === "title") drawTitle();
  if (state === "gameover") drawGameOver();
  if (state === "clear") drawClear();
  if (paused && state === "play") drawPause();
}

function drawLoading() {
  ctx.fillStyle = "#5c94fc";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#fff";
  ctx.font = "20px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText("LOADING...", VIEW_W / 2, VIEW_H / 2);
}

function drawBackground() {
  ctx.fillStyle = "#5c94fc";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const c1 = -((camX * 0.25) % 560);
  for (let i = 0; i < 3; i++) drawCloud(c1 + i * 560 + 60, 84 + (i % 2) * 46, 1 + (i % 2) * 0.35);
  const h1 = -((camX * 0.4) % 780);
  for (let i = 0; i < 3; i++) drawHill(h1 + i * 780, i % 2 === 0 ? 120 : 78);
  const b1 = -((camX * 0.65) % 520);
  for (let i = 0; i < 3; i++) drawBush(b1 + i * 520 + 130, i % 2 === 0 ? 3 : 2);
}

function drawCloud(x, y, s) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, 7);
  ctx.arc(x + 26 * s, y - 12 * s, 24 * s, 0, 7);
  ctx.arc(x + 54 * s, y, 21 * s, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 20 * s, y + 2 * s, 94 * s, 14 * s);
}

function drawHill(x, h) {
  ctx.fillStyle = "#1e9e30";
  ctx.beginPath();
  ctx.moveTo(x - h * 1.6, 9 * TILE);
  ctx.quadraticCurveTo(x, 9 * TILE - h * 2.1, x + h * 1.6, 9 * TILE);
  ctx.fill();
  ctx.fillStyle = "#157322";
  const yy = 9 * TILE - h * 0.5;
  ctx.fillRect(x - 8, yy, 4, 8);
  ctx.fillRect(x - 2, yy - 6, 4, 8);
  ctx.fillRect(x + 4, yy, 4, 8);
}

function drawBush(x, n) {
  ctx.fillStyle = "#26b33a";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 34, 9 * TILE - 14, 22, 0, 7);
    ctx.fill();
  }
  ctx.fillRect(x - 20, 9 * TILE - 14, n * 34 + 8, 14);
}

function drawTiles() {
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const x1 = Math.min(levelW - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const code = grid[ty][tx];
      if (!code) continue;
      let dy = 0;
      const bk = bumps.find((b) => b.tx === tx && b.ty === ty);
      if (bk) dy = -Math.sin((bk.t / 12) * Math.PI) * 10;
      const dx = tx * TILE, dyy = ty * TILE + dy;
      switch (code) {
        case 1: ctx.drawImage(IMG.tile_grass, dx, dyy, TILE, TILE); break;
        case 2: ctx.drawImage(IMG.tile_dirt, dx, dyy, TILE, TILE); break;
        case 3: ctx.drawImage(IMG.tile_solid, dx, dyy, TILE, TILE); break;
        case 4: ctx.drawImage(IMG.tile_brick, dx, dyy, TILE, TILE); break;
        case 8: ctx.drawImage(IMG.tile_used, dx, dyy, TILE, TILE); break;
        case 5: case 6: case 7: {
          const flash = timeLeft <= 100 && (frame >> 4) % 2 === 0;
          if (flash) {
            ctx.fillStyle = "#e8a020";
            ctx.fillRect(dx, dyy, TILE, TILE);
            ctx.strokeStyle = "#7a4a10";
            ctx.strokeRect(dx + 1, dyy + 1, TILE - 2, TILE - 2);
          } else ctx.drawImage(IMG.tile_qblock, dx, dyy, TILE, TILE);
          break;
        }
      }
    }
  }
  pipes.forEach(([px, h]) => {
    const x = px * TILE, top = (9 - h) * TILE;
    const img = IMG.tile_pipe;
    const capSrcH = img.height * 0.42;
    const capDestH = 40;
    ctx.drawImage(img, 0, 0, img.width, capSrcH, x, top, TILE * 2, capDestH);
    ctx.drawImage(img, 0, capSrcH, img.width, img.height - capSrcH, x + 4, top + capDestH, TILE * 2 - 8, h * TILE - capDestH);
  });
}

function drawFlag() {
  const px = flagCol * TILE + 24;
  ctx.fillStyle = "#cfd8dc";
  ctx.fillRect(px - 4, 2 * TILE, 8, 8 * TILE - 2 * TILE);
  ctx.fillStyle = "#90a4ae";
  ctx.fillRect(px + 1, 2 * TILE, 3, 6 * TILE);
  ctx.fillStyle = "#f7c531";
  ctx.beginPath(); ctx.arc(px, 2 * TILE - 2, 11, 0, 7); ctx.fill();
  ctx.fillStyle = "#c79417";
  ctx.beginPath(); ctx.arc(px + 3, 2 * TILE + 1, 7, 0, 7); ctx.fill();
  ctx.drawImage(IMG.flag_cloth, px + 2, flagClothY, 46, 45);
}

function drawCastle() {
  const T = TILE, x0 = castleCol * T;
  for (let ty = 6; ty < 9; ty++) for (let tx = 0; tx < 6; tx++) ctx.drawImage(IMG.tile_brick, x0 + tx * T, ty * T, T, T);
  for (let i = 0; i < 6; i += 2) ctx.drawImage(IMG.tile_brick, x0 + i * T, 6 * T - 22, T, 22);
  for (let ty = 4; ty < 6; ty++) for (let tx = 2; tx < 4; tx++) ctx.drawImage(IMG.tile_brick, x0 + tx * T, ty * T, T, T);
  ctx.drawImage(IMG.tile_brick, x0 + 2 * T, 4 * T - 22, T, 22);
  ctx.fillStyle = "#000";
  ctx.fillRect(x0 + 2.2 * T, 7.1 * T, 1.6 * T, 1.9 * T);
  ctx.beginPath();
  ctx.arc(x0 + 3 * T, 7.1 * T, 0.8 * T, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x0 + 0.7 * T, 6.4 * T, 0.55 * T, 0.55 * T);
  ctx.fillRect(x0 + 4.75 * T, 6.4 * T, 0.55 * T, 0.55 * T);
  ctx.fillRect(x0 + 2.8 * T, 4.4 * T, 0.5 * T, 0.5 * T);
}

function drawBananas() {
  const img = IMG.banana;
  bananas.forEach((b) => {
    if (b.x < camX - 60 || b.x > camX + VIEW_W + 60) return;
    const bob = Math.sin((frame + b.t) * 0.09) * 4;
    ctx.drawImage(img, b.x - 17, b.y - 17 + bob, 34, 34);
  });
}

function drawItems() {
  items.forEach((it) => {
    if (it.state === "emerge") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.x - 26, it.blockY - TILE, 52, TILE);
      ctx.clip();
      drawItemSprite(it);
      ctx.restore();
    } else drawItemSprite(it);
  });
}

function drawItemSprite(it) {
  const img = it.kind === "mush" ? IMG.item_mushroom : IMG.item_star;
  const wob = it.kind === "star" ? Math.sin(frame * 0.3) * 3 : 0;
  ctx.drawImage(img, it.x - 19 + wob, it.y - it.h - 4, 38, 38);
}

function drawPops() {
  pops.forEach((cp) => ctx.drawImage(IMG.banana, cp.x - 17, cp.y - 17, 34, 34));
}

function drawEnemy(en) {
  if (en.state === "gone" || !en.active) return;
  let img;
  if (en.state === "flat") img = IMG.enemy_flat;
  else img = (en.t >> 4) % 2 === 0 ? IMG.enemy_a : IMG.enemy_b;
  ctx.save();
  ctx.translate(en.x, en.y);
  if (en.state === "flip") ctx.scale(1, -1);
  if (en.state === "flat") ctx.drawImage(img, -22, -40, 44, 44);
  else ctx.drawImage(img, -22, -44, 44, 44);
  ctx.restore();
}

function playerSprite() {
  const p = player;
  if (state === "dead") return IMG.ko;
  if (state === "flag") return IMG.jump_r;
  if (!p.onGround) return p.vy < 0 ? IMG.jump_r : IMG.fall_r;
  if (p.skid) return IMG.skid;
  if (Math.abs(p.vx) > 0.3) {
    const running = Math.abs(p.vx) > 3.6;
    const seq = running ? ["run_r1", "run_r2"] : ["walk_r1", "walk_r2"];
    p.animT += Math.abs(p.vx) * 0.55;
    return IMG[seq[Math.floor(p.animT / 8) % 2]];
  }
  p.animT = 0;
  return (frame % 180) < 168 ? IMG.idle : IMG.idle2;
}

function drawPlayer() {
  const p = player;
  if (p.invuln > 0 && (frame >> 2) % 2 === 0 && state === "play") return;
  let scale = p.big ? BIG_SCALE : SMALL_SCALE;
  if (p.growT > 0) {
    const flip = Math.floor(p.growT / 5) % 2 === 0;
    scale = p.growMode === "grow" ? (flip ? SMALL_SCALE : BIG_SCALE) : (flip ? BIG_SCALE : SMALL_SCALE);
  }
  let img = playerSprite();
  if (state === "dead" && deadTimer < 30) img = IMG.hurt;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  if (p.face < 0) ctx.scale(-1, 1);
  if (p.star > 0 && (p.star > 60 || (frame >> 2) % 2 === 0)) {
    ctx.filter = `hue-rotate(${(frame * 29) % 360}deg) saturate(1.6) brightness(1.1)`;
  }
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  ctx.filter = "none";
}

function drawParticles() {
  particles.forEach((pt) => {
    if (pt.type === "shard") {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.fillStyle = "#b5651d";
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = "#8b4513";
      ctx.fillRect(-7, 2, 14, 5);
      ctx.restore();
    } else if (pt.type === "spark") {
      const img = IMG.fx_sparkle;
      const s = 20 + pt.t * 1.5;
      ctx.globalAlpha = 1 - pt.t / 24;
      ctx.drawImage(img, pt.x - s / 2, pt.y - s / 2 - 14, s, s * 0.75);
      ctx.globalAlpha = 1;
    } else if (pt.type === "smoke") {
      const img = IMG.fx_smoke;
      const s = 26 + pt.t;
      ctx.globalAlpha = 1 - pt.t / 26;
      ctx.drawImage(img, pt.x - s / 2, pt.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
  });
}

function drawPopups() {
  ctx.font = "13px 'Press Start 2P', monospace";
  popups.forEach((pu) => {
    ctx.globalAlpha = pu.t > 40 ? (55 - pu.t) / 15 : 1;
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillText(pu.text, pu.x + 1, pu.y + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(pu.text, pu.x, pu.y);
    ctx.globalAlpha = 1;
  });
}

function hudText(text, x, y) {
  ctx.textAlign = "left";
  ctx.fillStyle = "#000";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

function drawHUD() {
  ctx.font = "16px 'Press Start 2P', monospace";
  hudText("MONKEY", 40, 34);
  hudText(String(score).padStart(6, "0"), 40, 60);
  ctx.drawImage(IMG.banana, 330, 18, 30, 30);
  hudText("x" + String(bananaCount).padStart(2, "0"), 368, 42);
  hudText("WORLD", 545, 34);
  hudText("1-1", 561, 60);
  hudText("TIME", 700, 34);
  hudText(String(timeLeft).padStart(3, "0"), 708, 60);
  ctx.drawImage(IMG.face1, 830, 16, 40, 32);
  hudText("x" + Math.max(0, lives), 878, 42);
}

function drawTitle() {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#e9e2ce";
  ctx.fillRect(VIEW_W / 2 - 330, 80, 660, 240);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 6;
  ctx.strokeRect(VIEW_W / 2 - 330, 80, 660, 240);
  ctx.textAlign = "center";
  ctx.font = "30px 'Press Start 2P', monospace";
  ctx.fillStyle = "#000";
  ctx.fillText("SUPER", VIEW_W / 2 + 3, 143);
  ctx.fillStyle = "#e52521";
  ctx.fillText("SUPER", VIEW_W / 2, 140);
  ctx.font = "42px 'Press Start 2P', monospace";
  ctx.fillStyle = "#000";
  ctx.fillText("MONKEY BROS.", VIEW_W / 2 + 4, 203);
  ctx.fillStyle = "#f7c531";
  ctx.fillText("MONKEY BROS.", VIEW_W / 2, 199);
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.fillStyle = "#5a3b1e";
  ctx.fillText("香蕉大冒險  WORLD 1-1", VIEW_W / 2, 252);
  ctx.font = "18px 'Press Start 2P', monospace";
  if ((frame >> 5) % 2 === 0) {
    ctx.fillStyle = "#000";
    ctx.fillText("PRESS ENTER / TAP TO START", VIEW_W / 2, 296);
  }
  const img = IMG.powerup;
  const s = 1.35;
  ctx.drawImage(img, VIEW_W / 2 - (img.width * s) / 2, 335, img.width * s, img.height * s);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.font = "40px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("GAME OVER", VIEW_W / 2, VIEW_H / 2 - 10);
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ccc";
  ctx.fillText("PRESS ENTER", VIEW_W / 2, VIEW_H / 2 + 40);
}

function drawClear() {
  clearTimer++;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(VIEW_W / 2 - 300, 150, 600, 200);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(VIEW_W / 2 - 300, 150, 600, 200);
  ctx.textAlign = "center";
  ctx.font = "30px 'Press Start 2P', monospace";
  ctx.fillStyle = "#f7c531";
  ctx.fillText("COURSE CLEAR!", VIEW_W / 2, 215);
  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("BANANA BONUS  " + bonusLeft, VIEW_W / 2, 265);
  if (clearTimer % 8 === 0 && bonusLeft > 0) {
    const d = Math.min(100, bonusLeft);
    bonusLeft -= d;
    score += d;
    sfx("tick");
  }
  if (bonusLeft <= 0 && clearTimer > 90 && (frame >> 5) % 2 === 0) {
    ctx.fillStyle = "#7fff7f";
    ctx.fillText("PRESS ENTER TO REPLAY", VIEW_W / 2, 315);
  }
}

function drawPause() {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.font = "30px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("PAUSED", VIEW_W / 2, VIEW_H / 2);
}

function step() {
  frame++;
  if (state === "loading") return;
  if (paused && state === "play") { anyEnter = false; return; }
  if (state === "title") {
    if (anyEnter) { score = 0; bananaCount = 0; lives = 5; resetLevel(); state = "play"; }
    anyEnter = false;
    return;
  }
  if (state === "gameover") {
    if (anyEnter) state = "title";
    anyEnter = false;
    return;
  }
  if (state === "clear") {
    updateParticles();
    if (bonusLeft <= 0 && anyEnter && clearTimer > 90) state = "title";
    anyEnter = false;
    return;
  }
  if (state === "dead") {
    deadTimer++;
    if (deadTimer === 26) player.vy = -13;
    if (deadTimer > 26) {
      player.vy = Math.min(MAXFALL, player.vy + GRAV);
      player.y += player.vy;
    }
    if (deadTimer > 150) {
      lives--;
      if (lives < 0) state = "gameover";
      else { resetLevel(); state = "play"; }
    }
    anyEnter = false;
    return;
  }
  if (state === "play") {
    updatePlayer();
    if (state === "play") { updateEnemies(); updateItems(); updateTime(); }
  } else if (state === "flag") {
    updateFlag();
  } else if (state === "walkoff") {
    updateWalkoff();
  }
  updateParticles();
  updateCamera();
  anyEnter = false;
}

function loop() {
  step();
  draw();
  requestAnimationFrame(loop);
}

function loadImages(cb) {
  let left = SPRITES.length;
  SPRITES.forEach((n) => {
    const im = new Image();
    im.onload = () => { if (--left === 0) cb(); };
    im.onerror = () => { console.error("missing sprite:", n); if (--left === 0) cb(); };
    im.src = "assets/sprites/" + n + ".png";
    IMG[n] = im;
  });
}

loadImages(() => { resetLevel(); state = "title"; });
loop();
