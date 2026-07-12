import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import type { CustomersListFilters } from "../utils/customersListFilters";
import { DatePickerField } from "./DatePickerField";

type Props = {
  filters: CustomersListFilters;
  onChange: (filters: CustomersListFilters) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Hide search — when the list page search box owns name filtering. */
  hideSearch?: boolean;
  /** Drop outer border/padding when nested in the customers card toolbar. */
  embedded?: boolean;
};

type DateFilterFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function DateFilterField({ label, value, onChange, disabled = false }: DateFilterFieldProps) {
  return (
    <Box>
      <Typography
        component="label"
        variant="caption"
        color="text.secondary"
        sx={{ mb: 0.75, display: "block", fontWeight: 600, fontSize: "0.75rem" }}
      >
        {label}
      </Typography>
      <DatePickerField
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </Box>
  );
}

export function CustomersListFiltersPanel({
  filters,
  onChange,
  onClear,
  disabled = false,
  hideSearch = false,
  embedded = false,
}: Props) {
  const patch = (partial: Partial<CustomersListFilters>) => onChange({ ...filters, ...partial });

  return (
    <Box
      sx={
        embedded
          ? { pt: 0.5 }
          : {
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.paper",
              p: 2,
            }
      }
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Filters
        </Typography>
        <Button size="small" onClick={onClear} disabled={disabled} sx={{ fontWeight: 600, minWidth: 0 }}>
          Clear filters
        </Button>
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
            xl: "repeat(4, minmax(0, 1fr))",
          },
        }}
      >
        {!hideSearch ? (
          <TextField
            size="small"
            label="Search by client name"
            placeholder="Substring match on name"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            disabled={disabled}
            sx={{ gridColumn: { sm: "span 2", lg: "span 3", xl: "span 4" } }}
          />
        ) : null}
        <FormControl size="small" fullWidth>
          <InputLabel id="customers-filter-status">Account status</InputLabel>
          <Select
            labelId="customers-filter-status"
            label="Account status"
            value={filters.accountStatus}
            onChange={(e: SelectChangeEvent) =>
              patch({ accountStatus: e.target.value as CustomersListFilters["accountStatus"] })
            }
            disabled={disabled}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="proposed">Proposed</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel id="customers-filter-form">Onboarding form</InputLabel>
          <Select
            labelId="customers-filter-form"
            label="Onboarding form"
            value={filters.formStatus}
            onChange={(e: SelectChangeEvent) =>
              patch({ formStatus: e.target.value as CustomersListFilters["formStatus"] })
            }
            disabled={disabled}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">In progress (draft)</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </Select>
        </FormControl>
        <DateFilterField
          label="Created from"
          value={filters.createdFrom}
          onChange={(v) => patch({ createdFrom: v })}
          disabled={disabled}
        />
        <DateFilterField
          label="Created to"
          value={filters.createdTo}
          onChange={(v) => patch({ createdTo: v })}
          disabled={disabled}
        />
        <DateFilterField
          label="Updated from"
          value={filters.updatedFrom}
          onChange={(v) => patch({ updatedFrom: v })}
          disabled={disabled}
        />
        <DateFilterField
          label="Updated to"
          value={filters.updatedTo}
          onChange={(v) => patch({ updatedTo: v })}
          disabled={disabled}
        />
      </Box>
    </Box>
  );
}
