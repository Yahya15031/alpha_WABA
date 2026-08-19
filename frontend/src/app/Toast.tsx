import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  message: string;
  detail?: string;
  variant: "error" | "success" | "info";
  requestId?: string;
  status?: number;
  timestamp: string;
}

interface ToastContextValue {
  push: (t: Omit<ToastItem, "id" | "timestamp">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

// Debug mode: ?debug=1 in URL, or localStorage.setItem('debug','1')
function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "1") return true;
  try {
    return window.localStorage.getItem("debug") === "1";
  } catch {
    return false;
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const debug = isDebugMode();

  const push = useCallback((t: Omit<ToastItem, "id" | "timestamp">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: ToastItem = { ...t, id, timestamp: new Date().toISOString() };
    setToasts((prev) => [...prev, item]);
    // Auto-dismiss success/info after 4s. Errors stay until manually closed
    // (or 12s) since the person may want to read/copy the detail.
    const timeout = t.variant === "error" ? 12_000 : 4_000;
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, timeout);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 420,
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} debug={debug} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Individual toast ────────────────────────────────────────────────────────

function ToastCard({
  toast,
  debug,
  onDismiss,
}: {
  toast: ToastItem;
  debug: boolean;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const colors = {
    error: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "#DC2626" },
    success: { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534", icon: "#16A34A" },
    info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", icon: "#2563EB" },
  }[toast.variant];

  const copyDebug = () => {
    const debugText = JSON.stringify(
      {
        message: toast.message,
        detail: toast.detail,
        status: toast.status,
        requestId: toast.requestId,
        timestamp: toast.timestamp,
      },
      null,
      2,
    );
    navigator.clipboard?.writeText(debugText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1 }}>
          <span style={{ color: colors.icon, fontWeight: 700, lineHeight: 1 }}>
            {toast.variant === "error" ? "✕" : toast.variant === "success" ? "✓" : "ℹ"}
          </span>
          <span style={{ color: colors.text }}>{toast.message}</span>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: colors.text, opacity: 0.6, fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {toast.detail && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: colors.text,
            opacity: 0.7,
            fontSize: 11,
            marginTop: 4,
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      )}

      {expanded && toast.detail && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: "rgba(0,0,0,0.04)",
            borderRadius: 4,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: colors.text,
            wordBreak: "break-word",
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {toast.status && <div>Status: {toast.status}</div>}
          <div style={{ marginTop: 2 }}>{toast.detail}</div>
        </div>
      )}

      {/* Dev-only debug affordance — only renders when debug mode is on */}
      {debug && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={copyDebug}
            style={{
              background: "none",
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 10,
              cursor: "pointer",
              color: colors.text,
            }}
          >
            {copied ? "Copied!" : "Copy debug info"}
          </button>
          <span style={{ fontSize: 10, color: colors.text, opacity: 0.5 }}>
            {toast.timestamp.split("T")[1]?.split(".")[0]}
          </span>
        </div>
      )}
    </div>
  );
}