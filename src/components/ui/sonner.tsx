import { CircleAlert, CircleCheck, OctagonMinus, X } from "lucide-react";
import type { SVGProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function HexagonAlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

const iconClass = "size-5 shrink-0";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      closeButton
      className="toaster group"
      style={{ "--width": "420px" } as React.CSSProperties}
      icons={{
        success: <CircleCheck className={iconClass} strokeWidth={2} />,
        error: <CircleAlert className={iconClass} strokeWidth={2} />,
        info: <HexagonAlertIcon className={iconClass} />,
        warning: <OctagonMinus className={iconClass} strokeWidth={2} />,
        close: <X className="size-4" strokeWidth={2} />,
      }}
      toastOptions={{
        classNames: {
          toast: "group toast",
          description: "courier-toast-description",
          content: "courier-toast-content",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
