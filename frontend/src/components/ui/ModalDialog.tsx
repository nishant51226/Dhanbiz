import type { ReactNode } from "react";
import { ModalBackdrop } from "./ModalBackdrop";

export type ModalDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly disabled?: boolean;
  readonly titleId: string;
  readonly className?: string;
  readonly children: ReactNode;
};

/** Centered modal using native `<dialog>` for accessibility. */
export function ModalDialog({
  open,
  onClose,
  disabled,
  titleId,
  className = "max-w-lg",
  children,
}: Readonly<ModalDialogProps>) {
  if (!open) return null;

  return (
    <>
      <ModalBackdrop disabled={disabled} onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 pointer-events-none">
        <dialog
          open
          aria-labelledby={titleId}
          className={`pointer-events-auto relative m-0 w-full transform overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 shadow-xl ${className}`}
        >
          {children}
        </dialog>
      </div>
    </>
  );
}
