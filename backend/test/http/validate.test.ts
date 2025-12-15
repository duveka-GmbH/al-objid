import { validate, performValidation } from "../../src/http/validate";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ValidatorSymbol, OptionalSymbol, ArraySymbol, ArrayOrEntitySymbol, PayloadValidator, RequestValidator, PropertyValidatorFunction } from "../../src/http/validationTypes";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";

describe("validate", () => {
    describe("validate function", () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it("should attach validators to handler using ValidatorSymbol", () => {
            const mockHandler: AzureHttpHandler = jest.fn();
            const validator1: PayloadValidator<{ name: string }> = { name: "string" };
            const validator2: PayloadValidator<{ age: number }> = { age: "number" };

            validate(mockHandler, validator1 as any, validator2 as any);

            expect(mockHandler[ValidatorSymbol]).toEqual([validator1, validator2]);
        });

        it("should attach a single validator to handler", () => {
            const mockHandler: AzureHttpHandler = jest.fn();
            const validator: PayloadValidator<{ id: string }> = { id: "string" };

            validate(mockHandler, validator);

            expect(mockHandler[ValidatorSymbol]).toEqual([validator]);
        });

        it("should replace existing validators when called multiple times", () => {
            const mockHandler: AzureHttpHandler = jest.fn();
            const validator1: PayloadValidator<{ name: string }> = { name: "string" };
            const validator2: PayloadValidator<{ age: number }> = { age: "number" };

            validate(mockHandler, validator1);
            validate(mockHandler, validator2);

            expect(mockHandler[ValidatorSymbol]).toEqual([validator2]);
        });
    });
});

describe("performValidation", () => {
    const createMockRequest = (body: any, params: any = {}): AzureHttpRequest => ({
        method: "POST",
        headers: new Map() as any,
        params,
        body,
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    });

    describe("with RequestValidator (function)", () => {
        it("should call request validator function", () => {
            const mockRequest = createMockRequest({ data: "test" });
            const requestValidator: RequestValidator = jest.fn().mockReturnValue(undefined);

            performValidation(mockRequest, requestValidator);

            expect(requestValidator).toHaveBeenCalledWith(mockRequest);
        });

        it("should throw ErrorResponse when request validator returns error message", () => {
            const mockRequest = createMockRequest({ data: "test" });
            const requestValidator: RequestValidator = jest.fn().mockReturnValue("Validation failed");

            expect(() => performValidation(mockRequest, requestValidator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, requestValidator);
            } catch (error) {
                expect(error).toBeInstanceOf(ErrorResponse);
                expect((error as ErrorResponse).message).toBe("Validation failed");
                expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_400_BadRequest);
            }
        });

        it("should not throw when request validator returns undefined", () => {
            const mockRequest = createMockRequest({ data: "test" });
            const requestValidator: RequestValidator = jest.fn().mockReturnValue(undefined);

            expect(() => performValidation(mockRequest, requestValidator)).not.toThrow();
        });
    });

    describe("with PayloadValidator (object)", () => {
        describe("string type validation", () => {
            it("should pass when property is of correct string type", () => {
                const mockRequest = createMockRequest({ name: "John" });
                const validator: PayloadValidator<{ name: string }> = { name: "string" };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when property is not string type", () => {
                const mockRequest = createMockRequest({ name: 123 });
                const validator: PayloadValidator<{ name: string }> = { name: "string" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "name", expected string but got number');
                }
            });

            it("should throw when required property is missing from body", () => {
                const mockRequest = createMockRequest({});
                const validator: PayloadValidator<{ name: string }> = { name: "string" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "name", expected string but got undefined');
                    expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_400_BadRequest);
                }
            });

            it("should throw when required property is explicitly undefined", () => {
                const mockRequest = createMockRequest({ name: undefined });
                const validator: PayloadValidator<{ name: string }> = { name: "string" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "name", expected string but got undefined');
                }
            });

            it("should throw when required property is null", () => {
                const mockRequest = createMockRequest({ name: null });
                const validator: PayloadValidator<{ name: string }> = { name: "string" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "name", expected string but got object');
                }
            });
        });

        describe("number type validation", () => {
            it("should pass when property is of correct number type", () => {
                const mockRequest = createMockRequest({ age: 25 });
                const validator: PayloadValidator<{ age: number }> = { age: "number" };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when property is not number type", () => {
                const mockRequest = createMockRequest({ age: "twenty-five" });
                const validator: PayloadValidator<{ age: number }> = { age: "number" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });
        });

        describe("boolean type validation", () => {
            it("should pass when property is of correct boolean type", () => {
                const mockRequest = createMockRequest({ active: true });
                const validator: PayloadValidator<{ active: boolean }> = { active: "boolean" };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when property is not boolean type", () => {
                const mockRequest = createMockRequest({ active: "yes" });
                const validator: PayloadValidator<{ active: boolean }> = { active: "boolean" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });
        });

        describe("object type validation", () => {
            it("should pass when property is of correct object type", () => {
                const mockRequest = createMockRequest({ data: { nested: "value" } });
                const validator: PayloadValidator<{ data: object }> = { data: "object" };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when property is not object type", () => {
                const mockRequest = createMockRequest({ data: "not an object" });
                const validator: PayloadValidator<{ data: object }> = { data: "object" };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });
        });

        describe("property validator function", () => {
            it("should call property validator function with value and body", () => {
                const mockRequest = createMockRequest({ email: "test@example.com", name: "John" });
                const emailValidator: PropertyValidatorFunction = jest.fn().mockReturnValue(undefined);
                const validator: PayloadValidator<{ email: string }> = { email: emailValidator };

                performValidation(mockRequest, validator);

                expect(emailValidator).toHaveBeenCalledWith("test@example.com", mockRequest.body);
            });

            it("should throw ErrorResponse when property validator returns error string", () => {
                const mockRequest = createMockRequest({ email: "invalid-email" });
                const emailValidator: PropertyValidatorFunction = jest.fn().mockReturnValue("Invalid email format");
                const validator: PayloadValidator<{ email: string }> = { email: emailValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe("Invalid email format");
                    expect((error as ErrorResponse).statusCode).toBe(HttpStatusCode.ClientError_400_BadRequest);
                }
            });

            it("should not throw when property validator returns undefined", () => {
                const mockRequest = createMockRequest({ email: "test@example.com" });
                const emailValidator: PropertyValidatorFunction = jest.fn().mockReturnValue(undefined);
                const validator: PayloadValidator<{ email: string }> = { email: emailValidator };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should validate using returned PayloadValidator when function returns one", () => {
                const mockRequest = createMockRequest({
                    data: { name: "John", age: 30 },
                });
                const dynamicValidator: PropertyValidatorFunction = jest.fn().mockReturnValue({
                    name: "string",
                    age: "number",
                } as PayloadValidator<{ name: string; age: number }>);
                const validator: PayloadValidator<{ data: object }> = { data: dynamicValidator };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
                expect(dynamicValidator).toHaveBeenCalledWith({ name: "John", age: 30 }, mockRequest.body);
            });

            it("should throw when returned PayloadValidator validation fails", () => {
                const mockRequest = createMockRequest({
                    data: { name: 123, age: 30 },
                });
                const dynamicValidator: PropertyValidatorFunction = jest.fn().mockReturnValue({
                    name: "string",
                    age: "number",
                } as PayloadValidator<{ name: string; age: number }>);
                const validator: PayloadValidator<{ data: object }> = { data: dynamicValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "name", expected string but got number');
                }
            });

            it("should throw when function returns PayloadValidator but property value is not an object", () => {
                const mockRequest = createMockRequest({ data: "not an object" });
                const dynamicValidator: PropertyValidatorFunction = jest.fn().mockReturnValue({
                    name: "string",
                } as PayloadValidator<{ name: string }>);
                const validator: PayloadValidator<{ data: object }> = { data: dynamicValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "data", expected object but got string');
                }
            });

            it("should throw when function returns PayloadValidator but property value is null", () => {
                const mockRequest = createMockRequest({ data: null });
                const dynamicValidator: PropertyValidatorFunction = jest.fn().mockReturnValue({
                    name: "string",
                } as PayloadValidator<{ name: string }>);
                const validator: PayloadValidator<{ data: object }> = { data: dynamicValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "data", expected object but got object');
                }
            });

            it("should support polymorphic validation based on discriminator field", () => {
                const mockRequest = createMockRequest({
                    item: { type: "book", title: "1984", author: "Orwell" },
                });
                const bookValidator: PayloadValidator<{ type: string; title: string; author: string }> = {
                    type: "string",
                    title: "string",
                    author: "string",
                };
                const movieValidator: PayloadValidator<{ type: string; title: string; director: string }> = {
                    type: "string",
                    title: "string",
                    director: "string",
                };
                const polymorphicValidator: PropertyValidatorFunction = (value: any) => {
                    if (value.type === "book") return bookValidator;
                    if (value.type === "movie") return movieValidator;
                    return "Unknown item type";
                };
                const validator: PayloadValidator<{ item: object }> = { item: polymorphicValidator };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should fail polymorphic validation when object does not match returned schema", () => {
                const mockRequest = createMockRequest({
                    item: { type: "book", title: "1984" },  // missing 'author'
                });
                const bookValidator: PayloadValidator<{ type: string; title: string; author: string }> = {
                    type: "string",
                    title: "string",
                    author: "string",
                };
                const polymorphicValidator: PropertyValidatorFunction = (value: any) => {
                    if (value.type === "book") return bookValidator;
                    return "Unknown item type";
                };
                const validator: PayloadValidator<{ item: object }> = { item: polymorphicValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "author", expected string but got undefined');
                }
            });

            it("should return error string from polymorphic validator for unknown type", () => {
                const mockRequest = createMockRequest({
                    item: { type: "unknown", data: "test" },
                });
                const polymorphicValidator: PropertyValidatorFunction = (value: any) => {
                    if (value.type === "book") return { title: "string" };
                    return "Unknown item type";
                };
                const validator: PayloadValidator<{ item: object }> = { item: polymorphicValidator };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe("Unknown item type");
                }
            });
        });

        describe("nested object validation (PayloadValidator)", () => {
            it("should validate nested objects recursively", () => {
                const mockRequest = createMockRequest({
                    user: {
                        name: "John",
                        age: 30,
                    },
                });
                const nestedValidator: PayloadValidator<{ name: string; age: number }> = {
                    name: "string",
                    age: "number",
                };
                const validator: PayloadValidator<{ user: { name: string; age: number } }> = {
                    user: nestedValidator,
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when nested property validation fails", () => {
                const mockRequest = createMockRequest({
                    user: {
                        name: 123,
                        age: 30,
                    },
                });
                const nestedValidator: PayloadValidator<{ name: string; age: number }> = {
                    name: "string",
                    age: "number",
                };
                const validator: PayloadValidator<{ user: { name: string; age: number } }> = {
                    user: nestedValidator,
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });

            it("should throw when nested object is null", () => {
                const mockRequest = createMockRequest({ user: null });
                const nestedValidator: PayloadValidator<{ name: string }> = { name: "string" };
                const validator: PayloadValidator<{ user: { name: string } }> = {
                    user: nestedValidator,
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "user", expected object but got object');
                }
            });

            it("should throw when nested object is not an object", () => {
                const mockRequest = createMockRequest({ user: "not an object" });
                const nestedValidator: PayloadValidator<{ name: string }> = { name: "string" };
                const validator: PayloadValidator<{ user: { name: string } }> = {
                    user: nestedValidator,
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "user", expected object but got string');
                }
            });
        });

        describe("OptionalValidator", () => {
            it("should skip validation when optional property is undefined", () => {
                const mockRequest = createMockRequest({ name: "John" });
                const validator: PayloadValidator<{ name: string; nickname?: string }> = {
                    name: "string",
                    nickname: { [OptionalSymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should skip validation when optional property is null", () => {
                const mockRequest = createMockRequest({ name: "John", nickname: null });
                const validator: PayloadValidator<{ name: string; nickname?: string }> = {
                    name: "string",
                    nickname: { [OptionalSymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should validate optional property when it is present", () => {
                const mockRequest = createMockRequest({ name: "John", nickname: "Johnny" });
                const validator: PayloadValidator<{ name: string; nickname?: string }> = {
                    name: "string",
                    nickname: { [OptionalSymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when optional property is present but invalid", () => {
                const mockRequest = createMockRequest({ name: "John", nickname: 123 });
                const validator: PayloadValidator<{ name: string; nickname?: string }> = {
                    name: "string",
                    nickname: { [OptionalSymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });

            it("should validate optional array when present", () => {
                const mockRequest = createMockRequest({ name: "John", tags: ["tag1", "tag2"] });
                const validator: PayloadValidator<{ name: string; tags?: string[] }> = {
                    name: "string",
                    tags: { [OptionalSymbol]: true, validator: { [ArraySymbol]: true, validator: "string" } },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should skip validation when optional array is undefined", () => {
                const mockRequest = createMockRequest({ name: "John" });
                const validator: PayloadValidator<{ name: string; tags?: string[] }> = {
                    name: "string",
                    tags: { [OptionalSymbol]: true, validator: { [ArraySymbol]: true, validator: "string" } },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when optional array is present with invalid elements", () => {
                const mockRequest = createMockRequest({ name: "John", tags: ["valid", 123] });
                const validator: PayloadValidator<{ name: string; tags?: string[] }> = {
                    name: "string",
                    tags: { [OptionalSymbol]: true, validator: { [ArraySymbol]: true, validator: "string" } },
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "tags[1]", expected string but got number');
                }
            });

            it("should validate optional nested object when present", () => {
                const mockRequest = createMockRequest({ 
                    name: "John", 
                    address: { city: "NYC", zip: "10001" } 
                });
                const addressValidator: PayloadValidator<{ city: string; zip: string }> = {
                    city: "string",
                    zip: "string",
                };
                const validator: PayloadValidator<{ name: string; address?: { city: string; zip: string } }> = {
                    name: "string",
                    address: { [OptionalSymbol]: true, validator: addressValidator },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should skip validation when optional nested object is undefined", () => {
                const mockRequest = createMockRequest({ name: "John" });
                const addressValidator: PayloadValidator<{ city: string; zip: string }> = {
                    city: "string",
                    zip: "string",
                };
                const validator: PayloadValidator<{ name: string; address?: { city: string; zip: string } }> = {
                    name: "string",
                    address: { [OptionalSymbol]: true, validator: addressValidator },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });
        });

        describe("ArrayValidator", () => {
            it("should validate array of strings", () => {
                const mockRequest = createMockRequest({ tags: ["tag1", "tag2", "tag3"] });
                const validator: PayloadValidator<{ tags: string[] }> = {
                    tags: { [ArraySymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should validate array of numbers", () => {
                const mockRequest = createMockRequest({ scores: [100, 95, 88] });
                const validator: PayloadValidator<{ scores: number[] }> = {
                    scores: { [ArraySymbol]: true, validator: "number" },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when property is not an array", () => {
                const mockRequest = createMockRequest({ tags: "not-an-array" });
                const validator: PayloadValidator<{ tags: string[] }> = {
                    tags: { [ArraySymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "tags", expected array but got string');
                }
            });

            it("should throw when array element has wrong type", () => {
                const mockRequest = createMockRequest({ tags: ["valid", 123, "another"] });
                const validator: PayloadValidator<{ tags: string[] }> = {
                    tags: { [ArraySymbol]: true, validator: "string" },
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
                try {
                    performValidation(mockRequest, validator);
                } catch (error) {
                    expect((error as ErrorResponse).message).toBe('Invalid property "tags[1]", expected string but got number');
                }
            });

            it("should validate array of nested objects", () => {
                const mockRequest = createMockRequest({
                    users: [
                        { name: "John", age: 30 },
                        { name: "Jane", age: 25 },
                    ],
                });
                const userValidator: PayloadValidator<{ name: string; age: number }> = {
                    name: "string",
                    age: "number",
                };
                const validator: PayloadValidator<{ users: Array<{ name: string; age: number }> }> = {
                    users: { [ArraySymbol]: true, validator: userValidator },
                };

                expect(() => performValidation(mockRequest, validator)).not.toThrow();
            });

            it("should throw when nested object in array is invalid", () => {
                const mockRequest = createMockRequest({
                    users: [
                        { name: "John", age: 30 },
                        { name: 123, age: 25 },
                    ],
                });
                const userValidator: PayloadValidator<{ name: string; age: number }> = {
                    name: "string",
                    age: "number",
                };
                const validator: PayloadValidator<{ users: Array<{ name: string; age: number }> }> = {
                    users: { [ArraySymbol]: true, validator: userValidator },
                };

                expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            });

        it("should pass validation for empty array", () => {
            const mockRequest = createMockRequest({ tags: [] });
            const validator: PayloadValidator<{ tags: string[] }> = {
                tags: { [ArraySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should throw when required array property is missing", () => {
            const mockRequest = createMockRequest({});
            const validator: PayloadValidator<{ tags: string[] }> = {
                tags: { [ArraySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tags", expected array but got undefined');
            }
        });

        it("should throw when required array property is null", () => {
            const mockRequest = createMockRequest({ tags: null });
            const validator: PayloadValidator<{ tags: string[] }> = {
                tags: { [ArraySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tags", expected array but got object');
            }
        });

        it("should validate array of nested objects with optional properties", () => {
            const mockRequest = createMockRequest({
                users: [
                    { name: "John", nickname: "Johnny" },
                    { name: "Jane" },  // nickname is optional
                ],
            });
            const userValidator: PayloadValidator<{ name: string; nickname?: string }> = {
                name: "string",
                nickname: { [OptionalSymbol]: true, validator: "string" },
            };
            const validator: PayloadValidator<{ users: Array<{ name: string; nickname?: string }> }> = {
                users: { [ArraySymbol]: true, validator: userValidator },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });
    });

    describe("ArrayOrEntityValidator", () => {
        it("should validate single entity", () => {
            const mockRequest = createMockRequest({ tag: "valid" });
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should validate array of entities", () => {
            const mockRequest = createMockRequest({ tag: ["valid1", "valid2"] });
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should throw when single entity is invalid", () => {
            const mockRequest = createMockRequest({ tag: 123 });
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tag", expected string but got number');
            }
        });

        it("should throw when element in array is invalid", () => {
            const mockRequest = createMockRequest({ tag: ["valid", 123] });
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tag[1]", expected string but got number');
            }
        });

        it("should validate complex object as single entity", () => {
            const mockRequest = createMockRequest({ item: { name: "test", id: 1 } });
            const itemValidator: PayloadValidator<{ name: string; id: number }> = {
                name: "string",
                id: "number",
            };
            const validator: PayloadValidator<{ item: any }> = {
                item: { [ArrayOrEntitySymbol]: true, validator: itemValidator },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should validate complex object array", () => {
            const mockRequest = createMockRequest({
                item: [
                    { name: "test1", id: 1 },
                    { name: "test2", id: 2 },
                ],
            });
            const itemValidator: PayloadValidator<{ name: string; id: number }> = {
                name: "string",
                id: "number",
            };
            const validator: PayloadValidator<{ item: any }> = {
                item: { [ArrayOrEntitySymbol]: true, validator: itemValidator },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should support top-level arrayOrEntity validation (single entity)", () => {
            const mockRequest = createMockRequest({ name: "test", id: 1 });
            const itemValidator: PayloadValidator<{ name: string; id: number }> = {
                name: "string",
                id: "number",
            };
            const validator: any = {
                [ArrayOrEntitySymbol]: true,
                validator: itemValidator,
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should support top-level arrayOrEntity validation (array)", () => {
            const mockRequest = createMockRequest([
                { name: "test1", id: 1 },
                { name: "test2", id: 2 },
            ]);
            const itemValidator: PayloadValidator<{ name: string; id: number }> = {
                name: "string",
                id: "number",
            };
            const validator: any = {
                [ArrayOrEntitySymbol]: true,
                validator: itemValidator,
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should support top-level array validation", () => {
             const mockRequest = createMockRequest([
                { name: "test1", id: 1 },
                { name: "test2", id: 2 },
            ]);
            const itemValidator: PayloadValidator<{ name: string; id: number }> = {
                name: "string",
                id: "number",
            };
            const validator: any = {
                [ArraySymbol]: true,
                validator: itemValidator,
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should throw when arrayOrEntity property is missing", () => {
            const mockRequest = createMockRequest({});
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tag", expected string but got undefined');
            }
        });

        it("should throw when arrayOrEntity property is null", () => {
            const mockRequest = createMockRequest({ tag: null });
            const validator: PayloadValidator<{ tag: string | string[] }> = {
                tag: { [ArrayOrEntitySymbol]: true, validator: "string" },
            };

            expect(() => performValidation(mockRequest, validator)).toThrow(ErrorResponse);
            try {
                performValidation(mockRequest, validator);
            } catch (error) {
                expect((error as ErrorResponse).message).toBe('Invalid property "tag", expected string but got object');
            }
        });

        it("should validate optional arrayOrEntity when present as single value", () => {
            const mockRequest = createMockRequest({ name: "John", tag: "admin" });
            const validator: PayloadValidator<{ name: string; tag?: string | string[] }> = {
                name: "string",
                tag: { [OptionalSymbol]: true, validator: { [ArrayOrEntitySymbol]: true, validator: "string" } },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should validate optional arrayOrEntity when present as array", () => {
            const mockRequest = createMockRequest({ name: "John", tag: ["admin", "user"] });
            const validator: PayloadValidator<{ name: string; tag?: string | string[] }> = {
                name: "string",
                tag: { [OptionalSymbol]: true, validator: { [ArrayOrEntitySymbol]: true, validator: "string" } },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should skip validation when optional arrayOrEntity is undefined", () => {
            const mockRequest = createMockRequest({ name: "John" });
            const validator: PayloadValidator<{ name: string; tag?: string | string[] }> = {
                name: "string",
                tag: { [OptionalSymbol]: true, validator: { [ArrayOrEntitySymbol]: true, validator: "string" } },
            };

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });
    });
    });

    describe("edge cases", () => {
        it("should pass validation with no validators", () => {
            const mockRequest = createMockRequest({ anything: "value" });

            expect(() => performValidation(mockRequest)).not.toThrow();
        });

        it("should pass validation with empty body when no properties are validated", () => {
            const mockRequest = createMockRequest({});
            const validator: PayloadValidator<{}> = {};

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should pass validation with null body when no properties are validated", () => {
            const mockRequest = createMockRequest(null);
            const validator: PayloadValidator<{}> = {};

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });

        it("should pass validation with undefined body when no properties are validated", () => {
            const mockRequest = createMockRequest(undefined);
            const validator: PayloadValidator<{}> = {};

            expect(() => performValidation(mockRequest, validator)).not.toThrow();
        });
    });

    describe("with multiple validators", () => {
        it("should run all validators in sequence", () => {
            const mockRequest = createMockRequest({ name: "John", age: 30 });
            const requestValidator: RequestValidator = jest.fn().mockReturnValue(undefined);
            const payloadValidator: PayloadValidator<{ name: string; age: number }> = {
                name: "string",
                age: "number",
            };

            performValidation(mockRequest, requestValidator, payloadValidator);

            expect(requestValidator).toHaveBeenCalledWith(mockRequest);
        });

        it("should stop at first failing validator", () => {
            const mockRequest = createMockRequest({ name: "John" });
            const requestValidator1: RequestValidator = jest.fn().mockReturnValue("First error");
            const requestValidator2: RequestValidator = jest.fn().mockReturnValue(undefined);

            expect(() => performValidation(mockRequest, requestValidator1, requestValidator2)).toThrow(ErrorResponse);
            expect(requestValidator1).toHaveBeenCalled();
            expect(requestValidator2).not.toHaveBeenCalled();
        });
    });

    describe("return value", () => {
        it("should return undefined on successful validation", () => {
            const mockRequest = createMockRequest({ name: "John" });
            const validator: PayloadValidator<{ name: string }> = { name: "string" };

            const result = performValidation(mockRequest, validator);

            expect(result).toBeUndefined();
        });
    });
});
