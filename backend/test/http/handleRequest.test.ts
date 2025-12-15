import { handleRequest } from "../../src/http/handleRequest";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { HttpRequest } from "@azure/functions";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { ValidatorSymbol, PayloadValidator, RequestValidator } from "../../src/http/validationTypes";
import {
    SingleAppHttpRequestSymbol,
    MultiAppHttpRequestSymbol,
    SingleAppHttpRequestOptionalSymbol,
    MultiAppHttpRequestOptionalSymbol,
    SkipAuthorizationSymbol,
} from "../../src/http/AzureHttpRequest";
import { PermissionCheckSymbol } from "../../src/permission/withPermissionCheck";
import * as getBodyModule from "../../src/http/getBody";
import * as validateModule from "../../src/http/validate";
import * as bindAppModule from "../../src/http/bindApp";
import * as bindUserModule from "../../src/http/bindUser";
import * as bindPermissionModule from "../../src/permission/bindPermission";
import * as privateBackendModule from "../../src/utils/privateBackend";

jest.mock("../../src/http/getBody");
jest.mock("../../src/http/validate");
jest.mock("../../src/http/bindApp");
jest.mock("../../src/http/bindUser");
jest.mock("../../src/permission/bindPermission");
jest.mock("../../src/utils/privateBackend");

describe("handleRequest", () => {
    const mockGetBody = getBodyModule.getBody as jest.MockedFunction<typeof getBodyModule.getBody>;
    const mockPerformValidation = validateModule.performValidation as jest.MockedFunction<typeof validateModule.performValidation>;
    const mockBindSingleApp = bindAppModule.bindSingleApp as jest.MockedFunction<typeof bindAppModule.bindSingleApp>;
    const mockBindSingleAppOptional = bindAppModule.bindSingleAppOptional as jest.MockedFunction<typeof bindAppModule.bindSingleAppOptional>;
    const mockBindMultiApp = bindAppModule.bindMultiApp as jest.MockedFunction<typeof bindAppModule.bindMultiApp>;
    const mockBindMultiAppOptional = bindAppModule.bindMultiAppOptional as jest.MockedFunction<typeof bindAppModule.bindMultiAppOptional>;
    const mockBindUser = bindUserModule.bindUser as jest.MockedFunction<typeof bindUserModule.bindUser>;
    const mockBindPermission = bindPermissionModule.bindPermission as jest.MockedFunction<typeof bindPermissionModule.bindPermission>;
    const mockEnforcePermission = bindPermissionModule.enforcePermission as jest.MockedFunction<typeof bindPermissionModule.enforcePermission>;
    const mockGetPermissionWarning = bindPermissionModule.getPermissionWarning as jest.MockedFunction<typeof bindPermissionModule.getPermissionWarning>;
    const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.MockedFunction<typeof privateBackendModule.isPrivateBackend>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetBody.mockResolvedValue({ data: "test" });
        mockPerformValidation.mockImplementation(() => undefined);
        mockBindSingleApp.mockResolvedValue(undefined);
        mockBindSingleAppOptional.mockResolvedValue(undefined);
        mockBindMultiApp.mockResolvedValue(undefined);
        mockBindMultiAppOptional.mockResolvedValue(undefined);
        mockBindUser.mockImplementation(() => undefined);
        mockBindPermission.mockResolvedValue(undefined);
        mockEnforcePermission.mockImplementation(() => undefined);
        mockGetPermissionWarning.mockReturnValue(undefined);
        mockIsPrivateBackend.mockReturnValue(false);
    });

    const createMockHttpRequest = (overrides: Partial<HttpRequest> = {}): HttpRequest => {
        return {
            headers: new Map([["content-type", "application/json"]]) as any,
            query: new URLSearchParams(),
            params: { id: "123" },
            url: "http://test.com/api/test",
            method: "POST",
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

    describe("successful request handling", () => {
        it("should call getBody with the request", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockGetBody).toHaveBeenCalledWith(request);
        });

        it("should call handler with constructed AzureHttpRequest", async () => {
            const mockBody = { name: "test" };
            mockGetBody.mockResolvedValue(mockBody);
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ result: "ok" });
            const request = createMockHttpRequest({
                params: { userId: "456" },
                query: new URLSearchParams("page=1"),
            });

            await handleRequest(handler, request);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: request.headers,
                    params: { userId: "456" },
                    body: mockBody,
                    query: expect.any(URLSearchParams),
                    setHeader: expect.any(Function),
                    setStatus: expect.any(Function),
                })
            );
        });

        it("should return 200 OK status by default", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ data: "success" });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.Success_200_OK);
        });

        it("should return JSON stringified object response", async () => {
            const responseData = { id: 1, name: "test" };
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue(responseData);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe(JSON.stringify(responseData));
        });

        it("should return string response as-is", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue("Plain text response");
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("Plain text response");
        });

        it("should return undefined body for non-string non-object responses", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue(undefined);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBeUndefined();
        });

        it("should return undefined body for number responses", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue(42 as any);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBeUndefined();
        });

        it("should return undefined body for boolean responses", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue(true as any);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBeUndefined();
        });
    });

    describe("setHeader functionality", () => {
        it("should allow handler to set custom headers", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.setHeader("X-Custom-Header", "custom-value");
                req.setHeader("X-Another-Header", "another-value");
                return { success: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.headers).toEqual({
                "X-Custom-Header": "custom-value",
                "X-Another-Header": "another-value",
            });
        });

        it("should return empty headers object when no headers set", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ data: "test" });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.headers).toEqual({});
        });
    });

    describe("setStatus functionality", () => {
        it("should allow handler to set custom status code", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.setStatus(HttpStatusCode.Success_201_Created);
                return { id: 1 };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.Success_201_Created);
        });

        it("should allow handler to set 204 No Content status", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.setStatus(HttpStatusCode.Success_204_NoContent);
                return undefined;
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.Success_204_NoContent);
        });
    });

    describe("validation", () => {
        it("should call performValidation when handler has validators", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const validators: PayloadValidator<{ name: string }>[] = [{ name: "string" }];
            handler[ValidatorSymbol] = validators;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockPerformValidation).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: { data: "test" },
                }),
                ...validators
            );
        });

        it("should not call performValidation when handler has no validators", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockPerformValidation).not.toHaveBeenCalled();
        });

        it("should handle validation with request validator function", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const requestValidator: RequestValidator = jest.fn().mockReturnValue(undefined);
            handler[ValidatorSymbol] = [requestValidator];
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockPerformValidation).toHaveBeenCalledWith(expect.any(Object), requestValidator);
        });
    });

    describe("error handling", () => {
        it("should return ErrorResponse status and message when handler throws ErrorResponse", async () => {
            const handler: AzureHttpHandler = jest.fn().mockRejectedValue(new ErrorResponse("Not found", 404));
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(404);
            expect(result.body).toBe("Not found");
        });

        it("should return 400 Bad Request when validation throws ErrorResponse", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[ValidatorSymbol] = [{ name: "string" }];
            mockPerformValidation.mockImplementation(() => {
                throw new ErrorResponse("Invalid property", HttpStatusCode.ClientError_400_BadRequest);
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(result.body).toBe("Invalid property");
        });

        it("should return 500 Internal Server Error when ErrorResponse has default status", async () => {
            const handler: AzureHttpHandler = jest.fn().mockRejectedValue(new ErrorResponse("Server error"));
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(500);
            expect(result.body).toBe("Server error");
        });

        it("should return undefined when non-ErrorResponse error is thrown", async () => {
            const handler: AzureHttpHandler = jest.fn().mockRejectedValue(new Error("Unexpected error"));
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result).toBeUndefined();
        });

        it("should return undefined when handler throws a string", async () => {
            const handler: AzureHttpHandler = jest.fn().mockRejectedValue("Something went wrong");
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result).toBeUndefined();
        });
    });

    describe("request object construction", () => {
        it("should pass query params correctly", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({});
            const queryParams = new URLSearchParams("filter=active&sort=name");
            const request = createMockHttpRequest({ query: queryParams });

            await handleRequest(handler, request);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: queryParams,
                })
            );
        });

        it("should pass URL params correctly", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({});
            const params = { id: "123", userId: "456" };
            const request = createMockHttpRequest({ params });

            await handleRequest(handler, request);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params,
                })
            );
        });

        it("should pass headers correctly", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({});
            const headers = new Map([
                ["authorization", "Bearer token123"],
                ["content-type", "application/json"],
            ]);
            const request = createMockHttpRequest({ headers: headers as any });

            await handleRequest(handler, request);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: headers,
                })
            );
        });
    });

    describe("response serialization", () => {
        it("should serialize null object to JSON", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue(null);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("null");
        });

        it("should serialize array to JSON", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue([1, 2, 3]);
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("[1,2,3]");
        });

        it("should serialize nested object to JSON", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({
                user: { name: "John", roles: ["admin", "user"] },
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe('{"user":{"name":"John","roles":["admin","user"]}}');
        });

        it("should handle empty string response", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue("");
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("");
        });
    });

    describe("app binding", () => {
        it("should call bindSingleApp when handler has SingleAppHttpRequestSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(mockBindSingleApp).toHaveBeenCalledWith(
                expect.any(Object),
                { appId: "test-app" },
                false // skipAuth
            );
        });

        it("should not call bindSingleApp when handler does not have SingleAppHttpRequestSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindSingleApp).not.toHaveBeenCalled();
        });

        it("should call bindMultiApp when handler has MultiAppHttpRequestSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiApp).toHaveBeenCalledWith(expect.any(Object), false);
        });

        it("should not call bindMultiApp when handler does not have MultiAppHttpRequestSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiApp).not.toHaveBeenCalled();
        });

        it("should call validation before bindUser and bindSingleApp", async () => {
            const callOrder: string[] = [];
            mockBindSingleApp.mockImplementation(async () => {
                callOrder.push("bindSingleApp");
            });
            mockPerformValidation.mockImplementation(() => {
                callOrder.push("performValidation");
            });
            mockBindUser.mockImplementation(() => {
                callOrder.push("bindUser");
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            handler[ValidatorSymbol] = [{ name: "string" }];
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(callOrder).toEqual(["performValidation", "bindUser", "bindSingleApp"]);
        });

        it("should return 404 when bindSingleApp throws ErrorResponse", async () => {
            mockBindSingleApp.mockRejectedValue(
                new ErrorResponse("App not found", HttpStatusCode.ClientError_404_NotFound)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "non-existent" } });

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_404_NotFound);
            expect(result.body).toBe("App not found");
        });

        it("should return 404 when bindMultiApp throws ErrorResponse", async () => {
            mockBindMultiApp.mockRejectedValue(
                new ErrorResponse("App not found", HttpStatusCode.ClientError_404_NotFound)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_404_NotFound);
            expect(result.body).toBe("App not found");
        });

        it("should not call handler when bindSingleApp throws", async () => {
            mockBindSingleApp.mockRejectedValue(
                new ErrorResponse("App not found", HttpStatusCode.ClientError_404_NotFound)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "non-existent" } });

            await handleRequest(handler, request);

            expect(handler).not.toHaveBeenCalled();
        });

        it("should call bindSingleAppOptional when handler has SingleAppHttpRequestOptionalSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestOptionalSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(mockBindSingleAppOptional).toHaveBeenCalledWith(
                expect.any(Object),
                { appId: "test-app" },
                false // skipAuth
            );
            expect(mockBindSingleApp).not.toHaveBeenCalled();
        });

        it("should not call bindSingleAppOptional when handler does not have SingleAppHttpRequestOptionalSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindSingleAppOptional).not.toHaveBeenCalled();
        });

        it("should call bindMultiAppOptional when handler has MultiAppHttpRequestOptionalSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestOptionalSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiAppOptional).toHaveBeenCalledWith(expect.any(Object), false);
            expect(mockBindMultiApp).not.toHaveBeenCalled();
        });

        it("should not call bindMultiAppOptional when handler does not have MultiAppHttpRequestOptionalSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiAppOptional).not.toHaveBeenCalled();
        });

        it("should pass skipAuth=true to bindSingleApp when handler has SkipAuthorizationSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            handler[SkipAuthorizationSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(mockBindSingleApp).toHaveBeenCalledWith(
                expect.any(Object),
                { appId: "test-app" },
                true // skipAuth
            );
        });

        it("should pass skipAuth=true to bindMultiApp when handler has SkipAuthorizationSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestSymbol] = true;
            handler[SkipAuthorizationSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiApp).toHaveBeenCalledWith(expect.any(Object), true);
        });

        it("should pass skipAuth=true to bindSingleAppOptional when handler has SkipAuthorizationSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestOptionalSymbol] = true;
            handler[SkipAuthorizationSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(mockBindSingleAppOptional).toHaveBeenCalledWith(
                expect.any(Object),
                { appId: "test-app" },
                true // skipAuth
            );
        });

        it("should pass skipAuth=true to bindMultiAppOptional when handler has SkipAuthorizationSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestOptionalSymbol] = true;
            handler[SkipAuthorizationSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindMultiAppOptional).toHaveBeenCalledWith(expect.any(Object), true);
        });

        it("should return 404 when bindSingleAppOptional throws ErrorResponse", async () => {
            mockBindSingleAppOptional.mockRejectedValue(
                new ErrorResponse("App not found", HttpStatusCode.ClientError_404_NotFound)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestOptionalSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "non-existent" } });

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_404_NotFound);
            expect(result.body).toBe("App not found");
        });

        it("should return 404 when bindMultiAppOptional throws ErrorResponse", async () => {
            mockBindMultiAppOptional.mockRejectedValue(
                new ErrorResponse("App not found", HttpStatusCode.ClientError_404_NotFound)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[MultiAppHttpRequestOptionalSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_404_NotFound);
            expect(result.body).toBe("App not found");
        });
    });

    describe("markAsChanged and _appInfo augmentation", () => {
        it("should provide markAsChanged function to handler", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                expect(typeof req.markAsChanged).toBe("function");
                return { success: true };
            });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(handler).toHaveBeenCalled();
        });

        it("should augment response with _appInfo when markAsChanged is called", async () => {
            const appData = {
                codeunit: [1, 2, 3],
                table: [100, 200],
            };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return { updated: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body.updated).toBe(true);
            expect(body._appInfo).toEqual({
                codeunit: [1, 2, 3],
                table: [100, 200],
            });
        });

        it("should strip _authorization from _appInfo", async () => {
            const appData = {
                _authorization: { key: "secret-key", valid: true },
                codeunit: [1, 2, 3],
            };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return { updated: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body._appInfo).toEqual({ codeunit: [1, 2, 3] });
            expect(body._appInfo._authorization).toBeUndefined();
        });

        it("should strip _ranges from _appInfo", async () => {
            const appData = {
                _ranges: [{ from: 50000, to: 59999 }],
                codeunit: [1, 2, 3],
            };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return { updated: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body._appInfo).toEqual({ codeunit: [1, 2, 3] });
            expect(body._appInfo._ranges).toBeUndefined();
        });

        it("should strip both _authorization and _ranges from _appInfo", async () => {
            const appData = {
                _authorization: { key: "secret" },
                _ranges: [{ from: 1, to: 100 }],
                codeunit: [50000, 50001],
                table: [100],
            };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return { id: 50002 };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body.id).toBe(50002);
            expect(body._appInfo).toEqual({
                codeunit: [50000, 50001],
                table: [100],
            });
        });

        it("should not augment response when markAsChanged is not called", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ updated: false });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body).toEqual({ updated: false });
            expect(body._appInfo).toBeUndefined();
        });

        it("should not augment response when handler returns string", async () => {
            const appData = { codeunit: [1, 2, 3] };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return "plain text response";
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("plain text response");
        });

        it("should not augment response when handler returns null", async () => {
            const appData = { codeunit: [1, 2, 3] };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return null;
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            // null is still JSON serialized
            expect(result.body).toBe("null");
        });

        it("should handle markAsChanged with empty app data", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged({});
                return { updated: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body.updated).toBe(true);
            expect(body._appInfo).toEqual({});
        });

        it("should use the last markAsChanged call if called multiple times", async () => {
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged({ codeunit: [1] });
                req.markAsChanged({ codeunit: [1, 2, 3] });
                return { updated: true };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body._appInfo).toEqual({ codeunit: [1, 2, 3] });
        });

        it("should preserve all handler response properties when augmenting with _appInfo", async () => {
            const appData = { codeunit: [50000] };
            const handler: AzureHttpHandler = jest.fn().mockImplementation((req) => {
                req.markAsChanged(appData);
                return {
                    updated: true,
                    id: 50001,
                    available: true,
                    hasConsumption: false,
                };
            });
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body).toEqual({
                updated: true,
                id: 50001,
                available: true,
                hasConsumption: false,
                _appInfo: { codeunit: [50000] },
            });
        });
    });

    describe("user binding", () => {
        it("should call bindUser for all requests", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindUser).toHaveBeenCalledWith(expect.any(Object));
        });

        it("should call bindUser after validation", async () => {
            const callOrder: string[] = [];
            mockPerformValidation.mockImplementation(() => {
                callOrder.push("performValidation");
            });
            mockBindUser.mockImplementation(() => {
                callOrder.push("bindUser");
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[ValidatorSymbol] = [{ name: "string" }];
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(callOrder).toEqual(["performValidation", "bindUser"]);
        });

        it("should call bindUser before app binding", async () => {
            const callOrder: string[] = [];
            mockBindUser.mockImplementation(() => {
                callOrder.push("bindUser");
            });
            mockBindSingleApp.mockImplementation(async () => {
                callOrder.push("bindSingleApp");
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[SingleAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(callOrder).toEqual(["bindUser", "bindSingleApp"]);
        });

        it("should call bindUser even when no app binding is required", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindUser).toHaveBeenCalled();
            expect(mockBindSingleApp).not.toHaveBeenCalled();
            expect(mockBindMultiApp).not.toHaveBeenCalled();
        });
    });

    describe("permission checking", () => {
        it("should call bindPermission and enforcePermission when handler has PermissionCheckSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindPermission).toHaveBeenCalledWith(expect.any(Object));
            expect(mockEnforcePermission).toHaveBeenCalledWith(expect.any(Object));
        });

        it("should not call bindPermission when handler does not have PermissionCheckSymbol", async () => {
            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(mockBindPermission).not.toHaveBeenCalled();
            expect(mockEnforcePermission).not.toHaveBeenCalled();
        });

        it("should call permission check after bindUser", async () => {
            const callOrder: string[] = [];
            mockBindUser.mockImplementation(() => {
                callOrder.push("bindUser");
            });
            mockBindPermission.mockImplementation(async () => {
                callOrder.push("bindPermission");
            });
            mockEnforcePermission.mockImplementation(() => {
                callOrder.push("enforcePermission");
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            await handleRequest(handler, request);

            expect(callOrder).toEqual(["bindUser", "bindPermission", "enforcePermission"]);
        });

        it("should call permission check before app binding", async () => {
            const callOrder: string[] = [];
            mockBindPermission.mockImplementation(async () => {
                callOrder.push("bindPermission");
            });
            mockEnforcePermission.mockImplementation(() => {
                callOrder.push("enforcePermission");
            });
            mockBindSingleApp.mockImplementation(async () => {
                callOrder.push("bindSingleApp");
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[PermissionCheckSymbol] = true;
            handler[SingleAppHttpRequestSymbol] = true;
            const request = createMockHttpRequest({ params: { appId: "test-app" } });

            await handleRequest(handler, request);

            expect(callOrder).toEqual(["bindPermission", "enforcePermission", "bindSingleApp"]);
        });

        it("should return 400 when bindPermission throws ErrorResponse (missing header)", async () => {
            mockBindPermission.mockRejectedValue(
                new ErrorResponse("Ninja-App-Id header is required", HttpStatusCode.ClientError_400_BadRequest)
            );

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
            expect(result.body).toBe("Ninja-App-Id header is required");
            expect(handler).not.toHaveBeenCalled();
        });

        it("should return 403 when enforcePermission throws ErrorResponse (denied)", async () => {
            mockEnforcePermission.mockImplementation(() => {
                throw new ErrorResponse(
                    JSON.stringify({ error: { code: "GRACE_EXPIRED" } }),
                    HttpStatusCode.ClientError_403_Forbidden
                );
            });

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.status).toBe(HttpStatusCode.ClientError_403_Forbidden);
            const body = JSON.parse(result.body as string);
            expect(body.error.code).toBe("GRACE_EXPIRED");
            expect(handler).not.toHaveBeenCalled();
        });

        it("should add warning to response body when getPermissionWarning returns warning", async () => {
            const warning = { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 };
            mockGetPermissionWarning.mockReturnValue(warning as any);

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ updated: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body.updated).toBe(true);
            expect(body.warning).toEqual(warning);
        });

        it("should not add warning to response when getPermissionWarning returns undefined", async () => {
            mockGetPermissionWarning.mockReturnValue(undefined);

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ updated: true });
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            const body = JSON.parse(result.body as string);
            expect(body.updated).toBe(true);
            expect(body.warning).toBeUndefined();
        });

        it("should not add warning to string response", async () => {
            const warning = { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 };
            mockGetPermissionWarning.mockReturnValue(warning as any);

            const handler: AzureHttpHandler = jest.fn().mockResolvedValue("plain text");
            handler[PermissionCheckSymbol] = true;
            const request = createMockHttpRequest();

            const result = await handleRequest(handler, request);

            expect(result.body).toBe("plain text");
        });
    });

    describe("private backend mode", () => {
        describe("Given: PRIVATE_BACKEND is enabled", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(true);
            });

            it("should skip permission check when handler has PermissionCheckSymbol", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                await handleRequest(handler, request);

                expect(mockBindPermission).not.toHaveBeenCalled();
                expect(mockEnforcePermission).not.toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (400 - missing header)", async () => {
                // In normal mode, this would throw 400 for missing Ninja-App-Id
                mockBindPermission.mockRejectedValue(
                    new ErrorResponse("Ninja-App-Id header is required", HttpStatusCode.ClientError_400_BadRequest)
                );

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                // Should succeed because permission check is skipped
                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (403 - grace expired)", async () => {
                // In normal mode, this would throw 403 for expired grace period
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "GRACE_EXPIRED" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                // Should succeed because permission check is skipped
                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (403 - user not authorized)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "USER_NOT_AUTHORIZED", gitEmail: "user@example.com" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (403 - org flagged)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "ORG_FLAGGED" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (403 - subscription cancelled)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "SUBSCRIPTION_CANCELLED" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should allow request even when permission would normally be denied (403 - payment failed)", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "PAYMENT_FAILED" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.Success_200_OK);
                expect(handler).toHaveBeenCalled();
            });

            it("should not add permission warning to response", async () => {
                const warning = { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 };
                mockGetPermissionWarning.mockReturnValue(warning as any);

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ updated: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.updated).toBe(true);
                expect(body.warning).toBeUndefined();
            });

            it("should still call handler with correct request data", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ id: 50000 });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest({ params: { appId: "test-app" } });

                const result = await handleRequest(handler, request);

                expect(handler).toHaveBeenCalledWith(
                    expect.objectContaining({
                        params: { appId: "test-app" },
                    })
                );
                const body = JSON.parse(result.body as string);
                expect(body.id).toBe(50000);
            });

            it("should still perform validation", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                handler[ValidatorSymbol] = [{ name: "string" }];
                const request = createMockHttpRequest();

                await handleRequest(handler, request);

                expect(mockPerformValidation).toHaveBeenCalled();
            });

            it("should still bind user", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                await handleRequest(handler, request);

                expect(mockBindUser).toHaveBeenCalled();
            });

            it("should still bind app data", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                handler[SingleAppHttpRequestSymbol] = true;
                const request = createMockHttpRequest({ params: { appId: "test-app" } });

                await handleRequest(handler, request);

                expect(mockBindSingleApp).toHaveBeenCalled();
            });
        });

        describe("Given: PRIVATE_BACKEND is disabled (normal mode)", () => {
            beforeEach(() => {
                mockIsPrivateBackend.mockReturnValue(false);
            });

            it("should perform permission check when handler has PermissionCheckSymbol", async () => {
                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                await handleRequest(handler, request);

                expect(mockBindPermission).toHaveBeenCalled();
                expect(mockEnforcePermission).toHaveBeenCalled();
            });

            it("should return 400 when Ninja-App-Id header is missing", async () => {
                mockBindPermission.mockRejectedValue(
                    new ErrorResponse("Ninja-App-Id header is required", HttpStatusCode.ClientError_400_BadRequest)
                );

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.ClientError_400_BadRequest);
                expect(handler).not.toHaveBeenCalled();
            });

            it("should return 403 when permission is denied", async () => {
                mockEnforcePermission.mockImplementation(() => {
                    throw new ErrorResponse(
                        JSON.stringify({ error: { code: "GRACE_EXPIRED" } }),
                        HttpStatusCode.ClientError_403_Forbidden
                    );
                });

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ success: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                expect(result.status).toBe(HttpStatusCode.ClientError_403_Forbidden);
                expect(handler).not.toHaveBeenCalled();
            });

            it("should add permission warning to response when present", async () => {
                const warning = { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 };
                mockGetPermissionWarning.mockReturnValue(warning as any);

                const handler: AzureHttpHandler = jest.fn().mockResolvedValue({ updated: true });
                handler[PermissionCheckSymbol] = true;
                const request = createMockHttpRequest();

                const result = await handleRequest(handler, request);

                const body = JSON.parse(result.body as string);
                expect(body.warning).toEqual(warning);
            });
        });
    });
});
