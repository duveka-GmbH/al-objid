import { Blob } from "@vjeko.com/azure-blob";
import { AppCache } from "../../src/cache/AppCache";
import { AppInfo, LogEntry } from "../../src/types";

jest.mock("@vjeko.com/azure-blob");

describe("AppCache", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    let mockBlobInstance: { read: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        AppCache.clear();

        mockBlobInstance = {
            read: jest.fn().mockResolvedValue([]),
        };
        MockBlob.mockImplementation(() => mockBlobInstance as any);
    });

    describe("get", () => {
        it("should return undefined for non-existent key", () => {
            const result = AppCache.get("non-existent-app");

            expect(result).toBeUndefined();
        });

        it("should return stored value after set", () => {
            const appId = "test-app-id";
            const appInfo: AppInfo = {
                codeunit: [1, 2, 3],
                table: [50000, 50001],
            };

            AppCache.set(appId, appInfo);
            const result = AppCache.get(appId);

            expect(result).toEqual(appInfo);
        });

        it("should return the exact same object reference", () => {
            const appId = "test-app-id";
            const appInfo: AppInfo = { codeunit: [1] };

            AppCache.set(appId, appInfo);
            const result = AppCache.get(appId);

            expect(result).toBe(appInfo);
        });
    });

    describe("set", () => {
        it("should store app info that can be retrieved", () => {
            const appId = "my-app";
            const appInfo: AppInfo = { page: [100, 200] };

            AppCache.set(appId, appInfo);

            expect(AppCache.get(appId)).toEqual(appInfo);
        });

        it("should overwrite existing value for same key", () => {
            const appId = "my-app";
            const originalApp: AppInfo = { codeunit: [1] };
            const updatedApp: AppInfo = { codeunit: [1, 2, 3] };

            AppCache.set(appId, originalApp);
            AppCache.set(appId, updatedApp);
            const result = AppCache.get(appId);

            expect(result).toEqual(updatedApp);
        });
    });

    describe("has", () => {
        it("should return false for non-existent key", () => {
            const result = AppCache.has("non-existent-app");

            expect(result).toBe(false);
        });

        it("should return true after set", () => {
            const appId = "test-app-id";
            const appInfo: AppInfo = { codeunit: [1] };

            AppCache.set(appId, appInfo);
            const result = AppCache.has(appId);

            expect(result).toBe(true);
        });
    });

    describe("clear", () => {
        it("should remove all entries", () => {
            AppCache.set("app-1", { codeunit: [1] });
            AppCache.set("app-2", { table: [50000] });
            AppCache.set("app-3", { page: [100] });

            AppCache.clear();

            expect(AppCache.has("app-1")).toBe(false);
            expect(AppCache.has("app-2")).toBe(false);
            expect(AppCache.has("app-3")).toBe(false);
        });

        it("should allow new entries after clear", () => {
            AppCache.set("app-1", { codeunit: [1] });
            AppCache.clear();

            const newApp: AppInfo = { table: [50000] };
            AppCache.set("app-1", newApp);

            expect(AppCache.get("app-1")).toEqual(newApp);
        });
    });

    describe("multiple apps", () => {
        it("should cache multiple apps independently", () => {
            const app1: AppInfo = { codeunit: [1, 2] };
            const app2: AppInfo = { table: [50000, 50001] };
            const app3: AppInfo = { page: [100], report: [200] };

            AppCache.set("app-1", app1);
            AppCache.set("app-2", app2);
            AppCache.set("app-3", app3);

            expect(AppCache.get("app-1")).toEqual(app1);
            expect(AppCache.get("app-2")).toEqual(app2);
            expect(AppCache.get("app-3")).toEqual(app3);
        });

        it("should update one app without affecting others", () => {
            const app1: AppInfo = { codeunit: [1] };
            const app2: AppInfo = { table: [50000] };

            AppCache.set("app-1", app1);
            AppCache.set("app-2", app2);

            const updatedApp1: AppInfo = { codeunit: [1, 2, 3] };
            AppCache.set("app-1", updatedApp1);

            expect(AppCache.get("app-1")).toEqual(updatedApp1);
            expect(AppCache.get("app-2")).toEqual(app2);
        });
    });

    describe("edge cases", () => {
        it("should handle empty AppInfo object", () => {
            const appId = "empty-app";
            const appInfo: AppInfo = {};

            AppCache.set(appId, appInfo);

            expect(AppCache.get(appId)).toEqual({});
            expect(AppCache.has(appId)).toBe(true);
        });

        it("should handle AppInfo with authorization data", () => {
            const appId = "authorized-app";
            const appInfo = {
                codeunit: [1],
                _authorization: {
                    key: "auth-key-123",
                    user: {
                        name: "Test User",
                        email: "test@example.com",
                        timestamp: 1234567890,
                    },
                },
            } as AppInfo;

            AppCache.set(appId, appInfo);

            expect(AppCache.get(appId)).toEqual(appInfo);
        });

        it("should handle AppInfo with ranges", () => {
            const appId = "ranged-app";
            const appInfo = {
                codeunit: [50000],
                _ranges: [
                    { from: 50000, to: 50999 },
                    { from: 60000, to: 60999 },
                ],
            } as AppInfo;

            AppCache.set(appId, appInfo);

            expect(AppCache.get(appId)).toEqual(appInfo);
        });
    });

    describe("getLogs", () => {
        it("should read from blob when not cached", async () => {
            const blobLogs = [
                { eventType: "fromBlob", timestamp: 1234567890, user: "blob-user", data: null },
            ];
            mockBlobInstance.read.mockResolvedValue(blobLogs);

            const result = await AppCache.getLogs("uncached-app");

            expect(MockBlob).toHaveBeenCalledWith("logs://uncached-app_log.json");
            expect(result).toEqual(blobLogs);
        });

        it("should return cached logs without reading blob", async () => {
            const appId = "test-app";
            const logs: LogEntry[] = [
                { eventType: "syncFull", timestamp: 1234567890, user: "test-user", data: null },
            ];

            AppCache.setLogs(appId, logs);
            const result = await AppCache.getLogs(appId);

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(logs);
        });

        it("should cache logs after reading from blob", async () => {
            const blobLogs = [
                { eventType: "fromBlob", timestamp: 1000, user: "u", data: null },
            ];
            mockBlobInstance.read.mockResolvedValue(blobLogs);

            // First call reads from blob
            await AppCache.getLogs("test-app");

            // Reset mock to verify second call doesn't read blob
            mockBlobInstance.read.mockClear();

            // Second call should use cache
            const result = await AppCache.getLogs("test-app");

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(blobLogs);
        });

        it("should return empty array when blob has no logs", async () => {
            mockBlobInstance.read.mockResolvedValue(null);

            const result = await AppCache.getLogs("empty-app");

            expect(result).toEqual([]);
        });
    });

    describe("setLogs", () => {
        it("should store logs that can be retrieved", async () => {
            const appId = "my-app";
            const logs: LogEntry[] = [
                { eventType: "getNext", timestamp: Date.now(), user: "user1", data: { id: 1 } },
            ];

            AppCache.setLogs(appId, logs);

            expect(await AppCache.getLogs(appId)).toEqual(logs);
        });

        it("should overwrite existing logs for same key", async () => {
            const appId = "my-app";
            const originalLogs: LogEntry[] = [
                { eventType: "old", timestamp: 1000, user: "u", data: null },
            ];
            const updatedLogs: LogEntry[] = [
                { eventType: "new", timestamp: 2000, user: "u", data: null },
            ];

            AppCache.setLogs(appId, originalLogs);
            AppCache.setLogs(appId, updatedLogs);
            const result = await AppCache.getLogs(appId);

            expect(result).toEqual(updatedLogs);
        });

        it("should store empty array", async () => {
            const appId = "empty-logs-app";
            const logs: LogEntry[] = [];

            AppCache.setLogs(appId, logs);

            expect(await AppCache.getLogs(appId)).toEqual([]);
        });
    });

    describe("clear with logs", () => {
        it("should clear both app cache and log cache", async () => {
            AppCache.set("app-1", { codeunit: [1] });
            AppCache.setLogs("app-1", [{ eventType: "test", timestamp: 1000, user: "u", data: null }]);

            AppCache.clear();

            expect(AppCache.get("app-1")).toBeUndefined();
            // After clear, getLogs will read from blob (which returns empty)
            mockBlobInstance.read.mockResolvedValue(null);
            const logs = await AppCache.getLogs("app-1");
            expect(logs).toEqual([]);
        });
    });

    describe("logs isolation", () => {
        it("should cache logs for multiple apps independently", async () => {
            const logs1: LogEntry[] = [{ eventType: "log1", timestamp: 1000, user: "u1", data: null }];
            const logs2: LogEntry[] = [{ eventType: "log2", timestamp: 2000, user: "u2", data: null }];

            AppCache.setLogs("app-1", logs1);
            AppCache.setLogs("app-2", logs2);

            expect(await AppCache.getLogs("app-1")).toEqual(logs1);
            expect(await AppCache.getLogs("app-2")).toEqual(logs2);
        });

        it("should keep app cache and log cache separate", async () => {
            const appInfo: AppInfo = { codeunit: [1] };
            const logs: LogEntry[] = [{ eventType: "test", timestamp: 1000, user: "u", data: null }];

            AppCache.set("app-1", appInfo);
            AppCache.setLogs("app-1", logs);

            // App cache should have app info
            expect(AppCache.get("app-1")).toEqual(appInfo);
            // Log cache should have logs
            expect(await AppCache.getLogs("app-1")).toEqual(logs);
        });
    });
});

