/**
 * Unit tests for billingLog.ts
 *
 * Tests helper functions for billing log month keys and app keys.
 */

import {
    getCurrentMonthKey,
    getAppKey,
    BillingLog,
    BillingLogEntry,
    AppMeterEntry,
    UserMeterEntry,
} from "../../src/billing/billingLog";

describe("getCurrentMonthKey", () => {
    it("1. should return YYYY-MM format", () => {
        // Act
        const result = getCurrentMonthKey();

        // Assert
        expect(result).toMatch(/^\d{4}-\d{2}$/);
    });

    it("2. should use UTC time", () => {
        // Arrange
        const now = new Date();
        const expectedYear = now.getUTCFullYear();
        const expectedMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
        const expected = `${expectedYear}-${expectedMonth}`;

        // Act
        const result = getCurrentMonthKey();

        // Assert
        expect(result).toBe(expected);
    });

    it("3. should pad single-digit months with zero", () => {
        // Act
        const result = getCurrentMonthKey();

        // Assert
        const month = result.split("-")[1];
        expect(month).toHaveLength(2);
    });
});

describe("getAppKey", () => {
    it("1. should combine appId and publisher with pipe separator", () => {
        // Act
        const result = getAppKey("app-123", "Publisher Co");

        // Assert
        expect(result).toBe("app-123|Publisher Co");
    });

    it("2. should handle empty strings", () => {
        // Act
        const result = getAppKey("", "");

        // Assert
        expect(result).toBe("|");
    });

    it("3. should preserve case", () => {
        // Act
        const result = getAppKey("APP-ID", "PUBLISHER");

        // Assert
        expect(result).toBe("APP-ID|PUBLISHER");
    });

    it("4. should handle special characters", () => {
        // Act
        const result = getAppKey("app|with|pipes", "pub with spaces");

        // Assert
        expect(result).toBe("app|with|pipes|pub with spaces");
    });
});

describe("BillingLog type structure", () => {
    it("1. should allow valid billing log structure", () => {
        // Arrange
        const log: BillingLog = {
            "2026-01": {
                apps: {
                    "app1|publisher1": {
                        id: "app1",
                        publisher: "publisher1",
                        firstSeen: 1234567890,
                        count: 5,
                    },
                },
                users: {
                    "user@example.com": {
                        email: "user@example.com",
                        firstSeen: 1234567890,
                        count: 3,
                    },
                },
            },
        };

        // Assert - TypeScript compilation succeeds
        expect(log["2026-01"].apps["app1|publisher1"].count).toBe(5);
        expect(log["2026-01"].users["user@example.com"].count).toBe(3);
    });

    it("2. should allow empty month entries", () => {
        // Arrange
        const entry: BillingLogEntry = {
            apps: {},
            users: {},
        };

        // Assert
        expect(Object.keys(entry.apps)).toHaveLength(0);
        expect(Object.keys(entry.users)).toHaveLength(0);
    });

    it("3. should allow multiple months", () => {
        // Arrange
        const log: BillingLog = {
            "2026-01": { apps: {}, users: {} },
            "2026-02": { apps: {}, users: {} },
            "2026-03": { apps: {}, users: {} },
        };

        // Assert
        expect(Object.keys(log)).toHaveLength(3);
    });
});

describe("AppMeterEntry type", () => {
    it("should require all fields", () => {
        // Arrange
        const entry: AppMeterEntry = {
            id: "test-app",
            publisher: "Test Publisher",
            firstSeen: Date.now(),
            count: 1,
        };

        // Assert
        expect(entry.id).toBeDefined();
        expect(entry.publisher).toBeDefined();
        expect(entry.firstSeen).toBeDefined();
        expect(entry.count).toBeDefined();
    });
});

describe("UserMeterEntry type", () => {
    it("should require all fields", () => {
        // Arrange
        const entry: UserMeterEntry = {
            email: "test@example.com",
            firstSeen: Date.now(),
            count: 1,
        };

        // Assert
        expect(entry.email).toBeDefined();
        expect(entry.firstSeen).toBeDefined();
        expect(entry.count).toBeDefined();
    });
});
