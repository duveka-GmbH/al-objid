import {
    OptionalSymbol,
    ArraySymbol,
    ValidatorSymbol,
    JavaScriptType,
    OptionalValidator,
    ArrayValidator,
    PropertyValidator,
    PropertyValidatorFunction,
    RequestValidator,
    PayloadValidator,
    Validator,
} from "../../src/http/validationTypes";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";

describe("validationTypes", () => {
    describe("symbols", () => {
        describe("OptionalSymbol", () => {
            it("should be a unique symbol", () => {
                expect(typeof OptionalSymbol).toBe("symbol");
            });

            it("should have description __optional__", () => {
                expect(OptionalSymbol.description).toBe("__optional__");
            });

            it("should be consistent across imports", () => {
                const sym1 = OptionalSymbol;
                const sym2 = OptionalSymbol;
                expect(sym1).toBe(sym2);
            });
        });

        describe("ArraySymbol", () => {
            it("should be a unique symbol", () => {
                expect(typeof ArraySymbol).toBe("symbol");
            });

            it("should have description __array__", () => {
                expect(ArraySymbol.description).toBe("__array__");
            });

            it("should be consistent across imports", () => {
                const sym1 = ArraySymbol;
                const sym2 = ArraySymbol;
                expect(sym1).toBe(sym2);
            });
        });

        describe("ValidatorSymbol", () => {
            it("should be a unique symbol", () => {
                expect(typeof ValidatorSymbol).toBe("symbol");
            });

            it("should have description __validator__", () => {
                expect(ValidatorSymbol.description).toBe("__validator__");
            });

            it("should be consistent across imports", () => {
                const sym1 = ValidatorSymbol;
                const sym2 = ValidatorSymbol;
                expect(sym1).toBe(sym2);
            });
        });

        describe("symbol uniqueness", () => {
            it("should have different symbols for Optional, Array, and Validator", () => {
                expect(OptionalSymbol).not.toBe(ArraySymbol);
                expect(OptionalSymbol).not.toBe(ValidatorSymbol);
                expect(ArraySymbol).not.toBe(ValidatorSymbol);
            });
        });
    });

    describe("type interfaces and usage", () => {
        describe("JavaScriptType", () => {
            it("should accept valid JavaScript type strings", () => {
                const stringType: JavaScriptType = "string";
                const booleanType: JavaScriptType = "boolean";
                const numberType: JavaScriptType = "number";
                const objectType: JavaScriptType = "object";

                expect(stringType).toBe("string");
                expect(booleanType).toBe("boolean");
                expect(numberType).toBe("number");
                expect(objectType).toBe("object");
            });
        });

        describe("OptionalValidator", () => {
            it("should be constructable with OptionalSymbol and validator", () => {
                const optionalValidator: OptionalValidator = {
                    [OptionalSymbol]: true,
                    validator: "string",
                };

                expect(optionalValidator[OptionalSymbol]).toBe(true);
                expect(optionalValidator.validator).toBe("string");
            });

            it("should support nested validators", () => {
                const nestedValidator: PayloadValidator<{ name: string }> = { name: "string" };
                const optionalValidator: OptionalValidator = {
                    [OptionalSymbol]: true,
                    validator: nestedValidator,
                };

                expect(optionalValidator[OptionalSymbol]).toBe(true);
                expect(optionalValidator.validator).toBe(nestedValidator);
            });
        });

        describe("ArrayValidator", () => {
            it("should be constructable with ArraySymbol and validator", () => {
                const arrayValidator: ArrayValidator = {
                    [ArraySymbol]: true,
                    validator: "number",
                };

                expect(arrayValidator[ArraySymbol]).toBe(true);
                expect(arrayValidator.validator).toBe("number");
            });

            it("should support nested validators", () => {
                const nestedValidator: PayloadValidator<{ id: number }> = { id: "number" };
                const arrayValidator: ArrayValidator = {
                    [ArraySymbol]: true,
                    validator: nestedValidator,
                };

                expect(arrayValidator[ArraySymbol]).toBe(true);
                expect(arrayValidator.validator).toBe(nestedValidator);
            });
        });

        describe("PropertyValidatorFunction", () => {
            it("should work as a function returning undefined for valid input", () => {
                const validator: PropertyValidatorFunction = (value: any) => {
                    if (typeof value === "string") return undefined;
                    return "Expected string";
                };

                expect(validator("test", {})).toBeUndefined();
            });

            it("should work as a function returning error string for invalid input", () => {
                const validator: PropertyValidatorFunction = (value: any) => {
                    if (typeof value === "string") return undefined;
                    return "Expected string";
                };

                expect(validator(123, {})).toBe("Expected string");
            });

            it("should receive value and entity parameters", () => {
                const mockFn = jest.fn().mockReturnValue(undefined);
                const validator: PropertyValidatorFunction = mockFn;
                const entity = { name: "test", value: 42 };

                validator("testValue", entity);

                expect(mockFn).toHaveBeenCalledWith("testValue", entity);
            });
        });

        describe("RequestValidator", () => {
            it("should work as a function taking AzureHttpRequest", () => {
                const validator: RequestValidator = (request: AzureHttpRequest) => {
                    if (request.body) return undefined;
                    return "Body is required";
                };

                const mockRequest: AzureHttpRequest = {
                    method: "POST",
                    headers: new Map() as any,
                    params: {},
                    body: { data: "test" },
                    query: new URLSearchParams(),
                    setHeader: jest.fn(),
                    setStatus: jest.fn(),
                    markAsChanged: jest.fn(),
                };

                expect(validator(mockRequest)).toBeUndefined();
            });

            it("should return error string when validation fails", () => {
                const validator: RequestValidator = (request: AzureHttpRequest) => {
                    if (request.body) return undefined;
                    return "Body is required";
                };

                const mockRequest: AzureHttpRequest = {
                    method: "POST",
                    headers: new Map() as any,
                    params: {},
                    body: null,
                    query: new URLSearchParams(),
                    setHeader: jest.fn(),
                    setStatus: jest.fn(),
                    markAsChanged: jest.fn(),
                };

                expect(validator(mockRequest)).toBe("Body is required");
            });
        });

        describe("PayloadValidator", () => {
            it("should define validators for object properties", () => {
                interface User {
                    name: string;
                    age: number;
                    active: boolean;
                }

                const validator: PayloadValidator<User> = {
                    name: "string",
                    age: "number",
                    active: "boolean",
                };

                expect(validator.name).toBe("string");
                expect(validator.age).toBe("number");
                expect(validator.active).toBe("boolean");
            });

            it("should support function validators for properties", () => {
                const emailValidator: PropertyValidatorFunction = (value) => {
                    if (value.includes("@")) return undefined;
                    return "Invalid email";
                };

                const validator: PayloadValidator<{ email: string }> = {
                    email: emailValidator,
                };

                expect(typeof validator.email).toBe("function");
            });

            it("should support nested PayloadValidator", () => {
                interface Address {
                    street: string;
                    city: string;
                }
                interface User {
                    name: string;
                    address: Address;
                }

                const addressValidator: PayloadValidator<Address> = {
                    street: "string",
                    city: "string",
                };

                const validator: PayloadValidator<User> = {
                    name: "string",
                    address: addressValidator,
                };

                expect(validator.name).toBe("string");
                expect(validator.address).toBe(addressValidator);
            });
        });

        describe("PropertyValidator", () => {
            it("should accept JavaScriptType", () => {
                const validator: PropertyValidator = "string";
                expect(validator).toBe("string");
            });

            it("should accept PropertyValidatorFunction", () => {
                const fn: PropertyValidatorFunction = () => undefined;
                const validator: PropertyValidator = fn;
                expect(validator).toBe(fn);
            });

            it("should accept PayloadValidator", () => {
                const payload: PayloadValidator<{ id: number }> = { id: "number" };
                const validator: PropertyValidator = payload;
                expect(validator).toBe(payload);
            });

            it("should accept OptionalValidator", () => {
                const optional: OptionalValidator = { [OptionalSymbol]: true, validator: "string" };
                const validator: PropertyValidator = optional;
                expect(validator).toBe(optional);
            });

            it("should accept ArrayValidator", () => {
                const array: ArrayValidator = { [ArraySymbol]: true, validator: "string" };
                const validator: PropertyValidator = array;
                expect(validator).toBe(array);
            });
        });

        describe("Validator", () => {
            it("should accept PayloadValidator", () => {
                const payload: PayloadValidator<{ name: string }> = { name: "string" };
                const validator: Validator<{ name: string }> = payload;
                expect(validator).toBe(payload);
            });

            it("should accept RequestValidator", () => {
                const requestValidator: RequestValidator = () => undefined;
                const validator: Validator<any> = requestValidator;
                expect(validator).toBe(requestValidator);
            });
        });
    });

    describe("symbol usage in objects", () => {
        it("should allow using OptionalSymbol as object key", () => {
            const obj = {
                [OptionalSymbol]: true,
                validator: "string",
            };

            expect(obj[OptionalSymbol]).toBe(true);
            expect(OptionalSymbol in obj).toBe(true);
        });

        it("should allow using ArraySymbol as object key", () => {
            const obj = {
                [ArraySymbol]: true,
                validator: "number",
            };

            expect(obj[ArraySymbol]).toBe(true);
            expect(ArraySymbol in obj).toBe(true);
        });

        it("should allow using ValidatorSymbol as function property key", () => {
            const handler = () => {};
            (handler as any)[ValidatorSymbol] = [{ name: "string" }];

            expect((handler as any)[ValidatorSymbol]).toEqual([{ name: "string" }]);
            expect(ValidatorSymbol in handler).toBe(true);
        });

        it("should not confuse different symbol keys", () => {
            const obj = {
                [OptionalSymbol]: "optional",
                [ArraySymbol]: "array",
            };

            expect(obj[OptionalSymbol]).toBe("optional");
            expect(obj[ArraySymbol]).toBe("array");
        });
    });
});
