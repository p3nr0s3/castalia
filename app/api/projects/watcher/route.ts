import { NextRequest, NextResponse } from "next/server";
import { readServerDb, writeServerDb } from "@/lib/serverDb";
import { startWatcher, stopWatcher, isWatcherActive } from "@/lib/fileWatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/projects/watcher?projectId=xyz     -> { active, folderPath, enabled }
 * POST /api/projects/watcher { projectId, action: "start"|"stop", folderPath? }
 *
 * This route only manages the server-side fs.watch lifecycle and the
 * project's watchedFolderEnabled/watchedFolderPath fields — it does not
 * duplicate the actual sync logic (see lib/fileWatcher.ts's rescanProject),
 * so a "start" here triggers the same debounced initial scan a real fs
 * change event would.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required." }, { status: 400 });
  }

  const db = await readServerDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) {
    return NextResponse.json({ error: `Project '${projectId}' not found.` }, { status: 404 });
  }

  return NextResponse.json({
    enabled: Boolean(project.watchedFolderEnabled),
    folderPath: project.watchedFolderPath || null,
    active: isWatcherActive(projectId),
  });
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; action?: "start" | "stop"; folderPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectId, action, folderPath } = body;
  if (!projectId || !action) {
    return NextResponse.json({ error: "projectId and action are required." }, { status: 400 });
  }

  const db = await readServerDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) {
    return NextResponse.json({ error: `Project '${projectId}' not found.` }, { status: 404 });
  }

  if (action === "start") {
    const resolvedFolderPath = folderPath ?? project.watchedFolderPath;
    if (!resolvedFolderPath) {
      return NextResponse.json(
        { error: "folderPath is required to start a watcher (either in the request or already saved on the project)." },
        { status: 400 }
      );
    }

    const projectWithPath = { ...project, watchedFolderPath: resolvedFolderPath, watchedFolderEnabled: true, updatedAt: Date.now() };

    try {
      startWatcher(projectWithPath);
    } catch (err: any) {
      // Don't persist watchedFolderEnabled: true if the watcher itself
      // failed to start (bad path, outside sandbox, not a directory) —
      // otherwise a restart would keep retrying the same broken config.
      return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
    }

    await writeServerDb({ projects: [projectWithPath] });
    return NextResponse.json({ success: true, active: true, folderPath: resolvedFolderPath });
  }

  if (action === "stop") {
    stopWatcher(projectId);
    const updatedProject = { ...project, watchedFolderEnabled: false, updatedAt: Date.now() };
    await writeServerDb({ projects: [updatedProject] });
    return NextResponse.json({ success: true, active: false });
  }

  return NextResponse.json({ error: `Unknown action '${action}'. Use "start" or "stop".` }, { status: 400 });
}
