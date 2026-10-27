import { callTool } from './server.js';
import { toolDefinitions } from './tools.js';

type Rpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
};

export async function handleRpc(
  message: Rpc,
  options: { origin: string; token: string; fetchImpl?: typeof fetch },
): Promise<Record<string, unknown> | null> {
  if (message.method === 'notifications/initialized') return null;
  if (message.id === undefined) return null;
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'kmbhelp', version: '0.0.0' },
      },
    };
  }
  if (message.method === 'tools/list') {
    return { jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } };
  }
  if (message.method === 'tools/call') {
    const params = message.params;
    const name = params && typeof params === 'object' && 'name' in params ? params.name : '';
    const args =
      params && typeof params === 'object' && 'arguments' in params && params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {};
    if (typeof name !== 'string') {
      return errorResult(message.id, 'unknown tool');
    }
    try {
      const result = await callTool(name, args, options);
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result.json) }],
          isError: result.isError,
        },
      };
    } catch (caught) {
      return errorResult(message.id, caught instanceof Error ? caught.message : 'tool failed');
    }
  }
  return errorResult(message.id, 'method not found');
}

function errorResult(id: unknown, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code: -32601, message } };
}
