import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CustomerAccountStatus } from "../types/api";

export type CustomerSelectOption = {
  id: string;
  name: string;
  accountStatus?: CustomerAccountStatus;
};

type SingleProps = {
  multiple?: false;
  customers: CustomerSelectOption[];
  value: string;
  onChange: (customerId: string) => void;
  label?: string;
  placeholder?: string;
  /** When true, user can clear selection (value becomes `""`). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  id?: string;
  getOptionLabel?: (customer: CustomerSelectOption) => string;
  className?: string;
};

type MultiProps = {
  multiple: true;
  customers: CustomerSelectOption[];
  value: string[];
  onChange: (customerIds: string[]) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "small" | "medium";
  id?: string;
  getOptionLabel?: (customer: CustomerSelectOption) => string;
  className?: string;
};

type Props = SingleProps | MultiProps;

function defaultLabel(customer: CustomerSelectOption): string {
  return customer.name.trim() || customer.id;
}

function sortedCustomers(
  customers: CustomerSelectOption[],
  getOptionLabel: (customer: CustomerSelectOption) => string,
): CustomerSelectOption[] {
  return [...customers].sort((a, b) =>
    getOptionLabel(a).localeCompare(getOptionLabel(b), undefined, { sensitivity: "base" }),
  );
}

function useCustomerFilter(getOptionLabel: (customer: CustomerSelectOption) => string) {
  return useMemo(
    () =>
      createFilterOptions<CustomerSelectOption>({
        limit: 80,
        stringify: (option) => getOptionLabel(option),
        ignoreCase: true,
        trim: true,
        matchFrom: "any",
      }),
    [getOptionLabel],
  );
}

export function SearchableCustomerSelect(props: Props) {
  if (props.multiple) {
    return <SearchableCustomerMultiSelect {...props} />;
  }
  return <SearchableCustomerSingleSelect {...props} />;
}

function SearchableCustomerMultiSelect({
  customers,
  value,
  onChange,
  label,
  placeholder = "Search customers…",
  disabled = false,
  size = "medium",
  id,
  getOptionLabel = defaultLabel,
  className,
}: MultiProps) {
  const sorted = useMemo(
    () => sortedCustomers(customers, getOptionLabel),
    [customers, getOptionLabel],
  );
  const filterOptions = useCustomerFilter(getOptionLabel);

  const selected = useMemo(
    () => sorted.filter((c) => value.includes(c.id)),
    [sorted, value],
  );

  return (
    <Autocomplete
      id={id}
      className={className}
      multiple
      fullWidth
      size={size}
      disabled={disabled}
      options={sorted}
      value={selected}
      onChange={(_, options) => onChange(options.map((o) => o.id))}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={filterOptions}
      filterSelectedOptions
      autoHighlight
      openOnFocus
      noOptionsText="No matching customers"
      slotProps={{
        popper: { sx: { zIndex: (theme) => theme.zIndex.modal + 2 } },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={sorted.length ? placeholder : "No customers"}
        />
      )}
    />
  );
}

function SearchableCustomerSingleSelect({
  customers,
  value,
  onChange,
  label,
  placeholder,
  allowEmpty = false,
  emptyLabel = "All customers",
  required = false,
  disabled = false,
  size = "medium",
  id,
  getOptionLabel = defaultLabel,
  className,
}: SingleProps) {
  const sorted = useMemo(
    () => sortedCustomers(customers, getOptionLabel),
    [customers, getOptionLabel],
  );
  const filterOptions = useCustomerFilter(getOptionLabel);

  const selected = useMemo(
    () => sorted.find((c) => c.id === value) ?? null,
    [sorted, value],
  );

  const [inputValue, setInputValue] = useState("");
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    if (!value) {
      setInputValue("");
      return;
    }
    const found = sorted.find((c) => c.id === value);
    setInputValue(found ? getOptionLabel(found) : "");
  }, [value, sorted, getOptionLabel]);

  return (
    <Autocomplete
      id={id}
      className={className}
      fullWidth
      size={size}
      disabled={disabled}
      options={sorted}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_, newInput, reason) => {
        if (reason === "input") {
          setInputValue(newInput);
          if (allowEmpty && value) {
            const found = sorted.find((c) => c.id === value);
            if (found && newInput !== getOptionLabel(found)) {
              onChange("");
            }
          }
          return;
        }
        if (reason === "clear") {
          setInputValue("");
          onChange("");
          return;
        }
        if (reason === "reset") {
          if (!value) {
            setInputValue("");
            return;
          }
          const found = sorted.find((c) => c.id === value);
          setInputValue(found ? getOptionLabel(found) : "");
        }
      }}
      onChange={(_, option) => {
        onChange(option?.id ?? "");
        setInputValue(option ? getOptionLabel(option) : "");
      }}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={filterOptions}
      disableClearable={!allowEmpty && required}
      clearOnBlur={false}
      autoHighlight
      openOnFocus
      handleHomeEndKeys
      noOptionsText="No matching customers"
      slotProps={{
        popper: { sx: { zIndex: (theme) => theme.zIndex.modal + 2 } },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={
            placeholder ??
            (allowEmpty && !value ? emptyLabel : sorted.length ? "Search customers…" : "No customers")
          }
          required={required}
        />
      )}
    />
  );
}
