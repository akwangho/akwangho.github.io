import { boot } from "./harness.mjs";
import { konamiStart } from "./botlib.mjs";
const { ns, kd, ku, pump, tap, waitTitle } = await boot();
const T = ns.TILE;
await konamiStart(env0());
function env0(){ return { ns, kd, ku, pump, tap, waitTitle }; }
globalThis.__drv.setLevel(4);
await pump(10);
const p = ns.player;
p.super = true;
p.x = 1660; p.y = 432; p.vx = 0; p.vy = 0; p.invuln = 9999;
// 重演 bot 輸入
let latch = 24;
const held = { jump: true };
kd("Space"); kd("ArrowRight");
for (let f = 0; f < 80; f++) {
  await pump(1);
  if (f % 8 === 0)
    console.log(`f${f} x=${p.x.toFixed(0)} y=${p.y.toFixed(0)} vy=${p.vy.toFixed(1)} j=${ns.keys.jump} onG=${p.onGround} latch=${latch}`);
}
console.log("grid col33-40 rows6-9:");
for (let ty = 6; ty <= 9; ty++) {
  let r = `row${ty}: `;
  for (let tx = 33; tx <= 40; tx++) r += String(ns.grid[ty][tx]).padStart(3);
  console.log(r);
}
process.exit(0);
