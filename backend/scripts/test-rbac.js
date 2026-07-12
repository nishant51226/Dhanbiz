/* eslint-disable no-console */
/**
 * RBAC smoke test for dynamic roles & permissions.
 *
 * Runs read-only schema/migration/RLS checks plus an isolated (rolled-back)
 * functional test of `app.user_has_permission()` permission union across
 * multiple assigned roles.
 *
 * Usage: npm run test:rbac   (requires DATABASE_URL_ADMIN or DATABASE_URL)
 */
const path = require("node:path");
const fs = require("node:fs");

function loadEnv() {
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      require("dotenv").config({ path: p });
      return;
    }
  }
  require("dotenv").config();
}

loadEnv();

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("pg module not found. Run `npm install` in backend/ first.");
  process.exit(1);
}

const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // ---- 1. Migrations applied -------------------------------------------
    console.log("\n[1] Migration status");
    const mig = await client.query(`SELECT name FROM migrations`);
    const migNames = new Set(mig.rows.map((r) => r.name));
    check("AddRoleTypeAndIsSystem migration applied", migNames.has("AddRoleTypeAndIsSystem1750190000000"));
    check(
      "AppUserHasPermissionAndCustomersRls migration applied",
      migNames.has("AppUserHasPermissionAndCustomersRls1750200000000"),
    );

    // ---- 2. Schema --------------------------------------------------------
    console.log("\n[2] roles / user_roles schema");
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'roles'`,
    );
    const colMap = new Map(cols.rows.map((r) => [r.column_name, r.data_type]));
    check("roles.role_type exists", colMap.has("role_type"));
    check("roles.is_system exists", colMap.has("is_system"));
    check("roles.description exists", colMap.has("description"));
    check("roles.permissions is jsonb", colMap.get("permissions") === "jsonb", colMap.get("permissions"));

    const uqRoles = await client.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'roles' AND indexname = 'uq_roles_name'`,
    );
    check("unique index uq_roles_name (lower(name)) exists", uqRoles.rowCount === 1);

    // Uniqueness may be a unique CONSTRAINT or a unique INDEX (this schema uses an index).
    const uqUserRoleConstraint = await client.query(
      `SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'user_roles' AND c.contype = 'u'`,
    );
    const uqUserRoleIndex = await client.query(
      `SELECT 1 FROM pg_indexes
       WHERE tablename = 'user_roles'
         AND indexdef ILIKE '%UNIQUE%'
         AND indexdef ILIKE '%user_id%'
         AND indexdef ILIKE '%role_id%'`,
    );
    check(
      "user_roles enforces uniqueness on (user_id, role_id)",
      uqUserRoleConstraint.rowCount >= 1 || uqUserRoleIndex.rowCount >= 1,
    );

    // ---- 3. RLS + permission function ------------------------------------
    console.log("\n[3] RLS & permission function");
    const fn = await client.query(
      `SELECT prosecdef FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'app' AND p.proname = 'user_has_permission'`,
    );
    check("app.user_has_permission() exists", fn.rowCount === 1);
    check("app.user_has_permission() is SECURITY DEFINER", fn.rows[0]?.prosecdef === true);

    const rlsCustomers = await client.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'customers'`,
    );
    check("RLS enabled on customers", rlsCustomers.rows[0]?.relrowsecurity === true);

    const insPolicy = await client.query(
      `SELECT qual, with_check FROM pg_policies
       WHERE tablename = 'customers' AND policyname = 'customers_rls_practice_staff_insert'`,
    );
    check("customers_rls_practice_staff_insert policy exists", insPolicy.rowCount === 1);
    check(
      "insert policy uses permission function (customer:write)",
      /user_has_permission/.test(insPolicy.rows[0]?.with_check ?? ""),
      "policy not permission-based",
    );

    // ---- 4. customer_app role least-privilege ----------------------------
    console.log("\n[4] customer_app DB role");
    const appRole = await client.query(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'customer_app'`,
    );
    if (appRole.rowCount === 1) {
      check("customer_app cannot bypass RLS", appRole.rows[0].rolbypassrls === false);
      check("customer_app is not superuser", appRole.rows[0].rolsuper === false);
      const grant = await client.query(
        `SELECT has_function_privilege('customer_app', 'app.user_has_permission(text)', 'EXECUTE') AS ok`,
      );
      check("customer_app can EXECUTE app.user_has_permission", grant.rows[0]?.ok === true);
    } else {
      check("customer_app role exists", false, "role missing");
    }

    // ---- 5. Existing role data invariants --------------------------------
    console.log("\n[5] Role data invariants");
    const roles = await client.query(
      `SELECT name, role_type, is_system, jsonb_array_length(permissions) AS perms FROM roles`,
    );
    const byName = new Map(roles.rows.map((r) => [r.name, r]));
    check("system role 'manager' is staff + is_system", byName.get("manager")?.role_type === "staff" && byName.get("manager")?.is_system === true);
    check("system role 'accountant' is staff + is_system", byName.get("accountant")?.role_type === "staff" && byName.get("accountant")?.is_system === true);
    check("system role 'customer_admin' is portal + is_system", byName.get("customer_admin")?.role_type === "portal" && byName.get("customer_admin")?.is_system === true);
    check("system role 'customer_user' is portal + is_system", byName.get("customer_user")?.role_type === "portal" && byName.get("customer_user")?.is_system === true);
    const badType = roles.rows.filter((r) => r.role_type !== "staff" && r.role_type !== "portal");
    check("every role has valid role_type (staff|portal)", badType.length === 0, badType.map((r) => r.name).join(","));

    // ---- 6. Functional: permission union across multiple roles -----------
    console.log("\n[6] Permission union (isolated transaction, rolled back)");
    await client.query("BEGIN");
    try {
      const r1 = await client.query(
        `INSERT INTO roles (name, role_type, is_system, permissions)
         VALUES ('zz_test_role_a', 'staff', false, '["customer:read"]'::jsonb) RETURNING id`,
      );
      const r2 = await client.query(
        `INSERT INTO roles (name, role_type, is_system, permissions)
         VALUES ('zz_test_role_b', 'staff', false, '["job:read","job:create"]'::jsonb) RETURNING id`,
      );
      const u = await client.query(
        `INSERT INTO users (email, password_hash, is_admin)
         VALUES ('zz_rbac_test@example.com', 'x', false) RETURNING id`,
      );
      const userId = u.rows[0].id;
      await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, r1.rows[0].id]);
      await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, r2.rows[0].id]);

      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);

      const hasCustomerRead = await client.query(`SELECT app.user_has_permission('customer:read') AS ok`);
      const hasJobCreate = await client.query(`SELECT app.user_has_permission('job:create') AS ok`);
      const hasJobRead = await client.query(`SELECT app.user_has_permission('job:read') AS ok`);
      const hasMissing = await client.query(`SELECT app.user_has_permission('subscription_plan:write') AS ok`);

      check("union grants permission from role A (customer:read)", hasCustomerRead.rows[0].ok === true);
      check("union grants permission from role B (job:create)", hasJobCreate.rows[0].ok === true);
      check("union grants permission from role B (job:read)", hasJobRead.rows[0].ok === true);
      check("permission NOT granted when absent from all roles", hasMissing.rows[0].ok === false);

      // Unassigned permission check after dropping a role assignment
      await client.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [userId, r2.rows[0].id]);
      const afterRemove = await client.query(`SELECT app.user_has_permission('job:create') AS ok`);
      check("removing a role revokes its permissions (job:create gone)", afterRemove.rows[0].ok === false);
      const stillHasA = await client.query(`SELECT app.user_has_permission('customer:read') AS ok`);
      check("remaining role still grants its permission (customer:read)", stillHasA.rows[0].ok === true);
    } finally {
      await client.query("ROLLBACK");
    }

    // ---- 7. Unknown user returns false -----------------------------------
    console.log("\n[7] Permission function safety");
    await client.query("BEGIN");
    try {
      await client.query(`SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000000', true)`);
      const none = await client.query(`SELECT app.user_has_permission('customer:read') AS ok`);
      check("unknown user has no permissions", none.rows[0].ok === false);
      await client.query(`SELECT set_config('app.user_id', '', true)`);
      const empty = await client.query(`SELECT app.user_has_permission('customer:read') AS ok`);
      check("empty app.user_id resolves to false (no crash)", empty.rows[0].ok === false);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }

  console.log(`\n================ RBAC TEST SUMMARY ================`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  if (failed > 0) {
    console.log(`\n  Failing checks:`);
    for (const f of failures) console.log(`   - ${f}`);
    process.exit(1);
  }
  console.log(`  All RBAC checks passed.`);
}

main().catch((e) => {
  console.error("RBAC test crashed:", e.message);
  process.exit(1);
});
