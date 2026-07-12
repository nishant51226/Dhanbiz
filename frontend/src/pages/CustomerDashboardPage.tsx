import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fetchCustomer,
  fetchCustomerInvoices,
  fetchCustomerStatements,
  fetchLatestCustomerFormSubmission,
  fetchPortalLibraryTree,
  fetchBundleSubscriptionPlans,
} from "../api/client";
import DocumentsPage from "./DocumentsPage";
import { PortalSupplierUploadModal } from "../components/PortalSupplierUploadModal";
import { RecentUploadedDocumentsCard } from "../components/RecentUploadedDocumentsCard";
import { useAuth } from "../auth/AuthContext";
import {
  PORTAL_PERM_CUSTOMER_READ,
  PORTAL_PERM_INVOICE_LIST,
  PORTAL_PERM_LIB_FILES,
  PORTAL_PERM_LIB_INVOICES,
  PORTAL_PERM_LIB_STATEMENTS,
  PORTAL_PERM_STATEMENT_LIST,
} from "../auth/portalNav";
import { portalProfileFromCustomer } from "../utils/portalCustomerProfile";
import { mergedOnboardingDataForCustomer } from "../utils/customerOnboardingDisplayRoot";
import type { Customer, PortalLibrarySection } from "../types/api";

const PORTAL_UPLOAD_EVENT = "portal-open-upload";

type PortalSection = "overview" | "invoices" | "statements" | "files";

function sectionFromPath(pathname: string): PortalSection {
  if (pathname.startsWith("/portal/invoices")) return "invoices";
  if (pathname.startsWith("/portal/statements")) return "statements";
  if (pathname.startsWith("/portal/files")) return "files";
  return "overview";
}

export default function CustomerDashboardPage() {
  const { apiBase, authHeaders, customerId: cidJwt, hasAnyPermission, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [invoiceDocCount, setInvoiceDocCount] = useState(0);
  const [statementDocCount, setStatementDocCount] = useState(0);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [uploadRefresh, setUploadRefresh] = useState(0);
  const [runFolderExtraction] = useState(true);
  const customerId = cidJwt ?? "";
  const loadGenRef = useRef(0);

  useEffect(() => {
    const onOpen = () => setSupplierModalOpen(true);
    window.addEventListener(PORTAL_UPLOAD_EVENT, onOpen);
    return () => window.removeEventListener(PORTAL_UPLOAD_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const btn = document.getElementById("portal-new-upload-trigger");
    if (!btn) return;
    const onClick = () => window.dispatchEvent(new CustomEvent(PORTAL_UPLOAD_EVENT));
    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
  }, []);

  const applyPlanName = useCallback(
    async (c: Customer) => {
      const pid = typeof c.planId === "string" ? c.planId.trim() : "";
      if (pid) {
        try {
          const plans = await fetchBundleSubscriptionPlans(apiBase, authHeaders());
          const p = plans.find((x) => x.id === pid);
          setPlanName(p?.name ?? (typeof c.plan?.name === "string" ? c.plan.name : null));
        } catch {
          setPlanName(typeof c.plan?.name === "string" ? c.plan.name : null);
        }
      } else {
        setPlanName(null);
      }
    },
    [apiBase, authHeaders],
  );

  const load = useCallback(async () => {
    if (!customerId) return;
    const gen = ++loadGenRef.current;
    const stale = () => gen !== loadGenRef.current;
    setErr("");
    setLoading(true);

    const canCustomer = hasPermission(PORTAL_PERM_CUSTOMER_READ[0]);
    const canInvList = hasAnyPermission(PORTAL_PERM_INVOICE_LIST);
    const canStmtList = hasAnyPermission(PORTAL_PERM_STATEMENT_LIST);
    const canFilesLib = hasAnyPermission(PORTAL_PERM_LIB_FILES);
    const canInvLib = hasAnyPermission(PORTAL_PERM_LIB_INVOICES);
    const canStmtLib = hasAnyPermission(PORTAL_PERM_LIB_STATEMENTS);

    try {
      if (section === "overview") {
        const [cRaw, filesLib, inv, stmt] = await Promise.all([
          canCustomer ? fetchCustomer(apiBase, authHeaders(), customerId) : Promise.resolve(null),
          canFilesLib ? fetchPortalLibraryTree(apiBase, authHeaders(), customerId, "files") : Promise.resolve(null),
          canInvList ? fetchCustomerInvoices(apiBase, authHeaders(), customerId) : Promise.resolve([]),
          canStmtList ? fetchCustomerStatements(apiBase, authHeaders(), customerId) : Promise.resolve([]),
        ]);
        let c = cRaw;
        if (c) {
          const latestSubmission = await fetchLatestCustomerFormSubmission(apiBase, authHeaders(), customerId).catch(
            () => null,
          );
          if (stale()) return;
          const mergedOnboarding = mergedOnboardingDataForCustomer(c, latestSubmission);
          if (mergedOnboarding !== null) {
            c = { ...c, onboardingData: mergedOnboarding };
          }
        }
        if (stale()) return;
        setCustomer(c);
        setInvoiceDocCount(inv.length);
        setStatementDocCount(stmt.length);
        setUploadedFileCount(filesLib?.documents?.length ?? 0);
        if (c) await applyPlanName(c);
        else {
          setPlanName(null);
        }
      } else {
        const libSection: PortalLibrarySection =
          section === "invoices" ? "invoices" : section === "statements" ? "statements" : "files";
        const canLib =
          libSection === "invoices" ? canInvLib : libSection === "statements" ? canStmtLib : canFilesLib;
        const c = canCustomer
          ? await fetchCustomer(apiBase, authHeaders(), customerId)
          : null;
        if (stale()) return;
        setCustomer(c);
        if (c) await applyPlanName(c);
        else {
          setPlanName(null);
        }
        if (!canLib) {
          setErr("You do not have access to this library.");
        }
      }
    } catch (e) {
      if (!stale()) setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [
    apiBase,
    authHeaders,
    applyPlanName,
    customerId,
    section,
    hasAnyPermission,
    hasPermission,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const profile = useMemo(() => portalProfileFromCustomer(customer), [customer]);
  const canViewRecentUploads = hasAnyPermission([
    ...PORTAL_PERM_LIB_FILES,
    ...PORTAL_PERM_LIB_INVOICES,
    ...PORTAL_PERM_LIB_STATEMENTS,
  ]);

  if (!customerId) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-muted">
        Your session is missing customer scope. Please sign in again.
      </div>
    );
  }

  const librarySection =
    section === "invoices" || section === "statements" || section === "files" ? section : null;

  if (loading && section === "overview") {
    return <p className="text-sm text-muted">Loading your workspace...</p>;
  }

  return (
    <div
      className={
        section === "overview"
          ? "flex w-full min-w-0 flex-1 flex-col gap-4"
          : "flex min-h-[calc(100vh-7.5rem)] min-h-0 w-full min-w-0 flex-1 flex-col gap-4"
      }
    >
      {section === "overview" && err ? <p className="shrink-0 text-sm text-red-400">{err}</p> : null}

      {section === "overview" ? (
        <div className="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-6">
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <section className="flex flex-col rounded-2xl border border-border bg-surface-raised p-6 shadow-sm md:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Client basic information</p>
              <div className="mt-4 flex flex-col">
                <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">{customer?.name ?? "Customer"}</h1>
                <ul className="mt-5 min-w-0 space-y-2.5 text-sm text-muted md:text-base">
                  {profile.email ? (
                    <li className="flex items-center gap-3">
                      <span className="text-brand" aria-hidden>
                        {"\u2709"}
                      </span>
                      <span className="text-ink-soft">{profile.email}</span>
                    </li>
                  ) : null}
                  {profile.registrationNumber ? (
                    <li className="flex items-center gap-3">
                      <span className="text-brand">#</span>
                      <span className="text-ink-soft">Registration no. {profile.registrationNumber}</span>
                    </li>
                  ) : null}
                  {profile.addressLine ? (
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-brand" aria-hidden>
                        {"\u2316"}
                      </span>
                      <span className="text-ink-soft">{profile.addressLine}</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </section>
            <section className="flex flex-col rounded-2xl border border-border bg-surface-raised p-6 shadow-sm md:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Subscription status</p>
              <div className="mt-4 flex flex-col justify-center space-y-6 rounded-xl border border-border bg-surface-muted/40 p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Status</p>
                  <p className="mt-1.5 text-lg font-semibold text-emerald-400">Active</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Subscription</p>
                  <p className="mt-1.5 text-lg font-semibold text-ink">
                    <span>{(planName ?? "Standard").trim() || "Standard"}</span>{" "}
                    <span className="text-emerald-400">active</span>
                  </p>
                </div>
                {profile.managedBy ? (
                  <p className="text-xs text-muted">
                    Managed by: <span className="text-ink-soft">{profile.managedBy}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted">Use the top navigation to open Invoices, Statements, or Files.</p>
                )}
              </div>
            </section>
          </div>
          <div className="grid shrink-0 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total invoice documents</p>
              <p className="mt-2 text-3xl font-bold text-ink">{invoiceDocCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total statement documents</p>
              <p className="mt-2 text-3xl font-bold text-ink">{statementDocCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total files</p>
              <p className="mt-2 text-3xl font-bold text-ink">{uploadedFileCount}</p>
            </div>
          </div>
          {canViewRecentUploads ? (
            <RecentUploadedDocumentsCard
              apiBase={apiBase}
              authHeaders={authHeaders}
              customerId={customerId}
              refreshToken={uploadRefresh}
              onOpenDocument={(documentId) => navigate(`/files/documents/${documentId}`)}
              viewAllHref="/portal/files"
            />
          ) : null}
        </div>
      ) : librarySection ? (
        <DocumentsPage
          key={`portal-lib-${customerId}-${librarySection}`}
          portalEmbed={{
            customerId,
            customerDisplayName: customer?.name?.trim() || "Customer",
            librarySection,
            tree: null,
            loading,
            err,
            onAddFiles: () => setSupplierModalOpen(true),
            onOpenDocument: (documentId) => {
              navigate(`/files/documents/${documentId}`);
            },
          }}
        />
      ) : null}

      <PortalSupplierUploadModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        apiBase={apiBase}
        headers={authHeaders()}
        customerId={customerId}
        runExtraction={runFolderExtraction}
        onUploaded={() => {
          void load();
          setUploadRefresh((n) => n + 1);
        }}
      />
    </div>
  );
}
