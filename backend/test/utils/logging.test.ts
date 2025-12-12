import { Blob } from "@vjeko.com/azure-blob";
import { logAppEvent } from "../../src/utils/logging";
import { AppCache } from "../../src/cache";
import { UserInfo } from "../../src/http";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/cache");

describe("logging", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    const mockAppCache = AppCache as jest.Mocked<typeof AppCache>;

    let mockBlobInstance: {
        read: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockBlobInstance = {
            read: jest.fn(),
            optimisticUpdate: jest.fn().mockResolvedValue([]),
        };

        MockBlob.mockImplementation(() => mockBlobInstance as any);

        jest.spyOn(Date, "now").mockReturnValue(1234567890);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("logAppEvent", () => {
        describe("skipping logs when user is not provided", () => {
            it("should not create blob when user is undefined", async () => {
                await logAppEvent("app-123", "authorize", undefined);

                expect(MockBlob).not.toHaveBeenCalled();
                expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
            });

            it("should not create blob when user has no name or email", async () => {
                await logAppEvent("app-123", "authorize", {});

                expect(MockBlob).not.toHaveBeenCalled();
                expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
            });
        });

        describe("blob path construction", () => {
            it("should create blob with correct path for app ID", async () => {
                await logAppEvent("my-app-id", "authorize", { name: "Test User" });

                expect(MockBlob).toHaveBeenCalledWith("logs://my-app-id_log.json");
            });

            it("should create blob with correct path for UUID app ID", async () => {
                await logAppEvent("550e8400-e29b-41d4-a716-446655440000", "getNext", { email: "test@example.com" });

                expect(MockBlob).toHaveBeenCalledWith("logs://550e8400-e29b-41d4-a716-446655440000_log.json");
            });

            it("should create blob with correct path for numeric app ID", async () => {
                await logAppEvent("12345", "syncMerge", { name: "User", email: "user@test.com" });

                expect(MockBlob).toHaveBeenCalledWith("logs://12345_log.json");
            });
        });

        describe("log entry creation", () => {
            it("should call optimisticUpdate on blob", async () => {
                await logAppEvent("app-123", "authorize", { name: "Test User" });

                expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
            });

            it("should pass empty array as default value to optimisticUpdate", async () => {
                await logAppEvent("app-123", "authorize", { name: "Test User" });

                expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledWith(
                    expect.any(Function),
                    []
                );
            });

            it("should create log entry with timestamp from Date.now()", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                const result = capturedCallback!([]);
                expect(result[0].timestamp).toBe(1234567890);
            });

            it("should create log entry with correct eventType", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "getNext", { name: "Test User" });

                const result = capturedCallback!([]);
                expect(result[0].eventType).toBe("getNext");
            });

            it("should format user as 'name (email)' when both present", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "John Doe", email: "john@example.com" });

                const result = capturedCallback!([]);
                expect(result[0].user).toBe("John Doe (john@example.com)");
            });

            it("should format user as just name when only name present", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "John Doe" });

                const result = capturedCallback!([]);
                expect(result[0].user).toBe("John Doe");
            });

            it("should format user as just email when only email present", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { email: "john@example.com" });

                const result = capturedCallback!([]);
                expect(result[0].user).toBe("john@example.com");
            });

            it("should create log entry with data when provided", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "getNext", { name: "Test User" }, { type: "codeunit", id: 50000 });

                const result = capturedCallback!([]);
                expect(result[0].data).toEqual({ type: "codeunit", id: 50000 });
            });

            it("should create log entry without data when not provided", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                const result = capturedCallback!([]);
                expect(result[0].data).toBeUndefined();
            });
        });

        describe("log append behavior", () => {
            it("should append to empty log array", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                const result = capturedCallback!([]);
                expect(result).toHaveLength(1);
            });

            it("should append to existing log entries", async () => {
                const existingLogs = [
                    { timestamp: 1000000000, eventType: "oldEvent", user: "old-user" },
                    { timestamp: 1100000000, eventType: "anotherEvent", user: "another-user" },
                ];

                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback(existingLogs));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                const result = capturedCallback!(existingLogs);
                expect(result).toHaveLength(3);
                expect(result[0]).toEqual(existingLogs[0]);
                expect(result[1]).toEqual(existingLogs[1]);
                expect(result[2].eventType).toBe("authorize");
            });

            it("should handle null existing logs (blob doesn't exist)", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback(null));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                const result = capturedCallback!(null);
                expect(result).toHaveLength(1);
                expect(result[0].eventType).toBe("authorize");
            });

            it("should not mutate existing logs array", async () => {
                const existingLogs = [
                    { timestamp: 1000000000, eventType: "oldEvent", user: "old-user" },
                ];
                const originalLength = existingLogs.length;

                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback(existingLogs));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                capturedCallback!(existingLogs);
                expect(existingLogs).toHaveLength(originalLength);
            });
        });

        describe("different event types", () => {
            const eventTypes = [
                "authorize",
                "deauthorize",
                "getNext",
                "syncFull",
                "syncMerge",
                "addAssignment",
                "removeAssignment",
            ];

            eventTypes.forEach((eventType) => {
                it(`should log ${eventType} event correctly`, async () => {
                    let capturedCallback: Function;
                    mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                        capturedCallback = callback;
                        return Promise.resolve(callback([]));
                    });

                    await logAppEvent("app-123", eventType, { name: "Test User" });

                    const result = capturedCallback!([]);
                    expect(result[0].eventType).toBe(eventType);
                });
            });
        });

        describe("data variations", () => {
            it("should handle complex nested data objects", async () => {
                const complexData = {
                    type: "codeunit",
                    id: 50000,
                    nested: {
                        array: [1, 2, 3],
                        object: { key: "value" },
                    },
                };

                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "getNext", { name: "Test User" }, complexData);

                const result = capturedCallback!([]);
                expect(result[0].data).toEqual(complexData);
            });

            it("should handle array data", async () => {
                const arrayData = [1, 2, 3, 4, 5];

                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "syncFull", { name: "Test User" }, arrayData);

                const result = capturedCallback!([]);
                expect(result[0].data).toEqual(arrayData);
            });

            it("should handle string data", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "authorize", { name: "Test User" }, "simple string data");

                const result = capturedCallback!([]);
                expect(result[0].data).toBe("simple string data");
            });

            it("should handle numeric data", async () => {
                let capturedCallback: Function;
                mockBlobInstance.optimisticUpdate.mockImplementation((callback: Function) => {
                    capturedCallback = callback;
                    return Promise.resolve(callback([]));
                });

                await logAppEvent("app-123", "getNext", { name: "Test User" }, 50000);

                const result = capturedCallback!([]);
                expect(result[0].data).toBe(50000);
            });
        });

        describe("cache write-through", () => {
            it("should set cache with complete logs from blob write", async () => {
                const updatedLogs = [
                    { timestamp: 1234567890, eventType: "authorize", user: "Test User", data: undefined },
                ];
                mockBlobInstance.optimisticUpdate.mockResolvedValue(updatedLogs);

                await logAppEvent("app-123", "authorize", { name: "Test User" });

                expect(mockAppCache.setLogs).toHaveBeenCalledWith("app-123", updatedLogs);
            });

            it("should set cache with complete logs including data", async () => {
                const updatedLogs = [
                    { timestamp: 1234567890, eventType: "getNext", user: "Test User", data: { id: 50000 } },
                ];
                mockBlobInstance.optimisticUpdate.mockResolvedValue(updatedLogs);

                await logAppEvent("app-123", "getNext", { name: "Test User" }, { id: 50000 });

                expect(mockAppCache.setLogs).toHaveBeenCalledWith("app-123", updatedLogs);
            });

            it("should not update cache when user is undefined", async () => {
                await logAppEvent("app-123", "authorize", undefined);

                expect(mockAppCache.setLogs).not.toHaveBeenCalled();
            });

            it("should not update cache when user has no name or email", async () => {
                await logAppEvent("app-123", "authorize", {});

                expect(mockAppCache.setLogs).not.toHaveBeenCalled();
            });

            it("should update cache with correct appId", async () => {
                const updatedLogs = [{ timestamp: 1234567890, eventType: "syncFull", user: "Test User", data: undefined }];
                mockBlobInstance.optimisticUpdate.mockResolvedValue(updatedLogs);

                await logAppEvent("different-app-id", "syncFull", { name: "Test User" });

                expect(mockAppCache.setLogs).toHaveBeenCalledWith("different-app-id", updatedLogs);
            });
        });
    });
});
