import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, Users, Megaphone, FileText, BarChart2,
  Settings, LogOut, ChevronDown, Search, Filter, Plus,
  Upload, Bell, Check, Clock, Calendar, Building2,
  ArrowUpRight, TrendingUp, X, ChevronRight,
  MessageSquare, Send, ArrowRight, Menu, AlertTriangle,
  FileUp, Activity, Copy, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { ToastProvider, useToast } from "./Toast";
import { FullPageLoader, LoginScreen, useAuth } from "../auth";
import {
  useBranches,
  useBroadcasts,
  useContacts,
  useContactsCount,
  useCreateBroadcast,
  useDashboard,
  usePhoneNumbers,
  useSendBroadcast,
  useCancelBroadcast,
  useTemplates,
  useUploadContacts,
} from "./hooks";
import type { CampaignStatusCounts, LatestBroadcast } from "../api";
import type { UploadResponse } from "../api";
function BroadcastCreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");

  const [templateId, setTemplateId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [audienceType, setAudienceType] = useState<"all_contacts" | "branch_group">("all_contacts");
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});

  const { templates, loading: tplLoading } = useTemplates();
  const { phoneNumbers, loading: phLoading } = usePhoneNumbers();
  const { branches } = useBranches();
  const { create, creating } = useCreateBroadcast();

  const selectedTemplate = templates.find((t) => t.id === templateId);

  useEffect(() => {
    if (!selectedTemplate) { setVariableMappings({}); return; }
    const initial: Record<string, string> = {};
    for (const v of selectedTemplate.variable_definitions ?? []) {
      const key = (v as any).name ?? String((v as any).index);
      initial[key] = "";
    }
    setVariableMappings(initial);
  }, [selectedTemplate?.id]);

  const canSubmit =
    name.trim() && templateId && phoneNumberId && branchId &&
    Object.values(variableMappings).every((v) => v.trim().length > 0) &&
    !creating;

    const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const literalMappings: Record<string, string> = {};
      for (const [k, v] of Object.entries(variableMappings)) {
        literalMappings[k] = `$literal:${v}`;
      }
      await create({
        name: name.trim(),
        branch_id: branchId,
        phone_number_id: phoneNumberId,
        template_id: templateId,
        variable_mappings: literalMappings,
        audience_type: audienceType,
        audience_config: {},
        lane: "bulk",
        schedule: "immediate",
      });
      toast.push({
        variant: "success",
        message: "Campaign created successfully.",
      });
      onDone();
    } catch (err) {
      const e = err as Error & { status?: number; body?: unknown };
      toast.push({
        variant: "error",
        message: "Failed to create campaign",
        detail: e.body ? JSON.stringify(e.body) : e.message,
        status: e.status,
      });
    }
  };


  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <button onClick={onCancel} className="text-sm mb-2" style={{ color: "#2563EB" }}>← Back to campaigns</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#0F172A" }}>Create Broadcast Campaign</h1>
      </div>

      <div className="space-y-4 p-6 rounded-lg" style={{ background: "#fff", border: "1px solid #E2E8F0" }}>
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#334155" }}>Campaign name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Faculty Meeting Oct 25"
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff" }}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#334155" }}>Owning branch</label>
          <select
            value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff" }}
          >
            <option value="">Select a branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#334155" }}>Send from (phone number)</label>
          <select
            value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff" }}
          >
            <option value="">{phLoading ? "Loading…" : "Select a sender number"}</option>
            {phoneNumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_phone_number} — {p.waba_business_name}{p.is_test_number ? " (test)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#334155" }}>Message template</label>
          <select
            value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff" }}
          >
            <option value="">{tplLoading ? "Loading…" : "Select an approved template"}</option>
            {templates.filter((t) => t.status === "approved").map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.language_code})</option>
            ))}
          </select>
          {selectedTemplate && (
            <div className="mt-2 p-3 rounded-md text-xs whitespace-pre-wrap" style={{ background: "#F8FAFC", color: "#475569" }}>
              <div className="font-medium mb-1" style={{ color: "#0F172A" }}>Template body:</div>
              {selectedTemplate.body_text}
            </div>
          )}
        </div>

        {selectedTemplate && (selectedTemplate.variable_definitions?.length ?? 0) > 0 && (
          <div>
            <label className="text-sm font-medium block mb-2" style={{ color: "#334155" }}>Template variables</label>
            <div className="space-y-2">
              {selectedTemplate.variable_definitions.map((v: any) => {
                const key = v.name ?? String(v.index);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "#F1F5F9", color: "#475569" }}>
                      {"{{"}{key}{"}}"}
                    </span>
                    <input
                      value={variableMappings[key] ?? ""}
                      onChange={(e) => setVariableMappings((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={v.description || v.example || `Value for {{${key}}}`}
                      className="flex-1 px-3 py-2 text-sm rounded-md outline-none"
                      style={{ border: "1px solid #E2E8F0", background: "#fff" }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: "#64748B" }}>
              Phase 1: each variable gets the same literal value for every recipient.
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#334155" }}>Audience</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
              <input type="radio" checked={audienceType === "all_contacts"} onChange={() => setAudienceType("all_contacts" as any)} />
              All contacts in this tenant
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
              <input type="radio" checked={audienceType === "branch_group"} onChange={() => setAudienceType("branch_group" as any)} />
              Only the owning branch
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid #E2E8F0" }}>
          <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm" style={{ border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit} disabled={!canSubmit}
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: canSubmit ? "#2563EB" : "#CBD5E1", cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            {creating ? "Creating…" : "Create Campaign (draft)"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Static UI data (unchanged mocks kept for screens not yet wired) ─────────

const contacts = [
  { id: 1, name: "Sarah Mitchell", phone: "+1 212 555 0147", branch: "New York Office", created: "Jun 15, 2025", status: "Active" },
  { id: 2, name: "James Okafor", phone: "+44 20 7946 0318", branch: "London Branch", created: "Jun 18, 2025", status: "Active" },
  { id: 3, name: "Ana Ramirez", phone: "+1 646 555 0892", branch: "New York Office", created: "Jun 22, 2025", status: "Opt-out" },
  { id: 4, name: "Tom Lindqvist", phone: "+46 8 555 0234", branch: "Remote Team", created: "Jul 1, 2025", status: "Active" },
  { id: 5, name: "Priya Nair", phone: "+91 98765 43210", branch: "Remote Team", created: "Jul 3, 2025", status: "Active" },
  { id: 6, name: "Chen Wei", phone: "+86 138 0000 1234", branch: "London Branch", created: "Jul 5, 2025", status: "Active" },
  { id: 7, name: "Marcus Johnson", phone: "+1 917 555 0674", branch: "New York Office", created: "Jul 8, 2025", status: "Active" },
  { id: 8, name: "Fatima Al-Hassan", phone: "+971 50 123 4567", branch: "Remote Team", created: "Jul 10, 2025", status: "Opt-out" },
];

const navItems = [
  { id: "dashboard", label: "Dashboard",            icon: LayoutDashboard },
  { id: "contacts",  label: "Contacts",             icon: Users },
  { id: "campaigns", label: "Broadcast Campaigns",  icon: Megaphone },
    { id: "logs",      label: "Message Logs",         icon: Activity },
  { id: "templates", label: "Message Templates",    icon: FileText },
];

const MESSAGE_TEMPLATES = [
  {
    id: "promo",
    name: "Promotional Offer",
    preview: "Hi {{1}}, we have an exclusive offer just for you! Get {{2}} off your next purchase. Use code {{3}}. Valid until {{4}}.",
    vars: [["{{1}}", "Contact First Name"], ["{{2}}", "Discount Value"], ["{{3}}", "Promo Code"], ["{{4}}", "Expiry Date"]],
  },
  {
    id: "order",
    name: "Order Confirmation",
    preview: "Hello {{1}}, your order #{{2}} has been confirmed. Estimated delivery: {{3}}. Reply TRACK to get updates.",
    vars: [["{{1}}", "Contact First Name"], ["{{2}}", "Order Number"], ["{{3}}", "Delivery Date"]],
  },
  {
    id: "reminder",
    name: "Appointment Reminder",
    preview: "Hi {{1}}, this is a reminder for your appointment on {{2}} at {{3}}. Reply YES to confirm or NO to reschedule.",
    vars: [["{{1}}", "Contact First Name"], ["{{2}}", "Appointment Date"], ["{{3}}", "Time Slot"]],
  },
];

const VAR_VALUES: Record<string, string> = {
  "{{1}}": "Sarah",
  "{{2}}": "20%",
  "{{3}}": "BFRIDAY20",
  "{{4}}": "Nov 30, 2025",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatPercentage(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatWholeNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatSignedNumber(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatTrendPct(value: number): string {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function humanizeStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    queued: "Queued",
    running: "In Progress",
    completed: "Completed",
    failed: "Failed",
    canceled: "Canceled",
  };
  return map[status] ?? status;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  scheduled: "#F59E0B",
  queued: "#F59E0B",
  running: "#2563EB",
  completed: "#22C55E",
  failed: "#EF4444",
  canceled: "#CBD5E1",
};

function SparkLine({ data, color }: { data: number[]; color: string; seriesKey?: string }) {
  const W = 120, H = 40, pad = 2;
  const cleanData = data.length ? data : [0, 0];
  const min = Math.min(...cleanData);
  const max = Math.max(...cleanData);
  const range = max - min || 1;
  const pts = cleanData.map((v, i) => {
    const x = pad + (i / Math.max(cleanData.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  const linePath = `M${pts.join("L")}`;
  const areaPath = `M${pts[0]}L${pts.join("L")}L${W - pad},${H - pad}L${pad},${H - pad}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={40} style={{ display: "block", overflow: "visible" }}>
      <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; dot?: string }> = {
    Sent:        { bg: "#F0FDF4", fg: "#16A34A", dot: "#22C55E" },
    Scheduled:   { bg: "#FFFBEB", fg: "#B45309", dot: "#F59E0B" },
    Active:      { bg: "#F0FDF4", fg: "#16A34A", dot: "#22C55E" },
    "Opt-out":   { bg: "#F8FAFC", fg: "#64748B", dot: "#94A3B8" },
    Draft:       { bg: "#F8FAFC", fg: "#64748B", dot: "#94A3B8" },
    "In Progress": { bg: "#EFF6FF", fg: "#1D4ED8", dot: "#2563EB" },
    Completed:   { bg: "#F0FDF4", fg: "#16A34A", dot: "#22C55E" },
    Failed:      { bg: "#FEF2F2", fg: "#B91C1C", dot: "#EF4444" },
    Queued:      { bg: "#FFFBEB", fg: "#B45309", dot: "#F59E0B" },
    Canceled:    { bg: "#F8FAFC", fg: "#64748B", dot: "#CBD5E1" },
  };
  const s = map[status] ?? { bg: "#F8FAFC", fg: "#64748B", dot: "#94A3B8" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

function MockDataBanner({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 mx-4 sm:mx-6 lg:mx-8 mt-4 rounded-md"
      style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}
    >
      <AlertTriangle size={13} />
      <p className="text-xs font-medium">
        {label} shows placeholder data. Backend endpoints are live — wiring pending.
      </p>
    </div>
  );
}

// ─── Sidebar (WIRED: tenant switcher, user info, logout) ──────────────────────

function Sidebar({
  active,
  onNavigate,
  open,
  onClose,
}: {
  active: string;
  onNavigate: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { me, activeMembership, setActiveTenantId, signOut } = useAuth();
  const [tenantOpen, setTenantOpen] = useState(false);

  const handleNav = (id: string) => {
    onNavigate(id);
    onClose();
  };

  const otherMemberships = me?.memberships.filter(
    (m) => m.tenant_id !== activeMembership?.tenant_id,
  ) ?? [];

  const displayName = me?.full_name || me?.email || "User";
  const displayRole = activeMembership?.role
    ? activeMembership.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : me?.is_platform_admin ? "Platform Admin" : "";
  const userAvatarInitials = initials(displayName);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full flex flex-col
          transition-transform duration-200
          lg:static lg:translate-x-0 lg:z-auto lg:flex-shrink-0
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ width: "232px", background: "#0F172A" }}
      >
        <div className="flex flex-col gap-3 px-4 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#25D366" }}>
                <MessageSquare size={14} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm tracking-tight leading-none">WA Platform</p>
                <p className="text-[10px] leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>API Dashboard</p>
              </div>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 rounded" style={{ color: "rgba(255,255,255,0.4)" }}>
              <X size={16} />
            </button>
          </div>

          {/* Tenant Switcher */}
          <div className="relative">
            <button
              onClick={() => setTenantOpen(!tenantOpen)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: "#3B82F6" }}>
                  {activeMembership?.tenant_name?.[0] ?? "?"}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-white text-xs font-semibold truncate leading-none mb-0.5">
                    {activeMembership?.tenant_name ?? "No tenant selected"}
                  </p>
                  <p className="text-[10px] leading-none" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {activeMembership ? displayRole : "—"}
                  </p>
                </div>
              </div>
              <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${tenantOpen ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.35)" }} />
            </button>

            {tenantOpen && otherMemberships.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden z-50 shadow-xl" style={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.08)" }}>
                {otherMemberships.map((m) => (
                  <button
                    key={m.tenant_id}
                    onClick={() => { setActiveTenantId(m.tenant_id); setTenantOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/5"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: "#7C3AED" }}>
                      {m.tenant_name[0]}
                    </div>
                    {m.tenant_name}
                  </button>
                ))}
              </div>
            )}
            {tenantOpen && otherMemberships.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden z-50 shadow-xl" style={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-3 py-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  No other tenants to switch to.
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = active === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all text-left"
                style={
                  isActive
                    ? { background: "#2563EB", color: "#ffffff" }
                    : { color: "rgba(255,255,255,0.45)" }
                }
                onMouseEnter={(e) => { if (!isActive) { const el = e.currentTarget as HTMLButtonElement; el.style.color = "rgba(255,255,255,0.85)"; el.style.background = "rgba(255,255,255,0.06)"; }}}
                onMouseLeave={(e) => { if (!isActive) { const el = e.currentTarget as HTMLButtonElement; el.style.color = "rgba(255,255,255,0.45)"; el.style.background = ""; }}}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-0.5 px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0" style={{ background: "linear-gradient(135deg,#3B82F6,#2563EB)" }}>
              {userAvatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate leading-none mb-0.5">{displayName}</p>
              <p className="text-[10px] leading-none truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                {displayRole || "—"}
              </p>
            </div>
            <Bell size={13} style={{ color: "rgba(255,255,255,0.3)" }} className="flex-shrink-0" />
          </div>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "rgba(255,255,255,0.8)"; el.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "rgba(255,255,255,0.4)"; el.style.background = ""; }}
          >
            <Settings size={14} className="flex-shrink-0" />
            Settings
          </button>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ color: "rgba(248,113,113,0.7)" }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "#F87171"; el.style.background = "rgba(248,113,113,0.08)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "rgba(248,113,113,0.7)"; el.style.background = ""; }}
          >
            <LogOut size={14} className="flex-shrink-0" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Mobile Topbar ────────────────────────────────────────────────────────────

function MobileTopbar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 lg:hidden flex-shrink-0"
      style={{ background: "#0F172A", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <button onClick={onMenuOpen} className="p-1.5 rounded-md" style={{ color: "rgba(255,255,255,0.6)" }}>
        <Menu size={18} />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#25D366" }}>
          <MessageSquare size={12} className="text-white" />
        </div>
        <span className="text-white text-sm font-semibold">WA Platform</span>
      </div>
    </div>
  );
}

// ─── Screen 1: Dashboard (WIRED to backend) ───────────────────────────────────

function DashboardScreen() {
  const { activeMembership } = useAuth();
  const { branches } = useBranches();

  // Branch filter — single-select for now (backend accepts one branch_id).
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [dateRange, setDateRange] = useState("Last 7 Days");
  const [dateOpen, setDateOpen] = useState(false);

  const { data, loading, error } = useDashboard(activeBranchId ?? undefined);

  const activeBranchName =
    activeBranchId
      ? branches.find((b) => b.id === activeBranchId)?.name ?? "Unknown"
      : "All Branches";

  const statCards = useMemo(() => {
    if (!data) return [];
    const k = data.kpis.kpis;
    return [
      {
        label: "Total Messages Sent",
        value: formatWholeNumber(k.total_sent.value),
        change: formatTrendPct(k.total_sent.trend_pct),
        data: k.total_sent.sparkline,
        color: "#2563EB",
      },
      {
        label: "Delivered Rate",
        value: formatPercentage(k.delivered_rate.value),
        change: formatTrendPct(k.delivered_rate.trend_pct),
        data: k.delivered_rate.sparkline,
        color: "#22C55E",
      },
      {
        label: "Read Rate",
        value: formatPercentage(k.read_rate.value),
        change: formatTrendPct(k.read_rate.trend_pct),
        data: k.read_rate.sparkline,
        color: "#8B5CF6",
      },
      {
        label: "Active Contacts",
        value: formatWholeNumber(k.active_contacts.value),
        change: formatSignedNumber(k.active_contacts.trend_pct),
        data: k.active_contacts.sparkline,
        color: "#F59E0B",
      },
    ];
  }, [data]);

  const messagingData = useMemo(
    () =>
      data?.activity.map((p) => ({
        date: shortDate(p.date),
        sent: p.sent,
        delivered: p.delivered,
      })) ?? [],
    [data],
  );

  const campaignStatus = useMemo(() => {
    const counts: Record<string, number> = data?.campaignCounts ?? {};
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name: humanizeStatus(status),
        value,
        color: STATUS_COLORS[status] ?? "#94A3B8",
      }));
  }, [data]);

  const totalCampaigns = campaignStatus.reduce((sum, s) => sum + s.value, 0);

  const broadcasts = useMemo(
    () =>
      data?.latest.map((b: LatestBroadcast) => ({
        name: b.name,
        branch: b.branch_name,
        status: humanizeStatus(b.status),
        time: b.sent_at ? timeAgo(b.sent_at) : "—",
        reach: b.recipient_count.toLocaleString(),
      })) ?? [],
    [data],
  );

  const dateRangeLabel = data
    ? `${shortDate(data.kpis.period.start)} – ${shortDate(data.kpis.period.end)}, ${new Date(data.kpis.period.end).getFullYear()}`
    : "";

  return (
    <div
      className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 w-full"
      onClick={() => { setBranchOpen(false); setDateOpen(false); }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold" style={{ color: "#0F172A" }}>
            Welcome Back{data?.kpis ? "" : "…"}
          </h1>
          <p className="text-sm" style={{ color: "#64748B" }}>
            {activeMembership?.tenant_name ?? "—"} · {activeBranchName} · {dateRange}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setBranchOpen(!branchOpen); setDateOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-md text-sm font-medium transition-colors"
              style={{ border: "1px solid #E2E8F0", color: "#374151", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <Building2 size={14} style={{ color: "#94A3B8" }} />
              <span className="hidden sm:inline">{activeBranchName}</span>
              <span className="sm:hidden">Branches</span>
              <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${branchOpen ? "rotate-180" : ""}`} />
            </button>
            {branchOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Filter by Branch</p>
                </div>
                <button
                  onClick={() => { setActiveBranchId(null); setBranchOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                  style={{ color: activeBranchId === null ? "#2563EB" : "#374151", background: activeBranchId === null ? "#EFF6FF" : "transparent" }}
                >
                  <div className="w-4 h-4 rounded flex items-center justify-center" style={{ border: activeBranchId === null ? "none" : "1px solid #CBD5E1", background: activeBranchId === null ? "#2563EB" : "transparent" }}>
                    {activeBranchId === null && <Check size={10} className="text-white" />}
                  </div>
                  All Branches
                </button>
                {branches.map((branch) => {
                  const checked = activeBranchId === branch.id;
                  return (
                    <button
                      key={branch.id}
                      onClick={() => { setActiveBranchId(branch.id); setBranchOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                      style={{ color: checked ? "#2563EB" : "#374151", background: checked ? "#EFF6FF" : "transparent" }}
                    >
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ border: checked ? "none" : "1px solid #CBD5E1", background: checked ? "#2563EB" : "transparent" }}>
                        {checked && <Check size={10} className="text-white" />}
                      </div>
                      {branch.name}
                    </button>
                  );
                })}
                {branches.length === 0 && (
                  <div className="px-3 py-2 text-xs" style={{ color: "#94A3B8" }}>
                    No branches for this tenant yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date Range (visual only for now — hardcoded to last 7 days server-side) */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setDateOpen(!dateOpen); setBranchOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-md text-sm font-medium transition-colors"
              style={{ border: "1px solid #E2E8F0", color: "#374151", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <Calendar size={14} style={{ color: "#94A3B8" }} />
              <span className="hidden sm:inline">{dateRange}</span>
              <span className="sm:hidden">Date</span>
              <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${dateOpen ? "rotate-180" : ""}`} />
            </button>
            {dateOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                {["Last 7 Days", "Last 30 Days", "Last 90 Days"].map((d) => (
                  <button key={d} onClick={() => { setDateRange(d); setDateOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                    style={{ color: dateRange === d ? "#2563EB" : "#374151", background: dateRange === d ? "#EFF6FF" : "transparent" }}>
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-md"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}
        >
          <AlertTriangle size={13} />
          <p className="text-xs font-medium">Failed to load dashboard: {error}</p>
        </div>
      )}

      {loading && !data && (
        <p className="text-sm" style={{ color: "#94A3B8" }}>Loading dashboard…</p>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="flex flex-col gap-1 bg-white rounded-lg p-5" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-snug" style={{ color: "#64748B" }}>{card.label}</p>
              <span className="text-xs font-semibold flex items-center gap-0.5 flex-shrink-0" style={{ color: card.change.startsWith("-") ? "#DC2626" : "#16A34A" }}>
                <TrendingUp size={11} />{card.change}
              </span>
            </div>
            <p className="text-[26px] font-semibold leading-tight" style={{ color: "#0F172A" }}>{card.value}</p>
            <SparkLine data={card.data} color={card.color} />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="flex flex-col gap-4 bg-white rounded-lg p-5 lg:col-span-2" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Messaging Activity Overview</h3>
              <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{dateRangeLabel}</p>
            </div>
            <div className="flex items-center gap-4">
              {[{ label: "Sent", color: "#2563EB" }, { label: "Delivered", color: "#22C55E" }].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#64748B" }}>
                  <div className="w-5 h-[2px] rounded" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={messagingData} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid key="lc-grid" strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis key="lc-xaxis" dataKey="date" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis key="lc-yaxis" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip key="lc-tooltip" contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "8px 12px" }} labelStyle={{ color: "#374151", fontWeight: 600 }} />
              <Line key="lc-sent" type="monotone" dataKey="sent" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }} />
              <Line key="lc-delivered" type="monotone" dataKey="delivered" stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#22C55E", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Donut */}
        <div className="flex flex-col gap-1 bg-white rounded-lg p-5" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Campaign Status</h3>
          <p className="text-xs mb-2" style={{ color: "#94A3B8" }}>{totalCampaigns} total campaigns</p>
          <ResponsiveContainer width="100%" height={148}>
            <PieChart>
              <Pie key="pc-pie" data={campaignStatus} cx="50%" cy="50%" innerRadius={46} outerRadius={66} paddingAngle={2.5} dataKey="value" strokeWidth={0}>
                {campaignStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip key="pc-tooltip" contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2.5 mt-1">
            {campaignStatus.length === 0 && (
              <p className="text-xs" style={{ color: "#94A3B8" }}>No campaigns yet.</p>
            )}
            {campaignStatus.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span style={{ color: "#64748B" }}>{item.name}</span>
                </div>
                <span className="font-semibold" style={{ color: "#1E293B" }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Latest Broadcasts */}
      <div className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Latest Broadcasts</h3>
          <button className="text-xs font-medium flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: "#2563EB" }}>
            View All <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr style={{ borderBottom: "1px solid #F8FAFC" }}>
                {["Campaign Name", "Branch", "Status", "Time"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#94A3B8" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {broadcasts.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-sm" style={{ color: "#94A3B8" }}>
                    No broadcasts yet.
                  </td>
                </tr>
              )}
              {broadcasts.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: i < broadcasts.length - 1 ? "1px solid #F8FAFC" : "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium" style={{ color: "#1E293B" }}>{row.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{row.reach} recipients</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-sm whitespace-nowrap" style={{ color: "#475569" }}>
                      <Building2 size={13} style={{ color: "#CBD5E1" }} className="flex-shrink-0" />
                      {row.branch}
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={row.status} /></td>
                  <td className="px-5 py-3.5 text-sm whitespace-nowrap" style={{ color: "#64748B" }}>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 2: Contacts (STILL MOCK — banner shows this) ─────────────────────

// ─── Phone normalization helpers (mirrors backend) ──────────────────────────

/**
 * Normalize a raw phone string to E.164.
 *
 * Handles common local-format inputs by prepending a default country code
 * when appropriate. Rules:
 *   - Strip everything except digits and a single leading '+'
 *   - If input starts with '+', preserve as-is (assume user gave country code)
 *   - If input starts with '00', treat as international prefix → replace with '+'
 *   - Otherwise, strip a single leading '0' (local trunk prefix) and prepend
 *     the default country code
 *   - Reject if final digit count is <8 (too short to be a real phone) or
 *     >15 (E.164 max length)
 *
 * @param raw the user's input line
 * @param defaultCountryCode digits only, no '+'. e.g. "92" for Pakistan
 */
function normalizePhoneToE164(
  raw: string,
  defaultCountryCode: string = "92",
): { ok: true; e164: string } | { ok: false; reason: string } {
  if (!raw) return { ok: false, reason: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  // Strip everything except digits and leading '+'
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  if (!cleaned) return { ok: false, reason: "no_digits" };

  let digits: string;

  if (cleaned.startsWith("+")) {
    // User provided country code — trust them
    digits = cleaned.slice(1).replace(/\+/g, "");
  } else if (cleaned.startsWith("00")) {
    // International prefix (some regions dial 00 instead of +)
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    // Local format with trunk-line leading 0 — strip and prepend CC
    digits = defaultCountryCode + cleaned.slice(1);
  } else {
    // No prefix — assume already includes country code
    digits = cleaned;
  }

  if (!digits) return { ok: false, reason: "no_digits" };
  if (digits.length < 8) return { ok: false, reason: "too_short" };
  if (digits.length > 15) return { ok: false, reason: "too_long" };

  return { ok: true, e164: `+${digits}` };
}

interface ParsedPhoneLine {
  raw: string;
  status: "valid" | "invalid" | "empty";
  e164?: string;
  reason?: string;
}

function parsePastedPhones(text: string, defaultCountryCode: string = "92"): ParsedPhoneLine[] {
  const lines = text.split(/[\r\n]+/);
  const out: ParsedPhoneLine[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.trim()) {
      out.push({ raw: line, status: "empty" });
      continue;
    }
    const norm = normalizePhoneToE164(line, defaultCountryCode);
    if (!norm.ok) {
      out.push({ raw: line, status: "invalid", reason: norm.reason });
      continue;
    }
    if (seen.has(norm.e164)) {
      out.push({ raw: line, status: "invalid", reason: "duplicate" });
      continue;
    }
    seen.add(norm.e164);
    out.push({ raw: line, status: "valid", e164: norm.e164 });
  }
  return out;
}

/**
 * Turn parsed phones into a synthetic CSV File that the existing
 * /contacts/upload endpoint accepts. Header row uses `phone` as the column
 * name — matches the backend's alias-matching (accepts phone, phone_number,
 * mobile, contact, etc.).
 */
function phonesToCsvFile(parsed: ParsedPhoneLine[]): File {
  const rows = ["phone"];
  for (const p of parsed) {
    if (p.status === "valid" && p.e164) rows.push(p.e164);
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  return new File([blob], "pasted-phones.csv", { type: "text/csv" });
}

function ContactsScreen() {
  const toast = useToast();
  const [search, setSearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [uploadMode, setUploadMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  const [pendingPreview, setPendingPreview] = useState<{
    file: File;
    branchId: string;
    preview: UploadResponse;
    source: "file" | "paste";
  } | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live parse of pasted text for the preview counter
  const parsedPastes = useMemo(
    () => (uploadMode === "paste" ? parsePastedPhones(pastedText) : []),
    [uploadMode, pastedText],
  );
  const validPastedCount = parsedPastes.filter((p) => p.status === "valid").length;
  const invalidPastedCount = parsedPastes.filter((p) => p.status === "invalid").length;

  const { branches } = useBranches();
  const { count: countData } = useContactsCount() as { count: number | null };

  const selectedBranch = branchFilter || undefined;
  const pageSize = 25;
  const contactsParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      branchId: selectedBranch,
      page,
      pageSize,
    }),
    [debouncedSearch, selectedBranch, page, pageSize],
  );

  const { data, loading, error, refresh } = useContacts(contactsParams);
  const { upload, uploading } = useUploadContacts();

  // Debounce search (300ms) so we don't fire a request every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever the filter set changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, branchFilter]);

    const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const branchId = branchFilter || branches[0]?.id;
    if (!branchId) {
      toast.push({ variant: "error", message: "Branch Required", detail: "Please select a branch before uploading contacts." });
      return;
    }
    try {
      const preview = await upload(file, branchId, false);
      setPendingPreview({ file, branchId, preview, source: "file" });
      setShowUploadDialog(false);
    } catch (err) {
      const ex = err as Error & { status?: number; body?: any };
      toast.push({
        variant: "error",
        message: "Upload Failed",
        detail: ex.body ? JSON.stringify(ex.body) : ex.message,
        status: ex.status,
      });
    }
  };

  const handlePasteSubmit = async () => {
    const branchId = branchFilter || branches[0]?.id;
    if (!branchId) {
      toast.push({ variant: "error", message: "Branch Required", detail: "Please select a branch before uploading contacts." });
      return;
    }
    if (validPastedCount === 0) {
      toast.push({ variant: "error", message: "No Valid Numbers", detail: "No valid phone numbers to import." });
      return;
    }
    const file = phonesToCsvFile(parsedPastes);
    try {
      const preview = await upload(file, branchId, false);
      setPendingPreview({ file, branchId, preview, source: "paste" });
      setShowUploadDialog(false);
      setPastedText("");
    } catch (err) {
      const ex = err as Error & { status?: number; body?: any };
      toast.push({
        variant: "error",
        message: "Upload Failed",
        detail: ex.body ? JSON.stringify(ex.body) : ex.message,
        status: ex.status,
      });
    }
  };

  const confirmCommit = async () => {
    if (!pendingPreview) return;
    try {
      const result = await upload(
        pendingPreview.file,
        pendingPreview.branchId,
        true,
      );
      setUploadResult(result);
      setPendingPreview(null);
      refresh();
      toast.push({ variant: "success", message: "Import Complete", detail: `Imported ${result.valid} contacts.` });
    } catch (err) {
      const ex = err as Error & { status?: number; body?: any };
      toast.push({
        variant: "error",
        message: "Commit Failed",
        detail: ex.body ? JSON.stringify(ex.body) : ex.message,
        status: ex.status,
      });
    }
  };


  const contacts = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#0F172A" }}>
            Contacts
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748B" }}>
            {countData !== null
              ? `${countData.toLocaleString()} total contacts`
              : "Loading count…"}
          </p>
        </div>
        <div>
          <button
            onClick={() => setShowUploadDialog(true)}
            disabled={branches.length === 0}
            className="px-4 py-2 rounded-md text-sm font-medium text-white flex items-center gap-2"
            style={{
              background: branches.length === 0 ? "#CBD5E1" : "#2563EB",
              cursor: branches.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <Upload size={16} />
            Import Contacts
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "#94A3B8" }}
          />
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff" }}
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-md outline-none"
          style={{ border: "1px solid #E2E8F0", background: "#fff" }}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div
          className="mb-4 p-3 rounded-md text-sm flex items-start justify-between"
          style={{
            background: uploadResult.valid > 0 ? "#F0FDF4" : "#FEFCE8",
            border: `1px solid ${uploadResult.valid > 0 ? "#BBF7D0" : "#FEF08A"}`,
            color: uploadResult.valid > 0 ? "#166534" : "#854D0E",
          }}
        >
          <span>
            {uploadResult.valid > 0 && (
              <>
                Imported <strong>{uploadResult.valid}</strong> new contact{uploadResult.valid !== 1 && "s"}.
              </>
            )}
            {uploadResult.invalid > 0 && (
              <>
                {" "}
                {uploadResult.invalid} {uploadResult.valid > 0 ? "skipped" : "not imported"} (already exist or invalid format).
              </>
            )}
            {uploadResult.skipped_empty > 0 &&
              ` ${uploadResult.skipped_empty} empty rows skipped.`}
          </span>
          <button onClick={() => setUploadResult(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid #E2E8F0", background: "#fff" }}
      >
        {error && (
          <div className="p-4 text-sm" style={{ color: "#B91C1C" }}>
            Failed to load contacts: {error}
          </div>
        )}
        {loading && !data && (
          <div className="p-8 text-center text-sm" style={{ color: "#64748B" }}>
            Loading contacts…
          </div>
        )}
        {!loading && contacts.length === 0 && !error && (
          <div className="p-8 text-center text-sm" style={{ color: "#64748B" }}>
            No contacts match these filters. Import a CSV to get started.
          </div>
        )}
        {contacts.length > 0 && (
          <table className="w-full text-sm">
            <thead style={{ background: "#F8FAFC" }}>
              <tr>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Name</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Phone</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Branch</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Opt-in</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Source</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td className="px-4 py-2" style={{ color: "#0F172A" }}>
                    {c.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: "#334155" }}>
                    {c.phone_e164}
                  </td>
                  <td className="px-4 py-2" style={{ color: "#475569" }}>
                    {c.branch_name ?? "—"}
                  </td>
                  <td className="px-4 py-2" style={{ color: "#475569" }}>
                    {c.opt_in_status}
                  </td>
                  <td className="px-4 py-2" style={{ color: "#475569" }}>
                    {c.source}
                  </td>
                  <td className="px-4 py-2" style={{ color: "#64748B" }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span style={{ color: "#64748B" }}>
            Page {page} of {totalPages} — {total.toLocaleString()} total
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-md"
              style={{
                border: "1px solid #E2E8F0",
                background: "#fff",
                color: page === 1 ? "#CBD5E1" : "#0F172A",
                cursor: page === 1 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded-md"
              style={{
                border: "1px solid #E2E8F0",
                background: "#fff",
                color: page >= totalPages ? "#CBD5E1" : "#0F172A",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Upload mode chooser dialog */}
      {showUploadDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 100,
          }}
        >
          <div
            className="rounded-lg max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            style={{ background: "#fff" }}
          >
            <div
              className="p-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #E2E8F0" }}
            >
              <h2 className="font-semibold" style={{ color: "#0F172A" }}>
                Import Contacts
              </h2>
              <button
                onClick={() => {
                  setShowUploadDialog(false);
                  setPastedText("");
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 px-4 pt-3" style={{ borderBottom: "1px solid #E2E8F0" }}>
              <button
                onClick={() => setUploadMode("file")}
                className="px-3 py-2 text-sm font-medium"
                style={{
                  color: uploadMode === "file" ? "#2563EB" : "#64748B",
                  borderBottom: uploadMode === "file" ? "2px solid #2563EB" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                Upload CSV file
              </button>
              <button
                onClick={() => setUploadMode("paste")}
                className="px-3 py-2 text-sm font-medium"
                style={{
                  color: uploadMode === "paste" ? "#2563EB" : "#64748B",
                  borderBottom: uploadMode === "paste" ? "2px solid #2563EB" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                Paste phone numbers
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              {uploadMode === "file" && (
                <div>
                  <p className="text-sm mb-4" style={{ color: "#475569" }}>
                    CSV with a <code>phone</code> column (also accepts <code>phone_number</code>, <code>mobile</code>, <code>contact</code>). Optional columns:{" "}
                    <code>name</code>, <code>segment</code>.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileChosen}
                    style={{ display: "none" }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-8 rounded-md text-sm font-medium flex flex-col items-center gap-2"
                    style={{
                      border: "2px dashed #CBD5E1",
                      background: uploading ? "#F1F5F9" : "#F8FAFC",
                      color: "#2563EB",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    <Upload size={24} />
                    {uploading ? "Uploading…" : "Choose CSV file"}
                  </button>
                </div>
              )}

              {uploadMode === "paste" && (
                <div>
                  <p className="text-sm mb-3" style={{ color: "#475569" }}>
                    Paste phone numbers, one per line. Any format works — we'll normalize to E.164.
                  </p>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`+92 300 1234567\n03001234567\n(212) 555-0100\n...`}
                    rows={10}
                    className="w-full px-3 py-2 text-sm font-mono rounded-md outline-none"
                    style={{
                      border: "1px solid #E2E8F0",
                      background: "#fff",
                      color: "#0F172A",
                      resize: "vertical",
                    }}
                  />
                  {pastedText.trim() && (
                    <div className="mt-3 flex gap-4 text-xs">
                      <span style={{ color: "#16A34A" }}>
                        <strong>{validPastedCount}</strong> valid
                      </span>
                      {invalidPastedCount > 0 && (
                        <span style={{ color: "#DC2626" }}>
                          <strong>{invalidPastedCount}</strong> invalid or duplicate
                        </span>
                      )}
                    </div>
                  )}
                  {invalidPastedCount > 0 && (
                    <details className="mt-2 text-xs">
                      <summary style={{ cursor: "pointer", color: "#64748B" }}>
                        Show rejected lines
                      </summary>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {parsedPastes
                          .filter((p) => p.status === "invalid")
                          .slice(0, 20)
                          .map((p, i) => (
                            <div key={i} className="flex gap-2 py-0.5">
                              <span className="font-mono" style={{ color: "#334155" }}>
                                {p.raw.trim() || "(empty)"}
                              </span>
                              <span style={{ color: "#DC2626" }}>— {p.reason}</span>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {uploadMode === "paste" && (
              <div
                className="p-4 flex justify-end gap-2"
                style={{ borderTop: "1px solid #E2E8F0" }}
              >
                <button
                  onClick={() => {
                    setShowUploadDialog(false);
                    setPastedText("");
                  }}
                  className="px-4 py-2 rounded-md text-sm"
                  style={{ border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasteSubmit}
                  disabled={uploading || validPastedCount === 0}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{
                    background: uploading || validPastedCount === 0 ? "#CBD5E1" : "#2563EB",
                    cursor: uploading || validPastedCount === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Preparing…" : `Preview ${validPastedCount} phones`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview dialog — shown after upload preview succeeds, before commit */}
      {pendingPreview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 100,
          }}
        >
          <div
            className="rounded-lg max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            style={{ background: "#fff" }}
          >
            <div
              className="p-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #E2E8F0" }}
            >
              <h2 className="font-semibold" style={{ color: "#0F172A" }}>
                CSV Import Preview
              </h2>
              <button onClick={() => setPendingPreview(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
                <div>
                  <div style={{ color: "#64748B" }}>Total rows</div>
                  <div className="font-semibold" style={{ color: "#0F172A" }}>
                    {pendingPreview.preview.total_rows}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#64748B" }}>Valid</div>
                  <div className="font-semibold" style={{ color: "#16A34A" }}>
                    {pendingPreview.preview.valid}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#64748B" }}>Invalid</div>
                  <div className="font-semibold" style={{ color: "#DC2626" }}>
                    {pendingPreview.preview.invalid}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#64748B" }}>Empty skipped</div>
                  <div className="font-semibold" style={{ color: "#64748B" }}>
                    {pendingPreview.preview.skipped_empty}
                  </div>
                </div>
              </div>

              {pendingPreview.preview.preview_rows.length > 0 && (
                <div className="mb-4">
                  <div
                    className="text-xs uppercase font-medium mb-2"
                    style={{ color: "#64748B" }}
                  >
                    First {pendingPreview.preview.preview_rows.length} valid rows
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1" style={{ color: "#475569" }}>
                          Row
                        </th>
                        <th className="text-left py-1" style={{ color: "#475569" }}>
                          Phone
                        </th>
                        <th className="text-left py-1" style={{ color: "#475569" }}>
                          Name
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPreview.preview.preview_rows.map((r) => (
                        <tr key={r.row}>
                          <td className="py-1" style={{ color: "#64748B" }}>
                            {r.row}
                          </td>
                          <td className="py-1 font-mono" style={{ color: "#334155" }}>
                            {r.phone_e164}
                          </td>
                          <td className="py-1" style={{ color: "#334155" }}>
                            {r.full_name ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pendingPreview.preview.errors.length > 0 && (
                <div>
                  <div
                    className="text-xs uppercase font-medium mb-2"
                    style={{ color: "#DC2626" }}
                  >
                    Rejected rows (first {Math.min(10, pendingPreview.preview.errors.length)})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {pendingPreview.preview.errors.slice(0, 10).map((e, i) => (
                        <tr key={i}>
                          <td className="py-1" style={{ color: "#64748B" }}>
                            Row {e.row}
                          </td>
                          <td className="py-1 font-mono" style={{ color: "#334155" }}>
                            {e.phone_raw ?? "(empty)"}
                          </td>
                          <td className="py-1" style={{ color: "#DC2626" }}>
                            {e.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="p-4 flex justify-end gap-2"
              style={{ borderTop: "1px solid #E2E8F0" }}
            >
              <button
                onClick={() => setPendingPreview(null)}
                className="px-4 py-2 rounded-md text-sm"
                style={{
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  color: "#0F172A",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCommit}
                disabled={uploading || pendingPreview.preview.valid === 0}
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{
                  background:
                    uploading || pendingPreview.preview.valid === 0
                      ? "#CBD5E1"
                      : "#2563EB",
                  cursor:
                    uploading || pendingPreview.preview.valid === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {uploading
                  ? "Importing…"
                  : `Import ${pendingPreview.preview.valid} contacts`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Screen 3+4: Placeholders for Campaign & Logs (still mock, banner shows) ─

function BroadcastsScreen() {
  const [view, setView] = useState<"list" | "create">("list");
  const { data, loading, error, refresh } = useBroadcasts({ page: 1, page_size: 50 });
  const { send, sending } = useSendBroadcast();
  const { cancel, canceling } = useCancelBroadcast();
  const toast=useToast();
    const handleSend = async (broadcastId: string) => {
    if (!confirm("Send this broadcast now? This cannot be undone.")) return;
    try {
      const result = await send(broadcastId);
      refresh();
      toast.push({ variant: "success", message: "Broadcast Queued", detail: `Campaign ID: ${result.campaign_id}` });
    } catch (err) {
      const e = err as Error & { status?: number; body?: any };
      toast.push({
        variant: "error",
        message: "Send Failed",
        detail: e.body ? JSON.stringify(e.body) : e.message,
        status: e.status,
      });
    }
  };

  const handleCancel = async (broadcastId: string) => {
    if (!confirm("Cancel this broadcast? Messages already sent cannot be recalled — this only stops further sending.")) return;
    try {
      await cancel(broadcastId);
      refresh();
      toast.push({ variant: "success", message: "Broadcast Canceled", detail: "Stopped further sending." });
    } catch (err) {
      const e = err as Error & { status?: number; body?: any };
      toast.push({
        variant: "error",
        message: "Cancel Failed",
        detail: e.body ? JSON.stringify(e.body) : e.message,
        status: e.status,
      });
    }
  };


  if (view === "create") {
    return <BroadcastCreateForm onDone={() => { setView("list"); refresh(); }} onCancel={() => setView("list")} />;
  }

  const broadcasts = data?.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#0F172A" }}>Broadcast Campaigns</h1>
          <p className="text-sm mt-1" style={{ color: "#64748B" }}>
            {data ? `${data.pagination.total} total` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => setView("create")}
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ background: "#2563EB", cursor: "pointer" }}
        >
          + Create Campaign
        </button>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0", background: "#fff" }}>
        {error && <div className="p-4 text-sm" style={{ color: "#B91C1C" }}>Failed to load: {error}</div>}
        {loading && !data && <div className="p-8 text-center text-sm" style={{ color: "#64748B" }}>Loading…</div>}
        {!loading && broadcasts.length === 0 && !error && (
          <div className="p-8 text-center text-sm" style={{ color: "#64748B" }}>
            No campaigns yet. Click "Create Campaign" to get started.
          </div>
        )}
        {broadcasts.length > 0 && (
          <table className="w-full text-sm">
            <thead style={{ background: "#F8FAFC" }}>
              <tr>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Name</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Branch</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Template</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Recipients</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Status</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Created</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: "#475569" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td className="px-4 py-2" style={{ color: "#0F172A" }}>{b.name}</td>
                  <td className="px-4 py-2" style={{ color: "#475569" }}>{b.branch_name}</td>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: "#334155" }}>{b.template_name}</td>
                  <td className="px-4 py-2" style={{ color: "#475569" }}>{b.recipient_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 text-xs rounded-full font-medium"
                     style={{
  background:
    b.status === "completed" ? "#DCFCE7" :
    b.status === "running" || b.status === "queued" ? "#FEF3C7" :
    b.status === "failed" ? "#FEE2E2" :
    b.status === "draft" ? "#E0E7FF" : "#F1F5F9",
  color:
    b.status === "completed" ? "#166534" :
    b.status === "running" || b.status === "queued" ? "#92400E" :
    b.status === "failed" ? "#991B1B" :
    b.status === "draft" ? "#3730A3" : "#475569",
}}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "#64748B" }}>
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    {(b.status === "draft" || b.status === "scheduled") && (
                      <button
                        onClick={() => handleSend(b.id)}
                        disabled={sending}
                        className="text-xs px-3 py-1 rounded-md text-white font-medium"
                        style={{ background: sending ? "#CBD5E1" : "#2563EB" }}
                      >
                        {sending ? "Sending…" : "Send Now"}
                      </button>
                    )}
                    {(b.status === "queued" || b.status === "running") && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        disabled={canceling}
                        className="text-xs px-3 py-1 rounded-md font-medium ml-2"
                        style={{ background: canceling ? "#CBD5E1" : "#FEE2E2", color: "#991B1B" }}
                      >
                        {canceling ? "Canceling…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TemplatesScreen() {
  const { templates, loading, error } = useTemplates();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const statusStyle = (status: string) => ({
    background: status === "approved" ? "#DCFCE7" : status === "pending" ? "#FEF3C7" : "#FEE2E2",
    color: status === "approved" ? "#166534" : status === "pending" ? "#92400E" : "#991B1B",
  });
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#0F172A" }}>Message Templates</h1>
        <p className="text-sm mt-1" style={{ color: "#64748B" }}>
          {templates.length > 0 ? `${templates.length} template${templates.length !== 1 ? "s" : ""}` : "Loading…"}
        </p>
      </div>
      {error && (
        <div className="p-4 rounded-md text-sm mb-4" style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
          Failed to load templates: {error}
        </div>
      )}
      {loading && templates.length === 0 && (
        <div className="p-8 text-center text-sm" style={{ color: "#64748B" }}>Loading templates…</div>
      )}
      {!loading && templates.length === 0 && !error && (
        <div className="p-8 text-center text-sm rounded-lg" style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E2E8F0" }}>
          No templates yet. Templates are created and approved in Meta's WhatsApp Manager, then registered here.
        </div>
      )}
      <div className="space-y-3">
        {templates.map((t) => {
          const isOpen = expandedId === t.id;
          const varCount = t.variable_definitions?.length ?? 0;
          return (
            <div
              key={t.id}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid #E2E8F0", background: "#fff" }}
            >
              <button
                onClick={() => setExpandedId(isOpen ? null : t.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ cursor: "pointer" }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm" style={{ color: "#0F172A" }}>{t.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={statusStyle(t.status)}>
                    {t.status}
                  </span>
                  <span className="text-xs" style={{ color: "#94A3B8" }}>{t.language_code}</span>
                  <span className="text-xs" style={{ color: "#94A3B8" }}>{t.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  {varCount > 0 && (
                    <span className="text-xs" style={{ color: "#64748B" }}>
                      {varCount} variable{varCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{ color: "#94A3B8", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                    ▾
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid #F1F5F9" }}>
                  <div
                    className="mt-3 p-3 rounded-md text-sm whitespace-pre-wrap"
                    style={{ background: "#F8FAFC", color: "#334155", lineHeight: 1.6 }}
                  >
                    {renderTemplateBody(t.body_text)}
                  </div>
                  {varCount > 0 && (
                    <div className="mt-3">
                      <div className="text-xs uppercase font-medium mb-2" style={{ color: "#94A3B8" }}>
                        Variables
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {t.variable_definitions.map((v: any, i: number) => {
                          const key = v.name ?? v.index ?? i + 1;
                          return (
                            <span
                              key={i}
                              className="text-xs px-2 py-1 rounded font-mono"
                              style={{ background: "#EFF6FF", color: "#1E40AF" }}
                              title={v.description || ""}
                            >
                              {"{{"}{key}{"}}"} {v.example ? `— e.g. "${v.example}"` : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
// Highlights {{variable}} placeholders subtly within body text — soft
// background, not garish, matches the app's restrained visual language.
function renderTemplateBody(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <span key={i} style={{ background: "#DBEAFE", color: "#1E40AF", borderRadius: 3, padding: "0 3px" }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function LogsScreen() {

  return (
    <>
      <MockDataBanner label="Message Logs" />
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-xl font-semibold" style={{ color: "#0F172A" }}>Message Logs</h1>
        <p className="text-sm" style={{ color: "#64748B" }}>
          Backend endpoints (/messages, /messages/kpis, /queue/status) are live.
          Wiring is next up.
        </p>
      </div>
    </>
  );
}

// ─── App root — auth gate + shell ────────────────────────────────────────────

export default function App() {
  const { session, me, loading } = useAuth();
  // Map screen names to URL paths and back — keeps refresh/back-button sane.
const VALID_SCREENS = ["dashboard", "contacts", "campaign", "templates","logs"] as const;
type ScreenName = typeof VALID_SCREENS[number];

function screenFromPath(): ScreenName {
  const path = window.location.pathname.slice(1); // strip leading '/'
  return (VALID_SCREENS as readonly string[]).includes(path)
    ? (path as ScreenName)
    : "dashboard";
}

// ... inside the App component ...
const [screen, setScreenRaw] = useState<ScreenName>(screenFromPath());

const setScreen = (next: ScreenName) => {
  setScreenRaw(next);
  const path = next === "dashboard" ? "/" : `/${next}`;
  window.history.pushState({}, "", path);
};

// Handle browser back/forward buttons
useEffect(() => {
  const onPopState = () => setScreenRaw(screenFromPath());
  window.addEventListener("popstate", onPopState);
  return () => window.removeEventListener("popstate", onPopState);
}, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth gate — everything below assumes an authenticated session + /me
  if (loading) return <FullPageLoader label="Loading session…" />;
  if (!session) return <LoginScreen />;
  if (!me) return <FullPageLoader label="Fetching account…" />;

    const handleNavigate = (id: string) => {
    if (id === "contacts") setScreen("contacts");
    else if (id === "campaigns") setScreen("campaign");
    else if (id === "logs") setScreen("logs");
    else if (id === "templates") setScreen("templates");
    else setScreen("dashboard");
  };

  const activeNav =
    screen === "contacts" ? "contacts" :
    screen === "campaign" ? "campaigns" :
    screen === "logs" ? "logs" :
    screen === "templates" ? "templates" :
    "dashboard";


  return (
    <ToastProvider>
    {<div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: "#F1F5F9" }}
    >
      <Sidebar
        active={activeNav}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <MobileTopbar onMenuOpen={() => setSidebarOpen(true)} />
        <main
          className="flex-1 w-full"
          style={{
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
                    {screen === "dashboard" && <DashboardScreen />}
          {screen === "contacts"  && <ContactsScreen />}
          {screen === "campaign"  && <BroadcastsScreen />}
          {screen === "logs"      && <LogsScreen />}
          {screen === "templates" && <TemplatesScreen />}

        </main>
      </div>
    </div>}
    </ToastProvider>
  );
}
