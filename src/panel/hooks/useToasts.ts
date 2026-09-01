import { useCallback, useRef, useState } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";

  /** What can be done about it, e.g. opening the file it just wrote. */
  actions?: ToastAction[];
}

/** How long a toast stays up, in milliseconds. */
const TOAST_LIFETIME = 6000;

export interface Toasts {
  toasts: Toast[];

  /** Shows a toast and answers with its id, for anything that outlives it. */
  show: (message: string, options?: {
    tone?: Toast["tone"];
    actions?: ToastAction[];

    /** Stays until released, for something still going on. */
    sticky?: boolean;
  }) => number;

  /** Rewrites a toast already up, e.g. as a batch counts through. */
  update: (id: number, message: string) => void;

  /** Lets a sticky toast time out like any other. */
  release: (id: number) => void;

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

    setToasts(current => [...current, { id, message, tone: options?.tone ?? "info", actions: options?.actions }]);

    if (options?.sticky != true) {
      setTimeout(() => dismiss(id), TOAST_LIFETIME);
    }

    return id;
  }, [dismiss]);

  const update = useCallback<Toasts["update"]>((id, message) => {
    setToasts(current => current.map(x => x.id == id ? { ...x, message } : x));
  }, []);

  const release = useCallback<Toasts["release"]>(id => {
    setTimeout(() => dismiss(id), TOAST_LIFETIME);
  }, [dismiss]);

  return { toasts, show, update, release, dismiss };
}
