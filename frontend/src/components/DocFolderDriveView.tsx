import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import CalendarTodayOutlined from "@mui/icons-material/CalendarTodayOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import NavigateNext from "@mui/icons-material/NavigateNext";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import {
  formatLibraryCalendarDateKeyLabel,
  formatLibraryDocumentUploadDisplayDate,
  libraryDocumentUploadCalendarDateKey,
} from "../utils/libraryDocumentDate";

export type DocFolderDriveRow = {
  id: string;
  fileName: string;
  customer: string;
  customerId?: string;
  folderId?: string;
  folderName: string;
  library: string;
  documentDate?: string | null;
  uploadedAt?: string;
  createdAt?: string;
};

type DriveLayout = "list" | "grid";

type ListEntry =
  | { kind: "folder"; id: string; name: string; subtitle: string; count: number; icon: "folder" | "date" }
  | { kind: "file"; id: string; name: string; subtitle: string; dateLabel: string; row: DocFolderDriveRow };

/** Folder → Date → Files */
type FolderNav =
  | { step: "folders" }
  | { step: "dates"; folderKey: string }
  | { step: "files"; folderKey: string; dateKey: string };

const ROOT_NAV: FolderNav = { step: "folders" };

function folderGroupKey(row: DocFolderDriveRow): string {
  if (row.folderId) return row.folderId;
  return `legacy:${row.customer}::${row.library}::${row.folderName}`;
}

type Props = {
  rows: DocFolderDriveRow[];
  singleCustomerScope: boolean;
  customerFilterId: string;
  showCustomerInFolderLabel: boolean;
  onOpenDocument: (documentId: string) => void;
  canDelete?: boolean;
  deletingDocumentIds?: ReadonlySet<string> | null;
  onDeleteDocuments?: (documentIds: string[]) => void;
};

export function DocFolderDriveView({
  rows,
  singleCustomerScope,
  customerFilterId,
  showCustomerInFolderLabel,
  onOpenDocument,
  canDelete = false,
  deletingDocumentIds = null,
  onDeleteDocuments,
}: Props) {
  const [layout, setLayout] = useState<DriveLayout>("list");
  const [nav, setNav] = useState<FolderNav>(ROOT_NAV);

  useEffect(() => {
    setNav(ROOT_NAV);
  }, [singleCustomerScope, customerFilterId, rows]);

  const scopedRows = useMemo(() => {
    if (singleCustomerScope) return rows;
    if (!customerFilterId) return rows;
    return rows.filter((r) => r.customerId === customerFilterId);
  }, [rows, singleCustomerScope, customerFilterId]);

  const folderLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of scopedRows) {
      const fk = folderGroupKey(row);
      if (map.has(fk)) continue;
      const base = row.folderName || "—";
      map.set(fk, showCustomerInFolderLabel ? `${base} — ${row.customer}` : base);
    }
    return map;
  }, [scopedRows, showCustomerInFolderLabel]);

  const folderDateTree = useMemo(() => {
    const tree = new Map<string, Map<string, DocFolderDriveRow[]>>();
    for (const row of scopedRows) {
      const fk = folderGroupKey(row);
      const dk = libraryDocumentUploadCalendarDateKey(row.uploadedAt, row.createdAt);
      if (!tree.has(fk)) tree.set(fk, new Map());
      const byDate = tree.get(fk)!;
      if (!byDate.has(dk)) byDate.set(dk, []);
      byDate.get(dk)!.push(row);
    }
    return tree;
  }, [scopedRows]);

  const sortedDateKeys = (keys: string[]) => {
    const dated = keys.filter((k) => k !== "Undated").sort((a, b) => b.localeCompare(a));
    if (keys.includes("Undated")) dated.push("Undated");
    return dated;
  };

  const entries = useMemo((): ListEntry[] => {
    if (nav.step === "folders") {
      return [...folderDateTree.keys()]
        .sort((a, b) => (folderLabels.get(a) ?? a).localeCompare(folderLabels.get(b) ?? b))
        .map((folderKey) => {
          const count = [...(folderDateTree.get(folderKey)?.values() ?? [])].reduce((n, docs) => n + docs.length, 0);
          const dateCount = folderDateTree.get(folderKey)?.size ?? 0;
          return {
            kind: "folder",
            id: `folder:${folderKey}`,
            name: folderLabels.get(folderKey) ?? folderKey,
            subtitle: `${dateCount} date${dateCount === 1 ? "" : "s"} · ${count} file${count === 1 ? "" : "s"}`,
            count,
            icon: "folder",
          };
        });
    }
    if (nav.step === "dates") {
      const byDate = folderDateTree.get(nav.folderKey);
      if (!byDate) return [];
      return sortedDateKeys([...byDate.keys()]).map((dateKey) => {
        const docs = byDate.get(dateKey) ?? [];
        return {
          kind: "folder",
          id: `date:${dateKey}`,
          name: formatLibraryCalendarDateKeyLabel(dateKey),
          subtitle: `${docs.length} file${docs.length === 1 ? "" : "s"}`,
          count: docs.length,
          icon: "date",
        };
      });
    }
    const docs = folderDateTree.get(nav.folderKey)?.get(nav.dateKey) ?? [];
    return [...docs]
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
      .map((row) => ({
        kind: "file" as const,
        id: row.id,
        name: row.fileName,
        subtitle: singleCustomerScope ? row.library : `${row.library} · ${row.customer}`,
        dateLabel: formatLibraryDocumentUploadDisplayDate(row.uploadedAt, row.createdAt),
        row,
      }));
  }, [nav, folderDateTree, folderLabels, singleCustomerScope]);

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; nav: FolderNav }[] = [{ label: "All locations", nav: ROOT_NAV }];
    if (nav.step === "dates" || nav.step === "files") {
      crumbs.push({
        label: folderLabels.get(nav.folderKey) ?? nav.folderKey,
        nav: { step: "dates", folderKey: nav.folderKey },
      });
    }
    if (nav.step === "files") {
      crumbs.push({ label: formatLibraryCalendarDateKeyLabel(nav.dateKey), nav });
    }
    return crumbs;
  }, [nav, folderLabels]);

  const onEntryClick = (entry: ListEntry) => {
    if (entry.kind === "file") {
      onOpenDocument(entry.id);
      return;
    }
    if (nav.step === "folders" && entry.id.startsWith("folder:")) {
      setNav({ step: "dates", folderKey: entry.id.slice(7) });
      return;
    }
    if (nav.step === "dates" && entry.id.startsWith("date:")) {
      setNav({
        step: "files",
        folderKey: nav.folderKey,
        dateKey: entry.id.slice(5),
      });
    }
  };

  const entryIcon = (entry: ListEntry) => {
    if (entry.kind === "file") return <InsertDriveFileOutlined sx={{ color: "info.main", fontSize: 22 }} />;
    if (entry.icon === "date") return <CalendarTodayOutlined sx={{ color: "warning.main", fontSize: 22 }} />;
    return <FolderOutlined sx={{ color: "warning.dark", fontSize: 22 }} />;
  };

  const emptyMessage =
    nav.step === "folders"
      ? "No folders on this page."
      : nav.step === "dates"
        ? "No dates for this folder."
        : "No documents for this folder and date.";

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "background.paper" }}>
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          justifyContent: "space-between",
        }}
      >
        <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ flex: 1, minWidth: 0 }}>
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            if (isLast) {
              return (
                <Typography key={crumb.label} variant="body2" color="text.primary" sx={{ fontWeight: 600 }} noWrap>
                  {crumb.label}
                </Typography>
              );
            }
            return (
              <Link
                key={`${crumb.label}-${i}`}
                component="button"
                type="button"
                variant="body2"
                underline="hover"
                color="text.secondary"
                onClick={() => setNav(crumb.nav)}
                sx={{ cursor: "pointer", border: "none", bgcolor: "transparent", font: "inherit", p: 0 }}
              >
                {crumb.label}
              </Link>
            );
          })}
        </Breadcrumbs>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout}
          onChange={(_, v: DriveLayout | null) => {
            if (v) setLayout(v);
          }}
          aria-label="Folder layout"
        >
          <ToggleButton value="list" aria-label="List view">
            <Tooltip title="List">
              <ViewListOutlined fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="grid" aria-label="Grid view">
            <Tooltip title="Grid">
              <GridViewOutlined fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 6, textAlign: "center" }}>
          {emptyMessage}
        </Typography>
      ) : layout === "list" ? (
        <TableContainer>
          <Table size="small" aria-label="Documents folder contents">
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Name
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    display: { xs: "none", sm: "table-cell" },
                  }}
                >
                  Details
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    width: 120,
                  }}
                >
                  Date
                </TableCell>
                {canDelete ? (
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      width: 72,
                    }}
                  />
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  hover
                  onClick={() => onEntryClick(entry)}
                  sx={{
                    cursor: "pointer",
                    "&:last-child td": { borderBottom: 0 },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                      {entryIcon(entry)}
                      <Typography variant="body2" noWrap title={entry.name} sx={{ fontWeight: 500 }}>
                        {entry.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {entry.subtitle}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {entry.kind === "file" ? entry.dateLabel : ""}
                    </Typography>
                  </TableCell>
                  {canDelete ? (
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {entry.kind === "file" && onDeleteDocuments ? (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete document"
                          disabled={deletingDocumentIds?.has(entry.id) ?? false}
                          onClick={() => onDeleteDocuments([entry.id])}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
            gap: 1.5,
            p: 2,
          }}
        >
          {entries.map((entry) => (
            <Paper
              key={entry.id}
              variant="outlined"
              onClick={() => onEntryClick(entry)}
              sx={{
                position: "relative",
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                cursor: "pointer",
                textAlign: "center",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                "&:hover": {
                  borderColor: "primary.main",
                  boxShadow: 1,
                },
              }}
            >
              {canDelete && entry.kind === "file" && onDeleteDocuments ? (
                <IconButton
                  size="small"
                  color="error"
                  aria-label="Delete document"
                  disabled={deletingDocumentIds?.has(entry.id) ?? false}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDocuments([entry.id]);
                  }}
                  sx={{ position: "absolute", right: 4, top: 4 }}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              ) : null}
              <Box sx={{ fontSize: 40, lineHeight: 1, color: entry.kind === "file" ? "info.main" : "warning.dark" }}>
                {entry.kind === "file" ? (
                  <InsertDriveFileOutlined sx={{ fontSize: 40 }} />
                ) : entry.icon === "date" ? (
                  <CalendarTodayOutlined sx={{ fontSize: 40 }} />
                ) : (
                  <FolderOutlined sx={{ fontSize: 40 }} />
                )}
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, width: "100%" }} noWrap title={entry.name}>
                {entry.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ width: "100%" }}>
                {entry.kind === "file" ? entry.dateLabel : entry.subtitle}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Paper>
  );
}
