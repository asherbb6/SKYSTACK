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
