<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Push and deploy

What the words mean when someone types them to an agent in this repository (details: docs/SETUP.md part C):

- **"push"**: GitHub only, nothing goes live. Run the checks the change needs, commit, `git pull --rebase origin master`, `git push origin master`.
- **"push and deploy"**: the same, then `git push origin master:release`. Moving the `release` branch is the deploy: the server picks it up within a minute and needs 3 to 5 minutes. No API token, no click.
- **"deploy"** alone: `git fetch origin` and `git push origin origin/master:release` (releases what is on GitHub's master).
- Never push to `release` unless the word "deploy" was said. Deploys are paused on the server, so a plain push never goes live. Never commit on `release`.
- To see what runs: Settings → Releases in the app, or `npm run remote -- deploy-status` for whoever has an API token.
