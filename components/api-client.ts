export interface ApiResult {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

type JsonPayload = {
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function callApi(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as JsonPayload;

    return {
      ok: response.ok,
      message: payload.message,
      error: payload.error,
      fieldErrors: payload.fieldErrors,
    };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export async function fetchList<T>(
  url: string
): Promise<{ ok: boolean; items: T[]; error?: string }> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      users?: T[];
      error?: string;
    };
    return {
      ok: response.ok,
      items: payload.users ?? [],
      error: payload.error,
    };
  } catch {
    return { ok: false, items: [], error: "Network error. Please try again." };
  }
}

export async function callApiJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: boolean; data: T | null; error?: string; message?: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & T;

    return {
      ok: response.ok,
      data: response.ok ? payload : null,
      error: payload.error,
      message: payload.message,
    };
  } catch {
    return { ok: false, data: null, error: "Network error. Please try again." };
  }
}

export async function fetchJson<T>(
  url: string
): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & T;
    return {
      ok: response.ok,
      data: response.ok ? payload : null,
      error: payload.error,
    };
  } catch {
    return { ok: false, data: null, error: "Network error. Please try again." };
  }
}
