import { checkVersion, __testing__ } from "../../src/http/checkVersion";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

const { compareVersions, MINIMUM_VERSION } = __testing__;

/**
 * Helper functions to create versions relative to MINIMUM_VERSION.
 * This makes tests resilient to MINIMUM_VERSION changes.
 */
function incrementPatch(version: string): string {
    const parts = version.split(".").map(Number);
    parts[2]++;
    return parts.join(".");
}

function incrementMinor(version: string): string {
    const parts = version.split(".").map(Number);
    parts[1]++;
    parts[2] = 0;
    return parts.join(".");
}

function incrementMajor(version: string): string {
    const parts = version.split(".").map(Number);
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
    return parts.join(".");
}

function decrementPatch(version: string): string {
    const parts = version.split(".").map(Number);
    if (parts[2] > 0) {
        parts[2]--;
    } else if (parts[1] > 0) {
        parts[1]--;
        parts[2] = 99;
    } else if (parts[0] > 0) {
        parts[0]--;
        parts[1] = 99;
        parts[2] = 99;
    }
    return parts.join(".");
}

function decrementMajor(version: string): string {
    const parts = version.split(".").map(Number);
    if (parts[0] > 0) {
        parts[0]--;
    }
    return parts.join(".");
}

describe("checkVersion", () => {
    const createHeaders = (ninjaVersion?: string): ParsedNinjaHeaders => ({
        ninjaVersion,
    });

    describe("compareVersions utility", () => {
        it("should return 0 for equal versions", () => {
            expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
            expect(compareVersions("3.0.0", "3.0.0")).toBe(0);
            expect(compareVersions("10.20.30", "10.20.30")).toBe(0);
        });

        it("should return negative when first version is lower", () => {
            expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
            expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
            expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
            expect(compareVersions("2.9.9", "3.0.0")).toBeLessThan(0);
        });

        it("should return positive when first version is higher", () => {
            expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
            expect(compareVersions("1.1.0", "1.0.0")).toBeGreaterThan(0);
            expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
            expect(compareVersions("3.0.0", "2.9.9")).toBeGreaterThan(0);
        });

        it("should handle versions with different number of parts", () => {
            expect(compareVersions("1.0", "1.0.0")).toBe(0);
            expect(compareVersions("1.0.0", "1.0")).toBe(0);
            expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
            expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
        });

        it("should handle double-digit version numbers", () => {
            expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
            expect(compareVersions("10.0.0", "9.0.0")).toBeGreaterThan(0);
            expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
        });
    });

    describe("missing version header", () => {
        it("should throw ErrorResponse with 426 when ninjaVersion is undefined", () => {
            const headers = createHeaders(undefined);

            expect(() => checkVersion(headers)).toThrow(ErrorResponse);

            try {
                checkVersion(headers);
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_426_UpgradeRequired);
            }
        });

        it("should throw ErrorResponse with 426 with empty headers object", () => {
            const headers: ParsedNinjaHeaders = {};

            expect(() => checkVersion(headers)).toThrow(ErrorResponse);

            try {
                checkVersion(headers);
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_426_UpgradeRequired);
            }
        });
    });

    describe("version meets minimum requirement", () => {
        it("should pass when version equals minimum", () => {
            const headers = createHeaders(MINIMUM_VERSION);

            expect(() => checkVersion(headers)).not.toThrow();
        });

        it("should pass when version is higher than minimum", () => {
            const headers = createHeaders("99.0.0");

            expect(() => checkVersion(headers)).not.toThrow();
        });

        it("should pass for versions at or above minimum", () => {
            expect(() => checkVersion(createHeaders(MINIMUM_VERSION))).not.toThrow();
            expect(() => checkVersion(createHeaders(incrementPatch(MINIMUM_VERSION)))).not.toThrow();
            expect(() => checkVersion(createHeaders(incrementMinor(MINIMUM_VERSION)))).not.toThrow();
            expect(() => checkVersion(createHeaders(incrementMajor(MINIMUM_VERSION)))).not.toThrow();
        });
    });

    describe("version below minimum requirement", () => {
        it("should throw ErrorResponse with 426 status", () => {
            const belowMinimum = decrementPatch(MINIMUM_VERSION);
            const headers = createHeaders(belowMinimum);

            expect(() => checkVersion(headers)).toThrow(ErrorResponse);

            try {
                checkVersion(headers);
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_426_UpgradeRequired);
            }
        });

        it("should include version info in error message", () => {
            const belowMinimum = decrementPatch(MINIMUM_VERSION);
            const headers = createHeaders(belowMinimum);

            try {
                checkVersion(headers);
                fail("Expected checkVersion to throw");
            } catch (error) {
                expect((error as ErrorResponse).message).toContain(belowMinimum);
                expect((error as ErrorResponse).message).toContain(MINIMUM_VERSION);
            }
        });

        it("should reject versions just below minimum", () => {
            const headers = createHeaders(decrementPatch(MINIMUM_VERSION));

            expect(() => checkVersion(headers)).toThrow(ErrorResponse);
        });

        it("should reject old major versions", () => {
            const oldMajor = decrementMajor(MINIMUM_VERSION);
            expect(() => checkVersion(createHeaders(oldMajor))).toThrow(ErrorResponse);
            expect(() => checkVersion(createHeaders("1.0.0"))).toThrow(ErrorResponse);
        });
    });

    describe("error message format", () => {
        it("should have user-friendly error message", () => {
            const belowMinimum = decrementPatch(MINIMUM_VERSION);
            const headers = createHeaders(belowMinimum);

            try {
                checkVersion(headers);
                fail("Expected checkVersion to throw");
            } catch (error) {
                const message = (error as ErrorResponse).message;
                expect(message).toContain("Extension version");
                expect(message).toContain("required");
                expect(message).toContain("Please update");
            }
        });
    });
});
