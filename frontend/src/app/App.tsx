import { useState } from "react";
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
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

// ── Data ──────────────────────────────────────────────────────────────────────

const messagingData = [
  { date: "Jul 8", sent: 4200, delivered: 3980 },
  { date: "Jul 9", sent: 5100, delivered: 4820 },
  { date: "Jul 10", sent: 3800, delivered: 3650 },
  { date: "Jul 11", sent: 6200, delivered: 5940 },
  { date: "Jul 12", sent: 7100, delivered: 6820 },
  { date: "Jul 13", sent: 5400, delivered: 5180 },
  { date: "Jul 14", sent: 8900, delivered: 8540 },
];

const campaignStatus = [
  { name: "Completed", value: 42, color: "#22C55E" },
  { name: "In Progress", value: 18, color: "#2563EB" },
  { name: "Scheduled", value: 24, color: "#F59E0B" },
  { name: "Draft", value: 16, color: "#94A3B8" },
];

const sparkData = {
  messages: [3200, 4100, 3800, 5200, 4900, 6100, 5400, 8900],
  delivery: [94, 95, 93, 96, 95, 97, 94, 96],
  read: [62, 64, 60, 67, 65, 69, 63, 68],
  contacts: [1820, 1905, 1960, 2100, 2180, 2240, 2310, 2418],
};

const broadcasts = [
  { name: "Black Friday Promo — NY", branch: "New York Office", status: "Sent", time: "2h ago", reach: "4,200" },
  { name: "Q3 Product Update", branch: "London Branch", status: "Sent", time: "5h ago", reach: "2,850" },
  { name: "Holiday Sale Teaser", branch: "Remote Team", status: "Scheduled", time: "Tomorrow, 9:00 AM", reach: "1,600" },
  { name: "VIP Customer Rewards", branch: "New York Office", status: "Sent", time: "1d ago", reach: "980" },
  { name: "New Feature Announcement", branch: "All Branches", status: "Scheduled", time: "Jul 16, 10:00 AM", reach: "8,400" },
];

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
  { id: "analytics", label: "Analytics",            icon: BarChart2 },
];

const BRANCHES = ["All Branches", "New York Office", "London Branch", "Remote Team"];

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function SparkLine({ data, color }: { data: number[]; color: string; seriesKey?: string }) {
  const W = 120, H = 40, pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
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

// ── Sidebar ────────────────────────────────────────────────────────────────────

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
  const [tenantOpen, setTenantOpen] = useState(false);

  const handleNav = (id: string) => {
    onNavigate(id);
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full flex flex-col
          transition-transform duration-200
          lg:static lg:translate-x-0 lg:z-auto lg:flex-shrink-0
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ width: "232px", background: "#0F172A" }}
      >
        {/* Logo + Tenant */}
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
                <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: "#3B82F6" }}>A</div>
                <div className="min-w-0 text-left">
                  <p className="text-white text-xs font-semibold truncate leading-none mb-0.5">Acme Corp</p>
                  <p className="text-[10px] leading-none" style={{ color: "rgba(255,255,255,0.35)" }}>Tenant 1</p>
                </div>
              </div>
              <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${tenantOpen ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.35)" }} />
            </button>

            {tenantOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden z-50 shadow-xl" style={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.08)" }}>
                {[{ name: "Globex Inc", n: 2, bg: "#7C3AED" }, { name: "Initech Ltd", n: 3, bg: "#059669" }].map(({ name, n, bg }) => (
                  <button key={name} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.55)" }}>
                    <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: bg }}>{name[0]}</div>
                    {name} <span style={{ color: "rgba(255,255,255,0.3)" }}>(Tenant {n})</span>
                  </button>
                ))}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <button className="w-full flex items-center gap-1.5 px-3 py-2 text-xs" style={{ color: "#60A5FA" }}>
                    <Plus size={11} /> Add Business Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
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

        {/* User */}
        <div className="flex flex-col gap-0.5 px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0" style={{ background: "linear-gradient(135deg,#3B82F6,#2563EB)" }}>AK</div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate leading-none mb-0.5">Alex Kim</p>
              <p className="text-[10px] leading-none" style={{ color: "rgba(255,255,255,0.35)" }}>Administrator</p>
            </div>
            <Bell size={13} style={{ color: "rgba(255,255,255,0.3)" }} className="flex-shrink-0" />
          </div>
          {[{ Icon: Settings, label: "Settings", danger: false }, { Icon: LogOut, label: "Logout", danger: true }].map(({ Icon, label, danger }) => (
            <button
              key={label}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{ color: danger ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.4)" }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = danger ? "#F87171" : "rgba(255,255,255,0.8)"; el.style.background = danger ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = danger ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.4)"; el.style.background = ""; }}
            >
              <Icon size={14} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

// ── Mobile Topbar ─────────────────────────────────────────────────────────────

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

// ── Screen 1: Dashboard ────────────────────────────────────────────────────────

function DashboardScreen() {
  const [activeBranches, setActiveBranches] = useState<string[]>(["All Branches"]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [dateRange, setDateRange] = useState("Last 7 Days");
  const [dateOpen, setDateOpen] = useState(false);

  const toggleBranch = (branch: string) => {
    if (branch === "All Branches") {
      setActiveBranches(["All Branches"]);
    } else {
      const withoutAll = activeBranches.filter((b) => b !== "All Branches");
      if (withoutAll.includes(branch)) {
        const next = withoutAll.filter((b) => b !== branch);
        setActiveBranches(next.length ? next : ["All Branches"]);
      } else {
        setActiveBranches([...withoutAll, branch]);
      }
    }
    setBranchOpen(false);
  };

  const statCards = [
    { label: "Total Messages Sent", value: "40,842", change: "+12.4%", data: sparkData.messages, color: "#2563EB", seriesKey: "messages" },
    { label: "Delivered Rate",       value: "96.2%",  change: "+0.8%",  data: sparkData.delivery, color: "#22C55E", seriesKey: "delivery" },
    { label: "Read Rate",            value: "67.4%",  change: "+2.1%",  data: sparkData.read,     color: "#8B5CF6", seriesKey: "readRate" },
    { label: "Active Contacts",      value: "2,418",  change: "+156",   data: sparkData.contacts, color: "#F59E0B", seriesKey: "contacts" },
  ];

  const branchLabel = activeBranches.includes("All Branches")
    ? "All Branches"
    : activeBranches.length > 1 ? `${activeBranches.length} Branches` : activeBranches[0];

  return (
    <div
      className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 w-full"
      onClick={() => { setBranchOpen(false); setDateOpen(false); }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold" style={{ color: "#0F172A" }}>Welcome Back, Admin</h1>
          <p className="text-sm" style={{ color: "#64748B" }}>Acme Corp · {branchLabel} · {dateRange}</p>
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
              <span className="hidden sm:inline">{branchLabel}</span>
              <span className="sm:hidden">Branches</span>
              <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${branchOpen ? "rotate-180" : ""}`} />
            </button>
            {branchOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Filter by Branch</p>
                </div>
                {BRANCHES.map((branch) => {
                  const checked = activeBranches.includes(branch);
                  return (
                    <button
                      key={branch}
                      onClick={() => toggleBranch(branch)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                      style={{ color: "#374151" }}
                    >
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ border: checked ? "none" : "1px solid #CBD5E1", background: checked ? "#2563EB" : "transparent" }}>
                        {checked && <Check size={10} className="text-white" />}
                      </div>
                      {branch}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date Range */}
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
                {["Last 7 Days", "Last 30 Days", "Last 90 Days", "This Month", "Custom Range"].map((d) => (
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

      {/* Active branch pills */}
      {!activeBranches.includes("All Branches") && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          {activeBranches.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
              {b}
              <button onClick={() => toggleBranch(b)} className="hover:opacity-70"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Stat Cards — wrapping grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="flex flex-col gap-1 bg-white rounded-lg p-5" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-snug" style={{ color: "#64748B" }}>{card.label}</p>
              <span className="text-xs font-semibold flex items-center gap-0.5 flex-shrink-0" style={{ color: "#16A34A" }}>
                <TrendingUp size={11} />{card.change}
              </span>
            </div>
            <p className="text-[26px] font-semibold leading-tight" style={{ color: "#0F172A" }}>{card.value}</p>
            <SparkLine data={card.data} color={card.color} seriesKey={card.seriesKey} />
          </div>
        ))}
      </div>

      {/* Charts — stack on mobile, side-by-side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line Chart */}
        <div className="flex flex-col gap-4 bg-white rounded-lg p-5 lg:col-span-2" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Messaging Activity Overview</h3>
              <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>Jul 8 – Jul 14, 2025</p>
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
              <YAxis key="lc-yaxis" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip key="lc-tooltip" contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "8px 12px" }} labelStyle={{ color: "#374151", fontWeight: 600 }} />
              <Line key="lc-sent" type="monotone" dataKey="sent" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }} />
              <Line key="lc-delivered" type="monotone" dataKey="delivered" stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#22C55E", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Donut */}
        <div className="flex flex-col gap-1 bg-white rounded-lg p-5" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Campaign Status</h3>
          <p className="text-xs mb-2" style={{ color: "#94A3B8" }}>100 total campaigns</p>
          <ResponsiveContainer width="100%" height={148}>
            <PieChart>
              <Pie key="pc-pie" data={campaignStatus} cx="50%" cy="50%" innerRadius={46} outerRadius={66} paddingAngle={2.5} dataKey="value" strokeWidth={0}>
                {campaignStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip key="pc-tooltip" contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2.5 mt-1">
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

      {/* Recent Broadcasts */}
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

// ── Screen 2: Contacts ─────────────────────────────────────────────────────────

function ContactsScreen() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [branchOpen, setBranchOpen] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (c.name.toLowerCase().includes(q) || c.phone.includes(q)) &&
      (branchFilter === "All Branches" || c.branch === branchFilter);
  });

  const toggleId = (id: number) =>
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : filtered.map((c) => c.id));

  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8 w-full"
      onClick={() => setBranchOpen(false)}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold" style={{ color: "#0F172A" }}>Contact Directory</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs" style={{ color: "#94A3B8" }}>Acme Corp</span>
            <ChevronRight size={12} style={{ color: "#CBD5E1" }} />
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F1F5F9", color: "#475569" }}>{branchFilter}</span>
            {branchFilter !== "All Branches" && (
              <>
                <ChevronRight size={12} style={{ color: "#CBD5E1" }} />
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#EFF6FF", color: "#2563EB" }}>{filtered.length} contacts</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ border: "1px solid #E2E8F0", color: "#374151", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <Plus size={14} /> <span className="hidden sm:inline">Add Contact</span><span className="sm:hidden">Add</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#2563EB", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}>
            <Upload size={14} /> <span className="hidden sm:inline">Import CSV / Excel</span><span className="sm:hidden">Import</span>
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or number..."
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-md outline-none transition-all"
            style={{ border: "1px solid #E2E8F0", background: "#fff", color: "#1E293B", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid #93C5FD"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid #E2E8F0"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: "#94A3B8" }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setBranchOpen(!branchOpen)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium whitespace-nowrap"
            style={{ border: "1px solid #E2E8F0", color: "#374151", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
          >
            <Building2 size={14} style={{ color: "#94A3B8" }} />
            <span className="hidden sm:inline">{branchFilter}</span>
            <span className="sm:hidden">Branch</span>
            <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${branchOpen ? "rotate-180" : ""}`} />
          </button>
          {branchOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
              {BRANCHES.map((b) => (
                <button key={b} onClick={() => { setBranchFilter(b); setBranchOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                  style={{ color: branchFilter === b ? "#2563EB" : "#374151", background: branchFilter === b ? "#EFF6FF" : "transparent" }}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors hover:bg-slate-50"
          style={{ border: "1px solid #E2E8F0", color: "#374151", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <Filter size={14} style={{ color: "#94A3B8" }} /> <span className="hidden sm:inline">Advanced</span> Filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 px-5 py-2.5" style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE" }}>
            <span className="text-sm font-semibold" style={{ color: "#1D4ED8" }}>{selectedIds.length} selected</span>
            <button className="text-xs font-medium underline" style={{ color: "#2563EB" }}>Send Message</button>
            <button className="text-xs font-medium underline" style={{ color: "#DC2626" }}>Remove</button>
            <button onClick={() => setSelectedIds([])} className="ml-auto hover:opacity-70" style={{ color: "#64748B" }}><X size={14} /></button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <th className="pl-5 pr-3 py-3">
                  <div onClick={toggleAll} className="w-4 h-4 rounded cursor-pointer flex items-center justify-center transition-colors"
                    style={{ border: allSelected ? "none" : "1px solid #CBD5E1", background: allSelected ? "#2563EB" : "transparent" }}>
                    {allSelected && <Check size={10} className="text-white" />}
                  </div>
                </th>
                {["Name", "Phone Number", "Branch / Location", "Created", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#94A3B8" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, i) => {
                const sel = selectedIds.includes(contact.id);
                return (
                  <tr key={contact.id}
                    style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F8FAFC" : "none", background: sel ? "#F5F8FF" : "transparent" }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "#FAFBFC"; }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = ""; }}
                  >
                    <td className="pl-5 pr-3 py-4">
                      <div onClick={() => toggleId(contact.id)} className="w-4 h-4 rounded cursor-pointer flex items-center justify-center transition-colors"
                        style={{ border: sel ? "none" : "1px solid #CBD5E1", background: sel ? "#2563EB" : "transparent" }}>
                        {sel && <Check size={10} className="text-white" />}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg,#E2E8F0,#CBD5E1)", color: "#475569" }}>
                          {initials(contact.name)}
                        </div>
                        <span className="text-sm font-medium whitespace-nowrap" style={{ color: "#1E293B" }}>{contact.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm whitespace-nowrap" style={{ fontFamily: "ui-monospace,monospace", color: "#475569", fontSize: "12.5px" }}>{contact.phone}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
                        style={{ background: "#F1F5F9", color: "#475569" }}>
                        <Building2 size={10} style={{ color: "#94A3B8" }} />
                        {contact.branch}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm whitespace-nowrap" style={{ color: "#64748B" }}>{contact.created}</td>
                    <td className="px-4 py-4"><StatusBadge status={contact.status} /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "#94A3B8" }}>No contacts match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5" style={{ borderTop: "1px solid #F1F5F9" }}>
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            Showing <strong style={{ color: "#475569" }}>{filtered.length}</strong> of <strong style={{ color: "#475569" }}>2,418</strong> contacts
          </p>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1.5 text-xs rounded" style={{ border: "1px solid #E2E8F0", color: "#94A3B8" }} disabled>Previous</button>
            {[1, 2, 3, 4, 5].map((p) => (
              <button key={p} onClick={() => setPage(p)} className="w-7 h-7 text-xs rounded transition-colors"
                style={{ background: page === p ? "#2563EB" : "transparent", color: page === p ? "#fff" : "#64748B", fontWeight: page === p ? 600 : 400 }}>
                {p}
              </button>
            ))}
            <span className="text-xs px-1" style={{ color: "#CBD5E1" }}>…</span>
            <button className="w-7 h-7 text-xs rounded transition-colors hover:bg-slate-50" style={{ color: "#64748B" }}>24</button>
            <button className="px-2.5 py-1.5 text-xs rounded transition-colors hover:bg-slate-50" style={{ border: "1px solid #E2E8F0", color: "#374151" }}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 3: Create Campaign ──────────────────────────────────────────────────

// ── Campaign: field mapping options ───────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: "",                  label: "— Select a field —" },
  { value: "contact_first_name", label: "Contact First Name",  sample: "Sarah" },
  { value: "contact_last_name",  label: "Contact Last Name",   sample: "Mitchell" },
  { value: "contact_phone",      label: "Contact Phone",       sample: "+1 212 555 0147" },
  { value: "branch_name",        label: "Branch Name",         sample: "New York Office" },
  { value: "custom",             label: "Custom value…",       sample: "" },
];

function fieldSample(fieldId: string, customVal: string): string {
  if (fieldId === "custom") return customVal || "…";
  return FIELD_OPTIONS.find((f) => f.value === fieldId)?.sample ?? "";
}

// ── Campaign: WhatsApp phone chassis (shared by preview panel) ────────────────

function PhonePreview({
  templateBody,
  hasTemplate,
}: {
  templateBody: string | null;
  hasTemplate: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div
        className="rounded-[28px] p-2.5 shadow-2xl flex-shrink-0"
        style={{ width: "220px", background: "#1E293B" }}
      >
        {/* pill notch */}
        <div className="flex justify-center mb-1">
          <div className="w-16 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div
          className="rounded-[20px] overflow-hidden flex flex-col"
          style={{ background: "#ECE5DD", height: "420px" }}
        >
          {/* WA header bar */}
          <div className="flex items-center gap-2.5 px-3 py-3 flex-shrink-0" style={{ background: "#075E54" }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            >A</div>
            <div>
              <p className="text-white text-[11px] font-semibold leading-none mb-0.5">Acme Corp</p>
              <p className="text-[9px] leading-none" style={{ color: "rgba(255,255,255,0.65)" }}>Business Account · Verified ✓</p>
            </div>
          </div>
          {/* Date stamp */}
          <div className="flex justify-center py-2 flex-shrink-0">
            <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.12)", color: "#5C5C5C" }}>Today</span>
          </div>
          {/* Message area */}
          <div className="flex-1 px-3 pb-3 flex items-end overflow-hidden">
            {hasTemplate && templateBody ? (
              <div className="rounded-lg rounded-tl-none px-3 py-2.5 shadow-sm w-full relative" style={{ background: "#fff" }}>
                <div className="absolute -left-1.5 top-0 w-0 h-0" style={{ borderTop: "8px solid transparent", borderRight: "10px solid #fff" }} />
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#075E54" }}>Acme Corp</p>
                <p
                  className="leading-relaxed"
                  style={{ fontSize: "11px", color: "#1C1C1C" }}
                  dangerouslySetInnerHTML={{ __html: templateBody }}
                />
                <div className="flex items-center justify-end gap-1 mt-2">
                  <p className="text-[9px]" style={{ color: "#A0A0A0" }}>10:42 AM</p>
                  <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
                    <path d="M1 4L4 7L9 1" stroke="#34B7F1" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M5 4L8 7L13 1" stroke="#34B7F1" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center justify-center gap-2 py-4">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.07)" }}>
                  <MessageSquare size={16} style={{ color: "rgba(0,0,0,0.25)" }} />
                </div>
                <p className="text-[10px] text-center leading-relaxed px-2" style={{ color: "rgba(0,0,0,0.35)" }}>
                  Select a template in Step 3 to preview your message here.
                </p>
              </div>
            )}
          </div>
          {/* Input bar */}
          <div className="flex items-center gap-1.5 px-2 py-2 flex-shrink-0" style={{ background: "#F0F0F0" }}>
            <div className="flex-1 rounded-full px-3 py-1.5" style={{ background: "#fff" }}>
              <p className="text-[9px]" style={{ color: "#A0A0A0" }}>Type a message</p>
            </div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#25D366" }}>
              <Send size={11} className="text-white" />
            </div>
          </div>
        </div>
      </div>
      {hasTemplate ? (
        <p className="text-[10px] text-center leading-relaxed" style={{ color: "#94A3B8" }}>
          Highlighted values are populated<br />from contact data at send time.
        </p>
      ) : (
        <p className="text-[10px] text-center leading-relaxed" style={{ color: "#CBD5E1" }}>
          Preview updates live as you<br />configure Step 3.
        </p>
      )}
    </div>
  );
}

// ── Campaign screen ────────────────────────────────────────────────────────────

function CampaignScreen() {
  // Step state
  const [step, setStep] = useState(1);

  // Step 1
  const [campaignName, setCampaignName] = useState("");
  const [sender, setSender] = useState("");
  const [branch, setBranch] = useState("");

  // Step 2
  const [audience, setAudience] = useState<"all" | "branch" | "csv">("all");
  const [audienceBranch, setAudienceBranch] = useState("");

  // Step 3
  const [template, setTemplate] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  // varMappings: { "{{1}}": fieldId, ... }
  const [varMappings, setVarMappings] = useState<Record<string, string>>({});
  // customVals: { "{{1}}": "typed value", ... } used when fieldId === "custom"
  const [customVals, setCustomVals] = useState<Record<string, string>>({});

  // Step 4
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const STEPS = [
    { n: 1, label: "Setup" },
    { n: 2, label: "Audience" },
    { n: 3, label: "Content" },
    { n: 4, label: "Schedule & Send" },
  ];

  const activeTemplate = MESSAGE_TEMPLATES.find((t) => t.id === template) ?? null;

  // Validation
  const stepValid = (n: number) => {
    if (n === 1) return !!(campaignName.trim() && sender && branch);
    if (n === 2) return audience !== "branch" || !!audienceBranch;
    if (n === 3) return !!template;
    if (n === 4) return sendMode === "now" || !!(scheduleDate && scheduleTime);
    return true;
  };

  const canGoToStep = (n: number) => {
    for (let i = 1; i < n; i++) if (!stepValid(i)) return false;
    return true;
  };

  const handleStepClick = (n: number) => {
    if (n <= step || canGoToStep(n)) setStep(n);
  };

  const handleContinue = () => {
    if (stepValid(step) && step < 4) setStep(step + 1);
  };

  // Template change with confirmation
  const requestTemplateChange = (newId: string) => {
    if (template && Object.keys(varMappings).some((k) => varMappings[k])) {
      setPendingTemplate(newId);
    } else {
      setTemplate(newId);
      setVarMappings({});
      setCustomVals({});
    }
  };

  const confirmTemplateChange = () => {
    if (pendingTemplate !== null) {
      setTemplate(pendingTemplate);
      setVarMappings({});
      setCustomVals({});
      setPendingTemplate(null);
    }
  };

  // Render template preview with variable substitution
  const buildPreviewHtml = (): string | null => {
    if (!activeTemplate) return null;
    return activeTemplate.preview.replace(/\{\{[0-9]+\}\}/g, (match) => {
      const fieldId = varMappings[match] ?? "";
      const sample = fieldId
        ? fieldSample(fieldId, customVals[match] ?? "")
        : VAR_VALUES[match] ?? match;
      return `<span style="background:#DBEAFE;color:#1D4ED8;padding:1px 4px;border-radius:4px;font-size:10.5px;font-weight:600;">${sample || match}</span>`;
    });
  };

  // Shared input styles
  const iStyle: React.CSSProperties = {
    border: "1px solid #E2E8F0", background: "#fff", color: "#1E293B",
    width: "100%", padding: "10px 12px", fontSize: "14px",
    borderRadius: "6px", outline: "none", appearance: "none",
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.border = "1px solid #93C5FD";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)";
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.border = "1px solid #E2E8F0";
    e.currentTarget.style.boxShadow = "none";
  };

  const previewHtml = buildPreviewHtml();
  const hasTemplate = !!activeTemplate;

  return (
    <div className="flex w-full overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>

      {/* ── LEFT COLUMN: 62% scrollable ─────────────────────────────────────── */}
      <div
        className="flex flex-col overflow-y-auto flex-shrink-0"
        style={{ width: "62%", borderRight: "1px solid #E2E8F0" }}
      >
        {/* Page header */}
        <div className="flex-shrink-0 px-8 pt-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-8">
            <div className="flex flex-col gap-1 min-w-0">
              <h1 className="text-xl font-semibold" style={{ color: "#0F172A" }}>Create New WhatsApp Broadcast</h1>
              <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
                Configure your campaign, choose an audience, and compose the message.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-50"
                style={{ border: "1px solid #E2E8F0", color: "#374151", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
              >
                Save Draft
              </button>
              {step < 4 ? (
                <button
                  onClick={handleContinue}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity"
                  style={{
                    background: stepValid(step) ? "#2563EB" : "#CBD5E1",
                    boxShadow: stepValid(step) ? "0 1px 3px rgba(37,99,235,0.4)" : "none",
                    cursor: stepValid(step) ? "pointer" : "not-allowed",
                  }}
                >
                  Continue <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ background: "#2563EB", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}
                >
                  <Send size={14} /> Send Broadcast
                </button>
              )}
            </div>
          </div>

          {/* Horizontal stepper */}
          <div className="flex items-center mb-8">
            {STEPS.map(({ n, label }, i) => {
              const isActive = step === n;
              const isDone = step > n;
              const clickable = isDone || canGoToStep(n);
              return (
                <div
                  key={n}
                  className="flex items-center"
                  style={{ flex: i < STEPS.length - 1 ? "1" : "none" }}
                >
                  <button
                    onClick={() => handleStepClick(n)}
                    disabled={!clickable}
                    className="flex items-center gap-2.5"
                    style={{ cursor: clickable ? "pointer" : "default", opacity: !clickable && !isActive ? 0.5 : 1 }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-all"
                      style={{
                        background: isDone ? "#22C55E" : isActive ? "#2563EB" : "#F1F5F9",
                        color: isDone || isActive ? "#fff" : "#94A3B8",
                        boxShadow: isActive ? "0 0 0 3px rgba(37,99,235,0.15)" : "none",
                      }}
                    >
                      {isDone ? <Check size={14} /> : n}
                    </div>
                    <div>
                      <p
                        className="text-sm font-semibold whitespace-nowrap"
                        style={{ color: isActive ? "#0F172A" : isDone ? "#16A34A" : "#94A3B8" }}
                      >
                        {label}
                      </p>
                    </div>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className="flex-1 h-px mx-4"
                      style={{ background: step > n ? "#86EFAC" : "#E2E8F0" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active step content */}
        <div className="flex-1 px-8 pb-8">

          {/* ── STEP 1: Setup ── */}
          {step === 1 && (
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-6"
              style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
            >
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Campaign Setup</h2>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Name your campaign and assign a sender number and branch.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                  Campaign Name <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Black Friday Offer — NY Branch"
                  style={iStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <p className="text-xs" style={{ color: "#94A3B8" }}>Internal reference only — not visible to recipients.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                  Sender WABA Number <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <div className="relative">
                  <select value={sender} onChange={(e) => setSender(e.target.value)} style={{ ...iStyle, paddingRight: "36px" }} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">Select a WhatsApp Business number...</option>
                    <option value="1">+1 (212) 555-0100 — Acme Corp NY · WABA #7742</option>
                    <option value="2">+44 20 7946 0200 — Acme Corp London · WABA #8813</option>
                    <option value="3">+1 (800) 555-0199 — Acme Corp Support · WABA #9901</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94A3B8" }} />
                </div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Messages will be sent from this verified business number.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                  Associate with Branch / Location <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <div className="relative">
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ ...iStyle, paddingRight: "36px" }} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">Select a branch...</option>
                    <option value="ny">New York Office</option>
                    <option value="london">London Branch</option>
                    <option value="remote">Remote Team</option>
                    <option value="all">All Branches (Global)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94A3B8" }} />
                </div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Determines which team owns and can manage this campaign.</p>
              </div>
            </div>
          )}

          {/* ── STEP 2: Audience ── */}
          {step === 2 && (
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-6"
              style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
            >
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Select Audience</h2>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Define who will receive this broadcast.</p>
              </div>

              <div className="flex flex-col gap-2.5">
                {([
                  { id: "all" as const,    Icon: Users,   label: "All Contacts",                   desc: "Send to all 2,418 active contacts across selected branches." },
                  { id: "branch" as const, Icon: Building2, label: "Filter by Branch Group",         desc: "Send only to contacts assigned to a specific branch." },
                  { id: "csv" as const,    Icon: FileUp,  label: "Upload CSV for this Campaign",    desc: "Provide a precise list of recipients via a CSV file." },
                ] as const).map(({ id, Icon, label, desc }) => (
                  <div key={id}>
                    <label
                      onClick={() => setAudience(id)}
                      className="flex items-start gap-3 p-4 rounded-md cursor-pointer transition-all"
                      style={{
                        border: audience === id ? "1px solid #93C5FD" : "1px solid #E2E8F0",
                        background: audience === id ? "#F5F8FF" : "#fff",
                      }}
                    >
                      <div
                        className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ borderColor: audience === id ? "#2563EB" : "#CBD5E1" }}
                      >
                        {audience === id && <div className="w-2 h-2 rounded-full" style={{ background: "#2563EB" }} />}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Icon size={13} style={{ color: audience === id ? "#2563EB" : "#94A3B8" }} className="flex-shrink-0" />
                          <p className="text-sm font-semibold" style={{ color: "#1E293B" }}>{label}</p>
                        </div>
                        <p className="text-xs" style={{ color: "#64748B" }}>{desc}</p>
                      </div>
                    </label>

                    {/* Sub-controls */}
                    {audience === "branch" && id === "branch" && (
                      <div className="mt-2 ml-7 flex flex-col gap-1.5">
                        <label className="text-xs font-semibold" style={{ color: "#374151" }}>Select Branch</label>
                        <div className="relative">
                          <select
                            value={audienceBranch}
                            onChange={(e) => setAudienceBranch(e.target.value)}
                            style={{ ...iStyle, paddingRight: "36px", fontSize: "13px", padding: "8px 36px 8px 12px" }}
                            onFocus={onFocus}
                            onBlur={onBlur}
                          >
                            <option value="">Choose a branch...</option>
                            <option value="ny">New York Office — 842 contacts</option>
                            <option value="london">London Branch — 1,204 contacts</option>
                            <option value="remote">Remote Team — 372 contacts</option>
                          </select>
                          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94A3B8" }} />
                        </div>
                      </div>
                    )}
                    {audience === "csv" && id === "csv" && (
                      <div
                        className="mt-2 ml-7 flex flex-col items-center gap-2 p-5 rounded-md cursor-pointer"
                        style={{ border: "2px dashed #CBD5E1", background: "#F8FAFC" }}
                      >
                        <Upload size={20} style={{ color: "#94A3B8" }} />
                        <p className="text-sm font-medium" style={{ color: "#374151" }}>Drop your CSV file here</p>
                        <p className="text-xs" style={{ color: "#94A3B8" }}>or <span style={{ color: "#2563EB", cursor: "pointer" }}>browse to upload</span>. Columns: phone, name.</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Recipient count summary */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-md" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <Check size={14} style={{ color: "#16A34A" }} className="flex-shrink-0" />
                <p className="text-sm font-medium" style={{ color: "#15803D" }}>
                  {audience === "all" && "2,418 active contacts will receive this broadcast."}
                  {audience === "branch" && (audienceBranch
                    ? `${audienceBranch === "ny" ? "842" : audienceBranch === "london" ? "1,204" : "372"} contacts from the selected branch.`
                    : "Select a branch to see recipient count.")}
                  {audience === "csv" && "Upload a CSV to define the exact recipient list."}
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 3: Content ── */}
          {step === 3 && (
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-6"
              style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
            >
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Message Content</h2>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Choose an approved WhatsApp template and map its variables to contact fields.</p>
              </div>

              {/* Template picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                  Approved WhatsApp Template <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <div className="relative">
                  <select
                    value={template}
                    onChange={(e) => requestTemplateChange(e.target.value)}
                    style={{ ...iStyle, paddingRight: "36px" }}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">Select a template...</option>
                    {MESSAGE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94A3B8" }} />
                </div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  Only Meta-approved templates are shown.{" "}
                  <span style={{ color: "#2563EB", cursor: "pointer" }}>Manage templates →</span>
                </p>
              </div>

              {/* Template-change confirmation banner */}
              {pendingTemplate !== null && (
                <div
                  className="flex items-start gap-3 px-4 py-3 rounded-md"
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                >
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#B45309" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Changing the template will reset your variable mappings.</p>
                    <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>Any field assignments below will be cleared.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setPendingTemplate(null)}
                      className="text-xs font-medium px-3 py-1.5 rounded transition-colors hover:bg-amber-100"
                      style={{ color: "#B45309" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmTemplateChange}
                      className="text-xs font-medium px-3 py-1.5 rounded text-white"
                      style={{ background: "#D97706" }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {/* Template body preview */}
              {activeTemplate && (
                <>
                  <div className="rounded-md p-4" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>Template Body</p>
                    <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>{activeTemplate.preview}</p>
                  </div>

                  {/* Variable mapping table */}
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Variable Mapping</p>
                    <div className="rounded-md overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
                      <table className="w-full">
                        <thead>
                          <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider w-16" style={{ color: "#94A3B8" }}>Var</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Description</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Map to Field</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider w-24" style={{ color: "#94A3B8" }}>Sample</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeTemplate.vars.map(([placeholder, desc], rowIdx) => {
                            const fieldId = varMappings[placeholder] ?? "";
                            const isCustom = fieldId === "custom";
                            const sample = fieldId ? fieldSample(fieldId, customVals[placeholder] ?? "") : "";
                            return (
                              <tr
                                key={placeholder}
                                style={{ borderBottom: rowIdx < activeTemplate.vars.length - 1 ? "1px solid #F1F5F9" : "none" }}
                              >
                                <td className="px-4 py-3">
                                  <span
                                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                                    style={{ background: "#DBEAFE", color: "#1D4ED8", fontFamily: "ui-monospace,monospace" }}
                                  >
                                    {placeholder}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{desc}</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="relative">
                                      <select
                                        value={fieldId}
                                        onChange={(e) => setVarMappings((p) => ({ ...p, [placeholder]: e.target.value }))}
                                        style={{ ...iStyle, fontSize: "12px", padding: "6px 28px 6px 8px" }}
                                        onFocus={onFocus}
                                        onBlur={onBlur}
                                      >
                                        {FIELD_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                      </select>
                                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94A3B8" }} />
                                    </div>
                                    {isCustom && (
                                      <input
                                        value={customVals[placeholder] ?? ""}
                                        onChange={(e) => setCustomVals((p) => ({ ...p, [placeholder]: e.target.value }))}
                                        placeholder="Type custom value..."
                                        style={{ ...iStyle, fontSize: "12px", padding: "6px 8px" }}
                                        onFocus={onFocus}
                                        onBlur={onBlur}
                                      />
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {sample ? (
                                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#F1F5F9", color: "#475569", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>
                                      {sample}
                                    </span>
                                  ) : (
                                    <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: Schedule & Send ── */}
          {step === 4 && (
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-6"
              style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
            >
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Schedule & Send</h2>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Send immediately or pick a future date and time for delivery.</p>
              </div>

              {/* Send mode toggle */}
              <div className="flex gap-3">
                {([
                  { id: "now" as const,   label: "Send Now",          desc: "Deliver immediately after you click Send." },
                  { id: "later" as const, label: "Schedule for Later", desc: "Pick a date and time for delivery." },
                ] as const).map(({ id, label, desc }) => (
                  <label
                    key={id}
                    onClick={() => setSendMode(id)}
                    className="flex-1 flex items-start gap-3 p-4 rounded-md cursor-pointer transition-all"
                    style={{
                      border: sendMode === id ? "1px solid #93C5FD" : "1px solid #E2E8F0",
                      background: sendMode === id ? "#F5F8FF" : "#fff",
                    }}
                  >
                    <div
                      className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ borderColor: sendMode === id ? "#2563EB" : "#CBD5E1" }}
                    >
                      {sendMode === id && <div className="w-2 h-2 rounded-full" style={{ background: "#2563EB" }} />}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-semibold" style={{ color: "#1E293B" }}>{label}</p>
                      <p className="text-xs" style={{ color: "#64748B" }}>{desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Date / time picker (only when schedule-for-later) */}
              {sendMode === "later" && (
                <div className="flex flex-col gap-4 px-4 py-4 rounded-md" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                        Date <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        style={iStyle}
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold" style={{ color: "#374151" }}>
                        Time <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        style={iStyle}
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>
                    <Clock size={11} className="inline mr-1" style={{ verticalAlign: "text-bottom" }} />
                    Times are in your account timezone (UTC−5, New York).
                  </p>
                </div>
              )}

              {/* Campaign summary */}
              <div className="flex flex-col gap-3 px-4 py-4 rounded-md" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Campaign Summary</p>
                {[
                  ["Campaign", campaignName || "—"],
                  ["Sender", sender ? ["WABA #7742", "WABA #8813", "WABA #9901"][parseInt(sender) - 1] : "—"],
                  ["Branch", branch ? { ny: "New York Office", london: "London Branch", remote: "Remote Team", all: "All Branches" }[branch] ?? "—" : "—"],
                  ["Audience", audience === "all" ? "All Contacts (2,418)" : audience === "branch" ? `Branch Group` : "Custom CSV"],
                  ["Template", activeTemplate?.name ?? "—"],
                  ["Send Time", sendMode === "now" ? "Immediately" : scheduleDate && scheduleTime ? `${scheduleDate} at ${scheduleTime}` : "Not set"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span style={{ color: "#64748B" }}>{k}</span>
                    <span className="font-medium text-right" style={{ color: "#1E293B" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT COLUMN: 38% sticky preview ────────────────────────────────── */}
      <div
        className="flex flex-col items-center overflow-y-auto flex-shrink-0"
        style={{ width: "38%", padding: "32px 32px 32px 32px" }}
      >
        {/* Label */}
        <div className="w-full flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Live Preview</p>
          {hasTemplate && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "#F0FDF4", color: "#16A34A" }}
            >
              Template active
            </span>
          )}
        </div>

        <PhonePreview templateBody={previewHtml} hasTemplate={hasTemplate} />

        {/* Step indicator inside right panel */}
        <div
          className="w-full mt-6 px-4 py-3 rounded-md flex items-start gap-2"
          style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
            style={{ background: "#2563EB", color: "#fff" }}
          >
            {step}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#0F172A" }}>
              {["Campaign Setup", "Select Audience", "Message Content", "Schedule & Send"][step - 1]}
            </p>
            <p className="text-[11px]" style={{ color: "#64748B" }}>
              {step === 1 && "Fill in the campaign name, sender number, and branch."}
              {step === 2 && "Choose who receives this broadcast."}
              {step === 3 && (hasTemplate ? "Map variables to contact fields. Preview updates live." : "Select a template to see the message preview.")}
              {step === 4 && "Review the summary and choose when to send."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message Logs: types & seed data ──────────────────────────────────────────

type LogStatus = "Sent" | "Delivered" | "Read" | "Failed";
type LogBranch = "New York Office" | "London Branch" | "Remote Team";

interface LogEntry {
  id: string;
  timestamp: string;
  recipient: string;
  messageId: string;
  branch: LogBranch;
  status: LogStatus;
  latency: number;
  deliveredAt?: string;
  readAt?: string;
  errorCode?: string;
  errorTitle?: string;
  errorNote?: string;
}

function makeWebhook(entry: LogEntry): string {
  const base = {
    object: "whatsapp_business_account",
    entry: [{
      id: "108349821043780",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "12125550100", phone_number_id: "448871234567890" },
          statuses: [{
            id: entry.messageId,
            status: entry.status.toLowerCase(),
            timestamp: String(Math.floor(new Date("2026-07-17T00:00:00Z").getTime() / 1000 + Math.floor(Math.random() * 86400))),
            recipient_id: entry.recipient.replace(/\D/g, ""),
            conversation: { id: "conv_" + entry.id.padStart(6, "0"), origin: { type: "utility" } },
            pricing: { billable: true, pricing_model: "CBP", category: "utility" },
            ...(entry.status === "Failed" ? {
              errors: [{
                code: Number(entry.errorCode),
                title: entry.errorTitle,
                message: entry.errorNote,
                error_data: { details: "See Meta Business Help Center for resolution steps." },
              }],
            } : {}),
          }],
        },
        field: "messages",
      }],
    }],
  };
  return JSON.stringify(base, null, 2);
}

const RAW_LOGS: LogEntry[] = [
  { id: "1",  timestamp: "2026-07-17 14:32:08.421", recipient: "+1 212 555 0147",   messageId: "wamid.HBgMMTIxMjU1NTAxNDcVAgERGBIyMzU2Nzg5MAAAA==", branch: "New York Office",     status: "Read",      latency: 142, deliveredAt: "2026-07-17 14:32:09.210", readAt: "2026-07-17 14:32:41.882" },
  { id: "2",  timestamp: "2026-07-17 14:29:51.004", recipient: "+44 20 7946 0318",  messageId: "wamid.HBgMNDQyMDc5NDYwMzE4VAgERGBIzMzQ1Njc4OAAAA==", branch: "London Branch", status: "Delivered",  latency: 198, deliveredAt: "2026-07-17 14:29:52.918" },
  { id: "3",  timestamp: "2026-07-17 14:27:14.773", recipient: "+1 646 555 0892",   messageId: "wamid.HBgMNjQ2NTU1MDg5MlAgERGBIxMjM0NTY3ODAAAA==",  branch: "New York Office",     status: "Sent",      latency: 89 },
  { id: "4",  timestamp: "2026-07-17 14:21:37.519", recipient: "+46 8 555 0234",    messageId: "wamid.HBgMNDY4NTU1MDIzNFAgERGBIyNDU2Nzg5MAAAA==",  branch: "Remote Team",   status: "Read",      latency: 231, deliveredAt: "2026-07-17 14:21:38.611", readAt: "2026-07-17 14:22:14.033" },
  { id: "5",  timestamp: "2026-07-17 14:18:02.340", recipient: "+91 98765 43210",   messageId: "wamid.HBgMOTE5ODc2NTQzMjEwVAgERGBIzNDU2Nzg5OAAAA==", branch: "Remote Team",   status: "Failed",    latency: 0,   errorCode: "131026", errorTitle: "Receiver capability issue", errorNote: "Recipient's device does not support this message type. Use a text-only template instead." },
  { id: "6",  timestamp: "2026-07-17 14:14:55.882", recipient: "+86 138 0000 1234", messageId: "wamid.HBgMODYxMzgwMDAxMjM0VAgERGBIxMjM0NTY3OQAAA==", branch: "London Branch", status: "Read",      latency: 165, deliveredAt: "2026-07-17 14:14:56.904", readAt: "2026-07-17 14:15:28.541" },
  { id: "7",  timestamp: "2026-07-17 14:11:22.117", recipient: "+1 917 555 0674",   messageId: "wamid.HBgMOTE3NTU1MDY3NFAgERGBIzNDU2Nzg5MAAAA==",  branch: "New York Office",     status: "Delivered",  latency: 204, deliveredAt: "2026-07-17 14:11:23.701" },
  { id: "8",  timestamp: "2026-07-17 14:08:44.659", recipient: "+971 50 123 4567",  messageId: "wamid.HBgMOTcxNTAxMjM0NTY3VAgERGBIyMzQ1Njc4OAAAA==", branch: "Remote Team",   status: "Sent",      latency: 112 },
  { id: "9",  timestamp: "2026-07-17 14:05:09.228", recipient: "+44 7700 900432",   messageId: "wamid.HBgMNDQ3NzAwOTAwNDMyVAgERGBIxMjM0NTY3MAAAA==", branch: "London Branch", status: "Read",      latency: 178, deliveredAt: "2026-07-17 14:05:10.041", readAt: "2026-07-17 14:06:02.817" },
  { id: "10", timestamp: "2026-07-17 14:01:33.774", recipient: "+1 212 555 0288",   messageId: "wamid.HBgMMTIxMjU1NTAyODhVAgERGBIzNTY3ODkwMAAA==",  branch: "New York Office",     status: "Failed",    latency: 0,   errorCode: "131047", errorTitle: "Re-engagement message failed", errorNote: "The recipient has not sent a message in the past 24h. Re-engagement templates require prior opt-in. Verify subscription status." },
  { id: "11", timestamp: "2026-07-17 13:58:21.003", recipient: "+52 55 1234 5678",  messageId: "wamid.HBgMNTI1NTEyMzQ1Njc4VAgERGBIxMzQ1Njc4OQAAA==", branch: "Remote Team",   status: "Delivered",  latency: 167, deliveredAt: "2026-07-17 13:58:22.440" },
  { id: "12", timestamp: "2026-07-17 13:54:47.891", recipient: "+49 30 901 820",    messageId: "wamid.HBgMNDkzMDkwMTgyMFAgERGBIyMzQ1Njc4MAAAA==",  branch: "London Branch", status: "Sent",      latency: 94 },
  { id: "13", timestamp: "2026-07-17 13:51:04.556", recipient: "+1 646 555 0341",   messageId: "wamid.HBgMNjQ2NTU1MDM0MVAgERGBIxNDU2Nzg5MAAAA==",  branch: "New York Office",     status: "Read",      latency: 209, deliveredAt: "2026-07-17 13:51:05.612", readAt: "2026-07-17 13:51:44.309" },
  { id: "14", timestamp: "2026-07-17 13:47:18.229", recipient: "+33 1 4723 0890",   messageId: "wamid.HBgMMzMxNDcyMzA4OTBVAgERGBIzNDU2Nzg5OAAAA==", branch: "Remote Team",   status: "Delivered",  latency: 312, deliveredAt: "2026-07-17 13:47:19.901" },
  { id: "15", timestamp: "2026-07-17 13:43:52.114", recipient: "+1 917 555 0821",   messageId: "wamid.HBgMOTE3NTU1MDgyMVAgERGBIyNDU2Nzg5MAAAA==",  branch: "New York Office",     status: "Sent",      latency: 78 },
  { id: "16", timestamp: "2026-07-17 13:40:07.887", recipient: "+44 20 7946 0512",  messageId: "wamid.HBgMNDQyMDc5NDYwNTEyVAgERGBIxMjM0NTY3MAAAA==", branch: "London Branch", status: "Failed",    latency: 0,   errorCode: "132015", errorTitle: "Template parameter count mismatch", errorNote: "The number of variables passed does not match the approved template definition. Check your template mapping in Step 3 before re-sending." },
  { id: "17", timestamp: "2026-07-17 13:36:29.441", recipient: "+61 2 9374 4000",   messageId: "wamid.HBgMNjEyOTM3NDQwMDBVAgERGBIzNTY3ODkwMAAA==",  branch: "Remote Team",   status: "Read",      latency: 145, deliveredAt: "2026-07-17 13:36:30.518", readAt: "2026-07-17 13:37:11.204" },
  { id: "18", timestamp: "2026-07-17 13:32:54.662", recipient: "+1 212 555 0394",   messageId: "wamid.HBgMMTIxMjU1NTAzOTRVAgERGBIxMjM0NTY3OQAAA==", branch: "New York Office",     status: "Delivered",  latency: 189, deliveredAt: "2026-07-17 13:32:56.001" },
  { id: "19", timestamp: "2026-07-17 13:28:11.338", recipient: "+81 3 3458 6011",   messageId: "wamid.HBgMODEzMzQ1ODYwMTFVAgERGBIyMzQ1Njc4OAAAA==", branch: "Remote Team",   status: "Sent",      latency: 103 },
  { id: "20", timestamp: "2026-07-17 13:24:38.905", recipient: "+44 7700 900876",   messageId: "wamid.HBgMNDQ3NzAwOTAwODc2VAgERGBIzNDU2Nzg5MAAAA==", branch: "London Branch", status: "Read",      latency: 221, deliveredAt: "2026-07-17 13:24:39.781", readAt: "2026-07-17 13:25:22.640" },
  { id: "21", timestamp: "2026-07-17 13:19:02.773", recipient: "+1 646 555 0519",   messageId: "wamid.HBgMNjQ2NTU1MDUxOVAgERGBIxNDU2Nzg5OAAAA==",  branch: "New York Office",     status: "Delivered",  latency: 156, deliveredAt: "2026-07-17 13:19:04.189" },
  { id: "22", timestamp: "2026-07-17 13:14:47.551", recipient: "+55 11 9876 5432",  messageId: "wamid.HBgMNTUxMTk4NzY1NDMyVAgERGBIyMzQ1Njc4MAAAA==", branch: "Remote Team",   status: "Read",      latency: 194, deliveredAt: "2026-07-17 13:14:48.604", readAt: "2026-07-17 13:15:30.119" },
  { id: "23", timestamp: "2026-07-17 13:10:19.004", recipient: "+44 20 7946 0733",  messageId: "wamid.HBgMNDQyMDc5NDYwNzMzVAgERGBIzNDU2Nzg5OAAAA==", branch: "London Branch", status: "Sent",      latency: 87 },
  { id: "24", timestamp: "2026-07-17 13:06:55.882", recipient: "+1 212 555 0463",   messageId: "wamid.HBgMMTIxMjU1NTMwNDYzVAgERGBIxMjM0NTY3MAAAA==", branch: "New York Office",     status: "Read",      latency: 267, deliveredAt: "2026-07-17 13:06:57.001", readAt: "2026-07-17 13:07:48.553" },
  { id: "25", timestamp: "2026-07-17 13:01:22.117", recipient: "+34 91 123 4567",   messageId: "wamid.HBgMMzQ5MTEyMzQ1NjdVAgERGBIyNDU2Nzg5MAAAA==",  branch: "Remote Team",   status: "Delivered",  latency: 243, deliveredAt: "2026-07-17 13:01:23.814" },
];

const LOG_STATUS_STYLES: Record<LogStatus, { bg: string; fg: string; dot: string }> = {
  Sent:      { bg: "#F8FAFC", fg: "#64748B", dot: "#94A3B8" },
  Delivered: { bg: "#EFF6FF", fg: "#1D4ED8", dot: "#2563EB" },
  Read:      { bg: "#F0FDF4", fg: "#16A34A", dot: "#22C55E" },
  Failed:    { bg: "#FEF2F2", fg: "#B91C1C", dot: "#EF4444" },
};

function LogStatusBadge({ status }: { status: LogStatus }) {
  const s = LOG_STATUS_STYLES[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

function highlightJson(raw: string): string {
  return raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("[\w@.:_\-/=+]+")\s*:/g, '<span style="color:#7DD3FC">$1</span>:')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, (_m, v) => `: <span style="color:#86EFAC">${v}</span>`)
    .replace(/:\s*(\d+)/g, (_m, v) => `: <span style="color:#FCA5A5">${v}</span>`)
    .replace(/:\s*(true|false|null)/g, (_m, v) => `: <span style="color:#C4B5FD">${v}</span>`);
}

// ── Message Logs screen ────────────────────────────────────────────────────────

function LogsScreen() {
  const [branch, setBranch] = useState("All Branches");
  const [branchOpen, setBranchOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("Last 24h");
  const [timeOpen, setTimeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<LogStatus[]>([]);
  const [tableBranch, setTableBranch] = useState("All Branches");
  const [tableBranchOpen, setTableBranchOpen] = useState(false);
  const [sortCol, setSortCol] = useState<"timestamp" | "branch" | "status" | "latency">("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleStatus = (s: LogStatus) =>
    setStatusFilters(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ArrowUpDown size={12} style={{ color: "#CBD5E1" }} />;
    return sortDir === "asc" ? <ArrowUp size={12} style={{ color: "#2563EB" }} /> : <ArrowDown size={12} style={{ color: "#2563EB" }} />;
  };

  const filtered = RAW_LOGS
    .filter(r => {
      const matchBranch = tableBranch === "All Branches" || r.branch === tableBranch;
      const matchHeader = branch === "All Branches" || r.branch === branch;
      const matchSearch = !search || r.recipient.includes(search) || r.messageId.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilters.length === 0 || statusFilters.includes(r.status);
      return matchBranch && matchHeader && matchSearch && matchStatus;
    })
    .sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (sortCol === "timestamp") { av = a.timestamp; bv = b.timestamp; }
      if (sortCol === "branch")    { av = a.branch;    bv = b.branch; }
      if (sortCol === "status")    { av = a.status;    bv = b.status; }
      if (sortCol === "latency")   { av = a.latency;   bv = b.latency; }
      return sortDir === "asc" ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });

  // Metrics derived from filtered data
  const deliveredOrBetter = filtered.filter(r => r.status === "Delivered" || r.status === "Read").length;
  const readCount = filtered.filter(r => r.status === "Read").length;
  const total = filtered.length || 1;
  const deliveredRate = ((deliveredOrBetter / total) * 100).toFixed(1);
  const readRate = ((readCount / total) * 100).toFixed(1);
  const successLatencies = filtered.filter(r => r.latency > 0).map(r => r.latency);
  const avgLatency = successLatencies.length
    ? Math.round(successLatencies.reduce((a, b) => a + b, 0) / successLatencies.length)
    : 0;

  const queueHealthy = avgLatency < 300;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8 w-full" onClick={() => { setBranchOpen(false); setTimeOpen(false); setTableBranchOpen(false); }}>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#0F172A" }}>Message Logs</h1>
          <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
            Acme Corp · {branch} · {timeRange}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Queue Status pill */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: queueHealthy ? "#F0FDF4" : "#FFFBEB", color: queueHealthy ? "#15803D" : "#B45309", border: `1px solid ${queueHealthy ? "#BBF7D0" : "#FDE68A"}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: queueHealthy ? "#22C55E" : "#F59E0B" }} />
            Queue {queueHealthy ? "Active" : "Degraded"}
          </span>

          {/* Branch filter */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setBranchOpen(!branchOpen); setTimeOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-md text-sm font-medium"
              style={{ border: "1px solid #E2E8F0", color: "#374151", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <Building2 size={13} style={{ color: "#94A3B8" }} />
              <span className="hidden sm:inline">{branch}</span>
              <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${branchOpen ? "rotate-180" : ""}`} />
            </button>
            {branchOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                {BRANCHES.map(b => (
                  <button key={b} onClick={() => { setBranch(b); setBranchOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                    style={{ color: branch === b ? "#2563EB" : "#374151", background: branch === b ? "#EFF6FF" : "transparent" }}>
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time range */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setTimeOpen(!timeOpen); setBranchOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-md text-sm font-medium"
              style={{ border: "1px solid #E2E8F0", color: "#374151", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <Clock size={13} style={{ color: "#94A3B8" }} />
              <span className="hidden sm:inline">{timeRange}</span>
              <ChevronDown size={13} style={{ color: "#94A3B8" }} className={`transition-transform ${timeOpen ? "rotate-180" : ""}`} />
            </button>
            {timeOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-40 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                {["Last 24h", "Last 7d", "Custom"].map(t => (
                  <button key={t} onClick={() => { setTimeRange(t); setTimeOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                    style={{ color: timeRange === t ? "#2563EB" : "#374151", background: timeRange === t ? "#EFF6FF" : "transparent" }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Delivered Rate", value: `${deliveredRate}%`, accent: "#2563EB", seriesKey: "logDlv", sparkVals: [94,96,95,97,94,96,95,parseFloat(deliveredRate)], sub: null },
          { label: "Read Rate",      value: `${readRate}%`,      accent: "#8B5CF6", seriesKey: "logRd",  sparkVals: [65,67,64,68,66,69,67,parseFloat(readRate)], sub: null },
          { label: "Avg Queue Latency", value: `${avgLatency} ms`, accent: "#0D9488", seriesKey: "logLat", sparkVals: [148,142,156,138,145,152,139,avgLatency], sub: "P95: 380 ms" },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-lg p-4 flex flex-col gap-1" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-medium" style={{ color: "#64748B" }}>{card.label}</p>
            <p className="text-2xl font-semibold" style={{ color: "#0F172A" }}>{card.value}</p>
            {card.sub && <p className="text-[11px]" style={{ color: "#94A3B8" }}>{card.sub}</p>}
            <SparkLine data={card.sparkVals} color={card.accent} seriesKey={card.seriesKey} />
          </div>
        ))}
      </div>

      {/* ── Table controls ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by phone or Message ID…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-md outline-none"
            style={{ border: "1px solid #E2E8F0", background: "#fff", color: "#1E293B", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            onFocus={e => { e.currentTarget.style.border = "1px solid #93C5FD"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
            onBlur={e => { e.currentTarget.style.border = "1px solid #E2E8F0"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }}
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }}><X size={13} /></button>}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5">
          {(["Sent", "Delivered", "Read", "Failed"] as LogStatus[]).map(s => {
            const active = statusFilters.includes(s);
            const st = LOG_STATUS_STYLES[s];
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: active ? st.bg : "#F8FAFC",
                  color: active ? st.fg : "#94A3B8",
                  border: `1px solid ${active ? st.dot + "40" : "#E2E8F0"}`,
                }}
              >
                {active && <Check size={10} />}
                {s}
              </button>
            );
          })}
        </div>

        {/* Table branch filter */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setTableBranchOpen(!tableBranchOpen); }}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-md text-sm font-medium whitespace-nowrap"
            style={{ border: "1px solid #E2E8F0", color: "#374151", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
          >
            <Building2 size={13} style={{ color: "#94A3B8" }} />
            <span className="hidden sm:inline">{tableBranch}</span>
            <ChevronDown size={13} style={{ color: "#94A3B8" }} />
          </button>
          {tableBranchOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-md z-30 overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
              {BRANCHES.map(b => (
                <button key={b} onClick={() => { setTableBranch(b); setTableBranchOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50"
                  style={{ color: tableBranch === b ? "#2563EB" : "#374151", background: tableBranch === b ? "#EFF6FF" : "transparent" }}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Log table ── */}
      <div className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #F1F5F9" }}>
                {[
                  { label: "Timestamp",  col: "timestamp" as const, mono: true },
                  { label: "Recipient",  col: null },
                  { label: "Message ID", col: null, mono: true },
                  { label: "Branch",     col: "branch" as const },
                  { label: "Status",     col: "status" as const },
                  { label: "Latency",    col: "latency" as const },
                ].map(({ label, col, mono }) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left"
                    onClick={() => col && toggleSort(col)}
                    style={{ cursor: col ? "pointer" : "default", userSelect: "none" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8", fontFamily: mono ? "ui-monospace,monospace" : undefined }}>
                        {label}
                      </span>
                      {col && <SortIcon col={col} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F8FAFC" : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFC")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ fontFamily: "ui-monospace,monospace", color: "#475569" }}>
                    {row.timestamp}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ fontFamily: "ui-monospace,monospace", color: "#1E293B" }}>
                    {row.recipient}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ fontFamily: "ui-monospace,monospace", color: "#64748B", maxWidth: "160px" }}>
                    <span title={row.messageId} className="truncate block" style={{ maxWidth: "160px" }}>
                      {row.messageId.length > 28 ? row.messageId.slice(0, 28) + "…" : row.messageId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap" style={{ background: "#F1F5F9", color: "#475569" }}>
                      <Building2 size={10} style={{ color: "#94A3B8" }} />
                      {row.branch}
                    </span>
                  </td>
                  <td className="px-4 py-3"><LogStatusBadge status={row.status} /></td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ fontFamily: "ui-monospace,monospace", color: row.latency === 0 ? "#94A3B8" : row.latency > 250 ? "#B45309" : "#475569" }}>
                    {row.latency === 0 ? "—" : `${row.latency} ms`}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "#94A3B8" }}>No log entries match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: "1px solid #F1F5F9" }}>
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            Showing <strong style={{ color: "#475569" }}>{filtered.length}</strong> of <strong style={{ color: "#475569" }}>{RAW_LOGS.length}</strong> events
          </p>
          <p className="text-xs" style={{ color: "#94A3B8" }}>Acme Corp · Outbound only</p>
        </div>
      </div>

      {/* ── Row detail drawer (fixed overlay) ── */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(15,23,42,0.25)" }}
            onClick={() => setSelected(null)}
          />
          <div
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden bg-white"
            style={{ width: "min(480px, 100vw)", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)", borderLeft: "1px solid #E2E8F0" }}
          >
            {/* Drawer header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold truncate" style={{ fontFamily: "ui-monospace,monospace", color: "#1E293B" }}>{selected.recipient}</span>
                <LogStatusBadge status={selected.status} />
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-md hover:bg-slate-100 transition-colors flex-shrink-0 ml-2" style={{ color: "#64748B" }}>
                <X size={16} />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">

              {/* Section 1: Meta Response */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Meta Response</p>
                <div className="flex flex-col gap-2.5">
                  {[
                    ["Message ID",        selected.messageId],
                    ["Timestamp Sent",    selected.timestamp],
                    ["Timestamp Delivered", selected.deliveredAt ?? "—"],
                    ["Timestamp Read",    selected.readAt ?? "—"],
                    ["Latency Total",     selected.latency > 0 ? `${selected.latency} ms` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <p className="text-[11px] font-medium" style={{ color: "#94A3B8" }}>{k}</p>
                      <p className="text-xs break-all" style={{ fontFamily: "ui-monospace,monospace", color: "#1E293B" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Error Diagnostic (Failed only) */}
              {selected.status === "Failed" && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Error Diagnostic</p>
                  <div className="rounded-md p-4 flex flex-col gap-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} style={{ color: "#B91C1C", flexShrink: 0, marginTop: 1 }} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#B91C1C", fontFamily: "ui-monospace,monospace" }}>
                            {selected.errorCode}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: "#B91C1C" }}>{selected.errorTitle}</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "#7F1D1D" }}>{selected.errorNote}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Raw Webhook Payload */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Raw Webhook Payload</p>
                  <button
                    onClick={() => handleCopy(makeWebhook(selected))}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                    style={{ background: copied ? "#F0FDF4" : "#F1F5F9", color: copied ? "#16A34A" : "#64748B", border: `1px solid ${copied ? "#BBF7D0" : "#E2E8F0"}` }}
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="rounded-md overflow-hidden" style={{ background: "#0F172A" }}>
                  <pre
                    className="text-[11px] leading-relaxed p-4 overflow-x-auto"
                    style={{ fontFamily: "ui-monospace,monospace", color: "#E2E8F0", margin: 0 }}
                    dangerouslySetInnerHTML={{ __html: highlightJson(makeWebhook(selected)) }}
                  />
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = (id: string) => {
    if (id === "contacts") setScreen("contacts");
    else if (id === "campaigns") setScreen("campaign");
    else if (id === "logs") setScreen("logs");
    else setScreen("dashboard");
  };

  const activeNav =
    screen === "contacts" ? "contacts" :
    screen === "campaign" ? "campaigns" :
    screen === "logs" ? "logs" :
    "dashboard";

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: "#F1F5F9" }}
    >
      <Sidebar
        active={activeNav}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Right-hand workspace: fills all remaining width and height */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <MobileTopbar onMenuOpen={() => setSidebarOpen(true)} />
        <main
          className="flex-1 w-full"
          style={{
            overflowY: screen === "campaign" ? "hidden" : "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {screen === "dashboard" && <DashboardScreen />}
          {screen === "contacts"  && <ContactsScreen />}
          {screen === "campaign"  && <CampaignScreen />}
          {screen === "logs"      && <LogsScreen />}
        </main>
      </div>
    </div>
  );
}
