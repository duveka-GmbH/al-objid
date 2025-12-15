import { Blob } from "@vjeko.com/azure-blob";
import { UnknownUserLogger, UnknownUsersLog } from "../../src/permission/UnknownUserLogger";

jest.mock("@vjeko.com/azure-blob");

describe("UnknownUserLogger", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    let mockBlobInstance: {
        optimisticUpdate: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBlobInstance = {
            optimisticUpdate: jest.fn().mockImplementation(async (updateFn: Function, defaultValue: any) => {
                // Simulate what optimisticUpdate does - apply the function and return result
                const result = updateFn(defaultValue);
                return result;
            }),
        };
        MockBlob.mockImplementation(() => mockBlobInstance as any);
    });

    describe("logAttempt", () => {
        it("should append entry to empty log and return first seen timestamp", async () => {
            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                email: "user@example.com",
                appId: "app-123",
            });
            expect(result[0].timestamp).toBeGreaterThan(0);
            
            // First seen timestamp should be the entry timestamp (first time user seen)
            expect(firstSeenTimestamp).toBe(result[0].timestamp);
        });

        it("should append entry to existing log", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 1000, email: "old@example.com", appId: "old-app" }
            ];

            await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn(existing);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(existing[0]);
            expect(result[1]).toMatchObject({
                email: "user@example.com",
                appId: "app-123",
            });
        });

        it("should normalize email to lowercase", async () => {
            await UnknownUserLogger.logAttempt("app-123", "User@EXAMPLE.COM", "org-abc");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result[0].email).toBe("user@example.com");
        });

        it("should use correct blob path format", async () => {
            await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");

            expect(MockBlob).toHaveBeenCalledWith("logs://org-abc_unknown.json");
        });

        it("should set timestamp", async () => {
            const beforeTime = Date.now();
            await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");
            const afterTime = Date.now();

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(result[0].timestamp).toBeLessThanOrEqual(afterTime);
        });

        it("should use default empty array for new blob", async () => {
            await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");

            const defaultValue = mockBlobInstance.optimisticUpdate.mock.calls[0][1];
            expect(defaultValue).toEqual([]);
        });

        it("should allow duplicate entries for same user and app", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 1000, email: "user@example.com", appId: "app-123" }
            ];

            await UnknownUserLogger.logAttempt("app-123", "user@example.com", "org-abc");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn(existing);

            // Should have both entries (no deduplication)
            expect(result).toHaveLength(2);
            expect(result[0].email).toBe("user@example.com");
            expect(result[1].email).toBe("user@example.com");
        });

        it("should preserve existing entries when appending", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 1000, email: "user1@example.com", appId: "app-1" },
                { timestamp: 2000, email: "user2@example.com", appId: "app-2" },
                { timestamp: 3000, email: "user3@example.com", appId: "app-3" }
            ];

            await UnknownUserLogger.logAttempt("app-4", "user4@example.com", "org-abc");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn(existing);

            expect(result).toHaveLength(4);
            expect(result[0]).toEqual(existing[0]);
            expect(result[1]).toEqual(existing[1]);
            expect(result[2]).toEqual(existing[2]);
            expect(result[3]).toMatchObject({
                email: "user4@example.com",
                appId: "app-4",
            });
        });

        it("should return earliest timestamp when user has multiple entries", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 5000, email: "user@example.com", appId: "app-1" },
                { timestamp: 3000, email: "user@example.com", appId: "app-2" },
                { timestamp: 7000, email: "other@example.com", appId: "app-3" }
            ];

            // Mock optimisticUpdate to return the log with new entry appended
            mockBlobInstance.optimisticUpdate.mockImplementation(async (updateFn: Function) => {
                const result = updateFn(existing);
                return result;
            });

            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-4", "user@example.com", "org-abc");

            // Should return 3000 (earliest timestamp for user@example.com)
            expect(firstSeenTimestamp).toBe(3000);
        });

        it("should return just-written timestamp when user first seen in this org", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 1000, email: "other@example.com", appId: "app-1" }
            ];

            // Mock optimisticUpdate to return the log with new entry appended
            mockBlobInstance.optimisticUpdate.mockImplementation(async (updateFn: Function) => {
                const result = updateFn(existing);
                return result;
            });

            const beforeTime = Date.now();
            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-2", "newuser@example.com", "org-abc");
            const afterTime = Date.now();

            // Should return timestamp of the entry just written (between beforeTime and afterTime)
            expect(firstSeenTimestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(firstSeenTimestamp).toBeLessThanOrEqual(afterTime);
        });

        it("should handle same user accessing different apps and return earliest", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 10000, email: "user@example.com", appId: "app-alpha" },
                { timestamp: 5000, email: "user@example.com", appId: "app-beta" },
                { timestamp: 15000, email: "other@example.com", appId: "app-gamma" }
            ];

            mockBlobInstance.optimisticUpdate.mockImplementation(async (updateFn: Function) => {
                const result = updateFn(existing);
                return result;
            });

            // User accessing yet another app
            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-delta", "user@example.com", "org-abc");

            // Should return 5000 (earliest among all entries for user@example.com)
            expect(firstSeenTimestamp).toBe(5000);
        });

        it("should normalize email when finding earliest timestamp", async () => {
            const existing: UnknownUsersLog = [
                { timestamp: 8000, email: "user@example.com", appId: "app-1" },
                { timestamp: 2000, email: "user@example.com", appId: "app-2" }
            ];

            mockBlobInstance.optimisticUpdate.mockImplementation(async (updateFn: Function) => {
                const result = updateFn(existing);
                return result;
            });

            // Log with uppercase email
            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-3", "USER@EXAMPLE.COM", "org-abc");

            // Should match lowercase entries and return 2000
            expect(firstSeenTimestamp).toBe(2000);
        });

        it("should include just-written entry when calculating earliest timestamp", async () => {
            const nowTimestamp = Date.now();
            const existing: UnknownUsersLog = [
                { timestamp: nowTimestamp + 1000, email: "user@example.com", appId: "app-1" }
            ];

            mockBlobInstance.optimisticUpdate.mockImplementation(async (updateFn: Function) => {
                // Simulate writing entry with current timestamp
                const newEntry = {
                    timestamp: nowTimestamp,
                    email: "user@example.com",
                    appId: "app-2"
                };
                // Return the log as if the update function was called with existing + new entry
                return [...existing, newEntry];
            });

            const firstSeenTimestamp = await UnknownUserLogger.logAttempt("app-2", "user@example.com", "org-abc");

            // Should return nowTimestamp (the just-written entry is the earliest)
            expect(firstSeenTimestamp).toBe(nowTimestamp);
        });
    });
});
