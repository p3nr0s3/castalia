/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SECURITY NOTE (verified 2026-09-16, extended 2026-09-18): this
  // project is pinned to next@^14.2.35. `npm audit` currently lists 8
  // vulnerabilities against it (2 critical, 4 high, 2 moderate as of the
  // 2026-07-21 Next.js security release). All 8 were checked against
  // this codebase's actual usage, not just the advisory text:
  //
  // - CVE-2026-75604 (Windows RCE via path traversal): requires a Pages
  //   Router + App Router mix without Cache Components. This project has
  //   no /pages directory at all — App Router only.
  // - GHSA-2xp9-vwfh-vxw4 (AVIF/libheif RCE, Image Optimization API):
  //   requires calling next/image. Never imported here.
  // - GHSA-m99w-x7hq-7vfj (DoS, Server Actions) / GHSA-89xv-2m56-2m9x
  //   (SSRF, Server Actions on custom servers) / GHSA-4c39-4ccg-62r3
  //   (unbounded payload, Server Actions on Edge runtime) /
  //   GHSA-955p-x3mx-jcvp (disclosure of Server Function endpoints):
  //   all four require Server Actions ("use server"). Zero matches for
  //   "use server" anywhere in app/lib/components — this project only
  //   uses Route Handlers (app/api/*/route.ts), never Server Actions.
  // - GHSA-p9j2-gv94-2wf4 (SSRF via rewrites): requires a rewrites() or
  //   redirects() rule building its destination from user-supplied
  //   request data. next.config.mjs (this file) defines no rewrites()
  //   or redirects() at all.
  // - GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q (cache confusion of
  //   response bodies): per the advisory, only the specific pattern
  //   `fetch(new Request(url, init), aDifferentInit)` is affected —
  //   plain `fetch(url, init)` (what every fetch call in this codebase
  //   uses) is explicitly called out as NOT affected. Zero matches for
  //   `new Request(` anywhere in app/lib/components.
  //
  // Confirmed by grep across the whole tree for every claim above, not
  // by reading the advisories alone. Do NOT treat this as a reason to
  // skip a future major-version upgrade indefinitely — if Server
  // Actions, a /pages router, rewrites(), next/image+AVIF, or a
  // fetch(new Request(...), ...) call is ever added, re-check this note
  // against the current advisories before shipping.
  experimental: {
    // Lets Next tree-shake these barrel-exported icon packages per-icon
    // instead of pulling the whole package into the bundle — matters most
    // for @phosphor-icons/react (139 icons imported across the app, only a
    // handful used per page) and keeps lucide-react covered too in case it
    // ever comes back.
    optimizePackageImports: ["@phosphor-icons/react", "lucide-react"],
    // Next.js 14.2 requires this flag for instrumentation.ts's register()
    // to be called at all (stable/no-flag-needed as of Next 15+, but this
    // project is pinned to 14.2.x — see the CVE note above). Used to
    // resume ambient file-watchers (lib/fileWatcher.ts) for any project
    // that had one enabled in a previous server run, since fs.watch
    // instances don't survive a process restart.
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // better-sqlite3 is an optionalDependency (native module) loaded via a
      // defensive require() in lib/serverDb.ts, with an automatic fallback
      // to the JSON file storage when it isn't installed. Marking it
      // external stops webpack from trying to statically resolve/bundle it
      // at build time (which produced a harmless but confusing "Module not
      // found" warning when the package isn't present) — Node's own
      // require() handles it correctly either way at runtime.
      config.externals = [...(config.externals || []), "better-sqlite3"];
    } else {
      // lib/embeddings.ts is reachable from the client bundle (imported via
      // lib/rag.ts <- app/page.tsx) but lazily require()s 'fs'/'path' only
      // inside a `typeof window === "undefined"` runtime guard, so that
      // code never actually executes in the browser. `next build`'s
      // production optimizer dead-code-eliminates the guarded branch
      // before module resolution, so it's silent there — but `next dev`
      // does not perform the same elimination and still tries to resolve
      // 'fs'/'path' for the client bundle, producing a persistent
      // "Module not found: Can't resolve 'fs'" warning (harmless, but
      // noisy on every compile). Telling webpack to stub these out for
      // the client bundle fixes it in both dev and prod, independent of
      // whatever dead-code elimination happens to do.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
