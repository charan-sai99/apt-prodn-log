/**
 * Browser-side: turn any photo into a 320×320 JPEG (centre square, upper part
 * favoured so faces stay in frame) and return it as base64 without prefix.
 */
export async function resizePhoto(file: File, size = 320, quality = 0.82): Promise<string> {
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
  const url = canvas.toDataURL("image/jpeg", quality);
  return url.slice(url.indexOf(",") + 1);
}
