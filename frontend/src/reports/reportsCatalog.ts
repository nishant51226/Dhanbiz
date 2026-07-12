export type ReportDefinition = {
  id: string;
  /** Path segment under `/reports`. */
  path: string;
  label: string;
  description: string;
  /** When true, only superadmin (`isAdmin`) sees this report in nav and can open the route. */
  adminOnly?: boolean;
};

/** Add new staff reports here; ReportsLayout renders nav from this list. */
export const STAFF_REPORTS: ReportDefinition[] = [
  {
    id: "job-cost",
    path: "job-cost",
    label: "Job Cost",
    description: "AI token usage and estimated cost by job, file, page, and customer.",
  },
  {
    id: "customer-documents",
    path: "customer-documents",
    label: "Extraction Reports",
    description:
      "Excel extraction export for a customer's documents in a date range (invoice register, per document, per folder, or per date).",
  },
  {
    id: "file-activity",
    path: "file-activity",
    label: "File activity",
    description:
      "Audit log for Files library uploads: view, download, delete, assignees, and extraction job lifecycle.",
  },
];

export function reportBasePath(report: ReportDefinition): string {
  return `/reports/${report.path}`;
}
