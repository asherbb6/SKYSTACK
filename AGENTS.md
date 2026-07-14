# SKYSTACK — Agent Instructions (Codex & other AGENTS.md-based tools)

NOTE: this repository is PUBLIC (GitHub Pages serves it). Keep this file free of anything sensitive — workflow instructions only.

The authoritative operating protocol for this project lives in **`CLAUDE.md`** (same directory).
`CLAUDE.md` is the single source of truth for SKYSTACK continuity, deployment, and hard rules.
This file intentionally does **not** duplicate that protocol — it points you at it so the rules
never drift between Claude and Codex.

## Before doing ANY work on SKYSTACK

1. Read **`CLAUDE.md`** in this directory and follow it in full. In particular:
   - **Continuity bootstrap** — synchronize the private shared vault `AI-CONTEXT` (sibling of this
     repo at `../AI-CONTEXT`) with `git pull --ff-only`, read its SKYSTACK docs
     (`00_SYSTEM/START_HERE.md`, `PROJECTS/SKYSTACK/CURRENT_STATE.md`, `CURRENT_HANDOFF.md`, and the
     docs they reference), and inspect THIS repo's real git state (branch, HEAD, `git status`,
     working-tree diff) — all BEFORE changing anything. If the vault is missing, clone it from
     `https://github.com/asherbb6/AI-CONTEXT.git`; if it has uncommitted changes or cannot
     fast-forward, STOP and report instead of overwriting.
   - **Active-session checkpoint** — when material work begins, create + commit + push
     `AI-CONTEXT/PROJECTS/SKYSTACK/RECOVERY_CHECKPOINT.md`, and update + push it after each
     milestone / passing test / commit / deploy. Do not wait until your final message to preserve
     context. When recovering interrupted work, read the real SKYSTACK `git status` + diff and treat
     any uncommitted diff as unfinished work to finish, not discard.
   - **Continuity close-out** — before declaring material work complete, update `CURRENT_STATE.md`,
     replace `CURRENT_HANDOFF.md`, record decisions in `DECISIONS.md`, add a dated session log, then
     commit + push the vault. Do not claim the handoff is saved until the push is confirmed.
   - **Hard rules** — never store credentials/tokens/cookies in this repo or the vault; pushing
     `main` here DEPLOYS to GitHub Pages, so every deploy must bump `sw.js` `CACHE` (`skystack-vNN`),
     update the matching check in `tests/headless.js`, and pass `node tests/headless.js` first; give
     Asher the `https://asherbb6.github.io/SKYSTACK/?fresh=NN` link after every deploy. Never commit
     or push broken/untested SKYSTACK code just to checkpoint — checkpoint to the vault instead.

2. Treat `AI-CONTEXT` as the shared cross-agent memory: it is how Codex, Claude, and any other
   account hand work off to each other. Keep it synchronized and push your checkpoints/handoffs as
   `CLAUDE.md` instructs.

If this file and `CLAUDE.md` ever disagree, **`CLAUDE.md` wins.**
