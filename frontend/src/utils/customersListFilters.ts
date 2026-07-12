import type { CustomerAccountStatus } from "../types/api";
import type { CustomersListExportFilters } from "../api/client";

export type FormStatusFilter = "all" | "draft" | "completed";
export type AccountStatusFilter = "all" | CustomerAccountStatus;

export type CustomersListFilters = {
  search: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  formStatus: FormStatusFilter;
  accountStatus: AccountStatusFilter;
};

export const EMPTY_CUSTOMERS_LIST_FILTERS: CustomersListFilters = {
  search: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
  formStatus: "all",
  accountStatus: "all",
};

export function customersListFiltersToExportFilters(filters: CustomersListFilters): CustomersListExportFilters {
  const out: CustomersListExportFilters = {};
  const search = filters.search.trim();
  if (search) out.search = search;
  if (filters.createdFrom.trim()) out.createdFrom = filters.createdFrom.trim();
  if (filters.createdTo.trim()) out.createdTo = filters.createdTo.trim();
  if (filters.updatedFrom.trim()) out.updatedFrom = filters.updatedFrom.trim();
  if (filters.updatedTo.trim()) out.updatedTo = filters.updatedTo.trim();
  if (filters.formStatus !== "all") out.formStatus = filters.formStatus;
  if (filters.accountStatus !== "all") out.accountStatus = filters.accountStatus;
  return out;
}

export function customersListFiltersToQueryParams(filters: CustomersListFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const search = filters.search.trim();
  if (search) out.search = search;
  if (filters.createdFrom.trim()) out.createdFrom = filters.createdFrom.trim();
  if (filters.createdTo.trim()) out.createdTo = filters.createdTo.trim();
  if (filters.updatedFrom.trim()) out.updatedFrom = filters.updatedFrom.trim();
  if (filters.updatedTo.trim()) out.updatedTo = filters.updatedTo.trim();
  if (filters.formStatus !== "all") out.formStatus = filters.formStatus;
  if (filters.accountStatus !== "all") out.accountStatus = filters.accountStatus;
  return out;
}

export function hasActiveCustomersListFilters(filters: CustomersListFilters): boolean {
  return Object.keys(customersListFiltersToQueryParams(filters)).length > 0;
}

export function customersListFiltersExportSearchParams(filters: CustomersListFilters): string {
  const params = new URLSearchParams(customersListFiltersToQueryParams(filters));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
