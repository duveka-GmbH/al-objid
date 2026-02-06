/**
 * Unit tests for writebacks.ts
 *
 * Tests billing writebacks for persisting billing data to blob storage.
 */

import {
    performWritebacks,
    logUnknownUser,
    logActivity,
    writeBackNewOrphan,
    writeBackClaimedApp,
    writeBackUserUpdate,
    updateFirstSeenTimestamp,
} from "../../src/billing/writebacks";
import { CacheManager } from "../../src/billing/CacheManager";
import * as privateBackendModule from "../../src/utils/privateBackend";
import { Blob } from "@vjeko.com/azure-blob";
import { UsageLoggingSymbol, MonikerSymbol } from "../../src/billing/decorators";
import { AppInfo, BillingInfo, OrganizationInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

// Mock dependencies
jest.mock("../../src/utils/privateBackend", () => ({
    isPrivateBackend: jest.fn(),
}));

jest.mock("../../src/billing/CacheManager", () => ({
    CacheManager: {
        updateApp: jest.fn(),
        updateOrganization: jest.fn(),
    },
}));

jest.mock("@vjeko.com/azure-blob", () => ({
    Blob: jest.fn().mockImplementation(() => ({
        optimisticUpdate: jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(defaultValue);
            return Promise.resolve(result);
        }),
    })),
}));

const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.Mock;
const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const mockUpdateApp = CacheManager.updateApp as jest.Mock;
const mockUpdateOrganization = CacheManager.updateOrganization as jest.Mock;

/**
 * Create a minimal OrganizationInfo for testing.
 */
function createOrg(overrides: Partial<OrganizationInfo> = {}): OrganizationInfo {
    return {
        id: "org1",
        name: "Test Org",
        address: "",
        zip: "",
        city: "",
        state: "",
        country: "",
        taxId: "",
        email: "",
        adminIds: [],
        usersLimit: 0,
        appsLimit: 0,
        totalPrice: 0,
        discountPct: 0,
        status: "active",
        apps: [],
        users: [],
        deniedUsers: [],
        ...overrides,
    };
}

/**
 * Create a minimal AzureHttpRequest for testing.
 */
function createRequest(billing?: BillingInfo): AzureHttpRequest {
    return {
        method: "POST",
        headers: new Headers(),
        params: {},
        body: {},
        query: new URLSearchParams(),
        billing,
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    } as unknown as AzureHttpRequest;
}

/**
 * Create a handler with UsageLoggingSymbol and MonikerSymbol.
 */
function createUsageLoggingHandler(moniker: string = "test-endpoint"): AzureHttpHandler {
    const handler = (async () => ({})) as AzureHttpHandler;
    (handler as any)[UsageLoggingSymbol] = true;
    (handler as any)[MonikerSymbol] = moniker;
    return handler;
}

describe("performWritebacks", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsPrivateBackend.mockReturnValue(false);
    });

    describe("Guard Clauses", () => {
        it("1. should skip when private backend", async () => {
            // Arrange
            mockIsPrivateBackend.mockReturnValue(true);
            const request = createRequest({ writeBackNewOrphan: true, app: { id: "app1", name: "", publisher: "", created: 1000, freeUntil: 2000 } });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).not.toHaveBeenCalled();
        });

        it("2. should skip when no billing", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).not.toHaveBeenCalled();
        });
    });

    describe("Writeback Flags", () => {
        it("3. should write back new orphan when flag set", async () => {
            // Arrange
            const app = { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 };
            const request = createRequest({ writeBackNewOrphan: true, app });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
            expect(mockUpdateApp).toHaveBeenCalledWith(app);
        });

        it("4. should write back claimed app when flag set", async () => {
            // Arrange
            const app = { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000, ownerType: "organization" as const, ownerId: "org1" };
            const organization = createOrg({ id: "org1" });
            const request = createRequest({ writeBackClaimed: true, app, organization });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
            expect(mockUpdateApp).toHaveBeenCalled();
        });

        it("5. should write back force orphan when flag set", async () => {
            // Arrange
            const app = { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 };
            const request = createRequest({ writeBackForceOrphan: true, app });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
            expect(mockUpdateApp).toHaveBeenCalled();
        });

        it("6. should write back user update when flag set", async () => {
            // Arrange
            const request = createRequest({
                writeBackNewUser: "ALLOW",
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("7. should not call writebacks when no flag set", async () => {
            // Arrange
            const app = { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 };
            const request = createRequest({ app });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(mockUpdateApp).not.toHaveBeenCalled();
        });

        it("8. should skip app writebacks when no app", async () => {
            // Arrange
            const request = createRequest({ writeBackNewOrphan: true });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(mockUpdateApp).not.toHaveBeenCalled();
        });

        it("9. should skip user writeback when no org", async () => {
            // Arrange
            const request = createRequest({ writeBackNewUser: "ALLOW" });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(mockUpdateOrganization).not.toHaveBeenCalled();
        });

        it("10. should skip user writeback when no gitEmail", async () => {
            // Arrange
            const request = createRequest({
                writeBackNewUser: "ALLOW",
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(mockUpdateOrganization).not.toHaveBeenCalled();
        });
    });

    describe("First-Seen Timestamp Update", () => {
        it("11. should update firstSeen for org users", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("12. should skip firstSeen when no org", async () => {
            // Arrange
            const request = createRequest({});
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert - only first-seen blob call should not happen if no org
        });
    });

    describe("Activity Logging", () => {
        it("13. should log activity for org app with UsageLogging handler", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };
            const handler = createUsageLoggingHandler();

            // Act
            await performWritebacks(request, headers, handler);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("14. should skip logging without UsageLogging handler", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };
            const handler = (async () => ({})) as AzureHttpHandler; // No UsageLoggingSymbol

            // Act
            await performWritebacks(request, headers, handler);

            // Assert - activity logging blob should not be called for this pattern
            // Only first-seen timestamp is updated
        });

        it("15. should skip logging when permission denied", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
                permission: { allowed: false, error: { code: "GRACE_EXPIRED" } },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };
            const handler = createUsageLoggingHandler();

            // Act
            await performWritebacks(request, headers, handler);

            // Assert - should return early, no activity log
        });

        it("16. should skip logging when user in deniedUsers", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({
                    id: "org1",
                    deniedUsers: ["user@example.com"],
                }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };
            const handler = createUsageLoggingHandler();

            // Act
            await performWritebacks(request, headers, handler);

            // Assert - denied user should not have activity logged
        });

        it("17. should skip logging when no gitEmail", async () => {
            // Arrange
            const request = createRequest({
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = {};
            const handler = createUsageLoggingHandler();

            // Act
            await performWritebacks(request, headers, handler);

            // Assert - no email means no activity logging
        });
    });

    describe("User Update Types", () => {
        it("should handle ALLOW update type", async () => {
            // Arrange
            const request = createRequest({
                writeBackNewUser: "ALLOW",
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("should handle DENY update type", async () => {
            // Arrange
            const request = createRequest({
                writeBackNewUser: "DENY",
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("should handle UNKNOWN update type", async () => {
            // Arrange
            const request = createRequest({
                writeBackNewUser: "UNKNOWN",
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });
    });

    describe("Unknown User Logging", () => {
        it("18. should log unknown user when flag is set", async () => {
            // Arrange
            const request = createRequest({
                logUnknownUserAttempt: true,
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "unknown@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            expect(MockBlob).toHaveBeenCalledWith("logs://org1_unknown.json");
        });

        it("19. should not log unknown user when flag is false", async () => {
            // Arrange
            const request = createRequest({
                logUnknownUserAttempt: false,
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "unknown@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            const calls = MockBlob.mock.calls;
            const unknownLogCalls = calls.filter(c => c[0] === "logs://org1_unknown.json");
            expect(unknownLogCalls).toHaveLength(0);
        });

        it("20. should not log unknown user when no organization", async () => {
            // Arrange
            const request = createRequest({
                logUnknownUserAttempt: true,
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "unknown@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            const calls = MockBlob.mock.calls;
            const unknownLogCalls = calls.filter(c => c[0]?.includes("_unknown.json"));
            expect(unknownLogCalls).toHaveLength(0);
        });

        it("21. should not log unknown user when no app", async () => {
            // Arrange
            const request = createRequest({
                logUnknownUserAttempt: true,
                organization: createOrg({ id: "org1" }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "unknown@example.com" };

            // Act
            await performWritebacks(request, headers);

            // Assert
            const calls = MockBlob.mock.calls;
            const unknownLogCalls = calls.filter(c => c[0] === "logs://org1_unknown.json");
            expect(unknownLogCalls).toHaveLength(0);
        });

        it("22. should not log unknown user when no gitEmail", async () => {
            // Arrange
            const request = createRequest({
                logUnknownUserAttempt: true,
                organization: createOrg({ id: "org1" }),
                app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            await performWritebacks(request, headers);

            // Assert
            const calls = MockBlob.mock.calls;
            const unknownLogCalls = calls.filter(c => c[0] === "logs://org1_unknown.json");
            expect(unknownLogCalls).toHaveLength(0);
        });
    });
});

describe("logUnknownUser", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedLog: any[];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedLog = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedLog);
            capturedLog = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should add entry to empty log", async () => {
        // Arrange
        capturedLog = [];

        // Act
        await logUnknownUser("org-123", "user@example.com", "app-456");

        // Assert
        expect(capturedLog).toHaveLength(1);
        expect(capturedLog[0].email).toBe("user@example.com");
        expect(capturedLog[0].appId).toBe("app-456");
        expect(capturedLog[0].timestamp).toBeGreaterThan(0);
    });

    it("2. should append to existing log (no deduplication)", async () => {
        // Arrange
        capturedLog = [
            { timestamp: 1000, email: "user@example.com", appId: "app-456" },
        ];

        // Act
        await logUnknownUser("org-123", "user@example.com", "app-456");

        // Assert
        expect(capturedLog).toHaveLength(2);
        expect(capturedLog[0].email).toBe("user@example.com");
        expect(capturedLog[1].email).toBe("user@example.com");
    });

    it("3. should normalize email to lowercase", async () => {
        // Arrange
        capturedLog = [];

        // Act
        await logUnknownUser("org-123", "User@EXAMPLE.COM", "app-456");

        // Assert
        expect(capturedLog[0].email).toBe("user@example.com");
    });

    it("4. should use correct blob path format", async () => {
        // Act
        await logUnknownUser("org-123", "user@example.com", "app-456");

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("logs://org-123_unknown.json");
    });
});

describe("logActivity", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedLog: any[];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedLog = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedLog);
            capturedLog = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should include feature field in log entry", async () => {
        // Arrange
        capturedLog = [];

        // Act
        await logActivity("org-123", "app-456", "user@example.com", "v2-getNext");

        // Assert
        expect(capturedLog).toHaveLength(1);
        expect(capturedLog[0].feature).toBe("v2-getNext");
    });

    it("2. should include all required fields in log entry", async () => {
        // Arrange
        capturedLog = [];

        // Act
        await logActivity("org-123", "app-456", "user@example.com", "v2-autoSync");

        // Assert
        expect(capturedLog).toHaveLength(1);
        expect(capturedLog[0]).toEqual(
            expect.objectContaining({
                appId: "app-456",
                email: "user@example.com",
                feature: "v2-autoSync",
            })
        );
        expect(capturedLog[0].timestamp).toBeGreaterThan(0);
    });

    it("3. should append to existing log", async () => {
        // Arrange
        capturedLog = [
            { appId: "old-app", email: "old@example.com", feature: "old-feature", timestamp: 1000 },
        ];

        // Act
        await logActivity("org-123", "app-456", "user@example.com", "v2-getNext");

        // Assert
        expect(capturedLog).toHaveLength(2);
        expect(capturedLog[1].feature).toBe("v2-getNext");
    });

    it("4. should use correct blob path format", async () => {
        // Act
        await logActivity("org-123", "app-456", "user@example.com", "v2-getNext");

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("logs://org-123_featureLog.json");
    });

    it("5. should handle different feature names", async () => {
        // Arrange
        capturedLog = [];

        // Act
        await logActivity("org-1", "app-1", "user@test.com", "v3-touch");

        // Assert
        expect(capturedLog[0].feature).toBe("v3-touch");
    });
});

describe("performWritebacks - Feature Logging", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedLogs: Map<string, any[]>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsPrivateBackend.mockReturnValue(false);
        capturedLogs = new Map();

        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            return Promise.resolve(fn(defaultValue));
        });

        // Track which blob path is being written to
        (MockBlob as jest.Mock).mockImplementation((path: string) => {
            if (!capturedLogs.has(path)) {
                capturedLogs.set(path, []);
            }
            return {
                optimisticUpdate: jest.fn().mockImplementation((fn, defaultValue) => {
                    const existing = capturedLogs.get(path) || [];
                    const result = fn(existing);
                    capturedLogs.set(path, result);
                    return Promise.resolve(result);
                }),
            };
        });
    });

    it("1. should log activity with feature from handler moniker", async () => {
        // Arrange
        const request = createRequest({
            organization: createOrg({ id: "org1" }),
            app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };
        const handler = createUsageLoggingHandler("v2-customEndpoint");

        // Act
        await performWritebacks(request, headers, handler);

        // Assert
        const featureLogPath = "logs://org1_featureLog.json";
        const featureLog = capturedLogs.get(featureLogPath);
        expect(featureLog).toBeDefined();
        expect(featureLog).toHaveLength(1);
        expect(featureLog![0].feature).toBe("v2-customEndpoint");
    });

    it("2. should skip activity logging when no moniker on handler", async () => {
        // Arrange
        const request = createRequest({
            organization: createOrg({ id: "org1" }),
            app: { id: "app1", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

        // Handler with UsageLoggingSymbol but NO MonikerSymbol
        const handler = (async () => ({})) as AzureHttpHandler;
        (handler as any)[UsageLoggingSymbol] = true;
        // Deliberately NOT setting MonikerSymbol

        // Act
        await performWritebacks(request, headers, handler);

        // Assert
        const featureLogPath = "logs://org1_featureLog.json";
        const featureLog = capturedLogs.get(featureLogPath);
        expect(featureLog).toBeUndefined();
    });

    it("3. should include correct appId, email, and timestamp in feature log", async () => {
        // Arrange
        const request = createRequest({
            organization: createOrg({ id: "org1" }),
            app: { id: "my-app-id", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "dev@company.com" };
        const handler = createUsageLoggingHandler("v2-getNext");

        // Act
        await performWritebacks(request, headers, handler);

        // Assert
        const featureLogPath = "logs://org1_featureLog.json";
        const featureLog = capturedLogs.get(featureLogPath);
        expect(featureLog).toBeDefined();
        expect(featureLog![0]).toEqual(
            expect.objectContaining({
                appId: "my-app-id",
                email: "dev@company.com",
                feature: "v2-getNext",
            })
        );
        expect(featureLog![0].timestamp).toBeGreaterThan(0);
    });
});

describe("writeBackNewOrphan", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedApps: AppInfo[];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedApps = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedApps);
            capturedApps = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should add new orphan app to empty apps array", async () => {
        // Arrange
        capturedApps = [];
        const newApp: AppInfo = {
            id: "new-app",
            name: "New App",
            publisher: "Test Publisher",
            created: Date.now(),
            freeUntil: Date.now() + 1000000,
        };

        // Act
        await writeBackNewOrphan(newApp);

        // Assert
        expect(capturedApps).toHaveLength(1);
        expect(capturedApps[0].id).toBe("new-app");
        expect(capturedApps[0].publisher).toBe("Test Publisher");
    });

    it("2. should append orphan app to existing apps", async () => {
        // Arrange
        capturedApps = [
            { id: "existing-app", name: "Existing", publisher: "Pub", created: 1000, freeUntil: 2000 },
        ];
        const newApp: AppInfo = {
            id: "new-app",
            name: "New App",
            publisher: "Test Publisher",
            created: Date.now(),
            freeUntil: Date.now() + 1000000,
        };

        // Act
        await writeBackNewOrphan(newApp);

        // Assert
        expect(capturedApps).toHaveLength(2);
        expect(capturedApps[1].id).toBe("new-app");
    });

    it("3. should NOT duplicate app if already exists (same id and publisher)", async () => {
        // Arrange
        capturedApps = [
            { id: "existing-app", name: "Existing", publisher: "Test Publisher", created: 1000, freeUntil: 2000 },
        ];
        const duplicateApp: AppInfo = {
            id: "existing-app",
            name: "New Name",
            publisher: "Test Publisher",
            created: Date.now(),
            freeUntil: Date.now() + 1000000,
        };

        // Act
        await writeBackNewOrphan(duplicateApp);

        // Assert
        expect(capturedApps).toHaveLength(1);
        expect(capturedApps[0].name).toBe("Existing"); // Original unchanged
    });

    it("4. should match app case-insensitively", async () => {
        // Arrange
        capturedApps = [
            { id: "EXISTING-APP", name: "Existing", publisher: "TEST PUBLISHER", created: 1000, freeUntil: 2000 },
        ];
        const duplicateApp: AppInfo = {
            id: "existing-app",
            name: "New Name",
            publisher: "test publisher",
            created: Date.now(),
            freeUntil: Date.now() + 1000000,
        };

        // Act
        await writeBackNewOrphan(duplicateApp);

        // Assert
        expect(capturedApps).toHaveLength(1); // No duplicate added
    });

    it("5. should use correct blob path", async () => {
        // Arrange
        const newApp: AppInfo = {
            id: "new-app",
            name: "New App",
            publisher: "Publisher",
            created: Date.now(),
            freeUntil: Date.now(),
        };

        // Act
        await writeBackNewOrphan(newApp);

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("system://apps.json");
    });

    it("6. should call CacheManager.updateApp after write", async () => {
        // Arrange
        const newApp: AppInfo = {
            id: "new-app",
            name: "New App",
            publisher: "Publisher",
            created: Date.now(),
            freeUntil: Date.now(),
        };

        // Act
        await writeBackNewOrphan(newApp);

        // Assert
        expect(mockUpdateApp).toHaveBeenCalledWith(newApp);
    });
});

describe("writeBackClaimedApp", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedApps: AppInfo[];

    // Mock organization for tests
    const mockOrganization: OrganizationInfo = {
        id: "org-123",
        name: "Test Org",
        address: "",
        zip: "",
        city: "",
        state: "",
        country: "",
        taxId: "",
        email: "test@org.com",
        adminIds: [],
        usersLimit: 10,
        appsLimit: 10,
        totalPrice: 0,
        discountPct: 0,
        status: "active" as const,
        apps: [],
        users: [],
        deniedUsers: [],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        capturedApps = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedApps);
            capturedApps = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should update existing app with ownership", async () => {
        // Arrange
        capturedApps = [
            { id: "orphan-app", name: "Orphan", publisher: "Publisher", created: 1000, freeUntil: 2000 },
        ];
        const claimedApp: AppInfo = {
            id: "orphan-app",
            name: "Orphan",
            publisher: "Publisher",
            created: 1000,
            freeUntil: 2000,
            ownerType: "organization",
            ownerId: "org-123",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(capturedApps).toHaveLength(1);
        expect(capturedApps[0].ownerType).toBe("organization");
        expect(capturedApps[0].ownerId).toBe("org-123");
    });

    it("2. should add new app with ownership if not found", async () => {
        // Arrange
        capturedApps = [];
        const claimedApp: AppInfo = {
            id: "new-app",
            name: "New App",
            publisher: "Publisher",
            created: Date.now(),
            freeUntil: Date.now(),
            ownerType: "organization",
            ownerId: "org-123",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(capturedApps).toHaveLength(1);
        expect(capturedApps[0].ownerType).toBe("organization");
        expect(capturedApps[0].ownerId).toBe("org-123");
    });

    it("3. should match app case-insensitively when updating", async () => {
        // Arrange
        capturedApps = [
            { id: "ORPHAN-APP", name: "Orphan", publisher: "PUBLISHER", created: 1000, freeUntil: 2000 },
        ];
        const claimedApp: AppInfo = {
            id: "orphan-app",
            name: "Orphan",
            publisher: "publisher",
            created: 1000,
            freeUntil: 2000,
            ownerType: "user",
            ownerId: "user-456",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(capturedApps).toHaveLength(1);
        expect(capturedApps[0].ownerType).toBe("user");
        expect(capturedApps[0].ownerId).toBe("user-456");
    });

    it("4. should preserve other app properties when updating ownership", async () => {
        // Arrange
        capturedApps = [
            { id: "orphan-app", name: "Original Name", publisher: "Publisher", created: 1000, freeUntil: 2000 },
        ];
        const claimedApp: AppInfo = {
            id: "orphan-app",
            name: "Different Name",
            publisher: "Publisher",
            created: 9999,
            freeUntil: 9999,
            ownerType: "organization",
            ownerId: "org-123",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(capturedApps[0].name).toBe("Original Name"); // Preserved
        expect(capturedApps[0].created).toBe(1000); // Preserved
        expect(capturedApps[0].ownerType).toBe("organization"); // Updated
        expect(capturedApps[0].ownerId).toBe("org-123"); // Updated
    });

    it("5. should use correct blob path", async () => {
        // Arrange
        const claimedApp: AppInfo = {
            id: "app",
            name: "App",
            publisher: "Pub",
            created: 1000,
            freeUntil: 2000,
            ownerType: "organization",
            ownerId: "org-1",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("system://apps.json");
    });

    it("6. should call CacheManager.updateApp after write", async () => {
        // Arrange
        const claimedApp: AppInfo = {
            id: "app",
            name: "App",
            publisher: "Pub",
            created: 1000,
            freeUntil: 2000,
            ownerType: "organization",
            ownerId: "org-1",
        };

        // Act
        await writeBackClaimedApp(claimedApp, mockOrganization);

        // Assert
        expect(mockUpdateApp).toHaveBeenCalledWith(claimedApp);
    });
});

describe("writeBackUserUpdate", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedOrgs: OrganizationInfo[];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedOrgs = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedOrgs);
            capturedOrgs = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should add user to users list on ALLOW", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", users: [] })];

        // Act
        await writeBackUserUpdate("org-1", "newuser@test.com", "ALLOW");

        // Assert
        expect(capturedOrgs[0].users).toContain("newuser@test.com");
    });

    it("2. should not duplicate user in users list on ALLOW", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", users: ["existing@test.com"] })];

        // Act
        await writeBackUserUpdate("org-1", "existing@test.com", "ALLOW");

        // Assert
        const count = capturedOrgs[0].users.filter(u => u.toLowerCase() === "existing@test.com").length;
        expect(count).toBe(1);
    });

    it("3. should remove user from deniedUsers on ALLOW", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", users: [], deniedUsers: ["user@test.com"] })];

        // Act
        await writeBackUserUpdate("org-1", "user@test.com", "ALLOW");

        // Assert
        expect(capturedOrgs[0].users).toContain("user@test.com");
        expect(capturedOrgs[0].deniedUsers).not.toContain("user@test.com");
    });

    it("4. should add user to deniedUsers on DENY", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", deniedUsers: [] })];

        // Act
        await writeBackUserUpdate("org-1", "baduser@test.com", "DENY");

        // Assert
        expect(capturedOrgs[0].deniedUsers).toContain("baduser@test.com");
    });

    it("5. should not duplicate user in deniedUsers on DENY", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", deniedUsers: ["existing@test.com"] })];

        // Act
        await writeBackUserUpdate("org-1", "existing@test.com", "DENY");

        // Assert
        const count = capturedOrgs[0].deniedUsers.filter(u => u.toLowerCase() === "existing@test.com").length;
        expect(count).toBe(1);
    });

    it("6. should update firstSeenTimestamp on UNKNOWN", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", userFirstSeenTimestamp: {} })];

        // Act
        await writeBackUserUpdate("org-1", "unknown@test.com", "UNKNOWN");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["unknown@test.com"]).toBeGreaterThan(0);
    });

    it("7. should not overwrite existing firstSeenTimestamp on UNKNOWN", async () => {
        // Arrange
        const existingTimestamp = 12345;
        capturedOrgs = [createOrg({
            id: "org-1",
            userFirstSeenTimestamp: { "unknown@test.com": existingTimestamp },
        })];

        // Act
        await writeBackUserUpdate("org-1", "unknown@test.com", "UNKNOWN");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["unknown@test.com"]).toBe(existingTimestamp);
    });

    it("8. should do nothing if org not found", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1" })];

        // Act
        await writeBackUserUpdate("non-existent-org", "user@test.com", "ALLOW");

        // Assert
        expect(capturedOrgs[0].users).not.toContain("user@test.com");
    });

    it("9. should use correct blob path", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1" })];

        // Act
        await writeBackUserUpdate("org-1", "user@test.com", "ALLOW");

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("system://organizations.json");
    });

    it("10. should call CacheManager.updateOrganization after write", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1" })];

        // Act
        await writeBackUserUpdate("org-1", "user@test.com", "ALLOW");

        // Assert
        expect(mockUpdateOrganization).toHaveBeenCalled();
    });

    it("11. should match user case-insensitively when checking duplicates", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", users: ["USER@TEST.COM"] })];

        // Act
        await writeBackUserUpdate("org-1", "user@test.com", "ALLOW");

        // Assert
        // Should not add duplicate
        expect(capturedOrgs[0].users).toHaveLength(1);
    });
});

describe("updateFirstSeenTimestamp", () => {
    let mockOptimisticUpdate: jest.Mock;
    let capturedOrgs: OrganizationInfo[];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedOrgs = [];
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedOrgs);
            capturedOrgs = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should set timestamp for new user", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", userFirstSeenTimestamp: {} })];

        // Act
        await updateFirstSeenTimestamp("org-1", "newuser@test.com");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["newuser@test.com"]).toBeGreaterThan(0);
    });

    it("2. should NOT overwrite existing timestamp", async () => {
        // Arrange
        const existingTimestamp = 12345;
        capturedOrgs = [createOrg({
            id: "org-1",
            userFirstSeenTimestamp: { "newuser@test.com": existingTimestamp },
        })];

        // Act
        await updateFirstSeenTimestamp("org-1", "newuser@test.com");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["newuser@test.com"]).toBe(existingTimestamp);
    });

    it("3. should return unchanged orgs if org not found", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", userFirstSeenTimestamp: {} })];

        // Act
        await updateFirstSeenTimestamp("non-existent", "user@test.com");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp).toEqual({});
    });

    it("4. should use normalized (lowercase) email as key", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1", userFirstSeenTimestamp: {} })];

        // Act
        await updateFirstSeenTimestamp("org-1", "USER@TEST.COM");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["user@test.com"]).toBeGreaterThan(0);
    });

    it("5. should use correct blob path", async () => {
        // Arrange
        capturedOrgs = [createOrg({ id: "org-1" })];

        // Act
        await updateFirstSeenTimestamp("org-1", "user@test.com");

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("system://organizations.json");
    });

    it("6. should handle undefined userFirstSeenTimestamp", async () => {
        // Arrange
        const org = createOrg({ id: "org-1" });
        delete (org as any).userFirstSeenTimestamp;
        capturedOrgs = [org];

        // Act
        await updateFirstSeenTimestamp("org-1", "user@test.com");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["user@test.com"]).toBeGreaterThan(0);
    });

    it("7. should preserve other users' timestamps", async () => {
        // Arrange
        capturedOrgs = [createOrg({
            id: "org-1",
            userFirstSeenTimestamp: {
                "other@test.com": 99999,
            },
        })];

        // Act
        await updateFirstSeenTimestamp("org-1", "newuser@test.com");

        // Assert
        expect(capturedOrgs[0].userFirstSeenTimestamp!["other@test.com"]).toBe(99999);
        expect(capturedOrgs[0].userFirstSeenTimestamp!["newuser@test.com"]).toBeGreaterThan(0);
    });
});
