import React, { useCallback, useEffect, useRef } from "react";
import { Toaster, toast as sonnerToast, type ExternalToast } from "sonner";
import { CheckCircle2, AlertCircle, Info, LoaderCircle, X } from "lucide-react";

export type FeedbackKind = "success" | "error" | "info" | "warning";
export function useWorkbenchFeedback(scope: string) {
  const owned = useRef(new Set<string | number>());
  useEffect(
    () => () => {
      for (const id of owned.current) sonnerToast.dismiss(id);
      owned.current.clear();
    },
    [scope],
  );
  return useCallback(
    (message: string, kind: FeedbackKind = "success", options: ExternalToast = {}) => {
      const method = ["success", "error", "warning", "info"].includes(kind) ? kind : "info";
      const id = sonnerToast[method](message, {
        duration: kind === "error" ? 7000 : 3500,
        ...options,
        toasterId: scope,
        onDismiss: (item) => {
          owned.current.delete(item.id);
          options.onDismiss?.(item);
        },
        onAutoClose: (item) => {
          owned.current.delete(item.id);
          options.onAutoClose?.(item);
        },
      });
      owned.current.add(id);
      return id;
    },
    [scope],
  );
}

export function WorkbenchToaster({ scope, mode = "light" }: { scope: string; mode?: "light" | "dark" }) {
  return (
    <Toaster
      id={scope}
      theme={mode}
      position="bottom-right"
      duration={3500}
      visibleToasts={3}
      gap={8}
      offset={{ right: 20, bottom: 44 }}
      mobileOffset={{ right: 12, bottom: 40, left: 12 }}
      closeButton
      expand={false}
      containerAriaLabel="操作反馈"
      hotkey={["F8"]}
      icons={{
        success: <CheckCircle2 size={17} />,
        error: <AlertCircle size={17} />,
        warning: <AlertCircle size={17} />,
        info: <Info size={17} />,
        loading: <LoaderCircle size={17} className="hu-spin-alt" />,
        close: <X size={13} />,
      }}
      toastOptions={{
        closeButtonAriaLabel: "关闭消息",
        classNames: {
          toast: "huhu-toast toast",
          title: "huhu-toast-title",
          description: "huhu-toast-description",
          success: "success",
          error: "error",
          warning: "warning",
          info: "info",
        },
      }}
    />
  );
}
