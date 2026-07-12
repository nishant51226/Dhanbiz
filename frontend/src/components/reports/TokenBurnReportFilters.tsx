import { SearchableCustomerSelect } from "../SearchableCustomerSelect";
import type { Customer } from "../../types/api";
import { reportCustomerOptionLabel } from "../../utils/reportCustomerSelect";
import { DatePickerField } from "../DatePickerField";

type Props = {
  fromDate: string;
  toDate: string;
  customerId: string;
  customers: Customer[];
  loading: boolean;
  customersLoading?: boolean;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onCustomerIdChange: (v: string) => void;
  onApply: () => void;
};

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

function ReportDateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <DatePickerField value={value} onChange={onChange} aria-label={label} />
    </label>
  );
}

export function TokenBurnReportFilters({
  fromDate,
  toDate,
  customerId,
  customers,
  loading,
  customersLoading = false,
  onFromDateChange,
  onToDateChange,
  onCustomerIdChange,
  onApply,
}: Props) {
  return (
    <form
      className="rounded-xl border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(8.5rem,9.5rem)_minmax(8.5rem,9.5rem)_minmax(12rem,1fr)_auto] sm:items-end">
        <ReportDateField label="From" value={fromDate} onChange={onFromDateChange} />
        <ReportDateField label="To" value={toDate} onChange={onToDateChange} />
        <SearchableCustomerSelect
          size="small"
          label="Customer (optional)"
          customers={customers}
          value={customerId}
          onChange={onCustomerIdChange}
          allowEmpty
          emptyLabel="All customers"
          disabled={loading || customersLoading}
          getOptionLabel={reportCustomerOptionLabel}
          placeholder={customersLoading ? "Loading customers…" : "Search customers…"}
        />
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-md-fixed shrink-0 px-5 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>
    </form>
  );
}
