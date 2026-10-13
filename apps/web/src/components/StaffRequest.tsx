"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "@/lib/api";

export async function staffRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try { return await browserApi<T>(path, init); }
  catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) window.location.assign("/login");
    throw Object.assign(new Error(status === 403 ? "Нет доступа к этим данным." : "Не удалось выполнить запрос. Попробуйте ещё раз."), { status });
  }
}

// Only the latest request for the current path may publish data or errors.
export function useStaffResource<T>(path: string) {
  const [state, setState] = useState<{ path: string; data: T | null; loading: boolean; error: string }>({ path, data: null, loading: true, error: "" });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState({ path, data: null, loading: true, error: "" });
    try {
      const data = await staffRequest<T>(path);
      if (request === generation.current) setState({ path, data, loading: false, error: "" });
    } catch (error) {
      if (request === generation.current) setState({ path, data: null, loading: false, error: (error as Error).message });
    }
  }, [path]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  const current = state.path === path;
  return { data: current ? state.data : null, loading: !current || state.loading, error: current ? state.error : "", reload };
}

export function StaffLoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="card" role="status">Загрузка…</div>;
  if (error) return <div className="notice error" role="alert">{error} <button type="button" className="btn" onClick={retry}>Повторить загрузку</button></div>;
  return null;
}
