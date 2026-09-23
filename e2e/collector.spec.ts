import { expect, test } from "@playwright/test";
import { HALE, addTimepieceWithPhotos, appraiseNewHalePiece, completeTimepieceIntakePhotos, openCollectorAgreements, openDeskBook, openMenu, sendForAppraisal, signIn, signInDesk, signInHale, signOutFromMenu } from "./helpers";

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

  test("collector sign-in asks for a code and keeps the password on the staff page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email Address")).toHaveValue("");
    await expect(page.getByLabel("Sign-in code")).toBeVisible();
    await expect(page.locator("#login-password")).toHaveCount(0);
    await expect(page.getByText(/continue with google|continue with apple/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "MAC desk staff" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Staff" })).toHaveAttribute("href", "/login/staff");
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use phone" })).toBeVisible();
    await page.getByRole("button", { name: "Use phone" }).click();
    await expect(page.getByLabel("Phone Number")).toBeVisible();
    await expect(page.getByLabel("Email Address")).toHaveCount(0);
    await expect(page.locator("#login-password")).toHaveCount(0);
    await expect(page.getByLabel("Sign-in code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use email" })).toBeVisible();

    await page.goto("/login/staff");
    await expect(page.getByRole("heading", { name: "Staff sign-in" })).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByText(/Desk only/i)).toHaveCount(0);
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
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText(/lasts 15 minutes and works once/i)).toBeVisible();
    await expect(page.getByLabel("Sign-in code")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

    await page.getByRole("button", { name: "Use phone" }).click();
    await page.getByLabel("Phone Number").fill("212 555 0100");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText(/check your phone for a sign-in code/i)).toBeVisible();
    await expect(page.getByLabel("Sign-in code")).toBeVisible();

    await page.goto("/signup");
    await page.getByLabel("Full Legal Name").fill("Ada Locke");
    await page.getByLabel("Email Address").fill("ada@example.com");
    await expect(page.getByText("Watch business")).toBeVisible();
    await page.getByRole("radio", { name: /Watch business/i }).check();
    await page.getByRole("checkbox", { name: /at least 18 years old/i }).check();
    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/check your email for a sign-in code/i)).toBeVisible();
    await expect(page.getByLabel("Sign-in code")).toBeVisible();
    await expect(page.getByRole("link", { name: /already registered/i })).toBeVisible();

    await page.route("**/api/collector-session/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, redirect: "/collection" }),
      });
    });
    await page.getByLabel("Sign-in code").fill("424242");
    await page.getByRole("button", { name: "Confirm code" }).click();
    await expect(page).toHaveURL(/\/collection$/);
  });

  test("Hale collection shows demo pieces and photographs", async ({ page }) => {
    await signInHale(page);
    await expect(page.getByText("Richard Mille")).toBeVisible();
    await expect(page.getByText("Nautilus")).toBeVisible();
    await expect(page.getByText("Royal Oak Selfwinding")).toBeVisible();
    await expect(page.getByText("Logical One")).toBeVisible();
    await expect(page.getByText("In an activated repo").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Richard Mille|Nautilus|Royal Oak|Logical One/ }).first()).toBeVisible();
  });

  test("Hale profile and repo show the MAC member ID", async ({ page }) => {
    await signInHale(page);
    await page.goto("/profile");
    await expect(page.getByText("Member MAC00001-21")).toBeVisible();
    await page.goto("/agreements/agr-31419");
    await expect(page.getByText("Member MAC00001-21")).toBeVisible();
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
    const stored = await page.evaluate(() => localStorage.getItem("mac-app-state-v4"));
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

  test("sending a piece for appraisal shows With MAC and locks the piece", async ({ page }) => {
    await signInHale(page);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await expect(page.getByTestId("appraisal-state")).toHaveText("Not sent");
    await expect(page.getByText(/attempt \d of 3/i)).toHaveCount(0);

    await sendForAppraisal(page, "Serviced last spring.");

    await expect(page.getByRole("button", { name: "Send for appraisal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Edit details/i })).toBeDisabled();
    await expect(page.getByText(/attempt \d of 3/i)).toHaveCount(0);
    await expect(page.getByText(/reviewing|under review/i)).toHaveCount(0);
  });

  test("a piece missing a guided photo names the shot instead of failing", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Logical One/ }).click();
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toBeDisabled();
    await expect(page.getByText(/a photo of the back of the timepiece/i)).toBeVisible();
    await expect(page.getByText(/a photo of the clasp or band/i)).toBeVisible();
  });

  test("a legacy reviewing piece is not stranded on a review that never existed", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Royal Oak Selfwinding/ }).click();
    await expect(page.getByTestId("appraisal-state")).toHaveText("Not sent");
    await expect(page.getByRole("button", { name: /Edit details/i })).toBeEnabled();
  });

  test("intake records the piece without sending it to MAC", async ({ page }) => {
    await signInHale(page);
    await page.goto("/collection/add");
    // Submitting is a separate, evidence-freezing step on the detail screen.
    await expect(page.getByRole("button", { name: "Appraise" })).toHaveCount(0);
    await addTimepieceWithPhotos(page, "Urwerk", "UR-100V");
    await expect(page.getByTestId("appraisal-state")).toHaveText("Not sent");
    await expect(page.getByRole("button", { name: "Send for appraisal" })).toBeEnabled();
  });

  test("saving a timepiece without photos asks for the guided shots", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: "Add a timepiece" }).click();
    await expect(page.getByText(/right side of the barrel/i)).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Add a photo of the front of the timepiece/i)).toBeVisible();
    await expect(page).toHaveURL(/\/collection\/add/);
  });

  test("live intake validates required inputs before creating a timepiece", async ({ page }) => {
    const email = "photo-preflight@example.com";
    let mutations = 0;
    await signInHale(page);
    await page.route("**/api/live-book", async (route) => {
      if (route.request().method() === "POST") mutations += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(route.request().method() === "POST"
          ? { mode: "live", acknowledged: true }
          : {
              mode: "live",
              viewer: { role: "collector", email, customerId: "cust-photo-preflight" },
              book: {
                timepieces: [],
                agreements: [],
                users: [],
                photos: [],
                appraisalAttempts: [],
                appraisalAttemptPhotos: [],
                profiles: {
                  [email]: {
                    name: "Photo Preflight",
                    email,
                    phone: "",
                    member: false,
                    avatar: "",
                    role: "collector",
                    onboardingComplete: true,
                    preferences: {},
                  },
                },
                catalog: [],
                shells: [],
                settings: { requiredPhotoKinds: ["front", "back", "left", "right", "clasp"] },
                applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
              },
            }),
      });
    });

    const liveRead = page.waitForResponse((response) =>
      response.url().includes("/api/live-book") && response.request().method() === "GET",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await liveRead;
    await expect(page.getByText("Richard Mille")).toHaveCount(0);
    await page.getByRole("link", { name: "Add a timepiece" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Add a photo of the front of the timepiece/i)).toBeVisible();
    expect(mutations).toBe(0);
  });

  test("live intake uploads and confirms every required photo before saving", async ({ page }) => {
    const email = "photo-success@example.com";
    const operations: Array<{ action?: string; patch?: { images?: string[] } }> = [];
    const photoActions: string[] = [];
    await signInHale(page);
    await page.route("**/api/live-book", async (route) => {
      if (route.request().method() === "POST") {
        operations.push(route.request().postDataJSON());
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(route.request().method() === "POST"
          ? { mode: "live", acknowledged: true }
          : {
              mode: "live",
              viewer: { role: "collector", email, customerId: "cust-photo-success" },
              book: {
                timepieces: [],
                agreements: [],
                users: [],
                photos: [],
                appraisalAttempts: [],
                appraisalAttemptPhotos: [],
                profiles: {
                  [email]: {
                    name: "Photo Success",
                    email,
                    phone: "",
                    member: false,
                    avatar: "",
                    role: "collector",
                    onboardingComplete: true,
                    preferences: {},
                  },
                },
                catalog: [],
                shells: [],
                settings: { requiredPhotoKinds: ["front", "back", "left", "right", "clasp"] },
                applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
              },
            }),
      });
    });
    await page.route("**/api/photos", async (route) => {
      const body = route.request().postDataJSON() as { action: string; kind?: string; photoId?: string };
      photoActions.push(body.action);
      if (body.action === "request-upload") {
        const photoId = `photo-${body.kind}`;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            mode: "live",
            upload: {
              photoId,
              status: "pending",
              original: { url: `https://upload.test/${photoId}/original`, headers: {} },
              preview: { url: `https://upload.test/${photoId}/preview`, headers: {} },
            },
          }),
        });
        return;
      }
      if (body.action === "preview-url") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            mode: "live",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            expiresAt: "2030-01-01T00:00:00.000Z",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "live", photo: { id: body.photoId, status: "stored" } }),
      });
    });
    await page.route("https://upload.test/**", (route) => route.fulfill({ status: 200, body: "" }));

    const liveRead = page.waitForResponse((response) =>
      response.url().includes("/api/live-book") && response.request().method() === "GET",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await liveRead;
    await page.getByRole("link", { name: "Add a timepiece" }).click();
    await completeTimepieceIntakePhotos(page, true);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/collection\/tp-/);
    expect(photoActions.filter((action) => action === "request-upload")).toHaveLength(5);
    expect(photoActions.filter((action) => action === "confirm")).toHaveLength(5);
    expect(operations.filter((operation) => operation.action === "timepiece.create")).toHaveLength(1);
    const updates = operations.filter((operation) => operation.action === "timepiece.update");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch?.images).toEqual([
      "photo-front",
      "photo-back",
      "photo-left",
      "photo-right",
      "photo-clasp",
    ]);
  });

  test("stored photo ids resolve to previews and missing ids fall back to illustrations", async ({ page }) => {
    const email = "photo-preview@example.com";
    const previewRequests: string[] = [];
    await signInHale(page);
    await page.route("**/api/photos", async (route) => {
      const body = route.request().postDataJSON() as { action: string; photoId: string };
      previewRequests.push(body.photoId);
      if (body.photoId === "photo-missing") {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ mode: "live", error: "PHOTO_NOT_FOUND" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          expiresAt: "2030-01-01T00:00:00.000Z",
        }),
      });
    });
    await page.route("**/api/live-book", async (route) => {
      const watch = (id: string, model: string, image: string) => ({
        id,
        ownerEmail: email,
        brand: "Cartier",
        model,
        images: [image],
        photoKinds: ["front"],
        status: "not_evaluated",
        financeable: true,
        condition: "Excellent",
        boxPapers: "Box and papers",
        caseMetal: "Steel",
        caseType: "Round",
        caseDiameter: "40mm",
        dialColor: "White",
        buckle: "Folding clasp",
        band: "bracelet",
        bandMaterial: "Steel",
        complication: "Date",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "collector", email, customerId: "cust-photo-preview" },
          book: {
            timepieces: [
              watch("piece-preview", "Preview Watch", "photo-preview"),
              watch("piece-missing", "Missing Watch", "photo-missing"),
            ],
            agreements: [],
            users: [],
            photos: [],
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
            profiles: {
              [email]: {
                name: "Photo Preview",
                email,
                phone: "",
                member: false,
                avatar: "",
                role: "collector",
                onboardingComplete: true,
                preferences: {},
              },
            },
            catalog: [],
            shells: [],
            settings: {},
            applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
          },
        }),
      });
    });

    const liveRead = page.waitForResponse((response) =>
      response.url().includes("/api/live-book") && response.request().method() === "GET",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await liveRead;
    await expect(page.getByText("Preview Watch")).toBeVisible();

    await expect(page.getByRole("img", { name: "Preview Watch" })).toHaveAttribute("src", /^data:image\/png/);
    await expect(page.getByRole("img", { name: "Missing Watch" })).toHaveAttribute("src", /^\/watches\//);
    expect(previewRequests.sort()).toEqual(["photo-missing", "photo-preview"]);
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
    let photoApiRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/photos") photoApiRequests += 1;
    });
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
    expect(photoApiRequests).toBe(0);
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
    await page.getByRole("button", { name: "WhatsApp updates" }).click();
    await page.getByRole("button", { name: "whatsapp", exact: true }).click();
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

  test("apply sends a request for the ticked pieces", async ({ page }) => {
    await appraiseNewHalePiece(page, "UR-100V");
    await appraiseNewHalePiece(page, "UR-220");
    await signInHale(page);
    await page.goto("/repurchase");
    // Both fresh Accepts are ticked, so the cap is their sum in dollars, never a rate.
    await expect(page.getByText("Enter Amount Up to $120,000")).toBeVisible();
    await expect(page.getByText(/%/)).toHaveCount(0);
    await expect(page.getByLabel(/Enter Amount/)).toHaveValue("120,000");
    await page.getByRole("checkbox", { name: "Urwerk UR-220" }).uncheck();
    await expect(page.getByText("Enter Amount Up to $60,000")).toBeVisible();
    await expect(page.getByLabel(/Enter Amount/)).toHaveValue("60,000");
    await expect(page.getByLabel("Anything MAC should know?")).toBeVisible();
    await expect(page.getByTestId("offer-schedule").getByRole("row")).toHaveCount(13);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Repurchase Agreement", exact: true })).toBeVisible();
    await expect(page.getByText("With MAC", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/MAC is reviewing your request/i)).toBeVisible();
    await expect(page.getByText("You sent this request.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review Terms" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign Repurchase Agreement" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask for less" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept these terms", exact: true })).toBeVisible();
    await expect(page.getByText("Confirm other email")).toHaveCount(0);
    // Internal states and loan-adjacent words never reach a collector (R29).
    await expect(page.getByText(/originated|submitted|advance|principal|borrower/i)).toHaveCount(0);
    await expect(page.getByText(/\b(inspecting|collector_signed)\b/i)).toHaveCount(0);
    await page.goto("/agreements");
    await expect(page.getByRole("heading", { name: "With MAC", exact: true })).toBeVisible();
    const request = page.getByRole("link").filter({ hasText: "With MAC" });
    await expect(request).toHaveCount(1);
    await expect(request.getByText("$60,000")).toBeVisible();
    await expect(request.getByText(/Sent on \d{4}-\d{2}-\d{2}/)).toBeVisible();
    await expect(page.getByText(/Originated/i)).toHaveCount(0);
    // The unticked piece stays free: it is still eligible for another request.
    await page.goto("/repurchase");
    await expect(page.getByRole("checkbox", { name: "Urwerk UR-220" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Urwerk UR-100V" })).toHaveCount(0);
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
              // An Accept is good for seven days (R42); a legacy piece with no
              // attempts is read through its evaluation date alone.
              evaluatedAt: new Date().toISOString().slice(0, 10),
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
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
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
    await expect(page.getByText(/still reviewing which names to show/i)).toBeVisible();
    await openMenu(page);
    await page.getByRole("link", { name: "Brands we cover" }).click();
    await expect(page.getByTestId("brands-empty")).toBeVisible();
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
    await expect(page.getByText(/software attestation, not counsel-approved/i).first()).toBeVisible();
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

  test("Hale frozen agreement shows nineteen clauses and stays a temporary preview", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await signInDesk(page);
    await openDeskBook(page);
    await page.getByRole("row").filter({ hasText: "Jonathan Hale" }).click();
    await page.getByRole("button", { name: "Freeze scale" }).click();
    await expect(page.getByRole("button", { name: "Freeze scale" })).toHaveCount(0);
    await page.goto("/login");

    await signInHale(page);
    await openCollectorAgreements(page);
    await page.getByRole("link", { name: /MAC-31419/ }).click();
    await expect(page.getByRole("heading", { name: /Sale of the named collection/i })).toBeVisible();
    await expect(page.locator("article section h3")).toHaveCount(19);
    await expect(page.getByRole("heading", { name: /Monthly repurchase schedule/i })).toBeVisible();
    await expect(page.getByText(/not a loan/i)).toBeVisible();
    await expect(page.getByText(/Temporary preview — not stored/i)).toBeVisible();
    await expect(page.getByText(/\bstored document\b/i)).toHaveCount(0);
    await expect(page.getByText(/paid off|vesting/i)).toHaveCount(0);
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

  test("offer schedule follows the ticked pieces and the typed amount", async ({ page }) => {
    const email = "offer.schedule@example.com";
    const piece = (id: string, model: string) => ({
      id,
      ownerEmail: email,
      brand: "Urwerk",
      model,
      images: [],
      status: "appraised",
      evaluatedAt: new Date().toISOString().slice(0, 10),
      valueLow: 100_000,
      valueHigh: 120_000,
      financeable: true,
      condition: "Excellent",
      boxPapers: "Box and papers",
      caseMetal: "Steel",
      caseType: "Round",
      caseDiameter: "41mm",
      dialColor: "Black",
      buckle: "Folding clasp",
      band: "bracelet",
      bandMaterial: "Steel",
      complication: "Date",
    });
    await page.route("**/api/live-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "collector", email, customerId: "cust-offer" },
          book: {
            timepieces: [
              piece("piece-a", "UR-100"),
              piece("piece-b", "UR-105"),
              piece("piece-c", "UR-110"),
              piece("piece-d", "UR-210"),
            ],
            agreements: [],
            users: [],
            photos: [],
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
            profiles: {
              [email]: {
                name: "Offer Reader",
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
            settings: { maxLtv: 0.6, typicalTerm: 12, vaultLocation: "" },
            applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.6 },
          },
        }),
      });
    });
    await page.goto("/repurchase");
    await expect(page.getByText("Enter Amount Up to $240,000")).toBeVisible();
    await page.getByRole("checkbox", { name: "Urwerk UR-210" }).uncheck();
    await expect(page.getByText("Enter Amount Up to $180,000")).toBeVisible();
    await expect(page.getByTestId("offer-schedule").getByRole("row")).toHaveCount(13);
    const firstPrice = await page.getByTestId("offer-schedule").getByRole("row").nth(1).textContent();
    await page.getByLabel(/Enter Amount/).fill("90000");
    await expect(page.getByTestId("offer-schedule").getByRole("row")).toHaveCount(13);
    const halfPrice = await page.getByTestId("offer-schedule").getByRole("row").nth(1).textContent();
    expect(halfPrice).not.toEqual(firstPrice);
    await expect(page.getByText(/\b(loan|lender|interest|debt|financing|vesting|paid off|originated|advance|principal|balance|collateral|borrower)\b/i)).toHaveCount(0);
  });

  test("expired accepted pieces stay off the picker and say send again", async ({ page }) => {
    const email = "expired.card@example.com";
    const today = new Date();
    const stale = new Date(today);
    stale.setUTCDate(today.getUTCDate() - 8);
    await page.route("**/api/live-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "collector", email, customerId: "cust-expired" },
          book: {
            timepieces: [{
              id: "piece-stale",
              ownerEmail: email,
              brand: "Urwerk",
              model: "UR-Expired",
              images: [],
              status: "appraised",
              evaluatedAt: stale.toISOString().slice(0, 10),
              valueLow: 100_000,
              valueHigh: 120_000,
              financeable: true,
              condition: "Excellent",
              boxPapers: "Box and papers",
              caseMetal: "Steel",
              caseType: "Round",
              caseDiameter: "41mm",
              dialColor: "Black",
              buckle: "Folding clasp",
              band: "bracelet",
              bandMaterial: "Steel",
              complication: "Date",
            }],
            agreements: [],
            users: [],
            photos: [],
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
            profiles: {
              [email]: {
                name: "Expired Reader",
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
            settings: { maxLtv: 0.6, typicalTerm: 12, vaultLocation: "" },
            applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.6 },
          },
        }),
      });
    });
    await page.goto("/repurchase");
    await expect(page.getByRole("checkbox", { name: "Urwerk UR-Expired" })).toHaveCount(0);
    await expect(page.getByText("Appraisal expired — send again")).toBeVisible();
    await page.goto("/collection");
    await expect(page.getByText("Appraisal expired — send again")).toBeVisible();
    await page.getByText("UR-Expired").click();
    await expect(page.getByText("Appraisal expired — send again")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply to Sell/i })).toHaveCount(0);
  });

  test("closed request offers Start again with the same pieces", async ({ page }) => {
    await appraiseNewHalePiece(page, "UR-111");
    await signInHale(page);
    await page.goto("/repurchase");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("This request is closed.")).toBeVisible();
    await page.getByRole("link", { name: "Start again" }).click();
    await expect(page.getByRole("heading", { name: "Sale & Repurchase" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Urwerk UR-111" })).toBeChecked();
    await expect(page.getByText(/\b(submitted|returned|inspecting|collector_signed)\b/i)).toHaveCount(0);
  });

  test("inspected return asks the collector to accept the new amount", async ({ page }) => {
    const email = "inspected.return@example.com";
    await page.route("**/api/live-book", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          viewer: { role: "collector", email, customerId: "cust-r43" },
          book: {
            timepieces: [{
              id: "piece-r43",
              ownerEmail: email,
              brand: "Urwerk",
              model: "UR-R43",
              images: [],
              status: "appraised",
              evaluatedAt: new Date().toISOString().slice(0, 10),
              valueLow: 100_000,
              valueHigh: 120_000,
              financeable: true,
              condition: "Excellent",
              boxPapers: "Box and papers",
              caseMetal: "Steel",
              caseType: "Round",
              caseDiameter: "41mm",
              dialColor: "Black",
              buckle: "Folding clasp",
              band: "bracelet",
              bandMaterial: "Steel",
              complication: "Date",
            }],
            agreements: [{
              id: "agr-r43",
              agreementCode: "MAC-R43",
              watchIds: ["piece-r43"],
              amount: 27000,
              termMonths: 12,
              delivery: "Desk arranges intake",
              ownerName: "Inspected Reader",
              email,
              status: "returned",
              version: 2,
              createdAt: new Date().toISOString().slice(0, 10),
              lastActionAt: new Date().toISOString(),
              pieceCaps: { "piece-r43": 27000, "piece-dropped": 30000 },
            }],
            users: [],
            photos: [],
            appraisalAttempts: [],
            appraisalAttemptPhotos: [],
            profiles: {
              [email]: {
                name: "Inspected Reader",
                email,
                phone: "",
                member: false,
                avatar: "",
                role: "collector",
                onboardingComplete: true,
                applicationSubmitted: true,
                preferences: {},
              },
            },
            catalog: [],
            shells: [],
            settings: { maxLtv: 0.6, typicalTerm: 12, vaultLocation: "" },
            applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.6 },
          },
        }),
      });
    });
    await page.goto("/agreements/agr-r43");
    await expect(page.getByText("Your turn", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("MAC inspected the pieces. Sign the new amount.")).toBeVisible();
    await expect(page.getByText("$27,000")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept the inspected amount and sign" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask for less" })).toHaveCount(0);
    await expect(page.getByLabel(/Enter Amount/)).toHaveCount(0);
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
