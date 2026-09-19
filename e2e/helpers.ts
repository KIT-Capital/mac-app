import { expect, type Page } from "@playwright/test";

export const HALE = "jonathan.hale@mechartcap.com";
export const DESK = "admin@mechartcap.com";
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

export async function appraiseHaleRoyalOak(page: Page) {
  await signInDesk(page);
  await page.getByRole("link", { name: "Client Assets" }).click();
  const row = page.getByRole("row").filter({ hasText: "Royal Oak Selfwinding" });
  await row.getByRole("button", { name: "Appraise" }).click();
  await expect(row.getByText(/\$\d/)).toBeVisible();
  await signOutFromMenu(page);
}

export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
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
  "Upload a photo of the clasp",
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
