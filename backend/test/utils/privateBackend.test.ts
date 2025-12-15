import { isPrivateBackend } from "../../src/utils/privateBackend";

describe("isPrivateBackend", () => {
    const originalEnv = process.env.PRIVATE_BACKEND;

    afterEach(() => {
        // Restore original environment variable after each test
        if (originalEnv === undefined) {
            delete process.env.PRIVATE_BACKEND;
        } else {
            process.env.PRIVATE_BACKEND = originalEnv;
        }
    });

    describe("when PRIVATE_BACKEND is set to 'true'", () => {
        it("should return true for lowercase 'true'", () => {
            process.env.PRIVATE_BACKEND = "true";
            expect(isPrivateBackend()).toBe(true);
        });

        it("should return true for uppercase 'TRUE'", () => {
            process.env.PRIVATE_BACKEND = "TRUE";
            expect(isPrivateBackend()).toBe(true);
        });

        it("should return true for mixed case 'True'", () => {
            process.env.PRIVATE_BACKEND = "True";
            expect(isPrivateBackend()).toBe(true);
        });

        it("should return true for mixed case 'TrUe'", () => {
            process.env.PRIVATE_BACKEND = "TrUe";
            expect(isPrivateBackend()).toBe(true);
        });
    });

    describe("when PRIVATE_BACKEND is set to other values", () => {
        it("should return false for 'false'", () => {
            process.env.PRIVATE_BACKEND = "false";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should return false for '1'", () => {
            process.env.PRIVATE_BACKEND = "1";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should return false for 'yes'", () => {
            process.env.PRIVATE_BACKEND = "yes";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should return false for empty string", () => {
            process.env.PRIVATE_BACKEND = "";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should return false for 'true ' (with trailing space)", () => {
            process.env.PRIVATE_BACKEND = "true ";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should return false for ' true' (with leading space)", () => {
            process.env.PRIVATE_BACKEND = " true";
            expect(isPrivateBackend()).toBe(false);
        });
    });

    describe("when PRIVATE_BACKEND is not set", () => {
        it("should return false when environment variable is undefined", () => {
            delete process.env.PRIVATE_BACKEND;
            expect(isPrivateBackend()).toBe(false);
        });
    });

    describe("edge cases", () => {
        it("should handle null-like values gracefully", () => {
            process.env.PRIVATE_BACKEND = "null";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should handle numeric strings", () => {
            process.env.PRIVATE_BACKEND = "0";
            expect(isPrivateBackend()).toBe(false);
        });

        it("should handle special characters", () => {
            process.env.PRIVATE_BACKEND = "true!";
            expect(isPrivateBackend()).toBe(false);
        });
    });
});
