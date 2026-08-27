#!/usr/bin/env node
/**
 * smallsuper_test.mjs — 小猴子無敵流（方法 B）：
 * 全程維持「最小碰撞體型」＋SUPER 無敵，驗證不同體型物理下仍可 1-1 → 4-4 → 結局。
 * 附帶驗證：小隻角色永遠不會觸發下壓。
 */
import { boot } from "./harness.mjs";
import { konamiStart, createBot, WORDS, typeWord } from "./botlib.mjs";

const env = await boot();
const { ns, pump } = env;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

try {
  await konamiStart(env);
  ok(ns.state === "play" && ns.levelIdx === 0, "started 1-1");
  await typeWord(env, WORDS.super);
  ok(ns.player.super === true, "super enabled");

  const bot = createBot(env, { super: true, small: true });
  let budget = 420000;

  await typeWord(env, WORDS.fly);
  ok(ns.player.fly === true, "fly enabled (small-form flight)");

  let lastLog = 0;
  while (!bot.done && budget-- > 0) {
    const ev = await bot.step();
    if (ev === "ending") break;
    if (bot.noProgress > 0 && bot.noProgress % 2000 === 0 && bot.noProgress !== lastLog) {
      lastLog = bot.noProgress;
      console.log(`  [stuck] lvl=${ns.LEVELS[ns.levelIdx].name} pos=(${ns.player.x | 0},${ns.player.y | 0}) vy=${ns.player.vy.toFixed(1)} onG=${ns.player.onGround} j=${ns.keys.jump} fly=${ns.player.fly}`);
    }
  }

  ok(bot.cleared.length === 16, `smallsuper cleared ${bot.cleared.length}/16`);
  ok(bot.violations === 0, `invariants hold (${bot.violations} violations)`);
  ok(bot.poundedFrames === 0, `small monkey never pounds (${bot.poundedFrames}f)`);
  ok(ns.player.big === false, "still small at the end");

  await pump(140);
  ok(ns.state === "ending", "ending reached");

  console.log(`  deaths=${bot.deaths}`);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("SMALLSUPER CRASH:", err);
  try { console.log(`state=${ns.state} lvl=${ns.levelIdx} pos=(${ns.player?.x | 0},${ns.player?.y | 0})`); } catch {}
  process.exit(1);
}
