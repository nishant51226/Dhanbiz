# DocuSeal template fields — onboarding (Limited company)

Field-by-field reference for building DocuSeal templates that prefill from the onboarding wizard when **`company.type`** is **`Limited company`**.

Applies to all four onboarding PDFs:

| Step | Document | Env var (optional override) |
|------|----------|-----------------------------|
| 1 | Client registration | `DOCUSEAL_TEMPLATE_ID` |
| 2 | HMRC 64-8 | `DOCUSEAL_TEMPLATE_ID_HMRC_64_8` |
| 3 | Change of accountant | `DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT` |
| 4 | Direct debit | `DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT` |

When a step-specific env var is unset, the app falls back to `DOCUSEAL_TEMPLATE_ID`.

---

## How prefill works

1. The user fills the onboarding wizard; data is saved as `CustomerOnboardingData` (`frontend/src/types/customerOnboarding.ts`) in `customer_form_submission.data`.
2. On “Send signing email”, the **backend** loads that row, revives the JSON, and builds DocuSeal keys via `docusealPrefillFromSubmissionData` (`backend/src/docuseal/docuseal-prefill-from-onboarding.ts`).
3. The backend sends those keys as DocuSeal `submitters[].values` via `POST /submissions` (`docuseal-remote-signature.service.ts`).
4. DocuSeal fills **only** fields whose **name** exactly matches a key in the payload (case-insensitive match when locking fields; use the canonical name from your template editor).

**Rule:** In the DocuSeal template editor, set each control’s **Name** to the **DocuSeal field name** in the tables below — character-for-character, including dots.

The client may still POST `fieldValues` on the signature-email request; the server **ignores** them and always prefills from the saved submission row.

### Boxed character fields (split prefill)

Some HMRC and Direct Debit PDF controls are one character per box. **Stored JSON keeps a single string** (e.g. `tax.utr` = `"1234567890"`). At DocuSeal send time the backend expands each value into indexed keys and **does not** send the parent key.

| Stored path (JSON) | DocuSeal field names (one Text control each) | Box count |
|--------------------|-----------------------------------------------|-----------|
| `tax.ni_number` | `tax.ni_number.0` … `tax.ni_number.8` | 9 |
| `tax.utr` | `tax.utr.0` … `tax.utr.9` | 10 |
| `company.number` | `company.number.0` … `company.number.7` | 8 |
| `tax.vat_number` | `tax.vat_number.0` … `tax.vat_number.8` | 9 |
| `tax.paye_ref` | `tax.paye_ref.0` … `tax.paye_ref.11` | 12 |
| `hmrc_options.joint_claimant_ni_number` | `hmrc_options.joint_claimant_ni_number.0` … `.8` | 9 |
| `bank.account_number` | `bank.account_number.0` … `bank.account_number.7` | 8 |
| `bank.sort_code` | `bank.sort_code.0` … `bank.sort_code.5` | 6 |

Whitespace is stripped before splitting; each box gets one character left-to-right. Empty boxes are omitted (field stays blank).

**Direct Debit only — fixed Service User Number** (not in JSON; always `275069`):

| DocuSeal field names |
|----------------------|
| `direct_debit.service_user_number.0` … `direct_debit.service_user_number.5` |

Do **not** bind `tax.utr`, `bank.account_number`, etc. as single Text fields on boxed layouts — use the indexed names above only.

### Value rules

| JSON type | DocuSeal control | Sent as |
|-----------|------------------|---------|
| string (non-empty after trim) | Text or Date | string |
| boolean | Checkbox | `true` / `false` (not `"true"`) |
| number | Number | number |
| empty string | — | **omitted** (field stays blank) |
| `*.signature` (large `data:` image) | — | **omitted** (client draws on template) |
| `*.signature` (`file:<uuid>`) | Text | short file reference |

### Read-only at signing

All template fields are sent with `readonly: true` except names listed in `DOCUSEAL_SIGNATURE_FIELD_NAMES` (default: `Signature`). Prefilled data cannot be edited by the signer; only signature field(s) stay writable.

### Limited company vs other business types

For **`Limited company`** specifically:

- **Companies House auth code** is collected and prefilled (`tax.auth_code`).
- **HMRC agent codes (SA / CT)** are shown and prefilled (`agent.agent_code_sa`, `agent.agent_code_ct`).
- **Company registration number** is required (`company.number`).
- **Director table** supports up to **5** directors (`directors.0` … `directors.4`).
- **Registered address** and optional **trading address** are both stored.
- **Companies House profile snapshot** may be present after lookup (`companies_house.*`).

Fields that are **hidden for sole trader / partnership** but **apply here** are marked **LC only** in the notes column.

---

## Signature fields (client draws on PDF)

These are **not** JSON paths. Add a DocuSeal **Signature** control with the name below.

| Document | Recommended DocuSeal name | Writable via env |
|----------|---------------------------|----------------|
| Client registration | `Signature` or `Signature_client_registration` | `DOCUSEAL_SIGNATURE_FIELD_NAMES` |
| HMRC 64-8 | `Signature_hmrc_64_8` | same (comma-separated list) |
| Change of accountant | `Signature_change_accountant` | same |
| Direct debit | `Signature_direct_debit` | same |

**Single combined template (all 4 PDFs in one DocuSeal template):** use four distinct signature field names and set:

```env
DOCUSEAL_SIGNATURE_FIELD_NAMES=Signature_client_registration,Signature_hmrc_64_8,Signature_change_accountant,Signature_direct_debit
```

**One document per template:** `Signature` alone is enough.

Prefill can still send signatory **name / position / date** from `signatures.*` below; the drawn signature image comes from the DocuSeal Signature control after signing.

---

# Document 1 — Client registration (step 1)

Wizard: `ClientRegistrationForm.tsx` · PDF preview: `frontend/src/utils/onboardingHtmlTemplate.ts`

The registration PDF has **two pages**: main form + declaration (page 1), office-use block (page 2).

## Company information

| Label on PDF / wizard | DocuSeal field name | Control | Notes |
|------------------------|---------------------|---------|-------|
| Company name | `company.name` | Text | |
| Director / proprietor name (first director) | `directors.0.name` | Text | PDF “Director/Proprietor Name” uses first director |
| Nature of business | `company.nature_of_business` | Text | |
| Company registration number | `company.number.0` … `company.number.7` | Text (×8) | **LC only**; one character per box |
| Business type (single text) | `company.type` | Text | Value: `Limited company` |
| Year end | `company.year_end` | Text | |
| Company status (from CH lookup) | `company.company_status` | Text | Optional |
| Date of creation (from CH lookup) | `company.date_of_creation` | Text | Optional |
| Jurisdiction (from CH lookup) | `company.jurisdiction` | Text | Optional |

### Business type checkboxes

One checkbox per option; exactly one is `true` when type is Limited company.

| Option | DocuSeal field name | Control | Value when LC |
|--------|---------------------|---------|---------------|
| Limited company | `company.business_type.limited_company` | Checkbox | `true` |
| Sole trader | `company.business_type.sole_trader` | Checkbox | `false` |
| Partnership | `company.business_type.partnership` | Checkbox | `false` |
| LLP | `company.business_type.llp` | Checkbox | `false` |
| Charity | `company.business_type.charity` | Checkbox | `false` |
| Other | `company.business_type.other` | Checkbox | `false` |

## Registered address

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Address line 1 | `company.registeredAddress.line1` | Text |
| City | `company.registeredAddress.city` | Text |
| Postcode | `company.registeredAddress.postcode` | Text |
| Country | `company.registeredAddress.country` | Text |

## Trading address

| Label | DocuSeal field name | Control | Notes |
|-------|---------------------|---------|-------|
| Same as registered | `company.traderSameAsRegistered` | Checkbox | `true` when ticked in wizard |
| Address line 1 | `company.traderAddress.line1` | Text | |
| City | `company.traderAddress.city` | Text | |
| Postcode | `company.traderAddress.postcode` | Text | |
| Country | `company.traderAddress.country` | Text | |

## Contact

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Phone | `contact.phone` | Text |
| Email | `contact.email` | Text |

## Tax references (step 1 block)

| Label | DocuSeal field name | Control | Notes |
|-------|---------------------|---------|-------|
| UTR | `tax.utr.0` … `tax.utr.9` | Text (×10) | One character per box |
| Auth code | `tax.auth_code` | Text | **LC only** |
| VAT number | `tax.vat_number.0` … `tax.vat_number.8` | Text (×9) | One character per box |
| VAT quarter | `tax.vat_quarter` | Text | |
| PAYE reference | `tax.paye_ref.0` … `tax.paye_ref.11` | Text (×12) | One character per box |
| NI number (company-level) | `tax.ni_number.0` … `tax.ni_number.8` | Text (×9) | One character per box |
| CIS reference | `tax.cis_reference` | Text | Default practice value may apply |

## Subscription plan (step 1)

| Label | DocuSeal field name | Control | Notes |
|-------|---------------------|---------|-------|
| Plan name | `subscription_plan_name` | Text | Falls back to matrix plan name in UI |
| Plan id | `subscription_plan_id` | Text | |
| Matrix plan name | `subscription_matrix_plan_name` | Text | |
| Matrix plan id | `subscription_matrix_plan_id` | Text | |
| Quoted amount (inc. VAT) | `subscription_matrix_plan_price_inc_vat_gbp` | Number | e.g. `149.00` |
| Billing cycle | `subscription_billing_cycle` | Text | `monthly`, `yearly`, etc. |
| Payee users | `subscription_payee_users` | Number | |
| Dormant (yearly) | `subscription_is_dormant` | Checkbox | |
| Annual turnover (GBP) | `annual_turnover_gbp` | Number | |
| Selected services (multiline list) | `subscription_selected_services_text` | Text (multi-line) | One `☑ ServiceName` per line |

**Per-row catalogue services** (alternative to multiline field; `N` = 0, 1, …):

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Service id (row N) | `subscription_selected_services.N.id` | Text |
| Service name (row N) | `subscription_selected_services.N.name` | Text |
| Selected id list (row N) | `subscription_selected_service_ids.N` | Text |

## Directors table (up to 5 rows)

`N` = `0` (first) through `4` (fifth). PDF always renders 5 rows; unused rows are blank.

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Name | `directors.N.name` | Text |
| Home address | `directors.N.address` | Text |
| City | `directors.N.city` | Text |
| Postcode | `directors.N.postcode` | Text |
| Personal UTR | `directors.N.personal_utr` | Text |
| NI number | `directors.N.ni_number` | Text |
| Date of birth | `directors.N.date_of_birth` | Date or Text |
| Identity verification code | `directors.N.identity_verification_code` | Text |

## Declaration (page 1 footer)

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Authorised signatory name | `signatures.client_registration.name` | Text |
| Position | `signatures.client_registration.position` | Text |
| Date | `signatures.client_registration.date` | Date or Text |
| Stored signature ref | `signatures.client_registration.signature` | Text | Omitted if huge image |
| Client draws signature | `Signature` or `Signature_client_registration` | **Signature** | See signature section |

Mirror slot (optional, form index `1`):

| Label | DocuSeal field name |
|-------|---------------------|
| Form key | `signatures.by_form_index.1.form_key` |
| Name | `signatures.by_form_index.1.name` |
| Position | `signatures.by_form_index.1.position` |
| Date | `signatures.by_form_index.1.date` |
| Signature | `signatures.by_form_index.1.signature` |

## Office use only (page 2)

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Director photo ID — Passport | `office_use.director_photo_id.passport` | Checkbox |
| Director photo ID — Driving licence | `office_use.director_photo_id.driving_license` | Checkbox |
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

## Companies House snapshot (optional, after lookup)

Only present when a Companies House lookup was run. All paths start with `companies_house.`.

| Label (wizard summary) | DocuSeal field name | Control |
|------------------------|---------------------|---------|
| Profile fetched at | `companies_house.fetched_at` | Text |
| Company status | `companies_house.company_status` | Text |
| Date of creation | `companies_house.date_of_creation` | Text |
| Jurisdiction | `companies_house.jurisdiction` | Text |
| Next accounts due | `companies_house.accounts.next_accounts_due_on` | Text |
| Next accounts overdue | `companies_house.accounts.next_accounts_overdue` | Checkbox |
| Confirmation statement next due | `companies_house.confirmation_statement.next_due` | Text |
| Confirmation statement overdue | `companies_house.confirmation_statement.overdue` | Checkbox |
| SIC code (row N) | `companies_house.sic_codes.N` | Text |

Full `companies_house.*` tree is flattened automatically; see `docs/docuseal-onboarding-templates.md` for every nested path.

---

# Document 2 — HMRC 64-8 (step 2)

Wizard: `Hmrc648AuthorisationForm.tsx` · PDF preview: `frontend/src/utils/hmrc648HtmlTemplate.ts`

Three-page HMRC form; **pages 1–2** are submitted to HMRC, page 3 is notes only. Prefill targets the dynamic fields on pages 1–2.

## Client / company block (page 1, left)

| Label on PDF | DocuSeal field name | Control | Notes |
|--------------|---------------------|---------|-------|
| I (print your name) | `signatures.hmrc_64_8.name` | Text | Signatory name |
| of (business / company name) | `company.name` | Text | |
| Registered office — address line | `company.registeredAddress.line1` | Text | |
| Registered office — city | `company.registeredAddress.city` | Text | |
| Postcode | `company.registeredAddress.postcode` | Text | |
| Phone number | `contact.phone` | Text | |
| Signature (drawn) | `Signature_hmrc_64_8` | **Signature** | |
| Signature date | `signatures.hmrc_64_8.date` | Date or Text | |
| Stored signature ref | `signatures.hmrc_64_8.signature` | Text | Omitted if image |

## Agent block (page 1, left)

| Label | DocuSeal field name | Control | Notes |
|-------|---------------------|---------|-------|
| Agent name | `agent.name` | Text | Practice default |
| Agent address | `agent.address` | Text | |
| Agent postcode | `agent.postcode` | Text | |
| Agent phone | `agent.phone` | Text | |
| Agent code (SA) | `agent.agent_code_sa` | Text | **LC only** |
| Agent code (CT) | `agent.agent_code_ct` | Text | **LC only** |
| Client reference | `agent.client_reference` | Text | e.g. `3K-acme-1` |

## Tax authorisation checkboxes (pages 1–2)

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Self Assessment | `authorization.self_assessment` | Checkbox |
| Partnership | `authorization.partnership` | Checkbox |
| Trust | `authorization.trust` | Checkbox |
| VAT | `authorization.vat` | Checkbox |
| PAYE (employers) | `authorization.paye` | Checkbox |

## Tax reference numbers (boxed fields on PDF)

Use indexed field names (see **Boxed character fields** above). Do not bind the single-string JSON paths on boxed layouts.

| Label | DocuSeal field names | Control | Notes |
|-------|----------------------|---------|-------|
| National Insurance number | `tax.ni_number.0` … `tax.ni_number.8` | Text (×9) | |
| Unique Tax Reference (UTR) | `tax.utr.0` … `tax.utr.9` | Text (×10) | |
| VAT registration number | `tax.vat_number.0` … `tax.vat_number.8` | Text (×9) | |
| CIS reference | `tax.cis_reference` | Text | Single field |
| PAYE reference | `tax.paye_ref.0` … `tax.paye_ref.11` | Text (×12) | |
| Company registration number | `company.number.0` … `company.number.7` | Text (×8) | Corporation Tax section, **LC only** |
| Joint claimant NI (page 3 options) | `hmrc_options.joint_claimant_ni_number.0` … `.8` | Text (×9) | When joint claim ticked |

Mirror slot (optional, form index `2`):

| DocuSeal field name |
|---------------------|
| `signatures.by_form_index.2.name` |
| `signatures.by_form_index.2.date` |
| `signatures.by_form_index.2.signature` |

---

# Document 3 — Change of accountant (step 3)

Wizard: `ChangeOfAccountantForm.tsx` · PDF preview: `frontend/src/utils/changeAccountantHtmlTemplate.ts`

Single-page letter. Practice name/address in the letter body is **static text** on the PDF template (“3K Financial & Accounting Services Ltd …”); only client-specific fields need DocuSeal names.

## Letter recipient (previous accountant)

| Label on PDF | DocuSeal field name | Control |
|--------------|---------------------|---------|
| Recipient name (line 1) | `change_of_accountant.previous_accountant_name` | Text |
| Address line 1 | `change_of_accountant.previous_accountant_address.line1` | Text |
| City | `change_of_accountant.previous_accountant_address.city` | Text |
| Postcode | `change_of_accountant.previous_accountant_address.postcode` | Text |
| Country | `change_of_accountant.previous_accountant_address.country` | Text |

## Letter date

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Date | `signatures.change_accountant.date` | Date or Text |

## Authorised signatory block (footer)

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Trading name | `company.name` | Text |
| Registered address — line 1 | `company.registeredAddress.line1` | Text |
| Registered address — city | `company.registeredAddress.city` | Text |
| Registered address — postcode | `company.registeredAddress.postcode` | Text |
| Authorised signatory name | `signatures.change_accountant.name` | Text |
| Drawn signature | `Signature_change_accountant` | **Signature** |
| Stored signature ref | `signatures.change_accountant.signature` | Text |

Mirror slot (optional, form index `3`):

| DocuSeal field name |
|---------------------|
| `signatures.by_form_index.3.name` |
| `signatures.by_form_index.3.date` |
| `signatures.by_form_index.3.signature` |

---

# Document 4 — Direct debit (step 4)

Wizard: `DirectDebitForm.tsx` · PDF preview: `frontend/src/utils/directDebitHtmlTemplate.ts`

## Company and bank details

| Label on PDF | DocuSeal field name | Control | Notes |
|--------------|---------------------|---------|-------|
| Company name | `company.name` | Text | Also used as “Reference” on PDF |
| Account holder name | `bank.account_holder_name` | Text | |
| Account number | `bank.account_number.0` … `bank.account_number.7` | Text (×8) | One character per box |
| Sort code | `bank.sort_code.0` … `bank.sort_code.5` | Text (×6) | One character per box |
| Bank / building society address | `bank.bank_address` | Text (multi-line) | |

## Signature block

| Label | DocuSeal field name | Control |
|-------|---------------------|---------|
| Signatory name | `signatures.direct_debit.name` | Text |
| Date | `signatures.direct_debit.date` | Date or Text |
| Drawn signature | `Signature_direct_debit` | **Signature** |
| Stored signature ref | `signatures.direct_debit.signature` | Text |

Mirror slot (optional, form index `4`):

| DocuSeal field name |
|---------------------|
| `signatures.by_form_index.4.name` |
| `signatures.by_form_index.4.date` |
| `signatures.by_form_index.4.signature` |

**Service User Number (fixed):** bind `direct_debit.service_user_number.0` … `direct_debit.service_user_number.5` (value always `275069`). Practice header address and Direct Debit Guarantee boilerplate remain static on the PDF.

---

## Backend configuration

| Variable | Purpose |
|----------|---------|
| `DOCUSEAL_API_KEY` | API token |
| `DOCUSEAL_TEMPLATE_ID` | Default template (step 1 / combined template) |
| `DOCUSEAL_TEMPLATE_ID_HMRC_64_8` | HMRC 64-8 template id |
| `DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT` | Change of accountant template id |
| `DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT` | Direct debit template id |
| `DOCUSEAL_DEFAULT_SUBMITTER_ROLE` | Must match submitter role in template (e.g. `First Party`) |
| `DOCUSEAL_SIGNATURE_FIELD_NAMES` | Comma-separated writable signature field names |
| `DOCUSEAL_WEBHOOK_SECRET` | Webhook verification; merges signed PDF back into onboarding |

---

## Verify prefill before go-live

1. Create a test customer with **`Limited company`** selected and realistic data in all four steps.
2. Open DevTools → Network → POST `…/signature-email-request` (optional: inspect backend logs / DocuSeal submission payload).
3. Confirm the server sends the keys you named on the template (e.g. `company.name`, `tax.utr.0`, `directors.0.name`).
4. If keys are present but DocuSeal shows blanks, the template field **Name** does not match — rename in DocuSeal editor.
5. After signing, confirm the webhook updates `signatures.*.signature` on the submission.

---

## Related docs

- General field reference (all business types): `docs/docuseal-onboarding-templates.md`
- Prefill implementation: `backend/src/docuseal/docuseal-prefill-from-onboarding.ts` (send path: `docuseal-remote-signature.service.ts`)
- JSON schema: `frontend/src/types/customerOnboarding.ts`
- Field locking: `backend/src/docuseal/docuseal-remote-signature.service.ts`
