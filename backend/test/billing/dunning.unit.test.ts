/**
 * Unit tests for stages/dunning.ts
 *
 * Tests dunning stage functions for checking dunning status.
 */

import { dunningStage, hasDunningWarning, getDunningStage } from "../../src/billing/stages/dunning";
import { BillingInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";

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

describe("dunningStage", () => {
    it("1. should not call setHeader when no billing", () => {
        // Arrange
        const request = createRequest();

        // Act
        dunningStage(request);

        // Assert
        expect(request.setHeader).not.toHaveBeenCalled();
    });

    it("2. should not call setHeader when billing but no dunning", () => {
        // Arrange
        const request = createRequest({});

        // Act
        dunningStage(request);

        // Assert
        expect(request.setHeader).not.toHaveBeenCalled();
    });

    it("3. should call setHeader with X-Ninja-Dunning-Warning when has dunning", () => {
        // Arrange
        const request = createRequest({
            dunning: {
                organizationId: "org1",
                dunningStage: 1,
                startedAt: 1000,
                lastStageChangedAt: 1000,
            },
        });

        // Act
        dunningStage(request);

        // Assert
        expect(request.setHeader).toHaveBeenCalledWith("X-Ninja-Dunning-Warning", "true");
    });
});

describe("hasDunningWarning", () => {
    it("1. should return false when no billing", () => {
        // Arrange
        const request = createRequest();

        // Act
        const result = hasDunningWarning(request);

        // Assert
        expect(result).toBe(false);
    });

    it("2. should return false when no dunning", () => {
        // Arrange
        const request = createRequest({});

        // Act
        const result = hasDunningWarning(request);

        // Assert
        expect(result).toBe(false);
    });

    it("3. should return true when has dunning", () => {
        // Arrange
        const request = createRequest({
            dunning: {
                organizationId: "org1",
                dunningStage: 1,
                startedAt: 1000,
                lastStageChangedAt: 1000,
            },
        });

        // Act
        const result = hasDunningWarning(request);

        // Assert
        expect(result).toBe(true);
    });

    it("4. should return false when dunning is null", () => {
        // Arrange
        const request = createRequest({
            dunning: null as any,
        });

        // Act
        const result = hasDunningWarning(request);

        // Assert
        expect(result).toBe(false);
    });
});

describe("getDunningStage", () => {
    it("1. should return undefined when no billing", () => {
        // Arrange
        const request = createRequest();

        // Act
        const result = getDunningStage(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("2. should return undefined when no dunning", () => {
        // Arrange
        const request = createRequest({});

        // Act
        const result = getDunningStage(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("3. should return 1 for dunning stage 1", () => {
        // Arrange
        const request = createRequest({
            dunning: {
                organizationId: "org1",
                dunningStage: 1,
                startedAt: 1000,
                lastStageChangedAt: 1000,
            },
        });

        // Act
        const result = getDunningStage(request);

        // Assert
        expect(result).toBe(1);
    });

    it("4. should return 2 for dunning stage 2", () => {
        // Arrange
        const request = createRequest({
            dunning: {
                organizationId: "org1",
                dunningStage: 2,
                startedAt: 1000,
                lastStageChangedAt: 1000,
            },
        });

        // Act
        const result = getDunningStage(request);

        // Assert
        expect(result).toBe(2);
    });

    it("5. should return 3 for dunning stage 3", () => {
        // Arrange
        const request = createRequest({
            dunning: {
                organizationId: "org1",
                dunningStage: 3,
                startedAt: 1000,
                lastStageChangedAt: 1000,
            },
        });

        // Act
        const result = getDunningStage(request);

        // Assert
        expect(result).toBe(3);
    });
});
