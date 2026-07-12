import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "error" | "primary" | "inherit" | "secondary" | "success" | "info" | "warning";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "error",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) return;
        onCancel();
      }}
      fullWidth
      maxWidth="xs"
      disableScrollLock
      aria-labelledby="confirm-dialog-title"
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} variant="contained" color={confirmColor} disabled={busy} autoFocus>
          {busy ? `${confirmLabel}…` : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
