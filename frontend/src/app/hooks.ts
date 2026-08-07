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
