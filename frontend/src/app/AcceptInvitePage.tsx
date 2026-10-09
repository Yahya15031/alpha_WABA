import { useState, useEffect } from 'react';
import { supabase } from '../auth';

export default function AcceptInvitePage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL fragment automatically on load
    supabase.auth.getSession();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Minimum 8 characters'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = '/'; }, 1500);
  }

  if (done) return <div className="p-8 text-center">Welcome. Redirecting…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow-md w-96 space-y-3">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <input type="password" placeholder="Password (min 8 chars)"
          value={password} onChange={e => setPassword(e.target.value)}
          className="w-full border rounded p-2" required />
        <input type="password" placeholder="Confirm password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className="w-full border rounded p-2" required />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button type="submit" disabled={busy}
          className="w-full bg-blue-600 text-white rounded p-2 disabled:opacity-50">
          {busy ? 'Setting password…' : 'Set password and continue'}
        </button>
      </form>
    </div>
  );
}