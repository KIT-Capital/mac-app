/**
 * Guided collector intake shots.
 *
 * Slot order is fixed, so a saved photo keeps its position across releases.
 * Which shots are mandatory is a Desk setting (`requiredPhotoKinds`): the five
 * guided shots are always required and a super admin may add more.
 */

/** Every kind a photo may carry. One list; readers import it rather than re-declaring. */
export const PHOTO_KINDS = Object.freeze([
  "front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other",
]);

/** Always mandatory. A super admin may add kinds; these five cannot be removed. */
export const DEFAULT_REQUIRED_PHOTO_KINDS = Object.freeze([
  "front", "back", "left", "right", "clasp",
]);

export const TIMEPIECE_SHOTS = Object.freeze([
  { kind: "front", prompt: "Upload a photo of the front of the timepiece" },
  { kind: "back", prompt: "Upload a photo of the back of the timepiece" },
  { kind: "left", prompt: "Upload a photo of the left side of the barrel" },
  { kind: "right", prompt: "Upload a photo of the right side of the barrel" },
  { kind: "clasp", prompt: "Upload a photo of the clasp or band" },
  { kind: "box", prompt: "Upload a photo of the box" },
  { kind: "papers", prompt: "Upload a photo of the original documentation" },
]);

/** A piece holds at most this many photos, guided slots included. */
export const MAX_TIMEPIECE_PHOTOS = TIMEPIECE_SHOTS.length;

/** The kinds a collector actually has a slot for, so a kind can be demanded. */
export const REQUESTABLE_PHOTO_KINDS = Object.freeze(TIMEPIECE_SHOTS.map((shot) => shot.kind));

/**
 * Repair a stored or submitted setting into a usable list: slot-backed kinds
 * only, no duplicates, always containing the five defaults, in slot order.
 * A kind with no intake slot is dropped — demanding it would make Save
 * impossible for the collector.
 */
export function normalizeRequiredPhotoKinds(kinds) {
  const chosen = new Set(DEFAULT_REQUIRED_PHOTO_KINDS);
  for (const kind of Array.isArray(kinds) ? kinds : []) {
    if (REQUESTABLE_PHOTO_KINDS.includes(kind)) chosen.add(kind);
  }
  return TIMEPIECE_SHOTS.filter((shot) => chosen.has(shot.kind)).map((shot) => shot.kind);
}

export function emptyShotSlots() {
  return TIMEPIECE_SHOTS.map(() => "");
}

export function requiredShotKinds(kinds) {
  return normalizeRequiredPhotoKinds(kinds);
}

export function isShotRequired(shot, kinds) {
  return requiredShotKinds(kinds).includes(shot.kind);
}

function hasStoredShot(slot) {
  if (typeof slot === "string") return Boolean(slot);
  return slot?.status === "stored" && Boolean(slot.value);
}

export function missingRequiredShots(slots, kinds) {
  const required = requiredShotKinds(kinds);
  return TIMEPIECE_SHOTS.filter(
    (shot, index) => required.includes(shot.kind) && !hasStoredShot(slots[index]),
  ).map((shot) => shot.kind);
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

export function intakePhotoErrors({ slots, hasBox, hasPapers, requiredPhotoKinds }) {
  const required = requiredShotKinds(requiredPhotoKinds);
  const missing = TIMEPIECE_SHOTS.filter(
    (shot, index) => required.includes(shot.kind) && !hasStoredShot(slots[index]),
  ).map((shot) => shot.prompt.replace(/^Upload a photo of /, "a photo of "));
  if (!hasBox) missing.push("confirmation you have the box");
  if (!hasPapers) missing.push("confirmation you have the original documentation");
  return missing;
}

export function formatIntakeList(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
