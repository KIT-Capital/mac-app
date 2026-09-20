import { expect, type Page } from "@playwright/test";

export const HALE = "jonathan.hale@mechartcap.com";
export const DESK = "admin@mechartcap.com";
/** Development appraiser fixture (lib/desk-identities.mjs). Appraisal writes need this role. */
export const APPRAISER = "desk@mechartcap.com";
export const DESK_PASSWORD = process.env.DESK_DEVELOPMENT_PASSWORD ?? "";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email Address").fill(email);
  if (["admin@mechartcap.com", "desk@mechartcap.com"].includes(email.toLowerCase())) {
    await page.getByRole("button", { name: "MAC desk staff" }).click();
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return;
  }
  await page.getByRole("button", { name: "Send sign-in link" }).click();
}

export async function signInHale(page: Page) {
  await signIn(page, HALE, "collection");
  await expect(page.getByRole("heading", { name: "My Timepieces" })).toBeVisible();
}

export async function signInDesk(page: Page) {
  await signIn(page, DESK, DESK_PASSWORD);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/Desk ·/)).toBeVisible();
}

export async function signInAppraiser(page: Page) {
  await signIn(page, APPRAISER, DESK_PASSWORD);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/Desk ·/)).toBeVisible();
}

/**
 * Give Hale one accepted, purchaseable piece through the real appraisal path:
 * the collector submits evidence and an appraiser decides it.
 */
export async function appraiseNewHalePiece(page: Page, model = "UR-100V") {
  await signInHale(page);
  await addTimepieceWithPhotos(page, "Urwerk", model);
  await sendForAppraisal(page);
  await signOutFromMenu(page);

  await signInAppraiser(page);
  await openDeskReview(page, model);
  await page.getByRole("radio", { name: "Accept", exact: true }).check();
  await page.getByLabel("Range low").fill("100000");
  await page.getByLabel("Range high").fill("140000");
  await page.getByLabel("Appraisal value").fill("120000");
  await page.getByRole("button", { name: "Decide" }).click();
  await expect(page.getByRole("button", { name: "Reopen decision" })).toBeVisible();
  await signOutFromMenu(page);
}

export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
}

/** Intake a piece that carries every required shot, so it can be submitted. */
export async function addTimepieceWithPhotos(page: Page, brand: string, model: string) {
  await page.goto("/collection/add");
  await page.getByRole("button", { name: /Missing a brand/i }).click();
  await page.getByPlaceholder("Manufacturer name").fill(brand);
  await page.getByLabel(/Your Model/).fill(model);
  await completeTimepieceIntakePhotos(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: model })).toBeVisible();
}

export async function sendForAppraisal(page: Page, note?: string) {
  if (note) await page.getByLabel("Anything MAC should know?").fill(note);
  await page.getByRole("button", { name: "Send for appraisal" }).click();
  await expect(page.getByTestId("appraisal-state")).toHaveText("With MAC");
}

export async function openDeskReview(page: Page, model: string) {
  await page.getByRole("link", { name: "Client Assets" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: model })
    .getByRole("link", { name: "Review" })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /Appraisal review/i })).toBeVisible();
}

export async function openCollectorAgreements(page: Page) {
  await page.goto("/agreements");
  await expect(page.getByRole("heading", { name: "Repurchase agreements" })).toBeVisible();
}

export async function openDeskAgreements(page: Page) {
  await page.getByRole("link", { name: "Repo Agreements" }).click();
  await expect(page.getByText("Live agreements")).toBeVisible();
}

export async function signOutFromMenu(page: Page) {
  const desktop = page.getByRole("button", { name: "Log out" });
  if (await desktop.isVisible()) {
    await desktop.click();
  } else {
    const menu = page.getByRole("button", { name: "Open menu" });
    if (await menu.isVisible()) {
      await openMenu(page);
      await page.getByRole("button", { name: "Log out" }).click();
    } else {
      await page.goto("/profile");
      await page.getByRole("button", { name: "Log Out" }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Sign In to Your Collection" })).toBeVisible();
}

const INTAKE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const REQUIRED_SHOT_PROMPTS = [
  "Upload a photo of the front of the timepiece",
  "Upload a photo of the back of the timepiece",
  "Upload a photo of the left side of the barrel",
  "Upload a photo of the right side of the barrel",
  "Upload a photo of the clasp or band",
] as const;

export async function completeTimepieceIntakePhotos(page: Page, uniqueFiles = false) {
  for (const [index, prompt] of REQUIRED_SHOT_PROMPTS.entries()) {
    await page.getByLabel(prompt, { exact: true }).setInputFiles({
      name: `${prompt}.png`,
      mimeType: "image/png",
      buffer: uniqueFiles ? Buffer.concat([INTAKE_PNG, Buffer.from([index])]) : INTAKE_PNG,
    });
    await expect(page.getByRole("img", { name: prompt })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: "I have the box" }).check();
  await page.getByRole("checkbox", { name: "I have the original documentation" }).check();
}
