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
          '200': {
            description:
              'API and database are reachable. worker is up, down, or not_configured. A stopped worker does not stop the site.',
          },
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
              'Number, subject, the first three characters of the assigned employee email, status, priority, age and due date. No body, requester or comments. Inactive employees stay visible on existing tickets.',
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
    '/api/v1/tickets/public/{number}/ask': {
      post: {
        operationId: 'askAssignedEmployee',
        responses: {
          '200': {
            description:
              'Sends a question from GRAPH_MAILBOX to the assigned employee. The mail names the subject, the ticket link, and that the user asks when it will be solved.',
          },
          '503': { description: 'Microsoft 365 mail is not configured.' },
        },
      },
    },
    '/api/v1/staff/assignable': {
      get: {
        operationId: 'listAssignableStaff',
        responses: {
          '200': {
            description: 'Active employees for a new ticket. Inactive employees are omitted.',
          },
        },
      },
    },
    '/api/v1/staff/{id}/availability': {
      get: {
        operationId: 'readStaffAvailability',
        responses: {
          '200': {
            description:
              'Microsoft 365 busy times for an active employee, or a not-connected calendar.',
          },
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
        responses: {
          '200': { description: 'Whether this browser has a finished local-admin session.' },
        },
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
        responses: {
          '200': {
            description:
              'Configuration values, checks and the saved syslog target. Secrets are not returned.',
          },
        },
      },
    },
    '/api/v1/admin/configuration/syslog': {
      post: {
        operationId: 'saveSyslogTarget',
        responses: {
          '200': {
            description:
              'Saves the syslog host, UDP port, RFC 5424 APP-NAME and facility for the local admin.',
          },
        },
      },
    },
    '/api/v1/admin/configuration/syslog/test': {
      post: {
        operationId: 'testSyslogTarget',
        responses: {
          '200': {
            description: 'Hands a UDP datagram to the given host. Delivery is not confirmed.',
          },
        },
      },
    },
    '/api/v1/admin/configuration/value': {
      post: {
        operationId: 'saveConfigurationValue',
        responses: {
          '200': {
            description:
              'Saves one configuration value and checks it. Secrets are stored outside the repository and are not returned.',
          },
        },
      },
    },
    '/api/v1/admin/configuration/value/check': {
      post: {
        operationId: 'checkConfigurationValue',
        responses: {
          '200': { description: 'Checks one typed value without saving it.' },
        },
      },
    },
    '/api/v1/admin/directory/read': {
      post: {
        operationId: 'readHelpdeskDirectory',
        responses: {
          '200': {
            description:
              'Reads HelpdeskAdmins and reconciles staff by email. Staff rows are never deleted.',
          },
        },
      },
    },
    '/api/v1/admin/directory/deactivate': {
      post: {
        operationId: 'deactivateMissingStaff',
        responses: {
          '200': { description: 'Sets staff inactive when they are no longer in HelpdeskAdmins.' },
        },
      },
    },
    '/api/v1/admin/staff': {
      get: {
        operationId: 'listAdminStaff',
        responses: {
          '200': {
            description:
              'Reconciles HelpdeskAdmins by email, then lists staff, skills and categories. No password hash and no TOTP secret.',
          },
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
    '/api/v1/staff/changes': {
      post: {
        operationId: 'createChange',
        responses: {
          '422': { description: 'A freeze window needs exception_reason.' },
        },
      },
    },
    '/api/v1/staff/procurement': {
      post: {
        operationId: 'createProcurement',
        responses: {
          '200': {
            description: 'direct under the first limit, token up to the second, otherwise manual.',
          },
        },
      },
    },
    '/api/v1/procurement/decision': {
      post: {
        operationId: 'decideProcurement',
        responses: {
          '200': { description: 'Article and amount only. No ticket text.' },
        },
      },
    },
    '/api/v1/staff/remote-support': {
      post: {
        operationId: 'startRemoteSupport',
        responses: { '422': { description: 'Supplier is not approved for remote support.' } },
      },
    },
    '/api/v1/staff/backup-tests/{number}/close': {
      post: {
        operationId: 'closeBackupTest',
        responses: {
          '422': { description: 'restored yes or no is required. A follow-up is due in 90 days.' },
        },
      },
    },
    '/api/v1/staff/security-incidents': {
      post: {
        operationId: 'createSecurityIncident',
        responses: {
          '200': { description: 'Starts as P1. deadline_at is detected_at plus 72 hours.' },
        },
      },
    },
    '/api/v1/staff/offboarding': {
      post: {
        operationId: 'createOffboarding',
        responses: { '422': { description: 'The last working day is required.' } },
      },
    },
    '/api/v1/staff/dashboard': {
      get: {
        operationId: 'staffDashboard',
        responses: {
          '200': {
            description:
              'Counts, a pie of mail, web, done and open P1 to P3, and overdue remote support with subject and ticket number. An agent sees assigned tickets. A lead or admin sees the firm. The public body stays off this list.',
          },
          '401': { description: 'Staff sign-in is required.' },
        },
      },
    },
    '/api/v1/staff/tickets/{number}': {
      get: {
        operationId: 'staffTicket',
        responses: {
          '200': {
            description:
              'One ticket for staff, including the description and any remote-support window. Not a public view.',
          },
          '401': { description: 'Staff sign-in is required.' },
          '404': { description: 'No ticket with that number.' },
        },
      },
    },
    '/api/v1/staff/reviews/run': {
      post: {
        operationId: 'runReviews',
        responses: {
          '200': {
            description:
              'Access reviews at 180 days, retention reviews at 365 days, then IP log deletion.',
          },
        },
      },
    },
    '/api/v1/search': {
      get: {
        operationId: 'search',
        responses: {
          '200': {
            description:
              'Hits with an explanation. Public search does not call a model and does not log the query. Staff search may add a model sentence and a ticket link.',
          },
        },
      },
    },
  },
} as const;
