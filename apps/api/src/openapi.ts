export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'KMBHelp',
    version: '0.0.0',
  },
  servers: [{ url: 'https://helpdesk.kmbcloud.at' }],
  paths: {
    '/api/health': {
      get: {
        operationId: 'getHealth',
        responses: {
          '200': { description: 'API and database are reachable.' },
          '503': { description: 'API is up and the database is not reachable.' },
        },
      },
    },
    '/api/v1/health': {
      get: {
        operationId: 'getHealthV1',
        responses: { '200': { description: 'Same as /api/health.' } },
      },
    },
    '/api/v1/tickets': {
      post: {
        operationId: 'createTicket',
        responses: {
          '200': { description: 'Ticket number. Due dates are accepted as dd.MM.yyyy.' },
        },
      },
    },
    '/api/v1/tickets/public': {
      get: {
        operationId: 'listPublicTickets',
        responses: {
          '200': {
            description:
              'Number, subject, status, priority, age and due date. No body, requester or comments.',
          },
        },
      },
    },
    '/api/v1/tickets/public/{number}': {
      post: {
        operationId: 'changePublicTicket',
        responses: {
          '200': { description: 'Inactive, reopened, priority change, or permanently closed.' },
          '409': { description: 'A closed ticket cannot be opened again.' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        operationId: 'signIn',
        responses: {
          '200': { description: 'Enroll, MFA challenge, or a full staff session.' },
          '401': { description: 'Denied. The body does not say whether the account exists.' },
          '503': { description: 'Directory is not configured.' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        operationId: 'signOut',
        responses: { '200': { description: 'Session revoked and cookies cleared.' } },
      },
    },
    '/api/v1/auth/session': {
      get: {
        operationId: 'sessionView',
        responses: { '200': { description: 'Whether this browser has a finished local-admin session.' } },
      },
    },
    '/api/v1/admin/notices': {
      get: {
        operationId: 'listNotices',
        responses: { '200': { description: 'Message catalog for the local admin.' } },
      },
    },
    '/api/v1/admin/configuration': {
      get: {
        operationId: 'readConfiguration',
        responses: { '200': { description: 'Configuration values and checks. Secrets are not returned.' } },
      },
    },
    '/api/v1/admin/staff': {
      get: {
        operationId: 'listAdminStaff',
        responses: {
          '200': { description: 'Staff, skills and categories. No password hash and no TOTP secret.' },
          '403': { description: 'Not the local admin or the address is outside the allowlist.' },
        },
      },
    },
    '/api/v1/staff/tickets': {
      get: {
        operationId: 'listStaffTickets',
        responses: {
          '200': { description: 'Open tickets plus at most 10 in progress or recently closed.' },
        },
      },
    },
    '/api/v1/categories': {
      get: {
        operationId: 'listCategories',
        responses: { '200': { description: 'Category labels.' } },
      },
    },
    '/api/v1/faq': {
      get: {
        operationId: 'listFaq',
        responses: { '200': { description: 'Published guides only.' } },
      },
    },
    '/api/v1/faq/{slug}': {
      get: {
        operationId: 'readFaq',
        responses: { '200': { description: 'One published guide.' } },
      },
    },
    '/api/v1/knowledge/{id}': {
      get: {
        operationId: 'readKnowledge',
        responses: { '200': { description: 'Published redacted article.' } },
      },
    },
    '/api/v1/search': {
      get: {
        operationId: 'search',
        responses: { '200': { description: 'Hits with a replaceable explanation sentence.' } },
      },
    },
  },
} as const;
