# Security

Lyra is a **single-user, local-first** app. It can read your files, write them (with approval),
run code, and call cloud APIs with your keys, so it is meant to be reachable only by you.

## Threat model

Protected against:

- **Other websites** open in your browser attacking the local server (CSRF, DNS rebinding):
  `Host` allow-list + same-origin requirement, see `middleware.ts` / `lib/requestGuard.ts`.
- **Prompt-injected content** (web pages, documents, search results) steering the model or agents:
  approval gate for writes/deletes, credential locations unreadable, SSRF-safe fetching.
- **Accidents**: path traversal, symlink escapes, runaway processes, replayed approvals.

Not protected against:

- **Anyone who can reach the port with the access token** (or without one, if you never set it):
  that is full control of the app, including code execution. Use `APP_ACCESS_TOKEN` for anything
  beyond `127.0.0.1`. `npm run dev:lan` / `start:lan` refuse to start without it.
- **A malicious local user/process** on the same machine.
- **Multi-user isolation**: there are no accounts.

## Hardening checklist for network use

1. `openssl rand -hex 32` → set `APP_ACCESS_TOKEN` and `NEXT_PUBLIC_APP_ACCESS_TOKEN` (same value) in `.env.local`.
2. Put the app behind HTTPS (the tunnel script does; for a reverse proxy add the hostname to `ALLOWED_HOSTS`).
3. Keep provider API keys in `.env.local` (server-side) rather than in the browser settings.
4. Rotate the token if you suspect it leaked (it is embedded in the client bundle by design).

## Additional protections

- **Private data stays out of git.** `tests/repoHygiene.test.ts` runs in CI and fails if a database, `data/`
  folder or copy of it, `.env` file, token or private key is tracked. (A copy of `data/` named `data-backup/`
  was once committed to the public repository; if you ever do that, treat the contents as exposed and rewrite
  the history, deleting the file in a later commit is not enough.)
- **Tests never touch your data.** Every test file gets a throwaway `LYRA_DATA_DIR`. Previously `npm test`
  ran against the real `data/` folder: one test deleted `data/response-cache.json` on every run.
- **Backups.** Snapshots in `data/backups/` contain your chat history (readable by anything that can read that
  folder) and are written owner-only. API keys are excluded unless you explicitly ask for them, and pending
  approvals are never included.
- **Webhooks** (agent notifications, connectors) only reach public https hosts: the name is resolved once,
  every address is checked, and the connection is pinned to the validated address.
- **Chat history, backup and MCP routes** require same-origin like the file and code-execution routes, even for GET.
- **The service worker never touches `/api/*`** and does not cache HTML pages.

## Known limitations

- Dependency advisories for `next@14` have no fix in the 14.x line; upgrading means moving to 15.5.x
  or 16.x (a migration, not a bump). See the note in `next.config.mjs` for why the published
  advisories do not apply to this code base as it stands.
  CI keeps this honest: the `audit` job fails for any advisory that is not listed in
  `.github/audit-baseline.json` (the ones reviewed so far), so a new advisory gets a fresh look
  instead of disappearing into a permanently red `npm audit`.
- The in-browser Python runner downloads Pyodide from a CDN without Subresource Integrity.
- The secret-redaction patterns are a safety net, not a guarantee.
- The SQLite backend needs Node 22+. On older Node the app uses `data/db.json` (everything works, without
  SQLite's crash-safety); loading the SQLite binary on Node 20 would crash the process, so it is not attempted.
- Restoring a backup on one device does not stop another device with older local data from re-adding deleted
  items when it next syncs.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a
public issue. Include the affected version/commit, reproduction steps, and impact.
