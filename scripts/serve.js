// Dev server for the web app: node scripts/serve.js [port]
import { startServer } from '../src/node/server.js';

const port = Number(process.argv[2] || process.env.PORT || 5186);
const { url } = await startServer({ port });
console.log(`Unused & Looking dev server: ${url}`);
