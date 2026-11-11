import type { CredentialStatus, PlanResponse, TestId, TestOutcome } from './types';

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

export async function fetchCredentials(): Promise<CredentialStatus> {
  const response = await fetch('/api/credentials');
  if (!response.ok) {
    throw new Error(`credentials HTTP ${response.status}`);
  }
  return readJson<CredentialStatus>(response);
}

export async function saveCredentials(username: string, password: string): Promise<CredentialStatus> {
  const response = await fetch('/api/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await readJson<CredentialStatus & { error?: { de: string; en: string } }>(response);
  if (!response.ok) {
    throw new Error(body.error?.de ?? `HTTP ${response.status}`);
  }
  return body;
}

export async function runTest(id: TestId): Promise<TestOutcome> {
  const response = await fetch(`/api/tests/${id}`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return readJson<TestOutcome>(response);
}

export async function fetchPlan(): Promise<PlanResponse> {
  const response = await fetch('/api/plan');
  if (!response.ok) {
    throw new Error(`plan HTTP ${response.status}`);
  }
  return readJson<PlanResponse>(response);
}

export async function runPhase(): Promise<PlanResponse & { error?: { de: string; en: string } }> {
  const response = await fetch('/api/phase2', { method: 'POST' });
  if (!response.ok && response.status !== 200) {
    throw new Error(`HTTP ${response.status}`);
  }
  return readJson<PlanResponse & { error?: { de: string; en: string } }>(response);
}

export async function runCase(id: string): Promise<PlanResponse> {
  const response = await fetch('/api/phase2/case', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return readJson<PlanResponse>(response);
}
