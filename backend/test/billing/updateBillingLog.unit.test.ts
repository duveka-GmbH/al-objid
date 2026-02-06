/**
 * Unit tests for updateBillingLog function
 *
 * Tests billing log updates for PAYG metering.
 */

import { updateBillingLog } from "../../src/billing/writebacks";
import { BillingLog } from "../../src/billing/billingLog";
import { Blob } from "@vjeko.com/azure-blob";
import * as meterEventsModule from "../../src/billing/meterEvents";

// Mock dependencies
jest.mock("@vjeko.com/azure-blob", () => ({
    Blob: jest.fn().mockImplementation(() => ({
        optimisticUpdate: jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(defaultValue);
            return Promise.resolve(result);
        }),
    })),
}));

jest.mock("../../src/billing/meterEvents", () => ({
    sendAppMeterEvent: jest.fn().mockResolvedValue(undefined),
    sendUserMeterEvent: jest.fn().mockResolvedValue(undefined),
}));

const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const mockSendAppMeterEvent = meterEventsModule.sendAppMeterEvent as jest.Mock;
const mockSendUserMeterEvent = meterEventsModule.sendUserMeterEvent as jest.Mock;

describe("updateBillingLog", () => {
    let capturedLog: BillingLog;
    let mockOptimisticUpdate: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        capturedLog = {};
        mockOptimisticUpdate = jest.fn().mockImplementation((fn, defaultValue) => {
            const result = fn(capturedLog);
            capturedLog = result;
            return Promise.resolve(result);
        });
        (MockBlob as jest.Mock).mockImplementation(() => ({
            optimisticUpdate: mockOptimisticUpdate,
        }));
    });

    it("1. should use correct blob path format", async () => {
        // Act
        await updateBillingLog("org-123", "app1", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(MockBlob).toHaveBeenCalledWith("logs://org-123_billingLog.json");
    });

    it("2. should create new month entry when empty", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app1", "Publisher", "user@test.com", "cus_123");

        // Assert
        const monthKey = Object.keys(capturedLog)[0];
        expect(monthKey).toMatch(/^\d{4}-\d{2}$/);
        expect(capturedLog[monthKey]).toBeDefined();
        expect(capturedLog[monthKey].apps).toBeDefined();
        expect(capturedLog[monthKey].users).toBeDefined();
    });

    it("3. should create new app entry with count 1", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app-id", "Test Publisher", "user@test.com", "cus_123");

        // Assert
        const monthKey = Object.keys(capturedLog)[0];
        const appKey = "app-id|Test Publisher";
        expect(capturedLog[monthKey].apps[appKey]).toEqual({
            id: "app-id",
            publisher: "Test Publisher",
            firstSeen: expect.any(Number),
            count: 1,
        });
    });

    it("4. should increment existing app count", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {
                    "app-id|Publisher": {
                        id: "app-id",
                        publisher: "Publisher",
                        firstSeen: 1000,
                        count: 5,
                    },
                },
                users: {},
            },
        };

        // Act
        await updateBillingLog("org-1", "app-id", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(capturedLog[monthKey].apps["app-id|Publisher"].count).toBe(6);
        expect(capturedLog[monthKey].apps["app-id|Publisher"].firstSeen).toBe(1000);
    });

    it("5. should create new user entry with count 1", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app1", "Publisher", "newuser@test.com", "cus_123");

        // Assert
        const monthKey = Object.keys(capturedLog)[0];
        expect(capturedLog[monthKey].users["newuser@test.com"]).toEqual({
            email: "newuser@test.com",
            firstSeen: expect.any(Number),
            count: 1,
        });
    });

    it("6. should increment existing user count", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {},
                users: {
                    "existing@test.com": {
                        email: "existing@test.com",
                        firstSeen: 2000,
                        count: 3,
                    },
                },
            },
        };

        // Act
        await updateBillingLog("org-1", "app1", "Publisher", "existing@test.com", "cus_123");

        // Assert
        expect(capturedLog[monthKey].users["existing@test.com"].count).toBe(4);
        expect(capturedLog[monthKey].users["existing@test.com"].firstSeen).toBe(2000);
    });

    it("7. should normalize email to lowercase for key", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app1", "Publisher", "USER@TEST.COM", "cus_123");

        // Assert
        const monthKey = Object.keys(capturedLog)[0];
        expect(capturedLog[monthKey].users["user@test.com"]).toBeDefined();
        expect(capturedLog[monthKey].users["USER@TEST.COM"]).toBeUndefined();
    });

    it("8. should send app meter event for new app", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app-id", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(mockSendAppMeterEvent).toHaveBeenCalledWith(
            "cus_123",
            "org-1",
            expect.stringMatching(/^\d{4}-\d{2}$/),
            "app-id|Publisher"
        );
    });

    it("9. should NOT send app meter event for existing app", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {
                    "app-id|Publisher": {
                        id: "app-id",
                        publisher: "Publisher",
                        firstSeen: 1000,
                        count: 5,
                    },
                },
                users: {},
            },
        };

        // Act
        await updateBillingLog("org-1", "app-id", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(mockSendAppMeterEvent).not.toHaveBeenCalled();
    });

    it("10. should send user meter event for new user", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "app-id", "Publisher", "newuser@test.com", "cus_123");

        // Assert
        expect(mockSendUserMeterEvent).toHaveBeenCalledWith(
            "cus_123",
            "org-1",
            expect.stringMatching(/^\d{4}-\d{2}$/),
            "newuser@test.com"
        );
    });

    it("11. should NOT send user meter event for existing user", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {},
                users: {
                    "existing@test.com": {
                        email: "existing@test.com",
                        firstSeen: 2000,
                        count: 3,
                    },
                },
            },
        };

        // Act
        await updateBillingLog("org-1", "app-id", "Publisher", "existing@test.com", "cus_123");

        // Assert
        expect(mockSendUserMeterEvent).not.toHaveBeenCalled();
    });

    it("12. should send both meter events for new app and new user", async () => {
        // Arrange
        capturedLog = {};

        // Act
        await updateBillingLog("org-1", "new-app", "New Pub", "newuser@test.com", "cus_123");

        // Assert
        expect(mockSendAppMeterEvent).toHaveBeenCalled();
        expect(mockSendUserMeterEvent).toHaveBeenCalled();
    });

    it("13. should send app event but not user event when only app is new", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {},
                users: {
                    "existing@test.com": {
                        email: "existing@test.com",
                        firstSeen: 2000,
                        count: 3,
                    },
                },
            },
        };

        // Act
        await updateBillingLog("org-1", "new-app", "Publisher", "existing@test.com", "cus_123");

        // Assert
        expect(mockSendAppMeterEvent).toHaveBeenCalled();
        expect(mockSendUserMeterEvent).not.toHaveBeenCalled();
    });

    it("14. should preserve other apps when adding new one", async () => {
        // Arrange
        const now = new Date();
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        capturedLog = {
            [monthKey]: {
                apps: {
                    "other-app|Other Pub": {
                        id: "other-app",
                        publisher: "Other Pub",
                        firstSeen: 1000,
                        count: 10,
                    },
                },
                users: {},
            },
        };

        // Act
        await updateBillingLog("org-1", "new-app", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(capturedLog[monthKey].apps["other-app|Other Pub"]).toBeDefined();
        expect(capturedLog[monthKey].apps["other-app|Other Pub"].count).toBe(10);
        expect(capturedLog[monthKey].apps["new-app|Publisher"]).toBeDefined();
    });

    it("15. should preserve other months when updating", async () => {
        // Arrange
        capturedLog = {
            "2025-12": {
                apps: { "old-app|Pub": { id: "old-app", publisher: "Pub", firstSeen: 100, count: 50 } },
                users: { "old@test.com": { email: "old@test.com", firstSeen: 100, count: 20 } },
            },
        };

        // Act
        await updateBillingLog("org-1", "app1", "Publisher", "user@test.com", "cus_123");

        // Assert
        expect(capturedLog["2025-12"]).toBeDefined();
        expect(capturedLog["2025-12"].apps["old-app|Pub"].count).toBe(50);
    });
});
