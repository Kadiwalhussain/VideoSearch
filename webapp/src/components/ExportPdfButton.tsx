import { useCallback, useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";
import type { VaultRow } from "../types";
import type { PdfOptions } from "../lib/exportPdf";

type Props = {
  /** Rows to render. Build these to match whatever the page is showing. */
  rows: VaultRow[];
  title: string;
  subtitle?: string;
  fileBase?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  options?: Omit<PdfOptions, "onProgress">;
};

export function ExportPdfButton({
  rows,
  title,
  subtitle,
  fileBase,
  label = "Export PDF",
  className = "btn-notes",
  disabled,
  options,
}: Props) {
  const { session } = useSession();
  const { toast } = useDialog();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    if (!rows.length) {
      toast("Nothing to export yet", "info");
      return;
    }
    running.current = true;
    setBusy(true);
    setPct(0);
    try {
      const { exportRowsToPdf } = await import("../lib/exportPdf");
      const out = await exportRowsToPdf(
        rows,
        { title, subtitle, fileBase },
        { token: session?.token, apiBase: session?.url },
        {
          ...options,
          onProgress: (done, total) =>
            setPct(total ? Math.round((done / total) * 100) : 0),
        }
      );
      toast(
        `${out.filename} · ${out.pages} page${out.pages === 1 ? "" : "s"}`,
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF export failed", "error");
    } finally {
      running.current = false;
      setBusy(false);
      setPct(0);
    }
  }, [rows, title, subtitle, fileBase, options, session, toast]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => void run()}
      disabled={busy || disabled}
      title={`${label} — marks, screenshots and notes`}
      aria-busy={busy}
    >
      {busy ? (
        <Loader2 size={14} className="spin" />
      ) : (
        <FileDown size={14} />
      )}
      <span>{busy ? (pct ? `${pct}%` : "Building…") : label}</span>
    </button>
  );
}
