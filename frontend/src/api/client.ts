// Thin fetch wrapper for the local FastAPI backend (proxied at /api by Vite).

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

type AuthFailureHandler = (code: string) => void;
let onAuthFailure: AuthFailureHandler | null = null;

export function setAuthFailureHandler(fn: AuthFailureHandler): void {
  onAuthFailure = fn;
}

export async function api<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean; silentAuth?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      keepalive: opts.keepalive ?? false,
      headers: { "Content-Type": "application/json", "X-OI-Client": "web" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "network");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const e = new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? res.statusText, err?.details);
    if (res.status === 401 && !opts.silentAuth && onAuthFailure) onAuthFailure(e.code);
    throw e;
  }
  return data as T;
}

export const get = <T>(path: string, opts?: { silentAuth?: boolean }) => api<T>("GET", path, undefined, opts);
export const post = <T>(path: string, body?: unknown, opts?: { keepalive?: boolean }) => api<T>("POST", path, body ?? {}, opts);
export const put = <T>(path: string, body: unknown) => api<T>("PUT", path, body);
