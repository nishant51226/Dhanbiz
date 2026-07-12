import { ModalDialog, type ModalDialogProps } from "./ModalDialog";

type ExportModalDialogProps = Omit<ModalDialogProps, "className"> & {
  readonly className?: string;
};

/** Export/settings modal — alias of {@link ModalDialog} with a wider default width. */
export function ExportModalDialog({
  className = "max-w-5xl",
  ...props
}: Readonly<ExportModalDialogProps>) {
  return <ModalDialog className={className} {...props} />;
}
