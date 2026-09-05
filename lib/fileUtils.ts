import { Attachment } from "./types";

export async function processSelectedFiles(files: FileList | File[]): Promise<Attachment[]> {
  const fileArray = Array.from(files);
  const attachments: Attachment[] = [];

  for (const file of fileArray) {
    const isImage = file.type.startsWith("image/");
    const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (isImage) {
      const dataUrl = await readFileAsDataURL(file);
      // Extract pure base64 by removing "data:image/...;base64,"
      const base64 = dataUrl.split(",")[1] || "";
      attachments.push({
        id,
        name: file.name,
        type: "image",
        mimeType: file.type,
        size: file.size,
        dataUrl,
        base64,
      });
    } else {
      // Text, code, document files
      let textContent = "";
      try {
        textContent = await readFileAsText(file);
      } catch {
        textContent = `[Binary / Non-UTF8 Document: ${file.name}, size: ${file.size} bytes]`;
      }

      attachments.push({
        id,
        name: file.name,
        type: "document",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        textContent,
      });
    }
  }

  return attachments;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
