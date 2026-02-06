# Billing Integration Test Fixes Required

This document identifies all quality issues in the billing integration tests and provides specific, actionable instructions for fixing each one.

---

## Table of Contents

1. [Critical: Tests With No Assertions](#critical-tests-with-no-assertions)
2. [High: Tests That Don't Test What They Claim](#high-tests-that-dont-test-what-they-claim)
3. [Medium: Weak Assertions](#medium-weak-assertions)
4. [Medium: Misleading Test Names/Setups](#medium-misleading-test-namessetups)
5. [Medium: Missing Key Assertions](#medium-missing-key-assertions)

---

## Critical: Tests With No Assertions

These tests provide zero value. They always pass regardless of whether the code works.

---

### CRIT-1: Writebacks on Handler Error

**File**: `billing-writebacks.blob.test.ts`
**Test**: "should still perform writebacks even when handler throws"
**Lines**: 239-267

**Current Code**:
```typescript
// WHEN: handleRequest is called (and catches error)
await handleRequest(wrappedHandler as any, request);

// THEN: Writebacks still occur (finally block executes)
// The orphan app should still be written
const apps = getApps();
// This test verifies finally block behavior
// Actual assertion depends on implementation
```

**Problem**: Retrieves `apps` but never asserts anything about it. Test always passes.

**Fix Required**:
```typescript
// WHEN: handleRequest is called (and catches error)
const response = await handleRequest(wrappedHandler as any, request);

// THEN: Response is 500 (handler threw)
expect(response.status).toBe(500);

// AND: Writebacks still occurred (finally block executed)
const apps = getApps();
expect(apps).toHaveLength(1);
expect(apps[0].id).toBe("new-orphan");
expect(apps[0].publisher).toBe("New Publisher");
```

---

### CRIT-2: Info Logging TODO Never Completed

**File**: `billing-decorators.blob.test.ts`
**Test**: "should invoke info log function"
**Lines**: 140-159

**Current Code**:
```typescript
// THEN: Info log function is invoked
// TODO: Verify once implemented
expect(response.status).toBe(200);
```

**Problem**: Contains TODO that was never completed. Doesn't test logging.

**Fix Required**:

Option A - If info logging writes to a blob:
```typescript
// THEN: Info log blob contains entry
expect(response.status).toBe(200);
const infoLog = getInfoLog(APP_ORGANIZATION.id); // Add helper if needed
expect(infoLog).toHaveLength(1);
expect(infoLog[0].appId).toBe(APP_ORGANIZATION.id);
```

Option B - If info logging is not yet implemented:
```typescript
// Mark test as skipped until implementation exists
it.skip("should invoke info log function", async () => {
    // TODO: Implement when info logging is added
});
```

Option C - If info logging is handled differently, update the test to match actual implementation.

---

### CRIT-3: Malformed JSON Handling

**File**: `billing-edge-cases.blob.test.ts`
**Test**: "should handle invalid JSON in apps.json gracefully"
**Lines**: 136-154

**Current Code**:
```typescript
// THEN: Error is handled gracefully (not 500)
// Exact status depends on error handling implementation
expect(response).toBeDefined();
```

**Problem**: `expect(response).toBeDefined()` tests nothing. Response is always defined.

**Fix Required**:

First, determine the ACTUAL expected behavior when apps.json is malformed, then assert it:
```typescript
// THEN: Request fails gracefully with appropriate error
// (Choose ONE based on actual implementation behavior)

// If it should return 500 with error message:
expect(response.status).toBe(500);
expect(response.body).toContain("apps.json");

// OR if it should treat as empty and create orphan:
expect(response.status).toBe(200);
const apps = getApps();
expect(apps).toHaveLength(1);

// OR if it should return 400:
expect(response.status).toBe(400);
```

---

### CRIT-4: Empty Organization Arrays

**File**: `billing-edge-cases.blob.test.ts`
**Test**: "should handle organization with empty users and domains"
**Lines**: 241-272

**Current Code**:
```typescript
// THEN: Handled correctly (either grace period or denyUnknown)
expect(response).toBeDefined();
```

**Problem**: Same non-assertion issue.

**Fix Required**:

Determine expected behavior and assert it:
```typescript
// THEN: User gets grace period since denyUnknownDomains defaults to false
expect(response.status).toBe(200);
const body = JSON.parse(response.body as string);
expect(body.warning).toBeDefined();
expect(body.warning.code).toBe("ORG_GRACE_PERIOD");

// AND: First-seen timestamp is recorded
expectUserFirstSeen(emptyOrg.id, "user@unknown.com");
```

---

## High: Tests That Don't Test What They Claim

These tests claim to verify specific behaviors but only check status 200.

---

### HIGH-1: User Binding for Personal Apps

**File**: `billing-binding.blob.test.ts`
**Test**: "should bind user when app is personal"
**Lines**: 166-183

**Current Code**:
```typescript
// THEN: Request proceeds (user is bound internally)
expect(response.status).toBe(200);
```

**Problem**: Claims to test user binding but doesn't verify user was bound.

**Fix Required**:

The binding is internal to `request.billing`, so we need to verify it's used correctly. Best approach is to verify a behavior that DEPENDS on user binding:
```typescript
// WHEN: handleRequest is called
const response = await handleRequest(handler, request);

// THEN: Request succeeds (proves user was bound and permission checked)
expect(response.status).toBe(200);

// AND: Using a different email would fail (proves binding matters)
const wrongEmailRequest = createMockHttpRequest({
    appId: APP_PERSONAL.id,
    appPublisher: APP_PERSONAL.publisher,
    gitEmail: "wrong@example.com",
});
const wrongResponse = await handleRequest(createTestHandler("security"), wrongEmailRequest);
expect(wrongResponse.status).toBe(403);
```

Alternative: If you want to directly verify binding, modify the test handler to expose `request.billing`:
```typescript
let capturedBilling: any;
const handler: AzureHttpHandler = async (request) => {
    capturedBilling = request.billing;
    return { success: true };
};
withBilling(handler);

// ... after handleRequest ...
expect(capturedBilling.user).toBeDefined();
expect(capturedBilling.user.id).toBe(USER_PERSONAL.id);
```

---

### HIGH-2: Organization Binding

**File**: `billing-binding.blob.test.ts`
**Test**: "should bind organization when app is org-owned"
**Lines**: 186-204

**Current Code**:
```typescript
// THEN: Request proceeds (organization is bound internally)
expect(response.status).toBe(200);
```

**Problem**: Claims to test organization binding but doesn't verify it.

**Fix Required** (same pattern as HIGH-1):
```typescript
let capturedBilling: any;
const handler: AzureHttpHandler = async (request) => {
    capturedBilling = request.billing;
    return { success: true };
};
withBilling(handler);

await handleRequest(handler, request);

expect(capturedBilling.organization).toBeDefined();
expect(capturedBilling.organization.id).toBe(ORG_FIXED_TIER.id);
```

---

### HIGH-3: Sponsored App Skips Ownership

**File**: `billing-binding.blob.test.ts`
**Test**: "should skip ownership binding for sponsored apps"
**Lines**: 207-224

**Current Code**:
```typescript
// THEN: Request proceeds without ownership lookup
expect(response.status).toBe(200);
```

**Problem**: Doesn't verify ownership binding was skipped.

**Fix Required**:
```typescript
let capturedBilling: any;
const handler: AzureHttpHandler = async (request) => {
    capturedBilling = request.billing;
    return { success: true };
};
withBilling(handler);

await handleRequest(handler, request);

// Sponsored apps have billing.app but no user/organization binding
expect(capturedBilling.app).toBeDefined();
expect(capturedBilling.app.sponsored).toBe(true);
expect(capturedBilling.user).toBeUndefined();
expect(capturedBilling.organization).toBeUndefined();
```

---

### HIGH-4: Security Decorator Full Flow

**File**: `billing-decorators.blob.test.ts`
**Test**: "should execute all billing stages for security-decorated handler"
**Lines**: 43-60

**Current Code**:
```typescript
// THEN: Full flow executed (binding, claiming, blocking, dunning, permission)
expect(response.status).toBe(200);
```

**Problem**: Claims to test ALL stages but doesn't verify any ran.

**Fix Required**:

This test's intent is too broad. Split into specific tests OR capture billing state:
```typescript
let capturedBilling: any;
const handler: AzureHttpHandler = async (request) => {
    capturedBilling = request.billing;
    return { success: true };
};
withSecurity(handler);

await handleRequest(handler, request);

// Verify all stages executed by checking bound data
expect(capturedBilling).toBeDefined();
expect(capturedBilling.app).toBeDefined();           // Binding ran
expect(capturedBilling.organization).toBeDefined();  // Ownership bound
expect(capturedBilling.permission).toBeDefined();    // Permission evaluated
expect(capturedBilling.permission.allowed).toBe(true);
```

---

### HIGH-5: No Decorator Skips Billing

**File**: `billing-decorators.blob.test.ts`
**Test**: "should skip billing preprocessing without decorators"
**Lines**: 182-199

**Current Code**:
```typescript
// THEN: No billing preprocessing occurs
expect(response.status).toBe(200);
// billing property should be undefined
```

**Problem**: Comment says billing should be undefined but there's no assertion.

**Fix Required**:
```typescript
let capturedBilling: any;
const handler: AzureHttpHandler = async (request) => {
    capturedBilling = request.billing;
    return { success: true };
};
// NO decorator applied

await handleRequest(handler, request);

expect(response.status).toBe(200);
expect(capturedBilling).toBeUndefined();
```

---

## Medium: Weak Assertions

These tests have assertions that are too permissive.

---

### MED-1: Blocking Skipped for Personal Apps

**File**: `billing-blocking.blob.test.ts`
**Test**: "should skip blocking check for personal apps"
**Lines**: 135-158

**Current Code**:
```typescript
// Response may still fail for other reasons (user auth),
// but not for blocking
expect(response.status).not.toBe(403);
```

**Problem**: `not.toBe(403)` is weak. Could pass if something else fails.

**Fix Required**:

Make the test setup ensure success, then assert success:
```typescript
// GIVEN: Personal app with MATCHING user email
setupApps([APP_PERSONAL]);
setupUsers([USER_PERSONAL]);
setupBlockedCache({
    "some-org": BLOCKED_FLAGGED,
});

const handler = createTestHandler("security");
const request = createMockHttpRequest({
    appId: APP_PERSONAL.id,
    appPublisher: APP_PERSONAL.publisher,
    gitEmail: USER_PERSONAL.gitEmail, // Use correct email so permission passes
});

// WHEN
const response = await handleRequest(handler, request);

// THEN: Succeeds (blocking check was skipped, permission passed)
expect(response.status).toBe(200);
```

---

### MED-2: Missing Organization Handling

**File**: `billing-edge-cases.blob.test.ts`
**Test**: "should handle missing organization gracefully"
**Lines**: 85-108

**Current Code**:
```typescript
// THEN: Appropriate error or fallback behavior
// The exact behavior depends on implementation
expect(response.status).not.toBe(500);
```

**Problem**: "Depends on implementation" means undefined behavior.

**Fix Required**:

Determine and document the expected behavior, then assert it:
```typescript
// THEN: Returns 403 because org not found means can't verify permission
expect(response.status).toBe(403);
const body = JSON.parse(response.body as string);
expect(body.error.code).toBe("ORG_NOT_FOUND"); // Or whatever the actual code is

// OR if it should succeed as orphan:
expect(response.status).toBe(200);
// App should be treated as orphan since org doesn't exist
```

---

## Medium: Misleading Test Names/Setups

These tests have names or setups that don't match what they actually test.

---

### MED-3: Dunning Check Skipped - Wrong Setup

**File**: `billing-dunning.blob.test.ts`
**Test**: "should skip dunning check for personal apps"
**Lines**: 79-99

**Current Code**:
```typescript
setupApps([APP_PERSONAL]);
setupDunningCache({
    "some-org": { stage: 2, since: NOW },
});
```

**Problem**: Dunning is set for "some-org" which is unrelated to `APP_PERSONAL`. The test would pass even if dunning check ran because there's no dunning for the personal app's (non-existent) org.

**Fix Required**:

To properly test that dunning is skipped for personal apps, we need a scenario where dunning WOULD apply if the check ran:
```typescript
// GIVEN: Personal app owned by a user
setupApps([APP_PERSONAL]);
setupUsers([USER_PERSONAL]);
// Note: Personal apps have no org, so dunning check should be skipped entirely
// The absence of dunning header proves the check was skipped

const handler = createTestHandler("security");
const request = createMockHttpRequest({
    appId: APP_PERSONAL.id,
    appPublisher: APP_PERSONAL.publisher,
    gitEmail: USER_PERSONAL.gitEmail,
});

const response = await handleRequest(handler, request);

// THEN: No dunning header (personal apps skip dunning stage)
expect(response.status).toBe(200);
expect(response.headers?.["X-Ninja-Dunning-Warning"]).toBeUndefined();
```

The current test is technically correct but misleading. Add a comment explaining:
```typescript
// Note: Personal apps have ownerType="user", not "organization",
// so the dunning stage has nothing to check. The absence of the
// header confirms dunning logic correctly ignores non-org apps.
```

---

### MED-4: Batch Logging - Only Tests Single Item

**File**: `billing-activity-logging.blob.test.ts`
**Test**: "should batch log entries for multiple apps in same org"
**Lines**: 175-205

**Current Code**:
```typescript
// This test is for touch endpoint which handles multiple apps
// The implementation will handle batching
const handler = createTestHandler("usageLogging");
const request = createMockHttpRequest({
    appId: app1.id, // Only ONE app
    ...
});
```

**Problem**: Test name says "multiple apps" but only tests one app.

**Fix Required**:

Either rename the test to match what it does, OR implement proper batch testing:

Option A - Rename to match reality:
```typescript
describe("Touch Activity - Single App Logged", () => {
    it("should log activity entry for organization app", async () => {
```

Option B - Actually test batching (if touch endpoint exists):
```typescript
it("should batch log entries for multiple apps in same org", async () => {
    const app1 = { ...APP_ORGANIZATION, id: "app-1" };
    const app2 = { ...APP_ORGANIZATION, id: "app-2" };
    setupApps([app1, app2]);
    setupOrganizations([ORG_FIXED_TIER]);

    const handler = createTouchHandler(); // Use actual touch handler
    const request = createMockHttpRequest({
        body: {
            apps: [
                { appId: "app-1", publisher: app1.publisher },
                { appId: "app-2", publisher: app2.publisher },
            ]
        },
        gitEmail: "user1@fixed.com",
    });

    await handleRequest(handler, request);

    // THEN: Both apps logged in single write
    const log = getFeatureLog(ORG_FIXED_TIER.id);
    expect(log).toHaveLength(2);
    expect(log.map(e => e.appId)).toContain("app-1");
    expect(log.map(e => e.appId)).toContain("app-2");
});
```

---

### MED-5: Separate Org Logs - Only Tests One Org

**File**: `billing-activity-logging.blob.test.ts`
**Test**: "should write separate logs for different organizations"
**Lines**: 208-255

**Current Code**:
```typescript
// THEN: org-a has log entry
const logA = getFeatureLog("org-a");
expect(logA.length).toBeGreaterThanOrEqual(1);
// Missing: verification of org-b
```

**Problem**: Sets up two orgs but only verifies one.

**Fix Required**:
```typescript
// Make requests to both orgs
const requestA = createMockHttpRequest({
    appId: appA1.id,
    appPublisher: appA1.publisher,
    gitEmail: "user@both.com",
});
const requestB = createMockHttpRequest({
    appId: appB.id,
    appPublisher: appB.publisher,
    gitEmail: "user@both.com",
});

await handleRequest(handler, requestA);
await handleRequest(handler, requestB);

// THEN: Each org has its own log
const logA = getFeatureLog("org-a");
const logB = getFeatureLog("org-b");

expect(logA).toHaveLength(1);
expect(logA[0].appId).toBe("app-a1");

expect(logB).toHaveLength(1);
expect(logB[0].appId).toBe("app-b");
```

---

## Medium: Missing Key Assertions

These tests are missing important assertions that would verify correct behavior.

---

### MED-6: Denied User Logging - Missing Status Check

**File**: `billing-activity-logging.blob.test.ts`
**Test**: "should not log activity for denied users"
**Lines**: 63-82

**Current Code**:
```typescript
// WHEN: handleRequest is called (fails with 403)
const response = await handleRequest(handler, request);

// THEN: Feature log does NOT contain entry
const log = getFeatureLog(ORG_FIXED_TIER.id);
expect(log).toHaveLength(0);
```

**Problem**: Comment says "fails with 403" but there's no assertion verifying this.

**Fix Required**:
```typescript
// WHEN: handleRequest is called
const response = await handleRequest(handler, request);

// THEN: Request is denied
expect(response.status).toBe(403);

// AND: No activity was logged
const log = getFeatureLog(ORG_FIXED_TIER.id);
expect(log).toHaveLength(0);
```

---

### MED-7: Orphan App Logging - Missing Log Check

**File**: `billing-activity-logging.blob.test.ts`
**Test**: "should not log activity for orphan apps in grace period"
**Lines**: 106-124

**Current Code**:
```typescript
// THEN: No feature log entries (orphans in grace period)
expect(response.status).toBe(200);
// No org to log to since app is orphaned
```

**Problem**: Comment says no logging but there's no assertion.

**Fix Required**:
```typescript
// THEN: Request succeeds
expect(response.status).toBe(200);

// AND: No feature log created (orphan has no org to bill)
// Verify no log blobs were created for any org
expect(fakeStorage.blobExists("logs", `${ORG_FIXED_TIER.id}_featureLog.json`)).toBe(false);
```

---

### MED-8: Sponsored App Logging - Missing Log Check

**File**: `billing-activity-logging.blob.test.ts`
**Test**: "should not log activity for sponsored apps"
**Lines**: 127-143

**Current Code**:
```typescript
// THEN: No feature log entries (sponsored apps are free)
expect(response.status).toBe(200);
```

**Problem**: No assertion that logging was skipped.

**Fix Required**:
```typescript
// THEN: Request succeeds
expect(response.status).toBe(200);

// AND: No feature log created (sponsored apps don't generate billing)
expect(fakeStorage.listBlobs("logs")).toHaveLength(0);
```

---

### MED-9: Unknown User Logging - Missing Grace Warning Check

**File**: `billing-writebacks.blob.test.ts`
**Test**: "should log unknown user for grace period users"
**Lines**: 156-180

**Current Code**:
```typescript
// THEN: Unknown user blob should be updated (implementation specific)
// For now, we verify the request succeeded with grace warning
expect(response.status).toBe(200);
```

**Problem**: Says "verify with grace warning" but doesn't check the warning.

**Fix Required**:
```typescript
// THEN: Request succeeds with grace period warning
expect(response.status).toBe(200);
const body = JSON.parse(response.body as string);
expect(body.warning).toBeDefined();
expect(body.warning.code).toBe("ORG_GRACE_PERIOD");

// AND: Unknown user logged (if this feature exists)
const unknownLog = getUnknownUserLog(ORG_FIXED_TIER.id);
expect(unknownLog).toContainEqual(
    expect.objectContaining({ email: "mystery@unknown.com" })
);
```

---

## Summary Checklist

| ID | File | Status |
|----|------|--------|
| CRIT-1 | billing-writebacks.blob.test.ts | [ ] Fixed |
| CRIT-2 | billing-decorators.blob.test.ts | [ ] Fixed |
| CRIT-3 | billing-edge-cases.blob.test.ts | [ ] Fixed |
| CRIT-4 | billing-edge-cases.blob.test.ts | [ ] Fixed |
| HIGH-1 | billing-binding.blob.test.ts | [ ] Fixed |
| HIGH-2 | billing-binding.blob.test.ts | [ ] Fixed |
| HIGH-3 | billing-binding.blob.test.ts | [ ] Fixed |
| HIGH-4 | billing-decorators.blob.test.ts | [ ] Fixed |
| HIGH-5 | billing-decorators.blob.test.ts | [ ] Fixed |
| MED-1 | billing-blocking.blob.test.ts | [ ] Fixed |
| MED-2 | billing-edge-cases.blob.test.ts | [ ] Fixed |
| MED-3 | billing-dunning.blob.test.ts | [ ] Fixed |
| MED-4 | billing-activity-logging.blob.test.ts | [ ] Fixed |
| MED-5 | billing-activity-logging.blob.test.ts | [ ] Fixed |
| MED-6 | billing-activity-logging.blob.test.ts | [ ] Fixed |
| MED-7 | billing-activity-logging.blob.test.ts | [ ] Fixed |
| MED-8 | billing-activity-logging.blob.test.ts | [ ] Fixed |
| MED-9 | billing-writebacks.blob.test.ts | [ ] Fixed |

**Total: 18 issues to fix**

---

## Implementation Notes

### Pattern: Capturing Internal State

Several fixes require capturing `request.billing` to verify internal binding. Create a helper:

```typescript
// Add to billing-test-fixtures.ts

export function createCapturingHandler(decorator: DecoratorType = "none"): {
    handler: AzureHttpHandler;
    getCapturedBilling: () => BillingInfo | undefined;
} {
    let capturedBilling: BillingInfo | undefined;

    const handler: AzureHttpHandler = async (request: AzureHttpRequest) => {
        capturedBilling = request.billing;
        return { success: true };
    };

    // Apply decorator
    switch (decorator) {
        case "security": withSecurity(handler); break;
        case "usageLogging": withUsageLogging(handler); break;
        case "logging": withLogging(handler); break;
        case "billing": withBilling(handler); break;
    }

    return {
        handler,
        getCapturedBilling: () => capturedBilling,
    };
}
```

### Pattern: Verifying Absence of Blobs

For tests that verify no logging occurred:

```typescript
// Check no log blobs exist
expect(fakeStorage.listBlobs("logs")).toHaveLength(0);

// Or check specific blob doesn't exist
expect(fakeStorage.blobExists("logs", "org-id_featureLog.json")).toBe(false);
```

### Priority Order

1. **Fix CRIT-1 first** - the writebacks test is actively misleading
2. **Fix CRIT-2** - decide whether to implement or skip the info logging test
3. **Fix CRIT-3, CRIT-4** - determine actual expected behavior for edge cases
4. **Fix HIGH-1 through HIGH-5** - add capturing helper, then fix binding tests
5. **Fix MED-* issues** in order
