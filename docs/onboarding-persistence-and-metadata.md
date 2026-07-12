# Onboarding persistence: `customers` vs `customer_form_submission`

This document explains **where onboarding JSON lives**, how **`customer_form_submission.metadata`** is structured (`form_1` … `form_4`), and how it interacts with **DocuSeal**. It complements [DocuSeal field names](./docuseal-onboarding-templates.md) (template naming).

---

## Three different JSON stores

| Store | Table.column | Role |
|-------|----------------|------|
| **Customer canonical JSON** | `customers.onboarding_data` (jsonb, nullable) | Set **only when the wizard finishes** (`PATCH` with `onboardingData`). **Do not use** for in-progress onboarding; use the submission row `data` instead. After finish, the DocuSeal webhook may merge a remote signature **only if** this column is already populated. |
| **Submission answers** | `customer_form_submission.data` (jsonb) | **Working copy** of the onboarding object for **this submission row** while drafting, saving, and after merges. This is what the wizard loads on **resume** (`GET …/form-submissions/latest`). |
| **Submission sidecar** | `customer_form_submission.metadata` (jsonb, default `{}`) | **Not** form answers. Structured as **one object per wizard form** (`form_1` … `form_4`), each optional bucket holding `docuseal`, `status`, and room for future per-step fields. |

Naming: **`onboarding_data`** on `customers` is not called "metadata" in the schema. **`metadata`** is only on the form submission row.

---

## `metadata` shape: `form_1` … `form_4`

| Key | Wizard step | Typical DocuSeal slot (`docuseal.target`) |
|-----|----------------|------------------------------------------|
| `form_1` | Client registration | `client_registration` |
| `form_2` | HMRC 64-8 | `hmrc_64_8` |
| `form_3` | Change of accountant | `change_accountant` |
| `form_4` | Direct debit | `direct_debit` |

Each bucket (`CustomerFormSubmissionFormBucket`):

```ts
{
  docuseal?: {
    submissionId?: string | null;
    target?: "client_registration" | "hmrc_64_8" | "change_accountant" | "direct_debit";
    phase?: "email_sent" | "link_viewed" | "signed";
    emailedAt?: string;
    viewedAt?: string;
    signedAt?: string;
  };
  status?: string; // e.g. remote_signature_completed, remote_signature_declined (extend as needed)
}
```

**Legacy rows** may still have a **root** `metadata.docuseal` object (older app versions). The backend **normalizes in memory** on read/write helpers: that object is treated as belonging to the appropriate `form_*` bucket (see `normalizeCustomerFormSubmissionMetadata` in `customer-form-submission.entity.ts`). **No SQL migration** is required; JSONB accepts both shapes until old rows are naturally overwritten.

---

## Wizard lifecycle (no DocuSeal yet)

1. **First "Save draft"** (no `customerId` yet): `POST /customers` with **name** only — **`customers`** row created; **`onboarding_data`** stays null until finish (current UI).
2. **First form submission row**: `POST /customers/:id/form-submissions` with `{ data }` — **`customer_form_submission`** row: **`data`** = onboarding JSON, **`status`** = `draft`, **`metadata`** = `{}`.
3. **Later drafts**: `PATCH …/form-submissions/:submissionId` with `{ data }` — **`data`** updated; **`metadata`** unchanged unless DocuSeal runs.
4. **Finish wizard**: `PATCH /customers/:id` with **`onboardingData`** — **`customers.onboarding_data`** set; then submission patched with **`data`** and **`status: completed`**.

During editing, the **source of truth in the DB** for what the user typed is **`customer_form_submission.data`**. **`customers.onboarding_data`** is the customer-level copy written on **finish** only.

---

## `row.data.docuseal` vs `metadata.form_N.docuseal`

| Location | Content |
|----------|---------|
| **`metadata.form_N.docuseal`** | **Pipeline state** for that form (ids, phases, `target`). Cleared when the flow ends for that bucket; **`status`** on the same bucket can record outcome. |
| **`data.docuseal`** | **Light audit** inside the answers blob (`last_event`, timestamps). Not the primary place for "is email sent?" — use **`metadata`**. |

---

## DocuSeal sequence (mermaid)

```mermaid
sequenceDiagram
  participant UI as Wizard / UI
  participant API as Backend API
  participant DB as Postgres
  participant DS as DocuSeal
  participant WH as Webhook

  UI->>API: PATCH customer (onboardingData) + PATCH submission (data, completed)
  API->>DB: customers.onboarding_data + submission.data

  Note over UI,DS: Optional: remote signature (per form bucket)
  UI->>API: POST …/signature-email-request
  API->>DS: Create submission (external_id = submission row id)
  DS-->>API: submission id
  API->>DB: metadata.form_N.docuseal = { submissionId, phase: email_sent, target, emailedAt }

  DS->>WH: form.viewed
  WH->>DB: merge phase link_viewed on that form_N; data.docuseal audit

  DS->>WH: form.completed / submission.completed
  WH->>DB: merge signature into submission.data; optionally customer.onboarding_data if already set
  WH->>DB: clear metadata.form_N.docuseal; set form_N.status
```

---

## Decline and "no signature URL"

- **`form.declined`**: Clears **`metadata.form_N.docuseal`** for the resolved bucket, sets **`status`** (e.g. declined), appends info under **`data.docuseal`**, saves row.
- **Completed but no image URL**: Clears that form's **`docuseal`**, sets **`status`** to a failure label; **`data.docuseal`** records `completed_no_signature_url`.

---

## Related code (quick index)

| Topic | Location |
|-------|----------|
| Entity: `data`, `status`, `metadata`, form keys, DocuSeal helpers | `backend/src/entities/customer-form-submission.entity.ts` |
| Customer `onboarding_data` | `backend/src/entities/customer.entity.ts` |
| Create / patch submission rows | `backend/src/customers/customer-form-submissions.service.ts` |
| Send DocuSeal email + set `metadata` after email | `backend/src/docuseal/docuseal-remote-signature.service.ts` |
| Webhooks: viewed, declined, completed, merge | `backend/src/docuseal/docuseal-webhook.service.ts` |
| Wizard: customer + submission persistence | `frontend/src/pages/NewCustomerPage.tsx` |

---

## See also

- [DocuSeal field names = onboarding JSON paths](./docuseal-onboarding-templates.md) — template **`name`** must match dot paths in prefill.
- Migration that added **`metadata`** on submissions: `backend/src/migrations/1744000000000-CustomerFormSubmissionMetadata.ts`
- Migration that added **`onboarding_data`** on customers: `backend/src/migrations/1743600000000-AddCustomerOnboardingData.ts`
