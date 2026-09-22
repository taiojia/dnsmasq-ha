/**
 * dnsmasq-ha agent entrypoint.
 *
 * Usage (as root on a cluster node):
 *   AGENT_TOKEN=<token> AGENT_HOST=0.0.0.0 AGENT_PORT=8080 npm start
 *
 * When AGENT_TOKEN is not set the token is read from (or generated into)
 * ~/.dnsmasq-ha/agent-token; the generated value is logged once.
 */
import { loadOrCreateToken } from "./auth.js";
import { buildApp } from "./app.js";

const host = process.env.AGENT_HOST ?? "0.0.0.0";
const port = Number(process.env.AGENT_PORT ?? 8080);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[agent] invalid AGENT_PORT: ${process.env.AGENT_PORT}`);
  process.exit(1);
}

const { token, source, file } = loadOrCreateToken();

const app = await buildApp({ token });

app.listen({ host, port }).then((address) => {
  app.log.info(`agent listening on ${address}`);
  if (source === "generated" && file) {
    app.log.warn(
      `generated new agent token and stored it at ${file}: ${token} — ` +
        "copy it into the UI to connect",
    );
  }
});
