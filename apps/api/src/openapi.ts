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
  },
} as const;
