import type { Message } from "./types";

/**
 * Image attachments → the request shapes of the cloud providers. Lives outside
 * app/api/cloud/chat/route.ts because Next.js route files may only export HTTP
 * handlers and route config.
 */

export interface ImagePart {
  mimeType: string;
  base64: string;
}

// Vision limits. Attachments are client-supplied, so bound what gets forwarded (and billed).
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ≈ 5 MB of image data

/**
 * Image attachments of a message as provider-neutral parts. Accepts the raw
 * `base64` field or falls back to parsing `dataUrl`; drops anything with an
 * unsupported MIME type, non-base64 content or excessive size rather than
 * failing the whole request.
 */
export function extractImageParts(msg: Message): ImagePart[] {
  const out: ImagePart[] = [];
  for (const a of msg.attachments || []) {
    if (a.type !== "image" || out.length >= MAX_IMAGES_PER_MESSAGE) continue;
    let mimeType = (a.mimeType || "").toLowerCase();
    let base64 = a.base64 || "";
    if (!base64 && a.dataUrl) {
      const m = a.dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/s);
      if (m) {
        mimeType = mimeType || m[1].toLowerCase();
        base64 = m[2];
      }
    }
    if (!mimeType && a.dataUrl) mimeType = (a.dataUrl.match(/^data:([\w/+.-]+);/)?.[1] || "").toLowerCase();
    if (mimeType === "image/jpg") mimeType = "image/jpeg";
    if (!ALLOWED_IMAGE_MIME.has(mimeType)) continue;
    if (!base64 || base64.length > MAX_IMAGE_BASE64_CHARS || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) continue;
    out.push({ mimeType, base64: base64.replace(/\s+/g, "") });
  }
  return out;
}

export type FormattedMessage = { role: string; content: string; images: ImagePart[] };

// Each provider wants images in a different shape. Messages WITHOUT images keep a plain
// string `content` — several OpenAI-compatible backends (DeepSeek, Groq text models,
// some local servers) reject the array form.
export function toOpenAiMessages(msgs: FormattedMessage[]): any[] {
  return msgs.map((m) =>
    m.images.length === 0
      ? { role: m.role, content: m.content }
      : {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.base64}` } })),
          ],
        }
  );
}

export function toAnthropicMessages(msgs: FormattedMessage[]): any[] {
  return msgs.map((m) =>
    m.images.length === 0
      ? { role: m.role, content: m.content }
      : {
          role: m.role,
          content: [
            ...m.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.base64 } })),
            { type: "text", text: m.content },
          ],
        }
  );
}

export function toGeminiContents(msgs: FormattedMessage[]): any[] {
  return msgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [...m.images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } })), { text: m.content }],
  }));
}

