/**
 * Thin HTTP client that wraps the Monnet backend with X-API-Key auth.
 *
 * Both env vars come from the MCP client's config JSON, not from a shell
 * .env — the MCP server is spawned by Claude Desktop / Cursor with this env.
 */

const MONNET_API_URL = (process.env.MONNET_API_URL || "https://api.monnet.ai").replace(/\/$/, "");
const MONNET_API_KEY = process.env.MONNET_API_KEY;

if (!MONNET_API_KEY) {
  process.stderr.write(
    "Error: MONNET_API_KEY environment variable is not set.\n" +
    "Generate one at https://app.monnet.ai/settings (API Keys tab) and add it to your MCP client config.\n"
  );
  process.exit(1);
}

export class MonnetApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MonnetApiError";
  }
}

function friendlyMessage(status: number, detail: string | null): string {
  // Backend-supplied detail is always preferred for client errors that carry
  // actionable info (permission denials, validation errors, not-found hints).
  const fallback = detail ? `: ${detail}` : "";
  switch (status) {
    case 401:
      return (
        "Your Monnet API key is invalid or has been revoked. " +
        "Generate a new one in the Monnet web app under Settings → API Keys."
      );
    case 403:
      return `You don't have permission to perform this action${fallback}. Ask the workspace owner to add you as a member or bump your role.`;
    case 404:
      return `Not found${fallback}. Double-check the workspace slug or motion id.`;
    case 409:
      return `Conflict${fallback}.`;
    case 422:
      return `Invalid input${fallback}.`;
    case 429:
      return "Rate limited by the Monnet backend. Wait a moment and retry.";
    case 500:
    case 502:
    case 503:
      return "The Monnet backend is unavailable right now. Please retry in a moment.";
    default:
      return `Monnet API ${status}${fallback}`;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${MONNET_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "X-API-Key": MONNET_API_KEY as string,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new MonnetApiError(0, "Request timed out after 30 seconds. The Monnet backend may be overloaded — try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // FastAPI returns errors as {"detail": "..."} — grab it if present,
    // otherwise fall back to a generic message for this status.
    let detail: string | null = null;
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed.detail === "string") {
        detail = parsed.detail;
      }
    } catch {
      // Non-JSON body — ignore.
    }
    throw new MonnetApiError(response.status, friendlyMessage(response.status, detail));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * POST that may return SSE (when Monnet is triggered by the message).
 *
 * If the response is a normal JSON payload, returns the message content.
 * If it's an SSE stream, consumes it and returns Monnet's final response text.
 */
export async function apiPostWithSSE(path: string, body: unknown): Promise<{ message: string; monnetResponse: string | null }> {
  const controller = new AbortController();
  // SSE streams can be long (Monnet thinking) — use a longer timeout.
  const timer = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(`${MONNET_API_URL}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "X-API-Key": MONNET_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new MonnetApiError(0, "Request timed out. Monnet may still be processing — check the motion in the web app.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail: string | null = null;
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
    } catch { /* ignore */ }
    throw new MonnetApiError(response.status, friendlyMessage(response.status, detail));
  }

  const contentType = response.headers.get("content-type") || "";

  // Non-streaming: Monnet didn't respond — return the created message as-is
  if (!contentType.includes("text/event-stream")) {
    const data = await response.json();
    return { message: data.content || JSON.stringify(data), monnetResponse: null };
  }

  // SSE stream: buffer the full body and parse all events at the end.
  // We don't render tokens incrementally, so no need for a streaming reader.
  // Regex-based split handles both LF (\n\n) and CRLF (\r\n\r\n) separators.
  const bodyText = await response.text();
  let monnetText = "";
  let userMessage = "";
  let errorText = "";

  for (const rawEvent of bodyText.split(/\r?\n\r?\n/)) {
    if (!rawEvent.trim()) continue;
    let eventType = "message";
    let data = "";
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trimStart();
    }
    if (eventType === "user_message_saved" && data) {
      try { userMessage = JSON.parse(data).content || ""; } catch { /* ignore */ }
    } else if (eventType === "done" && data) {
      try { monnetText = JSON.parse(data).content || ""; } catch { /* ignore */ }
    } else if (eventType === "error" && data) {
      errorText = data;
    }
  }

  if (errorText && !monnetText) {
    return { message: userMessage, monnetResponse: `⚠️ ${errorText}` };
  }
  return { message: userMessage, monnetResponse: monnetText || null };
}

/**
 * Resolve a workspace slug to its workspace_id via GET /workspaces/by-slug/{slug}.
 * Cached in-memory for the process lifetime (workspaces don't change often).
 */
const _slugCache = new Map<string, string>();

export async function resolveWorkspaceId(slug: string): Promise<string> {
  const cached = _slugCache.get(slug);
  if (cached) return cached;
  const ws = await apiFetch<{ id: string }>(`/workspaces/by-slug/${encodeURIComponent(slug)}`);
  _slugCache.set(slug, ws.id);
  return ws.id;
}

/**
 * Return the current user's Clerk user_id (sub claim). Needed to construct
 * the private channel identifier for ask_monnet.
 */
let _cachedUserId: string | null = null;

export async function getCurrentUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;
  const me = await apiFetch<{ sub: string }>("/me");
  _cachedUserId = me.sub;
  return me.sub;
}
