import { getBody } from "../../src/http/getBody";
import { HttpRequest } from "@azure/functions";

describe("getBody", () => {
    const createMockRequest = (overrides: Partial<HttpRequest> = {}): HttpRequest => {
        return {
            headers: new Map() as any,
            query: new URLSearchParams(),
            params: {},
            url: "http://test.com",
            method: "GET",
            user: null,
            body: null,
            bodyUsed: false,
            arrayBuffer: jest.fn(),
            blob: jest.fn(),
            formData: jest.fn(),
            json: jest.fn(),
            text: jest.fn(),
            ...overrides,
        } as unknown as HttpRequest;
    };

    describe("when body is null", () => {
        it("should return null when request body is null", async () => {
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/json"),
            };
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: null,
            });

            const result = await getBody(request);

            expect(result).toBeNull();
        });

        it("should return null when request body is undefined", async () => {
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/json"),
            };
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: undefined as any,
            });

            const result = await getBody(request);

            expect(result).toBeNull();
        });
    });

    describe("when content-type is application/json", () => {
        it("should parse JSON body", async () => {
            const mockBody = { name: "test", value: 123 };
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/json"),
            };
            const jsonMock = jest.fn().mockResolvedValue(mockBody);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                json: jsonMock,
            });

            const result = await getBody(request);

            expect(jsonMock).toHaveBeenCalled();
            expect(result).toEqual(mockBody);
        });

        it("should handle application/json with charset parameter", async () => {
            const mockBody = { data: "test" };
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/json; charset=utf-8"),
            };
            const jsonMock = jest.fn().mockResolvedValue(mockBody);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                json: jsonMock,
            });

            const result = await getBody(request);

            expect(jsonMock).toHaveBeenCalled();
            expect(result).toEqual(mockBody);
        });

        it("should handle APPLICATION/JSON case-insensitively", async () => {
            const mockBody = { id: 1 };
            const mockHeaders = {
                get: jest.fn().mockReturnValue("APPLICATION/JSON"),
            };
            const jsonMock = jest.fn().mockResolvedValue(mockBody);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                json: jsonMock,
            });

            const result = await getBody(request);

            expect(jsonMock).toHaveBeenCalled();
            expect(result).toEqual(mockBody);
        });
    });

    describe("when content-type is application/x-www-form-urlencoded", () => {
        it("should parse form data into object", async () => {
            const mockFormData = new Map([
                ["username", "john"],
                ["password", "secret"],
            ]);
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/x-www-form-urlencoded"),
            };
            const formDataMock = jest.fn().mockResolvedValue({
                entries: () => mockFormData.entries(),
            });
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                formData: formDataMock,
            });

            const result = await getBody(request);

            expect(formDataMock).toHaveBeenCalled();
            expect(result).toEqual({ username: "john", password: "secret" });
        });

        it("should convert form data values to strings", async () => {
            const mockFormData = new Map([["count", { toString: () => "42" }]]);
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/x-www-form-urlencoded"),
            };
            const formDataMock = jest.fn().mockResolvedValue({
                entries: () => mockFormData.entries(),
            });
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                formData: formDataMock,
            });

            const result = await getBody(request);

            expect(result).toEqual({ count: "42" });
        });
    });

    describe("when content-type is text/plain", () => {
        it("should return text body", async () => {
            const mockText = "Hello, World!";
            const mockHeaders = {
                get: jest.fn().mockReturnValue("text/plain"),
            };
            const textMock = jest.fn().mockResolvedValue(mockText);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                text: textMock,
            });

            const result = await getBody(request);

            expect(textMock).toHaveBeenCalled();
            expect(result).toBe(mockText);
        });

        it("should handle text/plain with charset parameter", async () => {
            const mockText = "Test content";
            const mockHeaders = {
                get: jest.fn().mockReturnValue("text/plain; charset=iso-8859-1"),
            };
            const textMock = jest.fn().mockResolvedValue(mockText);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                text: textMock,
            });

            const result = await getBody(request);

            expect(textMock).toHaveBeenCalled();
            expect(result).toBe(mockText);
        });
    });

    describe("when content-type is application/octet-stream", () => {
        it("should return blob for binary data", async () => {
            const mockBlob = new Blob(["binary data"]);
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/octet-stream"),
            };
            const blobMock = jest.fn().mockReturnValue(mockBlob);
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: {} as any,
                blob: blobMock,
            });

            const result = await getBody(request);

            expect(blobMock).toHaveBeenCalled();
            expect(result).toBe(mockBlob);
        });
    });

    describe("when content-type is unknown or missing", () => {
        it("should return body as-is for unknown content type", async () => {
            const mockBody = { raw: "data" };
            const mockHeaders = {
                get: jest.fn().mockReturnValue("application/xml"),
            };
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: mockBody as any,
            });

            const result = await getBody(request);

            expect(result).toBe(mockBody);
        });

        it("should return body as-is when content-type header is missing", async () => {
            const mockBody = "raw body content";
            const mockHeaders = {
                get: jest.fn().mockReturnValue(null),
            };
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: mockBody as any,
            });

            const result = await getBody(request);

            expect(result).toBe(mockBody);
        });

        it("should return body as-is when content-type header is undefined", async () => {
            const mockBody = Buffer.from("buffer content");
            const mockHeaders = {
                get: jest.fn().mockReturnValue(undefined),
            };
            const request = createMockRequest({
                headers: mockHeaders as any,
                body: mockBody as any,
            });

            const result = await getBody(request);

            expect(result).toBe(mockBody);
        });
    });
});
