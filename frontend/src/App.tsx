import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { nextStaffPathAfterDeny, STAFF_SETTINGS_ACCESS } from "./auth/staffLanding";
import { AuthLayoutRouter } from "./layout/AuthLayoutRouter";
import CustomersPage from "./pages/CustomersPage";
import CustomerDrivePage from "./pages/CustomerDrivePage";
import CustomerWorkspaceLayout from "./pages/CustomerWorkspaceLayout";
import CustomersExportPage from "./pages/CustomersExportPage";
import CustomerDetailsPage from "./pages/CustomerDetailsPage";
import CustomerSubscriptionPage from "./pages/CustomerSubscriptionPage";
import CustomerUsersPage from "./pages/CustomerUsersPage";
import CustomerFormsPage from "./pages/CustomerFormsPage";
import CustomerLibraryDocumentsPage from "./pages/CustomerLibraryDocumentsPage";
import CustomerJobsPage from "./pages/CustomerJobsPage";
import CustomerSettingsPage from "./pages/CustomerSettingsPage";
import CustomerWorkspaceDashboardPage from "./pages/CustomerWorkspaceDashboardPage";
import FileDetailPage from "./pages/FileDetailPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import StatementDetailPage from "./pages/StatementDetailPage";
import JobsPage from "./pages/JobsPage";
import QueueDashboardPage from "./pages/QueueDashboardPage";
import JobDetailPage from "./pages/JobDetailPage";
import DocumentsPage from "./pages/DocumentsPage";
import LibraryDocumentPage from "./pages/LibraryDocumentPage";
import LoginPage from "./pages/LoginPage";
import NewCustomerPage from "./pages/NewCustomerPage";
import NewJobPage from "./pages/NewJobPage";
import CustomerNewJobPage from "./pages/CustomerNewJobPage";
import OnboardingHtmlPreviewPage from "./pages/OnboardingHtmlPreviewPage";
import StaffAddSubscriptionPage from "./pages/StaffAddSubscriptionPage";
import StaffEditSubscriptionPage from "./pages/StaffEditSubscriptionPage";
import SubscriptionManagementPage from "./pages/SubscriptionManagementPage";
import RolesSettingsPage from "./pages/RolesSettingsPage";
import StaffSettingsBasicPage from "./pages/StaffSettingsBasicPage";
import StaffSettingsUsersPage from "./pages/StaffSettingsUsersPage";
import StaffSettingsUserAccessPage from "./pages/StaffSettingsUserAccessPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import { StaffSettingsLayout } from "./layout/StaffSettingsLayout";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import { ReportsLayout } from "./layout/ReportsLayout";
import JobCostReportPage from "./pages/JobCostReportPage";
import CustomerDocumentsReportPage from "./pages/CustomerDocumentsReportPage";
import FileActivityReportPage from "./pages/FileActivityReportPage";

function StaffSettingsGuard({ children }: { children: ReactNode }) {
  const { authRequired, customerId, isAdmin, staffLandingInput, hasAnyPermission, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (permissionsReady && authRequired && !isAdmin && !hasAnyPermission(STAFF_SETTINGS_ACCESS)) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "settings");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffReportsRoute({ children }: { children: ReactNode }) {
  const { authRequired, customerId, isAdmin, hasPermission, staffLandingInput, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (permissionsReady && authRequired && !isAdmin && !hasPermission("report:read")) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "reports");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffJobsRoute({ children }: { children: ReactNode }) {
  const { customerId: routeCid } = useParams<{ customerId: string }>();
  const {
    authRequired,
    customerId,
    isAdmin,
    hasPermission,
    staffLandingInput,
    permissionsReady,
    portalHomePath,
  } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    if (routeCid && routeCid !== customerId) {
      return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
    }
  }
  const lacksJobAccess = authRequired && !isAdmin && !hasPermission("job:read");
  if (permissionsReady && lacksJobAccess) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "jobs");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffFilesRoute({ children }: { children: ReactNode }) {
  const { customerId: routeCid } = useParams<{ customerId: string }>();
  const {
    authRequired,
    customerId,
    isAdmin,
    hasAnyPermission,
    staffLandingInput,
    permissionsReady,
    portalHomePath,
    staffHomePath,
  } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    if (routeCid && routeCid !== customerId) {
      return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
    }
  }
  const lacksFileAccess =
    authRequired &&
    !isAdmin &&
    !hasAnyPermission([
      "file:read",
      "file:write",
      "file:delete",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
    ]);
  if (permissionsReady && lacksFileAccess) {
    const next = staffHomePath ?? nextStaffPathAfterDeny(staffLandingInput, "jobs");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffNewJobRoute({ children }: { children: ReactNode }) {
  const { authRequired, customerId, isAdmin, hasPermission, staffLandingInput, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  const lacksJobCreate = authRequired && !isAdmin && !hasPermission("job:create");
  if (permissionsReady && lacksJobCreate) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "jobs");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffCustomerReadRoute({ children }: { children: ReactNode }) {
  const { authRequired, customerId, isAdmin, hasPermission, staffLandingInput, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (permissionsReady && authRequired && !isAdmin && !hasPermission("customer:read")) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "customers");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffCustomerWriteRoute({ children }: { children: ReactNode }) {
  const { authRequired, customerId, isAdmin, hasPermission, staffLandingInput, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (permissionsReady && authRequired && !isAdmin && !hasPermission("customer:write")) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "customers");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function StaffCustomerDriveRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { customerId: routeCid } = useParams<{ customerId: string }>();
  const { authRequired, customerId, isAdmin, hasAnyPermission, permissionsReady, portalHomePath } =
    useAuth();
  const portalScoped = Boolean(authRequired && customerId && !isAdmin);

  /** Direct file / invoice / statement document URLs still require jobs/files rights (staff or portal). */
  const isProtectedDriveSubRoute =
    /\/customers\/[^/]+\/files\//.test(pathname) ||
    /\/customers\/[^/]+\/invoices\//.test(pathname) ||
    /\/customers\/[^/]+\/statements\//.test(pathname);

  if (portalScoped) {
    if (routeCid && routeCid !== customerId) {
      return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
    }
  }

  const needsDrivePermission =
    authRequired &&
    !isAdmin &&
    !hasAnyPermission([
      "file:read",
      "file:write",
      "file:delete",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
    ]);

  if (permissionsReady && needsDrivePermission) {
    const portalWorkspaceBypass = portalScoped && !isProtectedDriveSubRoute;
    if (!portalWorkspaceBypass) {
      if (routeCid) {
        return (
          <Navigate
            to={portalScoped ? (portalHomePath ?? `/customers/${routeCid}/dashboard`) : `/customers/${routeCid}/details`}
            replace
          />
        );
      }
      return <Navigate to="/customers" replace />;
    }
  }
  return <>{children}</>;
}

function CustomerWorkspaceSubscriptionRoute() {
  const { customerId: routeCid } = useParams<{ customerId: string }>();
  const { authRequired, customerId, isAdmin, hasPermission, permissionsReady, portalHomePath } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    if (routeCid && routeCid !== customerId) {
      return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
    }
  }
  const ok =
    isAdmin ||
    hasPermission("customer:read") ||
    hasPermission("subscription_plan:read") ||
    hasPermission("subscription_plan:write");
  if (!routeCid) {
    return <Navigate to="/customers" replace />;
  }
  if (permissionsReady && !ok) {
    return <Navigate to={portalHomePath ?? `/customers/${routeCid}/dashboard`} replace />;
  }
  return <CustomerSubscriptionPage />;
}

function CustomerWorkspaceIndexRedirect() {
  const { customerId } = useParams<{ customerId: string }>();
  const { portalHomePath } = useAuth();
  if (!customerId) {
    return <Navigate to="/customers" replace />;
  }
  return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
}

function HomeRedirect() {
  const { authRequired, customerId, isAdmin, staffHomePath, portalHomePath } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (!authRequired) {
    return <Navigate to="/jobs" replace />;
  }
  if (staffHomePath) {
    return <Navigate to={staffHomePath} replace />;
  }
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-3 px-4 text-center text-sm text-muted">
      <p className="text-ink">Your account has no module access yet.</p>
      <p>Ask an administrator to assign a role with the permissions you need.</p>
    </div>
  );
}

function AdminDashboardRoute() {
  const { authRequired, customerId, isAdmin, hasPermission, staffLandingInput, permissionsReady, portalHomePath } =
    useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
  }
  if (permissionsReady && authRequired && !isAdmin && !hasPermission("dashboard:read")) {
    const next = nextStaffPathAfterDeny(staffLandingInput, "dashboard");
    if (next) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <AdminDashboardPage />;
}

function SettingsPermissionsLoading() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted">Loading…</div>
  );
}

function SettingsIndexRedirect() {
  const { isAdmin, hasPermission, hasAnyPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return <SettingsPermissionsLoading />;
  if (isAdmin || hasPermission("settings:read") || hasPermission("settings:write")) {
    return <Navigate to="/settings/information" replace />;
  }
  if (hasAnyPermission(["subscription_plan:read", "subscription_plan:write"])) {
    return <Navigate to="/settings/subscription" replace />;
  }
  return <Navigate to="/settings/information" replace />;
}

function StaffSettingsInformationRoute() {
  const { isAdmin, hasPermission, hasAnyPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return <SettingsPermissionsLoading />;
  if (isAdmin || hasPermission("settings:read") || hasPermission("settings:write")) {
    return <StaffSettingsBasicPage />;
  }
  if (hasAnyPermission(["subscription_plan:read", "subscription_plan:write"])) {
    return <Navigate to="/settings/subscription" replace />;
  }
  return <Navigate to="/settings" replace />;
}

function StaffSettingsSubscriptionRoute() {
  const { isAdmin, hasAnyPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return <SettingsPermissionsLoading />;
  if (isAdmin || hasAnyPermission(["subscription_plan:read", "subscription_plan:write"])) {
    return <SubscriptionManagementPage />;
  }
  return <Navigate to="/settings" replace />;
}

function StaffSettingsSubscriptionNewRoute() {
  const { isAdmin, hasAnyPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return <SettingsPermissionsLoading />;
  if (isAdmin || hasAnyPermission(["subscription_plan:read", "subscription_plan:write"])) {
    return <StaffAddSubscriptionPage />;
  }
  return <Navigate to="/settings" replace />;
}

function StaffSettingsSubscriptionEditRoute() {
  const { isAdmin, hasAnyPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return <SettingsPermissionsLoading />;
  if (isAdmin || hasAnyPermission(["subscription_plan:read", "subscription_plan:write"])) {
    return <StaffEditSubscriptionPage />;
  }
  return <Navigate to="/settings" replace />;
}

function StaffAdminOnlyRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Navigate to="/settings" replace />;
  }
  return <>{children}</>;
}

function PortalToCustomerWorkspaceRedirect() {
  const { customerId, isAdmin, portalHomePath } = useAuth();
  if (!customerId || isAdmin) {
    return <Navigate to="/customers" replace />;
  }
  return <Navigate to={portalHomePath ?? `/customers/${customerId}/dashboard`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AuthLayoutRouter />
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<AdminDashboardRoute />} />
            <Route path="/portal" element={<PortalToCustomerWorkspaceRedirect />} />
            <Route path="/portal/invoices" element={<PortalToCustomerWorkspaceRedirect />} />
            <Route path="/portal/statements" element={<PortalToCustomerWorkspaceRedirect />} />
            <Route path="/portal/files" element={<PortalToCustomerWorkspaceRedirect />} />
            <Route
              path="/customers"
              element={
                <StaffCustomerReadRoute>
                  <CustomersPage />
                </StaffCustomerReadRoute>
              }
            />
            <Route
              path="/customers/export"
              element={
                <StaffCustomerReadRoute>
                  <CustomersExportPage />
                </StaffCustomerReadRoute>
              }
            />
            <Route
              path="/customers/new"
              element={
                <StaffCustomerReadRoute>
                  <StaffCustomerWriteRoute>
                    <NewCustomerPage />
                  </StaffCustomerWriteRoute>
                </StaffCustomerReadRoute>
              }
            />
            <Route
              path="/customers/:customerId/onboarding"
              element={
                <StaffCustomerReadRoute>
                  <StaffCustomerWriteRoute>
                    <NewCustomerPage />
                  </StaffCustomerWriteRoute>
                </StaffCustomerReadRoute>
              }
            />
            <Route
              path="/customers/onboarding-preview"
              element={
                <StaffCustomerReadRoute>
                  <OnboardingHtmlPreviewPage />
                </StaffCustomerReadRoute>
              }
            />
            <Route
              path="/customers/:customerId/invoices/:financialDocumentId"
              element={
                <StaffCustomerDriveRoute>
                  <InvoiceDetailPage />
                </StaffCustomerDriveRoute>
              }
            />
            <Route
              path="/customers/:customerId/statements/:financialDocumentId"
              element={
                <StaffCustomerDriveRoute>
                  <StatementDetailPage />
                </StaffCustomerDriveRoute>
              }
            />
            <Route
              path="/customers/:customerId/files/:fileId"
              element={
                <StaffCustomerDriveRoute>
                  <FileDetailPage />
                </StaffCustomerDriveRoute>
              }
            />
            <Route
              path="/customers/:customerId"
              element={
                <StaffCustomerDriveRoute>
                  <CustomerWorkspaceLayout />
                </StaffCustomerDriveRoute>
              }
            >
              <Route index element={<CustomerWorkspaceIndexRedirect />} />
              <Route path="dashboard" element={<CustomerWorkspaceDashboardPage />} />
              <Route path="details" element={<CustomerDetailsPage />} />
              <Route path="subscription" element={<CustomerWorkspaceSubscriptionRoute />} />
              <Route path="users" element={<CustomerUsersPage />} />
              <Route path="forms" element={<CustomerFormsPage />} />
              <Route
                path="library-documents"
                element={
                  <StaffFilesRoute>
                    <CustomerLibraryDocumentsPage />
                  </StaffFilesRoute>
                }
              />
              <Route
                path="jobs"
                element={
                  <StaffJobsRoute>
                    <CustomerJobsPage />
                  </StaffJobsRoute>
                }
              />
              <Route
                path="jobs/new"
                element={
                  <StaffNewJobRoute>
                    <CustomerNewJobPage />
                  </StaffNewJobRoute>
                }
              />
              <Route path="settings" element={<CustomerSettingsPage />} />
              <Route
                path="drive"
                element={
                  <StaffCustomerDriveRoute>
                    <CustomerDrivePage />
                  </StaffCustomerDriveRoute>
                }
              />
            </Route>
            <Route
              path="/jobs"
              element={
                <StaffJobsRoute>
                  <JobsPage />
                </StaffJobsRoute>
              }
            />
            <Route
              path="/jobs/queue"
              element={<Navigate to="/settings/queue" replace />}
            />
            <Route
              path="/jobs/new"
              element={
                <StaffNewJobRoute>
                  <NewJobPage />
                </StaffNewJobRoute>
              }
            />
            <Route
              path="/jobs/:jobId"
              element={
                <StaffJobsRoute>
                  <JobDetailPage />
                </StaffJobsRoute>
              }
            />
            <Route
              path="/files"
              element={
                <StaffFilesRoute>
                  <DocumentsPage />
                </StaffFilesRoute>
              }
            />
            <Route
              path="/files/documents/:documentId"
              element={
                <StaffFilesRoute>
                  <LibraryDocumentPage />
                </StaffFilesRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <StaffReportsRoute>
                  <ReportsLayout />
                </StaffReportsRoute>
              }
            >
              <Route index element={<Navigate to="/reports/job-cost" replace />} />
              <Route path="job-cost" element={<JobCostReportPage />} />
              <Route path="customer-documents" element={<CustomerDocumentsReportPage />} />
              <Route path="file-activity" element={<FileActivityReportPage />} />
              <Route
                path="file-activity/:documentId"
                element={<FileActivityReportPage />}
              />
              <Route path="token-burn" element={<Navigate to="/reports/job-cost" replace />} />
              <Route path="by-page" element={<Navigate to="/reports/job-cost?view=by-page" replace />} />
            </Route>
            <Route path="/subscriptions" element={<Navigate to="/settings/subscription" replace />} />
            <Route
              path="/settings"
              element={
                <StaffSettingsGuard>
                  <StaffSettingsLayout />
                </StaffSettingsGuard>
              }
            >
              <Route index element={<SettingsIndexRedirect />} />
              <Route path="information" element={<StaffSettingsInformationRoute />} />
              <Route path="subscription/edit/:planId" element={<StaffSettingsSubscriptionEditRoute />} />
              <Route path="subscription/new" element={<StaffSettingsSubscriptionNewRoute />} />
              <Route path="subscription" element={<StaffSettingsSubscriptionRoute />} />
              <Route
                path="users"
                element={
                  <StaffAdminOnlyRoute>
                    <StaffSettingsUsersPage />
                  </StaffAdminOnlyRoute>
                }
              />
              <Route
                path="users/:userId/access"
                element={
                  <StaffAdminOnlyRoute>
                    <StaffSettingsUserAccessPage />
                  </StaffAdminOnlyRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <StaffAdminOnlyRoute>
                    <RolesSettingsPage />
                  </StaffAdminOnlyRoute>
                }
              />
              <Route
                path="notifications"
                element={
                  <StaffAdminOnlyRoute>
                    <NotificationSettingsPage />
                  </StaffAdminOnlyRoute>
                }
              />
              <Route
                path="notifications/broadcast"
                element={<Navigate to="/settings/notifications?tab=broadcast" replace />}
              />
              <Route
                path="notifications/events"
                element={<Navigate to="/settings/notifications?tab=event" replace />}
              />
              <Route
                path="queue"
                element={
                  <StaffJobsRoute>
                    <QueueDashboardPage />
                  </StaffJobsRoute>
                }
              />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
