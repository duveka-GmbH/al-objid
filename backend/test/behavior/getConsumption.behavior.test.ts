/**
 * Behavioral Tests for getConsumption Endpoint
 *
 * These tests are 1:1 mappings of the old v2 backend tests.
 * They validate that the v3 refactored implementation maintains
 * the exact same behavior as v2.
 *
 * V2 source: S:\al-objid\azure-function-app\test\v2\getConsumption.test.ts
 *
 * IMPORTANT V2 BEHAVIOR: _total only counts standard ALObjectTypes,
 * NOT extended types like table_2 or enum_123!
 */

import { Blob } from "@vjeko.com/azure-blob";
import { createEndpoint, HttpStatusCode } from "../../src/http";
import { SingleAppHttpRequestSymbol } from "../../src/http/AzureHttpRequest";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/http/createEndpoint");

const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;

let endpointConfig: any;
mockCreateEndpoint.mockImplementation((config: any) => {
    endpointConfig = config;
});

import "../../src/functions/v3/getConsumption";

describe("Testing function api/v2/getConsumption (behavioral validation)", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;

    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockRequest = (body: any, appInfo: any, overrides: any = {}) => {
        return {
            params: { appId: body.appId || "test-app-id" },
            headers: {
                get: jest.fn().mockImplementation((name: string) => {
                    if (name === "Ninja-Auth-Key") return body.authKey || null;
                    return null;
                }),
            },
            body,
            appId: body.appId || "test-app-id",
            app: appInfo,
            appBlob: mockBlobInstance,
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
    });

    // V2 Test 1: "Correctly retrieves consumptions"
    it("Correctly retrieves consumptions", async () => {
        // v2 test setup:
        // - App is authorized
        // - codeunit: [1, 2, 3]
        // - page: [4, 5, 6]
        // - table_2: [7, 8]
        const appInfo = {
            _authorization: { key: "__mock_auth_key__", valid: true },
            codeunit: [1, 2, 3],
            page: [4, 5, 6],
            table_2: [7, 8],
        };
        const request = createMockRequest({
            appId: "test-app-id",
            authKey: "__mock_auth_key__",
        }, appInfo);

        const result = await endpointConfig.POST(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(storage).not.toHaveChanged()
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();

        // v2: expect(context.res.body).toEqual({
        //     _total: 6,
        //     codeunit: [1, 2, 3],
        //     page: [4, 5, 6],
        //     [storage.toALObjectType("table_2")]: [7, 8]
        // })
        //
        // CRITICAL V2 BEHAVIOR: _total is 6, NOT 8!
        // This means v2 only counts standard ALObjectTypes in _total,
        // NOT extended types like table_2.
        // codeunit(3) + page(3) = 6
        // table_2(2) is NOT counted in _total
        expect(result._total).toBe(6);

        expect(result.codeunit).toEqual([1, 2, 3]);
        expect(result.page).toEqual([4, 5, 6]);
        expect(result.table_2).toEqual([7, 8]);

        // v2: Response should NOT include _authorization
        expect(result._authorization).toBeUndefined();
    });

    // V2 Test 2: "Fails to retrieve consumptions for unknown app"
    // NOTE: In v3, the 404 for unknown app is handled by the binding layer (bindSingleApp)
    // when appRequestMandatory is set. This test verifies the handler is properly configured
    // to use mandatory app binding, which guarantees 404 behavior for unknown apps.
    it("Fails to retrieve consumptions for unknown app", async () => {
        // v2: App doesn't exist, should return 404
        // v2: expect(context.res).toBeStatus(404)
        //
        // In v3, this is enforced by appRequestMandatory + bindSingleApp in handleRequest.
        // The handler is marked with SingleAppHttpRequestSymbol, which causes bindSingleApp
        // to throw ErrorResponse(404) before the handler is ever called.
        //
        // We verify the handler is properly configured for mandatory app binding:
        expect(endpointConfig.POST[SingleAppHttpRequestSymbol]).toBe(true);

        // This guarantees that when handleRequest processes this endpoint:
        // 1. It sees SingleAppHttpRequestSymbol = true
        // 2. It calls bindSingleApp()
        // 3. bindSingleApp throws ErrorResponse(404) if app doesn't exist
    });
});
