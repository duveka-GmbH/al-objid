/**
 * Private Backend Mode Integration Tests
 *
 * Tests that permission-protected endpoints (getNext, syncIds, authorizeApp)
 * work correctly when PRIVATE_BACKEND is enabled - all permission checks
 * should be bypassed.
 *
 * These tests verify the full request flow through handleRequest with
 * the private backend flag enabled.
 */

import { HttpRequest } from "@azure/functions";
import { Blob } from "@vjeko.com/azure-blob";
import { handleRequest } from "../../src/http/handleRequest";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import * as privateBackendModule from "../../src/utils/privateBackend";
import * as bindPermissionModule from "../../src/permission/bindPermission";
import * as bindAppModule from "../../src/http/bindApp";
import * as getBodyModule from "../../src/http/getBody";
import { createEndpoint } from "../../src/http/createEndpoint";
import { AppCache } from "../../src/cache";
import * as loggingModule from "../../src/utils/logging";

// Mock all dependencies
jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/utils/privateBackend");
jest.mock("../../src/permission/bindPermission");
jest.mock("../../src/http/bindApp");
jest.mock("../../src/http/getBody");
jest.mock("../../src/http/createEndpoint");
jest.mock("../../src/cache");
jest.mock("../../src/utils/logging");

const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.MockedFunction<typeof privateBackendModule.isPrivateBackend>;
const mockBindPermission = bindPermissionModule.bindPermission as jest.MockedFunction<typeof bindPermissionModule.bindPermission>;
const mockEnforcePermission = bindPermissionModule.enforcePermission as jest.MockedFunction<typeof bindPermissionModule.enforcePermission>;
const mockGetPermissionWarning = bindPermissionModule.getPermissionWarning as jest.MockedFunction<typeof bindPermissionModule.getPermissionWarning>;
const mockBindSingleApp = bindAppModule.bindSingleApp as jest.MockedFunction<typeof bindAppModule.bindSingleApp>;
const mockBindSingleAppOptional = bindAppModule.bindSingleAppOptional as jest.MockedFunction<typeof bindAppModule.bindSingleAppOptional>;
const mockBindMultiApp = bindAppModule.bindMultiApp as jest.MockedFunction<typeof bindAppModule.bindMultiApp>;
const mockBindMultiAppOptional = bindAppModule.bindMultiAppOptional as jest.MockedFunction<typeof bindAppModule.bindMultiAppOptional>;
const mockGetBody = getBodyModule.getBody as jest.MockedFunction<typeof getBodyModule.getBody>;
const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;
const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;
const mockLogAppEvent = loggingModule.logAppEvent as jest.MockedFunction<typeof loggingModule.logAppEvent>;

// Capture endpoint configurations
let getNextConfig: any;
let syncIdsConfig: any;
let authorizeAppConfig: any;

mockCreateEndpoint.mockImplementation((config: any) => {
    if (config.moniker === "v3-getNext") {
        getNextConfig = config;
    }
    if (config.moniker === "v3-syncIds") {
        syncIdsConfig = config;
    }
    if (config.moniker === "v3-authorizeApp") {
        authorizeAppConfig = config;
    }
    return {} as any;
});

// Import endpoints to capture their configurations
import "../../src/functions/v3/getNext";
import "../../src/functions/v3/syncIds";
import "../../src/functions/v3/authorizeApp";

describe("Private Backend Mode Integration Tests", () => {
    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockHttpRequest = (
        method: string,
        body: any,
        params: Record<string, string> = {},
        headers: Record<string, string> = {}
    ): HttpRequest => {
        const headersMap = new Map(Object.entries(headers));
        return {
            headers: {
                get: (name: string) => headersMap.get(name) || null,
            } as any,
            query: new URLSearchParams(),
            params,
            url: "http://test.com/api/test",
            method,
            user: null,
            body: JSON.stringify(body),
            bodyUsed: false,
            arrayBuffer: jest.fn(),
            blob: jest.fn(),
            formData: jest.fn(),
            json: jest.fn().mockResolvedValue(body),
            text: jest.fn().mockResolvedValue(JSON.stringify(body)),
        } as unknown as HttpRequest;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockBlobInstance = {
            read: jest.fn().mockResolvedValue({}),
            exists: jest.fn().mockResolvedValue(true),
            optimisticUpdate: jest.fn().mockImplementation((fn: Function) => fn({}, 0)),
        };

        MockBlob.mockImplementation(() => mockBlobInstance as any);
        mockLogAppEvent.mockResolvedValue(undefined);
        mockAppCache.get.mockReturnValue(null);
        mockGetPermissionWarning.mockReturnValue(undefined);
        mockBindPermission.mockResolvedValue(undefined);
        mockEnforcePermission.mockImplementation(() => undefined);
        mockBindSingleApp.mockResolvedValue(undefined);
        mockBindSingleAppOptional.mockImplementation(async (req: any) => {
            req.app = {};
            req.appId = req.params?.appId || "test-app";
            req.appBlob = mockBlobInstance;
        });
        mockBindMultiApp.mockResolvedValue(undefined);
        mockBindMultiAppOptional.mockImplementation(async (req: any) => {
            req.apps = [];
        });
    });

    // =========================================================================
    // getNext Endpoint Tests
    // =========================================================================
    describe("getNext endpoint", () => {
        beforeEach(() => {
            mockGetBody.mockResolvedValue({
                type: "codeunit",
                ranges: [{ from: 50000, to: 59999 }],
                commit: false,
            });
        });

        describe("Given: PRIVATE_BACKEND is enabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(true);
            });

            it("should succeed without Ninja-App-Id header", async () => {
                // In normal mode, missing Ninja-App-Id would cause 400 error
                mockBindPermission.mockRejectedValue(new Error("Ninja-App-Id header is required"));

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                    // No Ninja-App-Id header
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(mockBindPermission).not.toHaveBeenCalled();
                expect(mockEnforcePermission).not.toHaveBeenCalled();
            });

            it("should succeed even when permission would be denied (grace expired)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("GRACE_EXPIRED");
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(mockBindPermission).not.toHaveBeenCalled();
            });

            it("should succeed even when permission would be denied (user not authorized)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("USER_NOT_AUTHORIZED");
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (org blocked)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("ORG_FLAGGED");
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (subscription cancelled)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("SUBSCRIPTION_CANCELLED");
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (payment failed)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("PAYMENT_FAILED");
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should return correct response data", async () => {
                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                const body = JSON.parse(result.body as string);
                expect(body.id).toBe(50000);
                expect(body.available).toBe(true);
            });

            it("should not include permission warning in response", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 86400000,
                } as any);

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toBeUndefined();
            });

            it("should work with commit=true", async () => {
                mockGetBody.mockResolvedValue({
                    type: "codeunit",
                    ranges: [{ from: 50000, to: 59999 }],
                    commit: true,
                });

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: true,
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                const body = JSON.parse(result.body as string);
                expect(body.updated).toBe(true);
            });
        });

        describe("Given: PRIVATE_BACKEND is disabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(false);
            });

            it("should call permission check functions", async () => {
                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                await handleRequest(handler, request);

                expect(mockBindPermission).toHaveBeenCalled();
                expect(mockEnforcePermission).toHaveBeenCalled();
            });

            it("should include permission warning when present", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 86400000,
                } as any);

                const handler = getNextConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        type: "codeunit",
                        ranges: [{ from: 50000, to: 59999 }],
                        commit: false,
                    },
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toEqual({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 86400000,
                });
            });
        });
    });

    // =========================================================================
    // syncIds Endpoint Tests
    // =========================================================================
    describe("syncIds endpoint", () => {
        beforeEach(() => {
            mockGetBody.mockResolvedValue({
                ids: {
                    codeunit: [50000, 50001, 50002],
                },
            });
            mockBindSingleAppOptional.mockImplementation(async (req: any) => {
                req.app = {};
                req.appId = req.params?.appId || "test-app";
                req.appBlob = mockBlobInstance;
            });
        });

        describe("Given: PRIVATE_BACKEND is enabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(true);
            });

            it("should succeed POST without Ninja-App-Id header", async () => {
                mockBindPermission.mockRejectedValue(new Error("Ninja-App-Id header is required"));

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000, 50001, 50002],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(mockBindPermission).not.toHaveBeenCalled();
            });

            it("should succeed PATCH without Ninja-App-Id header", async () => {
                mockBindPermission.mockRejectedValue(new Error("Ninja-App-Id header is required"));

                const handler = syncIdsConfig.PATCH;
                const request = createMockHttpRequest(
                    "PATCH",
                    {
                        ids: {
                            codeunit: [50003, 50004],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(mockBindPermission).not.toHaveBeenCalled();
            });

            it("should succeed even when permission would be denied (grace expired)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("GRACE_EXPIRED");
                });

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000, 50001],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (user not authorized)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("USER_NOT_AUTHORIZED");
                });

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (subscription cancelled)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("SUBSCRIPTION_CANCELLED");
                });

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            table: [50100, 50101],
                        },
                    },
                    { appId: "test-app" }
                );
                mockGetBody.mockResolvedValue({
                    ids: {
                        table: [50100, 50101],
                    },
                });

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (payment failed)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("PAYMENT_FAILED");
                });

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (org flagged)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("ORG_FLAGGED");
                });

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should return correct response data for POST", async () => {
                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000, 50001, 50002],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                const body = JSON.parse(result.body as string);
                expect(body.codeunit).toBeDefined();
            });

            it("should not include permission warning in response", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 172800000,
                } as any);

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toBeUndefined();
            });
        });

        describe("Given: PRIVATE_BACKEND is disabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(false);
            });

            it("should call permission check functions for POST", async () => {
                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                await handleRequest(handler, request);

                expect(mockBindPermission).toHaveBeenCalled();
                expect(mockEnforcePermission).toHaveBeenCalled();
            });

            it("should call permission check functions for PATCH", async () => {
                const handler = syncIdsConfig.PATCH;
                const request = createMockHttpRequest(
                    "PATCH",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                await handleRequest(handler, request);

                expect(mockBindPermission).toHaveBeenCalled();
                expect(mockEnforcePermission).toHaveBeenCalled();
            });

            it("should include permission warning when present", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 172800000,
                } as any);

                const handler = syncIdsConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {
                        ids: {
                            codeunit: [50000],
                        },
                    },
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toEqual({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 172800000,
                });
            });
        });
    });

    // =========================================================================
    // authorizeApp Endpoint Tests
    // =========================================================================
    describe("authorizeApp endpoint", () => {
        beforeEach(() => {
            mockGetBody.mockResolvedValue({});
            mockBindSingleAppOptional.mockImplementation(async (req: any) => {
                req.app = {};
                req.appId = req.params?.appId || "test-app";
                req.appBlob = mockBlobInstance;
            });
            mockBindSingleApp.mockImplementation(async (req: any) => {
                req.app = { _authorization: { key: "test-key" } };
                req.appId = req.params?.appId || "test-app";
                req.appBlob = mockBlobInstance;
            });
        });

        describe("Given: PRIVATE_BACKEND is enabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(true);
            });

            it("should succeed GET without Ninja-App-Id header", async () => {
                mockBindPermission.mockRejectedValue(new Error("Ninja-App-Id header is required"));

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(mockBindPermission).not.toHaveBeenCalled();
            });

            it("should succeed POST without Ninja-App-Id header", async () => {
                mockBindPermission.mockRejectedValue(new Error("Ninja-App-Id header is required"));

                const handler = authorizeAppConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                // POST succeeds (creates authorization)
                expect(mockBindPermission).not.toHaveBeenCalled();
            });

            it("should succeed even when permission would be denied (grace expired)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("GRACE_EXPIRED");
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (user not authorized)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("USER_NOT_AUTHORIZED");
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (org flagged)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("ORG_FLAGGED");
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (subscription cancelled)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("SUBSCRIPTION_CANCELLED");
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should succeed even when permission would be denied (payment failed)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new Error("PAYMENT_FAILED");
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
            });

            it("should return correct response data for GET (unauthorized app)", async () => {
                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                const body = JSON.parse(result.body as string);
                expect(body.authorized).toBe(false);
            });

            it("should return correct response data for GET (authorized app)", async () => {
                mockBindSingleAppOptional.mockImplementation(async (req: any) => {
                    req.app = { _authorization: { key: "test-key" } };
                    req.appId = req.params?.appId || "test-app";
                    req.appBlob = mockBlobInstance;
                });

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                const body = JSON.parse(result.body as string);
                expect(body.authorized).toBe(true);
            });

            it("should not include permission warning in response", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 43200000,
                } as any);

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toBeUndefined();
            });
        });

        describe("Given: PRIVATE_BACKEND is disabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(false);
            });

            it("should NOT call permission check functions for GET (no withPermissionCheck)", async () => {
                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                await handleRequest(handler, request);

                // GET handler does not have withPermissionCheck applied (removed in commit 8fef757)
                expect(mockBindPermission).not.toHaveBeenCalled();
                expect(mockEnforcePermission).not.toHaveBeenCalled();
            });

            it("should call permission check functions for POST", async () => {
                const handler = authorizeAppConfig.POST;
                const request = createMockHttpRequest(
                    "POST",
                    {},
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                await handleRequest(handler, request);

                expect(mockBindPermission).toHaveBeenCalled();
                expect(mockEnforcePermission).toHaveBeenCalled();
            });

            it("should include permission warning when present", async () => {
                mockGetPermissionWarning.mockReturnValue({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 43200000,
                } as any);

                const handler = authorizeAppConfig.GET;
                const request = createMockHttpRequest(
                    "GET",
                    {},
                    { appId: "test-app" },
                    { "Ninja-App-Id": "test-app-guid" }
                );

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toEqual({
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: 43200000,
                });
            });
        });
    });
});
