/**
 * Unit tests for stages/permission.ts
 *
 * Tests permission checking, binding, enforcement, and warning extraction.
 */

import {
    bindPermission,
    permissionStage,
    enforcePermission,
    getPermissionWarning,
} from "../../src/billing/stages/permission";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { BillingInfo, OrganizationInfo, GRACE_PERIOD_MS } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

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

describe("bindPermission", () => {
    describe("Guard Clauses", () => {
        it("1. should not modify request when no billing", () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing).toBeUndefined();
        });

        it("2. should set allowed=true for sponsored app", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    sponsored: true,
                },
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission).toEqual({ allowed: true });
        });
    });

    describe("Personal App (User Owner)", () => {
        it("3. should allow when gitEmail matches app.gitEmail", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                    gitEmail: "user@example.com",
                },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
        });

        it("4. should deny when gitEmail doesn't match any authorized email", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                    gitEmail: "other@example.com",
                },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
        });

        it("5. should require gitEmail for personal apps", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                },
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("GIT_EMAIL_REQUIRED");
            }
        });

        it("6. should allow case-insensitive email match", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                    gitEmail: "User@Example.COM",
                },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
        });

        it("7. should allow when email matches user.email", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                },
                user: {
                    id: "user1",
                    provider: "github" as any,
                    providerId: "123",
                    name: "Test User",
                    email: "user@example.com",
                    userDetails: "",
                },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
        });

        it("8. should allow when email matches user.gitEmail", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "user",
                    ownerId: "user1",
                },
                user: {
                    id: "user1",
                    provider: "github" as any,
                    providerId: "123",
                    name: "Test User",
                    email: "other@example.com",
                    userDetails: "",
                    gitEmail: "user@example.com",
                },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
        });
    });

    describe("Organization App", () => {
        it("9. should allow for unlimited plan without gitEmail", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({ plan: "unlimited" }),
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
        });

        it("10. should require gitEmail for non-unlimited plan", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({ plan: "small" }),
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("GIT_EMAIL_REQUIRED");
            }
        });

        it("11. should allow explicitly allowed user", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    users: ["user@example.com"],
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
            expect(request.billing?.writeBackNewUser).toBeUndefined();
        });

        it("12. should allow via domain and set writeBackNewUser=ALLOW", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    domains: ["example.com"],
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
            expect(request.billing?.writeBackNewUser).toBe("ALLOW");
        });

        it("13. should allow via pending domain and set writeBackNewUser=UNKNOWN", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    pendingDomains: ["example.com"],
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
            expect(request.billing?.writeBackNewUser).toBe("UNKNOWN");
        });

        it("14. should deny explicitly denied user", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    deniedUsers: ["user@example.com"],
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("USER_NOT_AUTHORIZED");
            }
        });

        it("15. should deny via denyUnknownDomains and set writeBackNewUser=DENY", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    denyUnknownDomains: true,
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@unknown.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            expect(request.billing?.writeBackNewUser).toBe("DENY");
        });
    });

    describe("Blocked Organization", () => {
        it("16. should deny when org blocked - flagged", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg(),
                blocked: { reason: "flagged", blockedAt: 1000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("ORG_FLAGGED");
            }
        });

        it("17. should deny when org blocked - subscription_cancelled", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg(),
                blocked: { reason: "subscription_cancelled", blockedAt: 1000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("SUBSCRIPTION_CANCELLED");
            }
        });

        it("18. should deny when org blocked - payment_failed", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg(),
                blocked: { reason: "payment_failed", blockedAt: 1000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("PAYMENT_FAILED");
            }
        });

        it("18b. should deny when org blocked - no_subscription", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg(),
                blocked: { reason: "no_subscription", blockedAt: 1000 },
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("NO_SUBSCRIPTION");
            }
        });
    });

    describe("Orphaned App", () => {
        it("19. should allow with warning for orphan in grace period", () => {
            // Arrange
            const now = Date.now();
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: now - 1000,
                    freeUntil: now + 1000000,
                },
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
            if (request.billing?.permission?.allowed) {
                const permission = request.billing.permission as { warning?: { code: string; timeRemaining: number } };
                expect(permission.warning?.code).toBe("APP_GRACE_PERIOD");
            }
        });

        it("20. should deny for orphan with expired grace period", () => {
            // Arrange
            const now = Date.now();
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: now - 1000000,
                    freeUntil: now - 1000,
                },
            });
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("GRACE_EXPIRED");
            }
        });
    });

    describe("No App Bound", () => {
        it("21. should allow when no app bound", () => {
            // Arrange
            const request = createRequest({});
            const headers: ParsedNinjaHeaders = {};

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission).toEqual({ allowed: true });
        });
    });

    describe("Unknown Org User Grace Period", () => {
        it("22. should allow with warning for new unknown user", () => {
            // Arrange
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    userFirstSeenTimestamp: {},
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(true);
            expect(request.billing?.writeBackNewUser).toBe("UNKNOWN");
        });

        it("23. should deny when unknown user grace period expired", () => {
            // Arrange
            const now = Date.now();
            const request = createRequest({
                app: {
                    id: "app1",
                    name: "App",
                    publisher: "Pub",
                    created: 1000,
                    freeUntil: 2000,
                    ownerType: "organization",
                    ownerId: "org1",
                },
                organization: createOrg({
                    userFirstSeenTimestamp: {
                        "user@example.com": now - GRACE_PERIOD_MS - 1000,
                    },
                }),
            });
            const headers: ParsedNinjaHeaders = { gitUserEmail: "user@example.com" };

            // Act
            bindPermission(request, headers);

            // Assert
            expect(request.billing?.permission?.allowed).toBe(false);
            if (request.billing?.permission?.allowed === false) {
                expect(request.billing.permission.error.code).toBe("ORG_GRACE_EXPIRED");
            }
        });
    });
});

describe("permissionStage", () => {
    it("1. should throw 400 when appId header missing", () => {
        // Arrange
        const request = createRequest({});
        const headers: ParsedNinjaHeaders = {};

        // Act & Assert
        expect(() => permissionStage(request, headers)).toThrow(ErrorResponse);
        try {
            permissionStage(request, headers);
        } catch (e) {
            expect((e as ErrorResponse).statusCode).toBe(400);
        }
    });

    it("2. should throw 400 when appId header is empty string", () => {
        // Arrange
        const request = createRequest({});
        const headers: ParsedNinjaHeaders = { appId: "" };

        // Act & Assert
        expect(() => permissionStage(request, headers)).toThrow(ErrorResponse);
    });

    it("3. should call bindPermission when appId present", () => {
        // Arrange
        const request = createRequest({});
        const headers: ParsedNinjaHeaders = { appId: "app1" };

        // Act
        permissionStage(request, headers);

        // Assert
        expect(request.billing?.permission).toEqual({ allowed: true });
    });

    it("4. should allow for sponsored app with appId", () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                sponsored: true,
            },
        });
        const headers: ParsedNinjaHeaders = { appId: "app1" };

        // Act
        permissionStage(request, headers);

        // Assert
        expect(request.billing?.permission?.allowed).toBe(true);
    });
});

describe("enforcePermission", () => {
    it("1. should not throw when no billing", () => {
        // Arrange
        const request = createRequest();

        // Act & Assert
        expect(() => enforcePermission(request)).not.toThrow();
    });

    it("2. should not throw when no permission", () => {
        // Arrange
        const request = createRequest({});

        // Act & Assert
        expect(() => enforcePermission(request)).not.toThrow();
    });

    it("3. should not throw when permission allowed", () => {
        // Arrange
        const request = createRequest({
            permission: { allowed: true },
        });

        // Act & Assert
        expect(() => enforcePermission(request)).not.toThrow();
    });

    it("4. should not throw when permission allowed with warning", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });

        // Act & Assert
        expect(() => enforcePermission(request)).not.toThrow();
    });

    it("5. should throw 403 when permission denied - GRACE_EXPIRED", () => {
        // Arrange
        const request = createRequest({
            permission: { allowed: false, error: { code: "GRACE_EXPIRED" as const } },
        });

        // Act & Assert
        expect(() => enforcePermission(request)).toThrow(ErrorResponse);
        try {
            enforcePermission(request);
        } catch (e) {
            expect((e as ErrorResponse).statusCode).toBe(403);
        }
    });

    it("6. should throw 403 when permission denied - USER_NOT_AUTHORIZED", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: false,
                error: { code: "USER_NOT_AUTHORIZED" as const, gitEmail: "user@example.com" },
            },
        });

        // Act & Assert
        expect(() => enforcePermission(request)).toThrow(ErrorResponse);
        try {
            enforcePermission(request);
        } catch (e) {
            expect((e as ErrorResponse).statusCode).toBe(403);
            expect((e as ErrorResponse).message).toContain("USER_NOT_AUTHORIZED");
        }
    });
});

describe("getPermissionWarning", () => {
    it("1. should return undefined when no billing", () => {
        // Arrange
        const request = createRequest();

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("2. should return undefined when no permission on billing", () => {
        // Arrange
        const request = createRequest({});

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("3. should return warning when permission allowed with warning", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toEqual({ code: "APP_GRACE_PERIOD", timeRemaining: 1000 });
    });

    it("4. should return orphan warning fallback for orphan app in grace period", () => {
        // Arrange
        const now = Date.now();
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: now - 1000,
                freeUntil: now + 1000000,
            },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result?.code).toBe("APP_GRACE_PERIOD");
        expect(result?.timeRemaining).toBeGreaterThan(0);
    });

    it("5. should return undefined when permission denied", () => {
        // Arrange
        const request = createRequest({
            permission: { allowed: false, error: { code: "GRACE_EXPIRED" as const } },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("6. should return undefined for sponsored app", () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                sponsored: true,
            },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("7. should return undefined for owned app (not orphan)", () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: Date.now() + 1000000,
                ownerId: "user1",
            },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });

    it("8. should return undefined for orphan app with expired grace", () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: Date.now() - 1000,
            },
        });

        // Act
        const result = getPermissionWarning(request);

        // Assert
        expect(result).toBeUndefined();
    });
});

describe("logUnknownUserAttempt flag", () => {
    it("1. should set flag for truly unknown user (every occurrence)", () => {
        // Arrange: Organization without user in any list, domain not in domains/pendingDomains
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
                denyUnknownDomains: false,
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "unknown@random.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBe(true);
    });

    it("2. should set flag for ALLOWED_PENDING user", () => {
        // Arrange: Organization with user's domain in pendingDomains
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                pendingDomains: ["pending.com"],
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "user@pending.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBe(true);
    });

    it("3. should NOT set flag for explicitly allowed user", () => {
        // Arrange: Organization with user in users array
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                users: ["allowed@example.com"],
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "allowed@example.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBeFalsy();
    });

    it("4. should NOT set flag for explicitly denied user", () => {
        // Arrange: Organization with user in deniedUsers array
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                deniedUsers: ["denied@example.com"],
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "denied@example.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBeFalsy();
    });

    it("5. should NOT set flag for domain-allowed user", () => {
        // Arrange: Organization with user's domain in domains array
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                domains: ["allowed-domain.com"],
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "user@allowed-domain.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBeFalsy();
    });

    it("6. should NOT set flag for user denied by denyUnknownDomains", () => {
        // Arrange: Organization with denyUnknownDomains = true, user not matching any list/domain
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                denyUnknownDomains: true,
                users: [],
                deniedUsers: [],
                domains: [],
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "user@unknown.com" };

        // Act
        bindPermission(request, headers);

        // Assert
        expect(request.billing?.logUnknownUserAttempt).toBeFalsy();
    });

    it("7. should set flag for unknown user with existing first-seen timestamp", () => {
        // Arrange: Unknown user who has already been seen (still in grace period)
        const now = Date.now();
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerType: "organization",
                ownerId: "org1",
            },
            organization: createOrg({
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {
                    "returning@unknown.com": now - 1000, // Seen 1 second ago, still in grace
                },
            }),
        });
        const headers: ParsedNinjaHeaders = { gitUserEmail: "returning@unknown.com" };

        // Act
        bindPermission(request, headers);

        // Assert: Flag should be set on EVERY occurrence, not just first-seen
        expect(request.billing?.logUnknownUserAttempt).toBe(true);
        // writeBackNewUser should NOT be set since user is already seen
        expect(request.billing?.writeBackNewUser).toBeUndefined();
    });
});
