# NeuroOS — Calm Mode for AI Chats (v0.1 MVP)

A Chrome extension that detects cognitive friction during AI chat sessions
from interaction *patterns* — no biometrics, no wearables, no reading of
prompt or response text — and offers small, dismissible interface
adaptations. This is the working prototype for the MVP spec in the NeuroOS
brief, built to demo alongside a YC application.

## Load it (unpacked, ~30 seconds)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**, select this `neuroos-extension` folder
4. Open `https://chatgpt.com` or `https://claude.ai` — a small pill appears
   bottom-right

## What it tracks (all local, all numeric — never message text)

| Signal | How it's detected |
|---|---|
| Prompt rewrite churn | Edited-then-resent within 60s, 5+ times in a 10-min window |
| Tab-switch rate | `visibilitychange` events, 10+ in a 15-min window |
| Copy/paste churn | `copy`/`paste` events, 6+ in a 10-min window |
| Long session | Session open >90 min |
| Rapid resubmits | Sends <15s apart, 3+ times |

These roll up into a 0–2 / 3–5 / 6+ rules-based **load score** (low / medium
/ high) — see `content.js: computeScore()`. No ML in v1, by design: a
learned model only earns its complexity once there's real session data to
beat a simple ruleset.

## Interventions (only shown on medium/high, always dismissible)

- **Simplify next answer** — inserts a canned instruction ("answer in 3
  bullets, most decision-relevant first") into the composer. The extension
  can't reach into ChatGPT/Claude's model to reformat a response it already
  gave — this is the honest workaround until there's an API integration.
- **Calm mode** — best-effort CSS decluttering (`content.css`): dims
  nav/sidebar, loosens line-height, kills animation duration.
- **End-of-session check-in** — after 5 minutes of idle following a real
  session (3+ sends), asks a single 1–5 effort question and logs it locally.

## Known limitations (be upfront about these in the app/demo)

- **Session resets per page load.** There's no persistence across a page
  refresh yet — a real v1 would key sessions by conversation ID, not tab
  lifetime.
- **DOM selectors are best-effort.** `#prompt-textarea`, `[data-testid="send-button"]`
  etc. are ChatGPT's current markup and *will* drift. The composer/send
  detection falls back to generic `contenteditable`/`textarea`/click
  heuristics so it degrades rather than breaking silently, but this is the
  single biggest fragility risk called out in the brief.
- **"Simplify" is a prompt nudge, not true output reformatting.** Real
  reformatting requires either a model API integration or DOM-rewriting the
  rendered response, which is a fundamentally different (and riskier)
  engineering scope.
- **No cross-device or cross-tab session stitching.** Each tab is its own
  session.

## Where the data goes

`chrome.storage.local` only. Nothing is transmitted anywhere. The popup
(`popup.html`/`popup.js`) reads the same local store to show recent
sessions and lets you flip interventions off entirely.

## Mapping back to the brief

This implements section 04 (MVP spec) of the NeuroOS working brief:
session tracking → rules-based load score → lightweight interventions →
end-of-session feedback. The 6-week build plan in that brief is
compressed here into a single working slice — enough to demo the loop
end-to-end, not the full personalization/Phase-3 vision.
