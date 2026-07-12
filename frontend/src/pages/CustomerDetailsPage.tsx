import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { patchCustomer } from "../api/client";
import type { CustomerOnboardingData } from "../types/customerOnboarding";
import {
  coerceOfficeNoted,
  labelForOfficeApprovalStatus,
  OFFICE_APPROVAL_STATUS_OPTIONS,
  reviveCustomerOnboarding,
  showCompaniesHouseAuthCode,
  showHmrcAgentCodes,
} from "../types/customerOnboarding";
import { mapOnboardingToCustomerTableFields } from "../utils/customerListFromOnboarding";
import { CustomerDetailExportModal } from "../components/CustomerDetailExportModal";
import { DatePickerField } from "../components/DatePickerField";
import { Can } from "../auth/Can";
import { useAuth } from "../auth/AuthContext";
import type { CustomerAccountStatus } from "../types/api";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";
import { formatDate } from "../utils/formatDate";
import { useActiveCustomerDetailsEdit } from "../hooks/useActiveCustomerDetailsEdit";

const ACCOUNT_STATUS_OPTIONS: CustomerAccountStatus[] = ["draft", "active", "inactive", "proposed"];

function accountStatusLabel(s: CustomerAccountStatus): string {
  if (s === "inactive") return "Inactive";
  if (s === "proposed") return "Proposed";
  return s === "active" ? "Active" : "Draft";
}

function fmtDay(iso: string | null | undefined): string {
  return formatDate(iso);
}

function joiningMonthFrom(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{display}</p>
    </div>
  );
}

const detailInputClass =
  "mt-1 w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm font-medium text-ink";

function ProfileDetailField({
  label,
  displayValue,
  editPath,
  canEdit,
  fieldValue,
  setField,
  inputType = "text",
}: {
  label: string;
  displayValue: string | number | null | undefined;
  editPath?: string;
  canEdit: boolean;
  fieldValue: (path: string) => string;
  setField: (path: string, value: string) => void;
  inputType?: "text" | "date";
}) {
  if (canEdit && editPath) {
    if (inputType === "date") {
      return (
        <label className="min-w-0 block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
          <div className="mt-1">
            <DatePickerField
              value={fieldValue(editPath)}
              onChange={(value) => setField(editPath, value)}
              className={detailInputClass}
              aria-label={label}
            />
          </div>
        </label>
      );
    }
    return (
      <label className="min-w-0 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <input
          type={inputType}
          value={fieldValue(editPath)}
          onChange={(e) => setField(editPath, e.target.value)}
          className={detailInputClass}
        />
      </label>
    );
  }
  const formattedValue =
    inputType === "date"
      ? fmtDay(typeof displayValue === "string" ? displayValue : displayValue != null ? String(displayValue) : undefined)
      : displayValue;
  return <DetailField label={label} value={formattedValue} />;
}

function ProfileYesNoField({
  label,
  displayValue,
  editPath,
  canEdit,
  fieldValue,
  setField,
}: {
  label: string;
  displayValue: string;
  editPath: string;
  canEdit: boolean;
  fieldValue: (path: string) => string;
  setField: (path: string, value: string) => void;
}) {
  if (canEdit) {
    const raw = fieldValue(editPath);
    const selected = raw === "true" ? "true" : raw === "false" ? "false" : "";
    return (
      <label className="min-w-0 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <select
          value={selected}
          onChange={(e) => setField(editPath, e.target.value)}
          className={detailInputClass}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
    );
  }
  return <DetailField label={label} value={displayValue} />;
}

function ProfileSelectField({
  label,
  displayValue,
  editPath,
  canEdit,
  fieldValue,
  setField,
  options,
}: {
  label: string;
  displayValue: string;
  editPath: string;
  canEdit: boolean;
  fieldValue: (path: string) => string;
  setField: (path: string, value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  if (canEdit) {
    return (
      <label className="min-w-0 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <select
          value={fieldValue(editPath)}
          onChange={(e) => setField(editPath, e.target.value)}
          className={detailInputClass}
        >
          {options.map((opt) => (
            <option key={opt.value || "__empty"} value={opt.value}>
              {opt.label || "—"}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return <DetailField label={label} value={displayValue} />;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface-raised shadow-sm">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-muted/40 px-4 py-2.5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function kycLabel(status: "pending" | "completed" | "failed" | undefined): { text: string; className: string } {
  if (status === "completed") {
    return {
      text: "Verified",
      className: "badge-success rounded-md px-2 py-0.5 text-xs normal-case tracking-normal",
    };
  }
  if (status === "failed") {
    return {
      text: "Failed",
      className: "badge-error rounded-md",
    };
  }
  return {
    text: "Pending",
    className: "badge-warning rounded-md",
  };
}

function pickStr(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function yn(v: boolean | undefined | null): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function matrixPlanName(c: { plan?: { name?: string } | Record<string, unknown> | null } | null): string | undefined {
  const p = c?.plan;
  if (!p || typeof p !== "object") return undefined;
  const n = (p as { name?: unknown }).name;
  return typeof n === "string" && n.trim() ? n.trim() : undefined;
}

function subscriptionPlanLabel(
  c: { plan?: { name?: string } | Record<string, unknown> | null } | null,
  onboarding: CustomerOnboardingData | null,
): string | undefined {
  return matrixPlanName(c) ?? (onboarding?.subscription_plan_name?.trim() || undefined);
}

export default function CustomerDetailsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { isAdmin, hasPermission, apiBase, authHeaders } = useAuth();
  const { customer, loading, err, reload } = useOutletContext<CustomerWorkspaceOutletContext>();
  const canEditOnboarding = isAdmin || hasPermission("customer:write");

  const merged = useMemo(() => {
    const raw = (customer?.onboardingData ?? null) as Record<string, unknown> | null;
    return raw && typeof raw === "object" ? raw : {};
  }, [customer?.onboardingData]);

  const onboarding = useMemo((): CustomerOnboardingData | null => {
    if (!customer?.onboardingData && Object.keys(merged).length === 0) return null;
    try {
      return reviveCustomerOnboarding(merged);
    } catch {
      return null;
    }
  }, [customer?.onboardingData, merged]);

  const flat = useMemo(() => (onboarding ? mapOnboardingToCustomerTableFields(onboarding) : {}), [onboarding]);

  const ch = onboarding?.companies_house;
  const accountsDue = ch?.accounts?.next_accounts_due_on;
  const chPeriodEnd = ch?.accounts?.next_accounts_period_end_on;
  const csMadeUpTo = ch?.confirmation_statement?.next_made_up_to;
  const accountsOverdue = ch?.accounts?.next_accounts_overdue;
  const csNext = ch?.confirmation_statement?.next_due ?? ch?.annual_return?.next_due;

  const d0 = onboarding?.directors?.[0];
  const d1 = onboarding?.directors?.[1];
  const d0x = d0 as Record<string, unknown> | undefined;
  const d1x = d1 as Record<string, unknown> | undefined;

  const ext = merged as Record<string, unknown>;
  const authCode =
    pickStr(ext, ["auth_code", "authCode", "companies_house_auth_code"]) ??
    (onboarding?.tax?.auth_code?.trim() ? onboarding.tax.auth_code.trim() : undefined);

  const chEmail = pickStr(ext, ["ch_email", "chEmail", "companies_house_email"]) ?? onboarding?.contact?.email;

  const clearance = pickStr(ext, ["clearance", "clearance_status"]);

  const joiningMonth =
    pickStr(ext, ["joining_month", "joiningMonth"]) ?? (customer?.createdAt ? joiningMonthFrom(customer.createdAt) : "—");

  const threeKRef = onboarding?.agent?.client_reference?.trim() || pickStr(ext, ["three_k_ref", "threeKRef"]) || "—";

  const payeYes =
    flat.payeEnabled === true ? "Yes" : flat.payeEnabled === false ? "No" : onboarding?.services?.payroll?.enabled ? "Yes" : "—";

  const kyc = kycLabel(flat.kycStatus);

  const portalUserSummary = customer?.portalUsers?.length
    ? customer.portalUsers
        .map((u) => u.user?.email?.trim())
        .filter(Boolean)
        .join(", ")
    : undefined;

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [accountStatusSaving, setAccountStatusSaving] = useState(false);
  const [optimisticAccountStatus, setOptimisticAccountStatus] = useState<CustomerAccountStatus | null>(null);

  const currentAccountStatus: CustomerAccountStatus = customer?.accountStatus ?? "draft";
  const displayedAccountStatus = optimisticAccountStatus ?? currentAccountStatus;

  useEffect(() => {
    setOptimisticAccountStatus(null);
  }, [currentAccountStatus]);

  const onAccountStatusChange = useCallback(
    async (next: CustomerAccountStatus) => {
      if (!customerId || !customer || next === currentAccountStatus || accountStatusSaving) return;
      setOptimisticAccountStatus(next);
      setAccountStatusSaving(true);
      try {
        await patchCustomer(apiBase, authHeaders(), customerId, { accountStatus: next });
        await reload?.();
      } catch (e) {
        console.error(e);
        setOptimisticAccountStatus(null);
      } finally {
        setAccountStatusSaving(false);
      }
    },
    [accountStatusSaving, apiBase, authHeaders, currentAccountStatus, customer, customerId, reload],
  );

  const {
    canEdit: canEditActiveDetails,
    fieldValue,
    setField,
    turnoverDraft,
    setTurnoverDraft,
    dirty: detailsDirty,
    saving: detailsSaving,
    saveErr: detailsSaveErr,
    save: saveDetails,
    reset: resetDetails,
  } = useActiveCustomerDetailsEdit({
    customer: customer ?? null,
    merged,
    onboarding,
    isAdmin,
    canWriteCustomer: canEditOnboarding,
    accountStatus: currentAccountStatus,
    customerId,
    apiBase,
    authHeaders,
    reload,
  });

  if (loading && !customer) {
    return <p className="text-sm text-muted">Loading customer…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Customer Details</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Structured profile below. Export data lets you pick columns (turnover, plan, contact, VAT, agent, bank,
            etc.), preview the row like Excel, then download CSV or Excel.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {customerId && customer ? (
              <Can permission="customer:read">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(true)}
                  className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
                >
                  Export data
                </button>
              </Can>
            ) : null}
            {customerId ? (
              <Can permission="job:read">
                <Link
                  to={`/customers/${customerId}/library-documents`}
                  className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-brand hover:bg-surface-muted"
                >
                  Files (grid)
                </Link>
                <Link
                  to={`/customers/${customerId}/drive`}
                  className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-brand hover:bg-surface-muted"
                >
                  Open file library
                </Link>
              </Can>
            ) : null}
            <Link to="/customers" className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
              ← All customers
            </Link>
          </div>
        </div>
      </div>

      {!onboarding ? (
        <p className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted">
          No onboarding profile is stored for this customer yet. Finish{" "}
          {customerId && canEditOnboarding ? (
            <Link className="font-semibold text-brand hover:underline" to={`/customers/${customerId}/onboarding`}>
              onboarding
            </Link>
          ) : (
            "onboarding"
          )}{" "}
          to populate these sections, or open the file library to work with documents.
        </p>
      ) : null}

      {canEditActiveDetails ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">Edit mode</span>
            <span className="text-muted"> — active customers can be updated inline below, then save.</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {detailsSaveErr ? <span className="text-sm text-red-400">{detailsSaveErr}</span> : null}
            <button
              type="button"
              onClick={() => resetDetails()}
              disabled={!detailsDirty || detailsSaving}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveDetails()}
              disabled={!detailsDirty || detailsSaving}
              className="btn btn-primary btn-sm disabled:cursor-not-allowed"
            >
              {detailsSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}

      <DetailSection title="Account & subscription">
        {canEditOnboarding && customerId && customer ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Account status</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                id="customer-account-status"
                className="max-w-[14rem] rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm font-medium text-ink"
                value={displayedAccountStatus}
                disabled={accountStatusSaving}
                onChange={(e) => {
                  const v = e.target.value as CustomerAccountStatus;
                  void onAccountStatusChange(v);
                }}
              >
                {ACCOUNT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {accountStatusLabel(s)}
                  </option>
                ))}
              </select>
              {accountStatusSaving ? <span className="text-xs text-muted">Saving…</span> : null}
            </div>
          </div>
        ) : (
          <DetailField label="Account status" value={accountStatusLabel(displayedAccountStatus)} />
        )}
        <DetailField label="Created" value={fmtDay(customer?.createdAt)} />
        <DetailField label="Updated" value={fmtDay(customer?.updatedAt)} />
        {canEditActiveDetails ? (
          <label className="min-w-0 block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Annual turnover (GBP)</span>
            <input
              type="text"
              inputMode="decimal"
              value={turnoverDraft}
              onChange={(e) => setTurnoverDraft(e.target.value)}
              className={detailInputClass}
              placeholder="e.g. 250000"
            />
          </label>
        ) : (
          <DetailField
            label="Annual turnover (GBP)"
            value={
              customer?.annualTurnoverGbp !== undefined && customer?.annualTurnoverGbp !== null && customer?.annualTurnoverGbp !== ""
                ? String(customer.annualTurnoverGbp)
                : onboarding?.annual_turnover_gbp !== undefined && onboarding?.annual_turnover_gbp !== null
                  ? String(onboarding.annual_turnover_gbp)
                  : undefined
            }
          />
        )}
        <DetailField label="Subscription plan" value={subscriptionPlanLabel(customer, onboarding)} />
        <DetailField label="Portal users" value={portalUserSummary} />
      </DetailSection>

      <DetailSection title="Business profile">
        <ProfileDetailField
          label="3K reference"
          displayValue={threeKRef}
          editPath="agent.client_reference"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Entity type"
          displayValue={onboarding?.company?.type}
          editPath="company.type"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Industry group"
          displayValue={onboarding?.company?.nature_of_business}
          editPath="company.nature_of_business"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Joining month"
          displayValue={joiningMonth}
          editPath="joining_month"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="No. of stores"
          displayValue={flat.numberOfStores ?? "—"}
          editPath="services.payroll.employee_count"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Clearance"
          displayValue={clearance ?? "—"}
          editPath="clearance"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileSelectField
          label="KYC status"
          displayValue={kyc.text}
          editPath="office_use.approval_status"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          options={OFFICE_APPROVAL_STATUS_OPTIONS}
        />
      </DetailSection>

      <DetailSection title="Contact">
        <ProfileDetailField
          label="Email"
          displayValue={onboarding?.contact?.email}
          editPath="contact.email"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Phone"
          displayValue={onboarding?.contact?.phone}
          editPath="contact.phone"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Address"
          displayValue={onboarding?.company?.registeredAddress?.line1}
          editPath="company.registeredAddress.line1"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="City"
          displayValue={onboarding?.company?.registeredAddress?.city}
          editPath="company.registeredAddress.city"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Post code"
          displayValue={onboarding?.company?.registeredAddress?.postcode}
          editPath="company.registeredAddress.postcode"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Country"
          displayValue={onboarding?.company?.registeredAddress?.country}
          editPath="company.registeredAddress.country"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
      </DetailSection>

      {onboarding ? (
        <DetailSection title="Trading address">
          <ProfileYesNoField
            label="Same as registered"
            displayValue={yn(onboarding.company?.traderSameAsRegistered)}
            editPath="company.traderSameAsRegistered"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Line 1"
            displayValue={onboarding.company?.traderAddress?.line1}
            editPath="company.traderAddress.line1"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="City"
            displayValue={onboarding.company?.traderAddress?.city}
            editPath="company.traderAddress.city"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Post code"
            displayValue={onboarding.company?.traderAddress?.postcode}
            editPath="company.traderAddress.postcode"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Country"
            displayValue={onboarding.company?.traderAddress?.country}
            editPath="company.traderAddress.country"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Company (registry)">
          <ProfileDetailField
            label="Company status"
            displayValue={onboarding.company?.company_status}
            editPath="company.company_status"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Jurisdiction"
            displayValue={onboarding.company?.jurisdiction}
            editPath="company.jurisdiction"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      <DetailSection title="VAT & PAYE">
        <ProfileDetailField
          label="VAT number"
          displayValue={onboarding?.tax?.vat_number}
          editPath="tax.vat_number"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="VAT reg date"
          displayValue={flat.vatRegDate}
          editPath="vat_reg_date"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Next VAT quarter end"
          displayValue={onboarding?.tax?.vat_quarter}
          editPath="tax.vat_quarter"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="VAT return due date"
          displayValue={onboarding?.tax?.vat_return_due_date ? fmtDay(onboarding.tax.vat_return_due_date) : undefined}
          editPath="tax.vat_return_due_date"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="PAYE Ref"
          displayValue={onboarding?.tax?.ni_number}
          editPath="tax.ni_number"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="CIS reference"
          displayValue={onboarding?.tax?.cis_reference}
          editPath="tax.cis_reference"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileYesNoField
          label="PAYE"
          displayValue={payeYes}
          editPath="services.payroll.enabled"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="PAYE frequency"
          displayValue={flat.payeFrequency}
          editPath="services.payroll.frequency"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="PAYE Office Ref"
          displayValue={onboarding?.tax?.paye_ref}
          editPath="tax.paye_ref"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
      </DetailSection>

      <DetailSection title="Companies House">
        <ProfileDetailField
          label="Company reg no"
          displayValue={onboarding?.company?.number}
          editPath="company.number"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Reg date"
          displayValue={fmtDay(onboarding?.company?.date_of_creation)}
          editPath="company.date_of_creation"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="CH email"
          displayValue={chEmail}
          editPath="ch_email"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="UTR"
          displayValue={onboarding?.tax?.utr}
          editPath="tax.utr"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        {showCompaniesHouseAuthCode(onboarding?.company?.type) ? (
          <ProfileDetailField
            label="Auth code"
            displayValue={authCode}
            editPath="tax.auth_code"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        ) : null}
      </DetailSection>

      <DetailSection title="Filing schedule & dashboard deadlines">
        <p className="col-span-full text-xs text-muted sm:col-span-2 lg:col-span-3 xl:col-span-4">
          Matches the <span className="font-medium text-ink-soft">Accounts & confirmation deadlines</span> table on the
          admin dashboard. Companies House fields may be refreshed by the nightly CH sync; use custom columns for
          staff-owned dates that should not be overwritten.
        </p>
        <ProfileDetailField
          label="Financial Year End (CH)"
          displayValue={chPeriodEnd}
          editPath="companies_house.accounts.next_accounts_period_end_on"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="Accounts Due (CH)"
          displayValue={accountsDue}
          editPath="companies_house.accounts.next_accounts_due_on"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="CS Due (CH)"
          displayValue={csMadeUpTo}
          editPath="companies_house.confirmation_statement.next_made_up_to"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="Custom accounts due"
          displayValue={pickStr(ext, ["accounts_fd", "accountsFd", "acsFd"])}
          editPath="accounts_fd"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileDetailField
          label="Custom CS due"
          displayValue={pickStr(ext, ["cs", "confirmation_stmt", "confirmationStmt"])}
          editPath="cs"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
          inputType="date"
        />
        <ProfileYesNoField
          label="Accounts overdue (CH)"
          displayValue={yn(accountsOverdue)}
          editPath="companies_house.accounts.next_accounts_overdue"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Year end (staff)"
          displayValue={onboarding?.company?.year_end}
          editPath="company.year_end"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        <ProfileDetailField
          label="Filing month"
          displayValue={pickStr(ext, ["filing_month", "filingMonth"])}
          editPath="filing_month"
          canEdit={canEditActiveDetails}
          fieldValue={fieldValue}
          setField={setField}
        />
        {csNext && csNext !== csMadeUpTo ? (
          <DetailField label="CS next due (CH, read-only)" value={fmtDay(csNext)} />
        ) : null}
      </DetailSection>

      {d0?.name ? (
        <DetailSection title="Director 1">
          <ProfileDetailField
            label="Name"
            displayValue={d0.name}
            editPath="directors.0.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Date of birth"
            displayValue={fmtDay(d0.date_of_birth || pickStr(d0x, ["dob", "date_of_birth", "dateOfBirth"]))}
            editPath="directors.0.date_of_birth"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="Phone"
            displayValue={pickStr(d0x, ["phone", "phone_number", "phoneNumber"])}
            editPath="directors.0.phone"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="NI Number"
            displayValue={(d0.ni_number || pickStr(d0x, ["ni_number", "niNumber", "ni_no"])) ?? onboarding?.tax?.ni_number}
            editPath="directors.0.ni_number"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Personal UTR"
            displayValue={d0.personal_utr || pickStr(d0x, ["personal_utr", "personalUtr", "personal_utr_d1"])}
            editPath="directors.0.personal_utr"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Identity verification code"
            displayValue={
              d0.identity_verification_code ||
              pickStr(d0x, ["identity_verification_code", "identityVerificationCode", "director_code", "directorCode"])
            }
            editPath="directors.0.identity_verification_code"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Address"
            displayValue={[d0.address, d0.city, d0.postcode].filter((x) => String(x ?? "").trim()).join(", ") || undefined}
            editPath="directors.0.address"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Agent (HMRC 64-8)">
          <ProfileDetailField
            label="Agent name"
            displayValue={onboarding.agent?.name}
            editPath="agent.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Agent address"
            displayValue={onboarding.agent?.address}
            editPath="agent.address"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Agent postcode"
            displayValue={onboarding.agent?.postcode}
            editPath="agent.postcode"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Agent phone"
            displayValue={onboarding.agent?.phone}
            editPath="agent.phone"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          {showHmrcAgentCodes(onboarding.company?.type) ? (
            <>
              <ProfileDetailField
                label="Agent code (SA)"
                displayValue={onboarding.agent?.agent_code_sa}
                editPath="agent.agent_code_sa"
                canEdit={canEditActiveDetails}
                fieldValue={fieldValue}
                setField={setField}
              />
              <ProfileDetailField
                label="Agent code (CT)"
                displayValue={onboarding.agent?.agent_code_ct}
                editPath="agent.agent_code_ct"
                canEdit={canEditActiveDetails}
                fieldValue={fieldValue}
                setField={setField}
              />
            </>
          ) : null}
          <ProfileDetailField
            label="Reference"
            displayValue={onboarding.agent?.client_reference}
            editPath="agent.client_reference"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Bank">
          <ProfileDetailField
            label="Account holder"
            displayValue={onboarding.bank?.account_holder_name}
            editPath="bank.account_holder_name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Sort code"
            displayValue={onboarding.bank?.sort_code}
            editPath="bank.sort_code"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Account number"
            displayValue={onboarding.bank?.account_number}
            editPath="bank.account_number"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Bank address"
            displayValue={onboarding.bank?.bank_address}
            editPath="bank.bank_address"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Change of accountant">
          <ProfileDetailField
            label="Previous accountant"
            displayValue={onboarding.change_of_accountant?.previous_accountant_name}
            editPath="change_of_accountant.previous_accountant_name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Address line 1"
            displayValue={onboarding.change_of_accountant?.previous_accountant_address?.line1}
            editPath="change_of_accountant.previous_accountant_address.line1"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="City"
            displayValue={onboarding.change_of_accountant?.previous_accountant_address?.city}
            editPath="change_of_accountant.previous_accountant_address.city"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Post code"
            displayValue={onboarding.change_of_accountant?.previous_accountant_address?.postcode}
            editPath="change_of_accountant.previous_accountant_address.postcode"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Country"
            displayValue={onboarding.change_of_accountant?.previous_accountant_address?.country}
            editPath="change_of_accountant.previous_accountant_address.country"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Tax authorizations (64-8)">
          <ProfileYesNoField
            label="Self Assessment"
            displayValue={yn(onboarding.authorization?.self_assessment)}
            editPath="authorization.self_assessment"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Partnership"
            displayValue={yn(onboarding.authorization?.partnership)}
            editPath="authorization.partnership"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Trust"
            displayValue={yn(onboarding.authorization?.trust)}
            editPath="authorization.trust"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="VAT"
            displayValue={yn(onboarding.authorization?.vat)}
            editPath="authorization.vat"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="PAYE"
            displayValue={yn(onboarding.authorization?.paye)}
            editPath="authorization.paye"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Office use">
          <ProfileDetailField
            label="Notes"
            displayValue={coerceOfficeNoted(onboarding.office_use?.noted)}
            editPath="office_use.noted"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Internal remarks"
            displayValue={onboarding.office_use?.internal_remarks}
            editPath="office_use.internal_remarks"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileSelectField
            label="Approval status"
            displayValue={labelForOfficeApprovalStatus(onboarding.office_use?.approval_status ?? "")}
            editPath="office_use.approval_status"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            options={OFFICE_APPROVAL_STATUS_OPTIONS}
          />
          <ProfileYesNoField
            label="Director ID — passport"
            displayValue={yn(onboarding.office_use?.director_photo_id?.passport)}
            editPath="office_use.director_photo_id.passport"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Director ID — driving licence"
            displayValue={yn(onboarding.office_use?.director_photo_id?.driving_license)}
            editPath="office_use.director_photo_id.driving_license"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Address proof — utility bill"
            displayValue={yn(onboarding.office_use?.address_proof?.utility_bill)}
            editPath="office_use.address_proof.utility_bill"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Address proof — bank statement"
            displayValue={yn(onboarding.office_use?.address_proof?.bank_statement)}
            editPath="office_use.address_proof.bank_statement"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — Companies House"
            displayValue={yn(onboarding.office_use?.online_access?.companies_house)}
            editPath="office_use.online_access.companies_house"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — HMRC"
            displayValue={yn(onboarding.office_use?.online_access?.hmrc)}
            editPath="office_use.online_access.hmrc"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — PAYE"
            displayValue={yn(onboarding.office_use?.online_access?.paye)}
            editPath="office_use.online_access.paye"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — VAT"
            displayValue={yn(onboarding.office_use?.online_access?.vat)}
            editPath="office_use.online_access.vat"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — Bank"
            displayValue={yn(onboarding.office_use?.online_access?.bank)}
            editPath="office_use.online_access.bank"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — Credit card"
            displayValue={yn(onboarding.office_use?.online_access?.credit_card)}
            editPath="office_use.online_access.credit_card"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Online — Other"
            displayValue={yn(onboarding.office_use?.online_access?.other)}
            editPath="office_use.online_access.other"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding ? (
        <DetailSection title="Signatures (summary)">
          <ProfileSelectField
            label="Capture mode"
            displayValue={onboarding.signatures?.capture_mode ?? "—"}
            editPath="signatures.capture_mode"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            options={[
              { value: "", label: "—" },
              { value: "in_person", label: "In person" },
              { value: "remote_email", label: "Remote email" },
            ]}
          />
          <ProfileDetailField
            label="Registration — signatory"
            displayValue={onboarding.signatures?.client_registration?.name}
            editPath="signatures.client_registration.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Registration — position"
            displayValue={onboarding.signatures?.client_registration?.position}
            editPath="signatures.client_registration.position"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Registration — date"
            displayValue={onboarding.signatures?.client_registration?.date}
            editPath="signatures.client_registration.date"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="Registration — signature"
            displayValue={onboarding.signatures?.client_registration?.signature?.trim() ? "Stored" : undefined}
            editPath="signatures.client_registration.signature"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="64-8 — name"
            displayValue={onboarding.signatures?.hmrc_64_8?.name}
            editPath="signatures.hmrc_64_8.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="64-8 — date"
            displayValue={onboarding.signatures?.hmrc_64_8?.date}
            editPath="signatures.hmrc_64_8.date"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="64-8 — signature"
            displayValue={onboarding.signatures?.hmrc_64_8?.signature?.trim() ? "Stored" : undefined}
            editPath="signatures.hmrc_64_8.signature"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Change of accountant — name"
            displayValue={onboarding.signatures?.change_accountant?.name}
            editPath="signatures.change_accountant.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Change of accountant — date"
            displayValue={onboarding.signatures?.change_accountant?.date}
            editPath="signatures.change_accountant.date"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="Change of accountant — signature"
            displayValue={onboarding.signatures?.change_accountant?.signature?.trim() ? "Stored" : undefined}
            editPath="signatures.change_accountant.signature"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Direct Debit — name"
            displayValue={onboarding.signatures?.direct_debit?.name}
            editPath="signatures.direct_debit.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Direct Debit — date"
            displayValue={onboarding.signatures?.direct_debit?.date}
            editPath="signatures.direct_debit.date"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="Direct Debit — signature"
            displayValue={onboarding.signatures?.direct_debit?.signature?.trim() ? "Stored" : undefined}
            editPath="signatures.direct_debit.signature"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {onboarding?.companies_house ? (
        <DetailSection title="Companies House (snapshot)">
          <ProfileDetailField
            label="Fetched at"
            displayValue={fmtDay(onboarding.companies_house.fetched_at)}
            editPath="companies_house.fetched_at"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="CH company status"
            displayValue={onboarding.companies_house.company_status}
            editPath="companies_house.company_status"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="CH type"
            displayValue={onboarding.companies_house.type}
            editPath="companies_house.type"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="SIC codes"
            displayValue={onboarding.companies_house.sic_codes?.join(", ")}
            editPath="companies_house.sic_codes"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Has insolvency history"
            displayValue={yn(onboarding.companies_house.has_insolvency_history)}
            editPath="companies_house.has_insolvency_history"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileYesNoField
            label="Can file"
            displayValue={yn(onboarding.companies_house.can_file)}
            editPath="companies_house.can_file"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      {d1?.name ? (
        <DetailSection title="Director 2">
          <ProfileDetailField
            label="Name"
            displayValue={d1.name}
            editPath="directors.1.name"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Date of birth"
            displayValue={fmtDay(d1.date_of_birth || pickStr(d1x, ["dob", "date_of_birth", "dateOfBirth"]))}
            editPath="directors.1.date_of_birth"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
            inputType="date"
          />
          <ProfileDetailField
            label="Phone"
            displayValue={pickStr(d1x, ["phone", "phone_number", "phoneNumber"])}
            editPath="directors.1.phone"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="NI Number"
            displayValue={d1.ni_number || pickStr(d1x, ["ni_number", "niNumber", "ni_no"])}
            editPath="directors.1.ni_number"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Personal UTR"
            displayValue={d1.personal_utr || pickStr(d1x, ["personal_utr", "personalUtr", "personal_utr_d2"])}
            editPath="directors.1.personal_utr"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Identity verification code"
            displayValue={
              d1.identity_verification_code ||
              pickStr(d1x, ["identity_verification_code", "identityVerificationCode", "director_code", "directorCode"])
            }
            editPath="directors.1.identity_verification_code"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
          <ProfileDetailField
            label="Address"
            displayValue={[d1.address, d1.city, d1.postcode].filter((x) => String(x ?? "").trim()).join(", ") || undefined}
            editPath="directors.1.address"
            canEdit={canEditActiveDetails}
            fieldValue={fieldValue}
            setField={setField}
          />
        </DetailSection>
      ) : null}

      <DetailSection title="Services in pack">
        <div className="col-span-full text-sm text-ink">
          {flat.servicesInPack?.length ? (
            <ul className="list-inside list-disc text-muted">
              {flat.servicesInPack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
        {onboarding ? (
          <div className="col-span-full mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileYesNoField
              label="Bookkeeping"
              displayValue={yn(onboarding.services?.bookkeeping)}
              editPath="services.bookkeeping"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
            <ProfileYesNoField
              label="VAT service"
              displayValue={yn(onboarding.services?.vat)}
              editPath="services.vat"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
            <ProfileYesNoField
              label="Quarterly reports"
              displayValue={yn(onboarding.services?.quarterly_reports)}
              editPath="services.quarterly_reports"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
            <ProfileYesNoField
              label="Year-end accounts"
              displayValue={yn(onboarding.services?.year_end_accounts)}
              editPath="services.year_end_accounts"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
            <ProfileYesNoField
              label="Personal tax return"
              displayValue={yn(onboarding.services?.personal_tax_return)}
              editPath="services.personal_tax_return"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
            <ProfileDetailField
              label="Payroll — employees"
              displayValue={onboarding.services?.payroll?.employee_count}
              editPath="services.payroll.employee_count"
              canEdit={canEditActiveDetails}
              fieldValue={fieldValue}
              setField={setField}
            />
          </div>
        ) : null}
      </DetailSection>

      <CustomerDetailExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        apiBase={apiBase}
        authHeaders={authHeaders}
        customerId={customerId ?? ""}
        customer={customer}
      />
    </div>
  );
}
