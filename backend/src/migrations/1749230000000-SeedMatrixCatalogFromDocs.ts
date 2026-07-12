import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent catalogue seed aligned with `docs/*.json`.
 *
 * ## What is written (DB)
 * 1. **customer_type** — Solo, Partnership, Limited Company (`docs/customer_type.json` ids).
 * 2. **plans** — All rows from `docs/plans.json` (same UUIDs) plus one placeholder for `4c6b0538-…` so pricing FKs resolve.
 *    Display names for the live monthly trio: **Proactive monthly**, **Growth monthly**, **Essential monthly**.
 * 3. **plan_customer_type** — Each of the three plans × all three customer types (full matrix).
 * 4. **services** — Full `docs/services.json` catalogue (incl. `is_included`).
 * 5. **plan_service** — Links from `docs/plan_service.json` (only rows for the three plan ids above).
 * 6. **plan_rules** — Subset of `docs/plan_rules.json` for those three plans only (other plan_ids in JSON are skipped).
 * 7. **plan_limit** — Subset of `docs/plan_limit.json` for those three plans.
 * 8. **plan_pricing_matrix** — Full `docs/plan_pricing_matrix.json` (all turnover bands). Requires every `plan_id`
 *    in that file to exist in `plans` first, so this migration also upserts the remaining rows from `docs/plans.json`
 *    plus a placeholder row for `4c6b0538-1901-4177-8cf0-fba9ee9caec2` (referenced in pricing but absent from plans.json).
 *    Rows for those plan ids are deleted then re-inserted (idempotent).
 *
 * ## What users / APIs typically “see”
 * - Plan names **Proactive monthly**, **Growth monthly**, **Essential monthly** wherever `plans.name` is shown.
 * - Subscription / matrix flows that filter **active** plans and join **plan_customer_type** will offer these three for each customer type.
 * - **plan_pricing_matrix** drives turnover-band pricing; **plan_rules** extendable / increment pricing; **plan_limit** free payroll counts.
 * - Included features come from **plan_service** → **services**.
 *
 * Source JSON files under `docs/` should be kept in sync if you change catalogue data and re-run a similar migration later.
 */

const PLAN_IDS = {
  proactive: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b",
  growth: "2d4b4e72-669a-43f0-9522-7789351fa8ed",
  essential: "bd15d219-74d5-4143-838b-acf6090aea2f",
} as const;

const THREE_PLAN_IDS: readonly string[] = [PLAN_IDS.proactive, PLAN_IDS.growth, PLAN_IDS.essential];

/** Referenced in `docs/plan_pricing_matrix.json` but not listed in `docs/plans.json`. */
const ORPHAN_PRICING_PLAN_ID = "4c6b0538-1901-4177-8cf0-fba9ee9caec2";

/** Every `plan_id` that appears in `docs/plan_pricing_matrix.json` (used for delete + FK coverage). */
const PRICING_MATRIX_PLAN_IDS: readonly string[] = [
  ORPHAN_PRICING_PLAN_ID,
  "bd15d219-74d5-4143-838b-acf6090aea2f",
  "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b",
  "e09316b6-a290-40b6-b88b-e1d4c1bf8c99",
  "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d",
  "2d4b4e72-669a-43f0-9522-7789351fa8ed",
  "3249b3b5-c7d6-4347-b4af-f09e325c9fbc",
  "93541dca-12b7-4c2d-8616-cfafbdc613ec",
];

type CustomerTypeRow = { id: string; name: string };
type PlanRow = { id: string; name: string; billingCycle: string; maxTurnover: number | null; isActive: boolean };
type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
};
type PlanServiceRow = { id: string; planId: string; serviceId: string; isIncluded: boolean };
type PlanRuleRow = { id: string; planId: string; extendable: boolean; incrementStep: number; incrementCost: number };
type PlanLimitRow = { id: string; planId: string; freePayrollLimit: number };
type PricingRow = { id: string; planId: string; turnoverMin: number; turnoverMax: number | null; price: number };

const CUSTOMER_TYPES: readonly CustomerTypeRow[] = [
  { id: "c0000001-0000-4000-8000-000000000001", name: "Solo" },
  { id: "c0000001-0000-4000-8000-000000000002", name: "Partnership" },
  { id: "c0000001-0000-4000-8000-000000000003", name: "Limited Company" },
];

/** All `plans` rows required by `docs/plan_pricing_matrix.json` FKs, plus primary monthly display names. */
const CATALOG_PLANS: readonly PlanRow[] = [
  {
    id: PLAN_IDS.growth,
    name: "Growth monthly",
    billingCycle: "monthly",
    maxTurnover: null,
    isActive: true,
  },
  {
    id: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc",
    name: "Yearly Solo/Partner  Subscription",
    billingCycle: "yearly",
    maxTurnover: null,
    isActive: false,
  },
  {
    id: PLAN_IDS.proactive,
    name: "Proactive monthly",
    billingCycle: "monthly",
    maxTurnover: null,
    isActive: true,
  },
  {
    id: "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d",
    name: "Growth",
    billingCycle: "monthly",
    maxTurnover: null,
    isActive: false,
  },
  {
    id: "93541dca-12b7-4c2d-8616-cfafbdc613ec",
    name: "Limited Annual Subscription",
    billingCycle: "yearly",
    maxTurnover: null,
    isActive: false,
  },
  {
    id: PLAN_IDS.essential,
    name: "Essential monthly",
    billingCycle: "monthly",
    maxTurnover: 550000,
    isActive: true,
  },
  {
    id: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99",
    name: "test",
    billingCycle: "yearly",
    maxTurnover: 1000,
    isActive: false,
  },
  {
    id: ORPHAN_PRICING_PLAN_ID,
    name: "Matrix catalogue (turnover tier)",
    billingCycle: "monthly",
    maxTurnover: null,
    isActive: false,
  },
];

const SERVICES: readonly ServiceRow[] = [
  {
    id: "043b54ae-b955-4202-8bf6-51577a4cdafe",
    name: "Confirmation Statement Filing",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "360fca74-5784-49b5-bf04-2e38e1a7c871",
    name: "dormant",
    description: null,
    price: 150,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "6258df12-f46d-4ac5-ab9d-d32e11470baf",
    name: "1 Personal Tax Return",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a",
    name: "Annual Accounts Preparation",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "6f9275c4-80cf-4e45-a7af-51bc613b0001",
    name: "VAT & PAYE Registration",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "9eca5d85-c500-4e7f-b4bf-cb8aae793142",
    name: "Basic Email Support",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "bea1be28-4ff1-4122-b181-db9e1f42abb5",
    name: "Corporation Tax Return (CT600)",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "ce56ba7f-93ff-42e3-9945-786111a1645d",
    name: "Quarterly Bookkeeping",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "f1d410eb-ea61-4669-8cf5-0d66ec3646a4",
    name: "Auto-Enrolment Support",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "f3806833-e834-4af2-ae28-b4771e777976",
    name: "Quarterly Financial Update Call",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
  {
    id: "f5a3b2ac-ab67-4962-896b-97dd470a6904",
    name: "Clear Accounts Summary With Full Commentary",
    description: null,
    price: 0,
    isActive: true,
    isIncluded: true,
  },
];

const PLAN_SERVICES: readonly PlanServiceRow[] = [
  { id: "145c88a7-2939-44c1-81ec-93d969bab003", planId: PLAN_IDS.growth, serviceId: "f1d410eb-ea61-4669-8cf5-0d66ec3646a4", isIncluded: true },
  { id: "2501f624-7bfa-4dae-99b5-9dceb9170f38", planId: PLAN_IDS.proactive, serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
  { id: "2c1bdc57-2e37-4504-a8a3-83e3ef70e06f", planId: PLAN_IDS.proactive, serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
  { id: "36a79c89-ab77-49f3-9fe2-d06676cc3937", planId: PLAN_IDS.growth, serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
  { id: "3d8305c8-f109-48d1-8d03-114f24ffbfc3", planId: PLAN_IDS.proactive, serviceId: "f1d410eb-ea61-4669-8cf5-0d66ec3646a4", isIncluded: true },
  { id: "4232c108-65ab-40ee-b3ce-12fd1bdb8b44", planId: PLAN_IDS.essential, serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
  { id: "57460fa8-4d86-4038-a48a-30efc5ebe453", planId: PLAN_IDS.growth, serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
  { id: "6268d0b0-e126-4f11-98f4-c5bff48f7e92", planId: PLAN_IDS.growth, serviceId: "6258df12-f46d-4ac5-ab9d-d32e11470baf", isIncluded: true },
  { id: "69506c63-d2c7-4497-bb3f-2d5472ba0203", planId: PLAN_IDS.proactive, serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
  { id: "6d7296f5-19aa-4d1d-9764-a7a515953eaa", planId: PLAN_IDS.proactive, serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
  { id: "6ebd5d8a-0c6d-4702-8faa-5e28fc5d1fff", planId: PLAN_IDS.essential, serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
  { id: "7298ae6c-797e-47a1-baa0-c3c4c41e31f6", planId: PLAN_IDS.proactive, serviceId: "f3806833-e834-4af2-ae28-b4771e777976", isIncluded: true },
  { id: "72d1c9da-db85-4b1e-9ed0-6dbdf175dcfa", planId: PLAN_IDS.essential, serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
  { id: "7bdfe625-35c9-4e62-9900-9458504fc823", planId: PLAN_IDS.growth, serviceId: "6f9275c4-80cf-4e45-a7af-51bc613b0001", isIncluded: true },
  { id: "8249d102-d3c7-4ff0-befc-9acf29c6a14e", planId: PLAN_IDS.proactive, serviceId: "6258df12-f46d-4ac5-ab9d-d32e11470baf", isIncluded: true },
  { id: "895321aa-f932-4a12-b8ad-094f84786185", planId: PLAN_IDS.growth, serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
  { id: "9010ab39-b345-4ac2-9585-6fff72cfef12", planId: PLAN_IDS.proactive, serviceId: "ce56ba7f-93ff-42e3-9945-786111a1645d", isIncluded: true },
  { id: "985ce1ea-dda7-4315-8cfb-b597d2f1b0a0", planId: PLAN_IDS.proactive, serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
  { id: "9a27e96d-429d-4a08-85af-7aec299b8109", planId: PLAN_IDS.essential, serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
  { id: "a5163c4c-5eb4-46a0-b6f7-19e1ed8634bd", planId: PLAN_IDS.proactive, serviceId: "6f9275c4-80cf-4e45-a7af-51bc613b0001", isIncluded: true },
  { id: "cdc570e0-cd06-490a-9818-229c94de3f6a", planId: PLAN_IDS.growth, serviceId: "ce56ba7f-93ff-42e3-9945-786111a1645d", isIncluded: true },
  { id: "d307861a-378f-4b23-ab5a-30b2d944ae14", planId: PLAN_IDS.essential, serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
  { id: "db2eab07-5634-42f8-9ab1-b506b7bd0127", planId: PLAN_IDS.growth, serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
  { id: "e398fdb1-9bb0-4850-a9b1-1905e96f9026", planId: PLAN_IDS.growth, serviceId: "f3806833-e834-4af2-ae28-b4771e777976", isIncluded: true },
  { id: "f594510e-ba44-477f-900f-fc285e1acd53", planId: PLAN_IDS.growth, serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
];

/** Full `docs/plan_rules.json` (one row per plan_id). */
const PLAN_RULES: readonly PlanRuleRow[] = [
  { id: "0c5f530e-1907-4f6f-94be-cf1c1574cacc", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", extendable: false, incrementStep: 0, incrementCost: 0 },
  { id: "1be61506-70e5-4dfe-b544-bf76aff14489", planId: PLAN_IDS.growth, extendable: true, incrementStep: 10000, incrementCost: 10 },
  { id: "342a200d-3a46-4fed-8b9c-bd368d4c71a9", planId: PLAN_IDS.proactive, extendable: true, incrementStep: 100000, incrementCost: 10 },
  { id: "97e8a8bf-82d6-4f59-b31c-5977c0ec80b3", planId: "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d", extendable: true, incrementStep: 10000, incrementCost: 0 },
  { id: "bb128569-2c99-47a0-b5d6-72734aa90812", planId: PLAN_IDS.essential, extendable: false, incrementStep: 0, incrementCost: 0 },
  { id: "bc7e87bb-6c17-4773-8b35-93c4c9a10348", planId: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99", extendable: true, incrementStep: 10000, incrementCost: 10 },
  { id: "cfad6b61-f90f-4a83-b8a0-8f3a626b6da8", planId: ORPHAN_PRICING_PLAN_ID, extendable: true, incrementStep: 10000, incrementCost: 10 },
  { id: "d8155496-23b7-4a70-b8b6-69351d3bd456", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", extendable: true, incrementStep: 100000, incrementCost: 100 },
];

/** Full `docs/plan_limit.json`. */
const PLAN_LIMITS: readonly PlanLimitRow[] = [
  { id: "5110a630-2478-4b91-a6d2-699abb8cd2b0", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", freePayrollLimit: 0 },
  { id: "4c27c8c1-63e5-42e8-846c-c08432641912", planId: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99", freePayrollLimit: 5 },
  { id: "2cce3e4b-a925-4b42-8470-01234b2afb5f", planId: PLAN_IDS.proactive, freePayrollLimit: 8 },
  { id: "6af2a05d-a932-4c7b-9633-7e563f34792f", planId: "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d", freePayrollLimit: 0 },
  { id: "cad7b82b-078b-45e7-b95b-42d77063650b", planId: PLAN_IDS.essential, freePayrollLimit: 0 },
  { id: "5698e864-b47b-4031-a65c-fcd8be6c1553", planId: PLAN_IDS.growth, freePayrollLimit: 5 },
  { id: "66172f01-b1d2-4d1c-8188-f23535eac3c5", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", freePayrollLimit: 0 },
  { id: "f7e7f7e0-d4de-4364-bc34-7b87a55e4076", planId: ORPHAN_PRICING_PLAN_ID, freePayrollLimit: 5 },
];

/** Full `docs/plan_pricing_matrix.json` (all rows; matches file in repo). */
const PLAN_PRICING: readonly PricingRow[] = [
  { id: "02c60f01-44cf-452a-b335-3bef100589ec", planId: ORPHAN_PRICING_PLAN_ID, turnoverMin: 50001, turnoverMax: null, price: 99 },
  { id: "03a99cfa-aa8b-451a-a8d1-2b0caa1adf4a", planId: ORPHAN_PRICING_PLAN_ID, turnoverMin: 0, turnoverMax: 50000, price: 49 },
  { id: "0e938937-5012-404a-a8c3-8ba969a24ea9", planId: PLAN_IDS.essential, turnoverMin: 250001, turnoverMax: 350000, price: 115 },
  { id: "1a98f23c-0b80-4e17-a7c1-c5a7ae0be65a", planId: PLAN_IDS.proactive, turnoverMin: 350001, turnoverMax: 450000, price: 320 },
  { id: "25224559-4546-4695-9af4-dbf30120e9b7", planId: PLAN_IDS.proactive, turnoverMin: 0, turnoverMax: 250000, price: 300 },
  { id: "264e3f1b-3922-493b-8645-7ce53366e964", planId: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99", turnoverMin: 50, turnoverMax: 100, price: 99 },
  { id: "321bcdca-aebf-4e07-b2f1-f4ee1f9977ec", planId: PLAN_IDS.proactive, turnoverMin: 250001, turnoverMax: 350000, price: 310 },
  { id: "382c620b-f4e6-46d6-9f2c-7a4fe5c877cb", planId: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99", turnoverMin: 100, turnoverMax: 1000, price: 150 },
  { id: "3c8f0ec3-025e-4989-a46d-38413344a264", planId: "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d", turnoverMin: 0, turnoverMax: 50000, price: 49 },
  { id: "41010284-5865-463a-a468-76aedc482cf0", planId: PLAN_IDS.essential, turnoverMin: 0, turnoverMax: 250000, price: 100 },
  { id: "422655b0-b0be-4359-8cff-4fb210fe6551", planId: PLAN_IDS.essential, turnoverMin: 350001, turnoverMax: 450000, price: 130 },
  { id: "441395b9-3b87-4808-9b51-9149e255dc3b", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", turnoverMin: 250001, turnoverMax: 350000, price: 265 },
  { id: "4f0cbb52-ad73-489e-a117-c4bf3de61a27", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 450001, turnoverMax: 550000, price: 600 },
  { id: "5455a4e1-6657-4a64-9efc-1648625b0e6a", planId: PLAN_IDS.proactive, turnoverMin: 450001, turnoverMax: 550000, price: 330 },
  { id: "55dbe573-0011-4539-9173-493fb3eebdc9", planId: PLAN_IDS.growth, turnoverMin: 450001, turnoverMax: 550000, price: 180 },
  { id: "5a13d8ab-ba6b-4be7-b020-be7d46887c58", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 350001, turnoverMax: 450000, price: 500 },
  { id: "81986558-37c8-4ab7-bd7d-13acc465a820", planId: PLAN_IDS.growth, turnoverMin: 250001, turnoverMax: 350000, price: 160 },
  { id: "8606a70a-4b30-4d8c-a3af-63cfa9f2f988", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", turnoverMin: 0, turnoverMax: 250000, price: 250 },
  { id: "966ec345-04d9-4588-afdd-4835ba3f0a79", planId: PLAN_IDS.growth, turnoverMin: 550001, turnoverMax: 650000, price: 190 },
  { id: "988e770f-0b01-4aee-aad8-2863ccb74a9d", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 550001, turnoverMax: 650000, price: 700 },
  { id: "a19560bb-fd12-4f6a-bb90-baf1a1de7625", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 0, turnoverMax: 250000, price: 300 },
  { id: "a9920a42-43ee-468d-aef1-d9c207a47510", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 650001, turnoverMax: 750000, price: 800 },
  { id: "ab0f6c27-513d-456c-8e43-d22538dde855", planId: "6d87a7dd-5f1e-43b8-ab0e-cbd28cdafd9d", turnoverMin: 50001, turnoverMax: null, price: 99 },
  { id: "b0732940-c309-42f4-beeb-ac1c1acc55e9", planId: PLAN_IDS.growth, turnoverMin: 350001, turnoverMax: 450000, price: 170 },
  { id: "b4bf50d6-d184-418d-9ba3-37102901f4bc", planId: "e09316b6-a290-40b6-b88b-e1d4c1bf8c99", turnoverMin: 0, turnoverMax: 50, price: 49 },
  { id: "bf0a6928-85c4-42a6-b403-df188622b129", planId: PLAN_IDS.essential, turnoverMin: 450001, turnoverMax: 550000, price: 150 },
  { id: "c0f2c6cc-c2fb-4aca-80ac-90c7e9973d3d", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", turnoverMin: 350001, turnoverMax: 450000, price: 280 },
  { id: "c148b161-95e6-4861-aa8d-10a78441a1ea", planId: "3249b3b5-c7d6-4347-b4af-f09e325c9fbc", turnoverMin: 450001, turnoverMax: 550000, price: 300 },
  { id: "c3afeb24-d22a-47a9-9b81-99825bcb4621", planId: "93541dca-12b7-4c2d-8616-cfafbdc613ec", turnoverMin: 250001, turnoverMax: 350000, price: 400 },
  { id: "cb886855-e537-4d96-86aa-d8f41224ec0e", planId: PLAN_IDS.proactive, turnoverMin: 650001, turnoverMax: 750000, price: 350 },
  { id: "e5c876f9-5f93-42ce-b5b6-a2090fda3c85", planId: PLAN_IDS.growth, turnoverMin: 650001, turnoverMax: 750000, price: 200 },
  { id: "f54cb74b-01f0-4e67-bb08-411c447bd01f", planId: PLAN_IDS.growth, turnoverMin: 0, turnoverMax: 250000, price: 150 },
  { id: "faf8c281-ed58-4fce-90ea-537a6dafb142", planId: PLAN_IDS.proactive, turnoverMin: 550001, turnoverMax: 650000, price: 340 },
];

export class SeedMatrixCatalogFromDocs1749230000000 implements MigrationInterface {
  name = "SeedMatrixCatalogFromDocs1749230000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("customer_type"))) return;
    if (!(await queryRunner.hasTable("plans"))) return;

    for (const ct of CUSTOMER_TYPES) {
      await queryRunner.query(
        `
          INSERT INTO "customer_type" ("id", "name")
          VALUES ($1, $2)
          ON CONFLICT ("id")
          DO UPDATE SET "name" = EXCLUDED."name"
        `,
        [ct.id, ct.name],
      );
    }

    for (const p of CATALOG_PLANS) {
      await queryRunner.query(
        `
          INSERT INTO "plans" ("id", "name", "billing_cycle", "max_turnover", "is_active")
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("id")
          DO UPDATE SET
            "name" = EXCLUDED."name",
            "billing_cycle" = EXCLUDED."billing_cycle",
            "max_turnover" = EXCLUDED."max_turnover",
            "is_active" = EXCLUDED."is_active"
        `,
        [p.id, p.name, p.billingCycle, p.maxTurnover, p.isActive],
      );
    }

    if (await queryRunner.hasTable("plan_pricing_matrix")) {
      await queryRunner.query(`DELETE FROM "plan_pricing_matrix" WHERE "plan_id" = ANY($1::uuid[])`, [
        PRICING_MATRIX_PLAN_IDS,
      ]);
      for (const row of PLAN_PRICING) {
        await queryRunner.query(
          `
            INSERT INTO "plan_pricing_matrix" ("id", "plan_id", "turnover_min", "turnover_max", "price")
            VALUES ($1, $2, $3, $4, $5)
          `,
          [row.id, row.planId, row.turnoverMin, row.turnoverMax, row.price],
        );
      }
    }

    if (await queryRunner.hasTable("plan_customer_type")) {
      await queryRunner.query(
        `DELETE FROM "plan_customer_type" WHERE "plan_id" = ANY($1::uuid[])`,
        [THREE_PLAN_IDS],
      );
      for (const planId of THREE_PLAN_IDS) {
        for (const ct of CUSTOMER_TYPES) {
          await queryRunner.query(
            `
              INSERT INTO "plan_customer_type" ("plan_id", "customer_type_id")
              VALUES ($1, $2)
              ON CONFLICT ("plan_id", "customer_type_id") DO NOTHING
            `,
            [planId, ct.id],
          );
        }
      }
    }

    if (await queryRunner.hasTable("services")) {
      for (const s of SERVICES) {
        await queryRunner.query(
          `
            INSERT INTO "services" ("id", "name", "description", "price", "is_active", "is_included")
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ("id")
            DO UPDATE SET
              "name" = EXCLUDED."name",
              "description" = EXCLUDED."description",
              "price" = EXCLUDED."price",
              "is_active" = EXCLUDED."is_active",
              "is_included" = EXCLUDED."is_included"
          `,
          [s.id, s.name, s.description, s.price, s.isActive, s.isIncluded],
        );
      }
    }

    if (await queryRunner.hasTable("plan_service")) {
      await queryRunner.query(`DELETE FROM "plan_service" WHERE "plan_id" = ANY($1::uuid[])`, [THREE_PLAN_IDS]);
      for (const link of PLAN_SERVICES) {
        await queryRunner.query(
          `
            INSERT INTO "plan_service" ("id", "plan_id", "service_id", "is_included")
            VALUES ($1, $2, $3, $4)
            ON CONFLICT ("plan_id", "service_id")
            DO UPDATE SET "is_included" = EXCLUDED."is_included"
          `,
          [link.id, link.planId, link.serviceId, link.isIncluded],
        );
      }
    }

    if (await queryRunner.hasTable("plan_rules")) {
      await queryRunner.query(`DELETE FROM "plan_rules" WHERE "plan_id" = ANY($1::uuid[])`, [
        PRICING_MATRIX_PLAN_IDS,
      ]);
      for (const r of PLAN_RULES) {
        await queryRunner.query(
          `
            INSERT INTO "plan_rules" ("id", "plan_id", "extendable", "increment_step", "increment_cost")
            VALUES ($1, $2, $3, $4, $5)
          `,
          [r.id, r.planId, r.extendable, r.incrementStep, r.incrementCost],
        );
      }
    }

    if (await queryRunner.hasTable("plan_limit")) {
      await queryRunner.query(`DELETE FROM "plan_limit" WHERE "plan_id" = ANY($1::uuid[])`, [PRICING_MATRIX_PLAN_IDS]);
      for (const l of PLAN_LIMITS) {
        await queryRunner.query(
          `
            INSERT INTO "plan_limit" ("id", "plan_id", "free_payroll_limit")
            VALUES ($1, $2, $3)
          `,
          [l.id, l.planId, l.freePayrollLimit],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // No-op: catalogue seed; keep data intact on rollback.
  }
}
