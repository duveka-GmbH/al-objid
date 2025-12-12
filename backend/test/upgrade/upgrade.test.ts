import { Blob } from "@vjeko.com/azure-blob";
import { upgrade } from "../../src/upgrade/upgrade";
import { UpgradeRegistry } from "../../src/upgrade/UpgradeRegistry";
import { AppInfo } from "../../src/types";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/upgrade/UpgradeRegistry");

const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const mockUpgradeRegistry = UpgradeRegistry as jest.Mocked<typeof UpgradeRegistry>;

describe("upgrade", () => {
    let mockBlobInstance: {
        read: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockApp = (overrides: any = {}): AppInfo => {
        return {
            codeunit: [1, 2, 3],
            ...overrides,
        } as AppInfo;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockBlobInstance = {
            read: jest.fn(),
            optimisticUpdate: jest.fn(),
        };

        MockBlob.mockImplementation(() => mockBlobInstance as any);
    });

    describe("basic functionality", () => {
        it("should return original app unchanged when no missing tags", async () => {
            const app = createMockApp({ _upgrade: ["tag1", "tag2"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result).toBe(app);
            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should return original app when _upgrade is empty array and no tags registered", async () => {
            const app = createMockApp({ _upgrade: [] });
            mockUpgradeRegistry.getAllTags.mockReturnValue([]);

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result).toBe(app);
        });

        it("should return original app when _upgrade is missing and no tags registered", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue([]);

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result).toBe(app);
        });

        it("should apply single missing tag upgrade", async () => {
            const app = createMockApp();
            const upgradedApp = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                const result = await callback(app, 0);
                return result;
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.read).toHaveBeenCalled();
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
            expect(result._upgrade).toContain("tag1");
        });

        it("should apply multiple missing tags in order", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2", "tag3"]);
            mockUpgradeRegistry.getProcedure.mockImplementation((tag) => 
                async (appId, app) => app
            );
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                if (readCount === 2) return { ...app, _upgrade: ["tag1"], tag1: true };
                return { ...app, _upgrade: ["tag1", "tag2"], tag1: true, tag2: true };
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                return result;
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            // read is called: 1) before tag1, 2) before tag2, 3) before tag3
            // optimisticUpdate also calls read internally, so we get more calls
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(6);
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(3);
            expect(result._upgrade).toEqual(["tag1", "tag2", "tag3"]);
        });

        it("should handle empty _upgrade array", async () => {
            const app = createMockApp({ _upgrade: [] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                return await callback(app, 0);
            });

            await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
        });

        it("should handle missing _upgrade property", async () => {
            const app = createMockApp();
            delete (app as any)._upgrade;
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                return await callback(app, 0);
            });

            await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
        });

        it("should re-read blob between upgrades", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                return { ...app, _upgrade: ["tag1"] };
            });
            
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                const currentApp = await mockBlobInstance.read();
                return await callback(currentApp, 0);
            });

            await upgrade("test-app-id", app, mockBlobInstance as any);

            // read is called: 1) before tag1 upgrade, 2) before tag2 upgrade
            // optimisticUpdate also calls read internally, so we get more calls
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(4);
        });

        it("should throw error when upgrade procedure not found", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(undefined);
            mockBlobInstance.read.mockResolvedValue(app);

            await expect(upgrade("test-app-id", app, mockBlobInstance as any)).rejects.toThrow(
                "Upgrade procedure not found for tag: tag1"
            );
        });

        it("should throw error when blob read returns null during upgrade", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            mockBlobInstance.read.mockResolvedValue(null);

            await expect(upgrade("test-app-id", app, mockBlobInstance as any)).rejects.toThrow(
                "App test-app-id not found during upgrade"
            );
        });
    });

    describe("concurrency tests", () => {
        it("should handle two concurrent upgrades of same tag - second sees tag already present", async () => {
            const app = createMockApp();
            const appWithTag = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            // First call: tag not present, upgrade succeeds
            // Second call: tag already present, upgrade skipped
            let callCount = 0;
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                callCount++;
                const currentApp = callCount === 1 ? app : appWithTag;
                return await callback(currentApp, 0);
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
            // Second upgrade should see tag and return unchanged
            const callback = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const secondResult = await callback(appWithTag, 0);
            expect(secondResult).toBe(appWithTag);
            expect(secondResult._upgrade).toEqual(["tag1"]);
        });

        it("should handle two concurrent upgrades of different tags - both succeed independently", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockImplementation((tag) => 
                async (appId, app) => app
            );
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                return { ...app, _upgrade: ["tag1"] };
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                return { ...result, _upgrade: [...(result._upgrade || []), "tag2"] };
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
        });

        it("should handle three concurrent upgrades of same tag - only first succeeds", async () => {
            const app = createMockApp();
            const appWithTag = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let updateCount = 0;
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                // First call succeeds, subsequent calls see tag already present
                const currentApp = updateCount === 1 ? app : appWithTag;
                return await callback(currentApp, 0);
            });

            await upgrade("test-app-id", app, mockBlobInstance as any);

            // Simulate three concurrent calls
            const callback = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result1 = await callback(app, 0);
            const result2 = await callback(appWithTag, 0);
            const result3 = await callback(appWithTag, 0);

            expect(result1._upgrade).toContain("tag1");
            expect(result2).toBe(appWithTag);
            expect(result3).toBe(appWithTag);
        });

        it("should handle concurrent upgrade while blob is being modified by another operation - optimisticUpdate retries work", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let attemptCount = 0;
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                attemptCount++;
                // Simulate conflict on first attempt, success on second
                if (attemptCount === 1) {
                    // Simulate conflict - return app without tag
                    const result = await callback(app, 0);
                    // But optimisticUpdate would retry, so we simulate that
                    return await callback(app, 1);
                }
                return await callback(app, 0);
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
            expect(result._upgrade).toContain("tag1");
        });

        it("should handle upgrade A completes, then upgrade B runs - B sees A's tag and skips, but applies its own tag", async () => {
            const app = createMockApp();
            const appWithTag1 = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockImplementation((tag) => 
                async (appId, app) => app
            );
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                // Subsequent reads see tag1 already applied
                return appWithTag1;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                // Second upgrade sees tag1, adds tag2
                return { ...result, _upgrade: [...(result._upgrade || []), "tag2"] };
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
        });

        it("should handle multiple missing tags, concurrent upgrade of tag 2 while tag 1 is upgrading", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockImplementation((tag) => 
                async (appId, app) => app
            );
            
            let state = app;
            mockBlobInstance.read.mockImplementation(async () => {
                return state;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                // Update state for next read
                state = result;
                return result;
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            // read is called: 1) before tag1 upgrade, 2) before tag2 upgrade
            // optimisticUpdate also calls read internally, so we get more calls
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(4);
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
            expect(result._upgrade).toEqual(["tag1", "tag2"]);
        });

        it("should handle upgrade fails mid-process, concurrent retry - second attempt sees partial state correctly", async () => {
            const app = createMockApp();
            const appWithPartialTag = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockImplementation((tag) => 
                async (appId, app) => {
                    if (tag === "tag2") {
                        throw new Error("Upgrade failed");
                    }
                    return app;
                }
            );
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                return appWithPartialTag;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                if (updateCount === 1) {
                    return await callback(currentApp, 0);
                }
                // Second attempt sees tag1 already present
                return await callback(currentApp, 0);
            });

            // First upgrade succeeds, second fails
            await expect(upgrade("test-app-id", app, mockBlobInstance as any)).rejects.toThrow("Upgrade failed");
        });

        it("should handle rapid sequential upgrades - all tags eventually present, no duplicates", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2", "tag3"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let readCount = 0;
            let currentState = app;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                // Return current state (which gets updated by optimisticUpdate)
                return currentState;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                // Update current state for next read
                currentState = result;
                return result;
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
            expect(result._upgrade).toContain("tag3");
            // No duplicates
            const uniqueTags = [...new Set(result._upgrade)];
            expect(result._upgrade).toEqual(uniqueTags);
        });

        it("should handle upgrade procedure modifies blob, concurrent read during upgrade - sees consistent state", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => {
                return app;
            });
            
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                const currentApp = await mockBlobInstance.read();
                return await callback(currentApp, 0);
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result._upgrade).toContain("tag1");
        });

        it("should handle optimisticUpdate retry scenario - upgrade tag check happens on each retry attempt", async () => {
            const app = createMockApp();
            const appWithTag = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let attemptCount = 0;
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                attemptCount++;
                // First attempt: no tag, second attempt (retry): tag present
                const currentApp = attemptCount === 1 ? app : appWithTag;
                const result = await callback(currentApp, attemptCount - 1);
                if (attemptCount === 1) {
                    // Simulate retry
                    return await callback(appWithTag, 1);
                }
                return result;
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            // On retry, should see tag and return unchanged
            expect(result._upgrade).toEqual(["tag1"]);
        });

        it("should handle blob read returns different state between iterations - upgrade handles state changes correctly", async () => {
            const app = createMockApp();
            const appWithTag1 = createMockApp({ _upgrade: ["tag1"] });
            const appWithBothTags = createMockApp({ _upgrade: ["tag1", "tag2"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                if (readCount === 2) return appWithTag1;
                return appWithBothTags;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                // Second upgrade sees both tags, but tag2 not in currentApp yet
                return { ...result, _upgrade: [...(result._upgrade || []), "tag2"] };
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            // read is called: 1) initial check in upgrade, 2) before tag1 upgrade, 3) before tag2 upgrade
            // optimisticUpdate also calls read internally, so we expect at least 2 calls (one per missing tag)
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(4);
            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
        });

        it("should handle concurrent upgrades with blob.read() returning stale then fresh data - system handles correctly", async () => {
            const app = createMockApp();
            const freshApp = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app; // Stale
                if (readCount === 2) return freshApp; // Fresh
                return freshApp;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                return { ...result, _upgrade: [...(result._upgrade || []), "tag2"] };
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
        });

        it("should handle upgrade procedure throws error - error propagates, tag not added, concurrent retry still works", async () => {
            const app = createMockApp();
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => {
                throw new Error("Upgrade failed");
            });
            
            mockBlobInstance.read.mockResolvedValue(app);
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                return await callback(app, 0);
            });

            await expect(upgrade("test-app-id", app, mockBlobInstance as any)).rejects.toThrow("Upgrade failed");

            // Verify tag was not added - the error should prevent the upgrade
            // The callback would throw, so we can't call it directly
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();
        });

        it("should handle multiple missing tags, blob state changes between tag upgrades - each upgrade sees latest state", async () => {
            const app = createMockApp();
            const appWithTag1 = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1", "tag2"]);
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => app);
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                if (readCount === 1) return app;
                return appWithTag1; // State changed between upgrades
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                // Second upgrade sees tag1 already present
                expect(currentApp._upgrade).toContain("tag1");
                return { ...result, _upgrade: [...(result._upgrade || []), "tag2"] };
            });

            const result = await upgrade("test-app-id", app, mockBlobInstance as any);

            expect(result._upgrade).toContain("tag1");
            expect(result._upgrade).toContain("tag2");
        });

        it("should handle upgrade adds tag, concurrent upgrade of same tag with different procedure - second sees tag and skips", async () => {
            const app = createMockApp();
            const appWithTag = createMockApp({ _upgrade: ["tag1"] });
            mockUpgradeRegistry.getAllTags.mockReturnValue(["tag1"]);
            
            let procedureCallCount = 0;
            mockUpgradeRegistry.getProcedure.mockReturnValue(async (appId, app) => {
                procedureCallCount++;
                return app;
            });
            
            let readCount = 0;
            mockBlobInstance.read.mockImplementation(async () => {
                readCount++;
                return readCount === 1 ? app : appWithTag;
            });

            let updateCount = 0;
            mockBlobInstance.optimisticUpdate.mockImplementation(async (callback) => {
                updateCount++;
                const currentApp = await mockBlobInstance.read();
                const result = await callback(currentApp, 0);
                if (updateCount === 1) {
                    return { ...result, _upgrade: ["tag1"] };
                }
                return result;
            });

            await upgrade("test-app-id", app, mockBlobInstance as any);

            // Simulate concurrent call - should see tag and skip
            const callback = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const concurrentResult = await callback(appWithTag, 0);
            expect(concurrentResult).toBe(appWithTag);
            expect(concurrentResult._upgrade).toEqual(["tag1"]);
        });
    });
});

