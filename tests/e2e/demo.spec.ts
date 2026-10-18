import { expect, test, type Page } from '@playwright/test';

async function splitDinner(page: Page) {
  await page.goto('/split');
  for (const item of ['Pizza', 'Drinks']) await page.getByRole('button', { name: new RegExp(`^${item},.*unclaimed`) }).click();
  await page.getByRole('button', { name: 'View as Alex', exact: true }).click();
  await page.getByRole('button', { name: /^Pizza,.*unclaimed/ }).click();
  await page.getByRole('button', { name: /^Ice Cream,.*unclaimed/ }).click();
  await page.getByRole('button', { name: 'View as Sam', exact: true }).click();
  await page.getByRole('button', { name: /^Shared Appetizer,.*unclaimed/ }).click();
  await page.getByRole('button', { name: 'View as You', exact: true }).click();
  await page.getByRole('button', { name: 'Review split', exact: true }).click();
  await page.getByLabel('Your optional tip amount').fill('3.15');
  await page.getByRole('button', { name: 'Save my tip', exact: true }).click();
  await page.getByRole('button', { name: 'Send for approval', exact: true }).click();
}

async function approveDinner(page: Page) {
  for (const name of ['You', 'Alex', 'Sam']) {
    await page.getByRole('button', { name: `View as ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choose a payment method', exact: true }).click();
    await page.getByRole('button', { name: /Demo Visa/ }).click();
    await page.getByRole('button', { name: /^Approve my share/ }).click();
  }
  await page.getByRole('button', { name: 'View as You', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & collect', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & collect', exact: true }).last().click();
}

test('claims, approvals, contributions, funding, checkout, titles, and persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await splitDinner(page);
  await approveDinner(page);
  await expect(page.getByRole('button', { name: 'Add to wallet', exact: true })).toBeDisabled();
  for (const name of ['You', 'Alex', 'Sam']) {
    await page.getByRole('button', { name: `View as ${name}`, exact: true }).click();
    await page.getByRole('button', { name: /^Authorize \$/ }).click();
  }
  await expect(page.getByText('All shares authorized', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to wallet', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'View as You', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm simulated funding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add to wallet', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Simulate merchant checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Finish the simulated checkout', exact: true }).click();
  await expect(page.getByText('Simulated checkout complete', { exact: true })).toBeVisible();
  await expect(page.getByText('Keyword fallback · AI was unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('Pizza Diplomat', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.artifacts/demo-paid.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to groups', exact: true }).click();
  await expect(page.getByText('“Pizza Diplomat”', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('splitpool.meal-titles.v1'))).toContain('Pizza Diplomat');
  await page.reload();
  await expect(page.getByText('“Pizza Diplomat”', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('incomplete claims block approval and sample receipt stays labeled', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByRole('button', { name: 'Send for approval', exact: true })).toBeDisabled();
  await page.goto('/receipt');
  await page.getByRole('button', { name: 'Capture receipt', exact: true }).click();
  await expect(page.getByText('Sample items for the demo. They were not read by a scanner.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Review split', exact: true })).toBeVisible();
});

test('failed contribution can be retried without clearing other shares, and titles can be skipped', async ({ page }) => {
  let titleRequests = 0;
  page.on('request', request => { if (request.url().includes('/meal-titles')) titleRequests += 1; });
  await splitDinner(page);
  await page.getByRole('button', { name: 'Food titles on · Turn off', exact: true }).click();
  await approveDinner(page);
  await page.getByRole('button', { name: /^Authorize \$/ }).click();
  await page.getByRole('button', { name: 'Simulate a failed payment', exact: true }).click();
  await expect(page.getByText('Share authorized (simulated)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Share authorized (simulated)', exact: true })).toBeDisabled();
  for (const name of ['Alex', 'Sam']) {
    await page.getByRole('button', { name: `View as ${name}`, exact: true }).click();
    await page.getByRole('button', { name: /^Authorize \$/ }).click();
  }
  await page.getByRole('button', { name: 'View as You', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm simulated funding', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate merchant checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Finish the simulated checkout', exact: true }).click();
  await expect(page.getByText('Titles were skipped for this meal. Payment completion never depends on AI.', { exact: true })).toBeVisible();
  expect(titleRequests).toBe(0);
});
