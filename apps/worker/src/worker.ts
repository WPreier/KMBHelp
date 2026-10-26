export type WorkerEvent = 'not_configured' | 'not_implemented';

export function workerStartupEvent(env: {
  GRAPH_TENANT_ID?: string | undefined;
  GRAPH_CLIENT_ID?: string | undefined;
  GRAPH_CLIENT_SECRET?: string | undefined;
}): WorkerEvent {
  const configured = Boolean(
    env.GRAPH_TENANT_ID?.trim() && env.GRAPH_CLIENT_ID?.trim() && env.GRAPH_CLIENT_SECRET?.trim(),
  );
  return configured ? 'not_implemented' : 'not_configured';
}
