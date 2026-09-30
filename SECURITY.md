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

## Known limitations

- Dependency advisories for `next@14` have no fix in the 14.x line; upgrading means moving to 15.5.x
  or 16.x (a migration, not a bump). See the note in `next.config.mjs` for why the published
  advisories do not apply to this code base as it stands.
- The in-browser Python runner downloads Pyodide from a CDN without Subresource Integrity.
- The secret-redaction patterns are a safety net, not a guarantee.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a
public issue. Include the affected version/commit, reproduction steps, and impact.
