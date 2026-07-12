# Mobile Create Customer - Complete Implementation Plan

This document defines the full implementation plan for bringing the web "Create Customer" flow to the mobile repository, including UI/UX approach, state management, sync strategy, validation gates, and all APIs used by the flow.

---

## 1) Goal

Deliver a mobile-first onboarding experience with functional parity to web:

- 5-step create customer journey
- draft + resume support
- in-person and remote (DocuSeal email) signatures
- final customer creation completion
- customer portal user creation with role assignment

The mobile flow should reuse existing backend contracts and business rules without introducing API changes.

---

## 2) Existing Web Flow (Reference Behavior)

Main orchestration in web:

- `frontend/src/pages/NewCustomerPage.tsx`
- `frontend/src/components/customer-onboarding/CustomerOnboardingWizard.tsx`
- `frontend/src/components/customer-onboarding/ClientRegistrationForm.tsx`
- `frontend/src/components/customer-onboarding/finalreviewandsignature.tsx`
- `frontend/src/utils/onboardingSigningGate.ts`

Core behavior to preserve:

1. Do not create server customer until company/trader name exists.
2. Once name is available, create minimal customer + form submission draft.
3. Auto-save and patch server while filling form.
4. On final step, enforce strict completion gates (signatures + portal user inputs).
5. Mark submission completed, then create portal login.
6. Show one-time portal credentials modal after success.

---

## 3) Mobile UX + Theme Plan

### 3.1 Screen Structure

Implement as a 5-step wizard with a persistent progress header:

- Step 1: Registration (company/trader, contacts, tax, subscription, office-use)
- Step 2: HMRC 64-8
- Step 3: Change of Accountant
- Step 4: Direct Debit
- Step 5: Review & Sign + portal login details + final create

### 3.2 Mobile Interaction Design

- Sticky bottom action bar:
  - `Back`
  - `Save draft`
  - `Next` (steps 1-4) or `Create customer` (step 5)
- Use accordions/sections to reduce vertical fatigue on long forms.
- Signature entry:
  - in-person mode: per-form signature capture on device
  - remote mode: single recipient email triggers all 4 DocuSeal requests
- Use full-screen modal or dedicated screen for signature pad.
- Use confirmation modal before final create.

### 3.3 Theme Compatibility

Mirror web semantic tokens, not raw hex coupling:

- `brand`, `brandForeground`
- `surface`, `surfaceRaised`, `surfaceMuted`
- `ink`, `inkSoft`, `muted`
- `border`, `borderSubtle`
- `danger`, `warning`, `success`

Support:

- light/dark modes
- persisted theme preference
- graceful fallback to OS appearance

---

## 4) Mobile Data + State Architecture

### 4.1 Canonical State

Maintain one canonical onboarding state object equivalent to web:

- `CustomerOnboardingData` shape from `frontend/src/types/customerOnboarding.ts`

Also maintain:

- `step`
- `customerId`
- `submissionId`
- `formSubmissionRow` (latest metadata/status)
- `portalUserRoleId`
- `portalUserPassword`
- async flags/errors for lookup/saving/subscriptions/roles/signing

### 4.2 Local Draft Envelope

Persist local draft in storage (AsyncStorage/MMKV):

- `step`
- `data` (CustomerOnboardingData)
- `customerId` (optional until created)
- `submissionId` (optional until created)
- `lastSyncedAt`

### 4.3 Sync Strategy

- Debounced auto-save to server when `customerId` and `submissionId` exist.
- Manual `Save draft` always available once company name exists.
- Flush local draft on app background.
- Add simple patch queue + retry for transient network failures.

---

## 5) End-to-End Flow Sequence (Mobile)

### 5.1 Start / Resume

- New flow:
  - initialize empty `CustomerOnboardingData`
  - no server create until company/trader name present
- Resume flow:
  - fetch customer by id
  - fetch latest form submission
  - revive onboarding data from latest submission
  - if latest submission is completed, redirect to customer details

### 5.2 Ensure Server Draft

When name first becomes non-empty:

1. `POST /api/customers`
2. normalize/upload onboarding data assets if required
3. `POST /api/customers/:customerId/form-submissions` with wizard step
4. cache `customerId` + `submissionId`

Important:

- Guard with in-flight promise lock to prevent duplicate creates.

### 5.3 Ongoing Save

On field changes:

1. `PATCH /api/customers/:id` (name, planId, annualTurnoverGbp, optional onboardingData)
2. `PATCH /api/customers/:id/form-submissions/:submissionId` with `data`, `wizardStep`

### 5.4 Signature Step

Mode selection:

- `in_person`
- `remote_email`

Remote email path:

- send all 4 signature email requests (one per form target)
- refresh latest submission metadata for DocuSeal status
- block final create while any DocuSeal slot is still awaiting completion

### 5.5 Final Create

Before enabling create:

- must be on step 5
- company/trader name present
- signature gate satisfied (`canFinishOnboarding` parity)
- valid portal email
- portal role selected
- optional portal password is blank or >= 8 chars

Execution:

1. ensure customer + submission ids exist
2. patch customer with final payload
3. patch form submission with `status: completed`, `wizardStep: 5`
4. create portal user
5. show credentials once, clear local draft, navigate

---

## 6) Complete API Contract List (Create Customer Flow)

All endpoints below are currently used by the web flow and should be integrated in mobile.

## 6.1 Auth / Session

- `GET /api/auth/status`
  - Purpose: detect whether auth is required.
- `GET /api/auth/me`
  - Purpose: fetch effective permissions/roles and portal identity context.

## 6.2 Customer Core

- `POST /api/customers`
  - Body:
    - `name: string` (required)
    - `planId?: string`
    - `annualTurnoverGbp?: number`
    - `onboardingData?: object`
  - Used for initial draft customer row.

- `PATCH /api/customers/:customerId`
  - Body (any subset):
    - `name?: string`
    - `planId?: string | null`
    - `annualTurnoverGbp?: number`
    - `onboardingData?: object`
    - `accountStatus?: "draft" | "proposed" | "active" | "inactive"` (if exposed in mobile admin controls)

- `GET /api/customers/:customerId`
  - Used for resume path.

## 6.3 Form Submission Lifecycle

- `POST /api/customers/:customerId/form-submissions`
  - Body:
    - `data?: object`
    - `wizardStep?: number`
  - Creates initial draft submission.

- `PATCH /api/customers/:customerId/form-submissions/:submissionId`
  - Body:
    - `data?: object`
    - `status?: "draft" | "completed"`
    - `wizardStep?: number`
  - Used for save-as-you-go and completion.

- `GET /api/customers/:customerId/form-submissions/latest`
  - Used for resume and signature metadata refresh.

- `POST /api/customers/form-submission-statuses` (optional batch optimization)
  - Body:
    - `customerIds: string[]`
  - Useful for dashboards/list screens.

## 6.4 Company Lookup (Step 1)

- `GET /api/company-lookup/search?q=...&start_index=...&items_per_page=...`
  - Used for search results.

- `GET /api/company-lookup/complete?company_number=...`
  - Returns complete profile bundle; mapped to onboarding patch data.

## 6.5 Subscription Recommendation + Services (Step 1)

- `GET /api/subscriptions/services?activeOnly=true`
  - Used for feature/service filter checkboxes.

- `POST /api/subscriptions/recommend`
  - Body:
    - `customerType: string`
    - `billingCycle: "monthly" | "yearly"`
    - `turnover: number`
    - `payeeUsers: number`
    - `isDormant?: boolean`
    - `serviceIds?: string[]`
  - Returns recommended plans and pricing breakdown.

## 6.6 Signature Email (DocuSeal)

- `POST /api/customers/:customerId/form-submissions/:submissionId/signature-email-request`
  - Body:
    - `recipientEmail: string`
    - `recipientName?: string`
    - `role?: string`
    - `fieldValues?: Record<string, string | boolean | number>`
    - `signatureTarget?: "client_registration" | "hmrc_64_8" | "change_accountant" | "direct_debit"`
  - In remote mode, call 4 times (one per target).

## 6.7 Portal User Setup (Final Step)

- `GET /api/customers/portal-user/roles`
  - Load assignable customer portal roles.

- `POST /api/customers/:customerId/portal-user`
  - Body:
    - `roleId: string` (required)
    - `email?: string`
    - `password?: string` (min 8 when provided)
  - Returns one-time credentials:
    - `email`
    - `password`

## 6.8 Supporting File Upload API (if signature data URLs are persisted as files)

- `POST /api/files/upload` (multipart)
  - Used by web helper path for onboarding signature blobs.
  - Mobile should support this if using same normalize/persist strategy.

---

## 7) Validation Rules to Keep Exactly

- Company/trader name required before server draft creation.
- No completion before step 5.
- `capture_mode` must be `in_person` or `remote_email`.
- All 4 signature slots must contain stored signature image reference.
- In remote mode, completion blocked while any DocuSeal slot is awaiting.
- Portal email must be valid.
- Portal role id required.
- Password either empty (auto-generated) or min length 8.

---

## 8) Error Handling + Resilience

- Normalize API errors into user-facing categories:
  - validation
  - auth/permission
  - network offline
  - server failure
- Retry policy:
  - no retry for 4xx validation/auth
  - retry with backoff for network/5xx
- Keep idempotent lock around customer draft creation.
- Never clear local draft until final create path succeeds.

---

## 9) Delivery Plan (Phased)

### Phase A - Foundation

- auth context integration
- API client wrappers
- theme/token setup
- onboarding store + local draft persistence

### Phase B - Draft + Steps 1-2

- step 1 registration + company lookup + subscription recommend
- ensure server draft
- autosave/manual save
- step 2 forms

### Phase C - Steps 3-5 + Signatures

- step 3 + step 4 forms
- step 5 signing modes
- DocuSeal request orchestration
- completion gating

### Phase D - Finalization + Hardening

- portal user creation and one-time credentials UI
- resume/deeplink polish
- offline retry queue
- QA fixes

---

## 10) QA Acceptance Checklist

- New customer flow works end-to-end from clean install/session.
- Resume draft works after app restart.
- No duplicate customers from fast typing/navigation.
- Remote signature mode blocks create until all 4 are completed.
- In-person mode completion independent from stale DocuSeal pending flags.
- Portal role loading and creation works with and without explicit password.
- Credentials shown once after successful create.
- Local draft cleared only on successful final completion.

---

## 11) Implementation Notes for Mobile Repo

- Keep API method names close to web client naming for maintainability:
  - `createCustomer`
  - `patchCustomer`
  - `createCustomerFormSubmission`
  - `patchCustomerFormSubmission`
  - `fetchLatestCustomerFormSubmission`
  - `fetchCustomerPortalAssignableRoles`
  - `createCustomerPortalUser`
- Keep onboarding data keys in snake_case to match backend payload expectations.
- Reuse same completion-gate logic semantics from web (`canFinishOnboarding` behavior).

