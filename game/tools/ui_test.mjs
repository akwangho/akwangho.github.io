#!/usr/bin/env node
/** UI sizing-control + fullscreen tests for index.html's inline script (mocked DOM). */
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
    winHandlers: {}, docHandlers: {}, fsCalls: 0, exitCalls: 0, scrollable: undefined,
    reloads: 0, confirmResult: true,
    setViewport(w, h) { globalThis.window.innerWidth = w; globalThis.window.innerHeight = h; },
    fireResize() { (env.winHandlers.resize || []).forEach(f => f({})); },
    fireDocEvent(t) { (env.docHandlers[t] || []).forEach(f => f({})); },
    pressKey(code) { (env.winHandlers.keydown || []).forEach(f => f({ code, preventDefault() {}, repeat: false })); },
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
    removeItem: (k) => { delete storeMap[k]; },
  };
  globalThis.location = { reload() { env.reloads++; } };
  globalThis.window.confirm = function () { return env.confirmResult; };
  globalThis.document = {
    getElementById: el,
    addEventListener(t, f) { (env.docHandlers[t] ||= []).push(f); },
    body: { classList: { toggle(cls, on) { if (cls === "scrollable") env.scrollable = !!on; } } },
    documentElement: { requestFullscreen() { env.fsCalls++; } },
    fullscreenElement: null,
    webkitFullscreenElement: null,
    exitFullscreen() { env.exitCalls++; },
    webkitExitFullscreen() { env.exitCalls++; },
  };
  return env;
}

try {
  // T1 default fit fills a 1440x900 viewport edge-to-edge
  let env = makeEnv(1440, 900);
  env.evalScript();
  ok(Math.abs(parseFloat(env.els.game.style.width) - 1440) < 0.01 &&
     Math.abs(parseFloat(env.els.game.style.height) - 792) < 0.01,
     `default fit sizes to viewport (${env.els.game.style.width} x ${env.els.game.style.height})`);
  ok(env.els.szLabel.textContent === "填滿", "label shows 填滿 in fit mode");
  ok(env.store["smb_size"] === "fit", "fit persisted");
  ok(env.scrollable === false, "no scrolling in fit mode");

  // T2 window resize re-fits
  env.setViewport(800, 600);
  env.fireResize();
  ok(Math.abs(parseFloat(env.els.game.style.width) - 800) < 0.01 &&
     Math.abs(parseFloat(env.els.game.style.height) - 440) < 0.01,
     `re-fits after resize (${env.els.game.style.width} x ${env.els.game.style.height})`);

  // T3 plus switches to manual percent based on current fit (83% -> +10)
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

  // T7 remembered manual size survives reload
  env = makeEnv(1440, 900, "150");
  env.evalScript();
  ok(Math.abs(parseFloat(env.els.game.style.width) - 1440) < 0.01 &&
     Math.abs(parseFloat(env.els.game.style.height) - 792) < 0.01,
     `remembered 150% applied (${env.els.game.style.width} x ${env.els.game.style.height})`);
  ok(env.els.szLabel.textContent === "150%" && env.scrollable === true, "label 150% + page scrollable");

  // T8 fullscreen: refit in fit mode + button + F shortcut
  env.setViewport(1920, 1080);
  env.els.szFit.fire("click");
  ok(Math.abs(parseFloat(env.els.game.style.width) - 1920) < 0.01, "fit mode uses fullscreen-size window");
  // F shortcut: single tap must NOT toggle (reserved for "fly"), double tap does
  const fs0 = env.fsCalls;
  env.pressKey("KeyF");
  ok(env.fsCalls === fs0, "single F does not toggle fullscreen");
  env.pressKey("KeyF");
  ok(env.fsCalls === fs0 + 1, "double-tap F toggles fullscreen");
  env.els.szFull.fire("click");
  globalThis.document.fullscreenElement = {};
  env.setViewport(1920, 1080);
  env.fireDocEvent("fullscreenchange");
  ok(Math.abs(parseFloat(env.els.game.style.width) - 1920) < 0.01, "canvas refits on fullscreenchange");
  env.els.szFull.fire("click");
  ok(env.exitCalls === 1, "exitFullscreen called when already fullscreen");

  // T9 manual size -> fullscreen AUTO-FILL -> restore on exit
  env = makeEnv(1440, 900);
  env.evalScript();
  env.els.szPlus.fire("click");                    // fit 150% -> manual 160%
  ok(env.store["smb_size"] === "160", "manual 160% set");
  env.setViewport(1920, 1080);
  globalThis.document.fullscreenElement = {};
  env.fireDocEvent("fullscreenchange");
  ok(env.els.szLabel.textContent === "填滿" &&
     Math.abs(parseFloat(env.els.game.style.width) - 1920) < 0.01,
     `entering fullscreen auto-fills (${env.els.game.style.width})`);
  ok(env.store["smb_size"] === "fit" || env.store["smb_size"] === "160",
     "saved pref not clobbered during fs-auto");
  // user presses minus INSIDE fullscreen: take manual control
  env.els.szMinus.fire("click");
  ok(env.els.szLabel.textContent === "150%", `minus inside fs -> ${env.els.szLabel.textContent}`);
  // exit fullscreen: manual choice kept
  globalThis.document.fullscreenElement = null;
  env.fireDocEvent("fullscreenchange");
  ok(env.els.szLabel.textContent === "150%", "exit keeps user-adjusted size (150%)");

  // T10 restore path: auto-fill then exit returns to previous manual size
  env = makeEnv(1440, 900, "80");
  env.evalScript();
  ok(env.els.szLabel.textContent === "80%", "stored 80% loaded");
  globalThis.document.fullscreenElement = {};
  env.setViewport(1920, 1080);
  env.fireDocEvent("fullscreenchange");
  ok(Math.abs(parseFloat(env.els.game.style.width) - 1920) < 0.01, "auto-fill engaged from stored 80%");
  globalThis.document.fullscreenElement = null;
  env.fireDocEvent("fullscreenchange");
  ok(env.els.szLabel.textContent === "80%" && Math.abs(parseFloat(env.els.game.style.width) - 768) < 0.01,
     "exiting fullscreen restores previous 80%");

  // T11 清除記錄：confirm 後移除所有 smb_* 並重載頁面
  env.store["smb_rank_v1"] = JSON.stringify({ "1-1": "S" });
  env.confirmResult = true;
  const rBefore = env.reloads;
  env.els.clearRec.fire("click");
  ok(env.store["smb_rank_v1"] === undefined && env.store["smb_size"] === undefined,
     "clear removes rank/size records");
  ok(env.reloads === rBefore + 1, "page reloads after clearing");

  // T12 取消確認 → 不清除、不重載
  env.store["smb_rank_v1"] = "keep";
  env.confirmResult = false;
  const rB2 = env.reloads;
  env.els.clearRec.fire("click");
  ok(env.store["smb_rank_v1"] === "keep" && env.reloads === rB2,
     "cancelling confirm keeps records");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error("UI TEST CRASH:", err);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (crashed)`);
  process.exit(1);
}
