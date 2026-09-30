import { z } from "zod";

// Only raster images are accepted. Never serve active SVG/HTML as a reference.
export function validateImage(value: unknown): string | null {
  if (typeof value !== "string") return "Image data URL required";
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return "Use a PNG, JPEG, WebP or GIF image";
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8 * 1024 * 1024 || bytes.length < 12) return "Image must be between 12 bytes and 8 MiB";
  const valid = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    : match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === "gif" ? /^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return valid ? null : "Image contents do not match its media type";
}

export const recordKinds = ["character", "episode", "scene", "outfit", "location", "asset", "usageRecord", "continuityGroup", "settings", "project"] as const;
export const operationSchema = z.object({
  opId: z.string().min(1).max(200), kind: z.enum(recordKinds),
  id: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(["put", "delete"]), baseVersion: z.number().int().nonnegative().default(0),
  data: z.record(z.unknown()).optional(),
});
