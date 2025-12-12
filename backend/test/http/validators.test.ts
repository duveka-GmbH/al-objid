import { params, array, optional, arrayOrEntity } from "../../src/http/validators";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ArrayOrEntitySymbol, ArraySymbol, OptionalSymbol } from "../../src/http/validationTypes";

describe("validators", () => {
    const createMockRequest = (params: Record<string, any> = {}): AzureHttpRequest => ({
        method: "GET",
        headers: new Map() as any,
        params,
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    });

    describe("params", () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it("should return a RequestValidator function", () => {
            const validator = params("id");

            expect(typeof validator).toBe("function");
        });

        it("should return undefined when all required params are present as strings", () => {
            const validator = params("id", "name");
            const request = createMockRequest({ id: "123", name: "test" });

            const result = validator(request);

            expect(result).toBeUndefined();
        });

        it("should return error message when a required param is missing", () => {
            const validator = params("id", "name");
            const request = createMockRequest({ id: "123" });

            const result = validator(request);

            expect(result).toBe('Missing required parameter "name"');
        });

        it("should return error message when param is undefined", () => {
            const validator = params("id");
            const request = createMockRequest({ id: undefined });

            const result = validator(request);

            expect(result).toBe('Missing required parameter "id"');
        });

        it("should return error message when param is not a string", () => {
            const validator = params("id");
            const request = createMockRequest({ id: 123 });

            const result = validator(request);

            expect(result).toBe('Missing required parameter "id"');
        });

        it("should return error message when param is null", () => {
            const validator = params("id");
            const request = createMockRequest({ id: null });

            const result = validator(request);

            expect(result).toBe('Missing required parameter "id"');
        });

        it("should return undefined when no params are required", () => {
            const validator = params();
            const request = createMockRequest({});

            const result = validator(request);

            expect(result).toBeUndefined();
        });

        it("should validate single param", () => {
            const validator = params("userId");
            const request = createMockRequest({ userId: "abc123" });

            const result = validator(request);

            expect(result).toBeUndefined();
        });

        it("should validate multiple params and fail on first missing", () => {
            const validator = params("a", "b", "c");
            const request = createMockRequest({ a: "1", c: "3" });

            const result = validator(request);

            expect(result).toBe('Missing required parameter "b"');
        });

        it("should pass with empty string param (valid string)", () => {
            const validator = params("id");
            const request = createMockRequest({ id: "" });

            const result = validator(request);

            expect(result).toBeUndefined();
        });
    });

    describe("array", () => {
        it("should return an ArrayValidator object", () => {
            const validator = array("string");

            expect(ArraySymbol in validator).toBe(true);
            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap string type validator", () => {
            const validator = array("string");

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap number type validator", () => {
            const validator = array("number");

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe("number");
        });

        it("should wrap boolean type validator", () => {
            const validator = array("boolean");

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe("boolean");
        });

        it("should wrap object type validator", () => {
            const validator = array("object");

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe("object");
        });

        it("should wrap PayloadValidator for nested objects", () => {
            const nestedValidator = { name: "string" as const, age: "number" as const };
            const validator = array(nestedValidator);

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe(nestedValidator);
        });

        it("should wrap function validator", () => {
            const fnValidator = (value: any) => (typeof value === "string" ? undefined : "Invalid");
            const validator = array(fnValidator);

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe(fnValidator);
        });

        it("should support nested arrays", () => {
            const innerArray = array("string");
            const validator = array(innerArray);

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe(innerArray);
            expect((validator.validator as any)[ArraySymbol]).toBe(true);
        });

        it("should support optional inside array", () => {
            const optionalValidator = optional("string");
            const validator = array(optionalValidator);

            expect(validator[ArraySymbol]).toBe(true);
            expect(validator.validator).toBe(optionalValidator);
        });
    });

    describe("optional", () => {
        it("should return an OptionalValidator object", () => {
            const validator = optional("string");

            expect(OptionalSymbol in validator).toBe(true);
            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap string type validator", () => {
            const validator = optional("string");

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap number type validator", () => {
            const validator = optional("number");

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe("number");
        });

        it("should wrap boolean type validator", () => {
            const validator = optional("boolean");

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe("boolean");
        });

        it("should wrap object type validator", () => {
            const validator = optional("object");

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe("object");
        });

        it("should wrap PayloadValidator for nested objects", () => {
            const nestedValidator = { email: "string" as const };
            const validator = optional(nestedValidator);

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe(nestedValidator);
        });

        it("should wrap function validator", () => {
            const fnValidator = (value: any) => (value > 0 ? undefined : "Must be positive");
            const validator = optional(fnValidator);

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe(fnValidator);
        });

        it("should support array inside optional", () => {
            const arrayValidator = array("string");
            const validator = optional(arrayValidator);

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe(arrayValidator);
            expect((validator.validator as any)[ArraySymbol]).toBe(true);
        });

        it("should support nested optional (though unusual)", () => {
            const innerOptional = optional("number");
            const validator = optional(innerOptional);

            expect(validator[OptionalSymbol]).toBe(true);
            expect(validator.validator).toBe(innerOptional);
            expect((validator.validator as any)[OptionalSymbol]).toBe(true);
        });
    });

    describe("arrayOrEntity", () => {
        it("should return an ArrayOrEntityValidator object", () => {
            const validator = arrayOrEntity("string");

            expect(ArrayOrEntitySymbol in validator).toBe(true);
            expect(validator[ArrayOrEntitySymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap string type validator", () => {
            const validator = arrayOrEntity("string");

            expect(validator[ArrayOrEntitySymbol]).toBe(true);
            expect(validator.validator).toBe("string");
        });

        it("should wrap PayloadValidator for nested objects", () => {
            const nestedValidator = { name: "string" as const };
            const validator = arrayOrEntity(nestedValidator);

            expect(validator[ArrayOrEntitySymbol]).toBe(true);
            expect(validator.validator).toBe(nestedValidator);
        });

        it("should wrap function validator", () => {
            const fnValidator = (value: any) => (value ? undefined : "Error");
            const validator = arrayOrEntity(fnValidator);

            expect(validator[ArrayOrEntitySymbol]).toBe(true);
            expect(validator.validator).toBe(fnValidator);
        });
    });
});
