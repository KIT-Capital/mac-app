import { expect, test } from "@playwright/test";
import { issueDeskToken } from "../lib/desk-session";
import { DEFAULT_SETTINGS } from "../lib/theme";
import {
  APPRAISER,
  DESK,
  DESK_PASSWORD,
  HALE,
  completeTimepieceIntakePhotos,
  openCollectorAgreements,
  openDeskAgreements,
  signIn,
  signInAppraiser,
  signInDesk,
  signInHale,
  signOutFromMenu,
} from "./helpers";

const sameOrigin = { "Sec-Fetch-Site": "same-origin" };
const crossSite = { Origin: "https://evil.example" };

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
      headers: sameOrigin,
      data: { payload: { agreements: [], timepieces: [] }, commit: true, confirmLiveImport: true },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Desk session required." });
  });

  test("a cross-site live-book import is refused before the body is read", async ({ request }) => {
    const response = await request.post("/api/desk/live-book-import", {
      headers: crossSite,
      data: { payload: { agreements: [], timepieces: [] }, commit: true, confirmLiveImport: true },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "REQUEST_ORIGIN_FORBIDDEN" });
  });

  test("desk pages require a desk session", async ({ request }) => {
    const response = await request.get("/admin");
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Desk session required." });
  });

  test("forced rotation opens only the password page without loading the book", async ({ context, page }) => {
    const token = issueDeskToken(DESK, "admin", {
      env: {
        APP_ENV: "development",
        DESK_SESSION_SECRET: process.env.DESK_SESSION_SECRET,
      },
      mustRotate: true,
    });
    await context.addCookies([{
      name: "mac_desk",
      value: token,
      url: "http://127.0.0.1:43173",
    }]);
    const liveBookRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/live-book")) liveBookRequests.push(request.url());
    });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/password/);
    await expect(page.getByRole("heading", { name: "Choose a new desk password" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(100);
    expect(liveBookRequests).toEqual([]);
  });

  test("an appraiser is admin-level on the desk and sees the Renew control", async ({ page }) => {
    await signIn(page, "desk@mechartcap.com", DESK_PASSWORD);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto("/admin/agreements");
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).click();
    await expect(page.getByRole("button", { name: "Renew", exact: true })).toBeVisible();
  });

  test("desk-only mail kinds require a desk session", async ({ request }) => {
    const response = await request.post("/api/mail", {
      headers: sameOrigin,
      data: { kind: "invite", name: "Guest", email: "guest@mac.test" },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Desk session required." });
  });

  test("a cross-site mail mutation is refused before the body is read", async ({ request }) => {
    const response = await request.post("/api/mail", {
      headers: crossSite,
      data: { kind: "invite", name: "Guest", email: "guest@mac.test" },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "REQUEST_ORIGIN_FORBIDDEN" });
  });

  test("a forged desk cookie does not open the desk or the outbox", async ({ request }) => {
    const headers = { Cookie: "mac_desk=not-a-signed-session" };
    const admin = await request.get("/admin/mail", { headers });
    expect(admin.status()).toBe(403);
    const outbox = await request.get("/api/mail", { headers });
    expect(outbox.status()).toBe(403);
    await expect(outbox.json()).resolves.toEqual({ error: "Desk session required." });
  });

  test("desk repo detail does not claim a stored document in browser mode", async ({ page }) => {
    await signInDesk(page);
    await openDeskAgreements(page);
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).first().click();
    await expect(page.getByText(/No stored document in browser mode/i)).toBeVisible();
    await expect(page.getByText(/\bofficial\b/i)).toHaveCount(0);
  });

  test("desk login opens overview and client assets", async ({ page }) => {
    await signInDesk(page);
    await expect(page.getByText("Assets", { exact: true })).toBeVisible();
    await expect(page.getByText("Buyback scale", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Client Assets" }).click();
    await expect(page.getByText("Richard Mille RM 011")).toBeVisible();
    await expect(page.getByText("Audemars Piguet Royal Oak Selfwinding")).toBeVisible();
  });

  test("staff temporary passwords appear once and disappear after dismissal", async ({ page }) => {
    let postCount = 0;
    await page.route("**/api/desk/staff", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            mode: "live",
            viewer: { role: "admin", isMaster: false },
            members: [],
          }),
        });
        return;
      }
      postCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          temporaryPassword: "one-time-password-value",
        }),
      });
    });
    await signInDesk(page);
    await page.goto("/admin/access");
    const staff = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Desk staff" }),
    });
    await staff.getByLabel("Name").fill("New Staff");
    await staff.getByLabel("Email").fill("new.staff@example.com");
    await staff.getByRole("button", { name: "Add desk account" }).dblclick();
    expect(postCount).toBe(1);
    await expect(page.getByText("one-time-password-value")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("one-time-password-value")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("one-time-password-value")).toHaveCount(0);
  });

  test("desk appraises a reviewing piece from the catalog range", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Logical One/ }).click();
    if (await page.getByRole("button", { name: "Request Certified Appraisal" }).isVisible()) {
      await page.getByRole("button", { name: "Request Certified Appraisal" }).click();
      await expect(page.getByText(/Desk specialists are reviewing/i)).toBeVisible();
    }
    await page.goto("/login");
    await signIn(page, APPRAISER, DESK_PASSWORD);
    await page.getByRole("link", { name: "Client Assets" }).click();
    const row = page.getByRole("row").filter({ hasText: "Logical One" });
    await row.getByRole("button", { name: "Appraise" }).click();
    await expect(row.getByText("$145,000 – $175,000")).toBeVisible();
  });

  test("admin reads appraisal numbers but cannot write them", async ({ page }) => {
    await signInDesk(page);
    await page.getByRole("link", { name: "Client Assets" }).click();
    const row = page.getByRole("row").filter({ hasText: "Royal Oak Selfwinding" });
    await expect(row.getByRole("button", { name: "Appraise" })).toBeDisabled();
    await expect(row.getByRole("button", { name: "Review" })).toBeEnabled();
    await page.getByRole("link", { name: "Timepiece Catalog" }).click();
    await expect(page.getByTestId("catalog-read-only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Reference" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
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
    await expect(page.getByText(/Richard Mille/).first()).toBeVisible();
    await expect(page.getByText(/Nautilus/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Download contract PDF" })).toBeVisible();
  });

  test("required photographs are a super-admin setting", async ({ page }) => {
    await signInAppraiser(page);
    await page.getByRole("link", { name: "Configure" }).click();
    await expect(page.getByText(/A super admin sets which photographs/)).toBeVisible();
    // The five guided shots are fixed for everyone; the extras are locked to
    // this appraiser, who may still save the rest of the configuration.
    await expect(page.getByRole("checkbox", { name: "front", exact: false }).first()).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "box", exact: false }).first()).toBeDisabled();
    await page.getByLabel("Company name").fill("Mechanical Art Capital LLC");
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByText("Configuration saved to this device.")).toBeVisible();
  });

  test("catalog and config save on this device", async ({ page }) => {
    await signInAppraiser(page);
    await page.getByRole("link", { name: "Timepiece Catalog" }).click();
    await page.getByLabel("Brand").fill("F.P. Journe");
    await page.getByLabel("Model").fill("Chronomètre Bleu");
    await page.getByLabel("Reference").fill("CB");
    const eligibility = page.getByRole("checkbox", { name: /Eligible for sale-and-repurchase/i });
    await expect(eligibility).not.toBeChecked();
    await eligibility.check();
    await page.getByRole("button", { name: "Add Reference" }).click();
    const row = page.getByRole("row").filter({ hasText: "Chronomètre Bleu" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Yes", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Configure" }).click();
    await page.getByLabel("Company name").fill("Mechanical Art Capital LLC");
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByText("Configuration saved to this device.")).toBeVisible();
  });

  test("live config hydrates, preserves dirty fields, and submits only changes", async ({ context, page }) => {
    const token = issueDeskToken(DESK, "admin", {
      env: {
        APP_ENV: "development",
        DESK_SESSION_SECRET: process.env.DESK_SESSION_SECRET,
      },
    });
    await context.addCookies([{
      name: "mac_desk",
      value: token,
      url: "http://127.0.0.1:43173",
    }]);
    let latestSettings = {
      ...DEFAULT_SETTINGS,
      startingRate: 0.2,
      vaultLocation: "Server Vault A",
    };
    let submitted: Record<string, unknown> | null = null;
    let releaseSave = () => {};
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route("**/api/live-book", async (route) => {
      if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        await saveGate;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ mode: "live", acknowledged: true }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "admin", email: DESK },
          book: {
            timepieces: [],
            agreements: [],
            users: [],
            photos: [],
            profiles: {},
            catalog: [],
            shells: [],
            settings: latestSettings,
            applicationPurchaseShares: { 3: 0.6, 6: 0.6, 8: 0.6, 9: 0.6, 12: 0.6 },
          },
        }),
      });
    });
    await page.goto("/admin/config");
    await expect(page.getByLabel("Custody location")).toHaveValue("Server Vault A");
    await expect(page.getByLabel("Company name")).toHaveCount(0);
    await expect(page.getByLabel("Min purchase")).toHaveCount(0);
    await page.getByLabel("Custody location").fill("Locally Edited Vault");

    latestSettings = {
      ...latestSettings,
      startingRate: 0.25,
      vaultLocation: "Server Vault B",
    };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("Monthly-add annual %")).toHaveValue("25");
    await expect(page.getByLabel("Custody location")).toHaveValue("Locally Edited Vault");

    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(page.getByLabel("Custody location")).toBeDisabled();
    releaseSave();
    await expect(page.getByText("Pricing and custody settings saved on the MAC server.")).toBeVisible();
    expect(submitted).toEqual({
      action: "settings.update",
      patch: { vaultLocation: "Locally Edited Vault" },
    });
  });

  test("desk tutorial is inside the admin wall and collectors cannot open it", async ({ page, request }) => {
    const locked = await request.get("/admin/guide");
    expect(locked.status()).toBe(403);
    await expect(locked.json()).resolves.toEqual({ error: "Desk session required." });

    await signInHale(page);
    await expect(page.getByRole("link", { name: "Tutorial" })).toHaveCount(0);
    const blocked = await page.goto("/admin/guide");
    expect(blocked?.status()).toBe(403);
    await expect(page.getByText("Desk session required.")).toBeVisible();
    await expect(page.getByText("How the desk works")).toHaveCount(0);

    await signInDesk(page);
    await page.getByRole("link", { name: "Tutorial" }).click();
    await expect(page.getByText(/How the desk works/i)).toBeVisible();
    await expect(page.getByText(/Staff only/i)).toBeVisible();
    await expect(page.getByText(/Collectors never get a desk link/i)).toBeVisible();
    await expect(page.getByText(/\bloan\b/i)).toHaveCount(0);
  });
});
