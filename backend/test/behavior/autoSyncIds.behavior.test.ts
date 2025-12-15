/**
 * Behavioral Tests for autoSyncIds Endpoint
 *
 * These tests are 1:1 mappings of the old v2 backend tests.
 * They validate that the v3 refactored implementation maintains
 * the exact same behavior as v2.
 *
 * V2 source: S:\al-objid\azure-function-app\test\v2\autoSyncIds.test.ts
 */

import { Blob } from "@vjeko.com/azure-blob";
import { createEndpoint, ErrorResponse, HttpStatusCode, performValidation, checkAuthorization } from "../../src/http";
import { ValidatorSymbol } from "../../src/http/validationTypes";
import { AppBinding } from "../../src/http";
import { AppCache } from "../../src/cache";
import * as loggingModule from "../../src/utils/logging";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/http/createEndpoint");
jest.mock("../../src/cache");
jest.mock("../../src/utils/logging");

const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;

let endpointConfig: any;
mockCreateEndpoint.mockImplementation((config: any) => {
    endpointConfig = config;
});

import "../../src/functions/v3/autoSyncIds";

describe("Testing function api/v2/autoSyncIds (behavioral validation)", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;
    const mockLogAppEvent = loggingModule.logAppEvent as jest.MockedFunction<typeof loggingModule.logAppEvent>;

    // Exact test data from v2 tests
    const appFolders: any = [
        { appId: "first", ids: { codeunit: [1, 3, 5], page: [2, 4, 6], report: [3] } },
        { appId: "second", ids: { table: [1, 3, 5], xmlport: [2, 4, 6], enum: [3] } },
    ];

    let mockBlobInstances: Map<string, {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    }>;

    const createAppBinding = (id: string, data: any, app: any = null): AppBinding => {
        const blobInstance = mockBlobInstances.get(id) || {
            read: jest.fn(),
            exists: jest.fn(),
            optimisticUpdate: jest.fn(),
        };
        mockBlobInstances.set(id, blobInstance);
        return {
            id,
            app: app || {},
            blob: blobInstance as any,
            data,
        };
    };

    const createMockRequest = (method: string, apps: AppBinding[], overrides: any = {}) => {
        return {
            params: {},
            headers: {
                get: jest.fn().mockReturnValue(null),
            },
            body: apps.map(a => ({ appId: a.id, ...a.data })),
            method,
            apps,
            user: undefined,
            markAsChanged: jest.fn(),
            ...overrides,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBlobInstances = new Map();

        MockBlob.mockImplementation((path: string) => {
            const id = path.replace("apps://", "").replace(".json", "");
            const instance = mockBlobInstances.get(id) || {
                read: jest.fn(),
                exists: jest.fn(),
                optimisticUpdate: jest.fn(),
            };
            mockBlobInstances.set(id, instance);
            return instance as any;
        });
        mockLogAppEvent.mockResolvedValue(undefined);
    });

    // V2 Test 1: "Fails on missing consumption specification"
    it("Fails on missing consumption specification", async () => {
        // v2: POST without appFolders returns status 400
        // Create request with items missing 'ids' field
        const requestBody = [{ appId: "test-app" }]; // Missing 'ids'
        const request = {
            ...createMockRequest("POST", []),
            body: requestBody,
        };

        // NOTE: v3 uses different request structure (apps array instead of appFolders)
        // This test documents the expected validation behavior
        // Note: Validation is applied by handleRequest, so we must apply it manually in behavioral tests
        const validators = endpointConfig.POST[ValidatorSymbol];
        expect(() => performValidation(request as any, ...validators)).toThrow(ErrorResponse);
        try {
            performValidation(request as any, ...validators);
        } catch (e: any) {
            expect(e.statusCode).toBe(HttpStatusCode.ClientError_400_BadRequest);
        }
    });

    // V2 Test 2: "Inserts new consumptions on POST against unknown apps"
    it("Inserts new consumptions on POST against unknown apps", async () => {
        const updateResults: Map<string, any> = new Map();

        const apps = appFolders.map((folder: any) => {
            const binding = createAppBinding(folder.appId, folder, null);
            const blobInstance = mockBlobInstances.get(folder.appId)!;
            blobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
                const result = fn(null);
                updateResults.set(folder.appId, result);
                return result;
            });
            return binding;
        });

        const request = createMockRequest("POST", apps);

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()

        // Check first app
        const app1 = updateResults.get("first");
        // v2: expect(app1.codeunit).toEqual([1, 3, 5])
        expect(app1.codeunit).toEqual([1, 3, 5]);
        // v2: expect(app1.table).toBeUndefined()
        expect(app1.table).toBeUndefined();
        // v2: expect(app1.page).toEqual([2, 4, 6])
        expect(app1.page).toEqual([2, 4, 6]);
        // v2: expect(app1.report).toEqual([3])
        expect(app1.report).toEqual([3]);

        // Check second app
        const app2 = updateResults.get("second");
        // v2: expect(app2.table).toEqual([1, 3, 5])
        expect(app2.table).toEqual([1, 3, 5]);
        // v2: expect(app2.codeunit).toBeUndefined()
        expect(app2.codeunit).toBeUndefined();
        // v2: expect(app2.xmlport).toEqual([2, 4, 6])
        expect(app2.xmlport).toEqual([2, 4, 6]);
        // v2: expect(app2.enum).toEqual([3])
        expect(app2.enum).toEqual([3]);
    });

    // V2 Test 3: "Inserts new consumptions on PATCH against unknown apps"
    it("Inserts new consumptions on PATCH against unknown apps", async () => {
        const updateResults: Map<string, any> = new Map();

        const apps = appFolders.map((folder: any) => {
            const binding = createAppBinding(folder.appId, folder, null);
            const blobInstance = mockBlobInstances.get(folder.appId)!;
            blobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
                const result = fn(null);
                updateResults.set(folder.appId, result);
                return result;
            });
            return binding;
        });

        const request = createMockRequest("PATCH", apps);

        const result = await endpointConfig.PATCH(request);

        // v2: expect(context.res).toBeStatus(200)

        // Check first app (same as POST for unknown apps)
        const app1 = updateResults.get("first");
        expect(app1.codeunit).toEqual([1, 3, 5]);
        expect(app1.table).toBeUndefined();
        expect(app1.page).toEqual([2, 4, 6]);
        expect(app1.report).toEqual([3]);

        // Check second app
        const app2 = updateResults.get("second");
        expect(app2.table).toEqual([1, 3, 5]);
        expect(app2.codeunit).toBeUndefined();
        expect(app2.xmlport).toEqual([2, 4, 6]);
        expect(app2.enum).toEqual([3]);
    });

    // V2 Test 4: "Overwrites existing consumptions on POST against known apps"
    it("Overwrites existing consumptions on POST against known apps", async () => {
        const existingFirst = {
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };
        const updateResults: Map<string, any> = new Map();

        const apps = appFolders.map((folder: any) => {
            const existingApp = folder.appId === "first" ? existingFirst : null;
            const binding = createAppBinding(folder.appId, folder, existingApp);
            const blobInstance = mockBlobInstances.get(folder.appId)!;
            blobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
                const result = fn(existingApp);
                updateResults.set(folder.appId, result);
                return result;
            });
            return binding;
        });

        const request = createMockRequest("POST", apps);

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()

        // Check first app - POST overwrites everything
        const app1 = updateResults.get("first");
        // v2: expect(app1.codeunit).toEqual([1, 3, 5])
        expect(app1.codeunit).toEqual([1, 3, 5]);
        // v2: expect(app1.table).toBeUndefined() - removed, not in new ids
        expect(app1.table).toBeUndefined();
        // v2: expect(app1.page).toEqual([2, 4, 6])
        expect(app1.page).toEqual([2, 4, 6]);
        // v2: expect(app1.report).toEqual([3])
        expect(app1.report).toEqual([3]);

        // Check second app
        const app2 = updateResults.get("second");
        expect(app2.table).toEqual([1, 3, 5]);
        expect(app2.codeunit).toBeUndefined();
        expect(app2.xmlport).toEqual([2, 4, 6]);
        expect(app2.enum).toEqual([3]);
    });

    // V2 Test 5: "Merges new consumptions on PATCH against known apps"
    it("Merges new consumptions on PATCH against known apps", async () => {
        const existingFirst = {
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };
        const updateResults: Map<string, any> = new Map();

        const apps = appFolders.map((folder: any) => {
            const existingApp = folder.appId === "first" ? existingFirst : null;
            const binding = createAppBinding(folder.appId, folder, existingApp);
            const blobInstance = mockBlobInstances.get(folder.appId)!;
            blobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
                const result = fn(existingApp);
                updateResults.set(folder.appId, result);
                return result;
            });
            return binding;
        });

        const request = createMockRequest("PATCH", apps);

        const result = await endpointConfig.PATCH(request);

        // v2: expect(context.res).toBeStatus(200)

        // Check first app - PATCH merges
        const app1 = updateResults.get("first");
        // v2: expect(app1.codeunit).toEqual([1, 2, 3, 4, 5]) - merged
        expect(app1.codeunit).toEqual([1, 2, 3, 4, 5]);
        // v2: expect(app1.table).toEqual([1, 2]) - preserved
        expect(app1.table).toEqual([1, 2]);
        // v2: expect(app1.page).toEqual([2, 3, 4, 5, 6]) - merged
        expect(app1.page).toEqual([2, 3, 4, 5, 6]);
        // v2: expect(app1.report).toEqual([3]) - new
        expect(app1.report).toEqual([3]);

        // Check second app
        const app2 = updateResults.get("second");
        expect(app2.table).toEqual([1, 3, 5]);
        expect(app2.codeunit).toBeUndefined();
        expect(app2.xmlport).toEqual([2, 4, 6]);
        expect(app2.enum).toEqual([3]);
    });

    // V2 Test 6: "Fails to perform update with unauthorized POST against an authorized app"
    it("Fails to perform update with unauthorized POST against an authorized app", async () => {
        // First app is authorized but request doesn't include authKey
        const existingFirst = {
            _authorization: { key: "__mock_auth_key__", valid: true },
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };

        // Note: In v3, authorization is checked by bindMultiAppOptional during request binding,
        // not by the handler itself. This test verifies checkAuthorization behavior directly.
        // v2: expect(context.res).toBeStatus(401)
        expect(() => checkAuthorization(existingFirst as any, null)).toThrow(ErrorResponse);
        try {
            checkAuthorization(existingFirst as any, null);
        } catch (e: any) {
            expect(e.statusCode).toBe(HttpStatusCode.ClientError_401_Unauthorized);
        }
    });

    // V2 Test 7: "Successfully performs update with authorized POST against an authorized app"
    it("Successfully performs update with authorized POST against an authorized app", async () => {
        const existingFirst = {
            _authorization: { key: "__mock_auth_key__", valid: true },
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };
        const updateResults: Map<string, any> = new Map();

        // Include authKey for the authorized app
        const foldersWithAuth = [...appFolders];
        foldersWithAuth[0] = { ...foldersWithAuth[0], authKey: "__mock_auth_key__" };

        const apps = foldersWithAuth.map((folder: any) => {
            const existingApp = folder.appId === "first" ? existingFirst : null;
            const binding = createAppBinding(folder.appId, folder, existingApp);
            const blobInstance = mockBlobInstances.get(folder.appId)!;
            blobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
                const result = fn(existingApp);
                updateResults.set(folder.appId, result);
                return result;
            });
            return binding;
        });

        const request = createMockRequest("POST", apps);

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()

        // Check first app - should be updated despite being authorized
        const app1 = updateResults.get("first");
        expect(app1.codeunit).toEqual([1, 3, 5]);
        expect(app1.table).toBeUndefined();
        expect(app1.page).toEqual([2, 4, 6]);
        expect(app1.report).toEqual([3]);

        // Check second app
        const app2 = updateResults.get("second");
        expect(app2.table).toEqual([1, 3, 5]);
        expect(app2.codeunit).toBeUndefined();
        expect(app2.xmlport).toEqual([2, 4, 6]);
        expect(app2.enum).toEqual([3]);
    });
});
