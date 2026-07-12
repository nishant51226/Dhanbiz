import type { ReactNode } from "react";
import type { PermissionCatalogEntry } from "../types/api";
import {
  type CrudCol,
  type MatrixRowDef,
  matrixCellPermissionKey,
  matrixRowDescription,
  isMatrixColumnApplicable,
} from "./rolesMatrix";
const CRUD_COLS: CrudCol[] = ["create", "read", "update", "delete"];

const CRUD_LABEL: Record<CrudCol, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
};

export function catalogById(entries: PermissionCatalogEntry[]): Map<string, PermissionCatalogEntry> {
  return new Map(entries.map((e) => [e.id, e]));
}

export function permissionCatalogLabel(catalog: Map<string, PermissionCatalogEntry>, id: string): string | null {
  return catalog.get(id)?.label ?? null;
}

export function permissionTooltipContent(
  permissionId: string,
  catalog: Map<string, PermissionCatalogEntry>,
): ReactNode {
  const label = permissionCatalogLabel(catalog, permissionId);
  return (
    <div className="max-w-sm space-y-1 py-0.5 text-left text-xs leading-snug">
      <p className="font-mono font-semibold text-brand">{permissionId}</p>
      {label ? <p>{label}</p> : <p className="text-muted">No description in the catalog yet.</p>}
    </div>
  );
}

export function crudColumnTooltipContent(col: CrudCol): ReactNode {
  const summaries: Record<CrudCol, string> = {
    create: "Allow creating new records or resources where the API enforces this action.",
    read: "Allow viewing, listing, and opening resources without changing them.",
    update: "Allow editing or updating existing resources where enforced.",
    delete: "Allow removing resources where enforced (separate from update when listed).",
  };
  return (
    <div className="max-w-xs py-0.5 text-left text-xs leading-snug">
      <p className="font-semibold">{CRUD_LABEL[col]}</p>
      <p className="mt-1">{summaries[col]}</p>
      <p className="mt-1 text-muted">Each row maps this column to a specific API permission key.</p>
    </div>
  );
}

export function matrixRowTooltipContent(row: MatrixRowDef, catalog: Map<string, PermissionCatalogEntry>): ReactNode {
  const cols = CRUD_COLS.filter((c) => isMatrixColumnApplicable(row, c));
  const seen = new Set<string>();

  return (
    <div className="max-w-sm space-y-2 py-0.5 text-left text-xs leading-snug">
      <p className="font-semibold text-ink">{row.label}</p>
      {matrixRowDescription(row) ? (
        <p className="text-muted">{matrixRowDescription(row)}</p>
      ) : null}
      {row.bundleReadWithRowIds?.length ? (
        <p className="text-muted">
          {row.id === "portal_dashboard"
            ? "Turning on Read also enables Read for: Customers, Files, Settings, User management, and Subscription plans (complete portal dashboard)."
            : row.id === "dashboard"
              ? "Turning on Read also enables Read for: Customers, Jobs, Files & drive, and Subscription plans (staff dashboard data)."
              : "Turning on Read also enables Read on bundled rows listed in the matrix description."}
        </p>
      ) : null}
      {row.bundleWrite ? (
        <p className="text-muted">Create, update, and delete share one write permission on this row.</p>
      ) : null}
      {row.bundleCreateUpdate ? (
        <p className="text-muted">Create and update share one permission on this row.</p>
      ) : null}
      <ul className="space-y-1.5">
        {cols.map((col) => {
          const permId = matrixCellPermissionKey(row, col);
          if (!permId) return null;
          const label = permissionCatalogLabel(catalog, permId);
          const showKey = !seen.has(permId);
          seen.add(permId);
          return (
            <li key={col}>
              <span className="font-medium">{CRUD_LABEL[col]}</span>
              {showKey ? (
                <>
                  {" → "}
                  <span className="font-mono text-[11px] text-brand">{permId}</span>
                </>
              ) : (
                <span className="text-muted"> (same permission)</span>
              )}
              {label ? <p className="mt-0.5 text-muted">{label}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
