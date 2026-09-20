/**
 * Retail appraisal vocabulary (R29). Five words, one meaning each, shared by
 * the collector detail screen, the grid card, and the valuation export so a
 * piece never reads one way on one screen and another way on the next.
 * Internal states (`under_review`, `returned`) never reach these strings.
 */
import { TIMEPIECE_SHOTS } from "@/lib/timepiece-shots.mjs";
import type { AppraisalStateWord, PhotoKind } from "@/lib/types";

export const APPRAISAL_WORDS: Record<AppraisalStateWord, string> = {
  not_sent: "Not sent",
  with_mac: "With MAC",
  accepted: "Accepted",
  not_accepted: "Not accepted",
  closed: "Closed",
};

export const WITH_MAC_PHRASE =
  "MAC has your photographs and details. Editing is paused until MAC responds.";
export const REFUSAL_PHRASE = "This timepiece does not meet the MAC appraisal criteria.";
/** Only an Accept is provisional; a refusal is final when recorded (R4). */
export const PROVISIONAL_PHRASE = "Provisional — physical inspection required";
export const FINAL_PHRASE = "Final — confirmed at inspection";
export const CLOSED_PHRASE = "Appraisal closed — this piece has used its three decisions.";

/** "a photo of the clasp or band", matching the intake screen's own wording. */
export function shotPhrase(kind: PhotoKind | string) {
  const shot = TIMEPIECE_SHOTS.find((item: { kind: string }) => item.kind === kind);
  return shot ? shot.prompt.replace(/^Upload a photo of /, "a photo of ") : `a ${kind} photo`;
}
