import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PlanSchema } from '../server/planSchema';
import { casesFromPages, purposeFor, templatePath, type ObservedPage } from '../server/plan';

describe('plan', () => {
  it('ships an empty template and does not invent pages', async () => {
    const template = PlanSchema.parse(JSON.parse(await readFile(templatePath(), 'utf8')));
    expect(template.inventoryStatus).toBe('waiting_for_credentials');
    expect(template.pages).toEqual([]);
    expect(template.cases).toEqual([]);
    expect(template.target.publicOrigin).toBe('https://kmbhelp.kmbcloud.at');
    expect(template.target.shortName).toBe('kmbhelp');
  });

  it('builds valid and invalid cases only for observed pages', () => {
    const pages: ObservedPage[] = [
      {
        url: 'https://kmbhelp.kmbcloud.at/anleitungen',
        title: 'Anleitungen',
        heading: 'Anleitungen',
        fields: [{ name: 'q', type: 'search', required: false, label: 'Suche' }],
      },
    ];
    const cases = casesFromPages(pages);
    expect(cases).toHaveLength(2);
    expect(cases.map((item) => item.kind)).toEqual(['valid', 'invalid']);
    expect(cases[0]?.purpose.de).toBe('Beobachtete Überschrift: Anleitungen');
    expect(casesFromPages([])).toEqual([]);
  });

  it('does not copy a heading that looks like a record id', () => {
    const purpose = purposeFor({
      url: 'https://kmbhelp.kmbcloud.at/tickets/123456',
      title: 'Mandant Beispiel GmbH',
      heading: 'Mandant Beispiel GmbH',
      fields: [],
    });
    expect(purpose.de).toBe('Zweck aus der sichtbaren Überschrift nicht übernommen.');
  });
});
