import type { ChecklistItem, TicketType } from '@kmbhelp/shared';

export type SkillSeed = {
  code: string;
  labelDe: string;
  labelEn: string;
};

export type CategorySeed = {
  code: string;
  groupCode: string;
  labelDe: string;
  labelEn: string;
  defaultSkillCode: string;
};

export type CatalogItemSeed = {
  code: string;
  type: TicketType;
  categoryCode: string;
  skillCode: string;
  labelDe: string;
  labelEn: string;
  targetMinutes: number;
  checklist: ChecklistItem[];
};

export type FaqSeed = {
  slug: string;
  titleDe: string;
  titleEn: string;
};

const item = (code: string, labelDe: string, labelEn: string): ChecklistItem => ({
  code,
  labelDe,
  labelEn,
});

export const skills: readonly SkillSeed[] = [
  { code: 'payroll', labelDe: 'Lohn', labelEn: 'Payroll' },
  { code: 'tax', labelDe: 'Steuer', labelEn: 'Tax' },
  { code: 'workplace', labelDe: 'Arbeitsplatz', labelEn: 'Workplace' },
  { code: 'identity', labelDe: 'Identität', labelEn: 'Identity' },
  { code: 'security', labelDe: 'Sicherheit', labelEn: 'Security' },
  { code: 'backup', labelDe: 'Sicherung', labelEn: 'Backup' },
  { code: 'supplier', labelDe: 'Lieferanten', labelEn: 'Suppliers' },
  { code: 'procurement', labelDe: 'Beschaffung', labelEn: 'Procurement' },
  { code: 'certificate', labelDe: 'Zertifikate', labelEn: 'Certificates' },
];

export const categories: readonly CategorySeed[] = [
  {
    code: 'payroll_run',
    groupCode: 'payroll',
    labelDe: 'Abrechnungslauf',
    labelEn: 'Payroll run',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'elda',
    groupCode: 'payroll',
    labelDe: 'ELDA / SV-Meldung',
    labelEn: 'ELDA / social insurance filing',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'sepa',
    groupCode: 'payroll',
    labelDe: 'SEPA / Bankdatei',
    labelEn: 'SEPA / bank file',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'annual_payslip',
    groupCode: 'payroll',
    labelDe: 'Jahreslohnzettel',
    labelEn: 'Annual wage slip',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'employer_account',
    groupCode: 'payroll',
    labelDe: 'Dienstgeberkonto',
    labelEn: 'Employer account',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'certificate_expired',
    groupCode: 'payroll',
    labelDe: 'Zertifikat abgelaufen',
    labelEn: 'Certificate expired',
    defaultSkillCode: 'certificate',
  },
  {
    code: 'finanzonline',
    groupCode: 'tax',
    labelDe: 'FinanzOnline',
    labelEn: 'FinanzOnline',
    defaultSkillCode: 'tax',
  },
  {
    code: 'logisth',
    groupCode: 'tax',
    labelDe: 'LogistH',
    labelEn: 'LogistH',
    defaultSkillCode: 'tax',
  },
  { code: 'bmd', groupCode: 'tax', labelDe: 'BMD', labelEn: 'BMD', defaultSkillCode: 'tax' },
  {
    code: 'bmdghost',
    groupCode: 'tax',
    labelDe: 'BMDGhost',
    labelEn: 'BMDGhost',
    defaultSkillCode: 'tax',
  },
  {
    code: 'vat_return',
    groupCode: 'tax',
    labelDe: 'UVA',
    labelEn: 'VAT return',
    defaultSkillCode: 'tax',
  },
  {
    code: 'ec_sales_list',
    groupCode: 'tax',
    labelDe: 'Zusammenfassende Meldung',
    labelEn: 'EC sales list',
    defaultSkillCode: 'tax',
  },
  {
    code: 'e_invoice',
    groupCode: 'tax',
    labelDe: 'E-Rechnung',
    labelEn: 'E-invoice',
    defaultSkillCode: 'tax',
  },
  {
    code: 'document_image',
    groupCode: 'tax',
    labelDe: 'Belegbild / DMS',
    labelEn: 'Document image / DMS',
    defaultSkillCode: 'tax',
  },
  {
    code: 'audit_export',
    groupCode: 'tax',
    labelDe: 'Export Betriebsprüfung',
    labelEn: 'Tax audit export',
    defaultSkillCode: 'tax',
  },
  {
    code: 'scanner',
    groupCode: 'workplace',
    labelDe: 'Scanner',
    labelEn: 'Scanner',
    defaultSkillCode: 'workplace',
  },
  {
    code: 'printer',
    groupCode: 'workplace',
    labelDe: 'Drucker',
    labelEn: 'Printer',
    defaultSkillCode: 'workplace',
  },
  {
    code: 'workstation_antivirus',
    groupCode: 'workplace',
    labelDe: 'Virenscanner am Arbeitsplatz-PC',
    labelEn: 'Workstation antivirus',
    defaultSkillCode: 'workplace',
  },
  {
    code: 'vpn',
    groupCode: 'workplace',
    labelDe: 'Homeoffice / VPN',
    labelEn: 'Home office / VPN',
    defaultSkillCode: 'workplace',
  },
  {
    code: 'mfa',
    groupCode: 'workplace',
    labelDe: 'MFA',
    labelEn: 'MFA',
    defaultSkillCode: 'security',
  },
  {
    code: 'joiner',
    groupCode: 'access',
    labelDe: 'neuer Mitarbeiter',
    labelEn: 'New employee',
    defaultSkillCode: 'identity',
  },
  {
    code: 'mover',
    groupCode: 'access',
    labelDe: 'Rollenwechsel Lohn / Steuer',
    labelEn: 'Role change payroll / tax',
    defaultSkillCode: 'identity',
  },
  {
    code: 'leaver',
    groupCode: 'access',
    labelDe: 'Austritt',
    labelEn: 'Departure',
    defaultSkillCode: 'identity',
  },
  {
    code: 'intern',
    groupCode: 'access',
    labelDe: 'Praktikant',
    labelEn: 'Intern',
    defaultSkillCode: 'identity',
  },
  {
    code: 'external_adviser',
    groupCode: 'access',
    labelDe: 'externer Betreuer',
    labelEn: 'External adviser',
    defaultSkillCode: 'identity',
  },
  {
    code: 'phishing',
    groupCode: 'security',
    labelDe: 'Phishing mit Mandantenbezug',
    labelEn: 'Phishing involving a client',
    defaultSkillCode: 'security',
  },
  {
    code: 'lost_notebook',
    groupCode: 'security',
    labelDe: 'verlorenes Notebook',
    labelEn: 'Lost notebook',
    defaultSkillCode: 'security',
  },
  {
    code: 'open_mailbox',
    groupCode: 'security',
    labelDe: 'offenes Postfach',
    labelEn: 'Open mailbox',
    defaultSkillCode: 'security',
  },
  {
    code: 'hardware',
    groupCode: 'procurement',
    labelDe: 'Hardware',
    labelEn: 'Hardware',
    defaultSkillCode: 'procurement',
  },
  {
    code: 'software',
    groupCode: 'procurement',
    labelDe: 'Software',
    labelEn: 'Software',
    defaultSkillCode: 'procurement',
  },
];

export const catalogItems: readonly CatalogItemSeed[] = [
  {
    code: 'create_user',
    type: 'access',
    categoryCode: 'joiner',
    skillCode: 'identity',
    labelDe: 'Benutzer anlegen',
    labelEn: 'Create user',
    targetMinutes: 45,
    checklist: [
      item('account', 'Konto angelegt', 'Account created'),
      item('role', 'Rolle nach Aufgabe gesetzt', 'Role set for the job'),
      item('mfa', 'MFA eingerichtet', 'MFA enrolled'),
    ],
  },
  {
    code: 'extend_right',
    type: 'access',
    categoryCode: 'mover',
    skillCode: 'identity',
    labelDe: 'Recht erweitern',
    labelEn: 'Extend permission',
    targetMinutes: 30,
    checklist: [
      item('system', 'System genannt', 'System named'),
      item('role', 'Recht gesetzt', 'Permission granted'),
    ],
  },
  {
    code: 'laptop',
    type: 'request',
    categoryCode: 'hardware',
    skillCode: 'workplace',
    labelDe: 'Laptop',
    labelEn: 'Laptop',
    targetMinutes: 60,
    checklist: [
      item('device', 'Gerät erfasst', 'Device recorded'),
      item('encryption', 'Verschlüsselung geprüft', 'Encryption checked'),
      item('owner', 'Besitzer eingetragen', 'Owner recorded'),
    ],
  },
  {
    code: 'scan_station',
    type: 'request',
    categoryCode: 'scanner',
    skillCode: 'workplace',
    labelDe: 'Scanplatz',
    labelEn: 'Scan station',
    targetMinutes: 45,
    checklist: [
      item('device', 'Gerät erfasst', 'Device recorded'),
      item('path', 'Belegweg geprüft', 'Document path checked'),
    ],
  },
  {
    code: 'check_antivirus',
    type: 'request',
    categoryCode: 'workstation_antivirus',
    skillCode: 'workplace',
    labelDe: 'Virenscanner prüfen',
    labelEn: 'Check antivirus',
    targetMinutes: 20,
    checklist: [
      item('workstation', 'Arbeitsplatz genannt', 'Workstation named'),
      item('current', 'Stand geprüft', 'Status checked'),
    ],
  },
  {
    code: 'portal_user',
    type: 'access',
    categoryCode: 'mfa',
    skillCode: 'identity',
    labelDe: 'Portal-Benutzer',
    labelEn: 'Portal user',
    targetMinutes: 30,
    checklist: [
      item('portal', 'Portal genannt', 'Portal named'),
      item('account', 'Account eingetragen', 'Account recorded'),
      item('mfa', 'MFA ja oder nein', 'MFA yes or no'),
    ],
  },
  {
    code: 'renew_certificate',
    type: 'request',
    categoryCode: 'certificate_expired',
    skillCode: 'certificate',
    labelDe: 'Zertifikat erneuern',
    labelEn: 'Renew certificate',
    targetMinutes: 40,
    checklist: [
      item('system', 'System genannt', 'System named'),
      item('expiry', 'Neues Ablaufdatum', 'New expiry date'),
    ],
  },
  {
    code: 'offboarding',
    type: 'access',
    categoryCode: 'leaver',
    skillCode: 'identity',
    labelDe: 'Offboarding letzter Arbeitstag',
    labelEn: 'Offboarding on the last working day',
    targetMinutes: 90,
    checklist: [
      item('ad_m365', 'AD/M365', 'AD/M365'),
      item('vpn', 'VPN', 'VPN'),
      item('practice_software', 'Fachsoftware', 'Practice software'),
      item('portals', 'Portale', 'Portals'),
      item('finanzonline_user', 'FinanzOnline-Benutzer', 'FinanzOnline user'),
      item('mail_forwarding', 'E-Mail-Weiterleitung', 'Mail forwarding'),
      item('notebook', 'Notebook', 'Notebook'),
      item('token', 'Token', 'Token'),
      item('smartcard', 'Smartcard', 'Smartcard'),
    ],
  },
  {
    code: 'plan_change',
    type: 'change',
    categoryCode: 'bmd',
    skillCode: 'workplace',
    labelDe: 'Änderung mit Rückfall planen',
    labelEn: 'Plan a change with rollback',
    targetMinutes: 60,
    checklist: [
      item('fallback', 'Rückfall beschrieben', 'Rollback described'),
      item('window', 'Fenster geprüft', 'Window checked'),
    ],
  },
  {
    code: 'restore_backup',
    type: 'backup_test',
    categoryCode: 'payroll_run',
    skillCode: 'backup',
    labelDe: 'Backup zurückspielen (Test)',
    labelEn: 'Restore a backup (test)',
    targetMinutes: 120,
    checklist: [
      item('system', 'System genannt', 'System named'),
      item('restored', 'Echt zurückgespielt ja/nein', 'Actually restored yes/no'),
      item('result', 'Ergebnis notiert', 'Result recorded'),
    ],
  },
  {
    code: 'approve_supplier',
    type: 'supplier',
    categoryCode: 'finanzonline',
    skillCode: 'supplier',
    labelDe: 'Lieferant freigeben',
    labelEn: 'Approve supplier',
    targetMinutes: 30,
    checklist: [
      item('avv', 'AVV-Datum', 'AVV date'),
      item('confidentiality', 'Verschwiegenheitsdatum', 'Confidentiality date'),
    ],
  },
  {
    code: 'order_hardware',
    type: 'procurement',
    categoryCode: 'hardware',
    skillCode: 'procurement',
    labelDe: 'Bestellung Hardware',
    labelEn: 'Order hardware',
    targetMinutes: 20,
    checklist: [item('article', 'Artikel', 'Article'), item('amount', 'Nettobetrag', 'Net amount')],
  },
  {
    code: 'order_software',
    type: 'procurement',
    categoryCode: 'software',
    skillCode: 'procurement',
    labelDe: 'Bestellung Software',
    labelEn: 'Order software',
    targetMinutes: 20,
    checklist: [item('article', 'Artikel', 'Article'), item('amount', 'Nettobetrag', 'Net amount')],
  },
];

export const faqStubs: readonly FaqSeed[] = [
  { slug: 'elda', titleDe: 'ELDA', titleEn: 'ELDA' },
  { slug: 'smartcard', titleDe: 'Smartcard', titleEn: 'Smartcard' },
  { slug: 'vpn', titleDe: 'VPN', titleEn: 'VPN' },
  { slug: 'scan_jam', titleDe: 'Scanstau', titleEn: 'Scan jam' },
  { slug: 'finanzonline', titleDe: 'FinanzOnline', titleEn: 'FinanzOnline' },
  { slug: 'antivirus', titleDe: 'Virenscanner', titleEn: 'Antivirus' },
];

export const freezeWindows = [
  {
    code: 'payroll_month_start',
    dayOfMonthFrom: 1,
    dayOfMonthTo: 5,
    weekdaysOnly: true,
    label: 'Lohnvorlauf, Werktage 1. bis 5.',
  },
] as const;

export const approvedExchangeSettingKey = 'approved_exchange_url';
