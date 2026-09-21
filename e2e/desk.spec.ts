import { expect, test } from "@playwright/test";
import { issueDeskToken } from "../lib/desk-session";
import { DEFAULT_SETTINGS } from "../lib/theme";
import {
  DESK,
  DESK_PASSWORD,
  HALE,
  addTimepieceWithPhotos,
  appraiseNewHalePiece,
  completeTimepieceIntakePhotos,
  openCollectorAgreements,
  openDeskAgreements,
  openDeskBook,
  openDeskReview,
  openMenu,
  sendForAppraisal,
  signHaleCollectorRequest,
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

  test("WhatsApp inbox requires a desk session", async ({ request }) => {
    const response = await request.get("/api/desk/whatsapp");
    expect(response.status()).toBe(403);
  });

  test("desk members list shows Hale and hides desk emails", async ({ page }) => {
    await signInDesk(page);
    await page.getByRole("link", { name: "Members" }).click();
    await expect(page.getByText("Jonathan Hale")).toBeVisible();
    await expect(page.getByText("MAC00001-21")).toBeVisible();
    await expect(page.getByText("jonathan.hale@mechartcap.com")).toBeVisible();
    await expect(page.getByText("admin@mechartcap.com")).toHaveCount(0);
    await page.getByRole("link", { name: "Repos" }).click();
    await page.getByRole("tab", { name: "Book" }).click();
    await expect(page.getByText("Jonathan Hale · MAC00001-21")).toBeVisible();
    await expect(page.getByText("Desk · Repos")).toBeVisible();
  });

  test("desk client pieces show Hale member ID and locked custody", async ({ page }) => {
    await signInDesk(page);
    await page.getByRole("link", { name: "Client Assets" }).click();
    await expect(page.getByText("MAC00001-21").first()).toBeVisible();
    await expect(page.getByText("Locked in activated repo").first()).toBeVisible();
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
    await page.getByRole("tab", { name: "Book" }).click();
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
    await openDeskBook(page);
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).first().click();
    await expect(page.getByText(/No stored document in browser mode/i)).toBeVisible();
    await expect(page.getByText(/\bofficial\b/i)).toHaveCount(0);
  });

  test("desk login opens overview and client assets", async ({ page }) => {
    await signInDesk(page);
    await expect(page.getByText("Operations analytics — not the official ledger.")).toBeVisible();
    await expect(page.getByText("$200,000")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" }).first()).toBeVisible();
    await expect(page.getByText("paid off")).toHaveCount(0);
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

  test("appraiser accepts from the queue and the collector sees a provisional value", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await sendForAppraisal(page);
    await signOutFromMenu(page);

    await signInAppraiser(page);
    await openDeskReview(page, "UR-100V");
    await page.getByRole("radio", { name: "Accept", exact: true }).check();
    // A blank Accept must never be able to record a $0 appraisal.
    await page.getByLabel("Appraisal value").fill("");
    await expect(page.getByRole("button", { name: "Decide" })).toBeDisabled();
    await page.getByLabel("Range low").fill("100000");
    await page.getByLabel("Range high").fill("140000");
    await page.getByLabel("Appraisal value").fill("150000");
    await expect(page.getByText(/above the advisory range/i)).toBeVisible();
    await page.getByRole("button", { name: "Decide" }).click();
    await expect(page.getByRole("button", { name: "Reopen decision" })).toBeVisible();
    await signOutFromMenu(page);

    await signInHale(page);
    await page.getByRole("link", { name: /UR-100V/ }).click();
    await expect(page.getByTestId("appraisal-state")).toHaveText("Accepted");
    await expect(page.getByText("$150,000")).toBeVisible();
    await expect(page.getByText(/Provisional — physical inspection required/i)).toBeVisible();
    await expect(page.getByText(/attempt 1 of 3/i)).toBeVisible();
    // An accepted piece has one action: the repo application, not a resubmission.
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply to Sell/i })).toBeVisible();

    await page.goto("/appraisal");
    await expect(page.getByText("UR-100V")).toBeVisible();
    await expect(page.getByText("$150,000")).toBeVisible();
    await expect(page.getByText(/liquidation/i)).toHaveCount(0);
    await expect(page.getByText(/loan/i)).toHaveCount(0);
  });

  test("appraiser refuses and the collector sees not accepted with the attempt count", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await sendForAppraisal(page);
    await signOutFromMenu(page);

    await signInAppraiser(page);
    await openDeskReview(page, "UR-100V");
    await page.getByRole("radio", { name: /Does not meet appraisal criteria/i }).check();
    await page.getByRole("button", { name: "Decide" }).click();
    await expect(page.getByRole("button", { name: "Reopen decision" })).toBeVisible();
    await signOutFromMenu(page);

    await signInHale(page);
    await page.getByRole("link", { name: /UR-100V/ }).click();
    await expect(page.getByTestId("appraisal-state")).toHaveText("Not accepted");
    await expect(page.getByText(/does not meet the MAC appraisal criteria/i)).toBeVisible();
    await expect(page.getByText(/attempt 1 of 3/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit details/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toBeEnabled();
  });

  test("appraiser returns a submission and the collector reads what to fix", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await sendForAppraisal(page);
    await signOutFromMenu(page);

    await signInAppraiser(page);
    await openDeskReview(page, "UR-100V");
    await page.getByLabel("What should the collector fix?").fill("Add a clearer caseback photo.");
    await page.getByRole("button", { name: "Return with note" }).click();
    await signOutFromMenu(page);

    await signInHale(page);
    await page.getByRole("link", { name: /UR-100V/ }).click();
    await expect(page.getByText(/MAC asked for a change before deciding/i)).toBeVisible();
    await expect(page.getByText("Add a clearer caseback photo.")).toBeVisible();
    // A return costs no decision, and the piece is the collector's again.
    await expect(page.getByText(/attempt \d of 3/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toBeEnabled();
  });

  test("admin opens the appraisal review read-only", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await sendForAppraisal(page);
    await signOutFromMenu(page);

    await signInDesk(page);
    await openDeskReview(page, "UR-100V");
    await expect(page.getByRole("button", { name: "Decide" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Return with note" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reopen decision" })).toHaveCount(0);
    await expect(page.getByText(/Appraiser or super admin required/i)).toBeVisible();
  });

  test("three refusals close the piece to further appraisal", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");

    for (let round = 1; round <= 3; round += 1) {
      await sendForAppraisal(page);
      await signOutFromMenu(page);
      await signInAppraiser(page);
      await openDeskReview(page, "UR-100V");
      await page.getByRole("radio", { name: /Does not meet appraisal criteria/i }).check();
      await page.getByRole("button", { name: "Decide" }).click();
      await expect(page.getByRole("button", { name: "Reopen decision" })).toBeVisible();
      await signOutFromMenu(page);
      await signInHale(page);
      await page.getByRole("link", { name: /UR-100V/ }).click();
      await expect(page.getByText(new RegExp(`attempt ${round} of 3`, "i"))).toBeVisible();
    }

    await expect(page.getByTestId("appraisal-state")).toHaveText("Closed");
    await expect(page.getByText(/Appraisal closed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toHaveCount(0);
  });

  test("admin reads appraisal numbers but cannot write them", async ({ page }) => {
    await signInDesk(page);
    await page.getByRole("link", { name: "Client Assets" }).click();
    const row = page.getByRole("row").filter({ hasText: "Royal Oak Selfwinding" });
    await expect(row.getByText("$38,000 – $48,000")).toBeVisible();
    // One-click appraisal is gone; a value is only written by deciding a submission.
    await expect(page.getByRole("button", { name: "Appraise" })).toHaveCount(0);
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
    await openDeskBook(page);
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

  test("desk confirms a request and the collector reads Your turn", async ({ page }) => {
    await appraiseNewHalePiece(page);
    await signInHale(page);
    await page.goto("/repurchase");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("With MAC", { exact: true }).first()).toBeVisible();
    await signOutFromMenu(page);

    await signInDesk(page);
    await openDeskAgreements(page);
    const request = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Confirm" }) });
    await expect(request).toHaveCount(1);
    await expect(request.getByText("Jonathan Hale")).toBeVisible();
    await expect(request.getByRole("button", { name: "Decline" })).toBeVisible();
    // A request is not on the book, so it has no book label and no Mark signed.
    await expect(request.getByRole("button", { name: "Mark signed" })).toHaveCount(0);
    await request.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("tab", { name: "Awaiting collector" }).click();
    const confirmed = page.getByRole("row").filter({ hasText: "Jonathan Hale" });
    await expect(confirmed).toHaveCount(1);
    await expect(confirmed.getByRole("button", { name: "Confirm" })).toHaveCount(0);
    await expect(page.getByText(/loan|paid off|vesting/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Log out" }).click();

    await signInHale(page);
    await openCollectorAgreements(page);
    const card = page.getByRole("link").filter({ hasText: "Your turn" });
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(page.getByText(/MAC confirmed your request/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask for less" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign Repurchase Agreement" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await page.getByLabel("Typed name").fill("Jonathan Hale");
    await page.getByText("I have read this agreement and I am signing it").click();
    await expect(page.getByLabel("Delivery method")).toHaveValue("Desk arranges intake");
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(page.getByText("Awaiting inspection.")).toBeVisible();
    await expect(page.getByText("You signed.")).toBeVisible();
    await expect(page.getByText("Desk arranges intake").first()).toBeVisible();
    await expect(page.getByText(/\b(submitted|returned|inspecting|collector_signed)\b/i)).toHaveCount(0);
  });

  test("desk records bought back and the collector chip matches", async ({ page }) => {
    await signInDesk(page);
    await openDeskBook(page);
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
    await openDeskBook(page);
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
    await openDeskBook(page);
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
    await page.getByLabel("Model").fill("e2e Catalogue");
    await page.getByLabel("Reference").fill("CB-E2E");
    await page.getByLabel("Photo source").fill("https://example.com/journe.jpg");
    const eligibility = page.getByRole("checkbox", { name: /Eligible for sale-and-repurchase/i });
    await expect(eligibility).not.toBeChecked();
    await eligibility.check();
    await page.getByRole("checkbox", { name: /Show this model to collectors/i }).check();
    await page.getByRole("button", { name: "Add Reference" }).click();
    const row = page.getByRole("row").filter({ hasText: "e2e Catalogue" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Yes", { exact: true }).first()).toBeVisible();
    await page.getByTestId("brand-retail-f-p-journe").check();
    await signOutFromMenu(page);
    await signInHale(page);
    await openMenu(page);
    await page.getByRole("link", { name: "Brands we cover" }).click();
    await expect(page.getByRole("link", { name: "F.P. Journe" })).toBeVisible();
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
    await page.getByRole("link", { name: "F.P. Journe" }).click();
    await expect(page.getByText("e2e Catalogue")).toBeVisible();
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
    await signOutFromMenu(page);
    await signInAppraiser(page);
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
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
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
    await expect(page.getByRole("radio", { name: "Mechanical Art Capital" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "MB&F" })).toBeDisabled();
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
    await expect(page.getByRole("heading", { name: "Repos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Front of the app" })).toBeVisible();
    await expect(page.getByText(/\bloan\b/i)).toHaveCount(0);
  });

  test("desk queue has no amount field and gates inspection to an appraiser", async ({ page }) => {
    await appraiseNewHalePiece(page);
    await signInHale(page);
    await page.goto("/repurchase");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("With MAC", { exact: true }).first()).toBeVisible();
    await signOutFromMenu(page);

    await signInDesk(page);
    await openDeskAgreements(page);
    await expect(page.getByRole("columnheader", { name: "Amount" })).toHaveCount(0);
    const queued = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Confirm" }) });
    await queued.getByRole("link", { name: "Open" }).click();
    await page.getByRole("textbox", { name: "Note", exact: true }).fill("This is not a loan.");
    await expect(page.getByText(/word MAC does not use/i)).toBeVisible();
    await page.getByLabel("Outcome note").fill("Phone call complete.");
    await page.getByRole("button", { name: "Flag customer success" }).click();
    await expect(page.getByText("Flagged for customer success.")).toBeVisible();
    await page.getByRole("link", { name: "Back to queue" }).click();
    await expect(page.getByRole("tab", { name: "Queue" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByText("CS", { exact: true })).toBeVisible();
    await page.getByRole("row").filter({ has: page.getByRole("button", { name: "Confirm" }) }).getByRole("button", { name: "Confirm" }).click();

    await page.getByRole("button", { name: "Log out" }).click();
    await signInHale(page);
    await openCollectorAgreements(page);
    await page.getByRole("link").filter({ hasText: "Your turn" }).click();
    await signHaleCollectorRequest(page);
    await signOutFromMenu(page);

    await signInDesk(page);
    await openDeskAgreements(page);
    await page.getByRole("tab", { name: "Awaiting intake" }).click();
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByRole("button", { name: "Record delivery" }).click();
    await page.getByRole("tab", { name: "Inspection" }).click();
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByRole("link", { name: "Open" }).click();
    await expect(page.getByText("Appraiser or super admin required").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Record inspection" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign for MAC" })).toBeDisabled();
  });

  test("appraiser inspection can drop a piece and checklist gates MAC sign", async ({ page }) => {
    test.setTimeout(240_000);
    await appraiseNewHalePiece(page, "UR-100V");
    await appraiseNewHalePiece(page, "UR-105");
    await appraiseNewHalePiece(page, "UR-111");
    await signInHale(page);
    await page.goto("/repurchase");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("With MAC", { exact: true }).first()).toBeVisible();
    await signOutFromMenu(page);

    await signInDesk(page);
    await openDeskAgreements(page);
    await page.getByRole("row").filter({ has: page.getByRole("button", { name: "Confirm" }) }).getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("button", { name: "Log out" }).click();

    await signInHale(page);
    await openCollectorAgreements(page);
    await page.getByRole("link").filter({ hasText: "Your turn" }).click();
    await signHaleCollectorRequest(page);
    await signOutFromMenu(page);

    await signInAppraiser(page);
    await openDeskAgreements(page);
    await page.getByRole("tab", { name: "Awaiting intake" }).click();
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Record delivery" }).click();
    await page.getByText("Urwerk UR-111", { exact: true }).locator("..").getByRole("radio", { name: "Drop" }).check();
    await page.getByText("Urwerk UR-100V", { exact: true }).locator("..").getByLabel("Inspected value").fill("120000");
    await page.getByText("Urwerk UR-100V", { exact: true }).locator("..").getByRole("checkbox", { name: "Serial match" }).check();
    await page.getByText("Urwerk UR-100V", { exact: true }).locator("..").getByRole("checkbox", { name: "Condition match" }).check();
    await page.getByText("Urwerk UR-105", { exact: true }).locator("..").getByLabel("Inspected value").fill("120000");
    await page.getByText("Urwerk UR-105", { exact: true }).locator("..").getByRole("checkbox", { name: "Serial match" }).check();
    await page.getByText("Urwerk UR-105", { exact: true }).locator("..").getByRole("checkbox", { name: "Condition match" }).check();
    await expect(page.getByText(/return to the collector at \$144,000/i)).toBeVisible();
    await page.getByRole("button", { name: "Record inspection" }).click();
    await expect(page.getByText(/Version 2/i)).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();

    await signInHale(page);
    await openCollectorAgreements(page);
    await page.getByRole("link").filter({ hasText: "Your turn" }).click();
    await expect(page.getByText(/MAC inspected the pieces/i).first()).toBeVisible();
    await signHaleCollectorRequest(page, "Accept the inspected amount and sign");
    await signOutFromMenu(page);

    await signInAppraiser(page);
    await openDeskAgreements(page);
    await page.getByRole("tab", { name: "Awaiting intake" }).click();
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Record delivery" }).click();
    await expect(page.getByRole("button", { name: "Sign for MAC" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Identity verified" }).check();
    await page.getByRole("checkbox", { name: "Serials match" }).check();
    await page.getByRole("checkbox", { name: "Condition matches" }).check();
    await page.getByRole("checkbox", { name: "Term agreed" }).check();
    await page.getByRole("checkbox", { name: "In MAC custody" }).check();
    await page.getByLabel("Payment reference").fill("ABC-WIRE-1");
    await page.getByLabel("Typed name").fill("Dov Tuzman");
    await page.getByRole("button", { name: "Sign for MAC" }).click();
    await page.getByRole("link", { name: "Back to queue" }).click();
    await page.getByRole("tab", { name: "Book" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Jonathan Hale" }).getByText("open", { exact: true })).toBeVisible();
  });
});
