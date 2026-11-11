export type Lang = 'de' | 'en';

export type Localized = {
  de: string;
  en: string;
};

export type RowStatus = 'idle' | 'running' | 'pass' | 'fail';

export type TestId =
  | 'certificate'
  | 'external-links'
  | 'search'
  | 'login'
  | 'language'
  | 'theme';

export type TestOutcome = {
  id: string;
  status: 'pass' | 'fail';
  error?: Localized;
  report?: Localized;
};

export type PlanPage = {
  url: string;
  purpose: Localized;
};

export type PlanCase = {
  id: string;
  pageUrl: string;
  kind: 'valid' | 'invalid';
  title: Localized;
  inputDescription: Localized;
  purpose: Localized;
};

export type InventoryStatus =
  | 'waiting_for_credentials'
  | 'login_failed'
  | 'inventoried';

export type PlanDocument = {
  version: 1;
  inventoryStatus: InventoryStatus;
  target: {
    publicOrigin: 'https://kmbhelp.kmbcloud.at';
    lanOrigin: 'http://192.168.36.55';
    shortName: 'kmbhelp';
  };
  pages: PlanPage[];
  cases: PlanCase[];
};

export type CaseResult = {
  status: 'pass' | 'fail';
  error?: Localized;
  report?: Localized;
};

export type PlanResponse = {
  plan: PlanDocument;
  results: Record<string, CaseResult>;
  complete: boolean;
  runFile: string;
  storeFile: string | null;
};

export type CredentialStatus = {
  configured: boolean;
  file: string;
  mode: '0600';
};
