export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
};

type ToolCall = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  auth: boolean;
};

const objectSchema = {
  type: 'object' as const,
  additionalProperties: false,
};

export const toolDefinitions: readonly ToolDefinition[] = [
  {
    name: 'health',
    description: 'Read GET /api/health. No ticket text.',
    inputSchema: { ...objectSchema, properties: {} },
  },
  {
    name: 'list_categories',
    description: 'Read the public category list.',
    inputSchema: { ...objectSchema, properties: {} },
  },
  {
    name: 'list_staff_tickets',
    description: 'Read the staff working list. Subjects are included. Descriptions are not.',
    inputSchema: { ...objectSchema, properties: {} },
  },
  {
    name: 'get_ticket',
    description: 'Read one staff ticket, including the description. Not a public view.',
    inputSchema: {
      ...objectSchema,
      properties: { number: { type: 'integer', minimum: 1 } },
      required: ['number'],
    },
  },
  {
    name: 'dashboard',
    description: 'Read the staff dashboard for day, week, month, quarter or year.',
    inputSchema: {
      ...objectSchema,
      properties: { range: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] } },
    },
  },
  {
    name: 'list_processes',
    description: 'Read freezes, the procurement limits, suppliers and certificates.',
    inputSchema: { ...objectSchema, properties: {} },
  },
  {
    name: 'create_change',
    description: 'Open a change. scheduledFor is yyyy-mm-dd.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        summary: { type: 'string' },
        scheduledFor: { type: 'string' },
        fallbackText: { type: 'string' },
        systems: { type: 'string' },
        exceptionReason: { type: 'string' },
      },
      required: ['summary', 'scheduledFor'],
    },
  },
  {
    name: 'approve_change',
    description: 'Approve a change by ticket number.',
    inputSchema: {
      ...objectSchema,
      properties: { number: { type: 'integer', minimum: 1 } },
      required: ['number'],
    },
  },
  {
    name: 'close_change',
    description: 'Record a change outcome of done or rolled_back.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        outcome: { type: 'string', enum: ['done', 'rolled_back'] },
      },
      required: ['number', 'outcome'],
    },
  },
  {
    name: 'create_procurement',
    description: 'Open a procurement. Dates are yyyy-mm-dd. amountNet is a number.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        article: { type: 'string' },
        reason: { type: 'string' },
        amountNet: { type: 'number' },
        supplierId: { type: 'string' },
        wantedOn: { type: 'string' },
        supervisorEmail: { type: 'string' },
      },
      required: ['article', 'reason', 'amountNet'],
    },
  },
  {
    name: 'create_supplier',
    description: 'Add a supplier. countryCode is two letters.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        purpose: { type: 'string' },
        countryCode: { type: 'string' },
        subprocessorsKnown: { type: 'boolean' },
      },
      required: ['name', 'purpose', 'countryCode', 'subprocessorsKnown'],
    },
  },
  {
    name: 'approve_supplier',
    description: 'Approve a supplier by id.',
    inputSchema: {
      ...objectSchema,
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'start_remote_support',
    description: 'Start remote support. windowStart and windowEnd are ISO timestamps.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        supplierId: { type: 'string' },
        windowStart: { type: 'string' },
        windowEnd: { type: 'string' },
        accountName: { type: 'string' },
      },
      required: ['supplierId', 'windowStart', 'windowEnd', 'accountName'],
    },
  },
  {
    name: 'create_backup_test',
    description: 'Open a backup test. backupTakenOn is yyyy-mm-dd.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        systemName: { type: 'string' },
        backupTakenOn: { type: 'string' },
      },
      required: ['systemName', 'backupTakenOn'],
    },
  },
  {
    name: 'close_backup_test',
    description: 'Close a backup test by ticket number.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        number: { type: 'integer', minimum: 1 },
        restoredTo: { type: 'string' },
        resultText: { type: 'string' },
        durationMinutes: { type: 'integer' },
      },
      required: ['number', 'restoredTo', 'resultText', 'durationMinutes'],
    },
  },
  {
    name: 'create_security_incident',
    description: 'Open a security incident. detectedAt is an ISO timestamp.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        detectedAt: { type: 'string' },
        affected: { type: 'string' },
      },
      required: ['detectedAt', 'affected'],
    },
  },
  {
    name: 'set_incident_priority',
    description: 'Set the priority of a security incident.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        number: { type: 'integer', minimum: 1 },
        priority: { type: 'string', enum: ['p1', 'p2', 'p3'] },
        reason: { type: 'string' },
      },
      required: ['number', 'priority'],
    },
  },
  {
    name: 'create_offboarding',
    description: 'Open an offboarding ticket.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
        dueOn: { type: 'string' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'update_offboarding_checklist',
    description: 'Update one offboarding checklist item.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        code: { type: 'string' },
        state: { type: 'string', enum: ['done', 'na', 'open'] },
      },
      required: ['number', 'code', 'state'],
    },
  },
  {
    name: 'create_certificate',
    description: 'Record a certificate. expiresOn is yyyy-mm-dd.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        systemName: { type: 'string' },
        expiresOn: { type: 'string' },
      },
      required: ['systemName', 'expiresOn'],
    },
  },
  {
    name: 'remind_certificates',
    description: 'Send the certificate reminders that are due.',
    inputSchema: { ...objectSchema, properties: {} },
  },
  {
    name: 'create_portal',
    description: 'Record a portal account. Do not send a password.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        accountName: { type: 'string' },
        mfa: { type: 'boolean' },
        ownerName: { type: 'string' },
      },
      required: ['name', 'accountName', 'mfa', 'ownerName'],
    },
  },
  {
    name: 'create_retention_location',
    description: 'Record a retention location.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        dataKind: { type: 'string' },
        retentionLabel: { type: 'string' },
        backupsFollowSamePeriod: { type: 'boolean' },
      },
      required: ['name', 'dataKind', 'retentionLabel', 'backupsFollowSamePeriod'],
    },
  },
  {
    name: 'run_reviews',
    description: 'Run the access and retention reviews.',
    inputSchema: { ...objectSchema, properties: {} },
  },
];

export function listToolNames(): readonly string[] {
  return toolDefinitions.map((tool) => tool.name);
}

export function resolveToolCall(name: string, args: Record<string, unknown>): ToolCall {
  const bodyOf = (skip: string[]): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (!skip.includes(key)) body[key] = value;
    }
    return body;
  };
  switch (name) {
    case 'health':
      return { method: 'GET', auth: false, path: '/api/health' };
    case 'list_categories':
      return { method: 'GET', auth: false, path: '/api/v1/categories' };
    case 'list_staff_tickets':
      return { method: 'GET', auth: true, path: '/api/v1/staff/tickets' };
    case 'get_ticket':
      return {
        method: 'GET',
        auth: true,
        path: `/api/v1/staff/tickets/${positiveInteger(args.number)}`,
      };
    case 'dashboard':
      return {
        method: 'GET',
        auth: true,
        path: `/api/v1/staff/dashboard?range=${range(args.range)}`,
      };
    case 'list_processes':
      return { method: 'GET', auth: true, path: '/api/v1/staff/processes' };
    case 'create_change':
      return { method: 'POST', auth: true, path: '/api/v1/staff/changes', body: args };
    case 'approve_change':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/changes/${positiveInteger(args.number)}/approve`,
        body: {},
      };
    case 'close_change':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/changes/${positiveInteger(args.number)}/outcome`,
        body: bodyOf(['number']),
      };
    case 'create_procurement':
      return { method: 'POST', auth: true, path: '/api/v1/staff/procurement', body: args };
    case 'create_supplier':
      return { method: 'POST', auth: true, path: '/api/v1/staff/suppliers', body: args };
    case 'approve_supplier':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/suppliers/${uuid(args.id)}/approve`,
        body: {},
      };
    case 'start_remote_support':
      return { method: 'POST', auth: true, path: '/api/v1/staff/remote-support', body: args };
    case 'create_backup_test':
      return { method: 'POST', auth: true, path: '/api/v1/staff/backup-tests', body: args };
    case 'close_backup_test':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/backup-tests/${positiveInteger(args.number)}/close`,
        body: bodyOf(['number']),
      };
    case 'create_security_incident':
      return { method: 'POST', auth: true, path: '/api/v1/staff/security-incidents', body: args };
    case 'set_incident_priority':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/security-incidents/${positiveInteger(args.number)}/priority`,
        body: bodyOf(['number']),
      };
    case 'create_offboarding':
      return { method: 'POST', auth: true, path: '/api/v1/staff/offboarding', body: args };
    case 'update_offboarding_checklist':
      return {
        method: 'POST',
        auth: true,
        path: `/api/v1/staff/offboarding/${positiveInteger(args.number)}/checklist`,
        body: bodyOf(['number']),
      };
    case 'create_certificate':
      return { method: 'POST', auth: true, path: '/api/v1/staff/certificates', body: args };
    case 'remind_certificates':
      return { method: 'POST', auth: true, path: '/api/v1/staff/certificates/remind', body: {} };
    case 'create_portal':
      return { method: 'POST', auth: true, path: '/api/v1/staff/portals', body: args };
    case 'create_retention_location':
      return { method: 'POST', auth: true, path: '/api/v1/staff/retention-locations', body: args };
    case 'run_reviews':
      return { method: 'POST', auth: true, path: '/api/v1/staff/reviews/run', body: {} };
    default:
      throw new Error('unknown tool');
  }
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000_000) {
    throw new Error('number');
  }
  return value;
}

function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new Error('id');
  }
  return value;
}

function range(value: unknown): string {
  const selected = value === undefined ? 'month' : value;
  if (
    selected !== 'day' &&
    selected !== 'week' &&
    selected !== 'month' &&
    selected !== 'quarter' &&
    selected !== 'year'
  ) {
    throw new Error('range');
  }
  return selected;
}
