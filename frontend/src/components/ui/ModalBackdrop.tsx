type ModalBackdropProps = {
  readonly onClose: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
};

/** Full-screen dismiss control for modal overlays (keyboard + screen-reader friendly). */
export function ModalBackdrop({ onClose, disabled, className = "" }: ModalBackdropProps) {
  return (
    <button
      type="button"
      aria-label="Close dialog"
      disabled={disabled}
      className={`fixed inset-0 z-40 cursor-default border-0 bg-black/50 p-0 transition-opacity disabled:cursor-not-allowed ${className}`}
      onClick={onClose}
    />
  );
}
