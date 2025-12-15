import { upgradeInitializeV3 } from "../../src/upgrade/upgradeInitializeV3";
import { AppInfo } from "../../src/types";

describe("upgradeInitializeV3", () => {
    const createMockApp = (overrides: any = {}): AppInfo => {
        return {
            codeunit: [1, 2, 3],
            ...overrides,
        } as AppInfo;
    };

    describe("_log property removal", () => {
        it("should remove _log property when present", async () => {
            const app = createMockApp({ _log: [{ eventType: "test", timestamp: 123, user: "user", data: {} }] });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
        });

        it("should return app unchanged when _log property is not present", async () => {
            const app = createMockApp();

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
            expect(result.codeunit).toEqual([1, 2, 3]);
        });
    });

    describe("property preservation", () => {
        it("should preserve all other properties when removing _log", async () => {
            const app = createMockApp({
                _log: [{ eventType: "test", timestamp: 123, user: "user", data: {} }],
                _authorization: { key: "auth-key" },
                _ranges: [{ from: 50000, to: 50999 }],
                _upgrade: ["tag1", "tag2"],
                page: [1, 2],
                table: [10, 20],
            });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
            expect(result.codeunit).toEqual([1, 2, 3]);
            expect(result._authorization).toEqual({ key: "auth-key" });
            expect(result._ranges).toEqual([{ from: 50000, to: 50999 }]);
            expect(result._upgrade).toEqual(["tag1", "tag2"]);
            expect(result.page).toEqual([1, 2]);
            expect(result.table).toEqual([10, 20]);
        });

        it("should preserve nested objects", async () => {
            const nestedData = {
                level1: {
                    level2: {
                        level3: "deep value",
                    },
                },
            };
            const app = createMockApp({
                _log: [],
                customData: nestedData,
            });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
            expect((result as any).customData).toEqual(nestedData);
        });

        it("should preserve arrays in properties", async () => {
            const app = createMockApp({
                _log: [],
                codeunit: [100, 200, 300],
                page: [1, 2, 3, 4, 5],
            });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result.codeunit).toEqual([100, 200, 300]);
            expect(result.page).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe("idempotency", () => {
        it("should produce same result when run twice on app with _log", async () => {
            const app = createMockApp({ _log: [{ eventType: "test", timestamp: 123, user: "user", data: {} }] });

            const firstResult = await upgradeInitializeV3("test-app-id", app);
            const secondResult = await upgradeInitializeV3("test-app-id", firstResult);

            expect(firstResult).toEqual(secondResult);
            expect(secondResult).not.toHaveProperty("_log");
        });

        it("should produce same result when run twice on app without _log", async () => {
            const app = createMockApp();

            const firstResult = await upgradeInitializeV3("test-app-id", app);
            const secondResult = await upgradeInitializeV3("test-app-id", firstResult);

            expect(firstResult).toEqual(secondResult);
        });

        it("should be safe to run multiple times in sequence", async () => {
            const app = createMockApp({ _log: [{ eventType: "test", timestamp: 123, user: "user", data: {} }] });

            let result = app;
            for (let i = 0; i < 5; i++) {
                result = await upgradeInitializeV3("test-app-id", result);
            }

            expect(result).not.toHaveProperty("_log");
            expect(result.codeunit).toEqual([1, 2, 3]);
        });
    });

    describe("appId parameter handling", () => {
        it("should accept appId parameter without error", async () => {
            const app = createMockApp();

            await expect(upgradeInitializeV3("test-app-id", app)).resolves.not.toThrow();
        });

        it("should work with different appId values", async () => {
            const app = createMockApp({ _log: [] });

            const result1 = await upgradeInitializeV3("app-1", app);
            const result2 = await upgradeInitializeV3("app-2", app);
            const result3 = await upgradeInitializeV3("", app);

            expect(result1).not.toHaveProperty("_log");
            expect(result2).not.toHaveProperty("_log");
            expect(result3).not.toHaveProperty("_log");
        });
    });

    describe("edge cases", () => {
        it("should handle empty app object", async () => {
            const app = {} as AppInfo;

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).toEqual({});
            expect(result).not.toHaveProperty("_log");
        });

        it("should handle app with only _log property", async () => {
            const app = { _log: [] } as unknown as AppInfo;

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).toEqual({});
            expect(result).not.toHaveProperty("_log");
        });

        it("should handle _log with empty array", async () => {
            const app = createMockApp({ _log: [] });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
        });

        it("should handle _log with undefined value", async () => {
            const app = createMockApp({ _log: undefined });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
        });

        it("should handle _log with null value", async () => {
            const app = createMockApp({ _log: null });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
        });

        it("should handle _log with complex log entries", async () => {
            const complexLog = [
                { eventType: "create", timestamp: 1000, user: "user1", data: { id: 1 } },
                { eventType: "update", timestamp: 2000, user: "user2", data: { id: 2, nested: { value: "test" } } },
                { eventType: "delete", timestamp: 3000, user: "user3", data: null },
            ];
            const app = createMockApp({ _log: complexLog });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toHaveProperty("_log");
            expect(result.codeunit).toEqual([1, 2, 3]);
        });
    });

    describe("return type", () => {
        it("should return a Promise that resolves to AppInfo", async () => {
            const app = createMockApp();

            const result = upgradeInitializeV3("test-app-id", app);

            expect(result).toBeInstanceOf(Promise);
            const resolved = await result;
            expect(typeof resolved).toBe("object");
        });

        it("should return a new object, not mutate the original", async () => {
            const app = createMockApp({ _log: [] });

            const result = await upgradeInitializeV3("test-app-id", app);

            expect(result).not.toBe(app);
            expect(app).toHaveProperty("_log");
        });
    });
});
