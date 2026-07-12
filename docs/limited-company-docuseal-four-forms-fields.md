# Limited company — DocuSeal field reference (all four forms)

Complete field-by-field guide for building **four DocuSeal templates** when onboarding a **Limited company** (`company.type` = `Limited company`).

Use this document when placing controls on each PDF in the DocuSeal template editor. Set each control **Name** to the **DocuSeal field name** exactly (character-for-character, including dots).

| App form key | Wizard step | Document | Suggested template name | Env var |
|---|---|---|---|---|
| `form_1` | 1 | Client registration | `LC — Client registration` | `DOCUSEAL_TEMPLATE_ID` |
| `form_2` | 2 | HMRC 64-8 | `LC — HMRC 64-8` | `DOCUSEAL_TEMPLATE_ID_HMRC_64_8` |
| `form_3` | 3 | Change of accountant | `LC — Change of accountant` | `DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT` |
| `form_4` | 4 | Direct debit | `LC — Direct debit` | `DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT` |

**Source of truth:** `frontend/src/types/customerOnboarding.ts` · **Prefill:** `frontend/src/utils/docusealPrefillFromOnboarding.ts`

---

## How prefill works

1. Wizard data is saved as `CustomerOnboardingData` JSON.
2. On **Send signing email**, the app flattens the **entire** JSON into dot-path keys.
3. The backend sends those keys as DocuSeal `submitters[].values`.
4. DocuSeal fills only fields whose **Name** matches a key in the payload.

The **same full payload** is sent for every step; each template only needs the fields that appear on that PDF. Extra keys are ignored.

### Value rules

| JSON type | DocuSeal control | Sent as |
|---|---|---|
| string (non-empty after trim) | Text or Date | string |
| boolean | Checkbox | `true` / `false` (not `"true"`) |
| number | Number | number |
| empty string | — | omitted (blank on PDF) |
| `*.signature` (large `data:` image) | — | omitted (client draws on template) |
| `*.signature` (`file:<uuid>`) | Text | short file reference |

### Read-only at signing

All fields are `readonly: true` except names in `DOCUSEAL_SIGNATURE_FIELD_NAMES` (default: `Signature`).

### Limited company specifics

| Field | DocuSeal name | Notes |
|---|---|---|
| Companies House auth code | `tax.auth_code` | Required for LC |
| Company registration number | `company.number` | Required for LC |
| HMRC agent codes | `agent.agent_code_sa`, `agent.agent_code_ct` | Shown on HMRC 64-8 |
| Directors | `directors.0` … `directors.4` | Up to 5 rows |
| Registered + trading address | `company.registeredAddress.*`, `company.traderAddress.*` | Both collected |

### Signature controls (client draws — not JSON paths)

| Form | DocuSeal signature name (one template per PDF) | Combined template name |
|---|---|---|
| Client registration | `Signature` | `Signature_client_registration` |
| HMRC 64-8 | `Signature` | `Signature_hmrc_64_8` |
| Change of accountant | `Signature` | `Signature_change_accountant` |
| Direct debit | `Signature` | `Signature_direct_debit` |

Combined template env:

```env
DOCUSEAL_SIGNATURE_FIELD_NAMES=Signature_client_registration,Signature_hmrc_64_8,Signature_change_accountant,Signature_direct_debit
```

### Backend env

```env
DOCUSEAL_API_KEY=
DOCUSEAL_TEMPLATE_ID=
DOCUSEAL_TEMPLATE_ID_HMRC_64_8=
DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT=
DOCUSEAL_TEMPLATE_ID_DIRECT_DEBIT=
DOCUSEAL_DEFAULT_SUBMITTER_ROLE=First Party
DOCUSEAL_SIGNATURE_FIELD_NAMES=Signature
DOCUSEAL_WEBHOOK_SECRET=
```

---

# Form 1 — Client registration (`form_1`)

**Wizard:** `ClientRegistrationForm.tsx`  
**PDF:** `frontend/src/utils/onboardingHtmlTemplate.ts`  
**Pages:** 2 (main form + declaration on page 1; office use on page 2)

Legend: **PDF** = appears on the client registration PDF · **Payload** = sent in prefill but not on this PDF (optional to bind)

---

## 1.1 Company information

| # | Wizard / PDF label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 1 | Company name | `company.name` | Text | PDF |
| 2 | Director / proprietor name (1st director) | `directors.0.name` | Text | PDF |
| 3 | Nature of business | `company.nature_of_business` | Text | PDF |
| 4 | Company registration number | `company.number` | Text | PDF |
| 5 | Business type (text) | `company.type` | Text | PDF |
| 6 | Year end | `company.year_end` | Text | PDF |
| 7 | Employer PAYE number (company-level) | `company.paye_number` | Text | Payload |
| 8 | Company status (from CH lookup) | `company.company_status` | Text | PDF |
| 9 | Date of creation (from CH lookup) | `company.date_of_creation` | Text | PDF |
| 10 | Jurisdiction (from CH lookup) | `company.jurisdiction` | Text | PDF |

### Business type checkboxes (exactly one `true` for Limited company)

| # | Option | DocuSeal field name | Control | Value when LC |
|---|---|---|---|---|
| 11 | Limited company | `company.business_type.limited_company` | Checkbox | `true` |
| 12 | Sole trader | `company.business_type.sole_trader` | Checkbox | `false` |
| 13 | Partnership | `company.business_type.partnership` | Checkbox | `false` |
| 14 | LLP | `company.business_type.llp` | Checkbox | `false` |
| 15 | Charity | `company.business_type.charity` | Checkbox | `false` |
| 16 | Other | `company.business_type.other` | Checkbox | `false` |

---

## 1.2 Registered address

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 17 | Address line 1 | `company.registeredAddress.line1` | Text | PDF |
| 18 | City | `company.registeredAddress.city` | Text | PDF |
| 19 | Postcode | `company.registeredAddress.postcode` | Text | PDF |
| 20 | Country | `company.registeredAddress.country` | Text | PDF |

---

## 1.3 Trading address

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 21 | Same as registered address | `company.traderSameAsRegistered` | Checkbox | PDF |
| 22 | Trading address line 1 | `company.traderAddress.line1` | Text | PDF |
| 23 | Trading city | `company.traderAddress.city` | Text | PDF |
| 24 | Trading postcode | `company.traderAddress.postcode` | Text | PDF |
| 25 | Trading country | `company.traderAddress.country` | Text | PDF |

---

## 1.4 Contact

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 26 | Phone | `contact.phone` | Text | PDF |
| 27 | Email | `contact.email` | Text | PDF |

---

## 1.5 Tax references

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 28 | UTR | `tax.utr` | Text | PDF |
| 29 | Auth code (Companies House) | `tax.auth_code` | Text | PDF |
| 30 | VAT number | `tax.vat_number` | Text | PDF |
| 31 | VAT quarter | `tax.vat_quarter` | Text | PDF |
| 32 | PAYE reference | `tax.paye_ref` | Text | PDF |
| 33 | NI number (company-level) | `tax.ni_number` | Text | PDF |
| 34 | CIS reference | `tax.cis_reference` | Text | PDF |

---

## 1.6 Subscription plan

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 35 | Plan name | `subscription_plan_name` | Text | PDF |
| 36 | Plan id | `subscription_plan_id` | Text | Payload |
| 37 | Matrix plan name | `subscription_matrix_plan_name` | Text | PDF |
| 38 | Matrix plan id | `subscription_matrix_plan_id` | Text | Payload |
| 39 | Quoted amount inc. VAT (GBP) | `subscription_matrix_plan_price_inc_vat_gbp` | Number | PDF |
| 40 | Billing cycle | `subscription_billing_cycle` | Text | PDF |
| 41 | Payee users | `subscription_payee_users` | Number | PDF |
| 42 | Dormant (yearly) | `subscription_is_dormant` | Checkbox | PDF |
| 43 | Annual turnover (GBP) | `annual_turnover_gbp` | Number | PDF |
| 44 | Selected services (multiline checklist) | `subscription_selected_services_text` | Text (multi-line) | PDF |

**Per-row catalogue services** (alternative to field 44; `N` = 0, 1, 2, … as selected):

| Label | DocuSeal field name | Control |
|---|---|---|
| Service id (row N) | `subscription_selected_services.N.id` | Text |
| Service name (row N) | `subscription_selected_services.N.name` | Text |
| Selected id (row N) | `subscription_selected_service_ids.N` | Text |

---

## 1.7 Legacy services flags (in JSON payload; optional on PDF)

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 45 | Bookkeeping | `services.bookkeeping` | Checkbox |
| 46 | VAT | `services.vat` | Checkbox |
| 47 | Quarterly reports | `services.quarterly_reports` | Checkbox |
| 48 | Year end accounts | `services.year_end_accounts` | Checkbox |
| 49 | Personal tax return | `services.personal_tax_return` | Checkbox |
| 50 | Payroll enabled | `services.payroll.enabled` | Checkbox |
| 51 | Payroll employee count | `services.payroll.employee_count` | Number |
| 52 | Payroll frequency | `services.payroll.frequency` | Text |

---

## 1.8 Directors table (5 rows — director 1 through 5)

PDF always shows 5 rows. Bind all rows; unused rows stay blank.

### Director 1 (`directors.0`)

| # | Column | DocuSeal field name | Control |
|---|---|---|---|
| 53 | Name | `directors.0.name` | Text |
| 54 | Home address | `directors.0.address` | Text |
| 55 | City | `directors.0.city` | Text |
| 56 | Postcode | `directors.0.postcode` | Text |
| 57 | Personal UTR | `directors.0.personal_utr` | Text |
| 58 | NI number | `directors.0.ni_number` | Text |
| 59 | Date of birth | `directors.0.date_of_birth` | Date/Text |
| 60 | PAYE reference | `directors.0.paye_reference` | Text |
| 61 | Identity verification code | `directors.0.identity_verification_code` | Text |

### Director 2 (`directors.1`)

| # | Column | DocuSeal field name | Control |
|---|---|---|---|
| 62 | Name | `directors.1.name` | Text |
| 63 | Home address | `directors.1.address` | Text |
| 64 | City | `directors.1.city` | Text |
| 65 | Postcode | `directors.1.postcode` | Text |
| 66 | Personal UTR | `directors.1.personal_utr` | Text |
| 67 | NI number | `directors.1.ni_number` | Text |
| 68 | Date of birth | `directors.1.date_of_birth` | Date/Text |
| 69 | PAYE reference | `directors.1.paye_reference` | Text |
| 70 | Identity verification code | `directors.1.identity_verification_code` | Text |

### Director 3 (`directors.2`)

| # | Column | DocuSeal field name | Control |
|---|---|---|---|
| 71 | Name | `directors.2.name` | Text |
| 72 | Home address | `directors.2.address` | Text |
| 73 | City | `directors.2.city` | Text |
| 74 | Postcode | `directors.2.postcode` | Text |
| 75 | Personal UTR | `directors.2.personal_utr` | Text |
| 76 | NI number | `directors.2.ni_number` | Text |
| 77 | Date of birth | `directors.2.date_of_birth` | Date/Text |
| 78 | PAYE reference | `directors.2.paye_reference` | Text |
| 79 | Identity verification code | `directors.2.identity_verification_code` | Text |

### Director 4 (`directors.3`)

| # | Column | DocuSeal field name | Control |
|---|---|---|---|
| 80 | Name | `directors.3.name` | Text |
| 81 | Home address | `directors.3.address` | Text |
| 82 | City | `directors.3.city` | Text |
| 83 | Postcode | `directors.3.postcode` | Text |
| 84 | Personal UTR | `directors.3.personal_utr` | Text |
| 85 | NI number | `directors.3.ni_number` | Text |
| 86 | Date of birth | `directors.3.date_of_birth` | Date/Text |
| 87 | PAYE reference | `directors.3.paye_reference` | Text |
| 88 | Identity verification code | `directors.3.identity_verification_code` | Text |

### Director 5 (`directors.4`)

| # | Column | DocuSeal field name | Control |
|---|---|---|---|
| 89 | Name | `directors.4.name` | Text |
| 90 | Home address | `directors.4.address` | Text |
| 91 | City | `directors.4.city` | Text |
| 92 | Postcode | `directors.4.postcode` | Text |
| 93 | Personal UTR | `directors.4.personal_utr` | Text |
| 94 | NI number | `directors.4.ni_number` | Text |
| 95 | Date of birth | `directors.4.date_of_birth` | Date/Text |
| 96 | PAYE reference | `directors.4.paye_reference` | Text |
| 97 | Identity verification code | `directors.4.identity_verification_code` | Text |

---

## 1.9 Declaration (page 1 footer)

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 98 | Authorised signatory name | `signatures.client_registration.name` | Text | PDF |
| 99 | Position | `signatures.client_registration.position` | Text | PDF |
| 100 | Date | `signatures.client_registration.date` | Date/Text | PDF |
| 101 | Stored signature ref | `signatures.client_registration.signature` | Text | Payload |
| 102 | Client draws signature | `Signature` | **Signature** | PDF |

### Mirror slot (optional)

| DocuSeal field name |
|---|
| `signatures.by_form_index.1.form_key` |
| `signatures.by_form_index.1.name` |
| `signatures.by_form_index.1.position` |
| `signatures.by_form_index.1.date` |
| `signatures.by_form_index.1.signature` |

---

## 1.10 Office use only (page 2)

| # | Label | DocuSeal field name | Control | PDF |
|---|---|---|---|---|
| 103 | Director photo ID — Passport | `office_use.director_photo_id.passport` | Checkbox | PDF |
| 104 | Director photo ID — Driving licence | `office_use.director_photo_id.driving_license` | Checkbox | PDF |
| 105 | Address proof — Utility bill | `office_use.address_proof.utility_bill` | Checkbox | PDF |
| 106 | Address proof — Bank statement | `office_use.address_proof.bank_statement` | Checkbox | PDF |
| 107 | Online access — Companies House | `office_use.online_access.companies_house` | Checkbox | PDF |
| 108 | Online access — HMRC | `office_use.online_access.hmrc` | Checkbox | PDF |
| 109 | Online access — PAYE | `office_use.online_access.paye` | Checkbox | PDF |
| 110 | Online access — VAT | `office_use.online_access.vat` | Checkbox | PDF |
| 111 | Online access — Bank | `office_use.online_access.bank` | Checkbox | PDF |
| 112 | Online access — Credit card | `office_use.online_access.credit_card` | Checkbox | PDF |
| 113 | Online access — Other | `office_use.online_access.other` | Checkbox | PDF |
| 114 | Notes | `office_use.noted` | Text (multi-line) | PDF |
| 115 | Notes (alias) | `office_use.notes` | Text | PDF |
| 116 | Internal remarks | `office_use.internal_remarks` | Text (multi-line) | PDF |
| 117 | Approval status | `office_use.approval_status` | Text | PDF |

---

## 1.11 Companies House snapshot (optional — after lookup)

Present only when a Companies House lookup was run. All paths are flattened automatically.

### Top level

| DocuSeal field name | Control |
|---|---|
| `companies_house.fetched_at` | Text |
| `companies_house.etag` | Text |
| `companies_house.company_status` | Text |
| `companies_house.company_status_detail` | Text |
| `companies_house.date_of_creation` | Text |
| `companies_house.date_of_cessation` | Text |
| `companies_house.jurisdiction` | Text |
| `companies_house.type` | Text |
| `companies_house.partial_data_available` | Text |
| `companies_house.can_file` | Checkbox |
| `companies_house.registered_office_is_in_dispute` | Checkbox |
| `companies_house.undeliverable_registered_office_address` | Checkbox |
| `companies_house.has_insolvency_history` | Checkbox |

### SIC codes (array)

| DocuSeal field name | Control |
|---|---|
| `companies_house.sic_codes.0` | Text |
| `companies_house.sic_codes.1` | Text |
| `companies_house.sic_codes.2` | Text |
| `companies_house.sic_codes.3` | Text |
| *(add `.N` for more)* | Text |

### Accounts

| DocuSeal field name | Control |
|---|---|
| `companies_house.accounts.accounting_reference_day` | Number |
| `companies_house.accounts.accounting_reference_month` | Number |
| `companies_house.accounts.last_accounts_period_end_on` | Text |
| `companies_house.accounts.last_accounts_period_start_on` | Text |
| `companies_house.accounts.last_accounts_type` | Text |
| `companies_house.accounts.next_accounts_due_on` | Text |
| `companies_house.accounts.next_accounts_overdue` | Checkbox |
| `companies_house.accounts.next_accounts_period_end_on` | Text |
| `companies_house.accounts.next_accounts_period_start_on` | Text |

### Confirmation statement

| DocuSeal field name | Control |
|---|---|
| `companies_house.confirmation_statement.last_made_up_to` | Text |
| `companies_house.confirmation_statement.next_due` | Text |
| `companies_house.confirmation_statement.next_made_up_to` | Text |
| `companies_house.confirmation_statement.overdue` | Checkbox |

### Annual return

| DocuSeal field name | Control |
|---|---|
| `companies_house.annual_return.last_made_up_to` | Text |
| `companies_house.annual_return.next_due` | Text |
| `companies_house.annual_return.next_made_up_to` | Text |
| `companies_house.annual_return.overdue` | Checkbox |

### Branch company details

| DocuSeal field name | Control |
|---|---|
| `companies_house.branch_company_details.business_activity` | Text |
| `companies_house.branch_company_details.parent_company_name` | Text |
| `companies_house.branch_company_details.parent_company_number` | Text |

### Foreign company details

| DocuSeal field name | Control |
|---|---|
| `companies_house.foreign_company_details.business_activity` | Text |
| `companies_house.foreign_company_details.registration_number` | Text |
| `companies_house.foreign_company_details.originating_country` | Text |
| `companies_house.foreign_company_details.originating_registry_name` | Text |
| `companies_house.foreign_company_details.company_type` | Text |
| `companies_house.foreign_company_details.governed_by` | Text |

### Previous company names (row N = 0, 1, …)

| DocuSeal field name | Control |
|---|---|
| `companies_house.previous_company_names.N.name` | Text |
| `companies_house.previous_company_names.N.effective_from` | Text |
| `companies_house.previous_company_names.N.ceased_on` | Text |

### Links (key K from API)

| DocuSeal field name | Control |
|---|---|
| `companies_house.links.self` | Text |
| `companies_house.links.<K>` | Text |

---

# Form 2 — HMRC 64-8 (`form_2`)

**Wizard:** `Hmrc648AuthorisationForm.tsx`  
**PDF:** `frontend/src/utils/hmrc648HtmlTemplate.ts`  
**Pages:** 3 (pages 1–2 submitted; page 3 notes only)

---

## 2.1 Client / company block

| # | Label on PDF | DocuSeal field name | Control |
|---|---|---|---|
| 1 | I (print your name) | `signatures.hmrc_64_8.name` | Text |
| 2 | Of (company name) | `company.name` | Text |
| 3 | Registered office — line 1 | `company.registeredAddress.line1` | Text |
| 4 | Registered office — city | `company.registeredAddress.city` | Text |
| 5 | Postcode | `company.registeredAddress.postcode` | Text |
| 6 | Registered office — country | `company.registeredAddress.country` | Text |
| 7 | Phone number | `contact.phone` | Text |
| 8 | Signature date | `signatures.hmrc_64_8.date` | Date/Text |
| 9 | Stored signature ref | `signatures.hmrc_64_8.signature` | Text |
| 10 | Drawn signature | `Signature` | **Signature** |

---

## 2.2 Agent block (practice defaults)

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 11 | Agent name | `agent.name` | Text |
| 12 | Agent address | `agent.address` | Text |
| 13 | Agent postcode | `agent.postcode` | Text |
| 14 | Agent phone | `agent.phone` | Text |
| 15 | Agent code (SA) | `agent.agent_code_sa` | Text |
| 16 | Agent code (CT) | `agent.agent_code_ct` | Text |
| 17 | Client reference | `agent.client_reference` | Text |

---

## 2.3 Tax authorisation checkboxes

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 18 | Self Assessment | `authorization.self_assessment` | Checkbox |
| 19 | Partnership | `authorization.partnership` | Checkbox |
| 20 | Trust | `authorization.trust` | Checkbox |
| 21 | VAT | `authorization.vat` | Checkbox |
| 22 | PAYE (employers) | `authorization.paye` | Checkbox |

---

## 2.4 Tax reference numbers

Use one Text field per reference; the PDF may render digit boxes from the same value.

| # | Label | DocuSeal field name | Control | Notes |
|---|---|---|---|---|
| 23 | National Insurance number | `tax.ni_number` | Text | 9 characters |
| 24 | Unique Tax Reference (UTR) | `tax.utr` | Text | 10 characters |
| 25 | VAT registration number | `tax.vat_number` | Text | 9 characters |
| 26 | CIS reference | `tax.cis_reference` | Text | |
| 27 | PAYE reference | `tax.paye_ref` | Text | 12 characters |
| 28 | Company registration number | `company.number` | Text | Corporation Tax (LC) |
| 29 | Auth code | `tax.auth_code` | Text | Payload (LC) |
| 30 | VAT quarter | `tax.vat_quarter` | Text | Payload |

---

## 2.5 Mirror slot (optional)

| DocuSeal field name |
|---|
| `signatures.by_form_index.2.form_key` |
| `signatures.by_form_index.2.name` |
| `signatures.by_form_index.2.date` |
| `signatures.by_form_index.2.signature` |

---

# Form 3 — Change of accountant (`form_3`)

**Wizard:** `ChangeOfAccountantForm.tsx`  
**PDF:** `frontend/src/utils/changeAccountantHtmlTemplate.ts`  
**Pages:** 1

**Static text on PDF (do not bind):** Practice letterhead — “3K Financial & Accounting Services Ltd”, “128 City Road, London EC1V 2NX”, letter body boilerplate.

---

## 3.1 Previous accountant (recipient)

| # | Label on PDF | DocuSeal field name | Control |
|---|---|---|---|
| 1 | Recipient name | `change_of_accountant.previous_accountant_name` | Text |
| 2 | Address line 1 | `change_of_accountant.previous_accountant_address.line1` | Text |
| 3 | City | `change_of_accountant.previous_accountant_address.city` | Text |
| 4 | Postcode | `change_of_accountant.previous_accountant_address.postcode` | Text |
| 5 | Country | `change_of_accountant.previous_accountant_address.country` | Text |

---

## 3.2 Letter date

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 6 | Date | `signatures.change_accountant.date` | Date/Text |

---

## 3.3 Authorised signatory block (footer)

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 7 | Trading / company name | `company.name` | Text |
| 8 | Registered address — line 1 | `company.registeredAddress.line1` | Text |
| 9 | Registered address — city | `company.registeredAddress.city` | Text |
| 10 | Registered address — postcode | `company.registeredAddress.postcode` | Text |
| 11 | Registered address — country | `company.registeredAddress.country` | Text |
| 12 | Authorised signatory name | `signatures.change_accountant.name` | Text |
| 13 | Stored signature ref | `signatures.change_accountant.signature` | Text |
| 14 | Drawn signature | `Signature` | **Signature** |

---

## 3.4 Mirror slot (optional)

| DocuSeal field name |
|---|
| `signatures.by_form_index.3.form_key` |
| `signatures.by_form_index.3.name` |
| `signatures.by_form_index.3.date` |
| `signatures.by_form_index.3.signature` |

---

# Form 4 — Direct debit (`form_4`)

**Wizard:** `DirectDebitForm.tsx`  
**PDF:** `frontend/src/utils/directDebitHtmlTemplate.ts`  
**Pages:** 1

**Static text on PDF (do not bind):** Service User Number `275069`, practice header address, Direct Debit Guarantee boilerplate.

---

## 4.1 Company and bank details

| # | Label on PDF | DocuSeal field name | Control | Notes |
|---|---|---|---|---|
| 1 | Company name / Reference | `company.name` | Text | Same field for both labels |
| 2 | Account holder name | `bank.account_holder_name` | Text | |
| 3 | Account number | `bank.account_number` | Text | 8 digits |
| 4 | Sort code | `bank.sort_code` | Text | 6 digits |
| 5 | Bank / building society address | `bank.bank_address` | Text (multi-line) | |

---

## 4.2 Signature block

| # | Label | DocuSeal field name | Control |
|---|---|---|---|
| 6 | Signatory name | `signatures.direct_debit.name` | Text |
| 7 | Date | `signatures.direct_debit.date` | Date/Text |
| 8 | Stored signature ref | `signatures.direct_debit.signature` | Text |
| 9 | Drawn signature | `Signature` | **Signature** |

---

## 4.3 Mirror slot (optional)

| DocuSeal field name |
|---|
| `signatures.by_form_index.4.form_key` |
| `signatures.by_form_index.4.name` |
| `signatures.by_form_index.4.date` |
| `signatures.by_form_index.4.signature` |

---

# Copy-paste checklists (DocuSeal field names)

Use when adding controls in the DocuSeal editor. One name per control.

## Form 1 — Client registration

```
company.name
directors.0.name
company.nature_of_business
company.number
company.type
company.year_end
company.company_status
company.date_of_creation
company.jurisdiction
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
company.traderSameAsRegistered
company.traderAddress.line1
company.traderAddress.city
company.traderAddress.postcode
company.traderAddress.country
contact.phone
contact.email
tax.utr
tax.auth_code
tax.vat_number
tax.vat_quarter
tax.paye_ref
tax.ni_number
tax.cis_reference
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

## Form 2 — HMRC 64-8

```
signatures.hmrc_64_8.name
company.name
company.registeredAddress.line1
company.registeredAddress.city
company.registeredAddress.postcode
company.registeredAddress.country
contact.phone
signatures.hmrc_64_8.date
Signature
agent.name
agent.address
agent.postcode
agent.phone
agent.agent_code_sa
agent.agent_code_ct
agent.client_reference
authorization.self_assessment
authorization.partnership
authorization.trust
authorization.vat
authorization.paye
tax.ni_number
tax.utr
tax.vat_number
tax.cis_reference
tax.paye_ref
company.number
```

## Form 3 — Change of accountant

```
change_of_accountant.previous_accountant_name
change_of_accountant.previous_accountant_address.line1
change_of_accountant.previous_accountant_address.city
change_of_accountant.previous_accountant_address.postcode
change_of_accountant.previous_accountant_address.country
signatures.change_accountant.date
company.name
company.registeredAddress.line1
company.registeredAddress.city
company.registeredAddress.postcode
company.registeredAddress.country
signatures.change_accountant.name
Signature
```

## Form 4 — Direct debit

```
company.name
bank.account_holder_name
bank.account_number
bank.sort_code
bank.bank_address
signatures.direct_debit.name
signatures.direct_debit.date
Signature
```

---

## Verify before go-live

1. Create a test **Limited company** customer with data in all four steps.
2. DevTools → Network → `signature-email-request` → confirm `fieldValues` keys.
3. If keys exist but DocuSeal is blank → field **Name** mismatch in template.
4. After signing → webhook should update `signatures.*.signature`.

## Related docs

- `docs/docuseal-onboarding-limited-company.md` — shorter LC overview
- `docs/docuseal-onboarding-templates.md` — all business types + full reverse lookup
- `frontend/src/utils/docusealPrefillFromOnboarding.ts` — prefill implementation
