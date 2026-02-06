/**
 * Integration tests for the HTTP handling pipeline.
 * These tests verify that all components work together correctly:
 * - Request body parsing (getBody)
 * - Validation (performValidation with validators)
 * - Handler execution
 * - Response serialization
 * - Error handling
 *
 * No mocks are used - these test the real integration between components.
 */

import { handleRequest } from "../../src/http/handleRequest";
import { validate } from "../../src/http/validate";
import { params, array, optional } from "../../src/http/validators";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { HttpRequest } from "@azure/functions";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { ErrorResponse } from "../../src/http/ErrorResponse";

describe("HTTP Integration Tests", () => {
    /**
     * Creates a mock HttpRequest that simulates Azure Functions HTTP request.
     * Includes a default Ninja-Version header to pass version checks.
     */
    const createHttpRequest = (options: {
        method?: string;
        body?: any;
        contentType?: string;
        params?: Record<string, string>;
        query?: Record<string, string>;
        headers?: Record<string, string>;
    } = {}): HttpRequest => {
        const {
            method = "POST",
            body = null,
            contentType = "application/json",
            params: urlParams = {},
            query = {},
            headers = {},
        } = options;

        const headersMap = new Map<string, string>();
        if (contentType) {
            headersMap.set("content-type", contentType);
        }
        // Default Ninja-Version header to pass version checks (unless explicitly overridden)
        if (!headers["Ninja-Version"] && !headers["ninja-version"]) {
            headersMap.set("ninja-version", "99.0.0");
        }
        Object.entries(headers).forEach(([key, value]) => {
            headersMap.set(key.toLowerCase(), value);
        });

        const queryParams = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            queryParams.set(key, value);
        });

        return {
            method,
            headers: {
                get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
                has: (name: string) => headersMap.has(name.toLowerCase()),
                entries: () => headersMap.entries(),
                keys: () => headersMap.keys(),
                values: () => headersMap.values(),
                forEach: (cb: (value: string, key: string) => void) => headersMap.forEach(cb),
            } as any,
            query: queryParams,
            params: urlParams,
            url: "http://localhost/api/test",
            user: null,
            body: body !== null ? {} : null, // Presence indicator
            bodyUsed: false,
            arrayBuffer: jest.fn(),
            blob: jest.fn(),
            formData: jest.fn().mockResolvedValue({
                entries: () => Object.entries(body || {}).map(([k, v]) => [k, v]),
            }),
            json: jest.fn().mockResolvedValue(body),
            text: jest.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
        } as unknown as HttpRequest;
    };

    describe("Full request lifecycle", () => {
        it("should process a simple GET request and return JSON response", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { message: "Hello, World!", timestamp: Date.now() };
            };

            const request = createHttpRequest({ method: "GET", body: null });
            (request as any).body = null; // No body for GET

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.message).toBe("Hello, World!");
            expect(parsedBody.timestamp).toBeDefined();
        });

        it("should process a POST request with JSON body", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    received: req.body,
                    processed: true,
                };
            };

            const requestBody = { name: "John", age: 30 };
            const request = createHttpRequest({
                method: "POST",
                body: requestBody,
                contentType: "application/json",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.received).toEqual(requestBody);
            expect(parsedBody.processed).toBe(true);
        });

        it("should process a PUT request to update a resource", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    id: req.params.id,
                    updated: req.body,
                    method: "PUT",
                };
            };

            validate(handler, params("id"), { name: "string", email: "string" });

            const request = createHttpRequest({
                method: "PUT",
                params: { id: "resource-123" },
                body: { name: "Updated Name", email: "updated@example.com" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.id).toBe("resource-123");
            expect(parsedBody.updated.name).toBe("Updated Name");
            expect(parsedBody.method).toBe("PUT");
        });

        it("should process a PATCH request for partial updates", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    id: req.params.id,
                    patched: req.body,
                    method: "PATCH",
                };
            };

            validate(handler, params("id"), { name: optional("string"), email: optional("string") });

            const request = createHttpRequest({
                method: "PATCH",
                params: { id: "resource-456" },
                body: { name: "Patched Name" }, // Only updating name
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.id).toBe("resource-456");
            expect(parsedBody.patched.name).toBe("Patched Name");
            expect(parsedBody.patched.email).toBeUndefined();
            expect(parsedBody.method).toBe("PATCH");
        });

        it("should process a DELETE request to remove a resource", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                req.setStatus(HttpStatusCode.Success_200_OK);
                return {
                    deleted: true,
                    id: req.params.id,
                    method: "DELETE",
                };
            };

            validate(handler, params("id"));

            const request = createHttpRequest({
                method: "DELETE",
                params: { id: "resource-789" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.deleted).toBe(true);
            expect(parsedBody.id).toBe("resource-789");
            expect(parsedBody.method).toBe("DELETE");
        });

        it("should process DELETE request with 204 No Content response", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                req.setStatus(HttpStatusCode.Success_204_NoContent);
                return undefined;
            };

            validate(handler, params("id"));

            const request = createHttpRequest({
                method: "DELETE",
                params: { id: "resource-to-delete" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_204_NoContent);
            expect(response.body).toBeUndefined();
        });

        it("should process request with URL parameters", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    userId: req.params.userId,
                    orderId: req.params.orderId,
                };
            };

            const request = createHttpRequest({
                method: "GET",
                params: { userId: "user-123", orderId: "order-456" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.userId).toBe("user-123");
            expect(parsedBody.orderId).toBe("order-456");
        });

        it("should process request with query parameters", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    page: req.query.get("page"),
                    limit: req.query.get("limit"),
                    filter: req.query.get("filter"),
                };
            };

            const request = createHttpRequest({
                method: "GET",
                query: { page: "1", limit: "10", filter: "active" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.page).toBe("1");
            expect(parsedBody.limit).toBe("10");
            expect(parsedBody.filter).toBe("active");
        });
    });

    describe("Validation integration", () => {
        it("should validate request body with PayloadValidator and pass valid data", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true, user: req.body };
            };

            validate(handler, {
                name: "string",
                email: "string",
                age: "number",
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John", email: "john@example.com", age: 30 },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.success).toBe(true);
            expect(parsedBody.user.name).toBe("John");
        });

        it("should reject invalid body with 400 Bad Request", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                name: "string",
                age: "number",
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John", age: "not-a-number" }, // age should be number
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("age");
            expect(response.body).toContain("number");
        });

        it("should validate with params validator and pass valid params", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { userId: req.params.userId };
            };

            validate(handler, params("userId"));

            const request = createHttpRequest({
                method: "GET",
                params: { userId: "user-123" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.userId).toBe("user-123");
        });

        it("should reject missing required params with 400 Bad Request", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { userId: req.params.userId };
            };

            validate(handler, params("userId", "orderId"));

            const request = createHttpRequest({
                method: "GET",
                params: { userId: "user-123" }, // missing orderId
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("orderId");
        });

        it("should validate array fields correctly", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { tags: req.body.tags, count: req.body.tags.length };
            };

            validate(handler, {
                tags: array("string"),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { tags: ["javascript", "typescript", "node"] },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.tags).toEqual(["javascript", "typescript", "node"]);
            expect(parsedBody.count).toBe(3);
        });

        it("should reject invalid array elements", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                scores: array("number"),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { scores: [100, 95, "invalid", 88] }, // "invalid" is not a number
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("scores[2]");
        });

        it("should handle optional fields correctly when missing", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    name: req.body.name,
                    nickname: req.body.nickname || "none",
                };
            };

            validate(handler, {
                name: "string",
                nickname: optional("string"),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John" }, // nickname is optional and missing
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.name).toBe("John");
            expect(parsedBody.nickname).toBe("none");
        });

        it("should validate optional fields when present", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { name: req.body.name, nickname: req.body.nickname };
            };

            validate(handler, {
                name: "string",
                nickname: optional("string"),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John", nickname: "Johnny" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.nickname).toBe("Johnny");
        });

        it("should reject invalid optional fields", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                name: "string",
                age: optional("number"),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John", age: "thirty" }, // age is optional but if present must be number
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("age");
        });

        it("should validate nested objects", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { address: req.body.address };
            };

            validate(handler, {
                address: {
                    street: "string",
                    city: "string",
                    zipCode: "string",
                },
            });

            const request = createHttpRequest({
                method: "POST",
                body: {
                    address: {
                        street: "123 Main St",
                        city: "New York",
                        zipCode: "10001",
                    },
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.address.city).toBe("New York");
        });

        it("should reject invalid nested object fields", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                address: {
                    street: "string",
                    city: "string",
                    zipCode: "number", // expecting number
                },
            });

            const request = createHttpRequest({
                method: "POST",
                body: {
                    address: {
                        street: "123 Main St",
                        city: "New York",
                        zipCode: "10001", // string instead of number
                    },
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("zipCode");
        });

        it("should validate with custom validator function", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { email: req.body.email };
            };

            validate(handler, {
                email: (value: string) => {
                    if (!value.includes("@")) {
                        return "Invalid email format";
                    }
                    return undefined;
                },
            });

            const request = createHttpRequest({
                method: "POST",
                body: { email: "john@example.com" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should reject with custom validator error message", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                email: (value: string) => {
                    if (!value.includes("@")) {
                        return "Invalid email format - must contain @";
                    }
                    return undefined;
                },
            });

            const request = createHttpRequest({
                method: "POST",
                body: { email: "invalid-email" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toBe("Invalid email format - must contain @");
        });

        it("should pass entire body to custom property validator function", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                confirmPassword: (value: string, body: any) => {
                    if (value !== body.password) {
                        return "Passwords do not match";
                    }
                    return undefined;
                },
                password: "string",
            });

            const request = createHttpRequest({
                method: "POST",
                body: { password: "secret123", confirmPassword: "secret123" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should reject when custom property validator uses body context and fails", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, {
                confirmPassword: (value: string, body: any) => {
                    if (value !== body.password) {
                        return "Passwords do not match";
                    }
                    return undefined;
                },
                password: "string",
            });

            const request = createHttpRequest({
                method: "POST",
                body: { password: "secret123", confirmPassword: "different456" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toBe("Passwords do not match");
        });

        it("should validate with RequestValidator function that accesses full request", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { authorized: true };
            };

            validate(handler, (req: AzureHttpRequest) => {
                const authHeader = req.headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    return "Missing or invalid Authorization header";
                }
                return undefined;
            });

            const request = createHttpRequest({
                method: "GET",
                headers: { Authorization: "Bearer valid-token-123" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should reject with RequestValidator when authorization fails", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { authorized: true };
            };

            validate(handler, (req: AzureHttpRequest) => {
                const authHeader = req.headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    return "Missing or invalid Authorization header";
                }
                return undefined;
            });

            const request = createHttpRequest({
                method: "GET",
                headers: { Authorization: "Basic abc123" }, // Wrong auth type
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toBe("Missing or invalid Authorization header");
        });

        it("should validate with RequestValidator that checks query parameters", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { page: req.query.get("page") };
            };

            validate(handler, (req: AzureHttpRequest) => {
                const page = req.query.get("page");
                if (page && isNaN(parseInt(page, 10))) {
                    return "Page must be a valid number";
                }
                return undefined;
            });

            const request = createHttpRequest({
                method: "GET",
                query: { page: "5" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should reject with RequestValidator when query param validation fails", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, (req: AzureHttpRequest) => {
                const page = req.query.get("page");
                if (page && isNaN(parseInt(page, 10))) {
                    return "Page must be a valid number";
                }
                return undefined;
            });

            const request = createHttpRequest({
                method: "GET",
                query: { page: "not-a-number" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toBe("Page must be a valid number");
        });

        it("should validate with custom function inside array", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { emails: req.body.emails };
            };

            const emailValidator = (value: string) => {
                if (!value.includes("@")) {
                    return "Invalid email format";
                }
                return undefined;
            };

            validate(handler, {
                emails: array(emailValidator),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { emails: ["john@example.com", "jane@example.com"] },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should reject when custom function inside array fails", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            const emailValidator = (value: string) => {
                if (!value.includes("@")) {
                    return "Invalid email format";
                }
                return undefined;
            };

            validate(handler, {
                emails: array(emailValidator),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { emails: ["john@example.com", "invalid-email", "jane@example.com"] },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toBe("Invalid email format");
        });

        it("should validate with custom function inside optional", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { website: req.body.website || "none" };
            };

            const urlValidator = (value: string) => {
                if (!value.startsWith("http://") && !value.startsWith("https://")) {
                    return "Invalid URL format";
                }
                return undefined;
            };

            validate(handler, {
                website: optional(urlValidator),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { website: "https://example.com" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should skip optional custom validator when value is missing", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { website: req.body.website || "none" };
            };

            const urlValidator = (value: string) => {
                if (!value.startsWith("http://") && !value.startsWith("https://")) {
                    return "Invalid URL format";
                }
                return undefined;
            };

            validate(handler, {
                name: "string",
                website: optional(urlValidator),
            });

            const request = createHttpRequest({
                method: "POST",
                body: { name: "John" }, // No website provided
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.website).toBe("none");
        });

        it("should combine multiple validators", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    userId: req.params.userId,
                    name: req.body.name,
                };
            };

            validate(handler, params("userId"), { name: "string", age: "number" });

            const request = createHttpRequest({
                method: "POST",
                params: { userId: "user-123" },
                body: { name: "John", age: 30 },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.userId).toBe("user-123");
            expect(parsedBody.name).toBe("John");
        });

        it("should fail on first validator when multiple validators fail", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true };
            };

            validate(handler, params("userId"), { name: "string" });

            const request = createHttpRequest({
                method: "POST",
                params: {}, // missing userId
                body: { name: 123 }, // also invalid
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(response.body).toContain("userId"); // First validator fails first
        });
    });

    describe("Handler response handling", () => {
        it("should allow handler to set custom status code", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                req.setStatus(HttpStatusCode.Success_201_Created);
                return { id: "new-resource-id" };
            };

            const request = createHttpRequest({
                method: "POST",
                body: { name: "New Resource" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_201_Created);
        });

        it("should allow handler to set custom headers", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                req.setHeader("X-Request-Id", "req-12345");
                req.setHeader("X-Processing-Time", "42ms");
                return { success: true };
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.headers).toEqual({
                "X-Request-Id": "req-12345",
                "X-Processing-Time": "42ms",
            });
        });

        it("should return string response without JSON serialization", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return "Plain text response";
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.body).toBe("Plain text response");
        });

        it("should handle null response as JSON null", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return null as any;
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.body).toBe("null");
        });

        it("should serialize array response to JSON", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return [{ id: 1 }, { id: 2 }, { id: 3 }];
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody).toHaveLength(3);
            expect(parsedBody[0].id).toBe(1);
        });
    });

    describe("Error handling integration", () => {
        it("should handle ErrorResponse thrown from handler", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                throw new ErrorResponse("Resource not found", HttpStatusCode.ClientError_404_NotFound);
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_404_NotFound);
            expect(response.body).toBe("Resource not found");
        });

        it("should handle ErrorResponse with default 500 status", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                throw new ErrorResponse("Internal server error");
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(500);
            expect(response.body).toBe("Internal server error");
        });

        it("should return 500 with error message for non-ErrorResponse exceptions", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                throw new Error("Unexpected error");
            };

            const request = createHttpRequest({ method: "GET" });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ServerError_500_InternalServerError);
            expect(response.body).toBe("Unexpected error");
        });

        it("should handle validation errors before handler is called", async () => {
            let handlerCalled = false;
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                handlerCalled = true;
                return { success: true };
            };

            validate(handler, { name: "string" });

            const request = createHttpRequest({
                method: "POST",
                body: { name: 123 }, // Invalid type
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(handlerCalled).toBe(false); // Handler should not be called
        });
    });

    describe("Complex scenarios", () => {
        it("should handle a complete CRUD-like create operation", async () => {
            interface CreateUserRequest {
                name: string;
                email: string;
                age: number;
                roles: string[];
                address?: {
                    street: string;
                    city: string;
                };
            }

            const handler: AzureHttpHandler = async (req: AzureHttpRequest<CreateUserRequest>) => {
                req.setStatus(HttpStatusCode.Success_201_Created);
                req.setHeader("Location", `/api/users/new-user-id`);
                return {
                    id: "new-user-id",
                    ...req.body,
                    createdAt: new Date().toISOString(),
                };
            };

            validate(handler, {
                name: "string",
                email: (value: string) => (!value.includes("@") ? "Invalid email" : undefined),
                age: "number",
                roles: array("string"),
                address: optional({
                    street: "string",
                    city: "string",
                }),
            });

            const request = createHttpRequest({
                method: "POST",
                body: {
                    name: "John Doe",
                    email: "john@example.com",
                    age: 30,
                    roles: ["user", "admin"],
                    address: {
                        street: "123 Main St",
                        city: "New York",
                    },
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_201_Created);
            expect(response.headers?.["Location"]).toBe("/api/users/new-user-id");

            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.id).toBe("new-user-id");
            expect(parsedBody.name).toBe("John Doe");
            expect(parsedBody.roles).toEqual(["user", "admin"]);
            expect(parsedBody.address.city).toBe("New York");
            expect(parsedBody.createdAt).toBeDefined();
        });

        it("should handle a complete read operation with params and query", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                const page = parseInt(req.query.get("page") || "1", 10);
                const limit = parseInt(req.query.get("limit") || "10", 10);

                return {
                    userId: req.params.userId,
                    page,
                    limit,
                    items: [
                        { id: 1, name: "Item 1" },
                        { id: 2, name: "Item 2" },
                    ],
                    total: 100,
                };
            };

            validate(handler, params("userId"));

            const request = createHttpRequest({
                method: "GET",
                params: { userId: "user-123" },
                query: { page: "2", limit: "25" },
            });
            (request as any).body = null;

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.userId).toBe("user-123");
            expect(parsedBody.page).toBe(2);
            expect(parsedBody.limit).toBe(25);
            expect(parsedBody.items).toHaveLength(2);
        });

        it("should handle form data content type", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return {
                    received: req.body,
                };
            };

            const request = createHttpRequest({
                method: "POST",
                contentType: "application/x-www-form-urlencoded",
                body: { username: "john", password: "secret123" },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.received.username).toBe("john");
        });

        it("should handle deeply nested validation", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                return { success: true, data: req.body };
            };

            validate(handler, {
                user: {
                    profile: {
                        name: "string",
                        settings: {
                            notifications: "boolean",
                            theme: "string",
                        },
                    },
                    contacts: array({
                        type: "string",
                        value: "string",
                    }),
                },
            });

            const request = createHttpRequest({
                method: "POST",
                body: {
                    user: {
                        profile: {
                            name: "John",
                            settings: {
                                notifications: true,
                                theme: "dark",
                            },
                        },
                        contacts: [
                            { type: "email", value: "john@example.com" },
                            { type: "phone", value: "555-1234" },
                        ],
                    },
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.success).toBe(true);
            expect(parsedBody.data.user.profile.settings.theme).toBe("dark");
            expect(parsedBody.data.user.contacts).toHaveLength(2);
        });

        it("should handle request with all features combined", async () => {
            const handler: AzureHttpHandler = async (req: AzureHttpRequest) => {
                req.setStatus(HttpStatusCode.Success_200_OK);
                req.setHeader("X-Processed-By", "integration-test");
                req.setHeader("X-User-Id", req.params.userId);

                return {
                    userId: req.params.userId,
                    action: req.query.get("action"),
                    data: req.body,
                    timestamp: Date.now(),
                };
            };

            validate(
                handler,
                params("userId"),
                (req) => {
                    if (!req.query.get("action")) {
                        return 'Query parameter "action" is required';
                    }
                    return undefined;
                },
                {
                    items: array("string"),
                    priority: optional("number"),
                }
            );

            const request = createHttpRequest({
                method: "POST",
                params: { userId: "user-456" },
                query: { action: "process" },
                body: {
                    items: ["item1", "item2"],
                    priority: 5,
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(HttpStatusCode.Success_200_OK);
            expect(response.headers?.["X-Processed-By"]).toBe("integration-test");
            expect(response.headers?.["X-User-Id"]).toBe("user-456");

            const parsedBody = JSON.parse(response.body as string);
            expect(parsedBody.userId).toBe("user-456");
            expect(parsedBody.action).toBe("process");
            expect(parsedBody.data.items).toEqual(["item1", "item2"]);
            expect(parsedBody.data.priority).toBe(5);
        });
    });
});
