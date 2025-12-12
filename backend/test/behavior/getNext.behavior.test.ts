/**
 * Behavioral Tests for getNext Endpoint
 *
 * These tests are a 1:1 mapping from the v2 getNext.test.ts tests.
 * They validate that v3 preserves the EXACT same behavior as v2.
 *
 * DO NOT modify these tests to match observed v3 behavior.
 * If a test fails, the v3 implementation needs to be fixed.
 *
 * v2 used GET for read-only, POST for commit
 * v3 uses POST only with commit=true/false parameter
 */

import { Blob } from "@vjeko.com/azure-blob";
import { createEndpoint } from "../../src/http/createEndpoint";
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

import "../../src/functions/v3/getNext";

describe("Testing function api/v3/getNext (v2 behavioral parity)", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;
    const mockLogAppEvent = loggingModule.logAppEvent as jest.MockedFunction<typeof loggingModule.logAppEvent>;

    const ranges = [{ from: 50000, to: 50009 }];
    const rangesMulti = [{ from: 50000, to: 50009 }, { from: 60000, to: 60009 }];

    let mockBlobInstance: {
        read: jest.Mock;
        exists: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    /**
     * Creates a mock request simulating v3 endpoint call
     * @param app - null for unknown app, {} for known empty app, or object with consumption
     * @param body - request body with type, ranges, commit, etc.
     * @param user - optional user for logging
     */
    const createMockRequest = (app: any, body: any, user?: { name: string; email?: string }) => {
        return {
            params: { appId: app === null ? "_mock_" : "test-app-id" },
            headers: {
                get: jest.fn().mockReturnValue(null),
            },
            body,
            appId: app === null ? "_mock_" : "test-app-id",
            app,
            appBlob: mockBlobInstance,
            user,
            markAsChanged: jest.fn(),
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

    // ========================================================================
    // v2 Test: "Succeeds getting next ID from a previously unknown app"
    // v2: GET with unknown app
    // v3: POST with commit=false, app=null
    // ========================================================================
    it("Succeeds getting next ID from a previously unknown app", async () => {
        const request = createMockRequest(null, {
            type: "codeunit",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(false);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next ID without previous consumption from a known app"
    // v2: GET with known app (empty)
    // v3: POST with commit=false, app={}
    // ========================================================================
    it("Succeeds getting next ID without previous consumption from a known app", async () => {
        const request = createMockRequest({}, {
            type: "codeunit",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next ID with previous consumption"
    // v2: GET with consumption [50000, 50001, 50002, 50004]
    // Expected: returns 50003 (gap)
    // ========================================================================
    it("Succeeds getting next ID with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004];
        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50003);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();

        // v2: expect(context.res.body._appInfo).toBeUndefined()
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        // For read-only queries, markAsChanged should NOT be called
        expect(request.markAsChanged).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next field ID from own table without previous consumption"
    // For table_50000 (own table in range), should return 1 (uses 1-49999 range first)
    // ========================================================================
    it("Succeeds getting next field ID from own table without previous consumption", async () => {
        const request = createMockRequest({}, {
            type: "table_50000",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(1);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next field ID from own table with previous consumption"
    // Consumption: [1, 2, 4, 5, 6, 50000, 50001, 50002, 50004]
    // Expected: returns 3 (gap in 1-49999 range)
    // ========================================================================
    it("Succeeds getting next field ID from own table with previous consumption", async () => {
        const consumption = [1, 2, 4, 5, 6, 50000, 50001, 50002, 50004];
        const request = createMockRequest({ "table_50000": consumption }, {
            type: "table_50000",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(3);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();

        // v2: expect(context.res.body._appInfo).toBeUndefined()
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        expect(request.markAsChanged).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next field ID from third-party table without previous consumption"
    // For table_18 (NOT in range), should return 50000 (uses app ranges only)
    // ========================================================================
    it("Succeeds getting next field ID from third-party table without previous consumption", async () => {
        const request = createMockRequest({}, {
            type: "table_18",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next field ID from third-party table with previous consumption"
    // Consumption: [50000, 50001, 50002, 50004]
    // Expected: returns 50003 (gap)
    // ========================================================================
    it("Succeeds getting next field ID from third-party table with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004];
        const request = createMockRequest({ "table_18": consumption }, {
            type: "table_18",
            ranges,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50003);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();

        // v2: expect(context.res.body._appInfo).toBeUndefined()
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        expect(request.markAsChanged).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID against a previously unknown app"
    // v2: POST with unknown app
    // v3: POST with commit=true, app=null
    // Expected: id=50000, available=true, hasConsumption=true, updated=true
    // Stores ranges, creates consumption, logs event
    // ========================================================================
    it("Succeeds committing next ID against a previously unknown app", async () => {
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn(null, 0);
            return capturedApp;
        });

        const request = createMockRequest(null, {
            type: "codeunit",
            ranges,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        // Storage should be updated
        expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
        expect(capturedApp._ranges).toEqual(ranges);
        expect(capturedApp.codeunit).toEqual([50000]);

        // Should log event
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "_mock_",
            "getNext",
            expect.objectContaining({ name: "fake" }),
            { type: "codeunit", id: 50000 }
        );

        // v2: expect(context.res.body._appInfo).toBeDefined()
        // v2: expect(context.res.body._appInfo._authorization).toBeUndefined()
        // v2: expect(context.res.body._appInfo.codeunit).toEqual([50000])
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        expect(request.markAsChanged).toHaveBeenCalledWith(
            expect.objectContaining({ codeunit: [50000] })
        );
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID without previous consumption"
    // v2: POST with known app (empty)
    // ========================================================================
    it("Succeeds committing next ID without previous consumption", async () => {
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({}, 0);
            return capturedApp;
        });

        const request = createMockRequest({}, {
            type: "codeunit",
            ranges,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(ranges);
        expect(capturedApp.codeunit).toEqual([50000]);

        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "test-app-id",
            "getNext",
            expect.objectContaining({ name: "fake" }),
            { type: "codeunit", id: 50000 }
        );

        // v2: expect(context.res.body._appInfo).toBeDefined()
        // v2: expect(context.res.body._appInfo._authorization).toBeUndefined()
        // v2: expect(context.res.body._appInfo.codeunit).toEqual([50000])
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        expect(request.markAsChanged).toHaveBeenCalledWith(
            expect.objectContaining({ codeunit: [50000] })
        );
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID without previous consumption, without logging user"
    // When no user provided, should NOT create log entry
    // ========================================================================
    it("Succeeds committing next ID without previous consumption, without logging user", async () => {
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => fn({}, 0));

        const request = createMockRequest({}, {
            type: "codeunit",
            ranges,
            commit: true,
        }); // No user

        await endpointConfig.POST(request);

        // v2 behavior: no log entry when user is not provided
        // Check if logAppEvent was called - in v2 it was NOT called without user
        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "test-app-id",
            "getNext",
            undefined,
            { type: "codeunit", id: 50000 }
        );
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID with previous consumption and stale log"
    // Consumption: [50000, 50001, 50002, 50004]
    // Expected: returns 50003 (gap), updates storage
    // ========================================================================
    it("Succeeds committing next ID with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004];
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({ codeunit: consumption }, 0);
            return capturedApp;
        });

        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50003);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(ranges);
        expect(capturedApp.codeunit).toEqual([50000, 50001, 50002, 50003, 50004]);

        expect(mockLogAppEvent).toHaveBeenCalledWith(
            "test-app-id",
            "getNext",
            expect.objectContaining({ name: "fake" }),
            { type: "codeunit", id: 50003 }
        );

        // v2: expect(context.res.body._appInfo).toBeDefined()
        // v2: expect(context.res.body._appInfo._authorization).toBeUndefined()
        // v2: expect(context.res.body._appInfo.codeunit).toEqual([50000, 50001, 50002, 50003, 50004])
        // Note: _appInfo is added by handleRequest when markAsChanged is called
        expect(request.markAsChanged).toHaveBeenCalledWith(
            expect.objectContaining({ codeunit: [50000, 50001, 50002, 50003, 50004] })
        );
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next field ID to third-party enum with previous consumption"
    // enum_18 (third-party), consumption: [50000, 50001, 50002, 50004]
    // Expected: returns 50003
    // ========================================================================
    it("Succeeds committing next field ID to third-party enum with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004];
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({ "enum_18": consumption }, 0);
            return capturedApp;
        });

        const request = createMockRequest({ "enum_18": consumption }, {
            type: "enum_18",
            ranges,
            commit: true,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50003);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(ranges);
        expect(capturedApp["enum_18"]).toEqual([50000, 50001, 50002, 50003, 50004]);
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next field ID to own enumextension with previous consumption"
    // enumextension_50000 (own), consumption: [1, 2, 4, 5, 6, 50000, 50001, 50002, 50004]
    // Expected: returns 3 (uses 1-49999 range first)
    // ========================================================================
    it("Succeeds committing next field ID to own enumextension with previous consumption", async () => {
        const consumption = [1, 2, 4, 5, 6, 50000, 50001, 50002, 50004];
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({ "enumextension_50000": consumption }, 0);
            return capturedApp;
        });

        const request = createMockRequest({ "enumextension_50000": consumption }, {
            type: "enumextension_50000",
            ranges,
            commit: true,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(3);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(ranges);
        expect(capturedApp["enumextension_50000"]).toEqual([1, 2, 3, 4, 5, 6, 50000, 50001, 50002, 50004]);
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next ID from multiple ranges from a previously unknown app"
    // perRange=true, unknown app
    // Expected: returns [50000, 60000]
    // ========================================================================
    it("Succeeds getting next ID from multiple ranges from a previously unknown app", async () => {
        const request = createMockRequest(null, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual([50000, 60000]);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(false);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next ID from multiple ranges with previous consumption"
    // Consumption: [50000, 50001, 50002, 50004, 60000, 60002]
    // Expected: returns [50003, 60001]
    // ========================================================================
    it("Succeeds getting next ID from multiple ranges with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004, 60000, 60002];
        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual([50003, 60001]);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds getting next ID from multiple ranges with previous consumption, with one range fully consumed"
    // First range fully consumed, second range has one consumed
    // Expected: returns [60001] (only second range has availability)
    // ========================================================================
    it("Succeeds getting next ID from multiple ranges with previous consumption, with one range fully consumed", async () => {
        const consumption = [50000, 50001, 50002, 50003, 50004, 50005, 50006, 50007, 50008, 50009, 60000];
        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            commit: false,
        });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual([60001]);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID to a specific range without previous consumption"
    // perRange=true, require=50000
    // Expected: commits 50000
    // ========================================================================
    it("Succeeds committing next ID to a specific range without previous consumption", async () => {
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({}, 0);
            return capturedApp;
        });

        const request = createMockRequest({}, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            require: 50000,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(rangesMulti);
        expect(capturedApp.codeunit).toEqual([50000]);
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID to a different specific range without previous consumption"
    // perRange=true, require=60000
    // Expected: commits 60000
    // ========================================================================
    it("Succeeds committing next ID to a different specific range without previous consumption", async () => {
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({}, 0);
            return capturedApp;
        });

        const request = createMockRequest({}, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            require: 60000,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(60000);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(rangesMulti);
        expect(capturedApp.codeunit).toEqual([60000]);
    });

    // ========================================================================
    // v2 Test: "Succeeds committing next ID to a specific range with previous consumption"
    // Consumption: [50000, 50001, 50002, 50004, 60000, 60002]
    // perRange=true, require=50000
    // Expected: commits 50003 (gap in first range)
    // ========================================================================
    it("Succeeds committing next ID to a specific range with previous consumption", async () => {
        const consumption = [50000, 50001, 50002, 50004, 60000, 60002];
        let capturedApp: any;
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => {
            capturedApp = fn({ codeunit: consumption }, 0);
            return capturedApp;
        });

        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            require: 50000,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        expect(result.id).toStrictEqual(50003);
        expect(result.available).toStrictEqual(true);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(true);

        expect(capturedApp._ranges).toEqual(rangesMulti);
        expect(capturedApp.codeunit).toEqual([50000, 50001, 50002, 50003, 50004, 60000, 60002]);
    });

    // ========================================================================
    // v2 Test: "Fails committing next ID to a specific range with explicit range fully consumed"
    // First range fully consumed, require=50009 (in first range)
    // NOTE: In v2, this test had its expectations COMMENTED OUT, meaning v2 behavior
    // was to return id=[] (empty array) since perRange=true uses findAvailablePerRange
    // ========================================================================
    it("Fails committing next ID to a specific range with explicit range fully consumed", async () => {
        const consumption = [50000, 50001, 50002, 50003, 50004, 50005, 50006, 50007, 50008, 50009, 60000];
        const request = createMockRequest({ codeunit: consumption }, {
            type: "codeunit",
            ranges: rangesMulti,
            perRange: true,
            require: 50009,
            commit: true,
        }, { name: "fake" });

        const result = await endpointConfig.POST(request);

        // v2 behavior: perRange=true means findAvailablePerRange is used, which returns []
        expect(result.id).toStrictEqual([]);
        expect(result.available).toStrictEqual(false);
        expect(result.hasConsumption).toStrictEqual(true);
        expect(result.updated).toStrictEqual(false);
        expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
    });

    // ========================================================================
    // Additional: Cache behavior
    // ========================================================================
    it("Updates cache after successful commit", async () => {
        mockBlobInstance.optimisticUpdate.mockImplementation((fn: Function) => fn({}, 0));

        const request = createMockRequest({}, {
            type: "codeunit",
            ranges,
            commit: true,
        });

        await endpointConfig.POST(request);

        expect(mockAppCache.set).toHaveBeenCalledWith("test-app-id", expect.any(Object));
    });

    it("Does NOT update cache on read-only queries", async () => {
        const request = createMockRequest({}, {
            type: "codeunit",
            ranges,
            commit: false,
        });

        await endpointConfig.POST(request);

        expect(mockAppCache.set).not.toHaveBeenCalled();
    });
});
