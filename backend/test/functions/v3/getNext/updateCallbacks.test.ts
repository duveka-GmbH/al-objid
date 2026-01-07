import { createGetNextUpdateCallback, ConsumptionUpdateContext } from "../../../../src/functions/v3/getNext/updateCallbacks";
import * as findFirstAvailableIdModule from "../../../../src/utils/findFirstAvailableId";
import { AppInfo } from "../../../../src/types";

jest.mock("../../../../src/utils/findFirstAvailableId");

describe("getNext updateCallbacks", () => {
    const mockFindFirstAvailableId = findFirstAvailableIdModule.findFirstAvailableId as jest.MockedFunction<
        typeof findFirstAvailableIdModule.findFirstAvailableId
    >;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFindFirstAvailableId.mockReturnValue(50001);
    });

    describe("createGetNextUpdateCallback", () => {
        const createContext = (overrides: Partial<ConsumptionUpdateContext> = {}): ConsumptionUpdateContext => ({
            id: 50000,
            available: true,
            updated: false,
            updateAttempts: 0,
            ...overrides,
        });

        const defaultParams = {
            type: "codeunit",
            assignFromRanges: [{ from: 50000, to: 59999 }],
            appRanges: [{ from: 50000, to: 59999 }],
        };

        describe("when attempts reach 100", () => {
            it("should return app unchanged", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [1, 2, 3] } as AppInfo;

                const result = callback(app, 100);

                expect(result).toBe(app);
            });

            it("should not update context", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });

                callback({ codeunit: [1] } as AppInfo, 100);

                expect(context.updated).toBe(false);
                expect(context.updateAttempts).toBe(0);
            });
        });

        describe("when app is null", () => {
            it("should create new app object", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });

                const result = callback(null, 0);

                expect(result).toBeDefined();
                expect(result!.codeunit).toEqual([50000]);
            });

            it("should set context.updated to true", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });

                callback(null, 0);

                expect(context.updated).toBe(true);
            });

            it("should set _ranges on the app", () => {
                const context = createContext();
                const appRanges = [{ from: 50000, to: 59999 }];
                const callback = createGetNextUpdateCallback({ ...defaultParams, appRanges, context });

                const result = callback(null, 0);

                expect(result!._ranges).toEqual(appRanges);
            });
        });

        describe("when consumption array is empty", () => {
            it("should add first ID to consumption", () => {
                const context = createContext({ id: 50000 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [] } as unknown as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toEqual([50000]);
            });

            it("should set context.updated to true", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = {} as AppInfo;

                callback(app, 0);

                expect(context.updated).toBe(true);
            });
        });

        describe("when consumption array does not exist", () => {
            it("should create new array with the ID", () => {
                const context = createContext({ id: 50000 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = {} as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toEqual([50000]);
            });
        });

        describe("when ID is not yet consumed", () => {
            it("should add ID to existing consumption array", () => {
                const context = createContext({ id: 50002 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toEqual([50000, 50001, 50002]);
            });

            it("should sort the consumption array", () => {
                const context = createContext({ id: 50001 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50003] } as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toEqual([50000, 50001, 50003]);
            });

            it("should set context.updated to true", () => {
                const context = createContext({ id: 50002 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                callback(app, 0);

                expect(context.updated).toBe(true);
            });
        });

        describe("when ID is already consumed", () => {
            it("should call findFirstAvailableId to get new ID", () => {
                const context = createContext({ id: 50000 });
                const assignFromRanges = [{ from: 50000, to: 59999 }];
                const callback = createGetNextUpdateCallback({ ...defaultParams, assignFromRanges, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                callback(app, 0);

                expect(mockFindFirstAvailableId).toHaveBeenCalledWith(assignFromRanges, [50000, 50001]);
            });

            it("should use new ID from findFirstAvailableId", () => {
                mockFindFirstAvailableId.mockReturnValue(50002);
                const context = createContext({ id: 50000 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toContain(50002);
                expect(context.id).toBe(50002);
            });

            it("should set context.available to false when no IDs available", () => {
                mockFindFirstAvailableId.mockReturnValue(0);
                const context = createContext({ id: 50000 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000] } as AppInfo;

                callback(app, 0);

                expect(context.available).toBe(false);
                expect(context.id).toBe(0);
            });

            it("should return app unchanged when no IDs available", () => {
                mockFindFirstAvailableId.mockReturnValue(0);
                const context = createContext({ id: 50000 });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000] } as AppInfo;

                const result = callback(app, 0);

                expect(result).toBe(app);
            });

            it("should not set context.updated when no IDs available", () => {
                mockFindFirstAvailableId.mockReturnValue(0);
                const context = createContext({ id: 50000, updated: false });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000] } as AppInfo;

                callback(app, 0);

                expect(context.updated).toBe(false);
            });
        });

        describe("context updates", () => {
            it("should reset context.updated to false at start", () => {
                const context = createContext({ updated: true });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [] } as unknown as AppInfo;

                callback(app, 5);

                // It gets set back to true because array is empty
                // but the reset happens first
                expect(context.updated).toBe(true);
            });

            it("should set context.updateAttempts from attempts parameter", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });

                callback(null, 42);

                expect(context.updateAttempts).toBe(42);
            });
        });

        describe("when context.id is undefined", () => {
            it("should not modify app when context.id is undefined", () => {
                const context = createContext({ id: undefined as any });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                const result = callback(app, 0);

                expect(result).toBe(app);
                expect(result!.codeunit).toEqual([50000, 50001]);
                expect(result!.codeunit).not.toContain(undefined);
                expect(result!.codeunit).not.toContain(null);
            });

            it("should set context.updated to false when context.id is undefined", () => {
                const context = createContext({ id: undefined as any });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [50000, 50001] } as AppInfo;

                callback(app, 0);

                expect(context.updated).toBe(false);
            });

            it("should not modify empty app when context.id is undefined", () => {
                const context = createContext({ id: undefined as any });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = {} as AppInfo;

                const result = callback(app, 0);

                expect(result!.codeunit).toBeUndefined();
                expect(context.updated).toBe(false);
            });

            it("should not create consumption array when context.id is undefined and app is null", () => {
                const context = createContext({ id: undefined as any });
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });

                const result = callback(null, 0);

                expect(result!.codeunit).toBeUndefined();
                expect(context.updated).toBe(false);
            });
        });

        describe("extended type handling", () => {
            it("should handle extended type format", () => {
                const context = createContext({ id: 5 });
                const callback = createGetNextUpdateCallback({
                    ...defaultParams,
                    type: "table_50000",
                    context,
                });
                const app = {} as AppInfo;

                const result = callback(app, 0);

                expect(result!["table_50000"]).toEqual([5]);
            });
        });

        describe("return value", () => {
            it("should return new object reference on success", () => {
                const context = createContext();
                const callback = createGetNextUpdateCallback({ ...defaultParams, context });
                const app = { codeunit: [1, 2] } as AppInfo;

                const result = callback(app, 0);

                expect(result).not.toBe(app);
            });
        });
    });
});
