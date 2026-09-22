/**
 * Shared API contract between the dnsmasq-ha agent and the management UI.
 *
 * Everything the two sides agree on lives here: request/response schemas
 * (zod), derived TypeScript types, route constants, and the default config
 * templates embedded by the agent and prefilled by the UI.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Common enums
// ---------------------------------------------------------------------------

/** keepalived node role inside the HA pair. */
export const RoleSchema = z.enum(["master", "backup"]);
export type Role = z.infer<typeof RoleSchema>;

/** Managed service names. Each maps to a well-known config file path. */
export const ServiceNameSchema = z.enum(["dnsmasq", "keepalived"]);
export type ServiceName = z.infer<typeof ServiceNameSchema>;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** systemd state of one service. `null` means "unknown" (e.g. no systemd). */
export interface ServiceStatus {
  active: boolean | null;
  enabled: boolean | null;
}

/** Response of `GET /api/v1/status`. */
export interface StatusResponse {
  hostname: string;
  platform: string;
  services: {
    dnsmasq: ServiceStatus;
    keepalived: ServiceStatus;
  };
  /** keepalived state as configured in its config file, not runtime state. */
  keepalivedState: "MASTER" | "BACKUP" | "UNKNOWN";
  /** First IPv4 found in the `virtual_ipaddress` block, if any. */
  vip: string | null;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

/** Request of `POST /api/v1/deploy`. */
export const DeployRequestSchema = z.object({
  role: RoleSchema,
});
export type DeployRequest = z.infer<typeof DeployRequestSchema>;

/** One executed command inside a deployment. */
export interface DeployStep {
  command: string;
  ok: boolean;
  output: string;
}

/** Response of `POST /api/v1/deploy`. */
export interface DeployResponse {
  steps: DeployStep[];
  /** True when the keepalived template was written (file was missing). */
  configWritten: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Response of `GET /api/v1/config/:service`. */
export interface ConfigResponse {
  service: ServiceName;
  path: string;
  exists: boolean;
  content: string | null;
}

/** Request of `PUT /api/v1/config/:service`. */
export const PutConfigRequestSchema = z.object({
  content: z.string().min(1),
  restart: z.boolean().default(true),
});
export type PutConfigRequest = z.infer<typeof PutConfigRequestSchema>;

/** Response of `PUT /api/v1/config/:service`. */
export interface PutConfigResponse {
  service: ServiceName;
  path: string;
  restarted: boolean;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const API_VERSION = "v1";

export const API_ROUTES = {
  status: `/api/${API_VERSION}/status`,
  deploy: `/api/${API_VERSION}/deploy`,
  /** `service` is a ServiceName, or the literal ":service" when registering
   * a parameterized route on the server side. */
  config: (service: ServiceName | ":service") =>
    `/api/${API_VERSION}/config/${service}`,
} as const;

// ---------------------------------------------------------------------------
// Default config templates
// ---------------------------------------------------------------------------

/**
 * Default keepalived configuration for the MASTER node. Edit the interface,
 * VIP and auth_pass to match the environment before deploying.
 */
export const KEEPALIVED_MASTER_TEMPLATE = `global_defs {
   notification_email {
   }
   router_id DNSMASQ_1
}
vrrp_script chk_dnsmasq {
    script "killall -0 dnsmasq"
    interval 2
}
vrrp_instance VI_10 {
    state MASTER
    interface eth0
    garp_master_delay 10
    virtual_router_id 10
    nopreempt
    priority 150
    advert_int 4
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        192.168.1.233/24 brd 192.168.1.255 dev eth0
    }
    track_script {
        chk_dnsmasq
    }
}
`;

/**
 * Default keepalived configuration for the BACKUP node. Edit the interface,
 * VIP and auth_pass to match the environment before deploying.
 */
export const KEEPALIVED_BACKUP_TEMPLATE = `global_defs {
   notification_email {
   }
   router_id DNSMASQ_2
}
vrrp_script chk_dnsmasq {
    script "killall -0 dnsmasq"
    interval 2
}
vrrp_instance VI_10 {
    state BACKUP
    interface eth0
    garp_master_delay 10
    virtual_router_id 10
    nopreempt
    priority 100
    advert_int 4
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        192.168.1.233/24 brd 192.168.1.255 dev eth0
    }
    track_script {
        chk_dnsmasq
    }
}
`;

/** Default dnsmasq configuration used as a starting point for editing. */
export const DNSMASQ_TEMPLATE = `# dnsmasq-ha managed configuration
# Basic recursive resolver with caching. Adjust to your environment.

# Listen on the LAN interface only
interface=eth0
bind-interfaces

# Never forward plain names (without a dot) or reverse lookups for private ranges
domain-needed
bogus-priv

# Upstream DNS servers (dnsmasq is not authoritative here)
no-resolv
server=8.8.8.8
server=8.8.4.4

# Cache settings
cache-size=1000
`;
