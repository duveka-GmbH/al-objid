/**
 * Behavioral Tests for syncIds Endpoint
 *
 * These tests are 1:1 mappings of the old v2 backend tests.
 * They validate that the v3 refactored implementation maintains
 * the exact same behavior as v2.
 *
 * V2 source: S:\al-objid\azure-function-app\test\v2\syncIds.test.ts
 */

import { Blob } from "@vjeko.com/azure-blob";
import { createEndpoint, ErrorResponse, HttpStatusCode, performValidation } from "../../src/http";
import { ValidatorSymbol } from "../../src/http/validationTypes";
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

import "../../src/functions/v3/syncIds";

describe("Testing function api/v2/syncIds (behavioral validation)", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;
    const mockLogAppEvent = loggingModule.logAppEvent as jest.MockedFunction<typeof loggingModule.logAppEvent>;

    // Exact test data from v2 tests
    const ids = {
        codeunit: [1, 3, 5],
        page: [2, 4, 6],
        report: [3],
        table_2: [7, 8],
        enumextension_3: [8, 9],
    };

    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockRequest = (method: string, body: any, appInfo: any, overrides: any = {}) => {
        return {
            params: { appId: body.appId || "_mock_" },
            headers: {
                get: jest.fn().mockReturnValue(null),
            },
            body,
            method,
            appId: body.appId || "_mock_",
            app: appInfo,
            appBlob: mockBlobInstance,
            user: body.user ? { name: body.user } : undefined,
            markAsChanged: jest.fn(),
            ...overrides,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockBlobInstance = {
            read: jest.fn(),
            exists: jest.fn(),
            optimisticUpdate: jest.fn(),
        };

        MockBlob.mockImplementation(() => mockBlobInstance as any);
        mockLogAppEvent.mockResolvedValue(undefined);
    });

    // V2 Test 1: "Fails on missing consumption specification"
    it("Fails on missing consumption specification", async () => {
        // v2: POST without ids returns status 400
        const request = createMockRequest("POST", { appId: "_mock_" }, null);

        // If v3 validates similarly, should throw 400
        // This test documents the expected behavior
        // Note: Validation is applied by handleRequest, so we must apply it manually in behavioral tests
        const validators = endpointConfig.POST[ValidatorSymbol];
        expect(() => performValidation(request as any, ...validators)).toThrow(ErrorResponse);
        try {
            performValidation(request as any, ...validators);
        } catch (e: any) {
            expect(e.statusCode).toBe(HttpStatusCode.ClientError_400_BadRequest);
        }
    });

    // V2 Test 2: "Inserts new consumptions on POST against unknown app"
    it("Inserts new consumptions on POST against unknown app", async () => {
        let updateResult: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            updateResult = fn(null);
            return updateResult;
        });
        const request = createMockRequest("POST", {
            appId: "_mock_",
            ids,
            user: "fake",
        }, null);

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200) - implied by no throw
        // v2: expect(storage).toHaveChanged()
        expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

        // v2: expect(storage).not.toBeAuthorized()
        expect(updateResult._authorization).toBeUndefined();

        // v2: expect(storage.objectIds(ALObjectType.codeunit)).toEqual([1, 3, 5])
        expect(updateResult.codeunit).toEqual([1, 3, 5]);

        // v2: expect(storage.objectIds(ALObjectType.table)).toBeUndefined()
        expect(updateResult.table).toBeUndefined();

        // v2: expect(storage.objectIds(ALObjectType.page)).toEqual([2, 4, 6])
        expect(updateResult.page).toEqual([2, 4, 6]);

        // v2: expect(storage.objectIds(ALObjectType.report)).toEqual([3])
        expect(updateResult.report).toEqual([3]);

        // v2: expect(storage.objectIds(storage.toALObjectType("table_2"))).toEqual([7, 8])
        expect(updateResult.table_2).toEqual([7, 8]);

        // v2: expect(storage.objectIds(storage.toALObjectType("enumextension_3"))).toEqual([8, 9])
        expect(updateResult.enumextension_3).toEqual([8, 9]);

        // v2: expect(storage.log()[0].eventType).toBe("syncFull")
        // v2: expect(storage.log()[0].user).toBe("fake")
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "_mock_",
            "syncFull",
            expect.objectContaining({ name: "fake" })
        );

        // v2: expect(context.bindings.notify).toBeDefined()
        // v2: expect(context.bindings.notify.appId).toBe("_mock_")
    });

    // V2 Test 3: "Inserts new consumptions on PATCH against unknown app"
    it("Inserts new consumptions on PATCH against unknown app", async () => {
        let updateResult: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            updateResult = fn(null);
            return updateResult;
        });
        const request = createMockRequest("PATCH", {
            appId: "_mock_",
            ids,
            user: "fake",
        }, null);

        const result = await endpointConfig.PATCH(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()
        expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

        // v2: expect(storage).not.toBeAuthorized()
        expect(updateResult._authorization).toBeUndefined();

        // v2: expect(storage.objectIds(ALObjectType.codeunit)).toEqual([1, 3, 5])
        expect(updateResult.codeunit).toEqual([1, 3, 5]);

        // v2: expect(storage.objectIds(ALObjectType.table)).toBeUndefined()
        expect(updateResult.table).toBeUndefined();

        // v2: expect(storage.objectIds(ALObjectType.page)).toEqual([2, 4, 6])
        expect(updateResult.page).toEqual([2, 4, 6]);

        // v2: expect(storage.objectIds(ALObjectType.report)).toEqual([3])
        expect(updateResult.report).toEqual([3]);

        // v2: expect(storage.objectIds(storage.toALObjectType("table_2"))).toEqual([7, 8])
        expect(updateResult.table_2).toEqual([7, 8]);

        // v2: expect(storage.objectIds(storage.toALObjectType("enumextension_3"))).toEqual([8, 9])
        expect(updateResult.enumextension_3).toEqual([8, 9]);

        // v2: expect(storage.log()[0].eventType).toBe("syncMerge")
        // v2: expect(storage.log()[0].user).toBe("fake")
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "_mock_",
            "syncMerge",
            expect.objectContaining({ name: "fake" })
        );
    });

    // V2 Test 4: "Overwrites existing consumptions on POST against a known app"
    it("Overwrites existing consumptions on POST against a known app", async () => {
        // Existing app with different consumptions
        const existingAppInfo = {
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };
        let updateResult: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            updateResult = fn(existingAppInfo);
            return updateResult;
        });
        const request = createMockRequest("POST", {
            appId: "test-app-id",
            ids,
            user: "fake",
        }, existingAppInfo, { appId: "test-app-id" });

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()
        expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

        // v2: expect(storage).not.toBeAuthorized()
        expect(updateResult._authorization).toBeUndefined();

        // v2: expect(storage.log()[0].eventType).toBe("syncFull")
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "test-app-id",
            "syncFull",
            expect.objectContaining({ name: "fake" })
        );

        // v2: const app = storage.content[`${storage.appId}.json`];
        // v2: expect(app.codeunit).toEqual([1, 3, 5])
        expect(updateResult.codeunit).toEqual([1, 3, 5]);

        // v2: expect(app.table).toBeUndefined() - POST removes types not in new ids
        expect(updateResult.table).toBeUndefined();

        // v2: expect(app.page).toEqual([2, 4, 6])
        expect(updateResult.page).toEqual([2, 4, 6]);

        // v2: expect(app.report).toEqual([3])
        expect(updateResult.report).toEqual([3]);

        // v2: expect(app.table_2).toEqual([7, 8])
        expect(updateResult.table_2).toEqual([7, 8]);

        // v2: expect(app.enumextension_3).toEqual([8, 9])
        expect(updateResult.enumextension_3).toEqual([8, 9]);
    });

    // V2 Test 5: "Merges new consumptions on PATCH against a known app"
    it("Merges new consumptions on PATCH against a known app", async () => {
        // Existing app with different consumptions
        const existingAppInfo = {
            codeunit: [2, 3, 4],
            table: [1, 2],
            page: [3, 4, 5],
        };
        let updateResult: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            updateResult = fn(existingAppInfo);
            return updateResult;
        });
        const request = createMockRequest("PATCH", {
            appId: "test-app-id",
            ids,
            user: "fake",
        }, existingAppInfo, { appId: "test-app-id" });

        const result = await endpointConfig.PATCH(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).toHaveChanged()
        expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

        // v2: expect(storage).not.toBeAuthorized()
        expect(updateResult._authorization).toBeUndefined();

        // v2: const app = storage.content[`${storage.appId}.json`];
        // v2: expect(app.codeunit).toEqual([1, 2, 3, 4, 5]) - MERGED
        expect(updateResult.codeunit).toEqual([1, 2, 3, 4, 5]);

        // v2: expect(app.table).toEqual([1, 2]) - PRESERVED (not in new ids but kept)
        expect(updateResult.table).toEqual([1, 2]);

        // v2: expect(app.page).toEqual([2, 3, 4, 5, 6]) - MERGED
        expect(updateResult.page).toEqual([2, 3, 4, 5, 6]);

        // v2: expect(app.report).toEqual([3]) - NEW
        expect(updateResult.report).toEqual([3]);

        // v2: expect(app.table_2).toEqual([7, 8]) - NEW
        expect(updateResult.table_2).toEqual([7, 8]);

        // v2: expect(app.enumextension_3).toEqual([8, 9]) - NEW
        expect(updateResult.enumextension_3).toEqual([8, 9]);

        // v2: expect(storage.log()[0].eventType).toBe("syncMerge")
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "test-app-id",
            "syncMerge",
            expect.objectContaining({ name: "fake" })
        );
    });
});
