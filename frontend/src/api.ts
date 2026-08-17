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
      // Attach body to Error for richer UI reporting
      const err: any = new ApiError(res.status, detail);
      err.body = body;
      throw err;
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

export interface Contact {
  id: string;
  phone_e164: string;
  full_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  opt_in_status: string;
  source: string;
  created_at: string;
}

export interface ContactsListResponse {
  data: Contact[];
  pagination: { page: number; page_size: number; total: number };
}

export interface ContactsListParams {
  search?: string;
  branch_id?: string;
  segment?: string;
  page?: number;
  page_size?: number;
}

export interface UploadPreviewRow {
  row: number;
  phone_e164: string;
  full_name?: string | null;
  segment?: string | null;
  branch?: string | null;
}

export interface UploadError {
  row: number;
  phone_raw?: string | null;
  reason: string;
}

export interface UploadResponse {
  upload_id: string | null;
  total_rows: number;
  valid: number;
  invalid: number;
  skipped_empty: number;
  preview_rows: UploadPreviewRow[];
  errors: UploadError[];
  committed: boolean;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export interface TemplateVariableDef {
  index: number;
  description?: string;
  example?: string;
}

export interface TemplateRow {
  id: string;
  waba_id: string;
  name: string;
  language_code: string;
  category: string;
  status: string;
  body_text: string;
  variable_definitions: TemplateVariableDef[];
}

export interface TemplatesListResponse {
  data: TemplateRow[];
}

// ─── Phone numbers ─────────────────────────────────────────────────────────

export interface PhoneNumberRow {
  id: string;
  display_phone_number: string;
  meta_phone_number_id: string;
  is_test_number: boolean;
  status: string;
  waba_id: string;
  waba_business_name: string;
}

export interface PhoneNumbersListResponse {
  data: PhoneNumberRow[];
}

// ─── Broadcasts (aligned with backend broadcasts.py) ────────────────────────

export type BroadcastStatus =
  | "draft" | "scheduled" | "queued" | "running"
  | "completed" | "failed" | "canceled";
export interface BroadcastListRow {
  id: string;
  name: string;
  branch_name: string;
  template_name: string;
  status: BroadcastStatus;
  recipient_count: number;
  scheduled_for: string | null;
  created_at: string;
}

export interface BroadcastsListResponse {
  data: BroadcastListRow[];
  pagination: { page: number; page_size: number; total: number };
}

export interface BroadcastCreatePayload {
  name: string;
  branch_id: string;               // always required
  phone_number_id: string;
  template_id: string;
  variable_mappings: Record<string, string>;  // key is variable NAME, e.g. "one","two"
  audience_type: "all_contacts" | "branch_group" | "csv_upload";
  audience_config: Record<string, unknown>;   // {} for all_contacts and branch_group
  lane?: "transactional" | "bulk";            // default bulk
  schedule?: "immediate" | "scheduled";       // default immediate
  scheduled_for?: string | null;
}

export interface BroadcastDetail {
  id: string;
  name: string;
  status: BroadcastStatus;
  branch: { id: string; name: string };
  template: { id: string; name: string; language_code?: string };
  phone: { id: string; display_phone_number: string };
  audience_type: string;
  audience_config: Record<string, unknown>;
  variable_mappings: Record<string, string>;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  stats: {
    total_recipients: number;
    total_sent: number;
    total_delivered: number;
    total_read: number;
    total_failed: number;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
  };
}

export interface SendResponse {
  status: string;
  campaign_id: string;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  me: (token: string) => request<Me>("/me", { token }),

  branches: (token: string, tenantId: string) =>
    request<{ data: Branch[] }>("/branches", { token, tenantId }),

  contacts: (
    token: string,
    tenantId: string,
    params?: ContactsListParams,
  ) =>
    request<ContactsListResponse>(`/contacts${qs(params)}`, {
      token,
      tenantId,
    }),

  contactsCount: (token: string, tenantId: string) =>
    request<{ count: number }>("/contacts/count", { token, tenantId }),

  uploadContacts: async (
    token: string,
    tenantId: string,
    opts: { file: File; branch_id: string; commit: boolean },
  ): Promise<UploadResponse> => {
    // FormData path — cannot go through the JSON request() helper.
    const fd = new FormData();
    fd.append("file", opts.file);
    const url = `${API_URL}/contacts/upload${qs({
      branch_id: opts.branch_id,
      commit: opts.commit,
    })}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": tenantId,
      },
      body: fd,
    });
    if (!res.ok) {
      let detail = res.statusText || "Upload failed";
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail);
    }
    return res.json();
  },

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

  templates: (token: string, tenantId: string) =>
    request<TemplatesListResponse>("/templates", { token, tenantId }),

  phoneNumbers: (token: string, tenantId: string) =>
    request<PhoneNumbersListResponse>("/phone-numbers", { token, tenantId }),

  broadcasts: (
    token: string,
    tenantId: string,
    params?: { page?: number; page_size?: number; status?: string },
  ) =>
    request<BroadcastsListResponse>(`/broadcasts${qs(params)}`, {
      token,
      tenantId,
    }),

  createBroadcast: (
    token: string,
    tenantId: string,
    payload: BroadcastCreatePayload,
  ) =>
    request<BroadcastDetail>("/broadcasts", {
      method: "POST",
      token,
      tenantId,
      body: payload,
    }),

  sendBroadcast: (token: string, tenantId: string, broadcastId: string) =>
    request<SendResponse>(`/broadcasts/${broadcastId}/send`, {
      method: "POST",
      token,
      tenantId,
    }),

  cancelBroadcast: (token: string, tenantId: string, broadcastId: string) =>
    request<{ status: string; campaign_id: string }>(
      `/broadcasts/${broadcastId}/cancel`,
      {
        method: "POST",
        token,
        tenantId,
      }
    ),
};

export { API_URL };
