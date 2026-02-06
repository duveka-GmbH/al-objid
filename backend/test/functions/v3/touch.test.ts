import { createEndpoint } from "../../../src/http/createEndpoint";
import { HttpStatusCode } from "../../../src/http/HttpStatusCode";
import { CacheManager, evaluateClaimCandidates } from "../../../src/billing";

jest.mock("../../../src/http/createEndpoint");
jest.mock("../../../src/billing");

const mockCacheManager = CacheManager as jest.Mocked<typeof CacheManager>;
const mockEvaluateClaimCandidates = evaluateClaimCandidates as jest.MockedFunction<typeof evaluateClaimCandidates>;

const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;

let endpointConfig: any;
mockCreateEndpoint.mockImplementation((config: any) => {
    endpointConfig = config;
});

// Require after mocking to capture the config
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../../src/functions/v3/touch");

describe("touch", () => {
    const createMockRequest = (body: any, user: any = { email: "user@example.com" }) => ({
        params: {},
        headers: {
            get: jest.fn().mockReturnValue(null),
        },
        body,
        user,
        status: HttpStatusCode.Success_200_OK,
        setStatus: jest.fn(function(this: any, status: number) {
            this.status = status;
        }),
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("endpoint configuration", () => {
        it("should create endpoint with correct moniker", () => {
            expect(endpointConfig.moniker).toBe("v3-touch");
        });

        it("should create endpoint with correct route", () => {
            expect(endpointConfig.route).toBe("v3/touch");
        });

        it("should create endpoint with anonymous auth level", () => {
            expect(endpointConfig.authLevel).toBe("anonymous");
        });

        it("should register POST handler", () => {
            expect(endpointConfig.POST).toBeDefined();
        });

        it("should not register GET, PUT, PATCH, or DELETE handlers", () => {
            expect(endpointConfig.GET).toBeUndefined();
            expect(endpointConfig.PUT).toBeUndefined();
            expect(endpointConfig.PATCH).toBeUndefined();
            expect(endpointConfig.DELETE).toBeUndefined();
        });
    });

    describe("POST handler - object format (new)", () => {
        beforeEach(() => {
            // Mock billing functions to prevent errors from unmocked functions
            mockCacheManager.getOrganizations.mockResolvedValue([]);
            mockCacheManager.getApps.mockResolvedValue(new Map());
            mockEvaluateClaimCandidates.mockReturnValue({ candidates: [], publisherMatchFound: false });
        });

        it("should return 204 No Content for valid object format request", async () => {
            const request = createMockRequest({
                apps: [{ id: "app-1", publisher: "Pub" }],
                feature: "explorer",
            });

            await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
        });

        it("should return 204 for multiple apps", async () => {
            const request = createMockRequest({
                apps: [
                    { id: "app-1", publisher: "Pub A" },
                    { id: "app-2", publisher: "Pub B" },
                ],
                feature: "explorer",
            });

            await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
        });
    });

    describe("POST handler - legacy format (string array)", () => {
        it("should return 204 for legacy string array format", async () => {
            const request = createMockRequest({
                apps: ["app-1", "app-2", "app-3"],
                feature: "explorer",
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 for single string legacy format", async () => {
            const request = createMockRequest({
                apps: ["app-1"],
                feature: "explorer",
            });

            await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
        });
    });

    describe("POST handler - graceful validation", () => {
        it("should return 204 when apps array is empty", async () => {
            const request = createMockRequest({
                apps: [],
                feature: "explorer",
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when apps is missing", async () => {
            const request = createMockRequest({
                feature: "explorer",
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when apps is not an array", async () => {
            const request = createMockRequest({
                apps: "not-an-array",
                feature: "explorer",
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when feature is missing", async () => {
            const request = createMockRequest({
                apps: [{ id: "app-1", publisher: "Pub" }],
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when feature is not a string", async () => {
            const request = createMockRequest({
                apps: [{ id: "app-1", publisher: "Pub" }],
                feature: 123,
            });

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when email is missing", async () => {
            const request = createMockRequest(
                {
                    apps: [{ id: "app-1", publisher: "Pub" }],
                    feature: "explorer",
                },
                { email: "" }
            );

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });

        it("should return 204 when user is missing", async () => {
            const request = createMockRequest(
                {
                    apps: [{ id: "app-1", publisher: "Pub" }],
                    feature: "explorer",
                },
                null
            );

            const result = await endpointConfig.POST(request);

            expect(request.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(result).toBeUndefined();
        });
    });
});
