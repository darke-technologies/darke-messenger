function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

/** Shrink a disk image to a JPEG data URL for vault / Supabase rows. */
export async function encodeImageFile(
  file: File,
  maxEdge: number,
  maxChars: number,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.86;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > maxChars && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (!isDataImageUrl(dataUrl)) throw new Error("Could not process image.");
    if (dataUrl.length > maxChars) throw new Error("Image is too large.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const HERO_MAX_BYTES = 2 * 1024 * 1024;
const HERO_MAX_EDGE = 1600;

export type HeroImageBlob = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  previewUrl: string;
};

/** Prepare a hero image for Storage: max 2MB file, max ~1600px edge, JPEG bytes. */
export async function prepareHeroImage(file: File): Promise<HeroImageBlob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > HERO_MAX_BYTES) {
    throw new Error("Hero image must be 2MB or smaller.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    const scale = Math.min(
      1,
      HERO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.5) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
      if (blob && blob.size <= HERO_MAX_BYTES) break;
      quality -= 0.08;
    }
    if (!blob || blob.size > HERO_MAX_BYTES) {
      throw new Error("Hero image is too large after resize (max 2MB).");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const previewUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { bytes, contentType: "image/jpeg", previewUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_EDGE = 768;

export type AvatarImageBlob = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  previewUrl: string;
};

/** Square JPEG avatar, max 768px edge, under 512KB. */
export async function prepareAvatarImage(file: File): Promise<AvatarImageBlob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("Photo must be 4MB or smaller.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.max(0, Math.floor((img.naturalWidth - side) / 2));
    const sy = Math.max(0, Math.floor((img.naturalHeight - side) / 2));
    const out = Math.min(AVATAR_EDGE, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.5) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
      if (blob && blob.size <= AVATAR_MAX_BYTES) break;
      quality -= 0.08;
    }
    if (!blob || blob.size > AVATAR_MAX_BYTES) {
      throw new Error("Photo is too large after resize.");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const previewUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { bytes, contentType: "image/jpeg", previewUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export { isDataImageUrl };
