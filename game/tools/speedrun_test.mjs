#!/usr/bin/env node
/**
 * speedrun_test.mjs — 極速通關法（方法 A）：
 * 全程跑步、無常駐無敵，卡關時自適應開啟 SUPER 輔助。
 * 驗證 1-1 → 4-4 → 結局，並統計每關幀數／死亡數／違規數。
 */
import { boot } from "./harness.mjs";
import { konamiStart, createBot, WORDS } from "./botlib.mjs";

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

  const bot = createBot(env, { super: false, assistSuper: true });
  const levelFrames = [];
  let lastLvl = 0, framesMark = 0, budget = 420000;

  while (!bot.done && budget-- > 0) {
    const ev = await bot.step();
    if (ev === "ending") break;
    if (ns.levelIdx !== lastLvl) {
      levelFrames.push(framesMark);
      lastLvl = ns.levelIdx; framesMark = 0;
      continue;
    }
    framesMark++;
  }

  // 最終關進入結局
  if (ns.state === "ending") {
    levelFrames.push(framesMark);
    clearedFinal(ns);
  }
  function clearedFinal() {
    levelFrames[15] ??= framesMark;
  }

  ok(bot.cleared.length === 16 || bot.cleared.length + (ns.state === "ending" ? 0 : 0) === 16,
     `speedrun cleared ${bot.cleared.length}/16`);
  ok(bot.violations === 0, `invariants hold (${bot.violations} violations)`);

  await pump(140);
  ok(ns.state === "ending", "ending reached");

  const totalF = levelFrames.reduce((a, b) => a + b, 0);
  console.log(`  total ~${totalF}f (~${(totalF / 60).toFixed(0)}s), deaths=${bot.deaths}, assist=${bot.assistUsed()}`);
  console.log(`  per-level: ${levelFrames.join(", ")}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("SPEEDRUN CRASH:", err);
  try { console.log(`state=${ns.state} lvl=${ns.levelIdx} pos=(${ns.player?.x | 0},${ns.player?.y | 0}) nop=${bot.noProgress}`); } catch {}
  process.exit(1);
}
