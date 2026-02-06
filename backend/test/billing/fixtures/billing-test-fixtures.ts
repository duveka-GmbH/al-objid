/**
 * Test Fixtures for Billing Integration Tests
 *
 * These fixtures provide consistent test data and helper functions
 * for all billing-related integration tests.
 */

import { HttpRequest } from "@azure/functions";
import { Headers } from "undici";
import { fakeStorage } from "../../__mocks__/BlobTestUtils";
import { AzureHttpHandler } from "../../../src/http/AzureHttpHandler";
import { AzureHttpRequest } from "../../../src/http/AzureHttpRequest";
import { WritebackPromiseSymbol } from "../../../src/http/handleRequest";
import {
    withSecurity,
    withUsageLogging,
    withLogging,
    withBilling,
    MonikerSymbol,
} from "../../../src/billing/decorators";
import { CacheManager } from "../../../src/billing/CacheManager";
import {
    AppInfo,
    OrganizationInfo,
    UserProfileInfo,
    BlockedOrganization,
    IdentityProvider,
    GRACE_PERIOD_MS,
} from "../../../src/billing/types";

// =============================================================================
// Time Constants
// =============================================================================

export const NOW = Date.now();
export const EXPIRED_TIMESTAMP = NOW - GRACE_PERIOD_MS - 1000;
export const VALID_GRACE_TIMESTAMP = NOW + GRACE_PERIOD_MS;
export const SOME_PAST_TIME = NOW - 7 * 24 * 60 * 60 * 1000; // 7 days ago

// Re-export for convenience
export { GRACE_PERIOD_MS };

// =============================================================================
// Test Organizations
// =============================================================================

// Base organization template with required fields
const BASE_ORG: Omit<OrganizationInfo, "id" | "name" | "users" | "deniedUsers" | "plan" | "usersLimit" | "appsLimit"> = {
    address: "123 Test St",
    zip: "12345",
    city: "Test City",
    state: "TS",
    country: "US",
    taxId: "",
    email: "test@example.com",
    adminIds: [],
    totalPrice: 0,
    discountPct: 0,
    status: "active",
    apps: [],
};

export const ORG_UNLIMITED: OrganizationInfo = {
    ...BASE_ORG,
    id: "org-unlimited",
    name: "Unlimited Corp",
    plan: "unlimited",
    users: ["allowed@unlimited.com"],
    deniedUsers: [],
    domains: ["unlimited.com"],
    publishers: ["Unlimited Publisher"],
    usersLimit: -1,
    appsLimit: -1,
};

export const ORG_FIXED_TIER: OrganizationInfo = {
    ...BASE_ORG,
    id: "org-fixed",
    name: "Fixed Tier Corp",
    plan: "medium",
    users: ["user1@fixed.com", "user2@fixed.com"],
    deniedUsers: ["denied@fixed.com"],
    domains: ["fixed.com"],
    pendingDomains: ["pending.com"],
    denyUnknownDomains: false,
    publishers: ["Fixed Publisher"],
    userFirstSeenTimestamp: {},
    usersLimit: 10,
    appsLimit: 5,
};

export const ORG_DENY_UNKNOWN: OrganizationInfo = {
    ...BASE_ORG,
    id: "org-deny",
    name: "Strict Corp",
    plan: "small",
    users: ["allowed@strict.com"],
    deniedUsers: [],
    domains: ["strict.com"],
    denyUnknownDomains: true,
    publishers: ["Strict Publisher"],
    usersLimit: 5,
    appsLimit: 3,
};

// =============================================================================
// Test Users
// =============================================================================

export const USER_PERSONAL: UserProfileInfo = {
    id: "user-personal",
    provider: IdentityProvider.GitHub,
    providerId: "gh-12345",
    name: "Personal User",
    email: "personal@example.com",
    userDetails: "personal@example.com",
    gitEmail: "git@example.com",
};

// =============================================================================
// Test Apps
// =============================================================================

export const APP_ORPHAN_VALID_GRACE: AppInfo = {
    id: "00000001-0001-0001-0001-000000000001",
    name: "Orphan App",
    publisher: "Unknown Publisher",
    created: NOW,
    freeUntil: VALID_GRACE_TIMESTAMP,
};

export const APP_ORPHAN_EXPIRED_GRACE: AppInfo = {
    id: "00000001-0001-0001-0001-000000000002",
    name: "Expired Orphan",
    publisher: "Unknown Publisher",
    created: NOW - GRACE_PERIOD_MS - 1000,
    freeUntil: EXPIRED_TIMESTAMP,
};

export const APP_PERSONAL: AppInfo = {
    id: "00000001-0001-0001-0001-000000000003",
    name: "Personal App",
    publisher: "Personal Publisher",
    ownerType: "user",
    ownerId: "user-personal",
    created: NOW,
    freeUntil: NOW,
};

export const APP_ORGANIZATION: AppInfo = {
    id: "00000001-0001-0001-0001-000000000004",
    name: "Org App",
    publisher: "Fixed Publisher",
    ownerType: "organization",
    ownerId: "org-fixed",
    created: NOW,
    freeUntil: NOW,
};

export const APP_SPONSORED: AppInfo = {
    id: "00000001-0001-0001-0001-000000000005",
    name: "Sponsored App",
    publisher: "Sponsored Publisher",
    sponsored: true,
    created: NOW,
    freeUntil: NOW,
};

// =============================================================================
// Blocked Organization Entries
// =============================================================================

export const BLOCKED_FLAGGED: BlockedOrganization = {
    reason: "flagged",
    blockedAt: NOW,
};

export const BLOCKED_PAYMENT_FAILED: BlockedOrganization = {
    reason: "payment_failed",
    blockedAt: NOW,
};

export const BLOCKED_SUBSCRIPTION_CANCELLED: BlockedOrganization = {
    reason: "subscription_cancelled",
    blockedAt: NOW,
};

export const BLOCKED_NO_SUBSCRIPTION: BlockedOrganization = {
    reason: "no_subscription",
    blockedAt: NOW,
};

// =============================================================================
// Storage Setup Functions
// =============================================================================

/**
 * Clears all caches (both storage and billing cache).
 * Call this in beforeEach.
 */
export function clearAllCaches(): void {
    fakeStorage.clear();
    CacheManager.clear();
}

export function setupOrganizations(orgs: OrganizationInfo[]): void {
    fakeStorage.uploadBlob("system", "organizations.json", JSON.stringify(orgs));
}

export function setupUsers(users: UserProfileInfo[]): void {
    fakeStorage.uploadBlob("system", "users.json", JSON.stringify(users));
}

export function setupApps(apps: AppInfo[]): void {
    fakeStorage.uploadBlob("system", "apps.json", JSON.stringify(apps));
}

export function setupBlockedOrganizations(blocked: Record<string, BlockedOrganization>): void {
    fakeStorage.uploadBlob("system", "blocked.json", JSON.stringify({
        updatedAt: NOW,
        orgs: blocked,
    }));
}

export function setupDunningCache(dunning: Record<string, { stage: number; since: number }>): void {
    // DunningCache expects an array of DunningEntry at system://dunning.json
    const entries = Object.entries(dunning).map(([orgId, { stage, since }]) => ({
        organizationId: orgId,
        dunningStage: stage as 1 | 2 | 3,
        startedAt: since,
        lastStageChangedAt: since,
    }));
    fakeStorage.uploadBlob("system", "dunning.json", JSON.stringify(entries));
}

// =============================================================================
// Storage Retrieval Functions
// =============================================================================

export function getApps(): AppInfo[] {
    return fakeStorage.getBlobContentAsJSON("system", "apps.json") ?? [];
}

export function getOrganizations(): OrganizationInfo[] {
    return fakeStorage.getBlobContentAsJSON("system", "organizations.json") ?? [];
}

export function getOrganization(id: string): OrganizationInfo | undefined {
    const orgs = getOrganizations();
    return orgs.find(org => org.id === id);
}

export function getFeatureLog(orgId: string): any[] {
    return fakeStorage.getBlobContentAsJSON("logs", `${orgId}_featureLog.json`) ?? [];
}

export function getUnknownUserLog(orgId: string): any[] {
    return fakeStorage.getBlobContentAsJSON("logs", `${orgId}_unknown.json`) ?? [];
}

// =============================================================================
// Test Handler Creation
// =============================================================================

export type DecoratorType = "security" | "usageLogging" | "logging" | "billing" | "none";

// Default moniker used in tests
export const TEST_DEFAULT_MONIKER = "test-endpoint";

/**
 * Creates a test handler with the specified decorator.
 * The handler simply returns a success response.
 *
 * @param decorator - The decorator type to apply
 * @param moniker - The endpoint moniker/feature name (default: "test-endpoint")
 */
export function createTestHandler(
    decorator: DecoratorType = "none",
    moniker: string = TEST_DEFAULT_MONIKER
): AzureHttpHandler {
    const handler: AzureHttpHandler = async (request: AzureHttpRequest) => {
        return { success: true };
    };

    // Set moniker for feature logging (mimics what createEndpoint does)
    (handler as any)[MonikerSymbol] = moniker;

    switch (decorator) {
        case "security":
            withSecurity(handler);
            break;
        case "usageLogging":
            withUsageLogging(handler);
            break;
        case "logging":
            withLogging(handler);
            break;
        case "billing":
            withBilling(handler);
            break;
        case "none":
            // No decorator
            break;
    }

    return handler;
}

// =============================================================================
// Mock HTTP Request Creation
// =============================================================================

export interface MockHttpRequestOptions {
    method?: string;
    body?: any;
    params?: Record<string, string>;
    headers?: Record<string, string>;
    appId?: string;
    appPublisher?: string;
    appName?: string;
    gitEmail?: string;
    version?: string;
}

/**
 * Creates a mock HttpRequest for testing handleRequest.
 */
export function createMockHttpRequest(options: MockHttpRequestOptions = {}): HttpRequest {
    const {
        method = "POST",
        body = {},
        params = {},
        headers = {},
        appId,
        appPublisher,
        appName,
        gitEmail,
        version = "3.1.0",
    } = options;

    const allHeaders: Record<string, string> = {
        "content-type": "application/json",
        "ninja-version": version,
        ...headers,
    };

    // Add Ninja-specific headers if provided
    if (appId) {
        allHeaders["ninja-app-id"] = appId;
    }
    if (appPublisher) {
        allHeaders["ninja-app-publisher"] = appPublisher;
    }
    if (appName) {
        allHeaders["ninja-app-name"] = appName;
    }
    if (gitEmail) {
        allHeaders["ninja-git-email"] = gitEmail;
    }

    const headersInstance = new Headers();
    for (const [key, value] of Object.entries(allHeaders)) {
        headersInstance.set(key, value);
    }

    return {
        method,
        url: "https://test.azurewebsites.net/api/test",
        headers: headersInstance,
        query: new URLSearchParams(),
        params,
        body,
        bodyUsed: false,
        arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
        blob: async () => new Blob([JSON.stringify(body)]),
        formData: async () => new FormData(),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as HttpRequest;
}

// =============================================================================
// Writeback Helpers
// =============================================================================

/**
 * Prepares the request to track writeback promise.
 * Call this BEFORE handleRequest to opt-in to writeback tracking.
 * In production, this is never called, so the request is never modified.
 */
export function prepareWritebacksPromise(request: HttpRequest): void {
    (request as any)[WritebackPromiseSymbol] = true;
}

/**
 * Awaits the writeback promise attached to the request by handleRequest.
 * Call this after handleRequest returns to ensure writebacks complete before assertions.
 * Must call prepareWritebacksPromise(request) before handleRequest for this to work.
 */
export async function awaitWritebacks(request: HttpRequest): Promise<void> {
    const promise = (request as any)[WritebackPromiseSymbol];
    if (promise && promise !== true) {
        await promise;
    }
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Asserts that an app exists in storage with specific properties.
 */
export function expectAppWithProperties(
    appId: string,
    expectedProps: Partial<AppInfo>
): void {
    const apps = getApps();
    const app = apps.find(a => a.id.toLowerCase() === appId.toLowerCase());
    expect(app).toBeDefined();
    for (const [key, value] of Object.entries(expectedProps)) {
        expect((app as any)[key]).toEqual(value);
    }
}

/**
 * Asserts that an organization exists with specific properties.
 */
export function expectOrgWithProperties(
    orgId: string,
    expectedProps: Partial<OrganizationInfo>
): void {
    const org = getOrganization(orgId);
    expect(org).toBeDefined();
    for (const [key, value] of Object.entries(expectedProps)) {
        expect((org as any)[key]).toEqual(value);
    }
}

/**
 * Asserts that a user is in the organization's users list.
 */
export function expectUserInOrgUsers(orgId: string, email: string): void {
    const org = getOrganization(orgId);
    expect(org).toBeDefined();
    expect(org!.users.map(u => u.toLowerCase())).toContain(email.toLowerCase());
}

/**
 * Asserts that a user is in the organization's deniedUsers list.
 */
export function expectUserInOrgDenied(orgId: string, email: string): void {
    const org = getOrganization(orgId);
    expect(org).toBeDefined();
    expect(org!.deniedUsers.map(u => u.toLowerCase())).toContain(email.toLowerCase());
}

/**
 * Asserts that an organization has a first-seen timestamp for a user.
 */
export function expectUserFirstSeen(orgId: string, email: string): void {
    const org = getOrganization(orgId);
    expect(org).toBeDefined();
    expect(org!.userFirstSeenTimestamp).toBeDefined();
    const normalizedEmail = email.toLowerCase();
    const timestamps = org!.userFirstSeenTimestamp!;
    const found = Object.keys(timestamps).some(k => k.toLowerCase() === normalizedEmail);
    expect(found).toBe(true);
}

// =============================================================================
// Capturing Handler for Testing Internal State
// =============================================================================

export interface BillingInfo {
    app?: AppInfo;
    user?: UserProfileInfo;
    organization?: OrganizationInfo;
    permission?: {
        allowed: boolean;
        reason?: string;
    };
}

/**
 * Creates a handler that captures request.billing for inspection.
 * Use this to verify internal binding state.
 *
 * @param decorator - The decorator type to apply
 * @param moniker - The endpoint moniker/feature name (default: "test-endpoint")
 */
export function createCapturingHandler(
    decorator: DecoratorType = "none",
    moniker: string = TEST_DEFAULT_MONIKER
): {
    handler: AzureHttpHandler;
    getCapturedBilling: () => BillingInfo | undefined;
} {
    let capturedBilling: BillingInfo | undefined;

    const handler: AzureHttpHandler = async (request: AzureHttpRequest) => {
        capturedBilling = (request as any).billing;
        return { success: true };
    };

    // Set moniker for feature logging (mimics what createEndpoint does)
    (handler as any)[MonikerSymbol] = moniker;

    switch (decorator) {
        case "security":
            withSecurity(handler);
            break;
        case "usageLogging":
            withUsageLogging(handler);
            break;
        case "logging":
            withLogging(handler);
            break;
        case "billing":
            withBilling(handler);
            break;
        case "none":
            break;
    }

    return {
        handler,
        getCapturedBilling: () => capturedBilling,
    };
}
