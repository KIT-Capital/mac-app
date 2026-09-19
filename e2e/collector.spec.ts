import { expect, test } from "@playwright/test";
import { HALE, appraiseHaleRoyalOak, completeTimepieceIntakePhotos, openCollectorAgreements, openMenu, signIn, signInHale, signOutFromMenu } from "./helpers";

test.describe("collector app", () => {
  test("splash shows the official lockup and collector actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: /Mechanical Art Capital/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /Mechanical Art Capital/i })).toHaveAttribute(
      "src",
      /logo-ff(-on-dark)?\.svg/,
    );
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByText(/Unbiased/i)).toBeVisible();
    await expect(page.getByText(/loan/i)).toHaveCount(0);
    await expect(page.getByText(/Get Estimate/i)).toHaveCount(0);
  });

  test("phone preview stages the splash on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?view=phone");
    await expect(page.getByText(/Phone preview/i)).toBeVisible();
    await expect(page.locator("[data-device='phone']")).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  });

  test("collector sign-in uses email only and desk credentials stay hidden", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email Address")).toHaveValue("");
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.getByText(/continue with google|continue with apple/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();

    await page.getByRole("button", { name: "MAC desk staff" }).click();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("an unusable verification link shows one safe retry path", async ({ page }) => {
    const response = await page.goto("/verify?state=invalid");
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByText(/could not be used/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/login",
    );
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("live collector login and signup stop at the email sent state", async ({ page }) => {
    await page.route("**/api/collector-session", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, mode: "live", accepted: true }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email Address").fill("known@example.com");
    await page.getByRole("button", { name: "Send sign-in link" }).click();
    await expect(page.getByText(/lasts 15 minutes and works once/i)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Ada Locke");
    await page.getByLabel("Email Address").fill("ada@example.com");
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/check your email to verify/i)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /already registered/i })).toBeVisible();
  });

  test("Hale collection shows demo pieces and photographs", async ({ page }) => {
    await signInHale(page);
    await expect(page.getByText("Richard Mille")).toBeVisible();
    await expect(page.getByText("Nautilus")).toBeVisible();
    await expect(page.getByText("Royal Oak Selfwinding")).toBeVisible();
    await expect(page.getByText("Logical One")).toBeVisible();
    await expect(page.getByRole("img", { name: /Richard Mille|Nautilus|Royal Oak|Logical One/ }).first()).toBeVisible();
  });

  test("a leftover saved user on this device still opens splash", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "mac-app-state-v3",
        JSON.stringify({
          hydrated: true,
          user: {
            email: "jonathan.hale@mechartcap.com",
            name: "Jonathan Hale",
            role: "collector",
            onboardingComplete: true,
          },
          timepieces: [],
          agreements: [],
          profiles: {},
        }),
      );
    });
    await page.goto("/");
    await expect(page.getByRole("img", { name: /Mechanical Art Capital/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Timepieces" })).toHaveCount(0);
  });

  test("a new tab always starts at splash, then Sign In recovers Hale's pieces", async ({ context, page }) => {
    await signInHale(page);
    const stored = await page.evaluate(() => localStorage.getItem("mac-app-state-v3"));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).user).toBeNull();
    const fresh = await context.newPage();
    await fresh.goto("/");
    await expect(fresh.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(fresh.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(fresh.getByRole("heading", { name: "My Timepieces" })).toHaveCount(0);
    await signInHale(fresh);
    await expect(fresh.getByText("Richard Mille")).toBeVisible();
    await fresh.close();
  });

  test("requesting appraisal sends the piece to reviewing", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Logical One/ }).click();
    await page.getByRole("button", { name: "Request Certified Appraisal" }).click();
    await expect(page.getByText(/Desk specialists are reviewing/i)).toBeVisible();
  });

  test("saving a timepiece without photos asks for the guided shots", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: "Add a timepiece" }).click();
    await expect(page.getByText(/right side of the barrel/i)).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Add a photo of the front of the timepiece/i)).toBeVisible();
    await expect(page).toHaveURL(/\/collection\/add/);
  });

  test("promo HOUSE65 persists after navigation", async ({ page }) => {
    await signInHale(page);
    await page.goto("/profile/promo");
    await page.getByLabel("Promo Code").fill("HOUSE65");
    await page.getByRole("button", { name: "Apply Code" }).click();
    await expect(page.getByText("HOUSE65")).toBeVisible();
    await page.goto("/collection");
    await page.goto("/profile/promo");
    await expect(page.getByText("Applied", { exact: true })).toBeVisible();
    await expect(page.getByText("HOUSE65", { exact: true })).toBeVisible();
  });

  test("contact shows custody only after an application", async ({ page }) => {
    await signInHale(page);
    await page.goto("/contact");
    await expect(page.getByText(/By appointment only/i)).toBeVisible();
  });

  test("new collector starts empty and does not see the vault", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Ada Locke");
    await page.getByLabel("Email Address").fill(`ada.locke.${Date.now()}@example.com`);
    await page.getByLabel("Direct Phone Number").fill("+1 (212) 555-0199");
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Welcome to Mechanical Art Capital")).toBeVisible();
    await page.getByRole("link", { name: "Add First Timepiece" }).click();
    await completeTimepieceIntakePhotos(page);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Enter Collection" }).click();
    await expect(page.getByRole("heading", { name: "My Timepieces" })).toBeVisible();
    await expect(page.getByText("Royal Oak Selfwinding")).toBeVisible();
    await expect(page.getByText("Richard Mille")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Timepieces" })).toBeVisible();
    await expect(page.getByText("Richard Mille")).toHaveCount(0);
    await page.goto("/contact");
    await expect(page.getByText(/By appointment only/i)).toHaveCount(0);
    await page.getByLabel("Your Name").fill("Ada Locke");
    await page.getByLabel("Direct Email").fill(`ada.locke.${Date.now()}@example.com`);
    await page.getByPlaceholder("Timepieces you may wish to sell").fill("Considering a steel Royal Oak.");
    await page.getByRole("button", { name: "Send Inquiry" }).click();
    await expect(page.getByText("Inquiry Received")).toBeVisible();
    await expect(page.getByText(/By appointment only/i)).toBeVisible();
  });

  test("signup rejects reserved desk emails", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Desk Pretender");
    await page.getByLabel("Email Address").fill("admin@mechartcap.com");
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("That address is reserved.")).toBeVisible();
  });

  test("preferences toggle appearance and notices", async ({ page }) => {
    await signInHale(page);
    await page.goto("/profile/preferences");
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("[data-appearance='light']")).toHaveCount(1);
    await page.getByRole("button", { name: "Push notices" }).click();
    await page.getByRole("button", { name: "phone" }).click();
    await page.goto("/collection");
    await page.goto("/profile/preferences");
    await expect(page.locator("[data-appearance='light']")).toHaveCount(1);
  });

  test("membership subscribe and pause", async ({ page }) => {
    await signInHale(page);
    await page.goto("/profile/membership");
    await page.getByRole("button", { name: "Subscribe to Monthly Appraisals" }).click();
    await expect(page.getByText(/active Premium Member/i)).toBeVisible();
    await page.getByRole("button", { name: "Pause Membership" }).click();
    await expect(page.getByRole("button", { name: "Subscribe to Monthly Appraisals" })).toBeVisible();
  });

  test("Hale cannot start a second live repo with pieces already on the past-due book", async ({ page }) => {
    await signInHale(page);
    await page.goto("/repurchase");
    await expect(page.getByText(/Appraise a timepiece in your collection to send an application/i)).toBeVisible();
    await page.goto("/collection/rm-011");
    await expect(page.getByText(/already on a live repo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply to Sell/i })).toHaveCount(0);
  });

  test("repurchase application is in dollars and creates a signable agreement", async ({ page }) => {
    await signInHale(page);
    await signOutFromMenu(page);
    await appraiseHaleRoyalOak(page);
    await signInHale(page);
    await page.goto("/repurchase");
    await expect(page.getByText(/Enter Amount Up to/i)).toBeVisible();
    await expect(page.getByText(/%/)).toHaveCount(0);
    await page.getByLabel(/Enter Amount/).fill("20000");
    await page.getByText("I confirm that I am at least 18 years old").click();
    await page.getByRole("button", { name: "Send Application" }).click();
    await expect(page.getByRole("heading", { name: "Repurchase Agreement", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review Terms" }).click();
    await page.getByRole("button", { name: "Sign Repurchase Agreement" }).click();
    await expect(page.getByRole("button", { name: "Executed & Verified" })).toBeVisible();
  });

  test("first live application uses term-specific server purchase caps without disclosing terms", async ({ page }) => {
    const email = "first.application@example.com";
    await page.route("**/api/live-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "collector", email, customerId: "cust-first" },
          book: {
            timepieces: [{
              id: "piece-first",
              ownerEmail: email,
              brand: "Vacheron Constantin",
              model: "Overseas",
              images: [],
              status: "appraised",
              valueLow: 100_000,
              valueHigh: 120_000,
              financeable: true,
              condition: "Excellent",
              boxPapers: "Box and papers",
              caseMetal: "Steel",
              caseType: "Round",
              caseDiameter: "41mm",
              dialColor: "Blue",
              buckle: "Folding clasp",
              band: "bracelet",
              bandMaterial: "Steel",
              complication: "Date",
            }],
            agreements: [],
            users: [],
            photos: [],
            profiles: {
              [email]: {
                name: "First Applicant",
                email,
                phone: "",
                member: false,
                avatar: "",
                role: "collector",
                onboardingComplete: true,
                applicationSubmitted: false,
                preferences: {},
              },
            },
            catalog: [],
            shells: [],
            settings: { maxLtv: 0.6, typicalTerm: 9, vaultLocation: "" },
            applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
          },
        }),
      });
    });

    await page.goto("/repurchase");
    await expect(page.getByText("Enter Amount Up to $45,000")).toBeVisible();
    await page.getByLabel("Term (months)").selectOption("12");
    await expect(page.getByText("Enter Amount Up to $55,000")).toBeVisible();
    await expect(page.getByText(/%|Server Vault|setup fee|repurchase window/i)).toHaveCount(0);
  });

  test("partners lists maison names and burger opens collector destinations", async ({ page }) => {
    await signInHale(page);
    await openMenu(page);
    await expect(page.getByRole("link", { name: "Repurchase" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Desk" })).toHaveCount(0);
    await page.getByRole("link", { name: "Partners" }).click();
    await expect(page.getByText("MB&F")).toBeVisible();
    await expect(page.getByText("Richard Mille")).toBeVisible();
  });

  test("collectors cannot open the desk", async ({ page }) => {
    await signIn(page, HALE, "collection");
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByText("Desk overview")).toHaveCount(0);
    await expect(page.getByText("Desk session required.")).toBeVisible();
  });

  test("signing out and back in as Hale keeps a newly added piece", async ({ page }) => {
    await signInHale(page);
    await page.goto("/collection/add");
    await page.getByRole("button", { name: /Missing a brand/i }).click();
    await page.getByPlaceholder("Manufacturer name").fill("De Bethune");
    await page.getByLabel(/Your Model/).fill("DB28");
    await completeTimepieceIntakePhotos(page);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "DB28" })).toBeVisible();
    await signOutFromMenu(page);
    await signInHale(page);
    await expect(page.getByText("DB28")).toBeVisible();
  });

  test("Hale repo book chip is past due and stays past due after Sign", async ({ page }) => {
    await signInHale(page);
    await openCollectorAgreements(page);
    const haleCard = page.getByRole("link", { name: /MAC-31419/ });
    await expect(haleCard.getByText("past due")).toBeVisible();
    await expect(page.getByText(/loan|paid off|vesting/i)).toHaveCount(0);
    await haleCard.click();
    await expect(page.getByText(/Book:\s*past due/i)).toBeVisible();
    await page.getByRole("button", { name: "Review Terms" }).click();
    await page.getByRole("button", { name: "Sign Repurchase Agreement" }).click();
    await expect(page.getByRole("button", { name: "Executed & Verified" })).toBeVisible();
    await expect(page.getByText(/Book:\s*past due/i)).toBeVisible();
    await page.goto("/agreements");
    await expect(page.getByRole("link", { name: /MAC-31419/ }).getByText("past due")).toBeVisible();
  });

  test("Hale agreement preview is pending counsel and is not a stored document", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await signInHale(page);
    await openCollectorAgreements(page);
    await page.getByRole("link", { name: /MAC-31419/ }).click();
    await expect(page.getByText(/pending legal approval/i).first()).toBeVisible();
    await expect(page.getByText(/not for signature/i).first()).toBeVisible();
    await expect(page.getByText(/not a loan/i)).toBeVisible();
    await expect(page.getByText(/\bstored document\b/i)).toHaveCount(0);
    await expect(page.getByText(/\bofficial\b/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download contract PDF" })).toBeVisible();
    await expect(page.getByText(/Temporary preview — not stored/i)).toBeVisible();
    await expect(page.getByText(/Electronic signing is not available/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Email me/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Email this address/i })).toHaveCount(0);
  });

  test("new collector agreements list keeps the empty sale-and-repurchase copy", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Ada Locke");
    await page.getByLabel("Email Address").fill(`ada.book.${Date.now()}@example.com`);
    await page.getByLabel("Direct Phone Number").fill("+1 (212) 555-0199");
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.goto("/agreements");
    await expect(page.getByText("No sale-and-repurchase agreements on file yet.")).toBeVisible();
  });

  test("legacy financing routes open repurchase", async ({ page }) => {
    await signInHale(page);
    await page.goto("/financing");
    await expect(page).toHaveURL(/\/repurchase/);
    await expect(page.getByRole("heading", { name: "Sale & Repurchase" })).toBeVisible();
  });
});

test.describe("collector layouts", () => {
  test("desktop shows the collector bar and no device frame", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInHale(page);
    await expect(page.getByRole("navigation", { name: "Collector" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
    await expect(page.locator(".mac-desk-screen")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Timepieces" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Sign In to Your Collection" })).toBeVisible();
  });

  test("collector guide is sale-and-repurchase and stays off the top tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInHale(page);
    const bar = page.getByRole("navigation", { name: "Collector" });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link")).toHaveCount(5);
    await expect(bar.getByRole("link", { name: "How MAC works" })).toHaveCount(0);
    await page.setViewportSize({ width: 480, height: 1100 });
    await openMenu(page);
    await page.getByRole("link", { name: "How MAC works" }).click();
    await expect(page.getByRole("heading", { name: "How MAC works" }).first()).toBeVisible();
    await expect(page.getByText(/sale and repurchase/i)).toBeVisible();
    await expect(page.getByText(/loan/i)).toHaveCount(0);
    await expect(page.getByText(/Get Estimate/i)).toHaveCount(0);
    await expect(page.getByText(/Manhattan/i)).toHaveCount(0);
  });

  test("new collectors can open the guide during setup", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Guide Reader");
    await page.getByLabel("Email Address").fill(`guide.reader.${Date.now()}@example.com`);
    await page.getByLabel("Direct Phone Number").fill("+1 (212) 555-0199");
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/collection\/setup/);
    await page.getByRole("link", { name: "How MAC works" }).click();
    await expect(page).toHaveURL(/\/guide/);
    await expect(page.getByText(/sale and repurchase/i)).toBeVisible();
    await page.getByRole("link", { name: "Back" }).first().click();
    await expect(page).toHaveURL(/\/collection\/setup/);
  });

  test("iPad shows the collector bar and a wider vault", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await signInHale(page);
    await expect(page.getByRole("navigation", { name: "Collector" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a timepiece" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});
