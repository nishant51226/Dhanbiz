/**
 * Tenant boundary for multi-tenant data and future Postgres Row Level Security (RLS).
 *
 * In product terms, **company** corresponds to the **`Customer`** row (`customers.id`),
 * exposed everywhere as **`customerId`**. Jobs, files, and any nested JSON stored on jobs
 * must remain filterable by this id so RLS policies (or app-layer guards) can enforce isolation.
 *
 * When adding extraction pipelines (`Job.result` segments, financial documents, HITL overrides):
 * - Keep **`Job.customerId`** as the source of truth; join or embed it at the root of result
 *   JSON if denormalization helps policy checks.
 * - Do not persist tenant-scoped rows without **`customer_id`** / **`customerId`**.
 *
 * If you later introduce a dedicated **`companies`** table, migrate this key or add
 * **`company_id`** as the RLS discriminator while keeping backward-compatible APIs.
 */
export type TenantId = string;
