// Talks to the API with the installer's key. The key lives in this browser only.
const KEY = "ipe.apiKey";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const apiKey = {
  get(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(value: string) { try { localStorage.setItem(KEY, value); } catch { /* private mode: key lasts this page only */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = apiKey.get();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (key) headers["x-api-key"] = key;
  if (init.body) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "The server can't be reached. Check that the API is running.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
