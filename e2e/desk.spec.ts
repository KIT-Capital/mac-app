import { expect, test } from "@playwright/test";
import { DESK, DESK_PASSWORD, HALE, signIn, signInDesk, signInHale, signOutFromMenu } from "./helpers";

test.describe("desk", () => {
  test("desk login opens overview and client assets", async ({ page }) => {
    await signInDesk(page);
    await expect(page.getByText("Assets", { exact: true })).toBeVisible();
    await expect(page.getByText("Buyback scale", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Client Assets" }).click();
    await expect(page.getByText("Richard Mille RM 011")).toBeVisible();
    await expect(page.getByText("Audemars Piguet Royal Oak Selfwinding")).toBeVisible();
  });

  test("desk appraises a reviewing piece from the catalog range", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Logical One/ }).click();
    if (await page.getByRole("button", { name: "Request Certified Appraisal" }).isVisible()) {
      await page.getByRole("button", { name: "Request Certified Appraisal" }).click();
      await expect(page.getByText(/Desk specialists are reviewing/i)).toBeVisible();
    }
    await page.goto("/login");
    await signIn(page, DESK, DESK_PASSWORD);
    await page.getByRole("link", { name: "Client Assets" }).click();
    const row = page.getByRole("row").filter({ hasText: "Logical One" });
    await row.getByRole("button", { name: "Appraise" }).click();
    await expect(row.getByText("$145,000 – $175,000")).toBeVisible();
  });

  test("desk sees a collector piece added in the same session", async ({ page }) => {
    await signInHale(page);
    await page.goto("/collection/add");
    await page.getByRole("button", { name: /Missing a brand/i }).click();
    await page.getByPlaceholder("Manufacturer name").fill("Urwerk");
    await page.getByLabel(/Your Model/).fill("UR-100V");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "UR-100V" })).toBeVisible();
    await signOutFromMenu(page);
    await signInDesk(page);
    await page.getByRole("link", { name: "Client Assets" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Urwerk UR-100V" })).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Urwerk UR-100V" }).getByText(/not evaluated/i).first(),
    ).toBeVisible();
  });

  test("outbound mail lists collector inquiries", async ({ page }) => {
    await signInHale(page);
    await page.goto("/contact");
    await page.getByPlaceholder("Timepieces you may wish to sell").fill("Checking intake for a Nautilus.");
    await page.getByRole("button", { name: "Send Inquiry" }).click();
    await expect(page.getByText("Inquiry Received")).toBeVisible();
    await signOutFromMenu(page);
    await signInDesk(page);
    await page.getByRole("link", { name: "Outbound Mail" }).click();
    await expect(page.getByText(/Preview mode|Resend is live/i)).toBeVisible();
    await expect(page.getByRole("cell", { name: "inquiry" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: HALE }).first()).toBeVisible();
  });

  test("catalog and config save on this device", async ({ page }) => {
    await signInDesk(page);
    await page.getByRole("link", { name: "Timepiece Catalog" }).click();
    await page.getByLabel("Brand").fill("F.P. Journe");
    await page.getByLabel("Model").fill("Chronomètre Bleu");
    await page.getByLabel("Reference").fill("CB");
    await page.getByRole("button", { name: "Add Reference" }).click();
    await expect(page.getByText("Chronomètre Bleu")).toBeVisible();
    await page.getByRole("link", { name: "Configure" }).click();
    await page.getByLabel("Company name").fill("Mechanical Art Capital LLC");
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByText("Configuration saved to this device.")).toBeVisible();
  });
});
