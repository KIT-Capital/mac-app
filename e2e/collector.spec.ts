import { expect, test } from "@playwright/test";
import { HALE, openMenu, signIn, signInHale, signOutFromMenu } from "./helpers";

test.describe("collector app", () => {
  test("splash shows the official lockup and collector actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: /Mechanical Art Capital/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByText(/Unbiased/i)).toBeVisible();
    await expect(page.getByText(/loan/i)).toHaveCount(0);
    await expect(page.getByText(/Get Estimate/i)).toHaveCount(0);
  });

  test("Hale collection shows demo pieces and photographs", async ({ page }) => {
    await signInHale(page);
    await expect(page.getByText("Richard Mille")).toBeVisible();
    await expect(page.getByText("Nautilus")).toBeVisible();
    await expect(page.getByText("Royal Oak Selfwinding")).toBeVisible();
    await expect(page.getByText("Logical One")).toBeVisible();
    const photos = page.locator("img").filter({ hasNot: page.locator("[alt='']") });
    await expect(photos.first()).toBeVisible();
  });

  test("requesting appraisal sends the piece to reviewing", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: /Logical One/ }).click();
    await page.getByRole("button", { name: "Request Certified Appraisal" }).click();
    await expect(page.getByText(/Desk specialists are reviewing/i)).toBeVisible();
  });

  test("saving a timepiece without photos uses an illustration", async ({ page }) => {
    await signInHale(page);
    await page.getByRole("link", { name: "Add a timepiece" }).click();
    await expect(page.getByText(/photorealistic illustration/i)).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Illustration").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Certified Appraisal" })).toBeVisible();
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
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Enter Collection" }).click();
    await expect(page.getByRole("heading", { name: "My Timepieces" })).toBeVisible();
    await expect(page.getByText("Royal Oak Selfwinding")).toBeVisible();
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

  test("repurchase application is in dollars and creates a signable agreement", async ({ page }) => {
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
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "My Timepieces" })).toBeVisible();
    await expect(page.getByText("Desk overview")).toHaveCount(0);
  });

  test("signing out and back in as Hale keeps a newly added piece", async ({ page }) => {
    await signInHale(page);
    await page.goto("/collection/add");
    await page.getByRole("button", { name: /Missing a brand/i }).click();
    await page.getByPlaceholder("Manufacturer name").fill("De Bethune");
    await page.getByLabel(/Your Model/).fill("DB28");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "DB28" })).toBeVisible();
    await signOutFromMenu(page);
    await signInHale(page);
    await expect(page.getByText("DB28")).toBeVisible();
  });
});
