export const departmentCodes = [
  'payroll',
  'tax',
  'workplace',
  'access',
  'security',
  'procurement',
] as const;

export type DepartmentCode = (typeof departmentCodes)[number];

export const departmentLabels: Record<DepartmentCode, { de: string; en: string }> = {
  payroll: { de: 'Lohn', en: 'Payroll' },
  tax: { de: 'Steuer', en: 'Tax' },
  workplace: { de: 'Arbeitsplatz', en: 'Workplace' },
  access: { de: 'Zugriff', en: 'Access' },
  security: { de: 'Sicherheit', en: 'Security' },
  procurement: { de: 'Beschaffung', en: 'Procurement' },
};

export function departmentLabel(code: string): { de: string; en: string } {
  if ((departmentCodes as readonly string[]).includes(code)) {
    return departmentLabels[code as DepartmentCode];
  }
  return { de: code, en: code };
}
