import { expect, test } from '@playwright/test';

test('core flow: ask → product cards render → refresh keeps history', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Message').fill('show me laptops');
  await page.getByLabel('Message').press('Enter');

  // Tool result rendered as product widgets inside the chat
  const cards = page.getByTestId('product-card');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first().locator('img')).toHaveAttribute('src', /https:\/\//);
  await expect(cards.first()).toContainText('$');
  await expect(page.getByText('Here are some options from the catalog.')).toBeVisible();

  // Persistence across refresh
  const url = page.url();
  expect(url).toContain('?c=');
  await page.reload();
  await expect(page.getByTestId('message-user')).toContainText('show me laptops');
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  expect(page.url()).toBe(url);
});

test('conversation management: new chat, list, resume, delete', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Message').fill('show me watches');
  await page.getByLabel('Message').press('Enter');
  await expect(page.getByTestId('product-card').first()).toBeVisible({ timeout: 15_000 });

  // New chat starts empty, previous one appears in the sidebar
  await page.getByRole('button', { name: '+ New chat' }).click();
  await expect(page.getByText('What are you shopping for?', { exact: true })).toBeVisible();
  const item = page.getByTestId('conversation-item').filter({ hasText: 'show me watches' });
  await expect(item).toBeVisible();

  // Resume it from where it left off, and continue it
  await item.click();
  await expect(page.getByTestId('message-user')).toContainText('show me watches');
  await page.getByLabel('Message').fill('now sunglasses');
  await page.getByLabel('Message').press('Enter');
  await expect(page.getByTestId('message-user')).toHaveCount(2);
  await expect(page.getByTestId('message-assistant')).toHaveCount(2, { timeout: 15_000 });

  // Delete it
  await item.hover();
  await page.getByRole('button', { name: 'Delete "show me watches"' }).click();
  await expect(item).toHaveCount(0);
});

test('off-catalog request gets a text answer and no product widget', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Message').fill('book a flight to Tokyo');
  await page.getByLabel('Message').press('Enter');
  await expect(page.getByText(/don't sell flights/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('product-card')).toHaveCount(0);
});
