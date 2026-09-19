import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REQUIRED_PHOTO_KINDS,
  MAX_TIMEPIECE_PHOTOS,
  PHOTO_KINDS,
  REQUESTABLE_PHOTO_KINDS,
  TIMEPIECE_SHOTS,
  formatIntakeList,
  intakePhotoErrors,
  missingRequiredShots,
  normalizeRequiredPhotoKinds,
  packShots,
  requiredShotKinds,
  slotsFromExisting,
} from "./timepiece-shots.mjs";

const FIVE = ["front", "back", "left", "right", "clasp"];

describe("timepiece shots", () => {
  it("guides collectors through five required barrel and clasp-or-band photos plus optional box and papers", () => {
    const prompts = TIMEPIECE_SHOTS.map((shot) => shot.prompt);
    assert.ok(prompts.includes("Upload a photo of the right side of the barrel"));
    assert.ok(prompts.includes("Upload a photo of the clasp or band"));
    assert.deepEqual(DEFAULT_REQUIRED_PHOTO_KINDS, FIVE);
    assert.deepEqual(requiredShotKinds(), FIVE);
    assert.deepEqual(
      TIMEPIECE_SHOTS.filter((shot) => !requiredShotKinds().includes(shot.kind)).map((shot) => shot.kind),
      ["box", "papers"],
    );
    assert.equal(MAX_TIMEPIECE_PHOTOS, 7);
    assert.equal(TIMEPIECE_SHOTS.length, MAX_TIMEPIECE_PHOTOS);
  });

  it("lets a super admin add a mandatory kind and never drop one of the five", () => {
    assert.deepEqual(requiredShotKinds([...FIVE, "box"]), [...FIVE, "box"]);
    assert.deepEqual(
      missingRequiredShots(["f", "b", "l", "r", "c", "", ""], [...FIVE, "box"]),
      ["box"],
    );
    assert.deepEqual(missingRequiredShots(["f", "b", "l", "r", "c", "bx", ""], [...FIVE, "box"]), []);

    // The five defaults are the floor: a stored value missing any of them is
    // repaired rather than honoured, so nobody can configure them away.
    assert.deepEqual(normalizeRequiredPhotoKinds(["front"]), FIVE);
    assert.deepEqual(normalizeRequiredPhotoKinds([...FIVE, "papers"]), [...FIVE, "papers"]);
    assert.deepEqual(normalizeRequiredPhotoKinds(undefined), FIVE);
    assert.deepEqual(normalizeRequiredPhotoKinds([...FIVE, "box", "box"]), [...FIVE, "box"]);
    assert.deepEqual(normalizeRequiredPhotoKinds([...FIVE, "not-a-kind"]), FIVE);
    // `more` is a real photo kind but has no intake slot, so it can never be
    // demanded — a collector would have no way to supply it.
    assert.deepEqual(normalizeRequiredPhotoKinds([...FIVE, "more"]), FIVE);
    assert.deepEqual(REQUESTABLE_PHOTO_KINDS, [...FIVE, "box", "papers"]);
    assert.deepEqual(requiredShotKinds(["front"]), FIVE);
  });

  it("exports one photo-kind list for every caller", () => {
    assert.deepEqual(PHOTO_KINDS, [
      "front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other",
    ]);
    for (const shot of TIMEPIECE_SHOTS) assert.ok(PHOTO_KINDS.includes(shot.kind));
  });

  it("blocks Save until required shots and both custody statements are present", () => {
    const empty = ["", "", "", "", "", "", ""];
    assert.deepEqual(missingRequiredShots(empty), FIVE);
    const five = ["f", "b", "l", "r", "c", "", ""];
    assert.deepEqual(missingRequiredShots(five), []);
    assert.match(
      intakePhotoErrors({ slots: five, hasBox: false, hasPapers: false }).join(" "),
      /box/,
    );
    assert.match(
      intakePhotoErrors({ slots: five, hasBox: true, hasPapers: false }).join(" "),
      /original documentation/,
    );
    assert.deepEqual(intakePhotoErrors({ slots: five, hasBox: true, hasPapers: true }), []);
    const liveSlots = [
      { status: "stored", value: "photo-front" },
      { status: "stored", value: "photo-back" },
      { status: "stored", value: "photo-left" },
      { status: "selected", value: "preview-right" },
      { status: "failed", value: "preview-clasp" },
      null,
      null,
    ];
    assert.deepEqual(
      intakePhotoErrors({ slots: liveSlots, hasBox: true, hasPapers: true }),
      ["a photo of the right side of the barrel", "a photo of the clasp or band"],
    );
  });

  it("packs filled shots with kinds so optional papers is not stored as the box", () => {
    const slots = ["front-url", "", "left-url", "", "clasp-url", "", "papers-url"];
    assert.deepEqual(packShots(slots), [
      { url: "front-url", kind: "front" },
      { url: "left-url", kind: "left" },
      { url: "clasp-url", kind: "clasp" },
      { url: "papers-url", kind: "papers" },
    ]);
  });

  it("restores saved kinds into the guided slots", () => {
    const slots = slotsFromExisting(["papers-url", "front-url"], ["papers", "front"]);
    assert.equal(slots[0], "front-url");
    assert.equal(slots[6], "papers-url");
    assert.equal(formatIntakeList(["a photo of the clasp", "confirmation you have the box"]), "a photo of the clasp and confirmation you have the box");
  });
});
