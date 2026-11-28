/**
 * Browser-side: turn any photo into a 320×320 image (centre square, upper part
 * favoured so faces stay in frame) and return it as base64 without prefix.
 *
 * Photos with transparency (the round employee icons, PNG/WebP) are kept
 * transparent: they are saved as WebP, or PNG on browsers that cannot write WebP.
 * Ordinary photos are saved as JPEG.
 */
export type ResizedPhoto = { contentType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string };

export async function resizePhoto(file: File, size = 320, quality = 0.86): Promise<ResizedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  // Portrait photos: take the square from near the top (head and shoulders).
  const sy = bitmap.height > bitmap.width ? Math.min(bitmap.height - side, bitmap.height * 0.08) : (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const mayHaveAlpha = file.type === "image/png" || file.type === "image/webp";
  if (mayHaveAlpha && hasTransparency(ctx, size)) {
    const webp = canvas.toDataURL("image/webp", quality);
    if (webp.startsWith("data:image/webp")) return { contentType: "image/webp", dataBase64: strip(webp) };
    return { contentType: "image/png", dataBase64: strip(canvas.toDataURL("image/png")) };
  }
  return { contentType: "image/jpeg", dataBase64: strip(canvas.toDataURL("image/jpeg", quality)) };
}

function hasTransparency(ctx: CanvasRenderingContext2D, size: number): boolean {
  const px = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < px.length; i += 4 * 7) if ((px[i] ?? 255) < 250) return true;
  return false;
}

const strip = (url: string) => url.slice(url.indexOf(",") + 1);
