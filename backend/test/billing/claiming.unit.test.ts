/**
 * Unit tests for stages/claiming.ts
 *
 * Tests claim evaluation and claiming stage for auto-claiming orphaned apps.
 */

import { evaluateClaimCandidates, claimingStage } from "../../src/billing/stages/claiming";
import { CacheManager } from "../../src/billing/CacheManager";
import { OrganizationInfo, BillingInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

// Mock CacheManager
jest.mock("../../src/billing/CacheManager", () => ({
    CacheManager: {
        getOrganizations: jest.fn(),
    },
}));

const mockGetOrganizations = CacheManager.getOrganizations as jest.Mock;

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

describe("evaluateClaimCandidates", () => {
    describe("No Organizations Match Publisher", () => {
        it("1. should return no match for empty organizations array", () => {
            // Arrange
            const publisher = "MyPublisher";
            const gitEmail = "user@example.com";
            const orgs: OrganizationInfo[] = [];

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, orgs);

            // Assert
            expect(result).toEqual({ publisherMatchFound: false, candidates: [] });
        });

        it("2. should return no match when no org has matching publisher", () => {
            // Arrange
            const publisher = "MyPublisher";
            const gitEmail = "user@example.com";
            const orgs = [createOrg({ publishers: ["Other"] })];

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, orgs);

            // Assert
            expect(result).toEqual({ publisherMatchFound: false, candidates: [] });
        });

        it("3. should return no match when publisher undefined", () => {
            // Arrange
            const publisher = undefined;
            const gitEmail = "user@example.com";
            const orgs = [createOrg({ publishers: ["SomePublisher"] })];

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, orgs);

            // Assert
            expect(result.publisherMatchFound).toBe(false);
        });
    });

    describe("Publisher Match + User Match", () => {
        it("4. should find user exact match", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@example.com";
            const org = createOrg({
                id: "org1",
                publishers: ["MyPub"],
                users: ["user@example.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].organization.id).toBe("org1");
            expect(result.candidates[0].matchType).toBe("user");
        });

        it("5. should find user case-insensitive match", () => {
            // Arrange
            const publisher = "mypub";
            const gitEmail = "User@Example.COM";
            const org = createOrg({
                publishers: ["MYPUB"],
                users: ["user@example.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("user");
        });

        it("6. should find user with whitespace match", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "  user@example.com  ";
            const org = createOrg({
                publishers: ["MyPub"],
                users: ["user@example.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("user");
        });
    });

    describe("Publisher Match + Domain Match", () => {
        it("7. should find domain match", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "anyone@company.com";
            const org = createOrg({
                publishers: ["MyPub"],
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("domain");
        });

        it("8. should find domain case-insensitive match", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@Company.COM";
            const org = createOrg({
                publishers: ["MyPub"],
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("domain");
        });
    });

    describe("User Takes Precedence Over Domain", () => {
        it("9. should return user match when both user and domain match", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org = createOrg({
                publishers: ["MyPub"],
                users: ["user@company.com"],
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("user");
        });
    });

    describe("Multiple Organizations", () => {
        it("10. should return two candidates when two orgs match (conflict)", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org1 = createOrg({
                id: "org1",
                publishers: ["MyPub"],
                domains: ["company.com"],
            });
            const org2 = createOrg({
                id: "org2",
                publishers: ["MyPub"],
                users: ["user@company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org1, org2]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(2);
        });

        it("11. should return one candidate when one org matches, one doesn't", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org1 = createOrg({
                id: "org1",
                publishers: ["MyPub"],
                domains: ["company.com"],
            });
            const org2 = createOrg({
                id: "org2",
                publishers: ["Other"],
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org1, org2]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
        });
    });

    describe("Publisher Match but No User/Domain Match", () => {
        it("12. should return empty candidates when publisher matches but no user/domain", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@other.com";
            const org = createOrg({
                publishers: ["MyPub"],
                users: [],
                domains: [],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(0);
        });

        it("13. should return empty candidates when no email provided", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = undefined;
            const org = createOrg({
                publishers: ["MyPub"],
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(0);
        });
    });

    describe("Nullable Arrays", () => {
        it("14. should return no match when publishers undefined on org", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org = createOrg({
                publishers: undefined,
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(false);
        });

        it("15. should return domain match when users undefined on org", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org = createOrg({
                publishers: ["MyPub"],
                users: undefined as any,
                domains: ["company.com"],
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].matchType).toBe("domain");
        });

        it("16. should return empty candidates when domains undefined on org", () => {
            // Arrange
            const publisher = "MyPub";
            const gitEmail = "user@company.com";
            const org = createOrg({
                publishers: ["MyPub"],
                users: [],
                domains: undefined,
            });

            // Act
            const result = evaluateClaimCandidates(publisher, gitEmail, [org]);

            // Assert
            expect(result.publisherMatchFound).toBe(true);
            expect(result.candidates).toHaveLength(0);
        });
    });
});

describe("claimingStage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("1. should return without calling CacheManager when no billing", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = {};

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(mockGetOrganizations).not.toHaveBeenCalled();
    });

    it("2. should return without calling CacheManager when app already has owner", async () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "00000000-0000-0000-0000-000000000001",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
                ownerId: "existing",
            },
        });
        const headers: ParsedNinjaHeaders = { appPublisher: "Pub" };

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(mockGetOrganizations).not.toHaveBeenCalled();
    });

    it("3. should return without calling CacheManager when no publisher header", async () => {
        // Arrange
        const request = createRequest({
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        });
        const headers: ParsedNinjaHeaders = {};

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(mockGetOrganizations).not.toHaveBeenCalled();
    });

    it("3b. should return without calling CacheManager when publisher header is blank", async () => {
        // Arrange
        const request = createRequest({
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        });
        const headers: ParsedNinjaHeaders = { appPublisher: "   " };

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(mockGetOrganizations).not.toHaveBeenCalled();
    });

    it("4. should not set claimIssue when no matching organizations", async () => {
        // Arrange
        const billing: BillingInfo = {
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        };
        const request = createRequest(billing);
        const headers: ParsedNinjaHeaders = { appPublisher: "Pub" };
        mockGetOrganizations.mockResolvedValue([]);

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(billing.claimIssue).toBeUndefined();
    });

    it("5. should claim app for single valid claim", async () => {
        // Arrange
        const billing: BillingInfo = {
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        };
        const request = createRequest(billing);
        const headers: ParsedNinjaHeaders = {
            appPublisher: "Pub",
            gitUserEmail: "user@company.com",
        };
        const org = createOrg({
            id: "org1",
            publishers: ["Pub"],
            users: ["user@company.com"],
        });
        mockGetOrganizations.mockResolvedValue([org]);

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(billing.app?.ownerType).toBe("organization");
        expect(billing.app?.ownerId).toBe("org1");
        expect(billing.writeBackClaimed).toBe(true);
        expect(billing.organization?.id).toBe("org1");
    });

    it("6. should set claimIssue for multiple conflicting claims", async () => {
        // Arrange
        const billing: BillingInfo = {
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        };
        const request = createRequest(billing);
        const headers: ParsedNinjaHeaders = {
            appPublisher: "Pub",
            gitUserEmail: "user@company.com",
        };
        const org1 = createOrg({
            id: "org1",
            publishers: ["Pub"],
            domains: ["company.com"],
        });
        const org2 = createOrg({
            id: "org2",
            publishers: ["Pub"],
            users: ["user@company.com"],
        });
        mockGetOrganizations.mockResolvedValue([org1, org2]);

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(billing.claimIssue).toBe(true);
    });

    it("7. should set claimIssue when publisher match but no user match", async () => {
        // Arrange
        const billing: BillingInfo = {
            app: { id: "00000000-0000-0000-0000-000000000001", name: "App", publisher: "Pub", created: 1000, freeUntil: 2000 },
        };
        const request = createRequest(billing);
        const headers: ParsedNinjaHeaders = {
            appPublisher: "Pub",
            gitUserEmail: "user@other.com",
        };
        const org = createOrg({
            id: "org1",
            publishers: ["Pub"],
            users: [],
        });
        mockGetOrganizations.mockResolvedValue([org]);

        // Act
        await claimingStage(request, headers);

        // Assert
        expect(billing.claimIssue).toBe(true);
    });
});
