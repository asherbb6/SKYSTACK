# SKYSTACK — Project Instructions (auto-loaded by Claude Code)

NOTE: this repository is PUBLIC (GitHub Pages serves it). Keep this file free of anything sensitive — workflow instructions only.

## Continuity bootstrap — do this BEFORE any SKYSTACK work

This project uses a private continuity vault shared across Asher's AI accounts: `AI-CONTEXT`, expected as a sibling directory beside this repo (`../AI-CONTEXT`).

At the start of every session that will touch SKYSTACK:

1. Locate `../AI-CONTEXT` (sibling of this repo).
2. If it is missing, clone `https://github.com/asherbb6/AI-CONTEXT.git` beside this repo using the machine's authenticated GitHub access (HTTPS credentials are cached on Asher's machine).
3. If it exists and its working tree is clean, synchronize it with `git pull --ff-only`.
4. If it has uncommitted changes or cannot fast-forward, STOP and report that to Asher instead of overwriting, resetting, or force-pulling anything.
5. Read, in order:
   - `AI-CONTEXT/00_SYSTEM/START_HERE.md`
   - `AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md`
   - `AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_HANDOFF.md`
6. Read any other SKYSTACK vault documents those files reference (GOALS.md, DECISIONS.md, ARCHITECTURE.md, VISUAL_DIRECTION.md, DEPLOYMENT.md, ASSET_INDEX.md, recent SESSION_LOGS entries) as relevant to the request.
7. Inspect THIS repository's real state before making changes: current branch, HEAD commit, `git status`, and working-tree diff.
8. Truth rules: this repository and its git history are the factual source of CODE state; the vault is the source of decisions, goals, rejected approaches, visual direction, and the exact continuation point. Where they disagree, trust the repository and resolve the vault afterwards.

## Active-session checkpoint — WHILE material work is in progress (do not wait for the end)

Continuity must not depend on reaching the final response — a session can be cut off at any time
(usage limit, crash, disconnect). Preserve context continuously in the vault so any later Claude or
Codex session can resume exactly where this one stopped.

1. When material work BEGINS (anything beyond a trivial one-liner), create
   `AI-CONTEXT/PROJECTS/SKYSTACK/RECOVERY_CHECKPOINT.md`, commit it, and push AI-CONTEXT `main`
   BEFORE making large edits. It records, at minimum:
   - the objective;
   - work completed so far;
   - files and functions being changed (and any current uncommitted SKYSTACK diff);
   - the confirmed SKYSTACK repo state (branch, HEAD, `git status`);
   - tests/commands run and their results;
   - unresolved / remaining work;
   - the EXACT next action.
2. Update and push that checkpoint again after each meaningful milestone — a working increment, a
   passing test run, a SKYSTACK commit, or a deploy. Keep it current; never let it go stale mid-task.
3. Recovering interrupted work: before changing anything, inspect the REAL SKYSTACK repo — `git status`,
   the full working-tree `git diff`, branch and HEAD — and treat any uncommitted diff as valuable
   unfinished work to understand and finish, not to discard. The repo + its git history are the truth
   for code state (see bootstrap truth rules); the checkpoint tells you the intent and the next action.
4. Never commit or push BROKEN or untested SKYSTACK code just to checkpoint. Checkpoint progress lives
   in the AI-CONTEXT vault, not in half-finished `index.html` commits. Push SKYSTACK `main` only when the
   game parses, `node tests/headless.js` passes, and the deploy rules below are met — because pushing
   `main` deploys. When in doubt, checkpoint to the vault and leave SKYSTACK code uncommitted locally.
5. At close-out, fold the checkpoint into the state/handoff/session-log and delete
   `RECOVERY_CHECKPOINT.md` (its presence signals that a recovery is still in progress).

## Continuity close-out — before declaring material SKYSTACK work complete

1. Update `AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md` and replace `CURRENT_HANDOFF.md` with a precise continuation handoff.
2. Record lasting decisions in `DECISIONS.md`; update any other affected vault docs.
3. Add a dated session log under `AI-CONTEXT/PROJECTS/SKYSTACK/SESSION_LOGS/` (templates in `AI-CONTEXT/00_SYSTEM/`).
4. Commit ONLY the intended vault files and push AI-CONTEXT `main`.
5. Do not claim the handoff is saved until the push is confirmed. If the push fails, state exactly what remains local and why.

## Hard rules

- Never store credentials, tokens, cookies, or authentication data in this repository or in the vault.
- Pushing `main` here DEPLOYS to GitHub Pages (https://asherbb6.github.io/SKYSTACK/). Every deploy must: bump `sw.js` `CACHE` (`skystack-vNN`), update the matching check in `tests/headless.js`, and pass `node tests/headless.js` first. Full procedure: `AI-CONTEXT/PROJECTS/SKYSTACK/DEPLOYMENT.md`.
- Give Asher the cache-busting link `https://asherbb6.github.io/SKYSTACK/?fresh=NN` after every deploy (his browser/PWA caches aggressively).
