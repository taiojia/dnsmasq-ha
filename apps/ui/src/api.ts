import { API_ROUTES } from "@dnsmasq-ha/contract";
import type {
  ConfigResponse,
  DeployResponse,
  PutConfigResponse,
  Role,
  ServiceName,
  StatusResponse,
} from "@dnsmasq-ha/contract";

/** Error thrown for any failed agent API call. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
    /** Raw parsed response body, when available (e.g. deploy step logs). */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thin HTTP client for one agent node. */
export class AgentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = this.baseUrl.replace(/\/+$/, "") + path;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      throw new ApiError(
        `Cannot reach agent at ${url}`,
        0,
        err instanceof Error ? err.message : undefined,
      );
    }
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      detail?: string;
    } | null;
    if (!res.ok) {
      throw new ApiError(
        body?.error ?? res.statusText,
        res.status,
        body?.detail,
        body,
      );
    }
    return body as T;
  }

  status(): Promise<StatusResponse> {
    return this.request<StatusResponse>(API_ROUTES.status);
  }

  deploy(role: Role): Promise<DeployResponse> {
    return this.request<DeployResponse>(API_ROUTES.deploy, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  }

  getConfig(service: ServiceName): Promise<ConfigResponse> {
    return this.request<ConfigResponse>(API_ROUTES.config(service));
  }

  putConfig(service: ServiceName, content: string): Promise<PutConfigResponse> {
    return this.request<PutConfigResponse>(API_ROUTES.config(service), {
      method: "PUT",
      body: JSON.stringify({ content, restart: true }),
    });
  }
}

/** Human-readable message for any thrown error. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.detail ? `${err.message}: ${err.detail}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
