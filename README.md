# NeuroOS — Cognitive-Load-Aware AI Interface (v0.1)

An independent project asking a narrow question: **can interaction behavior
alone — no biometrics, no wearables — approximate cognitive friction during
an AI chat session, and does adapting the interface in response actually
help?**

The premise isn't a guess. CHI 2026 research ("When Help Hurts: Verification
Load and Fatigue with AI Coding Assistants") documents real fatigue effects
from sustained AI-assistant use. This project is a working attempt at the
detection + adaptation half of that problem, scoped down to something
buildable and testable rather than a platform pitch.

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
/ high) — see `content.js: computeScore()`.

## Design decisions & tradeoffs

- **Rules over ML, deliberately.** A learned model only earns its complexity
  once there's real session data to beat a simple ruleset against. Shipping
  the rules-based version first is also what makes this legible: every
  score is explainable in one sentence, which matters when the whole premise
  (interaction → fatigue) hasn't been validated yet.
- **Shadow DOM for the widget.** The widget is injected into a `attachShadow`
  root specifically so the host page's CSS can't leak in or collide with it,
  and so the widget's own styles can't leak out onto ChatGPT/Claude's UI.
- **Selector fallbacks, not hard dependencies.** `#prompt-textarea` and
  `[data-testid="send-button"]` are ChatGPT's current markup and will drift.
  Composer/send detection falls back to generic `contenteditable` /
  `textarea` / click heuristics so the extension degrades rather than
  silently breaking when the DOM changes — the single biggest fragility
  risk in a project like this.
- **"Simplify" is a prompt nudge, not true output reformatting.** The
  extension can't reach into ChatGPT/Claude's model to reformat a response
  it already generated — inserting a canned instruction into the composer
  is the honest, achievable version of that idea without an API integration.
- **Local-only storage, on purpose.** `chrome.storage.local` only, nothing
  transmitted anywhere. This was a scoping constraint, not an afterthought —
  it keeps the trust story simple (verifiable from the source) and sidesteps
  a whole category of privacy risk a v0.1 doesn't need to take on.

## Interventions (only shown on medium/high, always dismissible)

- **Simplify next answer** — inserts "answer in 3 bullets, most
  decision-relevant first" into the composer
- **Calm mode** — best-effort CSS decluttering (`content.css`): dims
  nav/sidebar, loosens line-height, kills animation duration
- **End-of-session check-in** — after 5 minutes of idle following a real
  session (3+ sends), asks a single 1–5 effort question and logs it locally

## Known limitations

- **Session resets per page load** — no persistence across a refresh yet;
  a real v1 would key sessions by conversation ID, not tab lifetime
- **No cross-device or cross-tab session stitching** — each tab is its own
  session
- **The core hypothesis is unvalidated** — these five signals are a
  reasonable first guess at proxies for cognitive friction, not a proven
  correlation. That validation is the actual next step, not a footnote.

## What I'd build next

1. Get the extension in front of real users and log effort scores against
   the rules-based level, to see whether the two actually correlate
2. If they do, that's the case for a learned model; if they don't, that's
   the case for redesigning the signal set entirely
3. Extend from ChatGPT/Claude web to an IDE surface (Claude Code, Cursor),
   where session signals are cleaner and the audience is easier to reach

## Where the data goes

`chrome.storage.local` only. The popup (`popup.html`/`popup.js`) reads the
same local store to show recent sessions and lets you flip interventions
off entirely.
