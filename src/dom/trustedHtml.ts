/**
 * YouTube enforces Trusted Types (`require-trusted-types-for 'script'`).
 * Isolated-world content scripts still hit that sink, so `el.innerHTML = "..."`
 * throws and the VideoSearch UI never mounts — Chrome then logs a flood of
 * "This document requires 'TrustedHTML' assignment" errors.
 *
 * Patch innerHTML in THIS isolated world only (page JS is untouched).
 */

type TrustedHTMLValue = { toString(): string };

type Policy = {
  createHTML: (input: string) => TrustedHTMLValue;
};

let installed = false;
let policy: Policy | null = null;
let policyTried = false;
let nativeInnerHTMLSet: ((this: Element, v: string) => void) | null = null;
let nativeInnerHTMLGet: ((this: Element) => string) | null = null;
let nativeInsertAdjacentHTML:
  | ((this: Element, position: InsertPosition, html: string) => void)
  | null = null;

function getPolicy(): Policy | null {
  if (policyTried) return policy;
  policyTried = true;
  const tt = (
    globalThis as unknown as {
      trustedTypes?: {
        createPolicy: (
          name: string,
          rules: { createHTML: (s: string) => string }
        ) => Policy;
        defaultPolicy?: Policy;
      };
    }
  ).trustedTypes;
  if (!tt) return null;
  try {
    policy = tt.createPolicy("videosearch-ai", {
      createHTML: (s) => s,
    });
    return policy;
  } catch {
    try {
      if (tt.defaultPolicy) {
        policy = tt.defaultPolicy;
        return policy;
      }
    } catch {
      /* page CSP does not allow a custom / default policy */
    }
  }
  policy = null;
  return null;
}

function toAssignValue(html: string): string | TrustedHTMLValue {
  const p = getPolicy();
  if (!p) return html;
  try {
    return p.createHTML(html);
  } catch {
    return html;
  }
}

function parseInto(el: Element, html: string): void {
  const parsed = new DOMParser().parseFromString(
    `<div id="vsa-tt-wrap">${html}</div>`,
    "text/html"
  );
  const box = parsed.getElementById("vsa-tt-wrap");
  el.replaceChildren(...Array.from((box ?? parsed.body).childNodes));
}

let assigning = false;

function assignInnerHTML(el: Element, raw: unknown): void {
  const html = raw == null ? "" : String(raw);
  if (assigning) {
    try {
      nativeInnerHTMLSet?.call(el, toAssignValue(html) as string);
    } catch {
      /* nested innerHTML from setHTMLUnsafe — ignore */
    }
    return;
  }
  assigning = true;
  try {
    assignInnerHTMLUnsafe(el, html);
  } finally {
    assigning = false;
  }
}

function assignInnerHTMLUnsafe(el: Element, html: string): void {
  const unsafe = el as Element & {
    setHTMLUnsafe?: (s: string) => void;
  };

  // Chrome 124+: not subject to Trusted Types. Prefer this so we never
  // spam the console with failed createPolicy() attempts.
  if (typeof unsafe.setHTMLUnsafe === "function") {
    try {
      unsafe.setHTMLUnsafe(html);
      return;
    } catch {
      /* fall through */
    }
  }

  const value = toAssignValue(html);

  if (nativeInnerHTMLSet) {
    try {
      nativeInnerHTMLSet.call(el, value as string);
      return;
    } catch {
      /* Trusted Types rejected the string */
    }
    try {
      nativeInnerHTMLSet.call(el, html);
      return;
    } catch {
      /* still blocked */
    }
  }

  try {
    parseInto(el, html);
  } catch (err) {
    console.warn("[VideoSearch AI] HTML inject blocked:", err);
  }
}

/**
 * Install once. Safe to call from every UI module.
 */
export function installTrustedHtmlShim(): void {
  if (installed) return;
  if (typeof Element === "undefined") return;

  const proto = Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "innerHTML");
  if (!desc?.get || !desc?.set) return;
  installed = true;

  nativeInnerHTMLGet = desc.get;
  nativeInnerHTMLSet = desc.set;
  nativeInsertAdjacentHTML =
    typeof proto.insertAdjacentHTML === "function"
      ? proto.insertAdjacentHTML
      : null;

  try {
    Object.defineProperty(proto, "innerHTML", {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return nativeInnerHTMLGet!.call(this);
      },
      set(html: unknown) {
        assignInnerHTML(this as Element, html);
      },
    });
  } catch (err) {
    console.warn("[VideoSearch AI] Could not patch innerHTML:", err);
  }

  if (nativeInsertAdjacentHTML) {
    proto.insertAdjacentHTML = function (
      position: InsertPosition,
      html: string
    ) {
      try {
        const trusted = toAssignValue(html);
        return nativeInsertAdjacentHTML!.call(
          this,
          position,
          trusted as string
        );
      } catch {
        const tmp = document.createElement("template");
        assignInnerHTML(tmp, html);
        const pos = String(position).toLowerCase();
        if (pos === "beforebegin")
          this.parentNode?.insertBefore(tmp.content, this);
        else if (pos === "afterbegin")
          this.insertBefore(tmp.content, this.firstChild);
        else if (pos === "beforeend") this.appendChild(tmp.content);
        else if (pos === "afterend")
          this.parentNode?.insertBefore(tmp.content, this.nextSibling);
      }
    };
  }
}

installTrustedHtmlShim();
