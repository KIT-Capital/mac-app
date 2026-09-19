export const SAMPLE_WATCH_IMAGES = [
  "/watches/richard-mille.jpg",
  "/watches/patek-nautilus.jpg",
  "/watches/royal-oak.jpg",
  "/watches/romain-gauthier.jpg",
  "/watches/patek-5524g.jpg",
];

export type ResizedImage = {
  blob: Blob;
  dataUrl: string;
};

export type ImageReadResult = {
  original: Blob;
  preview: Blob;
  previewDataUrl: string;
  originalSha256: string;
  previewSha256: string;
};

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

function resizeImage(file: Blob): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 900;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not read image"));
          return;
        }
        void blobDataUrl(blob).then(
          (dataUrl) => resolve({ blob, dataUrl }),
          reject,
        );
      }, "image/jpeg", 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

export function readImagePreview(
  file: Blob,
  resize: (source: Blob) => Promise<ResizedImage> = resizeImage,
) {
  return resize(file);
}

export async function readImageFile(
  file: Blob,
  resize: (source: Blob) => Promise<ResizedImage> = resizeImage,
): Promise<ImageReadResult> {
  const resized = await readImagePreview(file, resize);
  const [originalSha256, previewSha256] = await Promise.all([
    sha256(file),
    sha256(resized.blob),
  ]);
  return {
    original: file,
    preview: resized.blob,
    previewDataUrl: resized.dataUrl,
    originalSha256,
    previewSha256,
  };
}
