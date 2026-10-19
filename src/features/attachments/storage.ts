import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/** Files live outside the web root. Override with ATTACHMENT_DIR (absolute or relative to the working directory). */
export function attachmentRoot(): string {
  return path.resolve(process.env.ATTACHMENT_DIR || "storage/attachments");
}

export const maxAttachmentBytes = 15 * 1024 * 1024;

const allowedExtensions: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
};

export const acceptedAttachmentExtensions = Object.keys(allowedExtensions).map((extension) => `.${extension}`);

export function resolveMimeType(fileName: string): string | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return allowedExtensions[extension] ?? null;
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[\r\n\t]/g, " ").trim();
  return base.slice(0, 255) || "attachment";
}

export async function saveAttachmentFile(leadId: number, fileName: string, bytes: Uint8Array): Promise<string> {
  const extension = fileName.toLowerCase().split(".").pop() ?? "bin";
  const storageKey = `${leadId}/${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${extension.replace(/[^a-z0-9]/g, "")}`;
  const target = path.join(attachmentRoot(), storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return storageKey;
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  const root = attachmentRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid storage key.");
  return readFile(target);
}
