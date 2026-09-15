import { expect, type Page } from "@playwright/test";

export const HALE = "jonathan.hale@mechartcap.com";
export const DESK = "admin@mechartcap.com";
export const DESK_PASSWORD = "MAC-Desk-2022";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export async function signInHale(page: Page) {
  await signIn(page, HALE, "collection");
  await expect(page.getByText("My Timepieces")).toBeVisible();
}

export async function signInDesk(page: Page) {
  await signIn(page, DESK, DESK_PASSWORD);
  await expect(page.getByText("Desk overview").or(page.getByText("Desk ·"))).toBeVisible();
}

export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
}

export async function signOutFromMenu(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign In to Your Collection" })).toBeVisible();
}
