import { describe, expect, it } from 'vitest';
import { catalogItems, categories, faqStubs, skills } from './catalog.js';

const requiredItems = [
  'create_user',
  'extend_right',
  'laptop',
  'scan_station',
  'check_antivirus',
  'portal_user',
  'renew_certificate',
  'offboarding',
  'plan_change',
  'restore_backup',
  'approve_supplier',
  'order_hardware',
  'order_software',
];

describe('catalog seed', () => {
  it('covers every category and catalog entry from the ticket catalog', () => {
    const categoryCodes = new Set(categories.map((entry) => entry.code));
    const skillCodes = new Set(skills.map((entry) => entry.code));
    expect(categoryCodes.size).toBe(categories.length);
    expect(catalogItems.map((entry) => entry.code).sort()).toEqual([...requiredItems].sort());
    for (const entry of catalogItems) {
      expect(categoryCodes.has(entry.categoryCode)).toBe(true);
      expect(skillCodes.has(entry.skillCode)).toBe(true);
      expect(entry.targetMinutes).toBeGreaterThan(0);
      expect(entry.checklist.length).toBeGreaterThan(0);
    }
    const offboarding = catalogItems.find((entry) => entry.code === 'offboarding');
    expect(offboarding?.checklist.map((step) => step.code)).toContain('smartcard');
  });

  it('keeps the FAQ as empty unpublished stubs', () => {
    expect(faqStubs.map((entry) => entry.slug).sort()).toEqual(
      ['antivirus', 'elda', 'finanzonline', 'scan_jam', 'smartcard', 'vpn'].sort(),
    );
  });
});
