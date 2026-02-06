import { bindUser } from "../../src/http/bindUser";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

describe("bindUser", () => {
    const createMockRequest = (): AzureHttpRequest => ({
        method: "GET",
        headers: {
            get: jest.fn(),
        } as any,
        params: {},
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    });

    const createHeaders = (
        gitUserName?: string,
        gitUserEmail?: string
    ): ParsedNinjaHeaders => ({
        gitUserName,
        gitUserEmail,
    });

    describe("both name and email present", () => {
        it("should bind user with both name and email", () => {
            const request = createMockRequest();
            const headers = createHeaders("John Doe", "john@example.com");

            bindUser(request, headers);

            expect(request.user).toEqual({
                name: "John Doe",
                email: "john@example.com",
            });
        });
    });

    describe("only name present", () => {
        it("should bind user with only name when email is undefined", () => {
            const request = createMockRequest();
            const headers = createHeaders("John Doe", undefined);

            bindUser(request, headers);

            expect(request.user).toEqual({ name: "John Doe" });
            expect(request.user?.email).toBeUndefined();
        });
    });

    describe("only email present", () => {
        it("should bind user with only email when name is undefined", () => {
            const request = createMockRequest();
            const headers = createHeaders(undefined, "john@example.com");

            bindUser(request, headers);

            expect(request.user).toEqual({ email: "john@example.com" });
            expect(request.user?.name).toBeUndefined();
        });
    });

    describe("neither name nor email present", () => {
        it("should not bind user when both are undefined", () => {
            const request = createMockRequest();
            const headers = createHeaders(undefined, undefined);

            bindUser(request, headers);

            expect(request.user).toBeUndefined();
        });

        it("should not bind user with empty headers object", () => {
            const request = createMockRequest();
            const headers: ParsedNinjaHeaders = {};

            bindUser(request, headers);

            expect(request.user).toBeUndefined();
        });
    });

    describe("user object structure", () => {
        it("should only include name property when email is undefined", () => {
            const request = createMockRequest();
            const headers = createHeaders("John Doe", undefined);

            bindUser(request, headers);

            expect(request.user).toHaveProperty("name");
            expect(request.user).not.toHaveProperty("email");
        });

        it("should only include email property when name is undefined", () => {
            const request = createMockRequest();
            const headers = createHeaders(undefined, "john@example.com");

            bindUser(request, headers);

            expect(request.user).not.toHaveProperty("name");
            expect(request.user).toHaveProperty("email");
        });

        it("should include both properties when both are present", () => {
            const request = createMockRequest();
            const headers = createHeaders("John Doe", "john@example.com");

            bindUser(request, headers);

            expect(request.user).toHaveProperty("name");
            expect(request.user).toHaveProperty("email");
        });
    });
});
