/**
 * Privileged vault HTTP — routes through the extension service worker when
 * available so YouTube content scripts can reach http://127.0.0.1:8787.
 */

type ProxyOk = {
  ok: true;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

type ProxyErr = {
  ok: false;
  error: string;
};

function headersToObject(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = v;
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

function bodyToString(body?: BodyInit | null): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  // Content scripts only send JSON strings for vault calls
  return String(body);
}

/**
 * Drop-in replacement for fetch() for vault API calls.
 */
export async function vaultHttp(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const headers = headersToObject(init.headers);
  const body = bodyToString(init.body ?? null);

  // Prefer background proxy (bypasses Private Network Access on YouTube)
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "VAULT_FETCH",
        url,
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? null : body,
      })) as ProxyOk | ProxyErr | undefined;

      if (result && "error" in result && result.ok === false) {
        throw new Error(result.error || "Vault proxy error");
      }
      if (result && result.ok === true) {
        return new Response(result.body ?? "", {
          status: result.status,
          statusText: result.statusText || "",
          headers: result.headers || {},
        });
      }
      // undefined → no SW listener; fall through
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If SW missing, try direct; if SW returned real network error, rethrow
      if (
        /Receiving end does not exist|Could not establish connection|Extension context invalidated/i.test(
          msg
        )
      ) {
        // fall through to direct fetch
      } else if (/Failed to fetch|NetworkError|Load failed|vault/i.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      } else if (msg && !/undefined/i.test(msg)) {
        // Proxy returned a specific error (e.g. not allowed)
        throw err instanceof Error ? err : new Error(msg);
      }
    }
  }

  // Direct fetch (popup / options / when SW unavailable)
  return fetch(url, init);
}
