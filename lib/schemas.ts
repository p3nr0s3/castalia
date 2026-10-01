import { z } from "zod";

/**
 * Request-body schemas shared by the API routes (and usable from the client / tests).
 * Before this every route hand-rolled its own `if (!body?.x)` checks, each with slightly
 * different rules and error shapes. Keep messages stable: clients and tests match on them.
 */

const finiteNumber = z.number().refine(Number.isFinite, "must be a finite number");

/** Semantic-cache embedding: bounded so a caller cannot make the server multiply huge vectors. */
export const EmbeddingSchema = z.array(finiteNumber).min(1).max(8192);

export const CacheUpsertSchema = z.object({
  key: z.string({ error: "key is required" }).min(1, "key is required"),
  model: z.string().optional(),
  timestamp: z.number().optional(),
  embedding: EmbeddingSchema.optional(),
  data: z.unknown(),
});

export const SemanticLookupSchema = z.object({
  action: z.literal("semantic-lookup"),
  model: z.string().min(1),
  embedding: EmbeddingSchema,
  threshold: z.number().min(0).max(1).optional(),
});

const TOOL_MISSING = "Missing 'tool' parameter in request body.";

export const ToolExecuteSchema = z.object({
  tool: z.string({ error: TOOL_MISSING }).min(1, TOOL_MISSING),
  args: z.record(z.string(), z.unknown()).default({}),
  approvalToken: z.string().optional(),
});

// ---- backup / restore ---------------------------------------------------------------------

export const BACKUP_FORMAT = "lyra-backup";
export const BACKUP_VERSION = 1;

/**
 * A backup is a JSON snapshot of the server database. Items are intentionally only checked
 * for the fields the merge logic relies on (`id`, plus a timestamp where one is used) so that
 * backups keep restoring across app versions that add optional fields.
 */
const Item = z.looseObject({ id: z.string().min(1) });

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  createdAt: z.number(),
  includesSecrets: z.boolean().default(false),
  data: z.object({
    conversations: z.array(Item).default([]),
    projects: z.array(Item).default([]),
    agents: z.array(Item).default([]),
    journalEntries: z.array(Item).default([]),
    personas: z.array(z.looseObject({})).default([]),
    settings: z.looseObject({}).optional(),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

export const RestoreRequestSchema = z.object({
  backup: BackupSchema,
  /** "replace" swaps the whole database; "merge" adds/updates items by id and keeps the rest. */
  mode: z.enum(["merge", "replace"]).default("merge"),
});

export const SnapshotNameSchema = z.string().regex(/^lyra-(auto|manual|pre-restore)-\d{8}-\d{6}(-\d+)?\.json$/, "invalid snapshot name");

export const BackupActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snapshot") }),
  z.object({
    action: z.literal("restore"),
    mode: z.enum(["merge", "replace"]).default("merge"),
    /** Either a server-side snapshot by name, or an uploaded backup file's contents. */
    snapshot: SnapshotNameSchema.optional(),
    backup: BackupSchema.optional(),
  }),
]);

// ---- history search -----------------------------------------------------------------------

export const HistorySearchSchema = z.object({
  q: z.string().trim().min(1, "q is required").max(200),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ---- MCP ----------------------------------------------------------------------------------

export const McpServerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "id must be 1-40 letters, digits, '-' or '_'"),
  name: z.string().min(1).max(80),
  url: z.string().url().max(500),
  /** Optional auth headers (e.g. Authorization). Kept out of logs; sent only to `url`. */
  headers: z.record(z.string().regex(/^[A-Za-z0-9-]{1,60}$/), z.string().max(2000)).optional(),
  enabled: z.boolean().default(true),
});
export type McpServerConfig = z.infer<typeof McpServerSchema>;

export const McpListRequestSchema = z.object({ server: McpServerSchema });

export const McpCallRequestSchema = z.object({
  server: McpServerSchema,
  tool: z.string().min(1).max(200),
  args: z.record(z.string(), z.unknown()).default({}),
  approvalToken: z.string().optional(),
});
