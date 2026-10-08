/*
 * StarFill – detects star-rating forms and offers a one-click fill.
 * Privacy: reads the current page locally only. No storage, no network, no analytics.
 */
(function () {
  "use strict";

  const MIN_GROUPS = 3;      // only act on form-like pages with several star ratings
  const WATCH_MS = 30000;    // keep watching for late-loading forms for 30s, then stop
  if (window.innerWidth < 300) return; // ignore tiny frames/ads

  let host = null, ui = null, dismissed = false, timer = null, observer = null;

  // ---------- detection ----------
  function cls(el) {
    return (el.getAttribute && el.getAttribute("class")) || "";
  }
  function isStarEl(el) {
    if (/star/i.test(cls(el))) return true;
    const t = (el.textContent || "").trim();
    return t === "★" || t === "☆";
  }
  function numVal(r) {
    const v = parseFloat(r.value);
    return isNaN(v) ? null : v;
  }
  function hasStarHint(r) {
    if (r.closest('[class*="star" i],[class*="rating" i],[class*="rate" i]')) return true;
    const lab = r.id ? document.querySelector('label[for="' + CSS.escape(r.id) + '"]') : r.closest("label");
    return !!lab && (/star/i.test(cls(lab)) || /[★☆]/.test(lab.textContent || ""));
  }

  function findRadioGroups() {
    const by = {};
    document.querySelectorAll('input[type="radio"]').forEach((r) => {
      if (r.name) (by[r.name] = by[r.name] || []).push(r);
    });
    return Object.values(by).filter((g) =>
      (g.length === 5 || g.length === 10) &&
      g.every((r) => numVal(r) !== null) &&
      g.some(hasStarHint)
    );
  }

  function findStarGroups() {
    const parents = new Map();
    const nodes = document.querySelectorAll('span,i,li,a,label,button,svg,img,[class*="star" i]');
    const limit = Math.min(nodes.length, 6000);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (el.children.length > 1 || !isStarEl(el)) continue;
      // skip star labels that belong to radios (handled by radio strategy)
      if (el.tagName === "LABEL" && (el.htmlFor || el.querySelector('input[type="radio"]'))) continue;
      const p = el.parentElement;
      if (!p) continue;
      if (!parents.has(p)) parents.set(p, []);
      parents.get(p).push(el);
    }
    return [...parents.values()].filter((g) => g.length === 5 || g.length === 10);
  }

  function scan() {
    return { radios: findRadioGroups(), stars: findStarGroups() };
  }

  // ---------- filling ----------
  function fire(el) {
    ["mouseover", "mousedown", "mouseup", "click"].forEach((t) =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
  }

  function fill(n) {
    const { radios, stars } = scan();
    radios.forEach((g) => {
      const sorted = g.slice().sort((a, b) => numVal(a) - numVal(b));
      const pick = sorted.find((r) => numVal(r) === n) ||
        sorted[Math.min(sorted.length - 1, g.length === 10 ? n * 2 - 1 : n - 1)];
      const lab = pick.id ? document.querySelector('label[for="' + CSS.escape(pick.id) + '"]') : null;
      if (lab) fire(lab);
      pick.checked = true;
      fire(pick);
      pick.dispatchEvent(new Event("input", { bubbles: true }));
      pick.dispatchEvent(new Event("change", { bubbles: true }));
    });
    stars.forEach((g) => fire(g[g.length === 10 ? n * 2 - 1 : n - 1]));
    return radios.length + stars.length;
  }

  // ---------- UI (shadow DOM so page styles can't interfere) ----------
  function buildUI() {
    host = document.createElement("div");
    host.setAttribute("data-starfill", "");
    host.style.cssText = "all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .box{display:flex;align-items:center;gap:8px;background:linear-gradient(180deg,#0060be,#000e42);
             color:#fff;font:600 13px/1 system-ui,Segoe UI,Arial,sans-serif;padding:8px 10px;border-radius:10px;
             box-shadow:0 4px 14px rgba(0,0,0,.35)}
        .star{color:#ffc107;font-size:16px}
        select{font:inherit;border-radius:6px;border:0;padding:4px;background:#fff;color:#111}
        button{font:inherit;cursor:pointer;border:0;border-radius:6px;padding:7px 12px;background:#ffc107;color:#1a1a1a}
        button:hover{background:#ffd54f}
        .x{background:transparent;color:#fff;padding:2px 6px;font-size:16px}
        .x:hover{background:rgba(255,255,255,.2)}
      </style>
      <div class="box">
        <span class="star">★</span>
        <span id="msg"></span>
        <select id="n" aria-label="Rating to fill">
          <option value="5" selected>5</option><option value="4">4</option><option value="3">3</option>
          <option value="2">2</option><option value="1">1</option>
        </select>
        <button id="go">Fill</button>
        <button class="x" id="x" aria-label="Close">×</button>
      </div>`;
    ui = {
      msg: root.getElementById("msg"),
      sel: root.getElementById("n"),
      go: root.getElementById("go"),
    };
    ui.go.addEventListener("click", () => {
      const c = fill(parseInt(ui.sel.value, 10));
      ui.msg.textContent = c ? "Filled " + c + " – review & submit" : "Nothing to fill";
    });
    root.getElementById("x").addEventListener("click", () => { dismissed = true; removeUI(); });
    document.documentElement.appendChild(host);
  }
  function removeUI() { if (host) { host.remove(); host = null; ui = null; } }

  function update() {
    if (dismissed) return;
    const { radios, stars } = scan();
    const total = radios.length + stars.length;
    if (total >= MIN_GROUPS) {
      if (!host) buildUI();
      if (ui && !/Filled/.test(ui.msg.textContent)) ui.msg.textContent = total + " star ratings found · fill with";
    } else {
      removeUI();
    }
  }

  // ---------- run, lightly ----------
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 800);
  }
  schedule();
  setTimeout(update, 2500);
  setTimeout(update, 6000);
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer && observer.disconnect(), WATCH_MS);
})();
