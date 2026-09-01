import { X } from "lucide-react";

import { Toasts } from "../hooks/useToasts";
import { Button, IconButton } from "./primitives";

export default function ToastStack({ toasts, dismiss }: Pick<Toasts, "toasts" | "dismiss">) {
  if (toasts.length == 0) {
    return null;
  }

  return (
    <div className="sd-toasts" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="sd-toast" data-tone={toast.tone}>
          <p>{toast.message}</p>

          {toast.action != null &&
            <Button variant="link" onClick={() => { toast.action!.run(); dismiss(toast.id); }}>
              {toast.action.label}
            </Button>}

          <IconButton label="Dismiss" onClick={() => dismiss(toast.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
