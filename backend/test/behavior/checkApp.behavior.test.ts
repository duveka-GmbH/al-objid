/**
 * Behavioral Tests for checkApp Endpoint
 *
 * These tests are 1:1 mappings of the old v2 backend tests.
 * They validate that the v3 refactored implementation maintains
 * the exact same behavior as v2.
 *
 * V2 source: S:\al-objid\azure-function-app\test\v2\checkApp.test.ts
 */

import { Blob } from "@vjeko.com/azure-blob";
import { createEndpoint } from "../../src/http";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/http/createEndpoint");

const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;

let endpointConfig: any;
mockCreateEndpoint.mockImplementation((config: any) => {
    endpointConfig = config;
});

import "../../src/functions/v3/checkApp";

describe("Testing function api/v2/checkApp (behavioral validation)", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;

    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockRequest = (body: any, appInfo: any, overrides: any = {}) => {
        return {
            params: { appId: body.appId },
            headers: {
                get: jest.fn().mockReturnValue(null),
            },
            body,
            appId: body.appId,
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

    // V2 Test 1: "Fails on missing app ID" - REMOVED
    // This test is not applicable to v3. In v2, appId was a body parameter that needed validation.
    // In v3, appId is a route parameter (v3/checkApp/{appId}), so a missing appId would result
    // in a 404 at the routing level - the request would never reach the handler.
    // The handler's `if (!appId) return "false"` is purely defensive and unreachable in practice.

    // V2 Test 2: "Succeeds checking an existing app"
    it("Succeeds checking an existing app", async () => {
        // App exists (read returns data)
        mockBlobInstance.read.mockResolvedValue({});
        const request = createMockRequest({ appId: "test-app-id" }, {});

        const result = await endpointConfig.GET(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(context.res.body).toStrictEqual("true")
        expect(result).toBe("true");
        expect(typeof result).toBe("string");
    });

    // V2 Test 3: "Succeeds checking a missing app"
    it("Succeeds checking a missing app", async () => {
        // App doesn't exist (read returns null)
        mockBlobInstance.read.mockResolvedValue(null);
        const request = createMockRequest({ appId: "_non_existing_" }, null);

        const result = await endpointConfig.GET(request);

        // v2: expect(context.res).toBeStatus(200)
        // v2: expect(context.res.body).toStrictEqual("false")
        expect(result).toBe("false");
        expect(typeof result).toBe("string");
    });
});
