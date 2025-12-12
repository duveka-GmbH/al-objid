import { createAuthorizeUpdateCallback, createDeauthorizeUpdateCallback } from "../../../../src/functions/v3/authorizeApp/updateCallbacks";
import { AppInfo } from "../../../../src/types";

describe("authorizeApp updateCallbacks", () => {
    describe("createAuthorizeUpdateCallback", () => {
        beforeEach(() => {
            jest.spyOn(Date, "now").mockReturnValue(1234567890);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it("should create authorization with key", () => {
            const callback = createAuthorizeUpdateCallback({ key: "test-key" });
            const result = callback(null);

            expect(result._authorization).toEqual({
                key: "test-key",
                user: { timestamp: 1234567890 },
            });
        });

        it("should handle null app by creating new app object", () => {
            const callback = createAuthorizeUpdateCallback({ key: "test-key" });
            const result = callback(null);

            expect(result).toBeDefined();
            expect(result._authorization).toBeDefined();
        });

        it("should preserve existing app data", () => {
            const existingApp = {
                codeunit: [1, 2, 3],
                table: [100, 200],
            } as AppInfo;
            const callback = createAuthorizeUpdateCallback({ key: "test-key" });
            const result = callback(existingApp);

            expect(result.codeunit).toEqual([1, 2, 3]);
            expect(result.table).toEqual([100, 200]);
            expect(result._authorization).toBeDefined();
        });

        it("should include userName in user data when provided", () => {
            const callback = createAuthorizeUpdateCallback({
                key: "test-key",
                userName: "john.doe",
            });
            const result = callback(null);

            expect(result._authorization!.user!.name).toBe("john.doe");
        });

        it("should include userEmail when provided", () => {
            const callback = createAuthorizeUpdateCallback({
                key: "test-key",
                userName: "john.doe",
                userEmail: "john@example.com",
            });
            const result = callback(null);

            expect(result._authorization!.user!.name).toBe("john.doe");
            expect(result._authorization!.user!.email).toBe("john@example.com");
        });

        it("should include only userEmail when userName is not provided", () => {
            const callback = createAuthorizeUpdateCallback({
                key: "test-key",
                userEmail: "john@example.com",
            });
            const result = callback(null);

            expect(result._authorization!.user!.name).toBeUndefined();
            expect(result._authorization!.user!.email).toBe("john@example.com");
        });

        it("should set timestamp using Date.now()", () => {
            const callback = createAuthorizeUpdateCallback({ key: "test-key" });
            const result = callback(null);

            expect(result._authorization!.user!.timestamp).toBe(1234567890);
        });

        it("should not mutate the original app object", () => {
            const existingApp = {
                codeunit: [1, 2, 3],
            } as AppInfo;
            const callback = createAuthorizeUpdateCallback({ key: "test-key" });
            callback(existingApp);

            expect(existingApp._authorization).toBeUndefined();
        });
    });

    describe("createDeauthorizeUpdateCallback", () => {
        it("should remove authorization from app", () => {
            const app = {
                _authorization: { key: "test-key" },
                codeunit: [1, 2, 3],
            } as AppInfo;
            const callback = createDeauthorizeUpdateCallback();
            const result = callback(app);

            expect(result._authorization).toBeUndefined();
        });

        it("should preserve other app data", () => {
            const app = {
                _authorization: { key: "test-key" },
                codeunit: [1, 2, 3],
                table: [100, 200],
                _ranges: [{ from: 50000, to: 59999 }],
            } as AppInfo;
            const callback = createDeauthorizeUpdateCallback();
            const result = callback(app);

            expect(result.codeunit).toEqual([1, 2, 3]);
            expect(result.table).toEqual([100, 200]);
            expect(result._ranges).toEqual([{ from: 50000, to: 59999 }]);
        });

        it("should return new object (not same reference)", () => {
            const app = {
                _authorization: { key: "test-key" },
            } as AppInfo;
            const callback = createDeauthorizeUpdateCallback();
            const result = callback(app);

            expect(result).not.toBe(app);
        });

        it("should handle app with no authorization gracefully", () => {
            const app = {
                codeunit: [1, 2, 3],
            } as AppInfo;
            const callback = createDeauthorizeUpdateCallback();
            const result = callback(app);

            expect(result._authorization).toBeUndefined();
            expect(result.codeunit).toEqual([1, 2, 3]);
        });
    });
});
