import type { MigrationInterface, QueryRunner } from "typeorm";

type PlanSeed = {
  id: string;
  name: string;
  billingCycle: "monthly" | "yearly";
  maxTurnover: number | null;
  isActive: boolean;
};

type ServiceSeed = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
};

type PlanServiceSeed = {
  id: string;
  planId: string;
  serviceId: string;
  isIncluded: boolean;
};

/**
 * Seeds active matrix plans + catalogue services + plan_service links
 * from docs/plans.json, docs/services.json and docs/plan_service.json.
 *
 * Scope:
 * - Plans: only active monthly plans (Growth, Essential, Proactive)
 * - plan_service: only links belonging to the active plan ids above
 */
export class SeedActivePlansServices1749210000000 implements MigrationInterface {
  name = "SeedActivePlansServices1749210000000";

  private readonly activePlans: readonly PlanSeed[] = [
    {
      id: "2d4b4e72-669a-43f0-9522-7789351fa8ed",
      name: "Growth",
      billingCycle: "monthly",
      maxTurnover: null,
      isActive: true,
    },
    {
      id: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b",
      name: "Proactive",
      billingCycle: "monthly",
      maxTurnover: null,
      isActive: true,
    },
    {
      id: "bd15d219-74d5-4143-838b-acf6090aea2f",
      name: "Essential",
      billingCycle: "monthly",
      maxTurnover: 550000,
      isActive: true,
    },
  ];

  private readonly services: readonly ServiceSeed[] = [
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

  private readonly planServices: readonly PlanServiceSeed[] = [
    { id: "145c88a7-2939-44c1-81ec-93d969bab003", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "f1d410eb-ea61-4669-8cf5-0d66ec3646a4", isIncluded: true },
    { id: "2501f624-7bfa-4dae-99b5-9dceb9170f38", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
    { id: "2c1bdc57-2e37-4504-a8a3-83e3ef70e06f", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
    { id: "36a79c89-ab77-49f3-9fe2-d06676cc3937", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
    { id: "3d8305c8-f109-48d1-8d03-114f24ffbfc3", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "f1d410eb-ea61-4669-8cf5-0d66ec3646a4", isIncluded: true },
    { id: "4232c108-65ab-40ee-b3ce-12fd1bdb8b44", planId: "bd15d219-74d5-4143-838b-acf6090aea2f", serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
    { id: "57460fa8-4d86-4038-a48a-30efc5ebe453", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
    { id: "6268d0b0-e126-4f11-98f4-c5bff48f7e92", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "6258df12-f46d-4ac5-ab9d-d32e11470baf", isIncluded: true },
    { id: "69506c63-d2c7-4497-bb3f-2d5472ba0203", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
    { id: "6d7296f5-19aa-4d1d-9764-a7a515953eaa", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
    { id: "6ebd5d8a-0c6d-4702-8faa-5e28fc5d1fff", planId: "bd15d219-74d5-4143-838b-acf6090aea2f", serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
    { id: "7298ae6c-797e-47a1-baa0-c3c4c41e31f6", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "f3806833-e834-4af2-ae28-b4771e777976", isIncluded: true },
    { id: "72d1c9da-db85-4b1e-9ed0-6dbdf175dcfa", planId: "bd15d219-74d5-4143-838b-acf6090aea2f", serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
    { id: "7bdfe625-35c9-4e62-9900-9458504fc823", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "6f9275c4-80cf-4e45-a7af-51bc613b0001", isIncluded: true },
    { id: "8249d102-d3c7-4ff0-befc-9acf29c6a14e", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "6258df12-f46d-4ac5-ab9d-d32e11470baf", isIncluded: true },
    { id: "895321aa-f932-4a12-b8ad-094f84786185", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "043b54ae-b955-4202-8bf6-51577a4cdafe", isIncluded: true },
    { id: "9010ab39-b345-4ac2-9585-6fff72cfef12", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "ce56ba7f-93ff-42e3-9945-786111a1645d", isIncluded: true },
    { id: "985ce1ea-dda7-4315-8cfb-b597d2f1b0a0", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
    { id: "9a27e96d-429d-4a08-85af-7aec299b8109", planId: "bd15d219-74d5-4143-838b-acf6090aea2f", serviceId: "f5a3b2ac-ab67-4962-896b-97dd470a6904", isIncluded: true },
    { id: "a5163c4c-5eb4-46a0-b6f7-19e1ed8634bd", planId: "3b7bcd3b-b6fe-438b-9cda-9dfbdf80b53b", serviceId: "6f9275c4-80cf-4e45-a7af-51bc613b0001", isIncluded: true },
    { id: "cdc570e0-cd06-490a-9818-229c94de3f6a", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "ce56ba7f-93ff-42e3-9945-786111a1645d", isIncluded: true },
    { id: "d307861a-378f-4b23-ab5a-30b2d944ae14", planId: "bd15d219-74d5-4143-838b-acf6090aea2f", serviceId: "bea1be28-4ff1-4122-b181-db9e1f42abb5", isIncluded: true },
    { id: "db2eab07-5634-42f8-9ab1-b506b7bd0127", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "9eca5d85-c500-4e7f-b4bf-cb8aae793142", isIncluded: true },
    { id: "e398fdb1-9bb0-4850-a9b1-1905e96f9026", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "f3806833-e834-4af2-ae28-b4771e777976", isIncluded: true },
    { id: "f594510e-ba44-477f-900f-fc285e1acd53", planId: "2d4b4e72-669a-43f0-9522-7789351fa8ed", serviceId: "6ead3dde-4335-4f01-9409-2f2e8ccbdd7a", isIncluded: true },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("plans"))) return;
    if (!(await queryRunner.hasTable("services"))) return;
    if (!(await queryRunner.hasTable("plan_service"))) return;

    for (const p of this.activePlans) {
      await queryRunner.query(
        `
          INSERT INTO "plans" ("id", "name", "billing_cycle", "max_turnover", "is_active")
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("id")
          DO UPDATE
          SET
            "name" = EXCLUDED."name",
            "billing_cycle" = EXCLUDED."billing_cycle",
            "max_turnover" = EXCLUDED."max_turnover",
            "is_active" = EXCLUDED."is_active"
        `,
        [p.id, p.name, p.billingCycle, p.maxTurnover, p.isActive],
      );
    }

    for (const s of this.services) {
      await queryRunner.query(
        `
          INSERT INTO "services" ("id", "name", "description", "price", "is_active", "is_included")
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT ("id")
          DO UPDATE
          SET
            "name" = EXCLUDED."name",
            "description" = EXCLUDED."description",
            "price" = EXCLUDED."price",
            "is_active" = EXCLUDED."is_active",
            "is_included" = EXCLUDED."is_included"
        `,
        [s.id, s.name, s.description, s.price, s.isActive, s.isIncluded],
      );
    }

    const activePlanIds = new Set(this.activePlans.map((p) => p.id));
    for (const link of this.planServices) {
      if (!activePlanIds.has(link.planId)) continue;
      await queryRunner.query(
        `
          INSERT INTO "plan_service" ("id", "plan_id", "service_id", "is_included")
          VALUES ($1, $2, $3, $4)
          ON CONFLICT ("plan_id", "service_id")
          DO UPDATE
          SET "is_included" = EXCLUDED."is_included"
        `,
        [link.id, link.planId, link.serviceId, link.isIncluded],
      );
    }
  }

  public async down(): Promise<void> {
    // No-op: seed migration; keep data intact on rollback.
  }
}

