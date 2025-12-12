import { Blob } from "@vjeko.com/azure-blob";
import { bindSingleApp, bindMultiApp } from "../../src/http/bindApp";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { AppCache } from "../../src/cache";
import { upgrade } from "../../src/upgrade";
import { AppInfo } from "../../src/types";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/cache");
jest.mock("../../src/upgrade");

const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;
const mockUpgrade = upgrade as jest.MockedFunction<typeof upgrade>;

describe("bindSingleApp", () => {
    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockRequest = (overrides: Partial<AzureHttpRequest> = {}): AzureHttpRequest => ({
        method: "GET",
        headers: { get: jest.fn() } as any,
        params: {},
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockBlobInstance = {
            read: jest.fn(),
            exists: jest.fn(),
            optimisticUpdate: jest.fn(),
        };

        MockBlob.mockImplementation(() => mockBlobInstance as any);
        mockUpgrade.mockImplementation(async (appId, app, blob) => app);
    });

    describe("successful binding", () => {
        it("should bind appId from params to request", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).appId).toBe("test-app-id");
        });

        it("should bind app content to request", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            mockUpgrade.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).app).toEqual(appData);
        });

        it("should bind Blob instance to appBlob", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).appBlob).toBe(mockBlobInstance);
        });

        it("should create Blob with correct path", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "my-app-123" };

            await bindSingleApp(request, params);

            expect(MockBlob).toHaveBeenCalledWith("apps://my-app-123.json");
        });

        it("should read blob to verify app exists", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect(mockBlobInstance.read).toHaveBeenCalled();
        });
    });

    describe("app not found", () => {
        it("should throw 404 ErrorResponse when blob.read() returns null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);
            const request = createMockRequest();
            const params = { appId: "non-existent-app" };

            await expect(bindSingleApp(request, params)).rejects.toThrow(ErrorResponse);
            await expect(bindSingleApp(request, params)).rejects.toMatchObject({
                message: "App not found: non-existent-app",
                statusCode: HttpStatusCode.ClientError_404_NotFound,
            });
        });

        it("should not bind appId when blob.read() returns null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);
            const request = createMockRequest();
            const params = { appId: "non-existent-app" };

            try {
                await bindSingleApp(request, params);
            } catch {
                // Expected to throw
            }

            expect((request as any).appId).toBeUndefined();
        });

        it("should not bind app when blob.read() returns null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);
            const request = createMockRequest();
            const params = { appId: "non-existent-app" };

            try {
                await bindSingleApp(request, params);
            } catch {
                // Expected to throw
            }

            expect((request as any).app).toBeUndefined();
        });

        it("should not bind appBlob when blob.read() returns null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);
            const request = createMockRequest();
            const params = { appId: "non-existent-app" };

            try {
                await bindSingleApp(request, params);
            } catch {
                // Expected to throw
            }

            expect((request as any).appBlob).toBeUndefined();
        });
    });

    describe("authorization", () => {
        it("should throw 401 when app is authorized and authKey does not match", async () => {
            const appData = {
                _authorization: { key: "correct-key" },
                codeunit: [1, 2, 3],
            };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest({
                headers: { get: jest.fn().mockReturnValue("wrong-key") } as any,
            });
            const params = { appId: "test-app-id" };

            await expect(bindSingleApp(request, params)).rejects.toThrow(ErrorResponse);
            await expect(bindSingleApp(request, params)).rejects.toMatchObject({
                message: "Invalid authorization key",
                statusCode: HttpStatusCode.ClientError_401_Unauthorized,
            });
        });

        it("should throw 401 when app is authorized and no authKey provided", async () => {
            const appData = {
                _authorization: { key: "correct-key" },
                codeunit: [1, 2, 3],
            };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest({
                headers: { get: jest.fn().mockReturnValue(null) } as any,
            });
            const params = { appId: "test-app-id" };

            await expect(bindSingleApp(request, params)).rejects.toThrow(ErrorResponse);
            await expect(bindSingleApp(request, params)).rejects.toMatchObject({
                statusCode: HttpStatusCode.ClientError_401_Unauthorized,
            });
        });

        it("should allow binding when authKey matches", async () => {
            const appData = {
                _authorization: { key: "correct-key" },
                codeunit: [1, 2, 3],
            };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest({
                headers: { get: jest.fn().mockReturnValue("correct-key") } as any,
            });
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).appId).toBe("test-app-id");
            expect((request as any).app).toEqual(appData);
        });

        it("should allow binding when app is not authorized", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).appId).toBe("test-app-id");
        });

        it("should allow binding when no authorization key exists", async () => {
            const appData = {
                _authorization: {} as any,
                codeunit: [1, 2, 3],
            };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest({
                headers: { get: jest.fn().mockReturnValue("any-key") } as any,
            });
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect((request as any).appId).toBe("test-app-id");
        });

        it("should skip auth check when skipAuth is true", async () => {
            const appData = {
                _authorization: { key: "correct-key" },
                codeunit: [1, 2, 3],
            };
            mockBlobInstance.read.mockResolvedValue(appData);
            const request = createMockRequest({
                headers: { get: jest.fn().mockReturnValue("wrong-key") } as any,
            });
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params, true);

            expect((request as any).appId).toBe("test-app-id");
            expect((request as any).app).toEqual(appData);
        });
    });

    describe("cache interactions", () => {
        it("should update cache after reading app from blob", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            mockUpgrade.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect(mockAppCache.set).toHaveBeenCalledWith("test-app-id", appData);
        });

        it("should not update cache when app is not found", async () => {
            mockBlobInstance.read.mockResolvedValue(null);
            const request = createMockRequest();
            const params = { appId: "non-existent-app" };

            try {
                await bindSingleApp(request, params);
            } catch {
                // Expected to throw
            }

            expect(mockAppCache.set).not.toHaveBeenCalled();
        });

        it("should run upgrade during binding", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            mockUpgrade.mockResolvedValue(appData);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect(mockUpgrade).toHaveBeenCalledWith("test-app-id", appData, mockBlobInstance);
        });

        it("should cache upgraded app, not original app", async () => {
            const originalApp: AppInfo = { codeunit: [1, 2, 3] };
            const upgradedApp = { codeunit: [1, 2, 3], _upgrade: ["tag1"] } as AppInfo;
            mockBlobInstance.read.mockResolvedValue(originalApp);
            mockUpgrade.mockResolvedValue(upgradedApp);
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await bindSingleApp(request, params);

            expect(mockAppCache.set).toHaveBeenCalledWith("test-app-id", upgradedApp);
            expect(mockAppCache.set).not.toHaveBeenCalledWith("test-app-id", originalApp);
            expect((request as any).app).toEqual(upgradedApp);
        });

        it("should propagate upgrade failure during binding", async () => {
            const appData = { codeunit: [1, 2, 3] };
            mockBlobInstance.read.mockResolvedValue(appData);
            mockUpgrade.mockRejectedValue(new Error("Upgrade failed"));
            const request = createMockRequest();
            const params = { appId: "test-app-id" };

            await expect(bindSingleApp(request, params)).rejects.toThrow("Upgrade failed");
        });
    });
});

describe("bindMultiApp", () => {
    let mockBlobInstances: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    }[];
    let blobCallIndex: number;

    const createMockRequest = (overrides: Partial<AzureHttpRequest> = {}): AzureHttpRequest => ({
        method: "POST",
        headers: { get: jest.fn() } as any,
        params: {},
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockBlobInstances = [];
        blobCallIndex = 0;

        MockBlob.mockImplementation(() => {
            const instance = {
                read: jest.fn().mockResolvedValue({ codeunit: [] }),
                exists: jest.fn(),
                optimisticUpdate: jest.fn(),
            };
            mockBlobInstances.push(instance);
            return instance as any;
        });
        mockUpgrade.mockImplementation(async (appId, app, blob) => app);
    });

    describe("array body", () => {
        it("should create AppBinding array with ids from array body elements", async () => {
            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }, { appId: "app-3" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(3);
            expect((request as any).apps.map((b: any) => b.id)).toEqual(["app-1", "app-2", "app-3"]);
        });

        it("should create Blob for each appId in array", async () => {
            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }],
            });

            await bindMultiApp(request);

            expect(MockBlob).toHaveBeenCalledTimes(2);
            expect(MockBlob).toHaveBeenCalledWith("apps://app-1.json");
            expect(MockBlob).toHaveBeenCalledWith("apps://app-2.json");
        });

        it("should bind AppBinding objects with id, app content, and blob", async () => {
            const appData1 = { codeunit: [1] };
            const appData2 = { codeunit: [2] };
            let callIndex = 0;

            MockBlob.mockImplementation(() => {
                const data = callIndex === 0 ? appData1 : appData2;
                const instance = {
                    read: jest.fn().mockResolvedValue(data),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                callIndex++;
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(2);
            expect((request as any).apps[0].id).toBe("app-1");
            expect((request as any).apps[0].app).toEqual(appData1);
            expect((request as any).apps[0].blob).toBe(mockBlobInstances[0]);
            expect((request as any).apps[1].id).toBe("app-2");
            expect((request as any).apps[1].app).toEqual(appData2);
            expect((request as any).apps[1].blob).toBe(mockBlobInstances[1]);
        });
    });

    describe("single object body", () => {
        it("should treat single object body as array of one", async () => {
            const request = createMockRequest({
                body: { appId: "single-app" },
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(1);
            expect((request as any).apps[0].id).toBe("single-app");
        });

        it("should create one Blob for single object body", async () => {
            const request = createMockRequest({
                body: { appId: "single-app" },
            });

            await bindMultiApp(request);

            expect(MockBlob).toHaveBeenCalledTimes(1);
            expect(MockBlob).toHaveBeenCalledWith("apps://single-app.json");
        });

        it("should bind single AppBinding to apps array", async () => {
            const appData = { codeunit: [1, 2, 3] };
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue(appData),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: { appId: "single-app" },
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(1);
            expect((request as any).apps[0].id).toBe("single-app");
            expect((request as any).apps[0].app).toEqual(appData);
            expect((request as any).apps[0].blob).toBe(mockBlobInstances[0]);
        });
    });

    describe("app not found", () => {
        it("should throw 404 when any blob.read() returns null", async () => {
            MockBlob.mockImplementation(() => {
                const index = blobCallIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(index === 1 ? null : { codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "non-existent" }, { appId: "app-3" }],
            });

            let caughtError: any;
            try {
                await bindMultiApp(request);
            } catch (error) {
                caughtError = error;
            }

            expect(caughtError).toBeInstanceOf(ErrorResponse);
            expect(caughtError.message).toBe("App not found: non-existent");
            expect(caughtError.statusCode).toBe(HttpStatusCode.ClientError_404_NotFound);
        });

        it("should throw 404 when first app doesn't exist", async () => {
            MockBlob.mockImplementation(() => {
                const index = blobCallIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(index === 0 ? null : { codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "non-existent" }, { appId: "app-2" }],
            });

            await expect(bindMultiApp(request)).rejects.toThrow(ErrorResponse);
        });

        it("should throw 404 when last app doesn't exist", async () => {
            MockBlob.mockImplementation(() => {
                const index = blobCallIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(index === 2 ? null : { codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }, { appId: "non-existent" }],
            });

            await expect(bindMultiApp(request)).rejects.toThrow(ErrorResponse);
        });
    });

    describe("per-app authorization", () => {
        it("should throw 401 when app is authorized and authKey does not match", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({
                        _authorization: { key: "correct-key" },
                        codeunit: [1, 2, 3],
                    }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1", authKey: "wrong-key" }],
            });

            await expect(bindMultiApp(request)).rejects.toThrow(ErrorResponse);
            await expect(bindMultiApp(request)).rejects.toMatchObject({
                message: "Invalid authorization key",
                statusCode: HttpStatusCode.ClientError_401_Unauthorized,
            });
        });

        it("should throw 401 when app is authorized and no authKey provided", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({
                        _authorization: { key: "correct-key" },
                        codeunit: [1, 2, 3],
                    }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }],
            });

            await expect(bindMultiApp(request)).rejects.toThrow(ErrorResponse);
            await expect(bindMultiApp(request)).rejects.toMatchObject({
                statusCode: HttpStatusCode.ClientError_401_Unauthorized,
            });
        });

        it("should allow binding when authKey matches", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({
                        _authorization: { key: "correct-key" },
                        codeunit: [1, 2, 3],
                    }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1", authKey: "correct-key" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(1);
            expect((request as any).apps[0].id).toBe("app-1");
        });

        it("should allow binding when app is not authorized", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({ codeunit: [1, 2, 3] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(1);
        });

        it("should allow binding when no authorization key exists", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({
                        _authorization: {} as any,
                        codeunit: [1, 2, 3],
                    }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1", authKey: "any-key" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(1);
        });

        it("should skip auth check when skipAuth is true", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({
                        _authorization: { key: "correct-key" },
                        codeunit: [1, 2, 3],
                    }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1", authKey: "wrong-key" }],
            });

            await bindMultiApp(request, true);

            expect((request as any).apps).toHaveLength(1);
            expect((request as any).apps[0].id).toBe("app-1");
        });

        it("should check authorization for each app independently", async () => {
            let callIndex = 0;
            MockBlob.mockImplementation(() => {
                const index = callIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(
                        index === 0
                            ? { codeunit: [1] }  // First app has no auth
                            : { _authorization: { key: "key-2" }, codeunit: [2] }  // Second app has auth
                    ),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [
                    { appId: "app-1" },  // No auth needed
                    { appId: "app-2", authKey: "wrong-key" },  // Wrong auth key
                ],
            });

            await expect(bindMultiApp(request)).rejects.toMatchObject({
                statusCode: HttpStatusCode.ClientError_401_Unauthorized,
            });
        });

        it("should succeed when all apps have correct authorization", async () => {
            let callIndex = 0;
            MockBlob.mockImplementation(() => {
                const index = callIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(
                        index === 0
                            ? { _authorization: { key: "key-1" }, codeunit: [1] }
                            : { _authorization: { key: "key-2" }, codeunit: [2] }
                    ),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [
                    { appId: "app-1", authKey: "key-1" },
                    { appId: "app-2", authKey: "key-2" },
                ],
            });

            await bindMultiApp(request);

            expect((request as any).apps).toHaveLength(2);
        });
    });

    describe("data extraction", () => {
        it("should extract data excluding appId and authKey", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({ codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1", authKey: "some-key", ids: { codeunit: [1, 2, 3] }, extra: "value" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps[0].data).toEqual({ ids: { codeunit: [1, 2, 3] }, extra: "value" });
            expect((request as any).apps[0].data.appId).toBeUndefined();
            expect((request as any).apps[0].data.authKey).toBeUndefined();
        });

        it("should handle empty data (only appId)", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({ codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }],
            });

            await bindMultiApp(request);

            expect((request as any).apps[0].data).toEqual({});
        });

        it("should extract different data for each app", async () => {
            MockBlob.mockImplementation(() => {
                const instance = {
                    read: jest.fn().mockResolvedValue({ codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [
                    { appId: "app-1", ids: { codeunit: [1] } },
                    { appId: "app-2", ids: { table: [100] }, metadata: "test" },
                ],
            });

            await bindMultiApp(request);

            expect((request as any).apps[0].data).toEqual({ ids: { codeunit: [1] } });
            expect((request as any).apps[1].data).toEqual({ ids: { table: [100] }, metadata: "test" });
        });
    });

    describe("cache interactions", () => {
        it("should update cache for each app after reading from blob", async () => {
            const appData1 = { codeunit: [1] };
            const appData2 = { codeunit: [2] };
            let callIndex = 0;

            MockBlob.mockImplementation(() => {
                const data = callIndex === 0 ? appData1 : appData2;
                const instance = {
                    read: jest.fn().mockResolvedValue(data),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                callIndex++;
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }],
            });

            await bindMultiApp(request);

            expect(mockAppCache.set).toHaveBeenCalledTimes(2);
            expect(mockAppCache.set).toHaveBeenCalledWith("app-1", appData1);
            expect(mockAppCache.set).toHaveBeenCalledWith("app-2", appData2);
        });

        it("should not update cache when app is not found", async () => {
            MockBlob.mockImplementation(() => {
                const index = blobCallIndex++;
                const instance = {
                    read: jest.fn().mockResolvedValue(index === 0 ? null : { codeunit: [] }),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                return instance as any;
            });

            const request = createMockRequest({
                body: [{ appId: "non-existent" }, { appId: "app-2" }],
            });

            try {
                await bindMultiApp(request);
            } catch {
                // Expected to throw
            }

            expect(mockAppCache.set).not.toHaveBeenCalled();
        });
    });

    describe("upgrade integration", () => {
        it("should run upgrade for each app in multi-app binding", async () => {
            const appData1 = { codeunit: [1] };
            const appData2 = { codeunit: [2] };
            let callIndex = 0;

            MockBlob.mockImplementation(() => {
                const data = callIndex === 0 ? appData1 : appData2;
                const instance = {
                    read: jest.fn().mockResolvedValue(data),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                callIndex++;
                return instance as any;
            });

            mockUpgrade.mockImplementation(async (appId, app, blob) => app);

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }],
            });

            await bindMultiApp(request);

            expect(mockUpgrade).toHaveBeenCalledTimes(2);
            expect(mockUpgrade).toHaveBeenCalledWith("app-1", appData1, mockBlobInstances[0]);
            expect(mockUpgrade).toHaveBeenCalledWith("app-2", appData2, mockBlobInstances[1]);
        });

        it("should handle multiple apps in bindMultiApp, some need upgrades - all upgraded correctly", async () => {
            const appData1: AppInfo = { codeunit: [1] };
            const upgradedApp1 = { codeunit: [1], _upgrade: ["tag1"] } as AppInfo;
            const appData2 = { codeunit: [2], _upgrade: ["tag1"] } as AppInfo;
            let callIndex = 0;

            MockBlob.mockImplementation(() => {
                const data = callIndex === 0 ? appData1 : appData2;
                const instance = {
                    read: jest.fn().mockResolvedValue(data),
                    exists: jest.fn(),
                    optimisticUpdate: jest.fn(),
                };
                mockBlobInstances.push(instance);
                callIndex++;
                return instance as any;
            });

            mockUpgrade.mockImplementation(async (appId, app, blob) => {
                if (appId === "app-1") {
                    return upgradedApp1;
                }
                return app;
            });

            const request = createMockRequest({
                body: [{ appId: "app-1" }, { appId: "app-2" }],
            });

            await bindMultiApp(request);

            expect(mockUpgrade).toHaveBeenCalledTimes(2);
            expect((request as any).apps[0].app).toEqual(upgradedApp1);
            expect((request as any).apps[1].app).toEqual(appData2);
            expect(mockAppCache.set).toHaveBeenCalledWith("app-1", upgradedApp1);
            expect(mockAppCache.set).toHaveBeenCalledWith("app-2", appData2);
        });
    });
});

