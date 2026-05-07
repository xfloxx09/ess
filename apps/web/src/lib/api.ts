function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).replace(/\/$/, "");
  }
  return "/api-backend";
}

const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export function getApiBase(): string {
  return API_BASE;
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string;
  withCredentials?: boolean;
}

function isApiOptions(value: unknown): value is ApiOptions {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if ("token" in obj || "withCredentials" in obj) return true;
  if ("body" in obj) {
    const body = obj.body;
    if (body === undefined || body === null) return false;
    return typeof body !== "string" && !(body instanceof FormData) && !(body instanceof Blob);
  }
  return false;
}

/**
 * `api(path, options)` — preferred signature. `options.body` is auto-JSON-encoded.
 *
 * Backwards compatible legacy form `api(path, init, token)` is also accepted so
 * existing pages keep working during the rebuild.
 */
export async function api<T>(path: string, opts?: ApiOptions): Promise<T>;
export async function api<T>(path: string, init: RequestInit | undefined, token?: string): Promise<T>;
export async function api<T>(path: string, optsOrInit?: ApiOptions | RequestInit, legacyToken?: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  let body: BodyInit | null | undefined;
  let headers: Record<string, string> = {};
  let token: string | undefined;
  let withCredentials = true;
  let rest: RequestInit = {};

  if (legacyToken !== undefined || (!isApiOptions(optsOrInit) && optsOrInit && "body" in optsOrInit && typeof (optsOrInit as RequestInit).body === "string")) {
    // Legacy: api(path, init, token)
    const init = (optsOrInit ?? {}) as RequestInit;
    const { headers: h, body: b, ...r } = init;
    headers = (h as Record<string, string>) ?? {};
    body = b ?? undefined;
    token = legacyToken;
    rest = r;
  } else {
    const o = (optsOrInit ?? {}) as ApiOptions;
    headers = (o.headers as Record<string, string>) ?? {};
    if (o.body !== undefined) {
      body = JSON.stringify(o.body);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
    token = o.token;
    withCredentials = o.withCredentials ?? true;
    const { token: _, body: __, withCredentials: ___, headers: ____, ...r } = o;
    rest = r;
  }

  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body: body ?? null,
      credentials: withCredentials ? "include" : "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(
      `Cannot reach the API at ${url} (${detail}). Is the backend running and reachable? In dev: \`pnpm dev\` or \`pnpm --filter @ess/api dev\` (port 4000). In production set NEXT_PUBLIC_API_BASE.`,
      0,
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let issues: Array<{ path: string; message: string }> | undefined;
    try {
      const json = (await response.json()) as { message?: string | string[]; issues?: Array<{ path: string; message: string }> };
      if (Array.isArray(json.message)) message = json.message.join(", ");
      else if (json.message) message = json.message;
      issues = json.issues;
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // ignore
      }
    }
    throw new ApiError(message, response.status, issues);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
