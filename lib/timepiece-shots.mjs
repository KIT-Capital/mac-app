/** Guided collector intake shots. Optional box and papers photos never block Save. */

export const TIMEPIECE_SHOTS = [
  { kind: "front", prompt: "Upload a photo of the front of the timepiece", optional: false },
  { kind: "back", prompt: "Upload a photo of the back of the timepiece", optional: false },
  { kind: "left", prompt: "Upload a photo of the left side of the barrel", optional: false },
  { kind: "right", prompt: "Upload a photo of the right side of the barrel", optional: false },
  { kind: "clasp", prompt: "Upload a photo of the clasp", optional: false },
  { kind: "box", prompt: "Upload a photo of the box (optional)", optional: true },
  { kind: "papers", prompt: "Upload a photo of the original documentation (optional)", optional: true },
];

const CORE_KINDS = ["front", "back", "left"];
const STRICT_KINDS = ["front", "back", "left", "right", "clasp"];

export function emptyShotSlots() {
  return TIMEPIECE_SHOTS.map(() => "");
}

export function requiredShotKinds(requireFourPhotos = true) {
  return requireFourPhotos ? [...STRICT_KINDS] : [...CORE_KINDS];
}

export function isShotRequired(shot, requireFourPhotos = true) {
  if (shot.optional) return false;
  return requiredShotKinds(requireFourPhotos).includes(shot.kind);
}

function hasStoredShot(slot) {
  if (typeof slot === "string") return Boolean(slot);
  return slot?.status === "stored" && Boolean(slot.value);
}

export function missingRequiredShots(slots, requireFourPhotos = true) {
  return TIMEPIECE_SHOTS.filter((shot, index) => isShotRequired(shot, requireFourPhotos) && !hasStoredShot(slots[index])).map(
    (shot) => shot.kind,
  );
}

export function packShots(slots) {
  return TIMEPIECE_SHOTS.flatMap((shot, index) => {
    const url = slots[index];
    return url ? [{ url, kind: shot.kind }] : [];
  });
}

export function slotsFromExisting(images = [], photoKinds) {
  const slots = emptyShotSlots();
  if (photoKinds?.length === images.length) {
    images.forEach((url, index) => {
      const kind = photoKinds[index];
      const slot = TIMEPIECE_SHOTS.findIndex((shot) => shot.kind === kind);
      if (slot >= 0 && url) slots[slot] = url;
    });
    return slots;
  }
  images.forEach((url, index) => {
    if (index < slots.length && url) slots[index] = url;
  });
  return slots;
}

export function intakePhotoErrors({ slots, hasBox, hasPapers, requireFourPhotos = true }) {
  const missing = TIMEPIECE_SHOTS.filter((shot, index) => isShotRequired(shot, requireFourPhotos) && !hasStoredShot(slots[index])).map(
    (shot) => shot.prompt.replace(/^Upload a photo of /, "a photo of ").replace(" (optional)", ""),
  );
  if (!hasBox) missing.push("confirmation you have the box");
  if (!hasPapers) missing.push("confirmation you have the original documentation");
  return missing;
}

export function formatIntakeList(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
