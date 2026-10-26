import { listToolNames } from './server.js';

process.stdout.write(
  `${JSON.stringify({
    level: 'info',
    component: 'kmbhelp-mcp',
    event: 'not_implemented',
    tools: listToolNames(),
  })}\n`,
);
process.exit(0);
