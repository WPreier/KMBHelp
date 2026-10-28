import { expect, test } from '@playwright/test';

test('files a ticket, hides the description, and switches language and theme', async ({ page }) => {
  const description = 'Geheime Beschreibung die nicht in der Liste steht';
  await page.route('**/api/v1/categories', async (route) => {
    await route.fulfill({
      json: {
        categories: [
          {
            code: 'printer',
            groupCode: 'workplace',
            groupLabelDe: 'Arbeitsplatz',
            groupLabelEn: 'Workplace',
            labelDe: 'Drucker',
            labelEn: 'Printer',
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/staff/assignable', async (route) => {
    await route.fulfill({ json: { staff: [] } });
  });
  await page.route('**/api/v1/tickets/public', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          tickets: [
            {
              number: 8,
              groupCode: 'workplace',
              groupLabelDe: 'Arbeitsplatz',
              groupLabelEn: 'Workplace',
              categoryCode: 'printer',
              categoryLabelDe: 'Drucker',
              categoryLabelEn: 'Printer',
              subject: 'Sichtbarer Betreff',
              status: 'open',
              priority: 'p2',
              ageSeconds: 10,
              dueOn: null,
              staffMark: null,
            },
          ],
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/tickets', async (route) => {
    if (route.request().url().includes('/tickets/public')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: { number: 8, priority: 'p2', priorityReason: 'impact_without_date' },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.getByRole('button', { name: 'Ticket anlegen' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Create ticket' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await page.getByLabel('Betreff').fill('Sichtbarer Betreff');
  await page.getByLabel('Beschreibung').fill(description);
  await page.getByRole('button', { name: 'Ticket anlegen' }).click();
  await expect(page.getByText('Sichtbarer Betreff')).toBeVisible();
  await expect(page.getByText(description)).toHaveCount(0);
});
