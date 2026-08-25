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
  "idle", "idle2", "skid", "run_r1", "run_r2", "jump_r", "fall_r",
  "hurt", "ko", "dead", "powerup", "powerdown",
  "tile_grass", "tile_dirt", "tile_brick", "tile_qblock", "tile_used", "tile_solid",
  "tile_pipe", "tile_lava", "tile_water", "tile_ice", "flag_cloth",
  "banana", "item_star", "item_mushroom", "fireflower",
  "fx_sparkle", "fx_smoke", "fx_fireball",
  "enemy_a", "enemy_b", "enemy_flat",
  "shell", "enemy_fly", "plant", "boss", "hammer",
  "tile_checkpoint", "tile_checkpoint_on",
  "face1",
];
const IMG = {};

const keys = { left: false, right: false, jump: false, run: false, down: false };
let jumpBuffer = 0, wantFire = false, fireCd = 0;
let anyEnter = false;

function bindKey(code, down) {
  switch (code) {
    case "ArrowLeft": case "KeyA": keys.left = down; return true;
    case "ArrowRight": case "KeyD": keys.right = down; return true;
    case "Space": case "KeyZ": case "KeyK": case "ArrowUp": case "KeyW":
      if (down && !keys.jump) jumpBuffer = 7;
      keys.jump = down; return true;
    case "ShiftLeft": case "ShiftRight": case "KeyX": case "KeyJ":
      if (down && !keys.run) wantFire = true;
      keys.run = down; return true;
    case "ArrowDown": case "KeyS": keys.down = down; return true;
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
  if (state === "title" && konamiOn) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { titleSel = (titleSel + LEVELS.length - 1) % LEVELS.length; sfx("tick"); e.preventDefault(); return; }
    if (e.code === "ArrowRight" || e.code === "KeyD") { titleSel = (titleSel + 1) % LEVELS.length; sfx("tick"); e.preventDefault(); return; }
  }
  if (handleCheats(e.code)) { e.preventDefault(); return; }
  const handled = bindKey(e.code, true);
  if (handled || ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
  initAudioOnce();
});
window.addEventListener("keyup", (e) => bindKey(e.code, false));
window.addEventListener("blur", () => {
  keys.left = keys.right = keys.jump = keys.run = keys.down = false;
  jumpBuffer = 0; wantFire = false;
});

document.querySelectorAll("#touch .btn").forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => {
    e.preventDefault(); initAudioOnce();
    if (k === "jump" && !keys.jump) jumpBuffer = 7;
    if (k === "run" && !keys.run) wantFire = true;
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
    case "fire": tone(180, 60, 0.25, "sawtooth", 0.1); break;
    case "throw": tone(620, 180, 0.12, "square", 0.1); break;
    case "crouch": tone(200, 140, 0.07, "square", 0.07); break;
    case "check": [523, 659, 784].forEach((f, i) => tone(f, f, 0.08, "square", 0.11, i * 0.07)); break;
    case "thunder": tone(180, 60, 0.4, "sawtooth", 0.14); tone(90, 40, 0.5, "triangle", 0.12); break;
    case "konami": [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.09, "square", 0.13, i * 0.06)); break;
    case "wing": tone(880, 640, 0.06, "triangle", 0.06); break;
    case "ending": [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.14, "square", 0.12, i * 0.16)); break;
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

// ---------------- cheat codes ----------------
const KONAMI = ["U", "U", "D", "D", "L", "R", "L", "R", "B", "A"];

function cheatTokens(code) {
  switch (code) {
    case "ArrowUp": case "KeyW": return ["U"];
    case "ArrowDown": case "KeyS": return ["D"];
    case "ArrowLeft": return ["L"];
    case "KeyA": return ["L", "A"]; // WASD-left or NES A button
    case "ArrowRight": case "KeyD": return ["R"];
    case "Space": case "KeyZ": case "KeyK": return ["A"]; // NES A ~= jump
    case "KeyB": case "KeyX": case "KeyJ":
    case "ShiftLeft": case "ShiftRight": return ["B"]; // NES B ~= run/fire
    default: return /^Key[A-Z]$/.test(code) ? [code.slice(3)] : [];
  }
}

function konamiMatch() {
  if (konamiEv.length < KONAMI.length) return false;
  const tail = konamiEv.slice(-KONAMI.length);
  return KONAMI.every((tok, i) => tail[i].includes(tok));
}

function handleCheats(code) {
  const toks = cheatTokens(code);
  if (toks.length) {
    konamiEv.push(toks);
    if (konamiEv.length > KONAMI.length + 2) konamiEv.shift();
  }
  if (state === "title" && !konamiOn && konamiMatch()) {
    konamiUnlock();
    konamiEv = [];
    return false;
  }
  const m = /^Key([A-Z])$/.exec(code);
  if (!m || !konamiOn || state !== "play") return false;
  const ch = m[1].toLowerCase();
  const prev = cheatProgress;
  const next = prev + ch;
  let live = "";
  for (let i = 0; i < next.length; i++) {
    const suf = next.slice(i);
    if ("fly".startsWith(suf) || "super".startsWith(suf)) { live = suf; break; }
  }
  cheatProgress = live;
  cheatIdleT = 0;
  if (ch === "p" && prev.length >= 2 && "super".startsWith(next)) return true; // typing "su|p...": don't pause
  if (next === "fly") { cheatProgress = ""; activateFly(); }
  else if (next === "super") { cheatProgress = ""; activateSuper(); }
  return false;
}

function konamiUnlock() {
  konamiOn = true;
  lives = 99;
  titleSel = levelIdx;
  sfx("konami");
}

function activateFly() {
  cheatFly = !cheatFly;
  player.fly = cheatFly;
  sfx(cheatFly ? "power" : "shrink");
  popups.push({ x: player.x, y: player.y - 120, t: 0, text: cheatFly ? "FLY ON!" : "FLY OFF" });
}

function activateSuper() {
  cheatSuper = !cheatSuper;
  player.super = cheatSuper;
  sfx(cheatSuper ? "power" : "shrink");
  popups.push({ x: player.x, y: player.y - 140, t: 0, text: cheatSuper ? "SUPER ON!" : "SUPER OFF" });
}

function superRespawn() {
  const p = player;
  const fromTx = Math.max(1, Math.floor(camX / TILE) + 2);
  let placed = false;
  for (let tx = fromTx; tx <= Math.min(levelW - 2, fromTx + 14) && !placed; tx++) {
    for (let ty = ROWS - 2; ty >= 3; ty--) {
      if (solidAt(tx, ty) && !solidAt(tx, ty - 1) && !solidAt(tx, ty - 2)) {
        p.x = tx * TILE + TILE / 2;
        p.y = ty * TILE;
        placed = true;
        break;
      }
    }
  }
  if (!placed) { p.x = fromTx * TILE + TILE / 2; p.y = (ROWS - 2) * TILE; }
  p.vx = 0; p.vy = 0;
  p.crouching = false;
  p.h = p.big ? 72 : 46;
  p.invuln = 100;
  particles.push({ type: "smoke", x: p.x, y: p.y - 30, vx: 0, vy: 0, t: 0 });
  popups.push({ x: p.x, y: p.y - 110, t: 0, text: "SUPER RESCUE!" });
  sfx("power");
}

let state = "loading", paused = false, frame = 0;
let score = 0, bananaCount = 0, lives = 5, timeLeft = 300, timeTick = 0;
let camX = 0;
let player, enemies, bananas, items, pops, particles, popups, bumps, shots;
let levelW = 204, grid = [], pipes = [];
let flagCol = 172, castleCol = 180;
let flagClothY = 0, flagDone = false;
let clearTimer = 0, bonusLeft = 0, deadTimer = 0, hurryPlayed = false;
let fireSpots = [], fireballs = [];
let levelIdx = 0, endT = 0;
let konamiOn = false, titleSel = 0, cheatProgress = "", cheatIdleT = 0;
let cheatFly = false, cheatSuper = false;
let konamiEv = [];

// ---- gameplay expansion state ----
let hitstop = 0, shakeT = 0, shakeMag = 0;
let cpActive = false, cpLevel = -1, cpX = 0, cpY = 0;
let deathsThisLevel = 0, bananasTotalLevel = 0, bigGot = 0, lastRank = "C";
let allBigGotSession = 0;
let boss = null, plants = [], bigbananas = [], hammers = [];
let hiddenCheck = false;
function addShake(t, m) { shakeT = Math.max(shakeT, t); shakeMag = m; }

// per-level extras: hidden blocks / big bananas / new enemies / plants / bosses
const HIDDEN_SPOTS = {
  0: [[50, 5, "1UP"], [90, 5, "banana"]],
  1: [[45, 5, "banana"], [130, 5, "1UP"]],
  2: [[20, 6, "1UP"], [107, 3, "banana"]],
  3: [[35, 5, "banana"], [100, 5, "1UP"]],
  4: [[60, 5, "banana"], [120, 5, "1UP"]],
  5: [[95, 5, "banana"], [110, 6, "1UP"]],
  6: [[30, 5, "banana"], [155, 4, "1UP"]],
  7: [[70, 5, "banana"], [140, 5, "1UP"]],
  8: [[40, 5, "banana"], [130, 5, "1UP"]],
  9: [[52, 5, "banana"], [125, 5, "1UP"]],
  10: [[45, 5, "banana"], [115, 5, "1UP"]],
  11: [[65, 5, "banana"], [155, 5, "1UP"]],
  12: [[75, 5, "banana"], [120, 5, "1UP"]],
  13: [[63, 5, "banana"], [105, 5, "1UP"]],
  14: [[125, 5, "banana"], [60, 5, "1UP"]],
  15: [[118, 5, "banana"], [165, 5, "1UP"]],
};
const BIG_SPOTS = {
  0: [[97, 6], [45, 3], [161, 4]],
  1: [[59, 5], [107, 4], [152, 5]],
  2: [[16, 6], [51, 4], [126, 4]],
  3: [[31, 5], [91, 4], [141, 5]],
  4: [[45, 6], [89, 5], [149, 5]],
  5: [[42, 5], [80, 5], [122, 5]],
  6: [[21, 6], [64, 5], [168, 6]],
  7: [[65, 5], [105, 5], [147, 4]],
  8: [[17, 6], [60, 4], [165, 6]],
  9: [[37, 4], [72, 4], [154, 5]],
  10: [[34, 5], [69, 5], [143, 5]],
  11: [[41, 5], [82, 5], [163, 5]],
  12: [[31, 5], [97, 4], [135, 5]],
  13: [[27, 5], [58, 4], [130, 5]],
  14: [[22, 5], [100, 5], [171, 5]],
  15: [[22, 5], [73, 4], [152, 5]],
};
const SHELL_SPOTS = {
  0: [33, 83], 1: [47, 77, 131], 2: [], 3: [36, 101], 4: [57, 111],
  5: [51, 90], 6: [], 7: [41, 99], 8: [], 9: [66, 107],
  10: [66, 107], 11: [49, 131], 12: [67, 106], 13: [33, 105], 14: [],
  15: [26, 139],
};
const FLY_SPOTS = {
  2: [[24, 300], [52, 260]], 3: [[70, 240], [110, 230]],
  6: [[27, 320], [78, 330], [146, 310]], 8: [[30, 300], [110, 290]],
  10: [[45, 280], [95, 270]], 11: [[70, 300], [130, 290]],
  14: [[60, 280], [120, 300]],
};
const PLANT_PIPES = { 1: [32, 40, 94], 9: [44, 104], 12: [104] };
const BOSS_LEVELS = {
  3: { hp: 3, clearStairs: [[172, 180]] },
  15: { hp: 5, clearStairs: [[182, 190]] },
};

function setupLevelExtras(def) {
  plants = []; bigbananas = []; hammers = []; boss = null;
  (HIDDEN_SPOTS[levelIdx] || []).forEach(([hx, hy, kind]) => {
    if (grid[hy] && grid[hy][hx] === 0) grid[hy][hx] = kind === "1UP" ? 12 : 13;
  });
  (BIG_SPOTS[levelIdx] || []).forEach(([bx, by]) => {
    bigbananas.push({ x: bx * TILE + 24, y: by * TILE + 24, got: false });
  });
  (SHELL_SPOTS[levelIdx] || []).forEach(sx => {
    enemies.push({ x: sx * TILE + 24, y: 9 * TILE, vx: -0.9, vy: 0,
      w: 36, h: 36, state: "walk", t: 0, active: false, dead: false, hitDir: 0, kind: "shell" });
  });
  (FLY_SPOTS[levelIdx] || []).forEach(([fx, fy]) => {
    enemies.push({ x: fx * TILE + 24, y: fy * TILE, baseY: fy * TILE,
      vx: -1.3, vy: 0, w: 34, h: 30, state: "fly", t: 0,
      active: false, dead: false, hitDir: 0, kind: "fly" });
  });
  (PLANT_PIPES[levelIdx] || []).forEach(px => {
    const pi = pipes.find(pp => pp[0] === px);
    if (pi) plants.push({ x: pi[0] * TILE + TILE, topY: (pi[2] - pi[1]) * TILE,
      t: Math.floor(Math.random() * 120), period: 220,
      rise: 0, dead: false, h: 46 });
  });
  const bs = BOSS_LEVELS[levelIdx];
  if (bs) {
    const wallCol = def.flagCol - 6;
    // victory staircase would collide with the boss arena -> remove it
    (bs.clearStairs || []).forEach(([a, b]) => {
      for (let tx = a; tx < b; tx++)
        for (let ty = 0; ty < ROWS; ty++)
          if (tx !== wallCol && grid[ty] && grid[ty][tx] === 3) grid[ty][tx] = 0;
    });
    for (let ty = 0; ty <= 8; ty++) grid[ty][wallCol] = 3;
    boss = { x: (wallCol - 8) * TILE, y: 6 * TILE, w: 84, h: 84, hp: bs.hp, maxHp: bs.hp,
      vx: 0, vy: 0, prevVy: 0, t: 0, throwCd: 150, hopCd: 260, dizzy: 0, inv: 0,
      minX: (wallCol - 13) * TILE, maxX: (wallCol - 2) * TILE,
      dead: false, wallCol, face: -1, onGround: false, wasGround: false, hitWall: false, hitDir: 0 };
  }
  // checkpoint: away from enemy spawn points (never respawn into danger)
  cpX = 0; cpY = 0;
  let cpc = Math.floor(def.flagCol / 2);
  if (bs) cpc = def.flagCol - 14;
  const cp = findCheckpoint(cpc);
  if (cp) {
    cpX = cp.surf.tx * TILE + 24; cpY = cp.surf.ty * TILE;
    if (cp.conflicts) {
      enemies.forEach(en => {
        if (cp.conflicts.some(ex => Math.abs(en.x - ex) < 4)) en.x += 6 * TILE;
      });
    }
  }
}
function findSurfaceNear(col) {
  for (let d = 0; d <= 8; d++) {
    const cands = d === 0 ? [col] : [col - d, col + d];
    for (const tx of cands) {
      if (tx < 1 || tx >= levelW - 1) continue;
      for (let ty = 2; ty <= ROWS - 2; ty++)
        if (solidAt(tx, ty) && !solidAt(tx, ty - 1)) return { tx, ty };
    }
  }
  return null;
}
function surfaceAtExact(tx) {
  for (let ty = 2; ty <= ROWS - 2; ty++)
    if (solidAt(tx, ty) && !solidAt(tx, ty - 1)) return ty;
  return null;
}
// checkpoint: exact-column surface near col AND away from enemy spawn points
function findCheckpoint(col) {
  const spawnX = enemies.filter(e => e.kind !== "fly").map(e => e.x);
  let fallback = null;
  for (let d = 0; d <= 24; d++) {
    const cands = d === 0 ? [col] : [col - d, col + d];
    for (const tx of cands) {
      if (tx < 1 || tx >= levelW - 1) continue;
      const ty = surfaceAtExact(tx);
      if (ty === null) continue;
      const px = tx * TILE + 24;
      const safe = spawnX.every(ex => Math.abs(px - ex) >= TILE * 6);
      if (safe) return { surf: { tx, ty }, conflicts: null };
      if (!fallback) fallback = { surf: { tx, ty },
        conflicts: spawnX.filter(ex => Math.abs(px - ex) < TILE * 3.5) };
    }
  }
  return fallback;
}

const THEMES = {
  over: { sky: "#5c94fc", top: "tile_grass", fill: "tile_dirt", decor: "over" },
  under: { sky: "#04060e", top: "tile_brick", fill: "tile_dirt", decor: "none" },
  sky: { sky: "#8ecbff", top: "tile_grass", fill: "tile_dirt", decor: "sky" },
  castle: { sky: "#14141f", top: "tile_solid", fill: "tile_solid", decor: "windows" },
  jungle: { sky: "#0e3b1e", top: "tile_grass", fill: "tile_dirt", decor: "jungle" },
  cave: { sky: "#06282a", top: "tile_brick", fill: "tile_dirt", decor: "none" },
  treetop: { sky: "#7ec8ff", top: "tile_grass", fill: "tile_dirt", decor: "sky" },
  pyramid: { sky: "#d8a95a", top: "tile_solid", fill: "tile_solid", decor: "none" },
  cloud: { sky: "#9ad4ff", top: "tile_grass", fill: "tile_dirt", decor: "sky" },
  ice: { sky: "#a8c8e8", top: "tile_ice", fill: "tile_ice", decor: "over" },
  night: { sky: "#0a0a2a", top: "tile_grass", fill: "tile_dirt", decor: "stars" },
  rainbow: { sky: "#b18ae8", top: "tile_grass", fill: "tile_dirt", decor: "over" },
  volcano: { sky: "#3a1208", top: "tile_solid", fill: "tile_solid", decor: "embers" },
  lavacave: { sky: "#180505", top: "tile_brick", fill: "tile_dirt", decor: "embers" },
  bridge: { sky: "#2a0a0a", top: "tile_solid", fill: "tile_solid", decor: "embers" },
  final: { sky: "#101018", top: "tile_solid", fill: "tile_solid", decor: "windows" },
};

const LEVELS = [
  { name: "1-1", w: 204, theme: "over", flagCol: 172, castleCol: 180, build: build11 },
  { name: "1-2", w: 190, theme: "under", flagCol: 174, castleCol: 181, build: build12 },
  { name: "1-3", w: 200, theme: "sky", flagCol: 176, castleCol: 183, build: build13 },
  { name: "1-4", w: 210, theme: "castle", flagCol: 190, castleCol: 198, build: build14 },
  { name: "2-1", w: 200, theme: "jungle", flagCol: 186, castleCol: 192, build: build21 },
  { name: "2-2", w: 200, theme: "cave", flagCol: 186, castleCol: 192, build: build22 },
  { name: "2-3", w: 210, theme: "treetop", flagCol: 192, castleCol: 199, build: build23 },
  { name: "2-4", w: 200, theme: "pyramid", flagCol: 186, castleCol: 192, build: build24 },
  { name: "3-1", w: 210, theme: "cloud", flagCol: 192, castleCol: 199, build: build31 },
  { name: "3-2", w: 200, theme: "ice", slippery: true, rain: true, flagCol: 184, castleCol: 191, build: build32 },
  { name: "3-3", w: 210, theme: "night", stars: true, flagCol: 192, castleCol: 199, build: build33 },
  { name: "3-4", w: 220, theme: "rainbow", flagCol: 200, castleCol: 207, build: build34 },
  { name: "4-1", w: 200, theme: "volcano", embers: true, flagCol: 186, castleCol: 193, build: build41 },
  { name: "4-2", w: 210, theme: "lavacave", embers: true, flagCol: 192, castleCol: 199, build: build42 },
  { name: "4-3", w: 210, theme: "bridge", embers: true, flagCol: 192, castleCol: 199, build: build43 },
  { name: "4-4", w: 220, theme: "final", flagCol: 202, castleCol: 209, build: build44 },
];

function buildLevel() {
  const def = LEVELS[levelIdx];
  levelW = def.w;
  flagCol = def.flagCol;
  castleCol = def.castleCol;
  grid = Array.from({ length: ROWS }, () => new Int8Array(levelW));
  pipes = []; bananas = []; enemies = []; fireSpots = []; fireballs = []; shots = [];
  const ground = (a, b) => { for (let x = a; x <= b; x++) { grid[9][x] = 1; grid[10][x] = 2; } };
  const blocks = (y, x, s) => {
    const m = { B: 4, "?": 5, M: 6, "*": 7, "=": 3 };
    [...s].forEach((c, i) => { if (m[c]) grid[y][x + i] = m[c]; });
  };
  const pipe = (x, h, baseRow) => {
    const br = baseRow || 9;
    pipes.push([x, h, br]);
    for (let i = 0; i < 2; i++) for (let j = 0; j < h; j++) grid[br - 1 - j][x + i] = 9;
  };
  const bRow = (y, x0, n) => {
    for (let i = 0; i < n; i++) bananas.push({ x: (x0 + i) * TILE + 24, y: y * TILE + 24, t: Math.random() * 100 });
  };
  const enemyAt = (x, ry) => {
    enemies.push({ x: x * TILE + 24, y: (ry || 9) * TILE, vx: -1.1, vy: 0, w: 36, h: 40, state: "walk", t: 0, active: false, dead: false, hitDir: 0 });
  };
  const stair = (x0, n, dir) => {
    for (let i = 0; i < n; i++) {
      const h = dir > 0 ? i + 1 : n - i;
      for (let j = 0; j < h; j++) grid[8 - j][x0 + i] = 3;
    }
  };
  const column = (x, topRow) => { for (let y = topRow; y <= 8; y++) grid[y][x] = 3; };
  const plat = (y, a, b) => { for (let x = a; x <= b; x++) grid[y][x] = 1; };
  const lavaPit = (a, b) => { for (let x = a; x <= b; x++) { grid[9][x] = 10; grid[10][x] = 10; } };
  const waterPit = (a, b) => { for (let x = a; x <= b; x++) { grid[9][x] = 11; grid[10][x] = 11; } };
  const fire = (x, period) => fireSpots.push({ x: x * TILE + 24, y0: 9 * TILE, period, t: Math.random() * period });
  const ceil = (a, b) => { for (let x = a; x <= b; x++) grid[1][x] = 4; };
  def.build({ ground, blocks, pipe, bRow, enemyAt, stair, column, plat, lavaPit, waterPit, fire, ceil });
  setupLevelExtras(def);
  grid[8][flagCol] = 3;
  bananasTotalLevel = bananas.length;
}

function build11({ ground, blocks, pipe, bRow, enemyAt, stair }) {
  ground(0, 63); ground(66, 95); ground(99, 116); ground(119, 143); ground(146, levelW - 1);
  blocks(6, 17, "?");
  blocks(6, 21, "B?BMB"); blocks(3, 23, "?");
  blocks(6, 68, "B?B"); blocks(3, 69, "?");
  blocks(3, 76, "BBBBBBBB");
  blocks(6, 77, "B?B");
  blocks(6, 100, "?*");
  blocks(6, 135, "BMB");
  blocks(6, 147, "B?B?B"); blocks(3, 149, "B");
  stair(106, 4, 1); stair(110, 4, -1); stair(120, 4, 1); stair(158, 8, 1);
  pipe(28, 2); pipe(36, 3); pipe(44, 4); pipe(52, 4); pipe(128, 2);
  bRow(8, 10, 3); bRow(6, 32, 3); bRow(7, 63, 4); bRow(2, 78, 4); bRow(6, 95, 5);
  bRow(8, 104, 2); bRow(8, 110, 1); bRow(5, 116, 4); bRow(7, 125, 2); bRow(7, 143, 4);
  bRow(8, 154, 3); bRow(7, 167, 4);
  [26, 33, 41, 50, 74, 80, 82, 91, 103, 115, 131, 133, 140, 150, 155, 168].forEach((x) => enemyAt(x));
}

function build12({ ground, blocks, pipe, bRow, enemyAt, stair, ceil }) {
  ground(0, 58); ground(61, 105); ground(109, 150); ground(153, levelW - 1);
  ceil(8, 158);
  blocks(6, 12, "BBBBB"); bRow(5, 12, 5);
  blocks(6, 20, "?");
  blocks(6, 24, "B?B?B");
  pipe(32, 2); pipe(40, 3);
  enemyAt(30); enemyAt(38); enemyAt(46);
  stair(50, 4, 1);
  blocks(6, 62, "BBBBB?BBBB"); bRow(5, 63, 8);
  enemyAt(74); enemyAt(76);
  for (let x = 80; x <= 90; x += 2) { blocks(6, x, "B"); bRow(5, x, 1); }
  pipe(94, 3); enemyAt(92);
  bRow(6, 105, 5);
  stair(112, 4, 1); stair(116, 4, -1);
  blocks(6, 124, "BBBMBBBBBB"); bRow(5, 125, 9);
  enemyAt(130); enemyAt(132); enemyAt(138);
  pipe(142, 2);
  bRow(7, 150, 4);
  bRow(8, 8, 3); bRow(8, 59, 2); bRow(8, 110, 2); bRow(8, 156, 3);
  stair(160, 6, 1);
}

function build13({ ground, blocks, pipe, bRow, enemyAt, stair, plat }) {
  ground(0, 14); ground(156, levelW - 1);
  plat(8, 18, 22); bRow(7, 18, 5);
  plat(7, 26, 29); bRow(6, 26, 4);
  plat(6, 34, 37); bRow(5, 34, 4);
  plat(7, 42, 48); pipe(44, 2, 7); enemyAt(43, 7);
  plat(6, 52, 56); bRow(5, 52, 5);
  plat(5, 61, 64); bRow(4, 61, 4);
  plat(7, 69, 74);
  plat(8, 78, 82); enemyAt(80, 8); bRow(7, 78, 5);
  plat(7, 88, 93); pipe(91, 2, 7); enemyAt(89, 7);
  plat(6, 98, 101); bRow(5, 98, 4);
  plat(5, 106, 109); bRow(4, 106, 4);
  plat(6, 115, 119); bRow(5, 115, 5);
  plat(7, 125, 130); blocks(4, 126, "?*"); enemyAt(128, 7);
  plat(8, 136, 140); bRow(7, 136, 5);
  plat(7, 146, 150); enemyAt(148, 7);
  bRow(8, 15, 3); bRow(4, 30, 3); bRow(3, 48, 3); bRow(4, 84, 3); bRow(3, 110, 4); bRow(6, 152, 4);
  stair(164, 4, 1);
  enemyAt(160); enemyAt(162);
}

function build14({ ground, blocks, bRow, enemyAt, stair, column, lavaPit, fire, ceil }) {
  ground(0, 29); ground(33, 49); ground(54, 89); ground(98, 120); ground(124, 139); ground(145, levelW - 1);
  lavaPit(30, 32); lavaPit(50, 53); lavaPit(90, 97); lavaPit(121, 123); lavaPit(140, 144);
  fire(31, 250); fire(51, 250); fire(91, 250); fire(96, 250); fire(122, 250); fire(141, 250);
  grid[9][92] = 3; grid[9][93] = 3;
  ceil(6, 28); ceil(33, 49); ceil(54, 87); ceil(98, 119); ceil(124, 139); ceil(145, 170);
  column(20, 7); column(38, 7); column(60, 6); column(61, 8); column(112, 7); column(113, 8); column(130, 7); column(140, 7); column(141, 6);
  blocks(6, 105, "M");
  bRow(6, 30, 3); bRow(6, 50, 4); bRow(6, 90, 8); bRow(6, 121, 3); bRow(6, 140, 5);
  bRow(8, 8, 3); bRow(8, 64, 3); bRow(8, 100, 3); bRow(8, 146, 3); bRow(8, 156, 3);
  [15, 25, 40, 45, 60, 62, 70, 72, 100, 108, 110, 130, 150, 155, 160, 165].forEach((x) => enemyAt(x));
  stair(172, 8, 1);
}

function build21({ ground, blocks, pipe, bRow, enemyAt, stair, column }) {
  ground(0, 43); ground(47, 88); ground(92, 133); ground(137, levelW - 1);
  blocks(6, 14, "B?B"); bRow(5, 14, 3);
  blocks(6, 30, "BB?BB");
  pipe(22, 2); pipe(35, 3);
  enemyAt(18); enemyAt(27); enemyAt(33); enemyAt(41);
  column(44, 7); column(45, 8);
  blocks(6, 52, "BBBB"); bRow(5, 52, 4);
  enemyAt(56); enemyAt(58);
  blocks(6, 64, "B?B?B");
  pipe(72, 2); enemyAt(70); enemyAt(76);
  stair(80, 4, 1); stair(85, 4, -1);
  bRow(4, 81, 3);
  blocks(6, 96, "BBMBB");
  enemyAt(100); enemyAt(102); enemyAt(110);
  pipe(116, 3);
  bRow(8, 120, 4);
  blocks(6, 126, "B?B");
  enemyAt(124); enemyAt(130);
  stair(140, 5, 1);
  column(148, 6); column(149, 7); column(150, 8);
  bRow(5, 141, 4);
  enemyAt(155); enemyAt(160); enemyAt(166);
  blocks(6, 158, "B?B");
  stair(172, 6, 1);
  bRow(8, 180, 4);
}

function build22({ ground, blocks, pipe, bRow, enemyAt, stair, plat, waterPit, ceil }) {
  ground(0, 39); waterPit(40, 44); ground(45, 78); waterPit(79, 84); ground(85, 120); waterPit(121, 126); ground(127, levelW - 1);
  ceil(6, 150);
  blocks(6, 12, "B?B");
  enemyAt(18); enemyAt(20);
  plat(6, 26, 30); bRow(5, 26, 5);
  blocks(6, 34, "BBB");
  enemyAt(30); enemyAt(36);
  blocks(6, 41, "BBB");
  bRow(4, 40, 5);
  enemyAt(50); enemyAt(52);
  blocks(6, 56, "B?B?B");
  pipe(64, 2);
  enemyAt(62); enemyAt(70);
  plat(6, 74, 76);
  blocks(8, 81, "B"); blocks(8, 84, "B");
  bRow(4, 79, 6);
  enemyAt(90); enemyAt(92); enemyAt(100);
  blocks(6, 96, "BBMBB");
  stair(104, 4, 1); stair(108, 4, -1);
  bRow(8, 112, 3);
  enemyAt(116);
  blocks(8, 123, "B"); blocks(8, 126, "B");
  bRow(4, 121, 6);
  blocks(6, 132, "B?B");
  enemyAt(136); enemyAt(142); enemyAt(148);
  blocks(6, 140, "BBBB"); bRow(5, 140, 4);
  stair(154, 6, 1);
  bRow(8, 164, 4);
  blocks(6, 168, "B?B");
}

function build23({ ground, blocks, pipe, bRow, enemyAt, stair, plat }) {
  ground(0, 12); ground(190, levelW - 1);
  plat(8, 16, 20); enemyAt(18, 8);
  plat(7, 24, 28); bRow(6, 24, 5);
  plat(6, 32, 36); enemyAt(34, 6);
  plat(7, 40, 45); blocks(4, 42, "?"); bRow(6, 40, 6);
  plat(6, 50, 54); enemyAt(52, 6);
  plat(5, 58, 62); bRow(4, 58, 5);
  plat(7, 67, 74); pipe(68, 2, 7);
  plat(6, 77, 82); blocks(4, 79, "M"); enemyAt(80, 6);
  plat(8, 87, 91); bRow(7, 87, 5);
  plat(7, 96, 100); enemyAt(98, 7);
  plat(6, 105, 109); bRow(5, 105, 5);
  plat(7, 114, 119); enemyAt(116, 7); enemyAt(118, 7);
  plat(6, 124, 128); blocks(3, 124, "?*");
  plat(8, 133, 137); bRow(7, 133, 5);
  plat(7, 142, 147); enemyAt(144, 7);
  plat(6, 152, 157); bRow(5, 152, 6);
  plat(7, 162, 167); enemyAt(164, 7);
  plat(8, 172, 177); bRow(7, 172, 6);
  plat(7, 182, 186);
  bRow(8, 13, 3); bRow(5, 48, 3); bRow(4, 63, 3); bRow(7, 92, 4); bRow(4, 120, 3); bRow(6, 168, 3);
}

function build24({ ground, blocks, bRow, enemyAt, stair, column, ceil }) {
  ground(0, levelW - 1);
  ceil(4, 178);
  blocks(6, 10, "B?B");
  column(16, 7); column(17, 6);
  enemyAt(12); enemyAt(20); enemyAt(22);
  blocks(6, 26, "?M?");
  column(32, 7); column(33, 7);
  enemyAt(38); enemyAt(40);
  blocks(6, 44, "BBBB"); bRow(5, 44, 4);
  blocks(3, 46, "?");
  enemyAt(52); enemyAt(54);
  column(58, 6);
  blocks(6, 62, "B?B");
  enemyAt(68); enemyAt(70); enemyAt(76);
  blocks(6, 72, "BB*BB");
  column(80, 7); column(81, 6); column(82, 7);
  bRow(4, 86, 4); blocks(6, 86, "BBBB");
  enemyAt(92); enemyAt(94);
  blocks(6, 98, "B?B?B");
  column(104, 6);
  enemyAt(110); enemyAt(112);
  blocks(6, 116, "BBB"); bRow(5, 116, 3);
  blocks(3, 117, "?");
  enemyAt(122); enemyAt(124);
  blocks(6, 128, "?M?");
  column(134, 7); column(135, 6); column(136, 7);
  enemyAt(142); enemyAt(144); enemyAt(150);
  blocks(6, 146, "B?B");
  bRow(8, 154, 4);
  stair(158, 5, 1);
  enemyAt(168); enemyAt(172);
  blocks(6, 166, "B?B");
}

function build31({ ground, blocks, bRow, enemyAt, stair, plat }) {
  ground(0, 20); ground(170, levelW - 1);
  plat(8, 25, 30); bRow(7, 25, 6);
  plat(7, 35, 40); bRow(6, 35, 6);
  plat(8, 45, 50); bRow(7, 45, 6);
  plat(7, 55, 61); enemyAt(58, 7); blocks(4, 58, "?*");
  plat(7, 66, 71); bRow(6, 66, 6);
  plat(8, 76, 81); enemyAt(78, 8);
  plat(7, 86, 92); enemyAt(89, 7); blocks(4, 89, "?");
  plat(7, 97, 102); bRow(6, 97, 6);
  plat(8, 107, 112); enemyAt(109, 8);
  plat(7, 117, 123); enemyAt(120, 7); blocks(4, 120, "?M?");
  plat(7, 128, 133); bRow(6, 128, 6);
  plat(8, 138, 143); enemyAt(140, 8);
  plat(7, 148, 154); enemyAt(151, 7); blocks(4, 151, "?");
  plat(7, 159, 164); bRow(6, 159, 6);
  bRow(8, 21, 4); bRow(7, 42, 3); bRow(8, 63, 3); bRow(6, 104, 3);
  enemyAt(174); enemyAt(178);
  bRow(8, 172, 5);
  stair(178, 4, 1);
}

function build32({ ground, blocks, pipe, bRow, enemyAt, stair }) {
  ground(0, 34); ground(39, 71); ground(76, 111); ground(116, 148); ground(153, levelW - 1);
  blocks(6, 12, "B?B");
  enemyAt(16); enemyAt(24);
  blocks(6, 20, "BBBB"); bRow(5, 20, 4);
  bRow(7, 35, 4);
  pipe(44, 2); enemyAt(42); enemyAt(48);
  blocks(6, 54, "B?B?B");
  enemyAt(60); enemyAt(62);
  bRow(6, 71, 5);
  blocks(6, 82, "BBMBB");
  enemyAt(88); enemyAt(90); enemyAt(98);
  blocks(6, 94, "BBBB"); bRow(5, 94, 4);
  pipe(104, 3);
  bRow(6, 111, 5);
  blocks(6, 122, "B?B");
  enemyAt(128); enemyAt(130);
  blocks(6, 136, "BBBB"); bRow(5, 136, 4);
  bRow(7, 150, 5);
  stair(160, 5, 1);
  enemyAt(166); enemyAt(170);
  blocks(6, 164, "B?B");
  bRow(8, 176, 4);
}

function build33({ ground, blocks, pipe, bRow, enemyAt, stair }) {
  ground(0, 31); ground(36, 67); ground(72, 101); ground(106, 141); ground(146, levelW - 1);
  blocks(6, 10, "?*");
  enemyAt(14); enemyAt(22);
  blocks(6, 18, "BBBB"); bRow(5, 18, 4);
  bRow(6, 31, 5);
  blocks(6, 42, "B?B");
  pipe(50, 2); enemyAt(48); enemyAt(54);
  blocks(6, 58, "BB?BB");
  enemyAt(62);
  bRow(6, 67, 5);
  blocks(6, 76, "B?B?B");
  enemyAt(82); enemyAt(84); enemyAt(90);
  blocks(6, 88, "BBMBB");
  bRow(8, 94, 4);
  bRow(6, 101, 5);
  blocks(6, 110, "B?B");
  enemyAt(114); enemyAt(120);
  blocks(6, 116, "BBBB"); bRow(5, 116, 4);
  blocks(3, 118, "*");
  pipe(128, 3); enemyAt(126); enemyAt(134);
  bRow(7, 141, 5);
  blocks(6, 152, "B?B?B");
  enemyAt(158); enemyAt(160); enemyAt(166);
  blocks(6, 162, "BBB"); bRow(5, 162, 3);
  stair(172, 6, 1);
  bRow(8, 182, 4);
  enemyAt(186);
}

function build34({ ground, blocks, pipe, bRow, enemyAt, stair, column }) {
  ground(0, 39); ground(44, 80); ground(85, 121); ground(126, 161); ground(166, levelW - 1);
  blocks(6, 8, "?????"); bRow(8, 8, 5);
  blocks(6, 16, "M*M?M");
  enemyAt(12); enemyAt(20); enemyAt(26);
  blocks(6, 24, "?????");
  bRow(6, 40, 4);
  blocks(6, 48, "???????"); bRow(5, 48, 7);
  enemyAt(52); enemyAt(58);
  blocks(6, 62, "?M?");
  pipe(68, 2); enemyAt(66); enemyAt(72);
  bRow(6, 80, 5);
  blocks(6, 88, "*?*?*");
  enemyAt(92); enemyAt(94); enemyAt(100);
  blocks(6, 96, "?????");
  blocks(3, 98, "??");
  bRow(6, 121, 5);
  blocks(6, 130, "M?M");
  enemyAt(136); enemyAt(138); enemyAt(144);
  blocks(6, 140, "?????");
  column(148, 7); column(149, 6);
  blocks(6, 152, "??");
  bRow(7, 161, 5);
  blocks(6, 170, "?????");
  enemyAt(176); enemyAt(180);
  blocks(6, 178, "*M*");
  stair(186, 6, 1);
  bRow(8, 194, 4);
}

function build41({ ground, blocks, bRow, enemyAt, lavaPit, fire, stair, pipe }) {
  ground(0, 29); lavaPit(30, 32); ground(33, 59); lavaPit(60, 63); ground(64, 94); lavaPit(95, 98); ground(99, 129); lavaPit(130, 133); ground(134, levelW - 1);
  fire(31, 140); fire(61, 130); fire(62, 160); fire(96, 140); fire(97, 150); fire(131, 130); fire(132, 155);
  blocks(6, 12, "B?B");
  enemyAt(16); enemyAt(24);
  bRow(6, 30, 3);
  blocks(6, 40, "BBMBB");
  enemyAt(44); enemyAt(46);
  bRow(6, 60, 4);
  blocks(6, 70, "B?B?B");
  enemyAt(74); enemyAt(76); enemyAt(84);
  blocks(6, 80, "BBBB"); bRow(5, 80, 4);
  bRow(6, 95, 4);
  pipe(104, 2); enemyAt(102); enemyAt(108);
  blocks(6, 112, "B?B");
  enemyAt(118); enemyAt(124);
  bRow(6, 130, 4);
  blocks(6, 140, "BB?BB");
  enemyAt(146); enemyAt(152);
  bRow(8, 156, 4);
  stair(166, 6, 1);
  blocks(6, 176, "B?B");
}

function build42({ ground, blocks, bRow, enemyAt, lavaPit, fire, stair, ceil, column }) {
  ground(0, 24); lavaPit(25, 28); ground(29, 55); lavaPit(56, 59); ground(60, 90); lavaPit(91, 94); ground(95, 125); lavaPit(126, 129); ground(130, levelW - 1);
  ceil(4, 154);
  fire(26, 120); fire(27, 150); fire(57, 130); fire(59, 145); fire(91, 125); fire(95, 150); fire(127, 130); fire(129, 145);
  grid[9][92] = 3; grid[9][93] = 3; grid[9][58] = 3; grid[9][128] = 3;
  blocks(6, 10, "B?B");
  enemyAt(14); enemyAt(20);
  bRow(6, 25, 4);
  blocks(6, 34, "BBMBB");
  enemyAt(38); enemyAt(40);
  column(50, 7);
  bRow(6, 56, 5);
  blocks(6, 66, "B?B?B");
  enemyAt(70); enemyAt(72); enemyAt(80);
  column(80, 7); column(81, 6);
  bRow(6, 91, 6);
  blocks(6, 100, "BBBB"); bRow(5, 100, 4);
  enemyAt(104); enemyAt(106);
  column(105, 6);
  blocks(6, 116, "?M?");
  enemyAt(122);
  bRow(6, 126, 5);
  blocks(6, 136, "B?B");
  enemyAt(140); enemyAt(146); enemyAt(152);
  blocks(6, 144, "BB*BB");
  stair(158, 6, 1);
  bRow(8, 168, 4);
  blocks(6, 172, "B?B");
  enemyAt(176);
}

function build43({ ground, blocks, bRow, enemyAt, lavaPit, fire, stair }) {
  ground(0, 19);
  lavaPit(20, 39);
  blocks(8, 20, "BBBBBBBB"); blocks(8, 30, "BBBBBBBB");
  fire(28, 120); fire(29, 140); fire(38, 130); fire(39, 145);
  ground(40, 55);
  lavaPit(56, 75);
  blocks(8, 56, "BBBBB"); blocks(8, 63, "BBBBBBB"); blocks(8, 72, "BBBB");
  fire(61, 125); fire(62, 140); fire(70, 130); fire(71, 150);
  ground(76, 90);
  lavaPit(91, 110);
  blocks(8, 91, "BBBBBB"); blocks(8, 99, "BBBB"); blocks(8, 105, "BBBBBB");
  fire(97, 120); fire(98, 140); fire(103, 130); fire(104, 145); fire(109, 125); fire(110, 150);
  ground(111, levelW - 1);
  blocks(6, 44, "B?B"); blocks(6, 86, "?M?");
  bRow(6, 20, 4); bRow(6, 56, 5); bRow(6, 91, 5);
  enemyAt(46); enemyAt(48); enemyAt(50); enemyAt(82); enemyAt(84);
  enemyAt(116); enemyAt(122); enemyAt(128);
  blocks(6, 120, "B?B");
  stair(134, 6, 1);
  blocks(6, 146, "B?B?B");
  enemyAt(152); enemyAt(158); enemyAt(164);
  bRow(8, 168, 4);
  stair(176, 5, 1);
}

function build44({ ground, blocks, bRow, enemyAt, lavaPit, fire, stair, ceil, column }) {
  ground(0, 19); lavaPit(20, 23); ground(24, 44); lavaPit(45, 48); ground(49, 70); lavaPit(71, 74); ground(75, 96); lavaPit(97, 100); ground(101, 124); lavaPit(125, 128); ground(129, 150); lavaPit(151, 154); ground(155, levelW - 1);
  
  grid[9][47] = 3; grid[9][73] = 3; grid[9][99] = 3; grid[9][127] = 3;
  blocks(6, 8, "B?B");
  enemyAt(12); enemyAt(16);
  bRow(6, 20, 4);
  blocks(6, 30, "BBMBB");
  enemyAt(34); enemyAt(36);
  column(36, 7);
  bRow(6, 45, 5);
  blocks(6, 54, "B?B?B");
  enemyAt(58); enemyAt(60);
  column(60, 6);
  bRow(6, 71, 5);
  blocks(6, 80, "BB*BB");
  enemyAt(84); enemyAt(86); enemyAt(88);
  
  bRow(6, 97, 6);
  blocks(6, 106, "B?B?B");
  enemyAt(110); enemyAt(112);
  column(112, 6); column(113, 7);
  bRow(6, 125, 5);
  blocks(6, 134, "BBMBB");
  enemyAt(138); enemyAt(140); enemyAt(146);
  column(148, 7); column(149, 6);
  bRow(6, 151, 6);
  blocks(6, 160, "B?B?B");
  enemyAt(166); enemyAt(168); enemyAt(174); enemyAt(176);
  blocks(6, 170, "BBBB"); bRow(5, 170, 4);
  stair(182, 8, 1);
  bRow(8, 194, 4);
}

function resetLevel() {
  buildLevel();
  items = []; pops = []; particles = []; popups = []; bumps = [];
  if (cpLevel !== levelIdx) { cpActive = false; deathsThisLevel = 0; bigGot = 0; }
  const useCp = cpActive && cpLevel === levelIdx && cpX > 0;
  player = {
    // 站在檢查點表面上（其他位置可能是空中）
    x: useCp ? cpX : 2.5 * TILE,
    y: useCp ? cpY : 9 * TILE,
    vx: 0, vy: 0, w: 40, h: 72,
    big: false, fire: false, crouching: false, onGround: false, face: 1, animT: 0, stompChain: 0,
    invuln: 0, star: 0, growT: 0, growMode: null, skid: false, hitDir: 0,
    fly: cheatFly, super: cheatSuper,
    coyote: 0, landT: 0, prevOnGround: false,
  };
  camX = Math.max(0, Math.min(levelW * TILE - VIEW_W, player.x - VIEW_W * 0.42));
  timeLeft = 300; timeTick = 0; hurryPlayed = false;
  flagClothY = 2 * TILE + 6; flagDone = false; clearTimer = 0; bonusLeft = 0;
  musicTempo = 1; musicPos = 0;
}

function solidAt(tx, ty) {
  if (tx < 0 || tx >= levelW) return true;
  if (ty < 0 || ty >= ROWS) return false;
  const c = grid[ty][tx];
  return c > 0 && c !== 10 && c !== 11;
}

function deadlyAt(tx, ty) {
  if (tx < 0 || tx >= levelW || ty < 0 || ty >= ROWS) return false;
  const c = grid[ty][tx];
  return c === 10 || c === 11;
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
      const hiddenHere = hiddenCheck && (grid[y0] && (grid[y0][tx] === 12 || grid[y0][tx] === 13));
      if (solidAt(tx, y0) || hiddenHere) {
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
  if (bananaCount >= 99) {
    bananaCount = 0;
    lives++;
    sfx("oneup");
    popups.push({ x: player.x, y: player.y - 90, t: 0, text: "1UP!" });
  }
}

function updateBananas() {
  if (player.growT > 0) return;
  bananas = bananas.filter((b) => {
    if (Math.abs(b.x - player.x) < player.w / 2 + 14 && b.y > player.y - player.h - 16 && b.y < player.y + 16) {
      collectBanana(b.x, b.y);
      return false;
    }
    return true;
  });
}

function bumpBlock(tx, ty) {
  const code = grid[ty][tx];
  if (code === 0 || code === 2 || code === 10 || code === 11) return;
  if (code === 8 || code === 9 || code === 1 || code === 3) { sfx("bump"); return; }
  bumps.push({ tx, ty, t: 0 });
  const bx = tx * TILE + 24, byTop = ty * TILE;
  bananas = bananas.filter((b) => {
    if (Math.abs(b.x - bx) < TILE && b.y > byTop - TILE * 1.3 && b.y < byTop + 6) {
      collectBanana(b.x, b.y);
      return false;
    }
    return true;
  });
  enemies.forEach((en) => {
    if (!en.dead && en.state === "walk" && Math.abs(en.y - byTop) < 8 && Math.abs(en.x - bx) < TILE) flipKill(en, 100);
  });
  if (code === 5) {
    grid[ty][tx] = 8;
    pops.push({ x: bx, y: byTop, vy: -7.2, t: 0 });
    collectBanana(bx, byTop - 20);
  } else if (code === 6) {
    grid[ty][tx] = 8;
    if (!player.big) {
      items.push({ kind: "mush", x: bx, y: byTop + 20, blockY: byTop, vx: 0, vy: 0, w: 36, h: 36, state: "emerge", et: 0, hitDir: 0 });
    } else if (!player.fire) {
      items.push({ kind: "flower", x: bx, y: byTop + 20, blockY: byTop, vx: 0, vy: 0, w: 36, h: 36, state: "emerge", et: 0, hitDir: 0 });
    } else {
      pops.push({ x: bx, y: byTop, vy: -7.2, t: 0 });
      collectBanana(bx, byTop - 20);
    }
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
      addShake(6, 4);
      for (let i = 0; i < 4; i++) {
        particles.push({
          type: "shard",
          x: bx + (i % 2 ? 10 : -10), y: byTop + 12 + (i < 2 ? -8 : 8),
          vx: (i % 2 ? 1 : -1) * (1.4 + Math.random()), vy: -5 - Math.random() * 2,
          rot: Math.random() * 6, t: 0,
        });
      }
    } else sfx("bump");
  } else if (code === 12) {           // hidden block: 1UP
    grid[ty][tx] = 8;
    lives++;
    sfx("oneup");
    popups.push({ x: bx, y: byTop - 24, t: 0, text: "1UP!" });
  } else if (code === 13) {           // hidden block: banana burst
    grid[ty][tx] = 8;
    sfx("item");
    for (let i = 0; i < 4; i++) collectBanana(bx - 18 + i * 12, byTop - 20);
    popups.push({ x: bx, y: byTop - 24, t: 0, text: "SECRET!" });
  }
}

function flipKill(en, pts) {
  en.state = "flip"; en.vy = -7; en.vx = 1.2 * (Math.random() < 0.5 ? -1 : 1);
  en.dead = true;
  addScore(pts, en.x, en.y - 50);
  sfx("kick");
}

function damagePlayer() {
  if (player.invuln > 0 || player.star > 0 || player.super || state !== "play" || player.growT > 0) return;
  if (player.fire) {
    player.fire = false;
    player.invuln = 130;
    sfx("shrink");
  } else if (player.big) {
    player.big = false;
    player.crouching = false;
    player.growMode = "shrink"; player.growT = 40;
    player.invuln = 130;
    sfx("shrink");
  } else killPlayer();
}

function killPlayer() {
  state = "dead"; deadTimer = 0;
  deathsThisLevel++;
  player.vx = 0; player.vy = 0;
  sfx("die");
}

function throwFire() {
  const p = player;
  if (!p.fire || shots.length >= 2 || fireCd > 0) return;
  shots.push({ x: p.x + p.face * 16, y: p.y - p.h * 0.6, vx: p.face * 5.5, vy: 2, t: 0 });
  fireCd = 15;
  sfx("throw");
}

function updatePlayer() {
  const p = player;
  if (fireCd > 0) fireCd--;
  const throwNow = wantFire;
  wantFire = false;
  if (p.growT > 0) {
    p.growT--;
    if (p.growT === 0) {
      if (p.growMode === "grow") { p.big = true; p.h = p.crouching ? 46 : 72; }
      else if (p.growMode === "growfire") { p.big = true; p.fire = true; p.h = p.crouching ? 46 : 72; }
      else if (p.growMode === "fire") { p.fire = true; }
      p.growMode = null;
    }
    return;
  }
  if (throwNow) throwFire();

  const slip = LEVELS[levelIdx].slippery;
  const wantCrouch = p.big && keys.down;
  if (wantCrouch) {
    if (!p.crouching) { p.crouching = true; if (p.onGround) sfx("crouch"); }
  } else if (p.crouching) {
    const ty = Math.floor((p.y - 72) / TILE);
    let blocked = false;
    if (ty >= 0) {
      const cx0 = Math.floor((p.x - p.w / 2 + 4) / TILE), cx1 = Math.floor((p.x + p.w / 2 - 4) / TILE);
      for (let tx = cx0; tx <= cx1; tx++) if (solidAt(tx, ty)) { blocked = true; break; }
    }
    if (!blocked) p.crouching = false;
  }
  p.h = p.big ? (p.crouching ? 46 : 72) : 46;

  const acc = (keys.run ? ACC_RUN : ACC_WALK) * (slip ? 0.55 : 1);
  const max = keys.run ? MAX_RUN : MAX_WALK;
  if (!p.crouching) {
    if (keys.left && !keys.right) { p.vx -= acc; p.face = -1; }
    else if (keys.right && !keys.left) { p.vx += acc; p.face = 1; }
    else if (p.onGround) p.vx *= (slip ? 0.975 : FRICTION);
  } else if (p.onGround) p.vx *= (slip ? 0.985 : FRICTION);
  if (Math.abs(p.vx) < 0.05) p.vx = 0;
  p.vx = Math.max(-max, Math.min(max, p.vx));
  p.skid = !p.crouching && p.onGround && ((keys.left && p.vx > 1.6) || (keys.right && p.vx < -1.6));

  // coyote time: brief grace to jump right after leaving the ground
  p.coyote = p.onGround ? 6 : Math.max(0, (p.coyote || 0) - 1);
  if (jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = JUMP_VY;
    p.onGround = false;
    p.coyote = 0;
    jumpBuffer = 0;
    sfx("jump");
  }
  if (jumpBuffer > 0) jumpBuffer--;
  if (!keys.jump && p.vy < -6) p.vy = -6;
  p.vy = Math.min(MAXFALL, p.vy + GRAV);
  if (p.fly && keys.jump && p.vy > -7.2) {
    p.vy -= 0.85;
    if (frame % 8 === 0) sfx("wing");
  }

  const wasAir = !p.onGround;
  hiddenCheck = true;
  rectVsGrid(p, bumpBlock);
  hiddenCheck = false;
  if (p.onGround && wasAir && p.landT === 0) p.landT = 8;   // landing squash
  if (p.landT > 0) p.landT--;
  if (p.onGround) p.stompChain = 0;

  // checkpoint activation
  if (cpX > 0 && !cpActive && p.x >= cpX) {
    cpActive = true;
    cpLevel = levelIdx;
    sfx("check");
    popups.push({ x: cpX, y: cpY - 90, t: 0, text: "CHECKPOINT!" });
  }
  p.x = Math.max(p.w / 2, Math.min(levelW * TILE - p.w / 2, p.x));

  if (p.invuln > 0) p.invuln--;
  if (cheatProgress && ++cheatIdleT > 110) { cheatProgress = ""; cheatIdleT = 0; }
  if (p.star > 0) { p.star--; if (p.star === 0) musicTempo = hurryPlayed ? 1.25 : 1; }

  const ltx = Math.floor(p.x / TILE);
  const lty = Math.floor((p.y - 4) / TILE);
  if (deadlyAt(ltx, lty)) { if (p.super) superRespawn(); else killPlayer(); return; }

  if (p.y > VIEW_H + 80) { if (p.super) superRespawn(); else killPlayer(); return; }

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
    lastRank = computeRank();
    saveBestRank();
  }
}

function computeRank() {
  const ratio = bananasTotalLevel ? 1 - bananas.length / bananasTotalLevel : 1;
  if (deathsThisLevel === 0 && ratio >= 0.9 && timeLeft >= 200 && bigGot >= 3) return "S";
  if (deathsThisLevel <= 1 && ratio >= 0.7 && timeLeft >= 120) return "A";
  if (deathsThisLevel <= 3) return "B";
  return "C";
}
function rankColor(r) { return r === "S" ? "#ffd700" : r === "A" ? "#7fff7f" : r === "B" ? "#7fbfff" : "#cccccc"; }
function bestRankFor(name) {
  try {
    const map = JSON.parse(localStorage.getItem("smb_rank_v1") || "{}");
    return map[name] || "";
  } catch (e) { return ""; }
}
function saveBestRank() {
  try {
    const k = "smb_rank_v1";
    const map = JSON.parse(localStorage.getItem(k) || "{}");
    const name = LEVELS[levelIdx].name;
    const order = { C: 0, B: 1, A: 2, S: 3 };
    if (!map[name] || order[lastRank] > order[map[name]]) {
      map[name] = lastRank;
      localStorage.setItem(k, JSON.stringify(map));
    }
  } catch (e) {}
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
      if (en.onGround) {
        const frontX = en.x + Math.sign(en.vx) * (en.w / 2 + 2);
        const ftx = Math.floor(frontX / TILE), fty = Math.floor((en.y + 4) / TILE);
        if (!solidAt(ftx, fty)) en.vx = -en.vx;
      }
      rectVsGrid(en, null);
      if (en.hitWall) en.vx = 1.1 * en.hitDir;
      const etx = Math.floor(en.x / TILE), ety = Math.floor((en.y - 4) / TILE);
      if (deadlyAt(etx, ety)) {
        en.state = "gone";
        particles.push({ type: "smoke", x: en.x, y: en.y - 20, vx: 0, vy: 0, t: 0 });
        sfx("fire");
      }
      if (en.y > VIEW_H + 80) en.state = "gone";
    } else if (en.state === "shell") {
      // stomped shell: inert; revives after a while
      en.vy = Math.min(MAXFALL, en.vy + GRAV);
      en.vx = 0;
      rectVsGrid(en, null);
      if (en.t > 420) { en.state = "walk"; en.vx = -1.1; en.t = 0; }
    } else if (en.state === "slide") {
      // kicked shell: ricochets and mows down other enemies
      if (en.slideGrace > 0) en.slideGrace--;
      en.vy = Math.min(MAXFALL, en.vy + GRAV);
      rectVsGrid(en, null);
      if (en.hitWall) { en.vx = 5.5 * en.hitDir; sfx("bump"); }
      const etx = Math.floor(en.x / TILE), ety = Math.floor((en.y - 4) / TILE);
      if (deadlyAt(etx, ety) || en.y > VIEW_H + 80) { en.state = "gone"; sfx("fire"); }
    } else if (en.state === "fly") {
      en.t++;
      en.x += en.vx;
      en.y = en.baseY + Math.sin(en.t * 0.05) * 36;
      const ftx = Math.floor((en.x + Math.sign(en.vx) * (en.w / 2 + 2)) / TILE);
      const fty = Math.floor(en.y / TILE);
      if (solidAt(ftx, fty)) en.vx = -en.vx;
      if (deadlyAt(Math.floor(en.x / TILE), Math.floor((en.y - 4) / TILE))) {
        en.state = "flat"; en.dead = true; en.t = 0;
        particles.push({ type: "smoke", x: en.x, y: en.y - 16, vx: 0, vy: 0, t: 0 });
      }
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
    if (a.dead || !a.active || a.state === "gone" || a.state === "flat" || a.state === "flip") continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead || !b.active || b.state === "gone" || b.state === "flat" || b.state === "flip") continue;
      const nearX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2;
      if (!nearX) continue;
      if (a.state === "slide" && b.state === "walk") flipKill(b, 200);
      else if (b.state === "slide" && a.state === "walk") flipKill(a, 200);
      else if (a.state === "walk" && b.state === "walk") {
        const s = Math.sign(a.x - b.x) || 1;
        a.vx = Math.abs(a.vx) * s;
        b.vx = -Math.abs(b.vx) * s;
      }
    }
  }
  if (player.growT > 0) return;
  if (player.star > 0) {
    enemies.forEach((en) => {
      if (!en.dead && en.active && (en.state === "walk" || en.state === "fly" ||
          en.state === "shell" || en.state === "slide") && overlap(player, en)) {
        player.stompChain = Math.min(player.stompChain + 1, 5);
        flipKill(en, 100 * Math.pow(2, player.stompChain - 1));
      }
    });
  }
  enemies.forEach((en) => {
    if (en.dead || !en.active) return;
    if (!(en.state === "walk" || en.state === "fly" || en.state === "shell" || en.state === "slide")) return;
    if (!overlap(player, en)) return;
    const stomp = player.vy > 1.5 && (player.y - en.y + en.h) < en.h * 0.75;
    if (stomp) {
      player.stompChain = Math.min(player.stompChain + 1, 5);
      addScore(100 * Math.pow(2, player.stompChain - 1), en.x, en.y - 46);
      player.vy = keys.jump ? STOMP_BOUNCE_HELD : STOMP_BOUNCE;
      player.onGround = false;
      hitstop = 2; addShake(3, 3);
      particles.push({ type: "smoke", x: en.x, y: en.y - 20, vx: 0, vy: 0, t: 0 });
      if ((en.kind === "shell") && en.state === "walk") {
        en.state = "shell"; en.vx = 0; en.t = 0;   // walkers with shells hide instead of dying
        sfx("stomp");
      } else if (en.state === "shell") {
        en.state = "slide"; en.slideGrace = 14;
        en.vx = 5.5 * (player.x < en.x ? 1 : -1);
        sfx("kick");
      } else if (en.state === "slide") {
        en.state = "shell"; en.vx = 0; en.t = 0;
        sfx("stomp");
      } else {
        en.state = "flat"; en.t = 0; en.dead = true;
        sfx("stomp");
      }
    } else {
      if (en.state === "shell") {
        en.state = "slide"; en.slideGrace = 14;
        en.vx = 5.5 * (player.x < en.x ? 1 : -1);
        sfx("kick");
      } else if (en.state === "slide" && en.slideGrace > 0) {
        // just kicked: harmless for a moment
      } else damagePlayer();
    }
  });
}

function updateItems() {
  items = items.filter((it) => {
    if (it.state === "emerge") {
      it.et++;
      it.y -= TILE / 45;
      if (it.et >= 45) {
        if (it.kind === "star") { it.state = "move"; it.vx = 2.2; it.vy = -6; }
        else if (it.kind === "mush") { it.state = "move"; it.vx = 1.6; it.vy = 0; }
        else { it.state = "sit"; it.y = it.blockY + 4; }
      }
    } else if (it.state === "move") {
      it.vy = Math.min(MAXFALL, it.vy + (it.kind === "star" ? 0.4 : GRAV));
      rectVsGrid(it, null);
      if (it.hitWall) it.vx = (Math.abs(it.vx) || 1.6) * it.hitDir;
      if (it.kind === "star" && it.onGround) it.vy = -8.5;
      if (it.y > VIEW_H + 80) return false;
    }
    if (player.growT === 0 && overlap(player, it)) {
      addScore(1000, it.x, it.y - 40);
      if (it.kind === "mush") {
        if (!player.big) { player.growMode = "grow"; player.growT = 40; }
      } else if (it.kind === "flower") {
        if (!player.big) { player.growMode = "growfire"; player.growT = 40; }
        else if (!player.fire) { player.growMode = "fire"; player.growT = 30; }
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

function updateFireballs() {
  fireSpots.forEach((s) => {
    s.t++;
    if (s.t >= s.period) {
      s.t = 0;
      fireballs.push({ x: s.x, y: s.y0 + 10, y0: s.y0, vy: -9.5, t: 0 });
      if (s.x > camX - 40 && s.x < camX + VIEW_W + 40) sfx("fire");
    }
  });
  fireballs = fireballs.filter((f) => {
    f.t++;
    f.vy += 0.32;
    f.y += f.vy;
    if (f.y > f.y0 + 40) return false;
    if (player.growT === 0 && player.star <= 0 &&
        Math.abs(f.x - player.x) < player.w / 2 + 10 && f.y > player.y - player.h - 8 && f.y < player.y + 8) {
      damagePlayer();
      return false;
    }
    return f.t < 300;
  });
}

function updateShots() {
  shots = shots.filter((s) => {
    s.t++;
    s.vy = Math.min(10, s.vy + 0.4);
    const nx = s.x + s.vx;
    const ftx = Math.floor((nx + Math.sign(s.vx) * 8) / TILE), fty = Math.floor(s.y / TILE);
    if (solidAt(ftx, fty)) {
      particles.push({ type: "smoke", x: s.x, y: s.y, vx: 0, vy: 0, t: 0 });
      sfx("bump");
      return false;
    }
    s.x = nx;
    const ny = s.y + s.vy;
    const bty = Math.floor((ny + 8) / TILE), btx = Math.floor(s.x / TILE);
    if (s.vy > 0 && solidAt(btx, bty)) { s.y = bty * TILE - 8; s.vy = -4.5; } else s.y = ny;
    let hit = false;
    enemies.forEach((en) => {
      if (!hit && !en.dead && en.active &&
          (en.state === "walk" || en.state === "fly" || en.state === "shell" || en.state === "slide") &&
          Math.abs(en.x - s.x) < 26 && Math.abs((en.y - en.h / 2) - s.y) < 26) {
        flipKill(en, 200);
        hit = true;
      }
    });
    // fireballs defeat piranha plants and damage the boss
    plants.forEach((pl) => {
      if (!hit && !pl.dead && pl.rise > 0.5 &&
          Math.abs(pl.x - s.x) < 22 && Math.abs((pl.topY - 20) - s.y) < 34) {
        pl.dead = true; hit = true;
        addScore(200, pl.x, pl.topY - 40);
        sfx("kick");
      }
    });
    if (!hit && boss && !boss.dead && boss.inv <= 0 &&
        Math.abs(boss.x - s.x) < boss.w / 2 + 10 &&
        s.y > boss.y - boss.h && s.y < boss.y) {
      hitBoss(); hit = true;
    }
    if (hit) {
      particles.push({ type: "smoke", x: s.x, y: s.y, vx: 0, vy: 0, t: 0 });
      return false;
    }
    return s.x > camX - 60 && s.x < camX + VIEW_W + 60 && s.t < 240 && s.y < VIEW_H + 40;
  });
}

function updatePlants() {
  plants.forEach((pl) => {
    if (pl.dead) return;
    pl.t++;
    const cyc = pl.t % pl.period;
    const near = Math.abs(player.x - pl.x) < VIEW_W * 0.6;
    const tooClose = Math.abs(player.x - pl.x) < 90;
    let r = 0;
    if (near && !tooClose) {
      if (cyc > pl.period - 140 && cyc <= pl.period - 100) r = (cyc - (pl.period - 140)) / 40;
      else if (cyc > pl.period - 100 && cyc <= pl.period - 40) r = 1;
      else if (cyc > pl.period - 40) r = (pl.period - cyc) / 40;
    }
    pl.rise = Math.max(0, Math.min(1, r));
    if (pl.rise > 0.5) {
      // bite box while emerged
      const bx0 = pl.x - 16, bx1 = pl.x + 16, by1 = pl.topY, by0 = pl.topY - 46 * pl.rise;
      if (player.growT === 0 &&
          player.x + player.w / 2 > bx0 && player.x - player.w / 2 < bx1 &&
          player.y > by0 && player.y - player.h < by1) {
        damagePlayer();
      }
    }
  });
}

function hitBoss() {
  if (!boss || boss.dead || boss.inv > 0) return;
  boss.hp--;
  boss.inv = 110;
  boss.dizzy = 0;
  hitstop = 5; addShake(12, 6);
  sfx("kick");
  addScore(500, boss.x, boss.y - boss.h);
  if (boss.hp <= 0) {
    boss.dead = true;
    for (let ty = 0; ty <= 8; ty++) grid[ty][boss.wallCol] = 0;   // open the gate
    for (let i = 0; i < 10; i++) {
      particles.push({ type: "shard", x: boss.x + (Math.random()*60-30), y: boss.y - 40 + (Math.random()*40-20),
        vx: (Math.random()-0.5)*6, vy: -4 - Math.random()*4, rot: Math.random()*6, t: 0 });
    }
    addScore(5000, boss.x, boss.y - boss.h - 20);
    popups.push({ x: boss.x, y: boss.y - boss.h - 50, t: 0, text: "GATE OPENED!" });
    addShake(16, 8); hitstop = 8;
    sfx("die");
  }
}

function updateBoss() {
  const b = boss;
  if (!b || b.dead) return;
  b.t++;
  if (b.inv > 0) b.inv--;
  if (b.dizzy > 0) b.dizzy--;
  const p = player;
  // activate once the player is close
  if (!b.awake) {
    if (p.x > b.minX - 320) { b.awake = true; sfx("thunder"); }
    else return;
  }
  b.vy = Math.min(MAXFALL, b.prevVy + GRAV);
  b.prevVy = b.vy;
  const dir = Math.sign(p.x - b.x) || 1;
  b.face = dir;
  b.vx = b.dizzy > 0 ? 0 : dir * 0.8;
  if (b.x < b.minX && b.vx < 0) b.vx = 0;
  if (b.x > b.maxX && b.vx > 0) b.vx = 0;
  rectVsGrid(b, null);
  if (b.onGround && !b.wasGround && b.prevVy > 5) {   // heavy landing -> dizzy window
    b.dizzy = 90;
    addShake(8, 5);
    sfx("stomp");
  }
  b.wasGround = b.onGround;
  if (b.dizzy <= 0 && b.onGround) {
    if (--b.throwCd <= 0) {
      b.throwCd = 200;
      hammers.push({ x: b.x + b.face * 34, y: b.y - b.h + 22,
        vx: b.face * 4.2, vy: -7.2, t: 0 });
      sfx("throw");
    }
    if (--b.hopCd <= 0) { b.hopCd = 430; b.vy = -8.5; b.prevVy = b.vy; }
  }
  // player contact
  if (overlap(p, b)) {
    const stomp = p.vy > 1.5 && (p.y - b.y + p.h) < b.h * 0.55;
    if (b.dizzy > 0 && stomp) {
      hitBoss();
      p.vy = STOMP_BOUNCE_HELD; p.onGround = false;
    } else if (b.inv <= 0) damagePlayer();
  }
  // hammers
  hammers = hammers.filter((hm) => {
    hm.t++;
    hm.vy += 0.35;
    hm.x += hm.vx; hm.y += hm.vy; hm.rot = (hm.rot || 0) + 0.25 * Math.sign(hm.vx);
    if (player.growT === 0 &&
        Math.abs(hm.x - p.x) < p.w / 2 + 10 && hm.y > p.y - p.h - 8 && hm.y < p.y + 8) {
      damagePlayer();
      return false;
    }
    return hm.t < 400 && hm.y < VIEW_H + 80 && hm.x > camX - 80 && hm.x < camX + VIEW_W + 80;
  });
}

function updateBigBananas() {
  bigbananas.forEach((bb) => {
    if (bb.got) return;
    if (Math.abs(bb.x - player.x) < player.w / 2 + 18 &&
        bb.y > player.y - player.h - 18 && bb.y < player.y + 18) {
      bb.got = true; bigGot++; allBigGotSession++;
      addScore(1000, bb.x, bb.y - 30, "BIG!");
      if (allBigGotSession === 48) {
        popups.push({ x: bb.x, y: bb.y - 60, t: 0, text: "48/48 全收集!" });
        sfx("konami");
      }
      sfx("power");
      particles.push({ type: "spark", x: bb.x, y: bb.y, vx: 0, vy: 0, t: 0 });
    }
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
  const shx = shakeT > 0 ? Math.round((Math.random() * 2 - 1) * shakeMag) : 0;
  const shy = shakeT > 0 ? Math.round((Math.random() * 2 - 1) * shakeMag) : 0;
  ctx.translate(-Math.round(camX) + shx, shy);
  drawCastle();
  drawFlag();
  drawCheckpoint();
  drawPlants();
  drawTiles();          // tiles cover plant stems so they emerge from pipes
  drawBananas();
  drawBigBananas();
  drawItems();
  drawPops();
  drawShots();
  drawFireballs();
  drawHammers();
  enemies.forEach(drawEnemy);
  drawBoss();
  if (state !== "clear") drawPlayer();
  drawParticles();
  drawPopups();
  ctx.restore();
  drawWeather();
  drawHUD();
  if (state === "title") drawTitle();
  if (state === "gameover") drawGameOver();
  if (state === "clear") drawClear();
  if (state === "ending") drawEnding();
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
  const th = LEVELS[levelIdx].theme;
  ctx.fillStyle = THEMES[th].sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (th === "over" || th === "ice" || th === "rainbow") {
    const c1 = -((camX * 0.25) % 560);
    for (let i = 0; i < 3; i++) drawCloud(c1 + i * 560 + 60, 84 + (i % 2) * 46, 1 + (i % 2) * 0.35);
    const h1 = -((camX * 0.4) % 780);
    for (let i = 0; i < 3; i++) drawHill(h1 + i * 780, i % 2 === 0 ? 120 : 78, th === "ice" ? "#7ea8cc" : "#1e9e30", th === "ice" ? "#5d84a8" : "#157322");
    const b1 = -((camX * 0.65) % 520);
    for (let i = 0; i < 3; i++) drawBush(b1 + i * 520 + 130, i % 2 === 0 ? 3 : 2, th === "ice" ? "#8fb8dc" : "#26b33a");
  } else if (th === "sky" || th === "treetop" || th === "cloud") {
    const c1 = -((camX * 0.2) % 640);
    for (let i = 0; i < 3; i++) drawCloud(c1 + i * 640 + 40, 70 + (i % 3) * 40, 1.1 + (i % 2) * 0.4);
    const c2 = -((camX * 0.45) % 520);
    for (let i = 0; i < 3; i++) drawCloud(c2 + i * 520 + 200, 180 + (i % 2) * 60, 0.8);
  } else if (th === "jungle") {
    const h1 = -((camX * 0.35) % 700);
    for (let i = 0; i < 3; i++) drawHill(h1 + i * 700, 130, "#0c2e18", "#082310");
    const b1 = -((camX * 0.6) % 460);
    for (let i = 0; i < 4; i++) drawBush(b1 + i * 460 + 60, i % 2 === 0 ? 4 : 3, "#145229");
  } else if (th === "castle" || th === "final") {
    ctx.fillStyle = "#1d1d2e";
    for (let i = 0; i < 5; i++) {
      const wx = ((i * 230 - camX * 0.3) % (VIEW_W + 230) + VIEW_W + 230) % (VIEW_W + 230) - 115;
      ctx.fillRect(wx, 120, 46, 90);
      ctx.fillStyle = "rgba(255,120,30,0.25)";
      ctx.fillRect(wx + 8, 130, 30, 70);
      ctx.fillStyle = "#1d1d2e";
    }
  }
}

function drawCloud(x, y, s) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, 7);
  ctx.arc(x + 26 * s, y - 12 * s, 24 * s, 0, 7);
  ctx.arc(x + 54 * s, y, 21 * s, 0, 7);
  ctx.fill();
  ctx.fillRect(x - 20 * s, y + 2 * s, 94 * s, 14 * s);
}

function drawHill(x, h, fill, spot) {
  ctx.fillStyle = fill || "#1e9e30";
  ctx.beginPath();
  ctx.moveTo(x - h * 1.6, 9 * TILE);
  ctx.quadraticCurveTo(x, 9 * TILE - h * 2.1, x + h * 1.6, 9 * TILE);
  ctx.fill();
  ctx.fillStyle = spot || "#157322";
  const yy = 9 * TILE - h * 0.5;
  ctx.fillRect(x - 8, yy, 4, 8);
  ctx.fillRect(x - 2, yy - 6, 4, 8);
  ctx.fillRect(x + 4, yy, 4, 8);
}

function drawBush(x, n, fill) {
  ctx.fillStyle = fill || "#26b33a";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 34, 9 * TILE - 14, 22, 0, 7);
    ctx.fill();
  }
  ctx.fillRect(x - 20, 9 * TILE - 14, n * 34 + 8, 14);
}

function drawTiles() {
  const th = THEMES[LEVELS[levelIdx].theme];
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
        case 1: ctx.drawImage(IMG[th.top], dx, dyy, TILE, TILE); break;
        case 2: ctx.drawImage(IMG[th.fill], dx, dyy, TILE, TILE); break;
        case 3: ctx.drawImage(IMG.tile_solid, dx, dyy, TILE, TILE); break;
        case 4: ctx.drawImage(IMG.tile_brick, dx, dyy, TILE, TILE); break;
        case 8: ctx.drawImage(IMG.tile_used, dx, dyy, TILE, TILE); break;
        case 10:
          ctx.drawImage(IMG.tile_lava, dx, dyy, TILE, TILE);
          ctx.fillStyle = `rgba(255,170,50,${0.14 + 0.1 * Math.sin(frame * 0.08 + tx * 0.9)})`;
          ctx.fillRect(dx, dyy, TILE, TILE);
          break;
        case 11:
          ctx.drawImage(IMG.tile_water, dx, dyy, TILE, TILE);
          ctx.fillStyle = `rgba(120,190,255,${0.12 + 0.1 * Math.sin(frame * 0.07 + tx)})`;
          ctx.fillRect(dx, dyy, TILE, TILE);
          break;
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
  pipes.forEach(([px, h, br]) => {
    const x = px * TILE, top = (br - h) * TILE;
    const img = IMG.tile_pipe;
    const capSrcH = img.height * 0.42;
    const capDestH = 40;
    ctx.drawImage(img, 0, 0, img.width, capSrcH, x, top, TILE * 2, capDestH);
    ctx.drawImage(img, 0, capSrcH, img.width, img.height - capSrcH, x + 4, top + capDestH, TILE * 2 - 8, h * TILE - capDestH);
  });
}

function drawWeather() {
  const lv = LEVELS[levelIdx];
  if (lv.rain && (state === "play" || state === "title")) {
    ctx.strokeStyle = "rgba(200,225,255,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const rx = ((i * 173 + frame * 9) % (VIEW_W + 60)) - 30;
      const ry = ((i * 97 + frame * 19) % (VIEW_H + 60)) - 30;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 5, ry + 16);
    }
    ctx.stroke();
  }
  if (lv.embers && state === "play") {
    ctx.fillStyle = "rgba(255,140,40,0.55)";
    for (let i = 0; i < 22; i++) {
      const ex = ((i * 211 + Math.sin(frame * 0.02 + i) * 40) % VIEW_W + VIEW_W) % VIEW_W;
      const ey = VIEW_H - ((frame * (1.4 + (i % 3) * 0.6) + i * 89) % (VIEW_H + 40));
      ctx.fillRect(ex, ey, 4, 4);
    }
  }
  if (lv.stars && state === "play") {
    for (let i = 0; i < 26; i++) {
      const sx = (i * 137 + 40) % VIEW_W;
      const sy = (i * 71 + 20) % 280;
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(frame * 0.05 + i));
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
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
  const img = it.kind === "mush" ? IMG.item_mushroom : it.kind === "flower" ? IMG.fireflower : IMG.item_star;
  const wob = it.kind === "star" ? Math.sin(frame * 0.3) * 3 : 0;
  ctx.drawImage(img, it.x - 19 + wob, it.y - it.h - 4, 38, 38);
}

function drawPops() {
  pops.forEach((cp) => ctx.drawImage(IMG.banana, cp.x - 17, cp.y - 17, 34, 34));
}

function drawShots() {
  shots.forEach((s) => {
    const s2 = 1 + Math.sin(s.t * 0.6) * 0.15;
    const w = 28 * s2, h = 19 * s2;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.t * 0.35 * Math.sign(s.vx));
    ctx.drawImage(IMG.fx_fireball, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
}

function drawFireballs() {
  fireballs.forEach((f) => {
    const s = 1 + Math.sin(f.t * 0.5) * 0.12;
    const w = 34 * s, h = 23 * s;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.atan2(f.vy, 3) * 0.4);
    ctx.drawImage(IMG.fx_fireball, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
}

function drawEnemy(en) {
  if (en.state === "gone" || !en.active) return;
  let img;
  if (en.state === "flat") img = IMG.enemy_flat;
  else if (en.state === "fly") img = IMG.enemy_fly;
  else if ((en.kind === "shell") && (en.state === "shell" || en.state === "slide")) img = IMG.shell;
  else img = (en.t >> 4) % 2 === 0 ? IMG.enemy_a : IMG.enemy_b;
  ctx.save();
  ctx.translate(en.x, en.y);
  if (en.state === "flip") ctx.scale(1, -1);
  if (en.state === "shell" || en.state === "slide") {
    if (en.state === "slide" && Math.sign(en.vx) < 0) ctx.scale(-1, 1);
    const wob = en.state === "slide" ? Math.sin(frame * 0.7) * 2 : 0;
    ctx.drawImage(img, -20, -34 + wob, 40, 36);
  } else if (en.state === "flat") ctx.drawImage(img, -22, -40, 44, 44);
  else ctx.drawImage(img, -22, -44, 44, 44);
  ctx.restore();
}

function drawCheckpoint() {
  if (!cpX) return;
  const px = cpX, py = cpY;
  ctx.fillStyle = "#b0bec5";
  ctx.fillRect(px - 3, py - 64, 6, 64);
  ctx.fillStyle = "#78909c";
  ctx.fillRect(px - 1, py - 64, 2, 64);
  const wave = Math.sin(frame * 0.12) * 4;
  const img = cpActive && cpLevel === levelIdx ? IMG.tile_checkpoint_on : IMG.tile_checkpoint;
  ctx.drawImage(img, px + 2 + wave * 0.4, py - 64, 30, 22);
}

function drawPlants() {
  plants.forEach((pl) => {
    if (pl.dead || pl.rise <= 0.02) return;
    const hgt = 46 * pl.rise;
    const top = pl.topY - hgt;
    // stem
    ctx.fillStyle = "#3c963c";
    ctx.fillRect(pl.x - 6, top + 18, 12, hgt - 14);
    // head
    ctx.drawImage(IMG.plant, pl.x - 22, top - 8, 44, 54);
  });
}

function drawBigBananas() {
  bigbananas.forEach((bb) => {
    if (bb.got) return;
    const bob = Math.sin(frame * 0.08 + bb.x) * 5;
    ctx.save();
    ctx.translate(bb.x, bb.y + bob);
    // soft gold halo: special item, same beloved banana shape
    ctx.fillStyle = "rgba(255,213,79,0.22)";
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
    ctx.rotate(Math.sin(frame * 0.04) * 0.18);
    ctx.drawImage(IMG.banana, -34, -34, 68, 68);   // 34->68: exactly 4x area
    ctx.restore();
  });
}

function drawHammers() {
  hammers.forEach((hm) => {
    ctx.save();
    ctx.translate(hm.x, hm.y);
    ctx.rotate(hm.rot || 0);
    ctx.drawImage(IMG.hammer, -15, -12, 30, 24);
    ctx.restore();
  });
}

function drawBoss() {
  const b = boss;
  if (!b || b.dead || !b.awake) return;
  if (b.inv > 0 && (frame >> 2) % 2 === 0) return;   // hit flash
  const bob = Math.sin(b.t * 0.1) * 2;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  if (b.face < 0) ctx.scale(-1, 1);
  ctx.drawImage(IMG.boss, -b.w / 2, -b.h, b.w, b.h);
  ctx.restore();
  // hp pips
  for (let i = 0; i < b.maxHp; i++) {
    ctx.fillStyle = i < b.hp ? "#ff5252" : "rgba(255,255,255,.25)";
    ctx.fillRect(b.x - b.maxHp * 9 + i * 18, b.y - b.h - 16, 14, 8);
  }
  if (b.dizzy > 0) {
    ctx.fillStyle = "#ffe082";
    for (let i = 0; i < 3; i++) {
      const ang = frame * 0.15 + i * 2.1;
      ctx.fillRect(b.x + Math.cos(ang) * 26 - 2, b.y - b.h - 10 + Math.sin(ang) * 6, 5, 5);
    }
  }
}

function playerSprite() {
  const p = player;
  if (state === "dead") return IMG.ko;
  if (state === "flag") return IMG.jump_r;
  if (p.crouching) return IMG.fall_r;
  if (!p.onGround) return p.vy < 0 ? IMG.jump_r : IMG.fall_r;
  if (p.skid) return IMG.skid;
  if (Math.abs(p.vx) > 0.3) {
    const running = Math.abs(p.vx) > 3.6;
    p.animT += Math.abs(p.vx) * (running ? 0.7 : 0.5);
    return IMG[["run_r1", "run_r2"][Math.floor(p.animT / 8) % 2]];
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
    if (p.growMode === "fire") scale = BIG_SCALE;
    else scale = p.growMode === "grow" || p.growMode === "growfire" ? (flip ? SMALL_SCALE : BIG_SCALE) : (flip ? BIG_SCALE : SMALL_SCALE);
  }
  let img = playerSprite();
  if (state === "dead" && deadTimer < 30) img = IMG.hurt;
  let w = img.width * scale, h = img.height * scale;
  if (p.landT > 0) {                                   // landing squash
    const k = p.landT / 8;
    h *= 1 - 0.14 * Math.sin(k * Math.PI);
    w *= 1 + 0.10 * Math.sin(k * Math.PI);
  }
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  if (p.face < 0) ctx.scale(-1, 1);
  if (p.fly && state !== "dead") drawWings(w, h);
  if (p.star > 0 && (p.star > 60 || (frame >> 2) % 2 === 0)) {
    ctx.filter = `hue-rotate(${(frame * 29) % 360}deg) saturate(1.6) brightness(1.1)`;
  } else if (p.fire && (p.growT === 0 || Math.floor(p.growT / 5) % 2 === 0)) {
    ctx.filter = "sepia(1) saturate(4) hue-rotate(-28deg) brightness(1.08)";
  }
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  ctx.filter = "none";
}

function drawWings(w, h) {
  const flap = player.onGround ? 0.3 : Math.sin(frame * 0.5);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * w * 0.06, -h * (side < 0 ? 0.64 : 0.56));
    ctx.rotate(side * (0.5 + flap * 0.4));
    ctx.globalAlpha = side < 0 ? 0.7 : 0.95;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-w * 0.34, 0, w * 0.44, h * 0.13, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#cfe0ef";
    ctx.beginPath();
    ctx.ellipse(-w * 0.4, h * 0.08, w * 0.3, h * 0.09, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
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

function hudText(text, x, y, color) {
  ctx.textAlign = "left";
  ctx.fillStyle = "#000";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color || "#fff";
  ctx.fillText(text, x, y);
}

function drawHUD() {
  ctx.font = "16px 'Press Start 2P', monospace";
  hudText("MONKEY", 40, 34);
  hudText(String(score).padStart(6, "0"), 40, 60);
  ctx.drawImage(IMG.banana, 330, 18, 30, 30);
  hudText("x" + String(bananaCount).padStart(2, "0"), 368, 42);
  hudText("WORLD", 545, 34);
  hudText(LEVELS[levelIdx].name, 553, 60);
  hudText("TIME", 700, 34);
  hudText(String(timeLeft).padStart(3, "0"), 708, 60);
  ctx.drawImage(IMG.face1, 830, 16, 40, 32);
  hudText("x" + Math.max(0, lives), 878, 42);
  if (player.fire) ctx.drawImage(IMG.fireflower, 296, 18, 30, 30);
  if (player.fly) hudText("FLY", 452, 34);
  if (player.super) hudText("SUPER", 452, 60);
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
  ctx.fillText("香蕉大冒險  WORLD 1-1 ~ 4-4", VIEW_W / 2, 252);
  ctx.font = "18px 'Press Start 2P', monospace";
  if ((frame >> 5) % 2 === 0) {
    ctx.fillStyle = "#000";
    ctx.fillText("PRESS ENTER / TAP TO START", VIEW_W / 2 + 2, 298);
    ctx.fillStyle = konamiOn ? "#7fff7f" : "#fff";
    ctx.fillText("PRESS ENTER / TAP TO START", VIEW_W / 2, 296);
  }
  if (konamiOn) {
    ctx.font = "11px 'Press Start 2P', monospace";
    ctx.fillStyle = "#7fff7f";
    ctx.fillText("KONAMI MODE  LIVES x99", VIEW_W / 2, 274);
    if ((frame >> 4) % 2 === 0) {
      ctx.font = "18px 'Press Start 2P', monospace";
      const br = bestRankFor(LEVELS[titleSel].name);
      const label = "< STAGE " + LEVELS[titleSel].name + (br ? " *" + br : "") + " >";
      ctx.fillStyle = "#000";
      ctx.fillText(label, VIEW_W / 2 + 2, 322);
      ctx.fillStyle = "#f7c531";
      ctx.fillText(label, VIEW_W / 2, 320);
    }
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
  // rank
  const rc = rankColor(lastRank);
  if (clearTimer > 20) {
    ctx.font = "26px 'Press Start 2P', monospace";
    ctx.fillStyle = "#000";
    ctx.fillText("RANK " + lastRank, VIEW_W / 2 + 3, 258);
    ctx.fillStyle = rc;
    ctx.fillText("RANK " + lastRank, VIEW_W / 2, 255);
    ctx.font = "11px 'Press Start 2P', monospace";
    ctx.fillStyle = "#cfd3ea";
    ctx.fillText("BIG BANANA " + bigGot + "/3   DEATHS " + deathsThisLevel, VIEW_W / 2, 276);
  }
  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("BANANA BONUS  " + bonusLeft, VIEW_W / 2, 300);
  if (clearTimer % 8 === 0 && bonusLeft > 0) {
    const d = Math.min(100, bonusLeft);
    bonusLeft -= d;
    score += d;
    sfx("tick");
  }
  if (bonusLeft <= 0 && clearTimer > 90 && (frame >> 5) % 2 === 0) {
    ctx.fillStyle = "#7fff7f";
    ctx.fillText(levelIdx < LEVELS.length - 1 ? "PRESS ENTER FOR NEXT COURSE" : "PRESS ENTER", VIEW_W / 2, 340);
  }
}

function drawEnding() {
  endT++;
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.font = "34px 'Press Start 2P', monospace";
  ctx.fillStyle = "#f7c531";
  ctx.fillText("恭喜通關!", VIEW_W / 2, 150);
  ctx.font = "18px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("ALL 16 COURSES CLEAR!", VIEW_W / 2, 200);
  ctx.fillStyle = "#9fe08f";
  ctx.fillText("香蕉王國拯救成功!", VIEW_W / 2, 226);
  if (allBigGotSession >= 48) {
    ctx.fillStyle = "#ffd700";
    ctx.fillText("全部大金蕉收集達成 48/48!", VIEW_W / 2, 252);
  }
  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ccc";
  ctx.fillText("SCORE " + String(score).padStart(6, "0") + "   BANANA " + bananaCount, VIEW_W / 2, 284);
  const img = IMG.powerup;
  const s = 1.3 + Math.sin(endT * 0.05) * 0.06;
  ctx.drawImage(img, VIEW_W / 2 - (img.width * s) / 2, 310, img.width * s, img.height * s);
  for (let i = 0; i < 6; i++) {
    const bx = (i * 173 + 60) % VIEW_W;
    const by = ((endT * 2 + i * 137) % (VIEW_H + 80)) - 40;
    ctx.drawImage(IMG.banana, bx, by, 30, 30);
  }
  if (endT > 120 && (frame >> 5) % 2 === 0) {
    ctx.font = "16px 'Press Start 2P', monospace";
    ctx.fillStyle = "#7fff7f";
    ctx.fillText("PRESS ENTER", VIEW_W / 2, VIEW_H - 40);
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
  if (hitstop > 0) { hitstop--; return; }        // impact freeze-frames
  if (shakeT > 0) shakeT--;
  if (state === "loading") return;
  if (paused && state === "play") { anyEnter = false; return; }
  if (state === "title") {
    if (anyEnter) {
      score = 0; bananaCount = 0; allBigGotSession = 0;
      levelIdx = konamiOn ? titleSel : 0;
      lives = konamiOn ? 99 : 5;
      resetLevel();
      state = "play";
    }
    anyEnter = false;
    return;
  }
  if (state === "ending") {
    if (anyEnter && endT > 120) { levelIdx = 0; state = "title"; }
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
    if (bonusLeft <= 0 && anyEnter && clearTimer > 90) {
      if (levelIdx < LEVELS.length - 1) {
        levelIdx++;
        resetLevel();
        state = "play";
        sfx("flag");
      } else {
        state = "ending";
        endT = 0;
        sfx("ending");
      }
    }
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
    if (state === "play") {
      updateEnemies();
      updateBananas();
      updateItems();
      updateShots();
      updateFireballs();
      updatePlants();
      updateBoss();
      updateBigBananas();
      updateTime();
    }
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
    im.onerror = () => {
      const c = document.createElement("canvas");
      c.width = 2; c.height = 2;
      IMG[n] = c;
      console.error("missing sprite:", n);
      if (--left === 0) cb();
    };
    im.src = "assets/sprites/" + n + ".png?v=5";
    IMG[n] = im;
  });
}

loadImages(() => { resetLevel(); state = "title"; });
loop();
