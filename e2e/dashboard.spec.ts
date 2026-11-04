import { expect, test, type Page } from "@playwright/test";

async function runSample(page: Page) {
  await page.getByRole("button", { name: "Load sample dataset" }).click();
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Acme Cloud support bot – sample run" })).toBeFocused();
}

test.describe("with the API", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("status").filter({ hasText: "Connected to API" })).toBeVisible();
  });

  test("evaluates the sample dataset and shows the summary", async ({ page }) => {
    await runSample(page);
    const metrics = page.locator(".metrics");
    await expect(metrics.getByText("38%")).toBeVisible();
    await expect(metrics.getByText("3 pass · 2 review · 3 fail")).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(9); // header + 8 cases
  });

  test("filters to failing cases and explains a hallucination", async ({ page }) => {
    await runSample(page);
    await page.getByRole("radio", { name: "Fail (3)" }).check();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(4);

    await page.getByRole("button", { name: /refund-window-hallucinated/ }).click();
    const detail = page.getByRole("region", { name: "Case: refund-window-hallucinated" });
    await expect(detail.getByRole("heading", { name: "Case: refund-window-hallucinated" })).toBeFocused();
    await expect(detail.getByText("States 60, which appears in no retrieved chunk.")).toBeVisible();
    await expect(detail.getByTestId("answer").locator("mark")).toHaveCount(2);
  });

  test("sorts by a column and reports the sort order to assistive tech", async ({ page }) => {
    await runSample(page);
    const header = page.getByRole("columnheader", { name: /Overall/ });
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(page.getByRole("table").getByRole("row").nth(1)).toContainText("26%");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByRole("table").getByRole("row").nth(1)).toContainText("data-residency");
  });

  test("saves runs so they survive a page reload", async ({ page }) => {
    await page.getByRole("textbox", { name: "Run name" }).fill("Persistence check");
    await page.getByRole("button", { name: "Load sample dataset" }).click();
    await page.getByRole("textbox", { name: "Run name" }).fill("Persistence check");
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Persistence check" })).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: /^Persistence check/ }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Persistence check" })).toBeVisible();

    await page.getByRole("button", { name: "Delete run Persistence check" }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "No results yet" })).toBeVisible();
  });

  test("shows readable validation errors", async ({ page }) => {
    const dataset = page.getByRole("textbox", { name: "Dataset (JSON)" });
    await dataset.fill("[ { not json");
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByRole("alert")).toHaveText(/isn't valid JSON/);
    await expect(dataset).toHaveAttribute("aria-invalid", "true");

    await dataset.fill('[{"question": "Q?", "answer": "A."}]');
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByRole("alert")).toHaveText('Case 1 needs "contexts" as an array of strings.');
  });
});

test("falls back to in-browser scoring when no API is available", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Demo mode" })).toBeVisible();
  await runSample(page);
  await expect(page.locator(".metrics").getByText("38%")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Acme Cloud support bot – sample run/ })).toBeVisible();
});
