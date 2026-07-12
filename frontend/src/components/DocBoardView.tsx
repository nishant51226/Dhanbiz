import type { ReactNode } from "react";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { Box, Card, IconButton, Paper, Typography } from "@mui/material";

export const BOARD_LIBRARY_ORDER = ["Invoices", "Statements", "Files"] as const;

export type DocBoardRow = {
  id: string;
  fileName: string;
  customer: string;
  folderName: string;
  library: string;
};

type DocBoardViewProps = {
  rows: DocBoardRow[];
  onOpenDocument: (documentId: string) => void;
  canDelete?: boolean;
  deletingDocumentIds?: ReadonlySet<string> | null;
  onDeleteDocuments?: (documentIds: string[]) => void;
  scrollEndSlot?: ReactNode;
};

export function DocBoardView({
  rows,
  onOpenDocument,
  canDelete = false,
  deletingDocumentIds = null,
  onDeleteDocuments,
  scrollEndSlot,
}: DocBoardViewProps) {
  return (
    <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
      {BOARD_LIBRARY_ORDER.map((lib) => {
        const col = rows.filter((r) => r.library === lib);
        return (
          <Paper
            key={lib}
            variant="outlined"
            sx={{ minWidth: 260, maxWidth: 320, flex: "0 0 auto", bgcolor: "background.paper" }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {lib}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {col.length}
              </Typography>
            </Box>
            <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 1, maxHeight: 560, overflowY: "auto" }}>
              {col.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                  No documents
                </Typography>
              ) : (
                col.map((r) => (
                  <Card
                    key={r.id}
                    variant="outlined"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenDocument(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenDocument(r.id);
                      }
                    }}
                    sx={{
                      position: "relative",
                      p: 1.25,
                      textAlign: "left",
                      color: "inherit",
                      display: "block",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    {canDelete && onDeleteDocuments ? (
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="Delete document"
                        disabled={deletingDocumentIds?.has(r.id) ?? false}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDocuments([r.id]);
                        }}
                        sx={{ position: "absolute", right: 4, top: 4 }}
                      >
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    ) : null}
                    <Typography
                      variant="body2"
                      noWrap
                      title={r.fileName}
                      sx={{ fontWeight: 600, pr: canDelete ? 3 : 0 }}
                    >
                      {r.fileName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {r.customer} · {r.folderName}
                    </Typography>
                  </Card>
                ))
              )}
              {scrollEndSlot}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
