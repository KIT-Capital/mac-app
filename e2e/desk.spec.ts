import { expect, test } from "@playwright/test";
import {
  DESK,
  DESK_PASSWORD,
  HALE,
  completeTimepieceIntakePhotos,
  openCollectorAgreements,
  openDeskAgreements,
  signIn,
  signInDesk,
  signInHale,
  signOutFromMenu,
} from "./helpers";

test.describe("desk", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
  });

  test("mail outbox requires a desk session", async ({ request }) => {
    const response = await request.get("/api/mail");
    expect(response.status()).toBe(403);
  });

  test("live-book import requires a desk session and does not change the store", async ({ request }) => {
    const response = await request.post("/api/desk/live-book-import", {
      data: { payload: { agreements: [], timepieces: [] }, commit: true, confirmLiveImport: true },
    });
    expect(response.status()).toBe(403);
  });

  test("desk pages require a desk session", async ({ request }) => {
    const response = await request.get("/admin");
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Desk session required." });
  });

  test("staff cannot see the Renew control", async ({ page }) => {
    await signIn(page, "desk@mechartcap.com", DESK_PASSWORD);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto("/admin/agreements");
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).click();
    await expect(page.getByRole("button", { name: "Renew", exact: true })).toHaveCount(0);
  });

  test("desk-only mail kinds require a desk session", async ({ request }) => {
    const response = await request.post("/api/mail", {
      data: { kind: "invite", name: "Guest", email: "guest@mac.test" },
    });
    expect(response.status()).toBe(403);
  });

  test("a forged desk cookie does not open the desk or the outbox", async ({ request }) => {
    const headers = { Cookie: "mac_desk=not-a-signed-session" };
    const admin = await request.get("/admin/mail", { headers });
    expect(admin.status()).toBe(403);
    const outbox = await request.get("/api/mail", { headers });
    expect(outbox.status()).toBe(403);
    await expect(outbox.json()).resolves.toEqual({ error: "Desk session required." });
  });

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
    await completeTimepieceIntakePhotos(page);
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

  test("Hale live row is past due and Mark signed does not change the book", async ({ page }) => {
    await signInDesk(page);
    await openDeskAgreements(page);
    const haleRow = page.getByRole("row").filter({ hasText: "Jonathan Hale" });
    await expect(haleRow.getByText("past due")).toBeVisible();
    await expect(haleRow.getByRole("button", { name: "Mark signed" })).toBeVisible();
    const openShell = page.getByRole("row").filter({ hasText: "MAC-OPEN-12" });
    await expect(openShell.getByText("Open", { exact: true })).toBeVisible();
    await expect(openShell.getByText("past due")).toHaveCount(0);
    await haleRow.getByRole("button", { name: "Mark signed" }).click();
    await expect(haleRow.getByText("signed", { exact: true })).toBeVisible();
    await expect(haleRow.getByText("past due")).toBeVisible();
  });

  test("desk records bought back and the collector chip matches", async ({ page }) => {
    await signInDesk(page);
    await openDeskAgreements(page);
    const haleRow = page.getByRole("row").filter({ hasText: "Jonathan Hale" });
    await haleRow.click();
    await page.getByLabel("End date").fill("2022-03-14");
    await page.getByLabel("Amount", { exact: true }).fill("245000");
    await page.getByRole("button", { name: "Record end" }).click();
    await expect(haleRow.getByText("bought back")).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await signInHale(page);
    await openCollectorAgreements(page);
    await expect(page.getByRole("link", { name: /MAC-31419/ }).getByText("bought back")).toBeVisible();
    await page.getByRole("link", { name: /MAC-31419/ }).click();
    await expect(page.getByText(/Book:\s*bought back/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Record end" })).toHaveCount(0);
  });

  test("desk rejects an empty end and can overwrite then clear Hale", async ({ page }) => {
    await signInDesk(page);
    await openDeskAgreements(page);
    const haleRow = page.getByRole("row").filter({ hasText: "Jonathan Hale" });
    await haleRow.click();
    await page.getByLabel("Amount", { exact: true }).fill("");
    await page.getByRole("button", { name: "Record end" }).click();
    await expect(page.getByText("Enter a dollar amount of zero or more.")).toBeVisible();
    await expect(page.getByText(/loan|paid off|vesting/i)).toHaveCount(0);
    await expect(haleRow.getByText("past due")).toBeVisible();
    await page.getByLabel("End", { exact: true }).selectOption("bought_back");
    await page.getByLabel("End date").fill("2022-03-14");
    await page.getByLabel("Amount", { exact: true }).fill("245000");
    await page.getByRole("button", { name: "Record end" }).click();
    await expect(haleRow.getByText("bought back")).toBeVisible();
    await page.getByLabel("End", { exact: true }).selectOption("in_liquidation");
    await page.getByLabel("End date").fill("2023-01-02");
    await page.getByLabel("Amount", { exact: true }).fill("180000");
    await page.getByRole("button", { name: "Overwrite end" }).click();
    await expect(haleRow.getByText("in liquidation")).toBeVisible();
    await page.getByLabel("End", { exact: true }).selectOption("liquidated");
    await page.getByLabel("End date").fill("2023-06-01");
    await page.getByLabel("Amount", { exact: true }).fill("150000");
    await page.getByRole("button", { name: "Overwrite end" }).click();
    await expect(haleRow.getByText("liquidated")).toBeVisible();
    await page.getByRole("button", { name: "Clear end" }).click();
    await expect(haleRow.getByText("past due")).toBeVisible();
  });

  test("admin renews Hale at the scheduled price and the collector sees both books", async ({ page }) => {
    await signInDesk(page);
    await openDeskAgreements(page);
    const haleRow = page.getByRole("row").filter({ hasText: "Jonathan Hale" });
    await haleRow.click();
    await page.getByRole("button", { name: "Renew" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByText("renewed")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByText("open")).toBeVisible();
    await expect(page.getByRole("button", { name: "Renew" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await signInHale(page);
    await openCollectorAgreements(page);
    await expect(page.getByRole("link", { name: /MAC-31419/ }).getByText("renewed")).toBeVisible();
    const successor = page.getByRole("link").filter({ hasText: "open" }).filter({ hasText: /MAC-/ });
    await expect(successor).toBeVisible();
    await expect(page.getByRole("button", { name: "Renew" })).toHaveCount(0);
    await successor.click();
    await expect(page.getByText(/Book:\s*open/i)).toBeVisible();
    await expect(page.getByText(/Richard Mille/)).toBeVisible();
    await expect(page.getByText(/Nautilus/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download contract PDF" })).toBeVisible();
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
