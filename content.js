// NeuroOS content script — runs on chatgpt.com / chat.openai.com / claude.ai
// Tracks interaction *patterns* only: timestamps, counts, keys pressed. Never
// reads or stores prompt/response text. Everything lives in this tab's memory
// until a session ends, at which point a numeric summary (no text) is logged.

(() => {
  const WINDOWS = {
    rewrite: 10 * 60 * 1000, // 10 min
    tabSwitch: 15 * 60 * 1000, // 15 min
    copyPaste: 10 * 60 * 1000, // 10 min
    resubmit: 10 * 60 * 1000, // 10 min
  };
  const THRESHOLDS = {
    sessionLongMs: 90 * 60 * 1000,
    rewriteCount: 5,
    tabSwitchCount: 10,
    copyPasteCount: 6,
    resubmitCount: 3,
    resubmitGapMs: 15 * 1000,
    rewriteGapMs: 60 * 1000,
    idleEndsSessionMs: 5 * 60 * 1000,
  };
  const POINTS = {
    longSession: 2,
    rewrites: 3,
    tabSwitches: 2,
    copyPaste: 1,
    resubmits: 2,
  };
  const BANDS = { low: [0, 2], medium: [3, 5] }; // 6+ is high

  const state = {
    sessionStart: Date.now(),
    lastSendAt: 0,
    editsSinceLastSend: 0,
    sendTimestamps: [],
    rewriteEvents: [],
    tabHiddenEvents: [],
    copyPasteEvents: [],
    backspaceCount: 0,
    lastActivityAt: Date.now(),
    interventionsEnabled: true,
    declutterOn: false,
    lastLevel: "low",
    feedbackShown: false,
  };

  chrome.storage.local.get({ interventionsEnabled: true }, (v) => {
    state.interventionsEnabled = v.interventionsEnabled;
  });

  function prune(list, windowMs, now) {
    while (list.length && now - list[0] > windowMs) list.shift();
    return list;
  }

  function computeScore() {
    const now = Date.now();
    prune(state.rewriteEvents, WINDOWS.rewrite, now);
    prune(state.tabHiddenEvents, WINDOWS.tabSwitch, now);
    prune(state.copyPasteEvents, WINDOWS.copyPaste, now);
    prune(state.sendTimestamps, WINDOWS.resubmit, now);

    let score = 0;
    if (now - state.sessionStart > THRESHOLDS.sessionLongMs) score += POINTS.longSession;
    if (state.rewriteEvents.length >= THRESHOLDS.rewriteCount) score += POINTS.rewrites;
    if (state.tabHiddenEvents.length >= THRESHOLDS.tabSwitchCount) score += POINTS.tabSwitches;
    if (state.copyPasteEvents.length >= THRESHOLDS.copyPasteCount) score += POINTS.copyPaste;

    let rapidResubmits = 0;
    for (let i = 1; i < state.sendTimestamps.length; i++) {
      if (state.sendTimestamps[i] - state.sendTimestamps[i - 1] < THRESHOLDS.resubmitGapMs) rapidResubmits++;
    }
    if (rapidResubmits >= THRESHOLDS.resubmitCount) score += POINTS.resubmits;

    let level = "high";
    if (score <= BANDS.low[1]) level = "low";
    else if (score <= BANDS.medium[1]) level = "medium";
    return { score, level };
  }

  function notifyBadge(level, score) {
    chrome.runtime.sendMessage({
      type: "load-state",
      level,
      label: level === "low" ? "" : level === "medium" ? "~" : "!!",
    });
  }

  // ---------- widget (shadow DOM, isolated from host page styles) ----------
  let root, shadow, pill, panel;

  function buildWidget() {
    root = document.createElement("div");
    root.id = "neuroos-root";
    document.documentElement.appendChild(root);
    shadow = root.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
        font-family: -apple-system, "Segoe UI", sans-serif; }
      .pill { display: flex; align-items: center; gap: 8px; background: #1c2321;
        color: #f2f2ee; padding: 8px 14px; border-radius: 999px; font-size: 12.5px;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #3f6e64; flex: none; }
      .dot.medium { background: #b98a3d; }
      .dot.high { background: #b25c4d; }
      .panel { display: none; margin-bottom: 10px; width: 260px; background: #1c2321;
        color: #f2f2ee; border-radius: 10px; padding: 14px 16px; font-size: 13px;
        line-height: 1.45; box-shadow: 0 8px 28px rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.08); }
      .panel.open { display: block; }
      .panel p { margin: 0 0 10px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      button.action { font: inherit; font-size: 12px; border: 1px solid rgba(255,255,255,0.18);
        background: transparent; color: #f2f2ee; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
      button.action:hover { background: rgba(255,255,255,0.08); }
      button.primary { background: #3f6e64; border-color: #3f6e64; }
      .muted { opacity: 0.65; font-size: 11.5px; }
    `;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    panel = document.createElement("div");
    panel.className = "panel";

    pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `<span class="dot"></span><span class="label">NeuroOS · low load</span>`;
    pill.addEventListener("click", () => panel.classList.toggle("open"));

    wrap.appendChild(panel);
    wrap.appendChild(pill);
    shadow.appendChild(wrap);
  }

  function renderPanelIdle() {
    panel.innerHTML = `
      <p><b>Session load: ${state.lastLevel}</b></p>
      <p class="muted">Signals only — no prompt or response text is read or stored.</p>
      <div class="row">
        <button class="action" id="neuroos-declutter">${state.declutterOn ? "Undo calm mode" : "Calm mode"}</button>
        <button class="action" id="neuroos-toggle">${state.interventionsEnabled ? "Disable suggestions" : "Enable suggestions"}</button>
      </div>
    `;
    shadow.getElementById("neuroos-declutter").onclick = toggleDeclutter;
    shadow.getElementById("neuroos-toggle").onclick = toggleInterventions;
  }

  function renderCheckIn() {
    panel.classList.add("open");
    panel.innerHTML = `
      <p><b>This session looks effortful.</b> Want a lighter mode?</p>
      <div class="row">
        <button class="action primary" id="neuroos-simplify">Simplify next answer</button>
        <button class="action" id="neuroos-calm">Calm mode</button>
        <button class="action" id="neuroos-dismiss">Not now</button>
      </div>
    `;
    shadow.getElementById("neuroos-simplify").onclick = insertSimplifyInstruction;
    shadow.getElementById("neuroos-calm").onclick = () => { toggleDeclutter(); renderPanelIdle(); };
    shadow.getElementById("neuroos-dismiss").onclick = () => panel.classList.remove("open");
  }

  function insertSimplifyInstruction() {
    const box = findComposer();
    const instruction = "Please answer in 3 bullet points max, most decision-relevant first.";
    if (box) {
      if ("value" in box) {
        box.value = instruction + (box.value ? "\n" + box.value : "");
        box.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        box.textContent = instruction;
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
      box.focus();
    }
    panel.classList.remove("open");
  }

  function toggleDeclutter() {
    state.declutterOn = !state.declutterOn;
    document.documentElement.classList.toggle("neuroos-calm", state.declutterOn);
    renderPanelIdle();
  }

  function toggleInterventions() {
    state.interventionsEnabled = !state.interventionsEnabled;
    chrome.storage.local.set({ interventionsEnabled: state.interventionsEnabled });
    renderPanelIdle();
  }

  function updateWidget() {
    const { level } = computeScore();
    state.lastLevel = level;
    const dot = shadow.querySelector(".dot");
    const label = shadow.querySelector(".label");
    dot.className = "dot" + (level !== "low" ? " " + level : "");
    label.textContent = `NeuroOS · ${level} load`;

    if (!panel.classList.contains("open")) renderPanelIdle();
    if (state.interventionsEnabled && level !== "low" && !panel.dataset.checkinShown) {
      panel.dataset.checkinShown = "1";
      renderCheckIn();
    }
    if (level === "low") panel.dataset.checkinShown = "";
  }

  // ---------- signal capture ----------
  function findComposer() {
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  function markActivity() {
    state.lastActivityAt = Date.now();
  }

  function onInput(e) {
    if (!isComposerTarget(e.target)) return;
    state.editsSinceLastSend++;
    markActivity();
  }

  function onKeydown(e) {
    if (!isComposerTarget(e.target)) return;
    if (e.key === "Backspace" || e.key === "Delete") state.backspaceCount++;
    if (e.key === "Enter" && !e.shiftKey) registerSend();
    markActivity();
  }

  function isComposerTarget(target) {
    if (!target) return false;
    return target.id === "prompt-textarea" || target.tagName === "TEXTAREA" || target.isContentEditable;
  }

  function onSendButtonClick(e) {
    const btn = e.target.closest('button[data-testid="send-button"], button[aria-label*="Send" i]');
    if (btn) registerSend();
  }

  function registerSend() {
    const now = Date.now();
    if (now - state.lastSendAt < THRESHOLDS.rewriteGapMs && state.editsSinceLastSend > 0) {
      state.rewriteEvents.push(now);
    }
    state.sendTimestamps.push(now);
    state.lastSendAt = now;
    state.editsSinceLastSend = 0;
    markActivity();
    updateWidget();
  }

  function onVisibilityChange() {
    if (document.hidden) state.tabHiddenEvents.push(Date.now());
  }

  function onCopyPaste() {
    state.copyPasteEvents.push(Date.now());
    markActivity();
  }

  function endSessionIfIdle() {
    const now = Date.now();
    const hadActivity = state.sendTimestamps.length >= 3;
    if (hadActivity && !state.feedbackShown && now - state.lastActivityAt > THRESHOLDS.idleEndsSessionMs) {
      state.feedbackShown = true;
      showFeedback();
    }
  }

  function showFeedback() {
    panel.classList.add("open");
    panel.innerHTML = `
      <p><b>Quick check before you go —</b></p>
      <p class="muted">How effortful was this session? (1 easy – 5 draining)</p>
      <div class="row" id="neuroos-effort">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="action" data-n="${n}">${n}</button>`).join("")}
      </div>
    `;
    shadow.getElementById("neuroos-effort").addEventListener("click", (e) => {
      const n = e.target.dataset.n;
      if (!n) return;
      logSession(Number(n));
      panel.innerHTML = `<p>Thanks — logged locally.</p>`;
      setTimeout(() => panel.classList.remove("open"), 1200);
    });
  }

  function logSession(effort) {
    const { score, level } = computeScore();
    chrome.runtime.sendMessage({
      type: "log-session",
      session: {
        ts: Date.now(),
        host: location.host,
        durationMs: Date.now() - state.sessionStart,
        sends: state.sendTimestamps.length,
        rewrites: state.rewriteEvents.length,
        tabSwitches: state.tabHiddenEvents.length,
        copyPaste: state.copyPasteEvents.length,
        backspaces: state.backspaceCount,
        score,
        level,
        effort,
        declutterUsed: state.declutterOn,
      },
    });
  }

  // ---------- boot ----------
  buildWidget();
  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("click", onSendButtonClick, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("copy", onCopyPaste);
  document.addEventListener("paste", onCopyPaste);

  setInterval(() => {
    updateWidget();
    const { level, score } = computeScore();
    notifyBadge(level, score);
    endSessionIfIdle();
  }, 15 * 1000);

  updateWidget();
})();
