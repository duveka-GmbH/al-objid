# Billing Module Unit Test Specification

This document specifies unit tests for all functions in the `ninja-backend/src/billing` module.

## Table of Contents

1. [getUserPermission.ts](#getuserpermissionts)
2. [stages/claiming.ts](#stagesclaimingts)
3. [stages/permission.ts](#stagespermissionts)
4. [stages/dunning.ts](#stagesdunningts)
5. [stages/blocking.ts](#stagesblockingts)
6. [stages/binding.ts](#stagesbindingts)
7. [touchActivityLogging.ts](#touchactivityloggingts)
8. [successPostprocessing.ts](#successpostprocessingts)
9. [CacheManager.ts](#cachemanagerts)
10. [decorators.ts](#decoratorsts)
11. [preprocessBilling.ts](#preprocessbillingts)
12. [writebacks.ts](#writebacksts)

---

## getUserPermission.ts

### TestExports Required

```typescript
export const TestExports = {
    normalize,
    getDomain,
};
```

### Function: `normalize`

**Signature:** `function normalize(value: string | undefined): string`

**Purpose:** Normalizes strings for comparison by converting to lowercase and trimming whitespace.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Standard string | `value = "Test"` | `normalize(value)` | `"test"` |
| 2 | String with leading whitespace | `value = "  Test"` | `normalize(value)` | `"test"` |
| 3 | String with trailing whitespace | `value = "Test  "` | `normalize(value)` | `"test"` |
| 4 | String with both whitespace | `value = "  Test  "` | `normalize(value)` | `"test"` |
| 5 | Already lowercase | `value = "test"` | `normalize(value)` | `"test"` |
| 6 | Mixed case | `value = "TeSt"` | `normalize(value)` | `"test"` |
| 7 | Empty string | `value = ""` | `normalize(value)` | `""` |
| 8 | Undefined | `value = undefined` | `normalize(value)` | `""` |
| 9 | Only whitespace | `value = "   "` | `normalize(value)` | `""` |
| 10 | Email format | `value = "  User@Example.COM  "` | `normalize(value)` | `"user@example.com"` |

---

### Function: `getDomain`

**Signature:** `function getDomain(email: string): string`

**Purpose:** Extracts and normalizes the domain part from an email address.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Standard email | `email = "user@example.com"` | `getDomain(email)` | `"example.com"` |
| 2 | Mixed case domain | `email = "user@Example.COM"` | `getDomain(email)` | `"example.com"` |
| 3 | Subdomain | `email = "user@mail.example.com"` | `getDomain(email)` | `"mail.example.com"` |
| 4 | No @ symbol | `email = "userexample.com"` | `getDomain(email)` | `""` |
| 5 | Multiple @ symbols | `email = "user@@example.com"` | `getDomain(email)` | `"@example.com"` |
| 6 | Empty string | `email = ""` | `getDomain(email)` | `""` |
| 7 | Only @ symbol | `email = "@"` | `getDomain(email)` | `""` |
| 8 | @ at start | `email = "@example.com"` | `getDomain(email)` | `"example.com"` |
| 9 | @ at end | `email = "user@"` | `getDomain(email)` | `""` |
| 10 | Domain with whitespace | `email = "user@ example.com "` | `getDomain(email)` | `"example.com"` |

---

### Function: `getUserPermission` (exported)

**Signature:** `function getUserPermission(organization: OrganizationInfo, gitEmail: string): UserPermissionResult`

**Purpose:** Determines user permission status within an organization. Returns:
- `true`: Explicitly allowed (in users array)
- `false`: Explicitly denied (in deniedUsers array)
- `"ALLOWED"`: Implicitly allowed via domain
- `"ALLOWED_PENDING"`: Implicitly allowed via pending domain
- `"DENY"`: Denied due to denyUnknownDomains
- `undefined`: Unknown user

**Type:** Pure

#### Test Cases: Empty/Invalid Email

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Empty email string | `org = { users: ["user@example.com"], ... }`, `email = ""` | `getUserPermission(org, email)` | `undefined` |
| 2 | Whitespace-only email | `org = { users: ["user@example.com"], ... }`, `email = "   "` | `getUserPermission(org, email)` | `undefined` |

#### Test Cases: Explicit Allow (users array)

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 3 | User in users list (exact) | `org = { users: ["user@example.com"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `true` |
| 4 | User in users list (case insensitive) | `org = { users: ["User@Example.COM"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `true` |
| 5 | User in users list (email with spaces) | `org = { users: ["user@example.com"], ... }`, `email = "  user@example.com  "` | `getUserPermission(org, email)` | `true` |
| 6 | User in list with whitespace stored | `org = { users: ["  User@Example.COM  "], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `true` |

#### Test Cases: Explicit Deny (deniedUsers array)

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | User in denied list | `org = { deniedUsers: ["user@example.com"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `false` |
| 8 | User in denied list (case insensitive) | `org = { deniedUsers: ["User@Example.COM"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `false` |
| 9 | User in both lists (allow takes precedence) | `org = { users: ["user@example.com"], deniedUsers: ["user@example.com"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `true` |

#### Test Cases: Implicit Allow via Domain (domains array)

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 10 | Domain match | `org = { domains: ["example.com"], ... }`, `email = "anyone@example.com"` | `getUserPermission(org, email)` | `"ALLOWED"` |
| 11 | Domain match (case insensitive) | `org = { domains: ["Example.COM"], ... }`, `email = "anyone@example.com"` | `getUserPermission(org, email)` | `"ALLOWED"` |
| 12 | Domain match with subdomain (no match) | `org = { domains: ["example.com"], ... }`, `email = "user@sub.example.com"` | `getUserPermission(org, email)` | `undefined` |
| 13 | Subdomain in list | `org = { domains: ["sub.example.com"], ... }`, `email = "user@sub.example.com"` | `getUserPermission(org, email)` | `"ALLOWED"` |

#### Test Cases: Implicit Allow via Pending Domain (pendingDomains array)

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 14 | Pending domain match | `org = { pendingDomains: ["example.com"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `"ALLOWED_PENDING"` |
| 15 | Domain in both domains and pendingDomains | `org = { domains: ["example.com"], pendingDomains: ["example.com"], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `"ALLOWED"` |

#### Test Cases: Deny via denyUnknownDomains

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 16 | Unknown domain with denyUnknownDomains true | `org = { domains: ["company.com"], denyUnknownDomains: true, ... }`, `email = "user@other.com"` | `getUserPermission(org, email)` | `"DENY"` |
| 17 | Unknown domain with denyUnknownDomains false | `org = { domains: ["company.com"], denyUnknownDomains: false, ... }`, `email = "user@other.com"` | `getUserPermission(org, email)` | `undefined` |

#### Test Cases: Unknown User

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 18 | No matching rules | `org = { users: [], deniedUsers: [], domains: [], pendingDomains: [], ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |
| 19 | All arrays undefined | `org = { ... }` (no arrays), `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |

#### Test Cases: Edge Cases with Nullable Arrays

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 20 | users is undefined | `org = { users: undefined, ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |
| 21 | deniedUsers is undefined | `org = { deniedUsers: undefined, ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |
| 22 | domains is undefined | `org = { domains: undefined, ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |
| 23 | pendingDomains is undefined | `org = { pendingDomains: undefined, ... }`, `email = "user@example.com"` | `getUserPermission(org, email)` | `undefined` |

---

## stages/claiming.ts

### TestExports Required

```typescript
export const TestExports = {
    normalize,
    getDomain,
    handleClaimResult,
};
```

### Function: `normalize`

Same as `getUserPermission.ts` - tests can be shared or duplicated for isolation.

### Function: `getDomain`

Same as `getUserPermission.ts` - tests can be shared or duplicated for isolation.

---

### Function: `handleClaimResult`

**Signature:** `function handleClaimResult(billing: BillingInfo, result: ClaimEvaluationResult): void`

**Purpose:** Updates billing info based on claim evaluation result. Mutates `billing` in place.

**Type:** Pure (mutates input)

Per spec:
- No publisher matches → exit silently (no claimIssue)
- Publisher matches but no valid user/domain claim → claimIssue = true
- Multiple conflicting claims → claimIssue = true
- Single valid claim → claim the app

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No publisher match - exits silently | `billing = { app: { id: "app1", ... } }`, `result = { publisherMatchFound: false, candidates: [] }` | `handleClaimResult(billing, result)` | `billing.claimIssue === undefined` |
| 2 | Publisher match but no valid claim - sets claimIssue | `billing = { app: { id: "app1", ... } }`, `result = { publisherMatchFound: true, candidates: [] }` | `handleClaimResult(billing, result)` | `billing.claimIssue === true` |
| 3 | Multiple candidates - sets claimIssue | `billing = { app: { id: "app1", ... } }`, `result = { publisherMatchFound: true, candidates: [candidate1, candidate2] }` | `handleClaimResult(billing, result)` | `billing.claimIssue === true` |
| 4 | Single candidate - claims app | `billing = { app: { id: "app1", ... } }`, `result = { publisherMatchFound: true, candidates: [{ organization: { id: "org1", ... }, matchType: "user" }] }` | `handleClaimResult(billing, result)` | `billing.app.ownerType === "organization"`, `billing.app.ownerId === "org1"`, `billing.writeBackClaimed === true`, `billing.organization.id === "org1"` |
| 5 | Single candidate with no app - no crash | `billing = {}`, `result = { publisherMatchFound: true, candidates: [candidate1] }` | `handleClaimResult(billing, result)` | `billing.app === undefined`, no error thrown |
| 6 | Claim preserves existing app properties | `billing = { app: { id: "app1", name: "My App", publisher: "Pub", created: 1000, freeUntil: 2000 } }`, `result = { publisherMatchFound: true, candidates: [{ organization: { id: "org1", ... } }] }` | `handleClaimResult(billing, result)` | `billing.app.id === "app1"`, `billing.app.name === "My App"`, `billing.app.ownerType === "organization"` |

---

### Function: `evaluateClaimCandidates` (exported)

**Signature:** `function evaluateClaimCandidates(publisher: string | undefined, gitEmail: string | undefined, organizations: OrganizationInfo[]): ClaimEvaluationResult`

**Purpose:** Pure function to determine which organizations can claim an app. Returns `{ publisherMatchFound: boolean, candidates: ClaimCandidate[] }`.

**Type:** Pure

#### Test Cases: No Organizations Match Publisher

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Empty organizations array | `publisher = "MyPublisher"`, `gitEmail = "user@example.com"`, `orgs = []` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: false, candidates: [] }` |
| 2 | No org has matching publisher | `publisher = "MyPublisher"`, `gitEmail = "user@example.com"`, `orgs = [{ publishers: ["Other"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: false, candidates: [] }` |
| 3 | Publisher undefined | `publisher = undefined`, `gitEmail = "user@example.com"`, `orgs = [{ publishers: [""] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: false, candidates: [] }` (normalized empty string may or may not match) |

#### Test Cases: Publisher Match + User Match

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 4 | User exact match | `publisher = "MyPub"`, `gitEmail = "user@example.com"`, `orgs = [{ publishers: ["MyPub"], users: ["user@example.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "user" }] }` |
| 5 | User case-insensitive match | `publisher = "mypub"`, `gitEmail = "User@Example.COM"`, `orgs = [{ publishers: ["MYPUB"], users: ["user@example.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "user" }] }` |
| 6 | User with whitespace match | `publisher = "MyPub"`, `gitEmail = "  user@example.com  "`, `orgs = [{ publishers: ["MyPub"], users: ["user@example.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "user" }] }` |

#### Test Cases: Publisher Match + Domain Match

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | Domain match | `publisher = "MyPub"`, `gitEmail = "anyone@company.com"`, `orgs = [{ publishers: ["MyPub"], domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "domain" }] }` |
| 8 | Domain case-insensitive match | `publisher = "MyPub"`, `gitEmail = "user@Company.COM"`, `orgs = [{ publishers: ["MyPub"], domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "domain" }] }` |

#### Test Cases: User Takes Precedence Over Domain

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 9 | Both user and domain match - user wins | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: ["MyPub"], users: ["user@company.com"], domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ organization: org, matchType: "user" }] }` |

#### Test Cases: Multiple Organizations

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 10 | Two orgs match (conflict) | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: ["MyPub"], domains: ["company.com"] }, { publishers: ["MyPub"], users: ["user@company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [...] }` (2 candidates) |
| 11 | One org matches, one doesn't | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: ["MyPub"], domains: ["company.com"] }, { publishers: ["Other"], domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [...] }` (1 candidate) |

#### Test Cases: Publisher Match but No User/Domain Match

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 12 | Publisher matches but no user/domain | `publisher = "MyPub"`, `gitEmail = "user@other.com"`, `orgs = [{ publishers: ["MyPub"], users: [], domains: [] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [] }` |
| 13 | Publisher matches, no email provided | `publisher = "MyPub"`, `gitEmail = undefined`, `orgs = [{ publishers: ["MyPub"], domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [] }` |

#### Test Cases: Nullable Arrays

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 14 | publishers undefined on org | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: undefined, domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: false, candidates: [] }` |
| 15 | users undefined on org | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: ["MyPub"], users: undefined, domains: ["company.com"] }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [{ matchType: "domain" }] }` |
| 16 | domains undefined on org | `publisher = "MyPub"`, `gitEmail = "user@company.com"`, `orgs = [{ publishers: ["MyPub"], users: [], domains: undefined }]` | `evaluateClaimCandidates(...)` | `{ publisherMatchFound: true, candidates: [] }` |

---

### Function: `claimingStage` (exported)

**Signature:** `async function claimingStage(request: AzureHttpRequest, headers: ParsedNinjaHeaders): Promise<void>`

**Purpose:** Execute claiming stage - attempts to auto-claim orphaned app for an organization.

**Type:** Impure (uses CacheManager)

**Mocking Required:** `CacheManager.getOrganizations`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `claimingStage(request, headers)` | Returns without calling CacheManager |
| 2 | App already has owner | `request = { billing: { app: { ownerId: "existing" } } }` | `claimingStage(request, headers)` | Returns without calling CacheManager |
| 3 | No publisher header | `request = { billing: { app: { id: "app1" } } }`, `headers = {}` | `claimingStage(request, headers)` | Returns without calling CacheManager |
| 4 | No matching organizations | `request = { billing: { app: { id: "app1" } } }`, `headers = { appPublisher: "Pub" }`, `CacheManager.getOrganizations = []` | `claimingStage(request, headers)` | `billing.claimIssue === undefined` |
| 5 | Single valid claim | `request = { billing: { app: { id: "app1" } } }`, `headers = { appPublisher: "Pub", gitUserEmail: "user@company.com" }`, `CacheManager.getOrganizations = [{ publishers: ["Pub"], users: ["user@company.com"] }]` | `claimingStage(request, headers)` | App claimed, `billing.writeBackClaimed === true` |
| 6 | Multiple conflicting claims | Setup with 2 orgs matching | `claimingStage(request, headers)` | `billing.claimIssue === true` |
| 7 | Publisher match but no user match | `CacheManager.getOrganizations = [{ publishers: ["Pub"], users: [] }]` | `claimingStage(request, headers)` | `billing.claimIssue === true` |

---

## stages/permission.ts

### TestExports Required

```typescript
export const TestExports = {
    mapBlockReason,
    getOrphanPermission,
    getAuthorizedEmails,
    getPersonalPermission,
    getOrganizationPermission,
    handleUnknownOrgUser,
};
```

---

### Function: `mapBlockReason`

**Signature:** `function mapBlockReason(reason: BlockReason): ErrorCode`

**Purpose:** Maps block reason to error code.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | flagged | `reason = "flagged"` | `mapBlockReason(reason)` | `"ORG_FLAGGED"` |
| 2 | subscription_cancelled | `reason = "subscription_cancelled"` | `mapBlockReason(reason)` | `"SUBSCRIPTION_CANCELLED"` |
| 3 | payment_failed | `reason = "payment_failed"` | `mapBlockReason(reason)` | `"PAYMENT_FAILED"` |

---

### Function: `getOrphanPermission`

**Signature:** `function getOrphanPermission(billing: BillingInfo): PermissionResult`

**Purpose:** Gets permission result for orphaned apps based on grace period.

**Type:** Pure (time-dependent - mock Date.now)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No app bound | `billing = {}` | `getOrphanPermission(billing)` | `{ allowed: true }` |
| 2 | Grace period active (future freeUntil) | `billing = { app: { freeUntil: Date.now() + 1000000, ... } }` | `getOrphanPermission(billing)` | `{ allowed: true, warning: { code: "APP_GRACE_PERIOD", timeRemaining: ~1000000 } }` |
| 3 | Grace period expired (past freeUntil) | `billing = { app: { freeUntil: Date.now() - 1000, ... } }` | `getOrphanPermission(billing)` | `{ allowed: false, error: { code: "GRACE_EXPIRED" } }` |
| 4 | Grace period exactly expired (freeUntil = now) | `billing = { app: { freeUntil: Date.now(), ... } }` | `getOrphanPermission(billing)` | `{ allowed: false, error: { code: "GRACE_EXPIRED" } }` (timeRemaining < 0 or = 0) |
| 5 | Grace period nearly expired (1ms remaining) | `billing = { app: { freeUntil: Date.now() + 1, ... } }` | `getOrphanPermission(billing)` | `{ allowed: true, warning: { code: "APP_GRACE_PERIOD", timeRemaining: ~1 } }` |

---

### Function: `getAuthorizedEmails`

**Signature:** `function getAuthorizedEmails(billing: BillingInfo): string[]`

**Purpose:** Builds list of authorized emails for personal app from app and user data.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No app, no user | `billing = {}` | `getAuthorizedEmails(billing)` | `[]` |
| 2 | App with gitEmail only | `billing = { app: { gitEmail: "app@example.com", ... } }` | `getAuthorizedEmails(billing)` | `["app@example.com"]` |
| 3 | User with email only | `billing = { user: { email: "user@example.com", ... } }` | `getAuthorizedEmails(billing)` | `["user@example.com"]` |
| 4 | User with gitEmail only | `billing = { user: { gitEmail: "git@example.com", ... } }` | `getAuthorizedEmails(billing)` | `["git@example.com"]` |
| 5 | User with both email and gitEmail | `billing = { user: { email: "user@example.com", gitEmail: "git@example.com", ... } }` | `getAuthorizedEmails(billing)` | `["user@example.com", "git@example.com"]` |
| 6 | All sources different | `billing = { app: { gitEmail: "app@example.com" }, user: { email: "user@example.com", gitEmail: "git@example.com" } }` | `getAuthorizedEmails(billing)` | `["app@example.com", "user@example.com", "git@example.com"]` |
| 7 | Duplicate emails deduplicated | `billing = { app: { gitEmail: "same@example.com" }, user: { email: "same@example.com" } }` | `getAuthorizedEmails(billing)` | `["same@example.com"]` |
| 8 | Case normalization | `billing = { app: { gitEmail: "User@Example.COM" } }` | `getAuthorizedEmails(billing)` | `["user@example.com"]` |
| 9 | Whitespace normalization | `billing = { app: { gitEmail: "  user@example.com  " } }` | `getAuthorizedEmails(billing)` | `["user@example.com"]` |
| 10 | Deduplication case-insensitive | `billing = { app: { gitEmail: "User@Example.COM" }, user: { email: "user@example.com" } }` | `getAuthorizedEmails(billing)` | `["user@example.com"]` |

---

### Function: `getPersonalPermission`

**Signature:** `function getPersonalPermission(billing: BillingInfo, gitEmail: string | undefined): PermissionResult`

**Purpose:** Determines permission for personal apps.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No app bound | `billing = {}`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: true }` |
| 2 | No gitEmail provided | `billing = { app: { ... } }`, `gitEmail = undefined` | `getPersonalPermission(...)` | `{ allowed: false, error: { code: "GIT_EMAIL_REQUIRED" } }` |
| 3 | gitEmail matches app.gitEmail | `billing = { app: { gitEmail: "user@example.com", ... } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: true }` |
| 4 | gitEmail matches user.email | `billing = { app: { ... }, user: { email: "user@example.com" } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: true }` |
| 5 | gitEmail matches user.gitEmail | `billing = { app: { ... }, user: { gitEmail: "user@example.com" } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: true }` |
| 6 | gitEmail doesn't match any | `billing = { app: { gitEmail: "other@example.com", ... } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: false, error: { code: "USER_NOT_AUTHORIZED", gitEmail: "user@example.com" } }` |
| 7 | Empty authorized emails list | `billing = { app: { ... } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: false, error: { code: "USER_NOT_AUTHORIZED", gitEmail } }` |
| 8 | Case insensitive match | `billing = { app: { gitEmail: "User@Example.COM", ... } }`, `gitEmail = "user@example.com"` | `getPersonalPermission(...)` | `{ allowed: true }` |

---

### Function: `getOrganizationPermission`

**Signature:** `function getOrganizationPermission(billing: BillingInfo, gitEmail: string | undefined): PermissionResult`

**Purpose:** Determines permission for organization apps. Mutates `billing.writeBackNewUser`.

**Type:** Pure (mutates input)

#### Test Cases: Guard Clauses

| # | Case | Arrange | Act | Assert (result + billing mutation) |
|---|------|---------|-----|--------|
| 1 | No organization bound | `billing = {}`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: true }` |

#### Test Cases: Blocked Organization

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 2 | Org blocked - flagged | `billing = { organization: { ... }, blocked: { reason: "flagged" } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "ORG_FLAGGED" } }` |
| 3 | Org blocked - subscription_cancelled | `billing = { organization: { ... }, blocked: { reason: "subscription_cancelled" } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "SUBSCRIPTION_CANCELLED" } }` |
| 4 | Org blocked - payment_failed | `billing = { organization: { ... }, blocked: { reason: "payment_failed" } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "PAYMENT_FAILED" } }` |

#### Test Cases: Unlimited Plan

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 5 | Unlimited plan - no gitEmail required | `billing = { organization: { plan: "unlimited", ... } }`, `gitEmail = undefined` | `getOrganizationPermission(...)` | `{ allowed: true }` |
| 6 | Unlimited plan - any user allowed | `billing = { organization: { plan: "unlimited", deniedUsers: ["user@example.com"], ... } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: true }` |

#### Test Cases: Non-Unlimited Plan - Git Email Required

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | No gitEmail on non-unlimited | `billing = { organization: { plan: "small", ... } }`, `gitEmail = undefined` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "GIT_EMAIL_REQUIRED" } }` |

#### Test Cases: User Permission Results

| # | Case | Arrange | Act | Assert (result + billing mutation) |
|---|------|---------|-----|--------|
| 8 | Explicitly allowed (true) | `billing = { organization: { users: ["user@example.com"], ... } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: true }`, `billing.writeBackNewUser === undefined` |
| 9 | Implicitly allowed via domain (ALLOWED) | `billing = { organization: { domains: ["example.com"], ... } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: true }`, `billing.writeBackNewUser === "ALLOW"` |
| 10 | Implicitly allowed via pending domain (ALLOWED_PENDING) | `billing = { organization: { pendingDomains: ["example.com"], ... } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: true }`, `billing.writeBackNewUser === "UNKNOWN"` |
| 11 | Explicitly denied (false) | `billing = { organization: { deniedUsers: ["user@example.com"], ... } }`, `gitEmail = "user@example.com"` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "USER_NOT_AUTHORIZED", gitEmail } }` |
| 12 | Denied via denyUnknownDomains (DENY) | `billing = { organization: { denyUnknownDomains: true, ... } }`, `gitEmail = "user@unknown.com"` | `getOrganizationPermission(...)` | `{ allowed: false, error: { code: "USER_NOT_AUTHORIZED", gitEmail } }`, `billing.writeBackNewUser === "DENY"` |

---

### Function: `handleUnknownOrgUser`

**Signature:** `function handleUnknownOrgUser(billing: BillingInfo, org: { userFirstSeenTimestamp?: Record<string, number> }, gitEmail: string): PermissionResult`

**Purpose:** Handles unknown users in organizations with grace period logic.

**Type:** Pure (time-dependent - mock Date.now, mutates billing)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | New user (no firstSeenTimestamp) | `billing = {}`, `org = { userFirstSeenTimestamp: {} }`, `gitEmail = "user@example.com"` | `handleUnknownOrgUser(...)` | `{ allowed: true, warning: { code: "ORG_GRACE_PERIOD", timeRemaining: ~GRACE_PERIOD_MS, gitEmail } }`, `billing.writeBackNewUser === "UNKNOWN"` |
| 2 | Existing user within grace period | `billing = {}`, `org = { userFirstSeenTimestamp: { "user@example.com": Date.now() - 1000 } }`, `gitEmail = "user@example.com"` | `handleUnknownOrgUser(...)` | `{ allowed: true, warning: { code: "ORG_GRACE_PERIOD", timeRemaining: ~(GRACE_PERIOD_MS - 1000), gitEmail } }`, `billing.writeBackNewUser === undefined` |
| 3 | Existing user grace period expired | `billing = {}`, `org = { userFirstSeenTimestamp: { "user@example.com": Date.now() - GRACE_PERIOD_MS - 1000 } }`, `gitEmail = "user@example.com"` | `handleUnknownOrgUser(...)` | `{ allowed: false, error: { code: "ORG_GRACE_EXPIRED", gitEmail } }` |
| 4 | Email normalization for lookup | `billing = {}`, `org = { userFirstSeenTimestamp: { "user@example.com": Date.now() } }`, `gitEmail = "User@Example.COM"` | `handleUnknownOrgUser(...)` | Finds existing entry, doesn't set writeBackNewUser |
| 5 | userFirstSeenTimestamp undefined | `billing = {}`, `org = { userFirstSeenTimestamp: undefined }`, `gitEmail = "user@example.com"` | `handleUnknownOrgUser(...)` | Works like new user |
| 6 | Grace period exactly at boundary | `billing = {}`, `org = { userFirstSeenTimestamp: { "user@example.com": Date.now() - GRACE_PERIOD_MS } }`, `gitEmail = "user@example.com"` | `handleUnknownOrgUser(...)` | `{ allowed: false, error: { code: "ORG_GRACE_EXPIRED", gitEmail } }` |

---

### Function: `getPermissionWarning` (exported)

**Signature:** `function getPermissionWarning(request: AzureHttpRequest): { code: string; timeRemaining?: number; gitEmail?: string } | undefined`

**Purpose:** Extracts permission warning from request.

**Type:** Pure (time-dependent for fallback)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `getPermissionWarning(request)` | `undefined` |
| 2 | No permission on billing | `request = { billing: {} }` | `getPermissionWarning(request)` | `undefined` |
| 3 | Permission allowed with warning | `request = { billing: { permission: { allowed: true, warning: { code: "APP_GRACE_PERIOD", timeRemaining: 1000 } } } }` | `getPermissionWarning(request)` | `{ code: "APP_GRACE_PERIOD", timeRemaining: 1000 }` |
| 4 | Permission allowed without warning | `request = { billing: { permission: { allowed: true } } }` | `getPermissionWarning(request)` | Check for orphan app warning or undefined |
| 5 | Permission denied (no warning) | `request = { billing: { permission: { allowed: false, error: { code: "GRACE_EXPIRED" } } } }` | `getPermissionWarning(request)` | `undefined` |
| 6 | Orphan app in grace period (fallback) | `request = { billing: { app: { id: "app1", freeUntil: Date.now() + 1000000 } } }` | `getPermissionWarning(request)` | `{ code: "APP_GRACE_PERIOD", timeRemaining: ~1000000 }` |
| 7 | Sponsored app (no warning) | `request = { billing: { app: { id: "app1", sponsored: true } } }` | `getPermissionWarning(request)` | `undefined` |
| 8 | Owned app (not orphan) | `request = { billing: { app: { id: "app1", ownerId: "user1" } } }` | `getPermissionWarning(request)` | `undefined` |
| 9 | Orphan app grace expired (no warning) | `request = { billing: { app: { id: "app1", freeUntil: Date.now() - 1000 } } }` | `getPermissionWarning(request)` | `undefined` |

---

### Function: `bindPermission` (exported)

**Signature:** `function bindPermission(request: AzureHttpRequest, headers: ParsedNinjaHeaders): void`

**Purpose:** Binds permission result to billing info based on app type.

**Type:** Pure (mutates request.billing)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}`, `headers = {}` | `bindPermission(...)` | `request.billing === undefined` |
| 2 | Sponsored app | `request = { billing: { app: { sponsored: true } } }`, `headers = {}` | `bindPermission(...)` | `request.billing.permission === { allowed: true }` |
| 3 | Personal app (user owner) - authorized | `request = { billing: { app: { ownerType: "user", gitEmail: "user@example.com" }, user: { ... } } }`, `headers = { gitUserEmail: "user@example.com" }` | `bindPermission(...)` | `request.billing.permission.allowed === true` |
| 4 | Personal app (user owner) - unauthorized | `request = { billing: { app: { ownerType: "user", gitEmail: "other@example.com" } } }`, `headers = { gitUserEmail: "user@example.com" }` | `bindPermission(...)` | `request.billing.permission.allowed === false` |
| 5 | Organization app - unlimited plan | `request = { billing: { app: { ownerType: "organization" }, organization: { plan: "unlimited" } } }`, `headers = {}` | `bindPermission(...)` | `request.billing.permission.allowed === true` |
| 6 | Organization app - user authorized | `request = { billing: { app: { ownerType: "organization" }, organization: { users: ["user@example.com"] } } }`, `headers = { gitUserEmail: "user@example.com" }` | `bindPermission(...)` | `request.billing.permission.allowed === true` |
| 7 | Orphaned app in grace | `request = { billing: { app: { id: "app1", freeUntil: Date.now() + 1000000 } } }`, `headers = {}` | `bindPermission(...)` | `request.billing.permission` has warning |
| 8 | Orphaned app expired | `request = { billing: { app: { id: "app1", freeUntil: Date.now() - 1000 } } }`, `headers = {}` | `bindPermission(...)` | `request.billing.permission.allowed === false` |
| 9 | No app bound | `request = { billing: {} }`, `headers = {}` | `bindPermission(...)` | `request.billing.permission === { allowed: true }` |

---

### Function: `permissionStage` (exported)

**Signature:** `function permissionStage(request: AzureHttpRequest, headers: ParsedNinjaHeaders): void`

**Purpose:** Execute permission stage. Requires appId header.

**Type:** Pure (may throw ErrorResponse)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Missing appId header | `request = { billing: {} }`, `headers = {}` | `permissionStage(request, headers)` | Throws ErrorResponse with status 400 |
| 2 | Missing appId header (empty string) | `request = { billing: {} }`, `headers = { appId: "" }` | `permissionStage(request, headers)` | Throws ErrorResponse with status 400 |
| 3 | Has appId header - delegates to bindPermission | `request = { billing: {} }`, `headers = { appId: "app1" }` | `permissionStage(request, headers)` | bindPermission is called, no error thrown |
| 4 | Has appId header - sponsored app | `request = { billing: { app: { sponsored: true } } }`, `headers = { appId: "app1" }` | `permissionStage(request, headers)` | `permission.allowed === true` |

---

### Function: `enforcePermission` (exported)

**Signature:** `function enforcePermission(request: AzureHttpRequest): void`

**Purpose:** Throws ErrorResponse if permission denied.

**Type:** Pure (may throw)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `enforcePermission(request)` | No error thrown |
| 2 | No permission | `request = { billing: {} }` | `enforcePermission(request)` | No error thrown |
| 3 | Permission allowed | `request = { billing: { permission: { allowed: true } } }` | `enforcePermission(request)` | No error thrown |
| 4 | Permission allowed with warning | `request = { billing: { permission: { allowed: true, warning: { ... } } } }` | `enforcePermission(request)` | No error thrown |
| 5 | Permission denied - GRACE_EXPIRED | `request = { billing: { permission: { allowed: false, error: { code: "GRACE_EXPIRED" } } } }` | `enforcePermission(request)` | Throws ErrorResponse with status 403 |
| 6 | Permission denied - USER_NOT_AUTHORIZED | `request = { billing: { permission: { allowed: false, error: { code: "USER_NOT_AUTHORIZED", gitEmail: "user@example.com" } } } }` | `enforcePermission(request)` | Throws ErrorResponse with status 403, body includes gitEmail |

---

## stages/dunning.ts

### TestExports Required

None - all functions are already exported.

---

### Function: `dunningStage` (exported)

**Signature:** `function dunningStage(request: AzureHttpRequest): void`

**Purpose:** Sets X-Ninja-Dunning-Warning header if organization is in dunning.

**Type:** Pure (mutates request via setHeader)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = { setHeader: jest.fn() }` | `dunningStage(request)` | setHeader not called |
| 2 | Billing but no dunning | `request = { billing: {}, setHeader: jest.fn() }` | `dunningStage(request)` | setHeader not called |
| 3 | Has dunning | `request = { billing: { dunning: { organizationId: "org1", dunningStage: 1 } }, setHeader: jest.fn() }` | `dunningStage(request)` | setHeader called with ("X-Ninja-Dunning-Warning", "true") |

---

### Function: `hasDunningWarning` (exported)

**Signature:** `function hasDunningWarning(request: AzureHttpRequest): boolean`

**Purpose:** Checks if request has dunning warning.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `hasDunningWarning(request)` | `false` |
| 2 | No dunning | `request = { billing: {} }` | `hasDunningWarning(request)` | `false` |
| 3 | Has dunning | `request = { billing: { dunning: { organizationId: "org1", dunningStage: 1, ... } } }` | `hasDunningWarning(request)` | `true` |
| 4 | Dunning is null | `request = { billing: { dunning: null } }` | `hasDunningWarning(request)` | `false` |

---

### Function: `getDunningStage` (exported)

**Signature:** `function getDunningStage(request: AzureHttpRequest): 1 | 2 | 3 | undefined`

**Purpose:** Gets dunning stage from request.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `getDunningStage(request)` | `undefined` |
| 2 | No dunning | `request = { billing: {} }` | `getDunningStage(request)` | `undefined` |
| 3 | Dunning stage 1 | `request = { billing: { dunning: { dunningStage: 1, ... } } }` | `getDunningStage(request)` | `1` |
| 4 | Dunning stage 2 | `request = { billing: { dunning: { dunningStage: 2, ... } } }` | `getDunningStage(request)` | `2` |
| 5 | Dunning stage 3 | `request = { billing: { dunning: { dunningStage: 3, ... } } }` | `getDunningStage(request)` | `3` |

---

## stages/blocking.ts

### TestExports Required

None - the only function is already exported.

---

### Function: `blockingStage` (exported)

**Signature:** `async function blockingStage(request: AzureHttpRequest): Promise<void>`

**Purpose:** Binds blocking status for organization apps.

**Type:** Impure (uses CacheManager)

**Mocking Required:** `CacheManager.getBlockedStatus`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No billing | `request = {}` | `blockingStage(request)` | Returns without calling CacheManager |
| 2 | No organization | `request = { billing: { app: { ... } } }` | `blockingStage(request)` | Returns without calling CacheManager |
| 3 | Organization not blocked | `request = { billing: { organization: { id: "org1" } } }`, `CacheManager.getBlockedStatus returns undefined` | `blockingStage(request)` | `billing.blocked === undefined` |
| 4 | Organization blocked - flagged | `request = { billing: { organization: { id: "org1" } } }`, `CacheManager.getBlockedStatus returns { reason: "flagged", blockedAt: 1000 }` | `blockingStage(request)` | `billing.blocked === { reason: "flagged", blockedAt: 1000 }` |
| 5 | Organization blocked - subscription_cancelled | `CacheManager.getBlockedStatus returns { reason: "subscription_cancelled", ... }` | `blockingStage(request)` | `billing.blocked.reason === "subscription_cancelled"` |
| 6 | Organization blocked - payment_failed | `CacheManager.getBlockedStatus returns { reason: "payment_failed", ... }` | `blockingStage(request)` | `billing.blocked.reason === "payment_failed"` |

---

## stages/binding.ts

### TestExports Required

```typescript
export const TestExports = {
    bindApp,
    bindOwnership,
    forceOrphan,
};
```

---

### Function: `forceOrphan`

**Signature:** `function forceOrphan(billing: BillingInfo): void`

**Purpose:** Clears ownership from app and flags for writeback.

**Type:** Pure (mutates input)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No app | `billing = {}` | `forceOrphan(billing)` | `billing` unchanged, no error |
| 2 | App with ownership | `billing = { app: { id: "app1", ownerType: "user", ownerId: "user1", ... } }` | `forceOrphan(billing)` | `billing.app.ownerType === undefined`, `billing.app.ownerId === undefined`, `billing.writeBackForceOrphan === true` |
| 3 | App already orphan | `billing = { app: { id: "app1", ... } }` | `forceOrphan(billing)` | `billing.writeBackForceOrphan === true` |
| 4 | Preserves other app properties | `billing = { app: { id: "app1", name: "My App", ownerType: "organization", ownerId: "org1" } }` | `forceOrphan(billing)` | `billing.app.id === "app1"`, `billing.app.name === "My App"`, `billing.app.ownerType === undefined` |

---

### Function: `bindApp`

**Signature:** `async function bindApp(billing: BillingInfo, headers: ParsedNinjaHeaders): Promise<void>`

**Purpose:** Binds app to billing info from cache or creates new orphan.

**Type:** Impure (uses CacheManager)

**Mocking Required:** `CacheManager.getApp`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No appId header | `billing = {}`, `headers = {}` | `bindApp(billing, headers)` | `billing.app === undefined`, CacheManager not called |
| 2 | App exists in cache | `billing = {}`, `headers = { appId: "app1", appPublisher: "Pub" }`, `CacheManager.getApp returns { id: "app1", ... }` | `bindApp(billing, headers)` | `billing.app === cached app`, `billing.writeBackNewOrphan === undefined` |
| 3 | App not in cache - creates orphan | `billing = {}`, `headers = { appId: "app1", appPublisher: "Pub", appName: "My App" }`, `CacheManager.getApp returns undefined` | `bindApp(billing, headers)` | `billing.app.id === "app1"`, `billing.app.name === "My App"`, `billing.writeBackNewOrphan === true` |
| 4 | New orphan has correct timestamps | `billing = {}`, `headers = { appId: "app1" }`, `CacheManager.getApp returns undefined`, `Date.now() = 1000` | `bindApp(billing, headers)` | `billing.app.created === 1000`, `billing.app.freeUntil === 1000 + GRACE_PERIOD_MS` |
| 5 | No appPublisher - still creates orphan | `billing = {}`, `headers = { appId: "app1" }`, `CacheManager.getApp returns undefined` | `bindApp(billing, headers)` | `billing.app.publisher === ""` |
| 6 | No appName - defaults to empty | `billing = {}`, `headers = { appId: "app1" }`, `CacheManager.getApp returns undefined` | `bindApp(billing, headers)` | `billing.app.name === ""` |

---

### Function: `bindOwnership`

**Signature:** `async function bindOwnership(billing: BillingInfo): Promise<void>`

**Purpose:** Binds user or organization ownership based on app's ownerType.

**Type:** Impure (uses CacheManager)

**Mocking Required:** `CacheManager.getUser`, `CacheManager.getOrganization`, `CacheManager.getDunningEntry`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No app | `billing = {}` | `bindOwnership(billing)` | Returns without calling CacheManager |
| 2 | Sponsored app | `billing = { app: { sponsored: true, ownerId: "org1" } }` | `bindOwnership(billing)` | Returns without calling CacheManager |
| 3 | No ownerId (orphaned) | `billing = { app: { id: "app1" } }` | `bindOwnership(billing)` | Returns without calling CacheManager |
| 4 | User owner - exists | `billing = { app: { ownerType: "user", ownerId: "user1" } }`, `CacheManager.getUser returns { id: "user1", ... }` | `bindOwnership(billing)` | `billing.user === cached user` |
| 5 | User owner - not found | `billing = { app: { ownerType: "user", ownerId: "user1" } }`, `CacheManager.getUser returns undefined` | `bindOwnership(billing)` | `billing.writeBackForceOrphan === true`, ownership cleared |
| 6 | Org owner - exists | `billing = { app: { ownerType: "organization", ownerId: "org1" } }`, `CacheManager.getOrganization returns { id: "org1" }`, `CacheManager.getDunningEntry returns undefined` | `bindOwnership(billing)` | `billing.organization === cached org`, `billing.dunning === undefined` |
| 7 | Org owner - exists with dunning | `billing = { app: { ownerType: "organization", ownerId: "org1" } }`, `CacheManager.getOrganization returns { id: "org1" }`, `CacheManager.getDunningEntry returns { dunningStage: 2 }` | `bindOwnership(billing)` | `billing.organization === cached org`, `billing.dunning.dunningStage === 2` |
| 8 | Org owner - not found | `billing = { app: { ownerType: "organization", ownerId: "org1" } }`, `CacheManager.getOrganization returns undefined` | `bindOwnership(billing)` | `billing.writeBackForceOrphan === true`, ownership cleared |
| 9 | Org and dunning fetched in parallel | Verify both calls made concurrently | `bindOwnership(billing)` | Both promises resolved |

---

### Function: `bindingStage` (exported)

**Signature:** `async function bindingStage(request: AzureHttpRequest, headers: ParsedNinjaHeaders): Promise<void>`

**Purpose:** Main binding stage - creates BillingInfo and binds app/ownership.

**Type:** Impure (orchestrates bindApp and bindOwnership)

**Mocking Required:** `CacheManager.getApp`, `CacheManager.getUser`, `CacheManager.getOrganization`, `CacheManager.getDunningEntry`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Initializes empty billing | `request = {}`, `headers = {}` | `bindingStage(request, headers)` | `request.billing === {}` |
| 2 | Full flow - new orphan app | `request = {}`, `headers = { appId: "app1" }`, app not in cache | `bindingStage(request, headers)` | `request.billing.app` created as orphan |
| 3 | Full flow - existing user app | `request = {}`, `headers = { appId: "app1" }`, cached app with user owner | `bindingStage(request, headers)` | `request.billing.user` populated |
| 4 | Full flow - existing org app | `request = {}`, `headers = { appId: "app1" }`, cached app with org owner | `bindingStage(request, headers)` | `request.billing.organization` populated |
| 5 | Full flow - org with dunning | Setup org app with dunning entry | `bindingStage(request, headers)` | `request.billing.dunning` populated |

---

## touchActivityLogging.ts

### TestExports Required

```typescript
export const TestExports = {
    getFeatureLogPath,
    getOrganizationId,
    isUserAllowedForLogging,
    appendActivityEntries,
};
```

---

### Function: `getFeatureLogPath`

**Signature:** `function getFeatureLogPath(orgId: string): string`

**Purpose:** Generates blob path for organization's feature log.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Standard org ID | `orgId = "org123"` | `getFeatureLogPath(orgId)` | `"logs://org123_featureLog.json"` |
| 2 | UUID org ID | `orgId = "550e8400-e29b-41d4-a716-446655440000"` | `getFeatureLogPath(orgId)` | `"logs://550e8400-e29b-41d4-a716-446655440000_featureLog.json"` |
| 3 | Empty string | `orgId = ""` | `getFeatureLogPath(orgId)` | `"logs://_featureLog.json"` |

---

### Function: `getOrganizationId`

**Signature:** `function getOrganizationId(app: AppInfo | undefined): string | null`

**Purpose:** Determines if app should be logged and returns org ID if so.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Undefined app | `app = undefined` | `getOrganizationId(app)` | `null` |
| 2 | Sponsored app | `app = { sponsored: true, ownerType: "organization", ownerId: "org1", ... }` | `getOrganizationId(app)` | `null` |
| 3 | Orphaned app (no ownerType) | `app = { id: "app1", ... }` | `getOrganizationId(app)` | `null` |
| 4 | Orphaned app (no ownerId) | `app = { ownerType: "organization", ... }` | `getOrganizationId(app)` | `null` |
| 5 | Personal app (user owner) | `app = { ownerType: "user", ownerId: "user1", ... }` | `getOrganizationId(app)` | `null` |
| 6 | Organization app | `app = { ownerType: "organization", ownerId: "org1", ... }` | `getOrganizationId(app)` | `"org1"` |
| 7 | Organization app with sponsored false | `app = { ownerType: "organization", ownerId: "org1", sponsored: false, ... }` | `getOrganizationId(app)` | `"org1"` |

---

### Function: `isUserAllowedForLogging`

**Signature:** `function isUserAllowedForLogging(org: OrganizationInfo, email: string): boolean`

**Purpose:** Checks if user is allowed to log activity for organization.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | User explicitly allowed (returns true) | `org = { users: ["user@example.com"], ... }`, `email = "user@example.com"` | `isUserAllowedForLogging(org, email)` | `true` |
| 2 | User allowed via domain (returns ALLOWED) | `org = { domains: ["example.com"], ... }`, `email = "user@example.com"` | `isUserAllowedForLogging(org, email)` | `true` |
| 3 | User allowed via pending domain (returns ALLOWED_PENDING) | `org = { pendingDomains: ["example.com"], ... }`, `email = "user@example.com"` | `isUserAllowedForLogging(org, email)` | `true` |
| 4 | User explicitly denied (returns false) | `org = { deniedUsers: ["user@example.com"], ... }`, `email = "user@example.com"` | `isUserAllowedForLogging(org, email)` | `false` |
| 5 | User denied via denyUnknownDomains (returns DENY) | `org = { denyUnknownDomains: true, ... }`, `email = "user@unknown.com"` | `isUserAllowedForLogging(org, email)` | `false` |
| 6 | Unknown user (returns undefined) | `org = { ... }`, `email = "user@unknown.com"` | `isUserAllowedForLogging(org, email)` | `false` |

---

### Function: `appendActivityEntries`

**Signature:** `async function appendActivityEntries(orgId: string, entries: ActivityLogEntry[]): Promise<void>`

**Purpose:** Append multiple activity entries to organization's log blob.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Empty entries array | `orgId = "org1"`, `entries = []` | `appendActivityEntries(orgId, entries)` | Returns without calling blob |
| 2 | Single entry | `orgId = "org1"`, `entries = [{ appId: "app1", email: "user@example.com", timestamp: 1000 }]` | `appendActivityEntries(orgId, entries)` | Blob.optimisticUpdate called with correct path |
| 3 | Multiple entries | `entries = [entry1, entry2, entry3]` | `appendActivityEntries(orgId, entries)` | All entries appended to blob |
| 4 | Correct blob path used | `orgId = "org123"` | `appendActivityEntries(orgId, entries)` | Blob created with `"logs://org123_featureLog.json"` |
| 5 | Appends to existing entries | Mock blob with existing `[existingEntry]` | `appendActivityEntries(orgId, [newEntry])` | Result is `[existingEntry, newEntry]` |

---

### Function: `logTouchActivity` (exported)

**Signature:** `async function logTouchActivity(appIds: string[], email: string, feature: string): Promise<void>`

**Purpose:** Log touch activity for multiple apps, grouped by organization.

**Type:** Impure (uses CacheManager and Blob)

**Mocking Required:** `CacheManager.getApps`, `CacheManager.getOrganization`, `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Empty appIds | `appIds = []`, `email = "user@example.com"`, `feature = "test"` | `logTouchActivity(...)` | Returns without calling anything |
| 2 | Empty email | `appIds = ["app1"]`, `email = ""`, `feature = "test"` | `logTouchActivity(...)` | Returns without calling anything |
| 3 | No org apps (all personal/orphan) | `appIds = ["app1"]`, apps all have `ownerType: "user"` | `logTouchActivity(...)` | Returns without writing logs |
| 4 | Single org app - user allowed | `appIds = ["app1"]`, app owned by org, user in org.users | `logTouchActivity(...)` | Entry written to org's log |
| 5 | Single org app - user denied | `appIds = ["app1"]`, app owned by org, user in org.deniedUsers | `logTouchActivity(...)` | No entry written |
| 6 | Multiple apps same org | `appIds = ["app1", "app2"]`, both owned by same org | `logTouchActivity(...)` | Both entries written in single blob update |
| 7 | Multiple apps different orgs | `appIds = ["app1", "app2"]`, owned by different orgs | `logTouchActivity(...)` | Entries written to respective org blobs |
| 8 | Mixed app types | `appIds = ["orgApp", "personalApp", "orphanApp"]` | `logTouchActivity(...)` | Only org app logged |
| 9 | Email normalized to lowercase | `email = "User@Example.COM"` | `logTouchActivity(...)` | Entry contains `"user@example.com"` |
| 10 | Sponsored apps skipped | App has `sponsored: true` with org owner | `logTouchActivity(...)` | Not logged |
| 11 | Feature included in entry | `feature = "getNextId"` | `logTouchActivity(...)` | Entry contains `feature: "getNextId"` |

---

## successPostprocessing.ts

### TestExports Required

```typescript
export const TestExports = {
    addToResponseBody,
};
```

---

### Function: `addToResponseBody`

**Signature:** `function addToResponseBody(response: unknown, properties: Record<string, unknown>): unknown`

**Purpose:** Adds properties to response body, creating object if needed.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Response undefined | `response = undefined`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `{ foo: "bar" }` |
| 2 | Response is empty object | `response = {}`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `{ foo: "bar" }` |
| 3 | Response is object with properties | `response = { existing: "value" }`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `{ existing: "value", foo: "bar" }` |
| 4 | Properties overwrite existing | `response = { foo: "old" }`, `properties = { foo: "new" }` | `addToResponseBody(...)` | `{ foo: "new" }` |
| 5 | Response is string | `response = "hello"`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `"hello"` (unchanged) |
| 6 | Response is number | `response = 42`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `42` (unchanged) |
| 7 | Response is boolean | `response = true`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `true` (unchanged) |
| 8 | Response is null | `response = null`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | `null` (unchanged) |
| 9 | Response is array | `response = [1, 2, 3]`, `properties = { foo: "bar" }` | `addToResponseBody(...)` | Array with added property (array is object) |
| 10 | Multiple properties | `response = {}`, `properties = { a: 1, b: 2, c: 3 }` | `addToResponseBody(...)` | `{ a: 1, b: 2, c: 3 }` |
| 11 | Nested property | `response = {}`, `properties = { nested: { deep: "value" } }` | `addToResponseBody(...)` | `{ nested: { deep: "value" } }` |

---

### Function: `postprocessBillingSuccess` (exported)

**Signature:** `function postprocessBillingSuccess(request: AzureHttpRequest, response: unknown): unknown`

**Purpose:** Post-process a successful billing response. Adds permission warning and claim issue header.

**Type:** Impure (calls isPrivateBackend, mutates request via setHeader)

**Mocking Required:** `isPrivateBackend`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Private backend mode | `isPrivateBackend = true`, `request = { billing: {...} }` | `postprocessBillingSuccess(request, response)` | Returns original response unchanged |
| 2 | No billing | `request = {}`, `response = { data: "test" }` | `postprocessBillingSuccess(request, response)` | Returns original response unchanged |
| 3 | Has permission warning | `request = { billing: { permission: { allowed: true, warning: { code: "APP_GRACE_PERIOD", timeRemaining: 1000 } } } }` | `postprocessBillingSuccess(request, response)` | Response includes `{ warning: { code: "APP_GRACE_PERIOD", ... } }` |
| 4 | Has claimIssue | `request = { billing: { claimIssue: true }, setHeader: jest.fn() }` | `postprocessBillingSuccess(request, response)` | setHeader called with ("X-Ninja-Claim-Issue", "true") |
| 5 | Both warning and claimIssue | `request = { billing: { permission: { warning: {...} }, claimIssue: true }, setHeader: jest.fn() }` | `postprocessBillingSuccess(request, response)` | Both warning added and header set |
| 6 | No warning, no claimIssue | `request = { billing: { permission: { allowed: true } } }` | `postprocessBillingSuccess(request, response)` | Returns original response |
| 7 | Orphan app warning fallback | `request = { billing: { app: { id: "app1", freeUntil: Date.now() + 1000 } } }` | `postprocessBillingSuccess(request, response)` | Response includes orphan warning |
| 8 | Undefined response becomes object | `request = { billing: { permission: { warning: {...} } } }`, `response = undefined` | `postprocessBillingSuccess(request, response)` | Returns `{ warning: {...} }` |
| 9 | Primitive response unchanged | `request = { billing: { permission: { warning: {...} } } }`, `response = "string"` | `postprocessBillingSuccess(request, response)` | Returns `"string"` (cannot add warning) |

---

## CacheManager.ts

### TestExports Required

```typescript
export const CacheManagerTestExports = {
    _isValid: CacheManager._isValid.bind(CacheManager),
    _normalize: CacheManager._normalize.bind(CacheManager),
};
```

Note: Most CacheManager methods are already accessible via the exported `CacheManager` object.

---

### Function: `_isValid`

**Signature:** `_isValid<T>(entry: CacheEntry<T> | null): boolean`

**Purpose:** Checks if cache entry is still valid based on TTL.

**Type:** Pure (time-dependent)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Null entry | `entry = null` | `_isValid(entry)` | `false` |
| 2 | Entry within TTL | `entry = { data: [], loadedAt: Date.now() - 1000 }` (1 second ago) | `_isValid(entry)` | `true` |
| 3 | Entry exactly at TTL | `entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS }` | `_isValid(entry)` | `false` |
| 4 | Entry past TTL | `entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS - 1000 }` | `_isValid(entry)` | `false` |
| 5 | Entry just under TTL | `entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS + 1 }` | `_isValid(entry)` | `true` |
| 6 | Future loadedAt (edge case) | `entry = { data: [], loadedAt: Date.now() + 10000 }` | `_isValid(entry)` | `true` |

---

### Function: `_normalize`

**Signature:** `_normalize(value: string | undefined): string`

**Purpose:** Normalizes strings for comparison.

**Type:** Pure

Same test cases as `getUserPermission.ts` normalize function.

---

### Function: `setTTL`

**Signature:** `setTTL(ttlMs: number): void`

**Purpose:** Sets custom TTL for cache.

**Type:** Mutates CacheManager state

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Set TTL | `CacheManager.clear()` | `CacheManager.setTTL(5000)` | `CacheManager._ttlMs === 5000` |
| 2 | Set zero TTL | | `CacheManager.setTTL(0)` | `CacheManager._ttlMs === 0` |
| 3 | Affects _isValid | Set TTL to 1000, entry at 500ms ago | `_isValid(entry)` | `true` |
| 4 | Affects _isValid - expired | Set TTL to 1000, entry at 1500ms ago | `_isValid(entry)` | `false` |

---

### Function: `resetTTL`

**Signature:** `resetTTL(): void`

**Purpose:** Resets TTL to default CACHE_TTL_MS.

**Type:** Mutates CacheManager state

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Reset after custom TTL | `CacheManager.setTTL(5000)` | `CacheManager.resetTTL()` | `CacheManager._ttlMs === CACHE_TTL_MS` |

---

### Function: `clear`

**Signature:** `clear(): void`

**Purpose:** Clears all caches and refreshing locks.

**Type:** Mutates CacheManager state

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Clears apps cache | Populate `_appsCache` | `CacheManager.clear()` | `CacheManager._appsCache === null` |
| 2 | Clears users cache | Populate `_usersCache` | `CacheManager.clear()` | `CacheManager._usersCache === null` |
| 3 | Clears orgs cache | Populate `_orgsCache` | `CacheManager.clear()` | `CacheManager._orgsCache === null` |
| 4 | Clears blocked cache | Populate `_blockedCache` | `CacheManager.clear()` | `CacheManager._blockedCache === null` |
| 5 | Clears dunning cache | Populate `_dunningCache` | `CacheManager.clear()` | `CacheManager._dunningCache === null` |
| 6 | Clears refreshing locks | Set `_refreshingApps` etc | `CacheManager.clear()` | All refreshing locks null |

---

### Function: `getApp`

**Signature:** `async getApp(appId: string, publisher: string | undefined): Promise<AppInfo | undefined>`

**Purpose:** Get an app by appId and publisher with normalized matching.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class for cache refresh

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Cache hit - exact match | Cache has `[{ id: "app1", publisher: "Pub" }]` | `getApp("app1", "Pub")` | Returns cached app |
| 2 | Cache hit - case insensitive | Cache has `[{ id: "APP1", publisher: "PUB" }]` | `getApp("app1", "pub")` | Returns cached app |
| 3 | Cache hit - no match | Cache has `[{ id: "app1", publisher: "Pub" }]` | `getApp("app2", "Pub")` | `undefined` |
| 4 | Cache miss - fetches from blob | Cache expired | `getApp("app1", "Pub")` | Blob.read called, returns app |
| 5 | Publisher undefined | Cache has `[{ id: "app1", publisher: "" }]` | `getApp("app1", undefined)` | Returns app (empty matches empty) |
| 6 | Multiple apps - returns correct one | Cache has multiple apps | `getApp("app2", "Pub2")` | Returns matching app |

---

### Function: `getApps`

**Signature:** `async getApps(appIds: string[]): Promise<Map<string, AppInfo>>`

**Purpose:** Get multiple apps by their appIds.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Empty appIds | `appIds = []` | `getApps(appIds)` | Empty Map |
| 2 | All apps found | Cache has app1, app2 | `getApps(["app1", "app2"])` | Map with both apps |
| 3 | Some apps not found | Cache has app1 only | `getApps(["app1", "app2"])` | Map with app1 only |
| 4 | No apps found | Cache empty | `getApps(["app1"])` | Empty Map |
| 5 | Case insensitive matching | Cache has `{ id: "APP1" }` | `getApps(["app1"])` | Map contains app |
| 6 | Preserves original appId as key | Cache has `{ id: "APP1" }` | `getApps(["app1"])` | Key is `"app1"` (original) |

---

### Function: `updateApp`

**Signature:** `updateApp(app: AppInfo): void`

**Purpose:** Update a single app in cache.

**Type:** Mutates cache

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No cache - no-op | `_appsCache = null` | `updateApp(app)` | No error, cache still null |
| 2 | Update existing app | Cache has `{ id: "app1", name: "Old" }` | `updateApp({ id: "app1", name: "New" })` | Cache has updated app |
| 3 | Add new app | Cache has `[app1]` | `updateApp(app2)` | Cache has `[app1, app2]` |
| 4 | Match by normalized id/publisher | Cache has `{ id: "APP1", publisher: "PUB" }` | `updateApp({ id: "app1", publisher: "pub", ... })` | Existing entry updated |

---

### Function: `getUser`

**Signature:** `async getUser(profileId: string): Promise<UserProfileInfo | undefined>`

**Purpose:** Get a user by profile ID.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Cache hit - found | Cache has `[{ id: "user1" }]` | `getUser("user1")` | Returns user |
| 2 | Cache hit - not found | Cache has `[{ id: "user1" }]` | `getUser("user2")` | `undefined` |
| 3 | Cache miss - fetches | Cache expired | `getUser("user1")` | Blob.read called |
| 4 | Exact ID match (not normalized) | Cache has `[{ id: "User1" }]` | `getUser("user1")` | `undefined` (case sensitive) |

---

### Function: `getOrganization`

**Signature:** `async getOrganization(orgId: string): Promise<OrganizationInfo | undefined>`

**Purpose:** Get an organization by ID.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Cache hit - found | Cache has `[{ id: "org1" }]` | `getOrganization("org1")` | Returns org |
| 2 | Cache hit - not found | Cache has `[{ id: "org1" }]` | `getOrganization("org2")` | `undefined` |
| 3 | Cache miss - fetches | Cache expired | `getOrganization("org1")` | Blob.read called |

---

### Function: `getOrganizations`

**Signature:** `async getOrganizations(): Promise<OrganizationInfo[]>`

**Purpose:** Get all organizations.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Cache hit | Cache has `[org1, org2]` | `getOrganizations()` | Returns `[org1, org2]` |
| 2 | Cache miss | Cache expired | `getOrganizations()` | Blob.read called, returns result |
| 3 | Empty organizations | Blob returns `[]` | `getOrganizations()` | Returns `[]` |

---

### Function: `updateOrganization`

**Signature:** `updateOrganization(org: OrganizationInfo): void`

**Purpose:** Update a single organization in cache.

**Type:** Mutates cache

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | No cache - no-op | `_orgsCache = null` | `updateOrganization(org)` | No error |
| 2 | Update existing org | Cache has `{ id: "org1", name: "Old" }` | `updateOrganization({ id: "org1", name: "New" })` | Updated |
| 3 | Add new org | Cache has `[org1]` | `updateOrganization(org2)` | Cache has both |

---

### Function: `getBlockedStatus`

**Signature:** `async getBlockedStatus(orgId: string): Promise<BlockedCacheEntry | undefined>`

**Purpose:** Get blocked status for an organization.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Not blocked | Blocked cache has `{ orgs: {} }` | `getBlockedStatus("org1")` | `undefined` |
| 2 | Blocked | Blocked cache has `{ orgs: { "org1": { reason: "flagged" } } }` | `getBlockedStatus("org1")` | `{ reason: "flagged" }` |
| 3 | Cache miss | Cache expired | `getBlockedStatus("org1")` | Blob.read called |
| 4 | Blob returns null | Blob.read returns null | `getBlockedStatus("org1")` | `undefined` (default empty) |

---

### Function: `getDunningEntry`

**Signature:** `async getDunningEntry(orgId: string): Promise<DunningEntry | undefined>`

**Purpose:** Get dunning entry for an organization.

**Type:** Impure (blob read if cache miss)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Not in dunning | Cache has `[]` | `getDunningEntry("org1")` | `undefined` |
| 2 | In dunning | Cache has `[{ organizationId: "org1", dunningStage: 2 }]` | `getDunningEntry("org1")` | Entry returned |
| 3 | Cache miss | Cache expired | `getDunningEntry("org1")` | Blob.read called |
| 4 | Blob read fails | Blob throws error | `getDunningEntry("org1")` | Returns empty (fail-open) |

---

### Function: `invalidate`

**Signature:** `invalidate(cache: "apps" | "users" | "organizations" | "blocked" | "dunning"): void`

**Purpose:** Invalidate a specific cache.

**Type:** Mutates cache

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Invalidate apps | `_appsCache` populated | `invalidate("apps")` | `_appsCache === null` |
| 2 | Invalidate users | `_usersCache` populated | `invalidate("users")` | `_usersCache === null` |
| 3 | Invalidate organizations | `_orgsCache` populated | `invalidate("organizations")` | `_orgsCache === null` |
| 4 | Invalidate blocked | `_blockedCache` populated | `invalidate("blocked")` | `_blockedCache === null` |
| 5 | Invalidate dunning | `_dunningCache` populated | `invalidate("dunning")` | `_dunningCache === null` |
| 6 | Other caches unaffected | All caches populated | `invalidate("apps")` | Only apps null |

---

### Function: `invalidateAll`

**Signature:** `invalidateAll(): void`

**Purpose:** Invalidate all caches and refreshing locks.

**Type:** Mutates cache

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Clears all caches | All caches populated | `invalidateAll()` | All caches null |
| 2 | Clears all refreshing locks | All locks set | `invalidateAll()` | All locks null |

---

### Cache Refresh Behavior Tests

These test the mutex/lock pattern for concurrent refresh requests.

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Concurrent getApp calls share refresh | Two getApp calls while cache expired | Both resolve with same data | Only one blob read |
| 2 | Refresh error clears lock | Blob.read throws | `_refreshingApps === null` | Error propagated |
| 3 | Second call during refresh waits | First call starts refresh, second call made | Both return same promise | Single blob read |

---

## decorators.ts

### TestExports Required

```typescript
export const TestExports = {
    SecuritySymbol,
    UsageLoggingSymbol,
    LoggingSymbol,
    BillingSymbol,
};
```

Note: Symbols are already exported. Functions are already exported.

---

### Function: `withSecurity`

**Signature:** `function withSecurity(handler: AzureHttpHandler): void`

**Purpose:** Mark handler as requiring security checks. Sets SecuritySymbol, LoggingSymbol, BillingSymbol.

**Type:** Pure (mutates input)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Sets SecuritySymbol | `handler = () => {}` | `withSecurity(handler)` | `handler[SecuritySymbol] === true` |
| 2 | Sets LoggingSymbol | `handler = () => {}` | `withSecurity(handler)` | `handler[LoggingSymbol] === true` |
| 3 | Sets BillingSymbol | `handler = () => {}` | `withSecurity(handler)` | `handler[BillingSymbol] === true` |
| 4 | Does not set UsageLoggingSymbol | `handler = () => {}` | `withSecurity(handler)` | `handler[UsageLoggingSymbol] === undefined` |

---

### Function: `withUsageLogging`

**Signature:** `function withUsageLogging(handler: AzureHttpHandler): void`

**Purpose:** Mark handler as requiring usage logging. Sets UsageLoggingSymbol, BillingSymbol.

**Type:** Pure (mutates input)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Sets UsageLoggingSymbol | `handler = () => {}` | `withUsageLogging(handler)` | `handler[UsageLoggingSymbol] === true` |
| 2 | Sets BillingSymbol | `handler = () => {}` | `withUsageLogging(handler)` | `handler[BillingSymbol] === true` |
| 3 | Does not set SecuritySymbol | `handler = () => {}` | `withUsageLogging(handler)` | `handler[SecuritySymbol] === undefined` |
| 4 | Does not set LoggingSymbol | `handler = () => {}` | `withUsageLogging(handler)` | `handler[LoggingSymbol] === undefined` |

---

### Function: `withLogging`

**Signature:** `function withLogging(handler: AzureHttpHandler): void`

**Purpose:** Mark handler as requiring invocation logging. Sets LoggingSymbol, BillingSymbol.

**Type:** Pure (mutates input)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Sets LoggingSymbol | `handler = () => {}` | `withLogging(handler)` | `handler[LoggingSymbol] === true` |
| 2 | Sets BillingSymbol | `handler = () => {}` | `withLogging(handler)` | `handler[BillingSymbol] === true` |
| 3 | Does not set SecuritySymbol | `handler = () => {}` | `withLogging(handler)` | `handler[SecuritySymbol] === undefined` |
| 4 | Does not set UsageLoggingSymbol | `handler = () => {}` | `withLogging(handler)` | `handler[UsageLoggingSymbol] === undefined` |

---

### Function: `withBilling`

**Signature:** `function withBilling(handler: AzureHttpHandler): void`

**Purpose:** Mark handler as needing billing data bound. Sets BillingSymbol only.

**Type:** Pure (mutates input)

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Sets BillingSymbol | `handler = () => {}` | `withBilling(handler)` | `handler[BillingSymbol] === true` |
| 2 | Does not set SecuritySymbol | `handler = () => {}` | `withBilling(handler)` | `handler[SecuritySymbol] === undefined` |
| 3 | Does not set LoggingSymbol | `handler = () => {}` | `withBilling(handler)` | `handler[LoggingSymbol] === undefined` |
| 4 | Does not set UsageLoggingSymbol | `handler = () => {}` | `withBilling(handler)` | `handler[UsageLoggingSymbol] === undefined` |

---

## preprocessBilling.ts

### TestExports Required

```typescript
export const TestExports = {
    hasSymbol,
    logUnhandledError,
};
```

---

### Function: `hasSymbol`

**Signature:** `function hasSymbol(handler: AzureHttpHandler, symbol: symbol): boolean`

**Purpose:** Check if handler has a specific symbol.

**Type:** Pure

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Handler has symbol | `handler[SecuritySymbol] = true` | `hasSymbol(handler, SecuritySymbol)` | `true` |
| 2 | Handler doesn't have symbol | `handler = () => {}` | `hasSymbol(handler, SecuritySymbol)` | `false` |
| 3 | Symbol value is false | `handler[SecuritySymbol] = false` | `hasSymbol(handler, SecuritySymbol)` | `false` |
| 4 | Symbol value is truthy | `handler[SecuritySymbol] = "yes"` | `hasSymbol(handler, SecuritySymbol)` | `true` |

---

### Function: `logUnhandledError`

**Signature:** `async function logUnhandledError(error: unknown): Promise<void>`

**Purpose:** Log an unhandled billing error to blob storage. Best-effort.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Logs Error instance | `error = new Error("test")` | `logUnhandledError(error)` | Entry has `message: "test"` |
| 2 | Logs string error | `error = "string error"` | `logUnhandledError(error)` | Entry has `message: "string error"` |
| 3 | Logs non-string error | `error = { foo: "bar" }` | `logUnhandledError(error)` | Entry has stringified message |
| 4 | Appends to existing entries | Blob has `[existing]` | `logUnhandledError(error)` | Result is `[existing, new]` |
| 5 | Blob write fails - no throw | Blob.optimisticUpdate throws | `logUnhandledError(error)` | Resolves without error |
| 6 | Entry has timestamp | `Date.now() = 1000` | `logUnhandledError(error)` | Entry has `timestamp: 1000` |

---

### Function: `preprocessBilling` (exported)

**Signature:** `async function preprocessBilling(request: AzureHttpRequest, headers: ParsedNinjaHeaders, handler: AzureHttpHandler): Promise<void>`

**Purpose:** Main billing preprocessing orchestration. Executes stages based on handler decorators.

**Type:** Impure (orchestrates stages)

**Mocking Required:** `isPrivateBackend`, `CacheManager`, all stage functions, `logUnhandledError`

#### Test Cases: Guard Clauses

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Private backend - skips all | `isPrivateBackend = true` | `preprocessBilling(...)` | Returns without binding |
| 2 | No BillingSymbol - skips | Handler has no symbols | `preprocessBilling(...)` | Returns without binding |

#### Test Cases: Stage Execution

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 3 | BillingSymbol only - binds but no permission | Handler has BillingSymbol | `preprocessBilling(...)` | bindingStage, claimingStage, blockingStage, dunningStage called |
| 4 | SecuritySymbol - invalidates cache first | Handler has SecuritySymbol | `preprocessBilling(...)` | CacheManager.invalidateAll called before binding |
| 5 | SecuritySymbol - runs permission stage | Handler has SecuritySymbol | `preprocessBilling(...)` | permissionStage, enforcePermission called |
| 6 | Stages execute in order | Handler has SecuritySymbol | `preprocessBilling(...)` | Order: invalidateAll → binding → claiming → blocking → dunning → permission → enforce |

#### Test Cases: Error Handling

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | ErrorResponse propagates | permissionStage throws ErrorResponse | `preprocessBilling(...)` | Error re-thrown |
| 8 | Non-ErrorResponse - "on the house" | bindingStage throws Error("blob failed") | `preprocessBilling(...)` | No error, `request.billing === undefined` |
| 9 | Non-ErrorResponse - logs error | bindingStage throws Error | `preprocessBilling(...)` | logUnhandledError called |
| 10 | Blob error during claiming - recovers | claimingStage throws Error | `preprocessBilling(...)` | billing deleted, request proceeds |

---

## writebacks.ts

### TestExports Required

```typescript
export const TestExports = {
    normalize,
    writeBackNewOrphan,
    writeBackClaimedApp,
    writeBackForceOrphanedApp,
    writeBackUserUpdate,
    updateFirstSeenTimestamp,
    logActivity,
};
```

---

### Function: `normalize`

**Signature:** `function normalize(value: string | undefined): string`

**Purpose:** Normalizes strings for comparison.

**Type:** Pure

Same test cases as `getUserPermission.ts`.

---

### Function: `writeBackNewOrphan`

**Signature:** `async function writeBackNewOrphan(app: AppInfo): Promise<void>`

**Purpose:** Write back a new orphan app to apps.json.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class, `CacheManager.updateApp`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Adds new app | Blob has `[]` | `writeBackNewOrphan(app)` | Blob now has `[app]` |
| 2 | App already exists - no duplicate | Blob has `[{ id: "app1", publisher: "Pub" }]` | `writeBackNewOrphan({ id: "app1", publisher: "Pub" })` | Blob still has `[original]` |
| 3 | Case-insensitive duplicate check | Blob has `[{ id: "APP1", publisher: "PUB" }]` | `writeBackNewOrphan({ id: "app1", publisher: "pub" })` | No duplicate added |
| 4 | Updates cache | | `writeBackNewOrphan(app)` | CacheManager.updateApp called |
| 5 | Uses optimisticUpdate | | `writeBackNewOrphan(app)` | Blob.optimisticUpdate called |

---

### Function: `writeBackClaimedApp`

**Signature:** `async function writeBackClaimedApp(app: AppInfo): Promise<void>`

**Purpose:** Write back claimed app ownership to apps.json.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class, `CacheManager.updateApp`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Updates existing app ownership | Blob has `[{ id: "app1", ... }]` | `writeBackClaimedApp({ id: "app1", ownerType: "organization", ownerId: "org1" })` | Ownership updated |
| 2 | Preserves other fields | Blob has `[{ id: "app1", name: "App", created: 1000 }]` | `writeBackClaimedApp(...)` | name and created preserved |
| 3 | App not found - adds it | Blob has `[]` | `writeBackClaimedApp(app)` | App added with ownership |
| 4 | Case-insensitive match | Blob has `[{ id: "APP1", publisher: "PUB" }]` | `writeBackClaimedApp({ id: "app1", publisher: "pub", ... })` | Existing entry updated |
| 5 | Updates cache | | `writeBackClaimedApp(app)` | CacheManager.updateApp called |

---

### Function: `writeBackForceOrphanedApp`

**Signature:** `async function writeBackForceOrphanedApp(app: AppInfo): Promise<void>`

**Purpose:** Remove ownership from app in blob (force-orphan).

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class, `CacheManager.updateApp`

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Removes ownership | Blob has `[{ id: "app1", ownerType: "user", ownerId: "user1" }]` | `writeBackForceOrphanedApp(app)` | ownerType and ownerId removed |
| 2 | Preserves other fields | Blob has `[{ id: "app1", name: "App", ownerType: "user", ownerId: "u1" }]` | `writeBackForceOrphanedApp(...)` | name preserved, ownership removed |
| 3 | App not found - no change | Blob has `[]` | `writeBackForceOrphanedApp(app)` | Blob unchanged |
| 4 | Updates cache | | `writeBackForceOrphanedApp(app)` | CacheManager.updateApp called |

---

### Function: `writeBackUserUpdate`

**Signature:** `async function writeBackUserUpdate(orgId: string, gitEmail: string, updateType: "ALLOW" | "DENY" | "UNKNOWN"): Promise<void>`

**Purpose:** Write back user updates to organizations.json.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class, `CacheManager.updateOrganization`

#### Test Cases: ALLOW

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Adds user to users list | Org has `users: []` | `writeBackUserUpdate(orgId, "user@example.com", "ALLOW")` | users contains email |
| 2 | Does not duplicate | Org has `users: ["user@example.com"]` | `writeBackUserUpdate(orgId, "user@example.com", "ALLOW")` | users still has 1 entry |
| 3 | Case-insensitive duplicate check | Org has `users: ["User@Example.COM"]` | `writeBackUserUpdate(orgId, "user@example.com", "ALLOW")` | No duplicate |
| 4 | Removes from deniedUsers | Org has `deniedUsers: ["user@example.com"]` | `writeBackUserUpdate(orgId, "user@example.com", "ALLOW")` | deniedUsers empty |

#### Test Cases: DENY

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 5 | Adds user to deniedUsers | Org has `deniedUsers: []` | `writeBackUserUpdate(orgId, "user@example.com", "DENY")` | deniedUsers contains email |
| 6 | Does not duplicate | Org has `deniedUsers: ["user@example.com"]` | `writeBackUserUpdate(orgId, "user@example.com", "DENY")` | Still 1 entry |
| 7 | Does not modify users list | Org has `users: ["user@example.com"]` | `writeBackUserUpdate(orgId, "user@example.com", "DENY")` | users unchanged |

#### Test Cases: UNKNOWN

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 8 | Sets firstSeenTimestamp | Org has `userFirstSeenTimestamp: {}` | `writeBackUserUpdate(orgId, "user@example.com", "UNKNOWN")` | Timestamp set |
| 9 | Does not overwrite existing | Org has `userFirstSeenTimestamp: { "user@example.com": 1000 }` | `writeBackUserUpdate(...)` at time 2000 | Still 1000 |
| 10 | Email normalized for key | | `writeBackUserUpdate(orgId, "User@Example.COM", "UNKNOWN")` | Key is `"user@example.com"` |

#### Test Cases: General

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 11 | Org not found - no change | Blob has no matching org | `writeBackUserUpdate(...)` | Blob unchanged |
| 12 | Updates cache | | `writeBackUserUpdate(...)` | CacheManager.updateOrganization called |

---

### Function: `updateFirstSeenTimestamp`

**Signature:** `async function updateFirstSeenTimestamp(orgId: string, gitEmail: string): Promise<void>`

**Purpose:** Update first-seen timestamp for a user if not already set.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Sets timestamp for new user | Org has `userFirstSeenTimestamp: {}` | `updateFirstSeenTimestamp(...)` | Timestamp set |
| 2 | Does not overwrite existing | Org has `userFirstSeenTimestamp: { "user@example.com": 1000 }` | `updateFirstSeenTimestamp(...)` | Still 1000 |
| 3 | Email normalized | | `updateFirstSeenTimestamp(orgId, "User@Example.COM")` | Key is lowercase |
| 4 | Org not found - no change | Blob has no matching org | `updateFirstSeenTimestamp(...)` | No error |

---

### Function: `logActivity`

**Signature:** `async function logActivity(orgId: string, appId: string, gitEmail: string): Promise<void>`

**Purpose:** Log activity for organization apps.

**Type:** Impure (blob write)

**Mocking Required:** `Blob` class

#### Test Cases

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Appends entry | Blob has `[]` | `logActivity("org1", "app1", "user@example.com")` | Blob has entry |
| 2 | Entry has correct structure | | `logActivity(...)` | Entry has appId, email, timestamp |
| 3 | Correct blob path | `orgId = "org123"` | `logActivity("org123", ...)` | Path is `"logs://org123_featureLog.json"` |
| 4 | Appends to existing | Blob has `[existing]` | `logActivity(...)` | `[existing, new]` |

---

### Function: `performWritebacks` (exported)

**Signature:** `async function performWritebacks(request: AzureHttpRequest, headers: ParsedNinjaHeaders, handler?: AzureHttpHandler): Promise<void>`

**Purpose:** Perform all billing writebacks based on flags set during preprocessing.

**Type:** Impure (orchestrates blob writes)

**Mocking Required:** `isPrivateBackend`, all writeback functions

#### Test Cases: Guard Clauses

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | Private backend - skips | `isPrivateBackend = true` | `performWritebacks(...)` | No writebacks |
| 2 | No billing - skips | `request = {}` | `performWritebacks(...)` | No writebacks |

#### Test Cases: Writeback Flags

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 3 | writeBackNewOrphan flag | `billing = { writeBackNewOrphan: true, app: {...} }` | `performWritebacks(...)` | writeBackNewOrphan called |
| 4 | writeBackClaimed flag | `billing = { writeBackClaimed: true, app: {...} }` | `performWritebacks(...)` | writeBackClaimedApp called |
| 5 | writeBackForceOrphan flag | `billing = { writeBackForceOrphan: true, app: {...} }` | `performWritebacks(...)` | writeBackForceOrphanedApp called |
| 6 | writeBackNewUser flag | `billing = { writeBackNewUser: "ALLOW", organization: {...} }`, `headers = { gitUserEmail: "..." }` | `performWritebacks(...)` | writeBackUserUpdate called |
| 7 | No flag set - no writeback | `billing = { app: {...} }` | `performWritebacks(...)` | No writeback functions called |
| 8 | Missing app - skips app writebacks | `billing = { writeBackNewOrphan: true }` (no app) | `performWritebacks(...)` | writeBackNewOrphan not called |
| 9 | Missing org - skips user writeback | `billing = { writeBackNewUser: "ALLOW" }` (no org) | `performWritebacks(...)` | writeBackUserUpdate not called |
| 10 | Missing gitEmail - skips user writeback | `billing = { writeBackNewUser: "ALLOW", organization: {...} }`, `headers = {}` | `performWritebacks(...)` | writeBackUserUpdate not called |

#### Test Cases: First-Seen Timestamp Update

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 11 | Updates firstSeen for org users | `billing = { organization: {...} }`, `headers = { gitUserEmail: "..." }` | `performWritebacks(...)` | updateFirstSeenTimestamp called |
| 12 | No org - skips firstSeen | `billing = {}`, `headers = { gitUserEmail: "..." }` | `performWritebacks(...)` | updateFirstSeenTimestamp not called |

#### Test Cases: Activity Logging

| # | Case | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 13 | UsageLogging + org app - logs | Handler has UsageLoggingSymbol, `billing = { organization: {...}, app: {...} }` | `performWritebacks(...)` | logActivity called |
| 14 | No UsageLogging - skips | Handler has no symbols | `performWritebacks(...)` | logActivity not called |
| 15 | Permission denied - skips logging | `billing = { permission: { allowed: false }, ... }` | `performWritebacks(...)` | logActivity not called |
| 16 | User in deniedUsers - skips | User in org.deniedUsers | `performWritebacks(...)` | logActivity not called |
| 17 | No gitEmail - skips logging | `headers = {}` | `performWritebacks(...)` | logActivity not called |

---

## Test File Structure

Recommended file structure:

```
ninja-backend/test/billing/unit/
├── getUserPermission.test.ts
├── stages/
│   ├── claiming.test.ts
│   ├── permission.test.ts
│   ├── dunning.test.ts
│   ├── blocking.test.ts
│   └── binding.test.ts
├── touchActivityLogging.test.ts
├── successPostprocessing.test.ts
├── CacheManager.test.ts
├── decorators.test.ts
├── preprocessBilling.test.ts
└── writebacks.test.ts
```

---

## Implementation Notes

### AAA Pattern

Every test should follow Arrange-Act-Assert:

```typescript
it("should return true for explicitly allowed user", () => {
    // Arrange
    const org: OrganizationInfo = {
        id: "org1",
        users: ["user@example.com"],
        // ... required fields
    };
    const email = "user@example.com";

    // Act
    const result = getUserPermission(org, email);

    // Assert
    expect(result).toBe(true);
});
```

### Mocking Time

For time-dependent tests (grace periods, cache TTL), use Jest's timer mocking:

```typescript
beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00Z"));
});

afterEach(() => {
    jest.useRealTimers();
});
```

### Creating Minimal Test Fixtures

Only include required properties in test objects:

```typescript
// Good - minimal fixture
const org = {
    id: "org1",
    users: ["user@example.com"],
} as OrganizationInfo;

// Avoid - overly detailed fixture
const org = {
    id: "org1",
    name: "Test Org",
    address: "123 Test St",
    // ... many unused fields
};
```

### Testing Mutations

For functions that mutate input, verify both the mutation and the return value:

```typescript
it("should set claimIssue and not modify app ownership", () => {
    // Arrange
    const billing: BillingInfo = {
        app: { id: "app1", name: "Test", publisher: "Pub", created: 1000, freeUntil: 2000 },
    };

    // Act
    handleClaimResult(billing, []);

    // Assert
    expect(billing.claimIssue).toBe(true);
    expect(billing.app?.ownerType).toBeUndefined();
    expect(billing.app?.ownerId).toBeUndefined();
});
```

### Mocking Impure Dependencies

For impure functions, mock collaborators directly:

```typescript
// Mock CacheManager
jest.mock("../CacheManager", () => ({
    CacheManager: {
        getOrganizations: jest.fn(),
        getApp: jest.fn(),
        // ... other methods
    },
}));

// Mock Blob class
jest.mock("@vjeko.com/azure-blob", () => ({
    Blob: jest.fn().mockImplementation(() => ({
        read: jest.fn(),
        optimisticUpdate: jest.fn(),
    })),
}));
```

### Testing ErrorResponse Throws

```typescript
it("should throw ErrorResponse with 403 when permission denied", () => {
    // Arrange
    const request = {
        billing: {
            permission: { allowed: false, error: { code: "GRACE_EXPIRED" } },
        },
    };

    // Act & Assert
    expect(() => enforcePermission(request)).toThrow(ErrorResponse);
    expect(() => enforcePermission(request)).toThrow(
        expect.objectContaining({ status: 403 })
    );
});
```

---

## Summary: Functions Requiring TestExports

| File | Functions to Export |
|------|---------------------|
| `getUserPermission.ts` | `normalize`, `getDomain` |
| `stages/claiming.ts` | `normalize`, `getDomain`, `handleClaimResult` |
| `stages/permission.ts` | `mapBlockReason`, `getOrphanPermission`, `getAuthorizedEmails`, `getPersonalPermission`, `getOrganizationPermission`, `handleUnknownOrgUser` |
| `stages/binding.ts` | `bindApp`, `bindOwnership`, `forceOrphan` |
| `touchActivityLogging.ts` | `getFeatureLogPath`, `getOrganizationId`, `isUserAllowedForLogging`, `appendActivityEntries` |
| `successPostprocessing.ts` | `addToResponseBody` |
| `CacheManager.ts` | Via `CacheManagerTestExports`: `_isValid`, `_normalize` |
| `preprocessBilling.ts` | `hasSymbol`, `logUnhandledError` |
| `writebacks.ts` | `normalize`, `writeBackNewOrphan`, `writeBackClaimedApp`, `writeBackForceOrphanedApp`, `writeBackUserUpdate`, `updateFirstSeenTimestamp`, `logActivity` |

---

## Total Test Count Estimate

| Module | Test Cases |
|--------|------------|
| getUserPermission.ts | 23 |
| stages/claiming.ts | 23 |
| stages/permission.ts | 52 |
| stages/dunning.ts | 12 |
| stages/blocking.ts | 6 |
| stages/binding.ts | 18 |
| touchActivityLogging.ts | 24 |
| successPostprocessing.ts | 20 |
| CacheManager.ts | 52 |
| decorators.ts | 16 |
| preprocessBilling.ts | 16 |
| writebacks.ts | 38 |
| **Total** | **~300** |
