import { useEffect, useState } from "react";
import { supabase } from "../auth";

/**
 * Handles Supabase's password recovery flow. User lands here from the email
 * link — Supabase automatically parses the #access_token hash and puts the
 * session into a "recovery" state, at which point updateUser({ password })
 * completes the reset.
 */
export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase parses the recovery token from the URL hash and fires a
  // PASSWORD_RECOVERY event. Wait for that before letting the user submit,
  // so we don't call updateUser with no session in scope.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also cover the case where the session was already established before
    // this component mounted (fast link click, hash already processed):
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    // Give the user a moment to see the success state, then send them to login
    setTimeout(() => {
      window.location.href = "/";
    }, 2500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, maxWidth: 400, width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#0F172A" }}>Set a new password</h1>
        <p className="text-sm mb-4" style={{ color: "#64748B" }}>
          Choose a new password for your Alpha WABA account.
        </p>

        {success ? (
          <div className="p-3 rounded-md text-sm" style={{ background: "#DCFCE7", color: "#166534", border: "1px solid #BBF7D0" }}>
            Password updated. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#334155" }}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-md outline-none"
                style={{ border: "1px solid #E2E8F0" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#334155" }}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md outline-none"
                style={{ border: "1px solid #E2E8F0" }}
              />
            </div>
            {error && (
              <div className="p-2 rounded-md text-xs" style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !ready}
              className="w-full py-2 rounded-md text-sm font-medium text-white"
              style={{ background: submitting || !ready ? "#CBD5E1" : "#2563EB", cursor: submitting || !ready ? "not-allowed" : "pointer" }}
            >
              {!ready ? "Verifying reset link…" : submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}