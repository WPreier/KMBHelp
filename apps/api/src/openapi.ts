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
          '200': { description: 'Ticket number. Secret path only when an email was given.' },
        },
      },
    },
    '/api/v1/tickets/public': {
      get: {
        operationId: 'listPublicTickets',
        responses: {
          '200': {
            description:
              'Number, category, status, priority and age. No subject, body or requester.',
          },
        },
      },
    },
    '/api/v1/tickets/by-token/{token}': {
      get: {
        operationId: 'readTicketByToken',
        responses: { '200': { description: 'Requester view. No comments.' } },
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
