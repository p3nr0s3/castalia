/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SECURITY NOTE (verified 2026-09-16): this project is pinned to
  // next@^14.2.35, which is technically listed as vulnerable to two
  // critical 2026-08-25 CVEs (CVE-2026-75604 path-traversal RCE on
  // Windows hosts; GHSA-2xp9-vwfh-vxw4 libheif/AVIF RCE via the Image
  // Optimization API). Neither is actually reachable in this codebase:
  // CVE-2026-75604 requires a Pages Router + App Router mix without
  // Cache Components (this project has no /pages directory at all —
  // App Router only), and the AVIF bug requires calling next/image
  // (this project never imports it). Confirmed by grep across the
  // whole tree, not just by reading the advisory. Do NOT treat this as
  // a reason to skip a future major-version upgrade indefinitely — if
  // a /pages router or next/image with AVIF is ever added, re-check
  // this note against the current advisories before shipping.
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
    }
    return config;
  },
};

export default nextConfig;
