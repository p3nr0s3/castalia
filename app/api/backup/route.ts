import { NextRequest, NextResponse } from "next/server";
import { readServerDb, getStorageBackend } from "@/lib/serverDb";
import { BackupActionSchema, SnapshotNameSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/routeValidation";
import { createBackup, deleteSnapshot, listSnapshots, readSnapshot, restoreBackup, snapshotPath, writeSnapshot } from "@/lib/backupService";
import { getCorsHeaders } from "@/lib/corsHeaders";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const attachment = (filename: string, body: string) =>
  new NextResponse(body, {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });

/**
 * GET                      → { snapshots, backend, autoBackup }
 * GET ?download=live       → the live database as a backup file (add &secrets=1 to include API keys)
 * GET ?download=<name>     → one server snapshot
 */
export async function GET(req: NextRequest) {
  try {
    const download = req.nextUrl.searchParams.get("download");
    if (!download) {
      return NextResponse.json(
        { snapshots: listSnapshots(), backend: getStorageBackend(), autoBackup: process.env.LYRA_AUTO_BACKUP !== "0" },
        { headers: CORS_HEADERS }
      );
    }
    if (download === "live") {
      const includeSecrets = req.nextUrl.searchParams.get("secrets") === "1";
      const date = new Date().toISOString().slice(0, 10);
      return attachment(`lyra-backup-${date}${includeSecrets ? "-WITH-KEYS" : ""}.json`, JSON.stringify(createBackup(await readServerDb(), { includeSecrets })));
    }
    const name = SnapshotNameSchema.safeParse(download);
    if (!name.success) return NextResponse.json({ error: "Invalid snapshot name." }, { status: 400, headers: CORS_HEADERS });
    const file = snapshotPath(name.data);
    if (!fs.existsSync(file)) return NextResponse.json({ error: "Snapshot not found." }, { status: 404, headers: CORS_HEADERS });
    return attachment(name.data, fs.readFileSync(file, "utf-8"));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Backup failed" }, { status: 500, headers: CORS_HEADERS });
  }
}

/** POST {action:"snapshot"} | {action:"restore", mode, snapshot?: name, backup?: <uploaded backup>} */
export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, BackupActionSchema, { headers: CORS_HEADERS, maxBytes: MAX_UPLOAD_BYTES });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  try {
    if (body.action === "snapshot") {
      return NextResponse.json({ snapshot: await writeSnapshot("manual") }, { headers: CORS_HEADERS });
    }
    if (!body.snapshot === !body.backup) {
      return NextResponse.json({ error: "Provide exactly one of 'snapshot' or 'backup'." }, { status: 400, headers: CORS_HEADERS });
    }
    const backup = body.backup ?? readSnapshot(body.snapshot!);
    return NextResponse.json({ restored: await restoreBackup(backup, body.mode) }, { headers: CORS_HEADERS });
  } catch (err: any) {
    const notFound = /not found/i.test(err.message || "");
    return NextResponse.json({ error: err.message || "Restore failed" }, { status: notFound ? 404 : 500, headers: CORS_HEADERS });
  }
}

/** DELETE ?name=<snapshot> */
export async function DELETE(req: NextRequest) {
  const name = SnapshotNameSchema.safeParse(req.nextUrl.searchParams.get("name"));
  if (!name.success) return NextResponse.json({ error: "Invalid snapshot name." }, { status: 400, headers: CORS_HEADERS });
  try {
    const removed = await deleteSnapshot(name.data);
    return NextResponse.json({ removed }, { status: removed ? 200 : 404, headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500, headers: CORS_HEADERS });
  }
}
