# Limited company — Step 1 DocuSeal template guide (Client Registration)

Build the **Client Registration Form** DocuSeal template for **limited companies** (`company.type` = `Limited company`).

This guide matches the **current wizard** (`ClientRegistrationForm.tsx`) and the **in-app Preview / Download PDF** (`frontend/src/utils/onboardingHtmlTemplate.ts`).

| Item | Value |
|---|---|
| Wizard step | **1** |
| App form key | `form_1` |
| Suggested template name | `LC — Client registration` |
| Backend env var | `DOCUSEAL_TEMPLATE_ID` |
| JSON source of truth | `frontend/src/types/customerOnboarding.ts` |
| Prefill builder | `frontend/src/utils/docusealPrefillFromOnboarding.ts` |

For steps 2–4 see [limited-company-docuseal-four-forms-fields.md](./limited-company-docuseal-four-forms-fields.md).

---

## Before you start

1. In the wizard, click **Download blank template** to export an empty PDF (no dates or defaults) and upload that to DocuSeal (A4 portrait, **3 pages** — see layout below).
2. In the DocuSeal template editor, set each control **Name** to the **DocuSeal field name** below — character-for-character, including dots.
3. Mark every pre-filled control **Read-only** except the client **Signature** field.
4. Copy the template ID into `DOCUSEAL_TEMPLATE_ID` in the backend `.env`.

```env
DOCUSEAL_API_KEY=
DOCUSEAL_TEMPLATE_ID=          # Step 1 — this form
DOCUSEAL_DEFAULT_SUBMITTER_ROLE=First Party
DOCUSEAL_SIGNATURE_FIELD_NAMES=Signature
DOCUSEAL_WEBHOOK_SECRET=
```

If you use one combined PDF for all four forms, use distinct signature names:

```env
DOCUSEAL_SIGNATURE_FIELD_NAMES=Signature_client_registration,Signature_hmrc_64_8,Signature_change_accountant,Signature_direct_debit
```

For step 1 only, the signature control name must be **`Signature`** (or **`Signature_client_registration`** when using the combined list above).

---

## How prefill works

1. Staff complete wizard step 1; data is saved as `CustomerOnboardingData` JSON.
2. On **Send signing email**, the app flattens the **entire** onboarding JSON into dot-path keys.
3. The backend sends those keys as DocuSeal `submitters[].values`.
4. DocuSeal fills controls whose **Name** matches a key. Extra keys are ignored.

### Value rules

| JSON type | DocuSeal control | Sent as |
|---|---|---|
| Non-empty string | Text / Date | `string` |
| Boolean | Checkbox | `true` / `false` (not `"true"`) |
| Number | Number | `number` |
| Empty string | — | omitted (blank on PDF) |
| `*.signature` (`data:image/...`) | — | omitted (client draws on template) |
| `*.signature` (`file:<uuid>`) | Text | short file reference only |

### Fields **not** on the registration PDF

Do **not** place these on the step 1 PDF unless you want them for internal use only — they are **not** shown in the in-app Preview/Download:

| DocuSeal field name | Why omitted |
|---|---|
| `company.company_status` | Companies House read-only info (wizard info box only) |
| `company.date_of_creation` | Companies House read-only info |
| `company.jurisdiction` | Companies House read-only info |
| `company.traderSameAsRegistered` | Wizard checkbox only; PDF hides trading block when ticked |

When `company.traderSameAsRegistered` is `true`, the in-app PDF **omits the Trading Address section** entirely. You may still bind trading fields in DocuSeal — prefill will send `company.traderAddress.*` values (often copies of registered).

---

## Recommended PDF layout (3 pages)

Match the in-app preview section order:

### Page 1 — Company details through subscription

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]                    Client Registration Form      │
├─────────────────────────────────────────────────────────┤
│  COMPANY INFORMATION … SUBSCRIPTION PLAN                 │
└─────────────────────────────────────────────────────────┘
```

### Page 2 — Directors + declaration

```
┌─────────────────────────────────────────────────────────┐
│  DIRECTORS TABLE (5 rows) + DECLARATION + Signature pad  │
└─────────────────────────────────────────────────────────┘
```

### Page 3 — Office use only

```
┌─────────────────────────────────────────────────────────┐
│  FOR 3K LTD — OFFICE USE ONLY                            │
│    Photo ID checkboxes, Address proof, Online access     │
│    Notes, Internal remarks, Approval status              │
└─────────────────────────────────────────────────────────┘
```

---

## Section 1 — Company information

| PDF label | DocuSeal field name | Control | Notes |
|---|---|---|---|
| Company name | `company.name` | Text | Required |
| Director / proprietor name (row 1) | `directors.0.name` | Text | Same value as first director table row |
| Nature of business | `company.nature_of_business` | Text | e.g. SIC summary from CH |
| Company registration number | `company.number` | Text | Required for LC |
| Year end | `company.year_end` | Text | e.g. `31 March` |
| Employer PAYE number | `company.paye_number` | Text | Company-level PAYE |

### Business type checkboxes

Exactly one must be `true` for a limited company. Prefill sets all six every time.

| PDF option | DocuSeal field name | Value when LC |
|---|---|---|
| Limited company | `company.business_type.limited_company` | `true` |
| Sole trader | `company.business_type.sole_trader` | `false` |
| Partnership | `company.business_type.partnership` | `false` |
| LLP | `company.business_type.llp` | `false` |
| Charity | `company.business_type.charity` | `false` |
| Other | `company.business_type.other` | `false` |

Optional text mirror: `company.type` → `"Limited company"`.

---

## Section 2 — Registered address

| PDF label | DocuSeal field name | Control |
|---|---|---|
| Address line 1 | `company.registeredAddress.line1` | Text |
| City | `company.registeredAddress.city` | Text |
| Postcode | `company.registeredAddress.postcode` | Text |
| Country | `company.registeredAddress.country` | Text |

---

## Section 3 — Trading address

Include this block on the PDF **only when the business trades from a different address**. In the wizard, staff tick **Same as Registered Address** to skip it on preview.

| PDF label | DocuSeal field name | Control |
|---|---|---|
| Address line 1 | `company.traderAddress.line1` | Text |
| City | `company.traderAddress.city` | Text |
| Postcode | `company.traderAddress.postcode` | Text |
| Country | `company.traderAddress.country` | Text |

---

## Section 4 — Contact

| PDF label | DocuSeal field name | Control |
|---|---|---|
| Phone | `contact.phone` | Text |
| Email | `contact.email` | Text |

---

## Section 5 — Tax references

| PDF label | DocuSeal field name | Control | LC notes |
|---|---|---|---|
| UTR | `tax.utr` | Text | |
| VAT number | `tax.vat_number` | Text | |
| VAT quarter | `tax.vat_quarter` | Text | |
| PAYE office reference | `tax.paye_ref` | Text | |
| NI number | `tax.ni_number` | Text | Company-level |
| CIS reference | `tax.cis_reference` | Text | |
| Auth code | `tax.auth_code` | Text | **Required for limited company** |

In the wizard, auth code is entered under Company Information; on the PDF it appears under Tax References. Use the same field name `tax.auth_code` in DocuSeal.

---

## Section 6 — Subscription plan

| PDF label | DocuSeal field name | Control | Notes |
|---|---|---|---|
| Plan name | `subscription_plan_name` | Text | Falls back to `subscription_matrix_plan_name` in preview |
| Matrix plan name | `subscription_matrix_plan_name` | Text | Optional duplicate bind |
| Quoted amount inc. VAT | `subscription_matrix_plan_price_inc_vat_gbp` | Number | e.g. `49.99` |
| Billing cycle | `subscription_billing_cycle` | Text | `monthly` or `yearly` |
| Payee users | `subscription_payee_users` | Number | e.g. `1` |
| Dormant (yearly) | `subscription_is_dormant` | Checkbox | Only relevant when billing cycle is yearly |
| Annual turnover (GBP) | `annual_turnover_gbp` | Number | e.g. `120000` |
| Selected services (list) | `subscription_selected_services_text` | Text (multi-line) | One `☑ Service name` per line |

**Alternative — per-service rows** (`N` = 0, 1, 2, …):

| Label | DocuSeal field name |
|---|---|
| Service id | `subscription_selected_services.N.id` |
| Service name | `subscription_selected_services.N.name` |
| Selected id | `subscription_selected_service_ids.N` |

Payload-only (optional bind): `subscription_plan_id`, `subscription_matrix_plan_id`.

---

## Section 7 — Directors table (5 rows)

The PDF always shows **5 rows**. Bind every row; unused rows stay blank.

Columns per row:

| Column | DocuSeal field name pattern |
|---|---|
| Name | `directors.N.name` |
| Home address | `directors.N.address` |
| City | `directors.N.city` |
| Postcode | `directors.N.postcode` |
| Personal UTR | `directors.N.personal_utr` |
| NI number | `directors.N.ni_number` |
| Date of birth | `directors.N.date_of_birth` |
| PAYE reference | `directors.N.paye_reference` |
| ID verification code | `directors.N.identity_verification_code` |

Replace `N` with `0`, `1`, `2`, `3`, or `4`.

---

## Section 8 — Declaration (page 1 footer)

| PDF label | DocuSeal field name | Control | Notes |
|---|---|---|---|
| Authorised signatory name | `signatures.client_registration.name` | Text | Read-only |
| Position | `signatures.client_registration.position` | Text | Read-only |
| Date | `signatures.client_registration.date` | Text | Read-only |
| Client signature | **`Signature`** | **Signature** | **Client draws — not read-only** |

Payload only: `signatures.client_registration.signature` (may be `file:<uuid>` after upload).

---

## Section 9 — Office use only (page 2)

| PDF label | DocuSeal field name | Control |
|---|---|---|
| Photo ID — Passport | `office_use.director_photo_id.passport` | Checkbox |
| Photo ID — Driving licence | `office_use.director_photo_id.driving_license` | Checkbox |
| Address proof — Utility bill | `office_use.address_proof.utility_bill` | Checkbox |
| Address proof — Bank statement | `office_use.address_proof.bank_statement` | Checkbox |
| Online access — Companies House | `office_use.online_access.companies_house` | Checkbox |
| Online access — HMRC | `office_use.online_access.hmrc` | Checkbox |
| Online access — PAYE | `office_use.online_access.paye` | Checkbox |
| Online access — VAT | `office_use.online_access.vat` | Checkbox |
| Online access — Bank | `office_use.online_access.bank` | Checkbox |
| Online access — Credit card | `office_use.online_access.credit_card` | Checkbox |
| Online access — Other | `office_use.online_access.other` | Checkbox |
| Notes | `office_use.noted` | Text (multi-line) |
| Notes (alias) | `office_use.notes` | Text | Same value as `noted` |
| Internal remarks | `office_use.internal_remarks` | Text (multi-line) |
| Approval status | `office_use.approval_status` | Text | `pending`, `approved`, `rejected` |

---

## Quick copy — all step 1 field names

Use this checklist when naming controls in DocuSeal:

```
company.name
company.number
company.type
company.nature_of_business
company.year_end
company.paye_number
company.business_type.limited_company
company.business_type.sole_trader
company.business_type.partnership
company.business_type.llp
company.business_type.charity
company.business_type.other
company.registeredAddress.line1
company.registeredAddress.city
company.registeredAddress.postcode
company.registeredAddress.country
company.traderAddress.line1
company.traderAddress.city
company.traderAddress.postcode
company.traderAddress.country
contact.phone
contact.email
tax.utr
tax.vat_number
tax.vat_quarter
tax.paye_ref
tax.ni_number
tax.cis_reference
tax.auth_code
subscription_plan_name
subscription_matrix_plan_name
subscription_matrix_plan_price_inc_vat_gbp
subscription_billing_cycle
subscription_payee_users
subscription_is_dormant
annual_turnover_gbp
subscription_selected_services_text
directors.0.name
directors.0.address
directors.0.city
directors.0.postcode
directors.0.personal_utr
directors.0.ni_number
directors.0.date_of_birth
directors.0.paye_reference
directors.0.identity_verification_code
directors.1.name
directors.1.address
directors.1.city
directors.1.postcode
directors.1.personal_utr
directors.1.ni_number
directors.1.date_of_birth
directors.1.paye_reference
directors.1.identity_verification_code
directors.2.name
directors.2.address
directors.2.city
directors.2.postcode
directors.2.personal_utr
directors.2.ni_number
directors.2.date_of_birth
directors.2.paye_reference
directors.2.identity_verification_code
directors.3.name
directors.3.address
directors.3.city
directors.3.postcode
directors.3.personal_utr
directors.3.ni_number
directors.3.date_of_birth
directors.3.paye_reference
directors.3.identity_verification_code
directors.4.name
directors.4.address
directors.4.city
directors.4.postcode
directors.4.personal_utr
directors.4.ni_number
directors.4.date_of_birth
directors.4.paye_reference
directors.4.identity_verification_code
signatures.client_registration.name
signatures.client_registration.position
signatures.client_registration.date
Signature
office_use.director_photo_id.passport
office_use.director_photo_id.driving_license
office_use.address_proof.utility_bill
office_use.address_proof.bank_statement
office_use.online_access.companies_house
office_use.online_access.hmrc
office_use.online_access.paye
office_use.online_access.vat
office_use.online_access.bank
office_use.online_access.credit_card
office_use.online_access.other
office_use.noted
office_use.notes
office_use.internal_remarks
office_use.approval_status
```

---

## Testing the template

1. Create a limited-company customer in the wizard (step 1) with registered address, optional trading address, tax refs, and subscription.
2. Use **Preview** on step 1 — layout should match your DocuSeal PDF sections.
3. For DocuSeal template setup, click **Download blank template** (not **Download PDF**) — this exports the layout with **no prefilled values** (no today's date, billing cycle, CIS reference, etc.).
4. Upload the blank PDF to DocuSeal and name each control using the field names in this guide.
5. Send a **signing email** for step 1 (`form_1`) to test live prefill.
6. Open the DocuSeal submission: pre-filled fields should match wizard data; only **Signature** remains editable.
7. Complete signing; webhook should store `signatures.client_registration.signature` as `file:<uuid>`.

---

## Optional payload fields (do not need PDF controls)

These are sent in prefill but are not on the step 1 preview PDF:

- `companies_house.*` — full Companies House snapshot after lookup
- `services.*` — legacy service flags
- `agent.*`, `bank.*`, `authorization.*` — used on steps 2–4
- `signatures.hmrc_64_8.*`, `signatures.change_accountant.*`, `signatures.direct_debit.*`

Binding them on the step 1 PDF is harmless (extra keys are ignored by other templates) but unnecessary.
