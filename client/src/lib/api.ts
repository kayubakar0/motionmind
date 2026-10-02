export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export class ApiCallError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, opts: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}/api/v1${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiCallError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${SERVER_URL}/api/v1${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiCallError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
