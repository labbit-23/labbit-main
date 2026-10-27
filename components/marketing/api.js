"use client";
// Thin fetch wrapper for /api/admin/marketing/*. Every call goes to the same-origin API with the staff cookie.
// Errors carry .status (401/403/409/...) and .payload so screens can show clear states.
import { useCallback, useEffect, useRef, useState } from "react";

export const API = "/api/admin/marketing";

export async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(`${API}${path}`, opts); } catch (e) { const err = new Error("Network error. Check your connection."); err.status = 0; throw err; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || (data?.errors || []).join("; ") || (res.status === 403 ? "You do not have permission for this." : res.status === 401 ? "Please sign in again." : `Request failed (${res.status})`));
    err.status = res.status; err.payload = data;
    throw err;
  }
  return data;
}

/** GET with loading/error state. Pass null path to skip. */
export function useApi(path, deps = []) {
  const [state, set] = useState({ loading: !!path, data: null, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    set((s) => ({ ...s, loading: true, error: null }));
    try { const data = await api(path); if (my === seq.current) set({ loading: false, data, error: null }); }
    catch (error) { if (my === seq.current) set({ loading: false, data: null, error }); }
  }, [path]);
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}
