/**
 * Data-fetching hooks. Each hook manages its own loading/error state
 * and (where relevant) polling. Consumers just destructure { data, loading, error }.
 */
import { useEffect, useMemo, useState } from "react";

import {
  api,
  type ActivityPoint,
  type Branch,
  type DashboardKpis,
  type LatestBroadcast,
  type ContactsListParams,
  type ContactsListResponse,
  type UploadResponse,
} from "../api";
import { useAuth } from "../auth";

// ─── useBranches ─────────────────────────────────────────────────────────────

export function useBranches(): {
  branches: Branch[];
  loading: boolean;
  error: string | null;
} {
  const { session, activeTenantId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeTenantId) return;
    let cancelled = false;
    setLoading(true);
    api
      .branches(session.access_token, activeTenantId)
      .then((res) => {
        if (!cancelled) {
          setBranches(res.data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, activeTenantId]);

  return { branches, loading, error };
}

// ─── useDashboard ────────────────────────────────────────────────────────────

export interface DashboardData {
  kpis: DashboardKpis;
  activity: ActivityPoint[];
  campaignCounts: Record<string, number>;
  latest: LatestBroadcast[];
}

const POLL_INTERVAL_MS = 10_000;

export function useDashboard(branchId: string | undefined): {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { session, activeTenantId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const filters = useMemo(
    () => (branchId ? { branch_id: branchId } : undefined),
    [branchId],
  );

  useEffect(() => {
    if (!session || !activeTenantId) return;

    let cancelled = false;
    let intervalId: number | undefined;

    const fetchAll = async (isInitial: boolean) => {
      if (isInitial) setLoading(true);
      try {
        const token = session.access_token;
        const tenant = activeTenantId;
        const [kpis, activity, status, latest] = await Promise.all([
          api.dashboardKpis(token, tenant, filters),
          api.dashboardActivity(token, tenant, filters),
          api.dashboardCampaignStatus(token, tenant, filters),
          api.dashboardLatestBroadcasts(token, tenant, {
            ...(filters ?? {}),
            limit: 10,
          }),
        ]);
        if (cancelled) return;
        setData({
          kpis,
          activity: activity.series,
          campaignCounts: status.counts,
          latest: latest.data,
        });
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? String(e));
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    };

    fetchAll(true);
    intervalId = window.setInterval(() => fetchAll(false), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [session?.access_token, activeTenantId, filters, tick]);

  const refresh = () => setTick((t) => t + 1);

  return { data, loading, error, refresh };
}

// ─── useContacts ─────────────────────────────────────────────────────────────

export function useContacts(params: ContactsListParams): {
  data: ContactsListResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { session, activeTenantId } = useAuth();
  const [data, setData] = useState<ContactsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Stable stringification so an inline `{}` doesn't refetch every render.
  const key = useMemo(() => JSON.stringify(params ?? {}), [params]);

  useEffect(() => {
    if (!session || !activeTenantId) return;
    let cancelled = false;
    setLoading(true);
    api
      .contacts(session.access_token, activeTenantId, JSON.parse(key))
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, activeTenantId, key, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

// ─── useContactsCount ────────────────────────────────────────────────────────

export function useContactsCount(): {
  count: number | null;
  loading: boolean;
  error: string | null;
} {
  const { session, activeTenantId } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeTenantId) return;
    let cancelled = false;
    setLoading(true);
    api
      .contactsCount(session.access_token, activeTenantId)
      .then((res) => {
        if (!cancelled) {
          setCount(res.count);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, activeTenantId]);

  return { count, loading, error };
}

// ─── useUploadContacts ───────────────────────────────────────────────────────

export function useUploadContacts(): {
  upload: (
    file: File,
    branchId: string,
    commit: boolean,
  ) => Promise<UploadResponse>;
  uploading: boolean;
  error: string | null;
} {
  const { session, activeTenantId } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, branchId: string, commit: boolean) => {
    if (!session || !activeTenantId) {
      throw new Error("Not authenticated or no tenant selected");
    }
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadContacts(
        session.access_token,
        activeTenantId,
        { file, branch_id: branchId, commit },
      );
      return res;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error };
}
