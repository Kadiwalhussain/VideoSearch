import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** red destructive style */
  danger?: boolean;
};

export type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type DialogCtx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
};

const Ctx = createContext<DialogCtx | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<
    | (ConfirmOptions & {
        resolve: (v: boolean) => void;
      })
    | null
  >(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const closeConfirm = (value: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(value);
    setConfirmState(null);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  const modal =
    confirmState &&
    createPortal(
      <div
        className="ui-modal-overlay"
        role="presentation"
        onClick={() => closeConfirm(false)}
      >
        <div
          className={`ui-modal${confirmState.danger ? " is-danger" : ""}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ui-modal-title"
          aria-describedby="ui-modal-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ui-modal-icon" aria-hidden>
            <AlertTriangle size={22} strokeWidth={2} />
          </div>
          <div className="ui-modal-body">
            <h2 id="ui-modal-title" className="ui-modal-title">
              {confirmState.title}
            </h2>
            <p id="ui-modal-desc" className="ui-modal-message">
              {confirmState.message}
            </p>
          </div>
          <div className="ui-modal-actions">
            <button
              type="button"
              className="ui-modal-btn ui-modal-btn-ghost"
              onClick={() => closeConfirm(false)}
            >
              {confirmState.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              className={`ui-modal-btn ${
                confirmState.danger
                  ? "ui-modal-btn-danger"
                  : "ui-modal-btn-primary"
              }`}
              autoFocus
              onClick={() => closeConfirm(true)}
            >
              {confirmState.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  const toastHost =
    toasts.length > 0 &&
    createPortal(
      <div className="ui-toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--${t.kind}`} role="status">
            <span className="ui-toast-ico" aria-hidden>
              {t.kind === "success" ? (
                <CheckCircle2 size={16} />
              ) : t.kind === "error" ? (
                <XCircle size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <span className="ui-toast-msg">{t.message}</span>
            <button
              type="button"
              className="ui-toast-close"
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>,
      document.body
    );

  return (
    <Ctx.Provider value={value}>
      {children}
      {modal}
      {toastHost}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDialog outside DialogProvider");
  return v;
}
