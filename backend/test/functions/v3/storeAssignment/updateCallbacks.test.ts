import {
    createAddAssignmentUpdateCallback,
    createRemoveAssignmentUpdateCallback,
} from "../../../../src/functions/v3/storeAssignment/updateCallbacks";
import { AppInfo } from "../../../../src/types";

describe("storeAssignment updateCallbacks", () => {
    describe("createAddAssignmentUpdateCallback", () => {
        describe("when app is null", () => {
            it("should create new app object with the ID", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);

                const app = callback(null);

                expect(app.codeunit).toEqual([50000]);
            });

            it("should keep result.success as true", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);

                callback(null);

                expect(result.success).toBe(true);
            });
        });

        describe("when type does not exist in app", () => {
            it("should create new consumption array with the ID", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = { table: [100] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([50000]);
                expect(updated.table).toEqual([100]);
            });
        });

        describe("when ID does not exist in consumption", () => {
            it("should add ID to existing consumption array", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50001 }, result);
                const app = { codeunit: [50000, 50002] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toContain(50001);
            });

            it("should sort consumption array after adding", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50001 }, result);
                const app = { codeunit: [50000, 50003] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([50000, 50001, 50003]);
            });

            it("should keep result.success as true", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50001 }, result);
                const app = { codeunit: [50000] } as AppInfo;

                callback(app);

                expect(result.success).toBe(true);
            });

            it("should return new object reference", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50001 }, result);
                const app = { codeunit: [50000] } as AppInfo;

                const updated = callback(app);

                expect(updated).not.toBe(app);
            });
        });

        describe("when ID already exists in consumption", () => {
            it("should not add duplicate ID", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = { codeunit: [50000, 50001] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([50000, 50001]);
            });

            it("should set result.success to false", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = { codeunit: [50000] } as AppInfo;

                callback(app);

                expect(result.success).toBe(false);
            });

            it("should return same app reference", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = { codeunit: [50000] } as AppInfo;

                const updated = callback(app);

                expect(updated).toBe(app);
            });
        });

        describe("extended type handling", () => {
            it("should handle extended type format", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "table_50000", id: 5 }, result);
                const app = {} as AppInfo;

                const updated = callback(app);

                expect(updated["table_50000"]).toEqual([5]);
            });
        });

        describe("preserving other data", () => {
            it("should preserve existing consumptions of other types", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = { table: [100, 200], page: [50] } as AppInfo;

                const updated = callback(app);

                expect(updated.table).toEqual([100, 200]);
                expect(updated.page).toEqual([50]);
            });

            it("should preserve internal properties", () => {
                const result = { success: true };
                const callback = createAddAssignmentUpdateCallback({ type: "codeunit", id: 50000 }, result);
                const app = {
                    _authorization: { key: "key" },
                    _ranges: [{ from: 50000, to: 59999 }],
                } as AppInfo;

                const updated = callback(app);

                expect(updated._authorization).toEqual({ key: "key" });
                expect(updated._ranges).toEqual([{ from: 50000, to: 59999 }]);
            });
        });
    });

    describe("createRemoveAssignmentUpdateCallback", () => {
        describe("when app is null", () => {
            it("should return empty app object", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });

                const app = callback(null);

                expect(app).toEqual({});
            });
        });

        describe("when type does not exist in app", () => {
            it("should return app unchanged", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });
                const app = { table: [100] } as AppInfo;

                const updated = callback(app);

                expect(updated).toBe(app);
            });
        });

        describe("when ID does not exist in consumption", () => {
            it("should return app unchanged", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });
                const app = { codeunit: [50001, 50002] } as AppInfo;

                const updated = callback(app);

                expect(updated).toBe(app);
            });
        });

        describe("when ID exists in consumption", () => {
            it("should remove ID from consumption array", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50001 });
                const app = { codeunit: [50000, 50001, 50002] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([50000, 50002]);
            });

            it("should preserve other IDs in the array", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50001 });
                const app = { codeunit: [50000, 50001, 50002, 50003] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([50000, 50002, 50003]);
            });

            it("should return empty array when removing last ID", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });
                const app = { codeunit: [50000] } as AppInfo;

                const updated = callback(app);

                expect(updated.codeunit).toEqual([]);
            });
        });

        describe("extended type handling", () => {
            it("should handle extended type format", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "table_50000", id: 5 });
                const app = { "table_50000": [5, 10, 15] } as unknown as AppInfo;

                const updated = callback(app);

                expect(updated["table_50000"]).toEqual([10, 15]);
            });
        });

        describe("preserving other data", () => {
            it("should preserve existing consumptions of other types", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });
                const app = { codeunit: [50000], table: [100, 200] } as AppInfo;

                const updated = callback(app);

                expect(updated.table).toEqual([100, 200]);
            });

            it("should preserve internal properties", () => {
                const callback = createRemoveAssignmentUpdateCallback({ type: "codeunit", id: 50000 });
                const app = {
                    codeunit: [50000],
                    _authorization: { key: "key" },
                } as AppInfo;

                const updated = callback(app);

                expect(updated._authorization).toEqual({ key: "key" });
            });
        });
    });
});
