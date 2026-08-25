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

function loopbackInit(init: RequestInit): RequestInit {
  return {
    ...init,
    // Chrome 142+ Local Network Access — loopback to the vault on this machine
    targetAddressSpace: "loopback",
  } as RequestInit;
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

      if (result && result.ok === true) {
        return new Response(result.body ?? "", {
          status: result.status,
          statusText: result.statusText || "",
          headers: result.headers || {},
        });
      }
      // Policy errors should not fall through to a second blocked fetch
      if (
        result &&
        result.ok === false &&
        /not allowed by extension/i.test(result.error || "")
      ) {
        throw new Error(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not allowed by extension/i.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
      // SW missing, asleep, or localhost blocked — try a direct fetch next
    }
  }

  try {
    return await fetch(url, loopbackInit(init));
  } catch {
    return fetch(url, init);
  }
}
