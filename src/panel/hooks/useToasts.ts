import { useCallback, useRef, useState } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: ToastAction;
}

/** How long a toast stays up, in milliseconds. */
const TOAST_LIFETIME = 6000;

export interface Toasts {
  toasts: Toast[];
  show: (message: string, options?: { tone?: Toast["tone"]; action?: ToastAction }) => void;
  dismiss: (id: number) => void;
}

/** The panel's transient notifications: what was saved, and what went wrong. */
export function useToasts(): Toasts {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(x => x.id != id));
  }, []);

  const show = useCallback<Toasts["show"]>((message, options) => {
    const id = nextId.current++;

    setToasts(current => [...current, { id, message, tone: options?.tone ?? "info", action: options?.action }]);
    setTimeout(() => dismiss(id), TOAST_LIFETIME);
  }, [dismiss]);

  return { toasts, show, dismiss };
}
