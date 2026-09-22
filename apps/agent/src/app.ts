/**
 * Fastify application: token auth for every /api route plus the four
 * endpoints defined in docs/specs/001-ts-rewrite.md.
 */
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  API_ROUTES,
  type DeployResponse,
  DeployRequestSchema,
  type PutConfigResponse,
  PutConfigRequestSchema,
  type StatusResponse,
  type ConfigResponse,
  ServiceNameSchema,
} from "@dnsmasq-ha/contract";

import { createVerifier } from "./auth.js";
import { DeployError, deploy, getConfig, getStatus, putConfig } from "./services.js";

export interface AppOptions {
  token: string;
}

/** Zod parse helper returning a 400 reply on invalid input. */
function parseBody<T>(
  reply: FastifyReply,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
  value: unknown,
): T | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    void reply.code(400).send({
      error: "Invalid request body",
      detail: parsed.error.message,
    });
    return null;
  }
  return parsed.data;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
  });
  const verifyToken = createVerifier(options.token);

  // The UI runs on the operator's laptop and calls the agent directly,
  // so CORS must reflect the origin and allow the auth header.
  await app.register(cors, {
    origin: true,
    allowedHeaders: ["authorization", "content-type"],
    methods: ["GET", "POST", "PUT"],
  });

  // Bearer-token auth for every /api route. Comparison is timing-safe.
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const header = request.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (provided.length === 0 || !verifyToken(provided)) {
      void reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.get(API_ROUTES.status, async (): Promise<StatusResponse> => {
    return getStatus();
  });

  app.post(API_ROUTES.deploy, async (request, reply): Promise<DeployResponse | FastifyReply> => {
    const body = parseBody(reply, DeployRequestSchema, request.body);
    if (!body) return reply;
    try {
      return await deploy(body.role);
    } catch (err) {
      if (err instanceof DeployError) {
        return reply.code(500).send({ error: err.message, steps: err.steps });
      }
      throw err;
    }
  });

  app.get(API_ROUTES.config(":service"), async (request, reply): Promise<ConfigResponse | FastifyReply> => {
    const service = ServiceNameSchema.safeParse((request.params as { service?: string }).service);
    if (!service.success) {
      void reply.code(400).send({ error: "Unknown service; expected 'dnsmasq' or 'keepalived'" });
      return reply;
    }
    return getConfig(service.data);
  });

  app.put(API_ROUTES.config(":service"), async (request, reply): Promise<PutConfigResponse | FastifyReply> => {
    const service = ServiceNameSchema.safeParse((request.params as { service?: string }).service);
    if (!service.success) {
      void reply.code(400).send({ error: "Unknown service; expected 'dnsmasq' or 'keepalived'" });
      return reply;
    }
    const body = parseBody(reply, PutConfigRequestSchema, request.body);
    if (!body) return reply;
    try {
      return await putConfig(service.data, body);
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "Failed to update config",
      });
    }
  });

  return app;
}
