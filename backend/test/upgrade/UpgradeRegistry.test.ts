import { UpgradeRegistry, __test_only__registerUpgradeProcedure } from "../../src/upgrade/UpgradeRegistry";
import { AppInfo } from "../../src/types";
import { UpgradeProcedure } from "../../src/upgrade/UpgradeRegistry";

describe("UpgradeRegistry", () => {
    const TEST_TAG = "__test-upgrade-procedure__";
    const testProcedure: UpgradeProcedure = async (appId, app) => app;

    beforeEach(() => {
        // Register a test procedure for testing
        __test_only__registerUpgradeProcedure(TEST_TAG, testProcedure);
    });

    describe("getAllTags", () => {
        it("should return all tags from built-in map", () => {
            const tags = UpgradeRegistry.getAllTags();

            expect(Array.isArray(tags)).toBe(true);
            expect(tags).toContain(TEST_TAG);
        });

        it("should return tags in consistent order", () => {
            const tags1 = UpgradeRegistry.getAllTags();
            const tags2 = UpgradeRegistry.getAllTags();

            expect(tags1).toEqual(tags2);
        });

        it("should include both test procedure and any existing procedures", () => {
            const tags = UpgradeRegistry.getAllTags();

            expect(tags).toContain(TEST_TAG);
            // In the future, when real procedures are added, they will also be included
            expect(tags.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("getProcedure", () => {
        it("should return undefined for non-existent tag", () => {
            const procedure = UpgradeRegistry.getProcedure("non-existent-tag");

            expect(procedure).toBeUndefined();
        });

        it("should return procedure for existing tag", async () => {
            const procedure = UpgradeRegistry.getProcedure(TEST_TAG);
            
            expect(procedure).toBeDefined();
            expect(typeof procedure).toBe("function");
            expect(procedure).toBe(testProcedure);
        });

        it("should return procedure that matches UpgradeProcedure signature", async () => {
            const procedure = UpgradeRegistry.getProcedure(TEST_TAG);
            
            expect(procedure).toBeDefined();
            
            const mockApp: AppInfo = { codeunit: [1] };
            const result = await procedure!("test-app-id", mockApp);
            
            expect(result).toBeDefined();
            expect(typeof result).toBe("object");
            expect(result).toEqual(mockApp);
        });

        it("should work with multiple registered procedures", () => {
            const secondTestTag = "__test-upgrade-procedure-2__";
            const secondProcedure: UpgradeProcedure = async (appId, app) => app;
            
            __test_only__registerUpgradeProcedure(secondTestTag, secondProcedure);
            
            const tags = UpgradeRegistry.getAllTags();
            expect(tags).toContain(TEST_TAG);
            expect(tags).toContain(secondTestTag);
            
            const procedure1 = UpgradeRegistry.getProcedure(TEST_TAG);
            const procedure2 = UpgradeRegistry.getProcedure(secondTestTag);
            
            expect(procedure1).toBe(testProcedure);
            expect(procedure2).toBe(secondProcedure);
        });
    });
});

