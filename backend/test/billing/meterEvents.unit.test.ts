/**
 * Unit tests for meterEvents.ts
 *
 * Tests Stripe meter event sending functionality.
 */

import {
    sendMeterEvent,
    sendAppMeterEvent,
    sendUserMeterEvent,
} from "../../src/billing/meterEvents";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("sendMeterEvent", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, STRIPE_SECRET_KEY: "sk_test_123" };
        mockFetch.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("1. should skip when STRIPE_SECRET_KEY not configured", async () => {
        // Arrange
        delete process.env.STRIPE_SECRET_KEY;
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();

        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        expect(mockFetch).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            "STRIPE_SECRET_KEY not configured, skipping meter event"
        );
        consoleSpy.mockRestore();
    });

    it("2. should POST to correct Stripe endpoint", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        expect(mockFetch).toHaveBeenCalledWith(
            "https://api.stripe.com/v1/billing/meter_events",
            expect.any(Object)
        );
    });

    it("3. should include Bearer token in Authorization header", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers.Authorization).toBe("Bearer sk_test_123");
    });

    it("4. should use form-urlencoded content type", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });

    it("5. should include event_name in body", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("event_name=pay_as_you_go_app");
    });

    it("6. should include stripe_customer_id in payload", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_user", "cus_456", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("payload%5Bstripe_customer_id%5D=cus_456");
    });

    it("7. should include identifier for idempotency", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "org1_2026-01_app_key");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("identifier=org1_2026-01_app_key");
    });

    it("8. should include timestamp in body", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toMatch(/timestamp=\d+/);
    });

    it("9. should include value=1 in payload", async () => {
        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("payload%5Bvalue%5D=1");
    });

    it("10. should log error on non-ok response", async () => {
        // Arrange
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            text: () => Promise.resolve("Bad Request"),
        });
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();

        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        expect(consoleSpy).toHaveBeenCalledWith(
            "Stripe meter event failed: 400 - Bad Request"
        );
        consoleSpy.mockRestore();
    });

    it("11. should catch and log fetch errors", async () => {
        // Arrange
        mockFetch.mockRejectedValue(new Error("Network error"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();

        // Act
        await sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id");

        // Assert
        expect(consoleSpy).toHaveBeenCalledWith(
            "Error sending Stripe meter event:",
            expect.any(Error)
        );
        consoleSpy.mockRestore();
    });

    it("12. should not throw on errors (fire-and-forget)", async () => {
        // Arrange
        mockFetch.mockRejectedValue(new Error("Network error"));
        jest.spyOn(console, "error").mockImplementation();

        // Act & Assert - should not throw
        await expect(
            sendMeterEvent("pay_as_you_go_app", "cus_123", "test-id")
        ).resolves.toBeUndefined();
    });
});

describe("sendAppMeterEvent", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, STRIPE_SECRET_KEY: "sk_test_123" };
        mockFetch.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("1. should use pay_as_you_go_app event type", async () => {
        // Act
        await sendAppMeterEvent("cus_123", "org1", "2026-01", "app1|pub1");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("event_name=pay_as_you_go_app");
    });

    it("2. should format identifier correctly", async () => {
        // Act
        await sendAppMeterEvent("cus_123", "org-abc", "2026-01", "app1|publisher");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain(
            encodeURIComponent("org-abc_2026-01_app_app1|publisher")
        );
    });
});

describe("sendUserMeterEvent", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, STRIPE_SECRET_KEY: "sk_test_123" };
        mockFetch.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("1. should use pay_as_you_go_user event type", async () => {
        // Act
        await sendUserMeterEvent("cus_123", "org1", "2026-01", "user@test.com");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain("event_name=pay_as_you_go_user");
    });

    it("2. should format identifier correctly", async () => {
        // Act
        await sendUserMeterEvent("cus_123", "org-abc", "2026-01", "user@example.com");

        // Assert
        const [, options] = mockFetch.mock.calls[0];
        expect(options.body).toContain(
            encodeURIComponent("org-abc_2026-01_user_user@example.com")
        );
    });
});
