import { parseNinjaHeaders, ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";
import { HeadersLike } from "../../src/http/AzureHttpRequest";

describe("parseNinjaHeaders", () => {
    /**
     * Creates a mock headers object for testing.
     */
    function createMockHeaders(headerMap: Record<string, string | null>): HeadersLike {
        return {
            get: (name: string) => headerMap[name] ?? null,
        };
    }

    /**
     * Creates a Base64-encoded Ninja-Header-Payload.
     */
    function createPayload(payload: Record<string, string | undefined>): string {
        return Buffer.from(JSON.stringify(payload)).toString("base64");
    }

    // =========================================================================
    // Payload Present (Ninja-Header-Payload)
    // =========================================================================
    describe("Ninja-Header-Payload present", () => {
        it("should decode and return all fields from payload", () => {
            const payload = createPayload({
                gitUserName: "John Doe",
                gitUserEmail: "john@example.com",
                appPublisher: "Contoso",
                appName: "My App",
                appVersion: "1.0.0",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
                "Ninja-App-Id": "test-app-id",
                "Ninja-Git-Branch": "main",
            });

            const result = parseNinjaHeaders(headers);

            expect(result).toEqual({
                gitUserName: "John Doe",
                gitUserEmail: "john@example.com",
                appPublisher: "Contoso",
                appName: "My App",
                appVersion: "1.0.0",
                appId: "test-app-id",
                gitBranch: "main",
            });
        });

        it("should lowercase email from payload", () => {
            const payload = createPayload({
                gitUserEmail: "JOHN@EXAMPLE.COM",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserEmail).toBe("john@example.com");
        });

        it("should trim whitespace from payload values", () => {
            const payload = createPayload({
                gitUserName: "  John Doe  ",
                gitUserEmail: "  john@example.com  ",
                appPublisher: "  Contoso  ",
                appName: "  My App  ",
                appVersion: "  1.0.0  ",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBe("John Doe");
            expect(result.gitUserEmail).toBe("john@example.com");
            expect(result.appPublisher).toBe("Contoso");
            expect(result.appName).toBe("My App");
            expect(result.appVersion).toBe("1.0.0");
        });

        it("should handle empty strings in payload as undefined", () => {
            const payload = createPayload({
                gitUserName: "",
                gitUserEmail: "",
                appPublisher: "",
                appName: "",
                appVersion: "",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBeUndefined();
            expect(result.gitUserEmail).toBeUndefined();
            expect(result.appPublisher).toBeUndefined();
            expect(result.appName).toBeUndefined();
            expect(result.appVersion).toBeUndefined();
        });

        it("should handle whitespace-only strings in payload as undefined", () => {
            const payload = createPayload({
                gitUserName: "   ",
                gitUserEmail: "   ",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBeUndefined();
            expect(result.gitUserEmail).toBeUndefined();
        });

        it("should handle Unicode characters in payload (Base64 decoding)", () => {
            const payload = createPayload({
                gitUserName: "José García",
                appPublisher: "北京开发者",
                appName: "日本語アプリ",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBe("José García");
            expect(result.appPublisher).toBe("北京开发者");
            expect(result.appName).toBe("日本語アプリ");
        });

        it("should handle emoji in payload", () => {
            const payload = createPayload({
                gitUserName: "Developer 🚀",
                appName: "Cool App 💻",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBe("Developer 🚀");
            expect(result.appName).toBe("Cool App 💻");
        });
    });

    // =========================================================================
    // Fallback to Individual Headers
    // =========================================================================
    describe("Fallback to individual headers", () => {
        it("should read from individual headers when payload is missing", () => {
            const headers = createMockHeaders({
                "Ninja-Git-Name": "John Doe",
                "Ninja-Git-Email": "john@example.com",
                "Ninja-App-Publisher": "Contoso",
                "Ninja-App-Name": "My App",
                "Ninja-App-Version": "1.0.0",
                "Ninja-App-Id": "test-app-id",
                "Ninja-Git-Branch": "develop",
            });

            const result = parseNinjaHeaders(headers);

            expect(result).toEqual({
                gitUserName: "John Doe",
                gitUserEmail: "john@example.com",
                appPublisher: "Contoso",
                appName: "My App",
                appVersion: "1.0.0",
                appId: "test-app-id",
                gitBranch: "develop",
            });
        });

        it("should lowercase email from individual headers", () => {
            const headers = createMockHeaders({
                "Ninja-Git-Email": "JOHN@EXAMPLE.COM",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserEmail).toBe("john@example.com");
        });

        it("should trim whitespace from individual headers", () => {
            const headers = createMockHeaders({
                "Ninja-Git-Name": "  John Doe  ",
                "Ninja-Git-Email": "  john@example.com  ",
                "Ninja-App-Id": "  test-app-id  ",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBe("John Doe");
            expect(result.gitUserEmail).toBe("john@example.com");
            expect(result.appId).toBe("test-app-id");
        });

        it("should handle empty strings in individual headers as undefined", () => {
            const headers = createMockHeaders({
                "Ninja-Git-Name": "",
                "Ninja-Git-Email": "",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBeUndefined();
            expect(result.gitUserEmail).toBeUndefined();
        });
    });

    // =========================================================================
    // appId and gitBranch Always from Individual Headers
    // =========================================================================
    describe("appId and gitBranch always from individual headers", () => {
        it("should read appId from individual header even when payload is present", () => {
            const payload = createPayload({
                gitUserName: "John Doe",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
                "Ninja-App-Id": "header-app-id",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.appId).toBe("header-app-id");
        });

        it("should read gitBranch from individual header even when payload is present", () => {
            const payload = createPayload({
                gitUserName: "John Doe",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
                "Ninja-Git-Branch": "feature/test",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitBranch).toBe("feature/test");
        });

        it("should return undefined for appId when header is missing", () => {
            const headers = createMockHeaders({});

            const result = parseNinjaHeaders(headers);

            expect(result.appId).toBeUndefined();
        });

        it("should return undefined for gitBranch when header is missing", () => {
            const headers = createMockHeaders({});

            const result = parseNinjaHeaders(headers);

            expect(result.gitBranch).toBeUndefined();
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe("Edge cases", () => {
        it("should return empty structure when no headers present", () => {
            const headers = createMockHeaders({});

            const result = parseNinjaHeaders(headers);

            expect(result).toEqual({
                gitUserName: undefined,
                gitUserEmail: undefined,
                appPublisher: undefined,
                appName: undefined,
                appVersion: undefined,
                appId: undefined,
                gitBranch: undefined,
            });
        });

        it("should handle partial payload data", () => {
            const payload = createPayload({
                gitUserName: "John Doe",
                // Other fields omitted
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
                "Ninja-App-Id": "test-app-id",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserName).toBe("John Doe");
            expect(result.gitUserEmail).toBeUndefined();
            expect(result.appPublisher).toBeUndefined();
            expect(result.appName).toBeUndefined();
            expect(result.appVersion).toBeUndefined();
            expect(result.appId).toBe("test-app-id");
        });

        it("should handle GUID-formatted appId", () => {
            const headers = createMockHeaders({
                "Ninja-App-Id": "550e8400-e29b-41d4-a716-446655440000",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.appId).toBe("550e8400-e29b-41d4-a716-446655440000");
        });

        it("should handle branch names with slashes", () => {
            const headers = createMockHeaders({
                "Ninja-Git-Branch": "feature/user/JIRA-123/my-branch",
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitBranch).toBe("feature/user/JIRA-123/my-branch");
        });

        it("should handle email with plus sign", () => {
            const payload = createPayload({
                gitUserEmail: "user+tag@example.com",
            });

            const headers = createMockHeaders({
                "Ninja-Header-Payload": payload,
            });

            const result = parseNinjaHeaders(headers);

            expect(result.gitUserEmail).toBe("user+tag@example.com");
        });
    });
});
