export type WorkerEvent = 'not_configured' | 'started';

export function workerStartupEvent(env: {
  GRAPH_TENANT_ID?: string | undefined;
  GRAPH_CLIENT_ID?: string | undefined;
  GRAPH_CLIENT_SECRET?: string | undefined;
  GRAPH_MAILBOX?: string | undefined;
}): WorkerEvent {
  const configured = Boolean(
    env.GRAPH_MAILBOX?.includes('@') &&
    env.GRAPH_TENANT_ID?.trim() &&
    env.GRAPH_CLIENT_ID?.trim() &&
    env.GRAPH_CLIENT_SECRET?.trim(),
  );
  return configured ? 'started' : 'not_configured';
}
