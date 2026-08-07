/**
 * API client — thin fetch wrapper + typed response shapes + endpoint functions.
 *
 * Every call takes the current Supabase JWT and (when tenant-scoped) an
 * activeTenantId. Nothing else in the app talks to the backend directly.
 */

const API_URL: string = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token: string;
  tenantId?: string | null;
}

async function request<T>(path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
  };
  if (opts.tenantId) headers["X-Tenant-Id"] = opts.tenantId;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText || "Request failed";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore body parse errors */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

// ─── Types (mirror the backend response shapes exactly) ──────────────────────

export interface Membership {
  tenant_id: string;
  tenant_name: string;
  role: string;
}

export interface Me {
  id: string;
  email: string;
  full_name: string | null;
  is_platform_admin: boolean;
  memberships: Membership[];
}

export interface Branch {
  id: string;
  name: string;
  branch_type: string;
}

export interface KpiCard {
  value: number;
  trend_pct: number;
  sparkline: number[];
}

export interface DashboardKpis {
  period: { start: string; end: string };
  kpis: {
    total_sent: KpiCard;
    delivered_rate: KpiCard;
    read_rate: KpiCard;
    active_contacts: KpiCard;
  };
}

export interface ActivityPoint {
  date: string;
  sent: number;
  delivered: number;
}

export interface CampaignStatusCounts {
  counts: Record<string, number>;
}

export interface LatestBroadcast {
  id: string;
  name: string;
  branch_name: string;
  status: string;
  recipient_count: number;
  sent_at: string | null;
}

export interface DashboardFilters {
  branch_id?: string;
  start_date?: string;
  end_date?: string;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  me: (token: string) => request<Me>("/me", { token }),

  branches: (token: string, tenantId: string) =>
    request<{ data: Branch[] }>("/branches", { token, tenantId }),

  dashboardKpis: (token: string, tenantId: string, params?: DashboardFilters) =>
    request<DashboardKpis>(`/dashboard/kpis${qs(params)}`, { token, tenantId }),

  dashboardActivity: (
    token: string,
    tenantId: string,
    params?: DashboardFilters,
  ) =>
    request<{ series: ActivityPoint[] }>(
      `/dashboard/activity${qs(params)}`,
      { token, tenantId },
    ),

  dashboardCampaignStatus: (
    token: string,
    tenantId: string,
    params?: { branch_id?: string },
  ) =>
    request<CampaignStatusCounts>(
      `/dashboard/campaign-status${qs(params)}`,
      { token, tenantId },
    ),

  dashboardLatestBroadcasts: (
    token: string,
    tenantId: string,
    params?: { limit?: number; branch_id?: string },
  ) =>
    request<{ data: LatestBroadcast[] }>(
      `/dashboard/latest-broadcasts${qs(params)}`,
      { token, tenantId },
    ),
};

export { API_URL };
