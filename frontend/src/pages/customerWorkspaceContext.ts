import type { Customer } from "../types/api";

export type CustomerWorkspaceOutletContext = {
  customer: Customer | null;
  loading: boolean;
  err: string;
  reload: () => Promise<void>;
};
