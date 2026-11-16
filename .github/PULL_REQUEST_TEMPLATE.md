## What this changes

## Why

## How it was checked

- [ ] `cd sdk && npm ci && npm run build && npm run typecheck && npm test`
- [ ] `for f in chain/scripts/*.sh; do bash -n "$f"; done` (when a script changed)
- [ ] No keypair file, `.env` file or RPC URL with a key in the diff
- [ ] `docs/API.md` updated when a public function changed
