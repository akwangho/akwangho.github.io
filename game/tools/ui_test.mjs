#!/usr/bin/env node
/** UI sizing-control tests for index.html's inline script (mocked DOM). */
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) { console.error("expected exactly one inline script, found", scripts.length); process.exit(1); }
const code = scripts[0];

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg); }
}

function makeEnv(vw, vh, stored) {
  const handlers = {};
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = {
      id,
      style: {},
      textContent: "",
      _handlers: {},
      addEventListener(ev, fn) { (this._handlers[ev] ||= []).push(fn); },
      fire(ev) { (this._handlers[ev] || []).forEach(f => f({})); },
    };
    return els[id];
  }
  const storeMap = {};
  if (stored !== undefined) storeMap["smb_size"] = String(stored);
  const env = {
    els, store: storeMap,
    winHandlers: {}, fsCalls: 0, exitCalls: 0, scrollable: undefined,
    setViewport(w, h) { globalThis.window.innerWidth = w; globalThis.window.innerHeight = h; },
    fireResize() { (env.winHandlers.resize || []).forEach(f => f({})); },
    evalScript() { (0, eval)(code); },
  };
  globalThis.window = {
    innerWidth: vw,
    innerHeight: vh,
    addEventListener(t, f) { (env.winHandlers[t] ||= []).push(f); },
  };
  globalThis.localStorage = {
    getItem: (k) => (k in storeMap ? storeMap[k] : null),
    setItem: (k, v) => { storeMap[k] = String(v); },
  };
  globalThis.document = {
    getElementById: el,
    body: { classList: { toggle(cls, on) { if (cls === "scrollable") env.scrollable = !!on; } } },
    documentElement: { requestFullscreen() { env.fsCalls++; } },
    fullscreenElement: null,
    exitFullscreen() { env.exitCalls++; },
  };
  return env;
}

try {
  // T1 default fit fills a 1440x900 viewport edge-to-edge
  let env = makeEnv(1440, 900);
  env.evalScript();
  const fitW = parseFloat(env.els.game.style.width), fitH = parseFloat(env.els.game.style.height);
  ok(Math.abs(fitW - 1440) < 0.01 && Math.abs(fitH - 792) < 0.01,
     `default fit sizes to viewport (${fitW} x ${fitH})`);
  ok(env.els.szLabel.textContent === "填滿", "label shows 填滿 in fit mode");
  ok(env.store["smb_size"] === "fit", "fit persisted");
  ok(env.scrollable === false, "no scrolling in fit mode");

  // T2 window resize re-fits
  env.setViewport(800, 600);
  env.fireResize();
  const rw = parseFloat(env.els.game.style.width), rh = parseFloat(env.els.game.style.height);
  ok(Math.abs(rw - 800) < 0.01 && Math.abs(rh - 440) < 0.01,
     `re-fits after resize (${rw} x ${rh})`);

  // T3 plus switches to manual percent based on current fit (83%)
  env.els.szPlus.fire("click");
  ok(env.els.szLabel.textContent === "93%", `plus -> manual ${env.els.szLabel.textContent}`);
  ok(Math.abs(parseFloat(env.els.game.style.width) - 892.8) < 0.01, "manual 93% width applied");
  ok(env.store["smb_size"] === "93", "manual size persisted");

  // T4 minus steps down and clamps at 40%
  for (let i = 0; i < 10; i++) env.els.szMinus.fire("click");
  ok(env.els.szLabel.textContent === "40%", "minus clamps at 40%");

  // T5 plus steps up and clamps at 300%
  for (let i = 0; i < 40; i++) env.els.szPlus.fire("click");
  ok(env.els.szLabel.textContent === "300%", "plus clamps at 300%");
  ok(Math.abs(parseFloat(env.els.game.style.width) - 2880) < 0.01, "300% width applied");

  // T6 fit button restores fill
  env.els.szFit.fire("click");
  ok(env.els.szLabel.textContent === "填滿" && Math.abs(parseFloat(env.els.game.style.width) - 800) < 0.01,
     "fit button restores viewport fill");

  // T7 remembered manual size survives reload (stored 150 on big screen)
  env = makeEnv(1440, 900, "150");
  env.evalScript();
  const mw = parseFloat(env.els.game.style.width), mh = parseFloat(env.els.game.style.height);
  ok(Math.abs(mw - 1440) < 0.01 && Math.abs(mh - 792) < 0.01,
     `remembered 150% applied (${mw} x ${mh})`);
  ok(env.els.szLabel.textContent === "150%" && env.scrollable === true, "label 150% + page scrollable");

  // T8 fullscreen toggle
  env.els.szFull.fire("click");
  ok(env.fsCalls === 1, "fullscreen requested");
  globalThis.document.fullscreenElement = {};
  env.els.szFull.fire("click");
  ok(env.exitCalls === 1, "exitFullscreen called when already fullscreen");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("UI TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
