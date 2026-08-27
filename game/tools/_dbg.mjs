import { boot } from "./harness.mjs";
const { ns, kd, ku, pump, tap, waitTitle } = await boot();
const T = ns.TILE;
await waitTitle();
for (const c of ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"]) { kd(c); await pump(1); ku(c); }
while (ns.titleSel !== 4 || ns.state !== "play") {
  if (ns.state === "title" && ns.titleSel !== 4) await tap("ArrowRight");
  else if (ns.state === "title") await tap("Enter");
  await pump(3);
}
await pump(10);
const p = ns.player;
p.super = true; p.big = false; p.h = 46;
p.invuln = 9999;
ns.enemies.length = 0;
// 從 x=1568 (col32.66), y=432, vx=5.2 滿弧起跳
p.x = 1568; p.y = 432; p.vx = 5.2; p.vy = 0; p.onGround = true;
kd("Space"); kd("ArrowRight"); kd("ShiftLeft");
let minY = 999, landedX = -1;
for (let f = 0; f < 80; f++) {
  await pump(1);
  if (!p.onGround) minY = Math.min(minY, p.y);
  else if (f > 3) { landedX = p.x; break; }
}
console.log(`minY=${minY.toFixed(0)} (pipe top=288) landedX=${landedX.toFixed(0)} y=${p.y.toFixed(0)} onG=${p.onGround}`);
console.log(`pipe at col35-36 rows6-8; crossed? ${landedX >= 1680 ? "YES" : "NO"}`);
process.exit(0);
