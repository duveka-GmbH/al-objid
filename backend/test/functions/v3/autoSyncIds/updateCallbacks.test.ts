import { createSyncConsumptionsUpdateCallback } from "../../../../src/functions/v3/autoSyncIds/updateCallbacks";
import { AppInfo } from "../../../../src/types";

describe("autoSyncIds updateCallbacks", () => {
    describe("createSyncConsumptionsUpdateCallback", () => {
        describe("full sync (patch: false)", () => {
            it("should replace all consumptions with new ones", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [5, 6, 7] },
                    patch: false,
                });
                const app = {
                    codeunit: [1, 2, 3],
                    table: [100, 200],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([5, 6, 7]);
                expect(result.table).toBeUndefined();
            });

            it("should handle null app by creating new app object", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [1, 2, 3] },
                    patch: false,
                });

                const result = callback(null);

                expect(result.codeunit).toEqual([1, 2, 3]);
            });

            it("should preserve _authorization during full sync", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [1, 2, 3] },
                    patch: false,
                });
                const app = {
                    _authorization: { key: "test-key" },
                    codeunit: [10, 20, 30],
                } as AppInfo;

                const result = callback(app);

                expect(result._authorization).toEqual({ key: "test-key" });
                expect(result.codeunit).toEqual([1, 2, 3]);
            });

            it("should preserve _ranges during full sync", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [1, 2, 3] },
                    patch: false,
                });
                const app = {
                    _ranges: [{ from: 50000, to: 59999 }],
                    codeunit: [10, 20, 30],
                } as AppInfo;

                const result = callback(app);

                expect(result._ranges).toEqual([{ from: 50000, to: 59999 }]);
            });


            it("should sort consumptions in ascending order", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [5, 1, 3, 2, 4] },
                    patch: false,
                });

                const result = callback(null);

                expect(result.codeunit).toEqual([1, 2, 3, 4, 5]);
            });

            it("should handle multiple object types", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: {
                        codeunit: [1, 2],
                        table: [100, 200],
                        page: [50],
                    },
                    patch: false,
                });

                const result = callback(null);

                expect(result.codeunit).toEqual([1, 2]);
                expect(result.table).toEqual([100, 200]);
                expect(result.page).toEqual([50]);
            });

            it("should handle extended type format", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { table_50000: [1, 2, 3] },
                    patch: false,
                });

                const result = callback(null);

                expect(result["table_50000"]).toEqual([1, 2, 3]);
            });
        });

        describe("merge sync (patch: true)", () => {
            it("should merge with existing consumptions", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [4, 5] },
                    patch: true,
                });
                const app = {
                    codeunit: [1, 2, 3],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([1, 2, 3, 4, 5]);
            });

            it("should deduplicate when merging", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [2, 3, 4] },
                    patch: true,
                });
                const app = {
                    codeunit: [1, 2, 3],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([1, 2, 3, 4]);
            });

            it("should preserve existing types not in request", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [4] },
                    patch: true,
                });
                const app = {
                    codeunit: [1, 2, 3],
                    table: [100, 200],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([1, 2, 3, 4]);
                expect(result.table).toEqual([100, 200]);
            });

            it("should add new object types", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { table: [100, 200] },
                    patch: true,
                });
                const app = {
                    codeunit: [1, 2, 3],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([1, 2, 3]);
                expect(result.table).toEqual([100, 200]);
            });

            it("should sort merged consumptions", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [1, 5] },
                    patch: true,
                });
                const app = {
                    codeunit: [3, 4],
                } as AppInfo;

                const result = callback(app);

                expect(result.codeunit).toEqual([1, 3, 4, 5]);
            });

            it("should handle null app in patch mode", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [1, 2, 3] },
                    patch: true,
                });

                const result = callback(null);

                expect(result.codeunit).toEqual([1, 2, 3]);
            });

            it("should preserve internal properties during merge", () => {
                const callback = createSyncConsumptionsUpdateCallback({
                    objectIds: { codeunit: [4, 5] },
                    patch: true,
                });
                const app = {
                    _authorization: { key: "key" },
                    _ranges: [{ from: 1, to: 100 }],
                    codeunit: [1, 2, 3],
                } as AppInfo;

                const result = callback(app);

                expect(result._authorization).toEqual({ key: "key" });
                expect(result._ranges).toEqual([{ from: 1, to: 100 }]);
            });
        });
    });
});
