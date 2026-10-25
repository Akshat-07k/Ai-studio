// Entry point: create services, start the HTTP server, find/launch engines, clean up on exit.
import { config } from './config.js';
import { createServices } from './services/index.js';
import { createApp } from './app.js';

const services = createServices(config);
const app = createApp(services);

app.listen(config.port, config.host, (err) => {
  // Express 5 reports bind failures (e.g. port already in use) here instead of throwing.
  if (err) {
    console.error(`[interface] cannot listen on ${config.host}:${config.port}: ${err.message}`);
    if (err.code === 'EADDRINUSE') console.error('[interface] another backend is probably still running; stop it first.');
    process.exit(1);
  }
  console.log(`[interface] backend listening on http://${config.host}:${config.port}`);
  console.log(`[interface] image engine mode: ${config.comfy.mode} | llama-server: ${config.llm.serverPath ?? 'not found'}`);
  services.init().catch((err) => console.error('[interface] engine init failed:', err));
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  services.shutdown();
}
process.on('exit', shutdown);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}
