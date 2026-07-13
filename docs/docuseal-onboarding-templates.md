# DocuSeal field names = onboarding JSON paths (step 1 / full SOT)

Prefill is built by **`flattenCustomerOnboardingForDocuseal`** in  
`frontend/src/utils/docusealPrefillFromOnboarding.ts`.

**In DocuSeal:** set each field's **name** to the value in the **DocuSeal field name** column (exactly, including dots). That string is the same path as in the saved onboarding JSON (`CustomerOnboardingData`).

**Values:** strings are trimmed; **numbers and booleans** are sent as JSON **numbers** and **booleans** in the DocuSeal `values` object (checkboxes need real `true`/`false`, not the strings `"true"`/`"false"`). Empty strings are not sent. **`*.signature`** is omitted if it is a huge `data:` image; short **`file:<uuid>`** is sent.

**Drawn signature (client signs on the template):** this is **not** a JSON path. Add a DocuSeal **Signature** control named **`Signature`** (unless you change `DOCUSEAL_SIGNATURE_FIELD_NAMES` in the backend env).

Type reference: `frontend/src/types/customerOnboarding.ts` (`CustomerOnboardingData`).

> **DocuSeal plan note (free vs. Pro).** This app uses the **free-tier** flow only: pre-built templates in DocuSeal + `POST /submissions` with `field_values`. The dynamic-template / dynamic-PDF endpoints — `POST /submissions/pdf`, `POST /submissions/html`, `POST /templates/pdf`, `POST /templates/html` — return `404 — "This feature is available in Pro Edition"` and are **not** wired up. **One email + one signing link covering all four onboarding PDFs** is still possible without Pro: in the DocuSeal editor, build **a single template that contains all four documents stacked** (upload PDF #1, then "Add document" for PDFs #2/#3/#4), drop the signature box(es) you need on each, and point `DOCUSEAL_TEMPLATE_ID` at it. Per-step env vars (`DOCUSEAL_TEMPLATE_ID_HMRC_64_8`, `DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT`, `DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT`) become unused in that setup since every step falls back to `DOCUSEAL_TEMPLATE_ID`.

### Field locking at signing time (read-only-by-default)

`DocusealRemoteSignatureService.buildDocusealSubmitterFieldsForKnownTemplateNames` (in `backend/src/docuseal/docuseal-remote-signature.service.ts`) sends **every** field on the template in the API payload with `readonly: true` **except** for the writable allow-list, which defaults to just `Signature`. Override the allow-list with `DOCUSEAL_SIGNATURE_FIELD_NAMES` (comma-separated) if your template uses a different signature field name or has more than one signature.

Implications:

- **Blank text / date / number fields are locked** — the signer can't type anything into a field that wasn't prefilled. Anything you want them to fill in must be added to `DOCUSEAL_SIGNATURE_FIELD_NAMES`.
- **Checkboxes are locked too**, even though DocuSeal's editor UI does **not** show a "Read-only" toggle for the Checkbox control. The lock is enforced by the API (`readonly: true` on the submitter field), not by the editor toggle, so you don't need to change anything in the template editor.
- This applies regardless of whether a value was prefilled or not. Only the `Signature` (or whatever you configure) is editable in the signing UI.

### Troubleshooting: only a few fields show after �Send signing email�

The API request still sends **all** prefill keys produced by `flattenCustomerOnboardingForDocuseal` (dozens of paths when your onboarding JSON has data). DocuSeal **ignores** any key that does **not** match a **field name** on that template.

So if you only see, for example, company name, director name, address, postcode, city, and UTR filled in, those are almost certainly the **only** controls on the template whose **names** were set to paths like `company.name`, `directors.0.name`, `company.address.line1`, `company.address.postcode`, `company.address.city`, and `tax.utr`. Everything else is still in the payload but has nowhere to go until you **rename** each DocuSeal field (in the template editor) to the exact dot path from this doc (`services.bookkeeping`, `contact.email`, `office_use.online_access.hmrc`, etc.).

**Verify in the browser:** DevTools ? Network ? the `signature-email-request` POST ? request JSON ? `fieldValues` should list many keys. If it does, the app is fine; finish aligning the template field names.

---

## Client registration: DocuSeal names by section (wizard and PDF)

Step 1 in the app is **Client registration** (`ClientRegistrationForm.tsx`). Section titles below match the **wizard** headings. If your PDF uses different wording (for example **Services to render** instead of **Services**), use the **same DocuSeal field names** in that block; only the printed heading changes.

DocuSeal **control names** are still the JSON dot paths in the second column. Agent, bank, and HMRC authorization flags are **not** on this screen; they stay in the same JSON and are listed under **Other onboarding data (later steps, same JSON)** below.

### Company information

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Company / registered name | `company.name` |
| Company registration number | `company.number` |
| Business type (single value from wizard; use for one text field if needed) | `company.type` |
| Business type **checkboxes** (same value as wizard; one is `true`, rest `false`) | See below |
| Nature of business | `company.nature_of_business` |
| Year end | `company.year_end` |
| Company status (when applied from Companies House onto this record) | `company.company_status` |
| Date of creation (when applied from Companies House) | `company.date_of_creation` |
| Jurisdiction (when applied from Companies House) | `company.jurisdiction` |

**DocuSeal checkboxes for business type (like services):** the app still saves **one** string in `company.type`, but prefill also sends boolean strings for each standard option. Name each DocuSeal checkbox exactly as follows:

| Option (wizard) | **DocuSeal field name** | Value |
|-----------------|-------------------------|-------|
| Limited company | `company.business_type.limited_company` | `true` / `false` |
| Sole trader | `company.business_type.sole_trader` | `true` / `false` |
| Partnership | `company.business_type.partnership` | `true` / `false` |
| LLP | `company.business_type.llp` | `true` / `false` |
| Charity | `company.business_type.charity` | `true` / `false` |
| Other | `company.business_type.other` | `true` / `false` |

Matching is case-insensitive on `company.type`. If `company.type` is empty or not one of these labels, **all** of the above are `false`. Implemented in `flattenCustomerOnboardingForDocuseal` in `frontend/src/utils/docusealPrefillFromOnboarding.ts`.

### Address

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Address line 1 | `company.address.line1` |
| City | `company.address.city` |
| Postcode | `company.address.postcode` |
| Country | `company.address.country` |

### Companies House filing snapshot

Shown in the wizard after a lookup. Every path starts with `companies_house.` (full detail in **Companies House snapshot** and **Reverse lookup - `companies_house.*`** below). Examples that match the summary rows on screen:

| Wizard summary | **DocuSeal field name** |
|----------------|-------------------------|
| Accounts next due | `companies_house.accounts.next_accounts_due_on` |
| Accounts overdue flag | `companies_house.accounts.next_accounts_overdue` |
| Confirmation statement next due | `companies_house.confirmation_statement.next_due` |
| Confirmation statement overdue | `companies_house.confirmation_statement.overdue` |
| Profile fetched | `companies_house.fetched_at` |

### Contact

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Phone number | `contact.phone` |
| Email address | `contact.email` |

### Director / proprietor

`N` = `0` for the first director, `1` for the second, etc. (Example: first name is `directors.0.name`.)

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Director name | `directors.N.name` |
| Director address | `directors.N.address` |
| City | `directors.N.city` |
| Postcode | `directors.N.postcode` |

### Tax information

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| UTR | `tax.utr` |
| VAT number | `tax.vat_number` |
| VAT quarter | `tax.vat_quarter` |
| PAYE reference | `tax.paye_ref` |
| NI number | `tax.ni_number` |
| CIS reference | `tax.cis_reference` |

### Services (PDF wording often "Services to render" or similar)

The app section title is **Services**. On a paper/PDF engagement letter you might see **Services to render**, **Work to be undertaken**, or a checklist under a custom heading; bind each item to the paths below.

| Wizard / PDF label | **DocuSeal field name** | Value sent |
|--------------------|-------------------------|------------|
| Bookkeeping | `services.bookkeeping` | `true` / `false` |
| VAT | `services.vat` | `true` / `false` |
| Quarterly reports | `services.quarterly_reports` | `true` / `false` |
| Year end accounts | `services.year_end_accounts` | `true` / `false` |
| Personal tax return | `services.personal_tax_return` | `true` / `false` |

### Subscription plan & catalogue services (admin-managed)

Bind these to fields on your "Firm" / engagement-letter template that show the **subscription plan** the client picked and the **services** they ticked from the admin-managed catalogue.

| Wizard / PDF label | **DocuSeal field name** | DocuSeal control | Value sent |
|--------------------|-------------------------|------------------|------------|
| Subscription plan name | `subscription_plan_name` | Text | string |
| Plan id (rarely shown on engagement letter) | `subscription_plan_id` | Text | string |
| Billing cycle | `subscription_billing_cycle` | Text | `monthly` / `yearly` etc. |
| Number of payee users | `subscription_payee_users` | Number | integer |
| Dormant company flag | `subscription_is_dormant` | Checkbox | `true` / `false` |
| Matrix-recommender plan id | `subscription_matrix_plan_id` | Text | string |
| Matrix-recommender plan name | `subscription_matrix_plan_name` | Text | string |

#### Recommended: single multiline text field for the services list

The catalogue is admin-managed and grows over time, so the **selected services** can't be modelled as a fixed set of checkboxes the way the legacy `services.*` flags above are. Use **one** DocuSeal **Text** control (multi-line, sized to grow vertically) named exactly:

| Wizard / PDF label | **DocuSeal field name** | DocuSeal control | Value sent |
|--------------------|-------------------------|------------------|------------|
| Selected services (rendered as a checked list) | `subscription_selected_services_text` | Text (multi-line) | one `\u2611 ServiceName` per selected service, joined with `\n` |

Behaviour (see `flattenCustomerOnboardingForDocuseal` in `frontend/src/utils/docusealPrefillFromOnboarding.ts`):

- One `\u2611 ` (ballot-box-with-check) prefix per service, names taken from `subscription_selected_services` in the order they appear in `subscription_selected_service_ids`.
- Falls back to the raw service id when the denormalised name isn't available.
- When **no services** are selected the key is **omitted** entirely, so DocuSeal leaves the field blank.

If you'd rather show the raw rows in a per-row layout instead of one text block, the underlying entries are also flattened automatically:

| Wizard / PDF label | **DocuSeal field name** | DocuSeal control | Value sent |
|--------------------|-------------------------|------------------|------------|
| Selected service id (row N) | `subscription_selected_services.N.id` | Text | string |
| Selected service name (row N) | `subscription_selected_services.N.name` | Text | string |
| Selected service id list (row N) | `subscription_selected_service_ids.N` | Text | string |

`N` starts at `0`. Use one of the two styles per template, not both, to avoid duplicated content.

### Payroll

Shown when payroll is turned on in **Services**.

| Wizard / PDF label | **DocuSeal field name** | Value sent |
|--------------------|-------------------------|------------|
| Payroll (on/off) | `services.payroll.enabled` | `true` / `false` |
| Number of employees | `services.payroll.employee_count` | e.g. `0`, `12` |
| Payroll frequency | `services.payroll.frequency` | string |

### Office use

Internal fields on step 1 (amber **Office use** block in the app). Checkboxes match the **For Dhanbiz - Office Use Only** rows on the client registration PDF.

| Wizard / PDF label | **DocuSeal field name** | Value sent |
|--------------------|-------------------------|------------|
| Director photo ID � Passport | `office_use.director_photo_id.passport` | `true` / `false` |
| Director photo ID � Driving licence | `office_use.director_photo_id.driving_license` | `true` / `false` |
| Address proof � Utility bill | `office_use.address_proof.utility_bill` | `true` / `false` |
| Address proof � Bank statement | `office_use.address_proof.bank_statement` | `true` / `false` |
| Online access � Companies House | `office_use.online_access.companies_house` | `true` / `false` |
| Online access � HMRC | `office_use.online_access.hmrc` | `true` / `false` |
| Online access � PAYE | `office_use.online_access.paye` | `true` / `false` |
| Online access � VAT | `office_use.online_access.vat` | `true` / `false` |
| Online access � Bank | `office_use.online_access.bank` | `true` / `false` |
| Online access � Credit card | `office_use.online_access.credit_card` | `true` / `false` |
| Online access � Other | `office_use.online_access.other` | `true` / `false` |
| Notes (free text; JSON key `noted`) | `office_use.noted` | string |
| Notes (same value; use if your DocuSeal field was named `notes`) | `office_use.notes` | string (prefill alias) |
| Internal remarks | `office_use.internal_remarks` | string |
| Approval status | `office_use.approval_status` | string |

### Running heading: "For [name]" (e.g. "For 3K Limited" on the PDF)

Often this line is **fixed layout text** on the template, not a separate wizard section.

- **Client company** in a phrase like "For **Acme Ltd** �" (the entity you are onboarding) ? use **`company.name`** for the part that must change per client.
- **Practice / firm name** (for example **3K** in a letterhead or "we, 3K �") is usually **typed once in the DocuSeal PDF** as static text. If you need it from stored data instead (same as the HMRC/agent block), use **`agent.name`** (see **Agent** below).

### Declaration

Matches the wizard **Declaration** section: `signatures.client_registration` and optional mirror `signatures.by_form_index["1"]`.

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Authorized signatory name | `signatures.client_registration.name` |
| Position | `signatures.client_registration.position` |
| Date | `signatures.client_registration.date` |
| Stored signature / file ref (when not sending a huge image) | `signatures.client_registration.signature` |
| Client draws signature on the DocuSeal template | Not JSON: control name **`Signature`** (see top of this doc) |

Optional mirror slot for step 1 (exports / tooling):

| Wizard / PDF label | **DocuSeal field name** |
|--------------------|-------------------------|
| Mirror - form key | `signatures.by_form_index.1.form_key` |
| Mirror - name | `signatures.by_form_index.1.name` |
| Mirror - position | `signatures.by_form_index.1.position` |
| Mirror - date | `signatures.by_form_index.1.date` |
| Mirror - signature | `signatures.by_form_index.1.signature` |

---

## Other onboarding data (later steps, same JSON)

These are edited on steps 2-4 (or left empty on step 1) but are still included in the **same** flattened prefill payload.

### Agent (HMRC 64-8 step; wizard step 2)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Agent name | `agent.name` |
| Agent address | `agent.address` |
| Agent postcode | `agent.postcode` |
| Agent phone | `agent.phone` |
| Agent code (SA) | `agent.agent_code_sa` |
| Agent code (CT) | `agent.agent_code_ct` |
| Client reference | `agent.client_reference` |

### Bank (direct debit step; wizard step 4)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Account holder name | `bank.account_holder_name` |
| Account number | `bank.account_number` |
| Sort code | `bank.sort_code` |
| Bank address | `bank.bank_address` |

### Tax authorization (HMRC 64-8 flags; wizard step 2)

| What it is | **DocuSeal field name** | Value sent |
|------------|---------------------------|------------|
| Self assessment | `authorization.self_assessment` | `true` / `false` |
| Partnership | `authorization.partnership` | `true` / `false` |
| Trust | `authorization.trust` | `true` / `false` |
| VAT (auth) | `authorization.vat` | `true` / `false` |
| PAYE | `authorization.paye` | `true` / `false` |

---

## Signatures (all steps share these paths in JSON)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Client registration - signatory name | `signatures.client_registration.name` |
| Client registration - position | `signatures.client_registration.position` |
| Client registration - date | `signatures.client_registration.date` |
| Client registration - stored image ref / data | `signatures.client_registration.signature` |
| HMRC 64-8 - name | `signatures.hmrc_64_8.name` |
| HMRC 64-8 - date | `signatures.hmrc_64_8.date` |
| HMRC 64-8 - signature | `signatures.hmrc_64_8.signature` |
| Change of accountant - name | `signatures.change_accountant.name` |
| Change of accountant - date | `signatures.change_accountant.date` |
| Change of accountant - signature | `signatures.change_accountant.signature` |
| Direct debit - name | `signatures.direct_debit.name` |
| Direct debit - date | `signatures.direct_debit.date` |
| Direct debit - signature | `signatures.direct_debit.signature` |

---

## Optional mirror: `signatures.by_form_index`

If present, keys are string ids (`"1"`, `"2"`, etc.). Each slot can have:

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Form key | `signatures.by_form_index.<id>.form_key` |
| Name | `signatures.by_form_index.<id>.name` |
| Position | `signatures.by_form_index.<id>.position` |
| Date | `signatures.by_form_index.<id>.date` |
| Signature | `signatures.by_form_index.<id>.signature` |

Replace `<id>` with the actual key in JSON (e.g. `1` gives `signatures.by_form_index.1.name`).

---

## Companies House snapshot (`companies_house`)

Only present after a lookup. Paths all start with `companies_house.`.

### Top-level (strings / booleans unless noted)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Fetched at | `companies_house.fetched_at` |
| ETag | `companies_house.etag` |
| Company status | `companies_house.company_status` |
| Company status detail | `companies_house.company_status_detail` |
| Date of creation | `companies_house.date_of_creation` |
| Date of cessation | `companies_house.date_of_cessation` |
| Jurisdiction | `companies_house.jurisdiction` |
| Type | `companies_house.type` |
| Partial data available | `companies_house.partial_data_available` |
| Can file | `companies_house.can_file` |
| Registered office in dispute | `companies_house.registered_office_is_in_dispute` |
| Undeliverable registered office | `companies_house.undeliverable_registered_office_address` |
| Has insolvency history | `companies_house.has_insolvency_history` |

### `sic_codes` (array of strings)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| SIC code line *N* (0-based) | `companies_house.sic_codes.N` |

### `accounts` (nested object)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Accounting reference day | `companies_house.accounts.accounting_reference_day` |
| Accounting reference month | `companies_house.accounts.accounting_reference_month` |
| Last accounts period end | `companies_house.accounts.last_accounts_period_end_on` |
| Last accounts period start | `companies_house.accounts.last_accounts_period_start_on` |
| Last accounts type | `companies_house.accounts.last_accounts_type` |
| Next accounts due on | `companies_house.accounts.next_accounts_due_on` |
| Next accounts overdue | `companies_house.accounts.next_accounts_overdue` |
| Next accounts period end | `companies_house.accounts.next_accounts_period_end_on` |
| Next accounts period start | `companies_house.accounts.next_accounts_period_start_on` |

### `confirmation_statement`

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Last made up to | `companies_house.confirmation_statement.last_made_up_to` |
| Next due | `companies_house.confirmation_statement.next_due` |
| Next made up to | `companies_house.confirmation_statement.next_made_up_to` |
| Overdue | `companies_house.confirmation_statement.overdue` |

### `annual_return`

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Last made up to | `companies_house.annual_return.last_made_up_to` |
| Next due | `companies_house.annual_return.next_due` |
| Next made up to | `companies_house.annual_return.next_made_up_to` |
| Overdue | `companies_house.annual_return.overdue` |

### `branch_company_details`

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Business activity | `companies_house.branch_company_details.business_activity` |
| Parent company name | `companies_house.branch_company_details.parent_company_name` |
| Parent company number | `companies_house.branch_company_details.parent_company_number` |

### `foreign_company_details`

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Business activity | `companies_house.foreign_company_details.business_activity` |
| Registration number | `companies_house.foreign_company_details.registration_number` |
| Originating country | `companies_house.foreign_company_details.originating_country` |
| Originating registry name | `companies_house.foreign_company_details.originating_registry_name` |
| Company type | `companies_house.foreign_company_details.company_type` |
| Governed by | `companies_house.foreign_company_details.governed_by` |

### `previous_company_names` (array of objects)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Old name (row *N*) | `companies_house.previous_company_names.N.name` |
| Effective from | `companies_house.previous_company_names.N.effective_from` |
| Ceased on | `companies_house.previous_company_names.N.ceased_on` |

### `links` (string map)

| What it is | **DocuSeal field name** |
|------------|---------------------------|
| Link value for key *K* | `companies_house.links.<K>` |

`<K>` is whatever key exists in JSON (e.g. `self` gives `companies_house.links.self`).

---

## Backend env (reminder)

| Variable | Purpose |
|----------|---------|
| `DOCUSEAL_API_KEY` | API token |
| `DOCUSEAL_TEMPLATE_ID` | Default template id |
| `DOCUSEAL_TEMPLATE_ID_HMRC_64_8` | Optional HMRC template |
| `DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT` | Optional change template |
| `DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT` | Optional DD template |
| `DOCUSEAL_DEFAULT_SUBMITTER_ROLE` | Submitter **role** string exactly as in DocuSeal (e.g. `First Party`). If unset, the API defaults to `First Party`. |
| `DOCUSEAL_SIGNATURE_FIELD_NAMES` | Default `Signature` for webhook |

---

## Same payload for all four remote-sign steps

The API always sends the **full flattened onboarding object** for every step. Your DocuSeal template for each step only needs the fields you want on that PDF; extra keys are ignored by DocuSeal.

---

## Reverse lookup - **DocuSeal field name** first (core onboarding, all JSON except CH)

Use this when you already know the JSON path and want a short description. For `companies_house.*`, use the **Reverse lookup - companies_house.*** table below.

| **DocuSeal field name** | What it is |
|-------------------------|------------|
| `agent.address` | Agent address |
| `agent.agent_code_ct` | Agent code (CT) |
| `agent.agent_code_sa` | Agent code (SA) |
| `agent.client_reference` | Client reference |
| `agent.name` | Agent name |
| `agent.phone` | Agent phone |
| `agent.postcode` | Agent postcode |
| `authorization.partnership` | Auth: partnership (boolean) |
| `authorization.paye` | Auth: PAYE (boolean) |
| `authorization.self_assessment` | Auth: self assessment (boolean) |
| `authorization.trust` | Auth: trust (boolean) |
| `authorization.vat` | Auth: VAT (boolean) |
| `bank.account_holder_name` | Bank account holder |
| `bank.account_number` | Account number |
| `bank.bank_address` | Bank address |
| `bank.sort_code` | Sort code |
| `company.address.city` | Registered address city |
| `company.address.country` | Country |
| `company.address.line1` | Address line 1 |
| `company.address.postcode` | Postcode |
| `company.company_status` | CH / profile company status |
| `company.date_of_creation` | CH date of creation |
| `company.jurisdiction` | Jurisdiction |
| `company.name` | Company name |
| `company.nature_of_business` | Nature of business |
| `company.number` | Company registration number |
| `company.type` | Business type (single string from wizard) |
| `company.business_type.limited_company` | Business type: Limited company (checkbox) |
| `company.business_type.sole_trader` | Business type: Sole trader (checkbox) |
| `company.business_type.partnership` | Business type: Partnership (checkbox) |
| `company.business_type.llp` | Business type: LLP (checkbox) |
| `company.business_type.charity` | Business type: Charity (checkbox) |
| `company.business_type.other` | Business type: Other (checkbox) |
| `company.year_end` | Year end |
| `contact.email` | Contact email |
| `contact.phone` | Contact phone |
| `directors.N.address` | Director *N* address (`N` = 0, 1, ...) |
| `directors.N.city` | Director *N* city |
| `directors.N.name` | Director *N* name |
| `directors.N.postcode` | Director *N* postcode |
| `office_use.approval_status` | Office approval status |
| `office_use.internal_remarks` | Office internal remarks |
| `office_use.noted` | Office notes (free text; label in app/PDF: **Notes**) |
| `office_use.director_photo_id.passport` | Director photo ID: Passport (checkbox) |
| `office_use.director_photo_id.driving_license` | Director photo ID: Driving licence (checkbox) |
| `office_use.address_proof.utility_bill` | Address proof: Utility bill (checkbox) |
| `office_use.address_proof.bank_statement` | Address proof: Bank statement (checkbox) |
| `office_use.online_access.companies_house` | Online access: Companies House (checkbox) |
| `office_use.online_access.hmrc` | Online access: HMRC (checkbox) |
| `office_use.online_access.paye` | Online access: PAYE (checkbox) |
| `office_use.online_access.vat` | Online access: VAT (checkbox) |
| `office_use.online_access.bank` | Online access: Bank (checkbox) |
| `office_use.online_access.credit_card` | Online access: Credit card (checkbox) |
| `office_use.online_access.other` | Online access: Other (checkbox) |
| `services.bookkeeping` | Service: bookkeeping (boolean) |
| `services.personal_tax_return` | Service: personal tax return (boolean) |
| `services.quarterly_reports` | Service: quarterly reports (boolean) |
| `services.vat` | Service: VAT (boolean) |
| `services.year_end_accounts` | Service: year end accounts (boolean) |
| `services.payroll.enabled` | Payroll enabled (boolean) |
| `services.payroll.employee_count` | Payroll employee count (number) |
| `services.payroll.frequency` | Payroll frequency |
| `signatures.change_accountant.date` | Change-of-accountant letter date |
| `signatures.change_accountant.name` | Change-of-accountant signatory name |
| `signatures.change_accountant.signature` | Stored signature / file ref |
| `signatures.client_registration.date` | Client registration declaration date |
| `signatures.client_registration.name` | Client registration signatory name |
| `signatures.client_registration.position` | Client registration position |
| `signatures.client_registration.signature` | Stored signature / file ref |
| `signatures.direct_debit.date` | Direct debit date |
| `signatures.direct_debit.name` | Direct debit signatory name |
| `signatures.direct_debit.signature` | Stored signature / file ref |
| `signatures.hmrc_64_8.date` | HMRC 64-8 date |
| `signatures.hmrc_64_8.name` | HMRC 64-8 signatory name |
| `signatures.hmrc_64_8.signature` | Stored signature / file ref |
| `signatures.by_form_index.<id>.date` | Mirrored slot date |
| `signatures.by_form_index.<id>.form_key` | Mirrored form key |
| `signatures.by_form_index.<id>.name` | Mirrored name |
| `signatures.by_form_index.<id>.position` | Mirrored position |
| `signatures.by_form_index.<id>.signature` | Mirrored signature |
| `tax.cis_reference` | CIS reference |
| `tax.ni_number` | NI number |
| `tax.paye_ref` | PAYE reference |
| `tax.utr` | UTR |
| `tax.vat_number` | VAT number |
| `tax.vat_quarter` | VAT quarter |

**Client draw on template (not JSON):** `Signature` - see top of this doc.

---

## Reverse lookup - `companies_house.*` (**DocuSeal name** first)

Alphabetical by path. Replace `N` with `0`, `1`, ... for array rows; replace `<K>` for `links` keys.

| **DocuSeal field name** | What it is |
|-------------------------|------------|
| `companies_house.accounts.accounting_reference_day` | Accounting reference day (number) |
| `companies_house.accounts.accounting_reference_month` | Accounting reference month (number) |
| `companies_house.accounts.last_accounts_period_end_on` | Last accounts period end |
| `companies_house.accounts.last_accounts_period_start_on` | Last accounts period start |
| `companies_house.accounts.last_accounts_type` | Last accounts type |
| `companies_house.accounts.next_accounts_due_on` | Next accounts due on |
| `companies_house.accounts.next_accounts_overdue` | Next accounts overdue (boolean) |
| `companies_house.accounts.next_accounts_period_end_on` | Next accounts period end |
| `companies_house.accounts.next_accounts_period_start_on` | Next accounts period start |
| `companies_house.annual_return.last_made_up_to` | Annual return last made up to |
| `companies_house.annual_return.next_due` | Annual return next due |
| `companies_house.annual_return.next_made_up_to` | Annual return next made up to |
| `companies_house.annual_return.overdue` | Annual return overdue (boolean) |
| `companies_house.branch_company_details.business_activity` | Branch business activity |
| `companies_house.branch_company_details.parent_company_name` | Parent company name |
| `companies_house.branch_company_details.parent_company_number` | Parent company number |
| `companies_house.can_file` | Can file (boolean) |
| `companies_house.company_status` | Company status |
| `companies_house.company_status_detail` | Company status detail |
| `companies_house.confirmation_statement.last_made_up_to` | Confirmation statement last made up to |
| `companies_house.confirmation_statement.next_due` | Confirmation statement next due |
| `companies_house.confirmation_statement.next_made_up_to` | Confirmation statement next made up to |
| `companies_house.confirmation_statement.overdue` | Confirmation statement overdue (boolean) |
| `companies_house.date_of_cessation` | Date of cessation |
| `companies_house.date_of_creation` | Date of creation |
| `companies_house.etag` | ETag |
| `companies_house.fetched_at` | Profile fetched at |
| `companies_house.foreign_company_details.business_activity` | Foreign company business activity |
| `companies_house.foreign_company_details.company_type` | Foreign company type |
| `companies_house.foreign_company_details.governed_by` | Governed by |
| `companies_house.foreign_company_details.originating_country` | Originating country |
| `companies_house.foreign_company_details.originating_registry_name` | Originating registry name |
| `companies_house.foreign_company_details.registration_number` | Foreign registration number |
| `companies_house.has_insolvency_history` | Has insolvency history (boolean) |
| `companies_house.jurisdiction` | Jurisdiction |
| `companies_house.links.<K>` | Link URL for key *K* |
| `companies_house.partial_data_available` | Partial data available |
| `companies_house.previous_company_names.N.ceased_on` | Previous name ceased on |
| `companies_house.previous_company_names.N.effective_from` | Previous name effective from |
| `companies_house.previous_company_names.N.name` | Previous company name |
| `companies_house.registered_office_is_in_dispute` | Registered office in dispute (boolean) |
| `companies_house.sic_codes.N` | SIC code row *N* |
| `companies_house.type` | Company type |
| `companies_house.undeliverable_registered_office_address` | Undeliverable registered office (boolean) |
