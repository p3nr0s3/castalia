export async function register() {
  // Only run on the Node.js server runtime, never at build time and never
  // on the Edge runtime — fs.watch and the rest of lib/fileWatcher.ts are
  // Node-only. register() is called in every environment Next.js
  // bootstraps (including edge middleware and the build's static
  // analysis pass), so this guard is required, not just defensive.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWatchersFromDb } = await import("./lib/fileWatcher");
    try {
      await startWatchersFromDb();
    } catch (err) {
      // Startup should never fail because a watched folder went missing,
      // got renamed, or moved outside the sandbox since it was
      // configured — log and continue; the project's watcher just stays
      // inactive until the user re-enables it from the UI (which
      // surfaces the real error at that point).
      console.error("[instrumentation] Failed to resume file-watchers on startup:", err);
    }
  }
}
