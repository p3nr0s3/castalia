/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
