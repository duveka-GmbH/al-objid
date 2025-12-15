import { bindUser } from "../../src/http/bindUser";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";

describe("bindUser", () => {
    const createMockRequest = (
        userName: string | null,
        userEmail: string | null
    ): AzureHttpRequest => ({
        method: "GET",
        headers: {
            get: jest.fn((name: string) => {
                if (name === "Ninja-Git-Name") return userName;
                if (name === "Ninja-Git-Email") return userEmail;
                return null;
            }),
        } as any,
        params: {},
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    });

    describe("both name and email present", () => {
        it("should bind user with both name and email", () => {
            const request = createMockRequest("John Doe", "john@example.com");

            bindUser(request);

            expect(request.user).toEqual({
                name: "John Doe",
                email: "john@example.com",
            });
        });

        it("should trim name and email", () => {
            const request = createMockRequest("  John Doe  ", "  john@example.com  ");

            bindUser(request);

            expect(request.user).toEqual({
                name: "John Doe",
                email: "john@example.com",
            });
        });

        it("should lowercase email", () => {
            const request = createMockRequest("John Doe", "JOHN@EXAMPLE.COM");

            bindUser(request);

            expect(request.user?.email).toBe("john@example.com");
        });
    });

    describe("only name present", () => {
        it("should bind user with only name when email is null", () => {
            const request = createMockRequest("John Doe", null);

            bindUser(request);

            expect(request.user).toEqual({ name: "John Doe" });
            expect(request.user?.email).toBeUndefined();
        });

        it("should bind user with only name when email is empty string", () => {
            const request = createMockRequest("John Doe", "");

            bindUser(request);

            expect(request.user).toEqual({ name: "John Doe" });
        });

        it("should bind user with only name when email is whitespace", () => {
            const request = createMockRequest("John Doe", "   ");

            bindUser(request);

            expect(request.user).toEqual({ name: "John Doe" });
        });
    });

    describe("only email present", () => {
        it("should bind user with only email when name is null", () => {
            const request = createMockRequest(null, "john@example.com");

            bindUser(request);

            expect(request.user).toEqual({ email: "john@example.com" });
            expect(request.user?.name).toBeUndefined();
        });

        it("should bind user with only email when name is empty string", () => {
            const request = createMockRequest("", "john@example.com");

            bindUser(request);

            expect(request.user).toEqual({ email: "john@example.com" });
        });

        it("should bind user with only email when name is whitespace", () => {
            const request = createMockRequest("   ", "john@example.com");

            bindUser(request);

            expect(request.user).toEqual({ email: "john@example.com" });
        });

        it("should lowercase email when binding only email", () => {
            const request = createMockRequest(null, "JOHN@EXAMPLE.COM");

            bindUser(request);

            expect(request.user?.email).toBe("john@example.com");
        });
    });

    describe("neither name nor email present", () => {
        it("should not bind user when both are null", () => {
            const request = createMockRequest(null, null);

            bindUser(request);

            expect(request.user).toBeUndefined();
        });

        it("should not bind user when both are empty strings", () => {
            const request = createMockRequest("", "");

            bindUser(request);

            expect(request.user).toBeUndefined();
        });

        it("should not bind user when both are whitespace", () => {
            const request = createMockRequest("   ", "   ");

            bindUser(request);

            expect(request.user).toBeUndefined();
        });
    });

    describe("header reading", () => {
        it("should read Ninja-Git-Name header", () => {
            const request = createMockRequest("Test User", null);

            bindUser(request);

            expect(request.headers.get).toHaveBeenCalledWith("Ninja-Git-Name");
        });

        it("should read Ninja-Git-Email header", () => {
            const request = createMockRequest(null, "test@example.com");

            bindUser(request);

            expect(request.headers.get).toHaveBeenCalledWith("Ninja-Git-Email");
        });
    });
});

