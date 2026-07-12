import { getGridDateOperators, type GridFilterOperator } from "@mui/x-data-grid";
import { GridFilterDateInput } from "../components/admin/GridFilterDateInput";

/** Date / dateTime column filters with DD/MM/YYYY picker (not browser locale). */
export function gridDateColumnFilterOperators(isDateTime = false): GridFilterOperator[] {
  return getGridDateOperators(isDateTime).map((operator) => ({
    ...operator,
    InputComponent: GridFilterDateInput,
  }));
}
