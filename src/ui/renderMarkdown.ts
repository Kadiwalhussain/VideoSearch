/**
 * Safe markdown for Ask / Chat answers (no extra deps).
 * Escapes HTML first, then a small subset: headings, lists, bold, italic, code.
 * Timestamp tokens become jump buttons after the HTML is in the DOM.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(raw: string): string {
  let s = raw;
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^\*])\*(?!\*)([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a class="vsa-md-a" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

export function markdownToHtml(markdown: string): string {
  const escaped = escapeHtml((markdown || "").replace(/\r\n/g, "\n").trim());
  const fences: string[] = [];
  let text = escaped.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code: string) => {
    const i = fences.length;
    fences.push(
      `<pre class="vsa-md-pre"><code>${String(code).trim()}</code></pre>`
    );
    return `\n%%FENCE${i}%%\n`;
  });
  const codes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const i = codes.length;
    codes.push(`<code class="vsa-md-code">${code}</code>`);
    return `%%CODE${i}%%`;
  });

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = line.trim().match(/^%%FENCE(\d+)%%$/);
    if (fence) {
      out.push(fences[Number(fence[1])] || "");
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const n = heading[1].length;
      out.push(`<h${n} class="vsa-md-h vsa-md-h${n}">${inlineMd(heading[2])}</h${n}>`);
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          `<li>${inlineMd(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`
        );
        i += 1;
      }
      out.push(`<ul class="vsa-md-ul">${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          `<li>${inlineMd(lines[i].replace(/^\s*\d+[.)]\s+/, ""))}</li>`
        );
        i += 1;
      }
      out.push(`<ol class="vsa-md-ol">${items.join("")}</ol>`);
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^%%FENCE\d+%%$/.test(lines[i].trim())
    ) {
      para.push(inlineMd(lines[i]));
      i += 1;
    }
    if (para.length) {
      out.push(`<p class="vsa-md-p">${para.join("<br>")}</p>`);
    }
  }

  let html = out.join("");
  html = html.replace(/%%CODE(\d+)%%/g, (_, n) => codes[Number(n)] || "");
  html = html.replace(/%%FENCE(\d+)%%/g, (_, n) => fences[Number(n)] || "");
  return html || `<p class="vsa-md-p">${inlineMd(escaped)}</p>`;
}

function parseTimestampToken(token: string): number | null {
  const m = token.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  if (m[3] != null) {
    return (
      parseInt(m[1], 10) * 3600 +
      parseInt(m[2], 10) * 60 +
      parseInt(m[3], 10)
    );
  }
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function linkTimestamps(
  root: HTMLElement,
  onSeek: (seconds: number) => void
): void {
  const re =
    /(\bat\s+)?(\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(\]|\))?/gi;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = (node as Text).parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest("pre, code, button, a")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const textNode of nodes) {
    const text = textNode.nodeValue || "";
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const timeStr = match[3];
      const seconds = parseTimestampToken(timeStr);
      if (seconds == null) continue;
      if (match.index > last) {
        frag.appendChild(
          document.createTextNode(text.slice(last, match.index))
        );
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vsa-time-link";
      btn.textContent = timeStr;
      btn.title = `Jump to ${timeStr}`;
      const t = seconds;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSeek(t);
      });
      frag.appendChild(btn);
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    if (frag.childNodes.length) {
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }
}

/** Paint markdown + clickable (m:ss) jump pills into a container. */
export function renderMarkdownWithTimes(
  container: HTMLElement,
  markdown: string,
  onSeek: (seconds: number) => void
): void {
  container.classList.add("vsa-md");
  container.innerHTML = markdownToHtml(markdown);
  linkTimestamps(container, onSeek);
}
