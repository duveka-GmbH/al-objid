/**
 * Unit tests for getUserPermission.ts
 *
 * Tests the getUserPermission function which determines user permission status
 * within an organization.
 */

import { getUserPermission } from "../../src/billing/getUserPermission";
import { OrganizationInfo } from "../../src/billing/types";

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

describe("getUserPermission", () => {
    describe("Empty/Invalid Email", () => {
        it("1. should return undefined for empty email string", () => {
            // Arrange
            const org = createOrg({ users: ["user@example.com"] });
            const email = "";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("2. should return undefined for whitespace-only email", () => {
            // Arrange
            const org = createOrg({ users: ["user@example.com"] });
            const email = "   ";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("Explicit Allow (users array)", () => {
        it("3. should return true for user in users list (exact match)", () => {
            // Arrange
            const org = createOrg({ users: ["user@example.com"] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(true);
        });

        it("4. should return true for user in users list (case insensitive)", () => {
            // Arrange
            const org = createOrg({ users: ["User@Example.COM"] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(true);
        });

        it("5. should return true for user in users list (email with spaces)", () => {
            // Arrange
            const org = createOrg({ users: ["user@example.com"] });
            const email = "  user@example.com  ";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(true);
        });

        it("6. should return true for user in list with whitespace stored", () => {
            // Arrange
            const org = createOrg({ users: ["  User@Example.COM  "] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe("Explicit Deny (deniedUsers array)", () => {
        it("7. should return false for user in denied list", () => {
            // Arrange
            const org = createOrg({ deniedUsers: ["user@example.com"] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(false);
        });

        it("8. should return false for user in denied list (case insensitive)", () => {
            // Arrange
            const org = createOrg({ deniedUsers: ["User@Example.COM"] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(false);
        });

        it("9. should return true when user in both lists (allow takes precedence)", () => {
            // Arrange
            const org = createOrg({
                users: ["user@example.com"],
                deniedUsers: ["user@example.com"],
            });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe("Implicit Allow via Domain (domains array)", () => {
        it("10. should return ALLOWED for domain match", () => {
            // Arrange
            const org = createOrg({ domains: ["example.com"] });
            const email = "anyone@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("ALLOWED");
        });

        it("11. should return ALLOWED for domain match (case insensitive)", () => {
            // Arrange
            const org = createOrg({ domains: ["Example.COM"] });
            const email = "anyone@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("ALLOWED");
        });

        it("12. should return undefined for domain match with subdomain (no match)", () => {
            // Arrange
            const org = createOrg({ domains: ["example.com"] });
            const email = "user@sub.example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("13. should return ALLOWED for subdomain in list", () => {
            // Arrange
            const org = createOrg({ domains: ["sub.example.com"] });
            const email = "user@sub.example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("ALLOWED");
        });
    });

    describe("Implicit Allow via Pending Domain (pendingDomains array)", () => {
        it("14. should return ALLOWED_PENDING for pending domain match", () => {
            // Arrange
            const org = createOrg({ pendingDomains: ["example.com"] });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("ALLOWED_PENDING");
        });

        it("15. should return ALLOWED when domain in both domains and pendingDomains", () => {
            // Arrange
            const org = createOrg({
                domains: ["example.com"],
                pendingDomains: ["example.com"],
            });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("ALLOWED");
        });
    });

    describe("Deny via denyUnknownDomains", () => {
        it("16. should return DENY for unknown domain with denyUnknownDomains true", () => {
            // Arrange
            const org = createOrg({
                domains: ["company.com"],
                denyUnknownDomains: true,
            });
            const email = "user@other.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBe("DENY");
        });

        it("17. should return undefined for unknown domain with denyUnknownDomains false", () => {
            // Arrange
            const org = createOrg({
                domains: ["company.com"],
                denyUnknownDomains: false,
            });
            const email = "user@other.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("Unknown User", () => {
        it("18. should return undefined when no matching rules", () => {
            // Arrange
            const org = createOrg({
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
            });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("19. should return undefined when all arrays undefined", () => {
            // Arrange
            const org = createOrg({
                users: undefined as any,
                deniedUsers: undefined as any,
                domains: undefined,
                pendingDomains: undefined,
            });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("Edge Cases with Nullable Arrays", () => {
        it("20. should return undefined when users is undefined", () => {
            // Arrange
            const org = createOrg({ users: undefined as any });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("21. should return undefined when deniedUsers is undefined", () => {
            // Arrange
            const org = createOrg({ deniedUsers: undefined as any });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("22. should return undefined when domains is undefined", () => {
            // Arrange
            const org = createOrg({ domains: undefined });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });

        it("23. should return undefined when pendingDomains is undefined", () => {
            // Arrange
            const org = createOrg({ pendingDomains: undefined });
            const email = "user@example.com";

            // Act
            const result = getUserPermission(org, email);

            // Assert
            expect(result).toBeUndefined();
        });
    });
});
