/**
 * Unit tests for decorators.ts
 *
 * Tests billing decorator functions that mark handlers for billing processing.
 */

import {
    SecuritySymbol,
    UsageLoggingSymbol,
    LoggingSymbol,
    BillingSymbol,
    withSecurity,
    withUsageLogging,
    withLogging,
    withBilling,
} from "../../src/billing/decorators";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";

/**
 * Create a mock handler function that returns a Promise.
 */
function createMockHandler(): AzureHttpHandler {
    return (async () => ({})) as AzureHttpHandler;
}

describe("withSecurity", () => {
    it("1. should set SecuritySymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withSecurity(handler);

        // Assert
        expect((handler as any)[SecuritySymbol]).toBe(true);
    });

    it("2. should set LoggingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withSecurity(handler);

        // Assert
        expect((handler as any)[LoggingSymbol]).toBe(true);
    });

    it("3. should set BillingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withSecurity(handler);

        // Assert
        expect((handler as any)[BillingSymbol]).toBe(true);
    });

    it("4. should not set UsageLoggingSymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withSecurity(handler);

        // Assert
        expect((handler as any)[UsageLoggingSymbol]).toBeUndefined();
    });
});

describe("withUsageLogging", () => {
    it("1. should set UsageLoggingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withUsageLogging(handler);

        // Assert
        expect((handler as any)[UsageLoggingSymbol]).toBe(true);
    });

    it("2. should set BillingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withUsageLogging(handler);

        // Assert
        expect((handler as any)[BillingSymbol]).toBe(true);
    });

    it("3. should not set SecuritySymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withUsageLogging(handler);

        // Assert
        expect((handler as any)[SecuritySymbol]).toBeUndefined();
    });

    it("4. should not set LoggingSymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withUsageLogging(handler);

        // Assert
        expect((handler as any)[LoggingSymbol]).toBeUndefined();
    });
});

describe("withLogging", () => {
    it("1. should set LoggingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withLogging(handler);

        // Assert
        expect((handler as any)[LoggingSymbol]).toBe(true);
    });

    it("2. should set BillingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withLogging(handler);

        // Assert
        expect((handler as any)[BillingSymbol]).toBe(true);
    });

    it("3. should not set SecuritySymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withLogging(handler);

        // Assert
        expect((handler as any)[SecuritySymbol]).toBeUndefined();
    });

    it("4. should not set UsageLoggingSymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withLogging(handler);

        // Assert
        expect((handler as any)[UsageLoggingSymbol]).toBeUndefined();
    });
});

describe("withBilling", () => {
    it("1. should set BillingSymbol to true", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withBilling(handler);

        // Assert
        expect((handler as any)[BillingSymbol]).toBe(true);
    });

    it("2. should not set SecuritySymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withBilling(handler);

        // Assert
        expect((handler as any)[SecuritySymbol]).toBeUndefined();
    });

    it("3. should not set LoggingSymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withBilling(handler);

        // Assert
        expect((handler as any)[LoggingSymbol]).toBeUndefined();
    });

    it("4. should not set UsageLoggingSymbol", () => {
        // Arrange
        const handler = createMockHandler();

        // Act
        withBilling(handler);

        // Assert
        expect((handler as any)[UsageLoggingSymbol]).toBeUndefined();
    });
});

describe("Symbol exports", () => {
    it("should export SecuritySymbol as a symbol", () => {
        expect(typeof SecuritySymbol).toBe("symbol");
    });

    it("should export UsageLoggingSymbol as a symbol", () => {
        expect(typeof UsageLoggingSymbol).toBe("symbol");
    });

    it("should export LoggingSymbol as a symbol", () => {
        expect(typeof LoggingSymbol).toBe("symbol");
    });

    it("should export BillingSymbol as a symbol", () => {
        expect(typeof BillingSymbol).toBe("symbol");
    });
});
