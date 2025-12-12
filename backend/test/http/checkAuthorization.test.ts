import { checkAuthorization } from "../../src/http/checkAuthorization";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { AppInfo } from "../../src/types";

describe("checkAuthorization", () => {
    describe("when authorization is not required", () => {
        it("should return without error when app is undefined", () => {
            expect(() => checkAuthorization(undefined, "any-key")).not.toThrow();
        });

        it("should return without error when app._authorization is undefined", () => {
            const app = {} as AppInfo;

            expect(() => checkAuthorization(app, "any-key")).not.toThrow();
        });

        it("should return without error when app._authorization.key is undefined", () => {
            const app = {
                _authorization: {} as any
            } as AppInfo;

            expect(() => checkAuthorization(app, "any-key")).not.toThrow();
        });

        it("should return without error when app._authorization.key is empty string", () => {
            const app = {
                _authorization: {
                    key: ""
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "any-key")).not.toThrow();
        });
    });

    describe("when authorization is required (key exists)", () => {
        it("should return without error when authKey matches app._authorization.key", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "secret-key")).not.toThrow();
        });

        it("should throw ErrorResponse when authKey does not match", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "wrong-key")).toThrow(ErrorResponse);
        });

        it("should throw ErrorResponse with 401 status when authKey does not match", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            try {
                checkAuthorization(app, "wrong-key");
                fail("Expected ErrorResponse to be thrown");
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_401_Unauthorized);
                expect((error as ErrorResponse).message).toBe("Invalid authorization key");
            }
        });

        it("should throw ErrorResponse when authKey is null", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, null)).toThrow(ErrorResponse);
        });

        it("should throw ErrorResponse with 401 status and correct message when authKey is null", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            try {
                checkAuthorization(app, null);
                fail("Expected ErrorResponse to be thrown");
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_401_Unauthorized);
                expect((error as ErrorResponse).message).toBe("Invalid authorization key");
            }
        });

        it("should throw ErrorResponse when authKey is empty string but key is non-empty", () => {
            const app = {
                _authorization: {
                    key: "secret-key"
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "")).toThrow(ErrorResponse);
        });
    });

    describe("edge cases", () => {
        it("should handle app with other properties but no _authorization", () => {
            const app = {
                codeunit: [1, 2, 3]
            } as AppInfo;

            expect(() => checkAuthorization(app, "any-key")).not.toThrow();
        });

        it("should handle authorization with user property", () => {
            const app = {
                _authorization: {
                    key: "secret-key",
                    user: {
                        name: "Test User",
                        email: "test@example.com",
                        timestamp: Date.now()
                    }
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "secret-key")).not.toThrow();
        });

        it("should throw when authorization has user property but key does not match", () => {
            const app = {
                _authorization: {
                    key: "secret-key",
                    user: {
                        name: "Test User",
                        email: "test@example.com",
                        timestamp: Date.now()
                    }
                }
            } as AppInfo;

            expect(() => checkAuthorization(app, "wrong-key")).toThrow(ErrorResponse);
        });
    });
});
