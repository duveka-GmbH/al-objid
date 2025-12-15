import { validateALObjectType, validateObjectConsumptions } from "../../src/utils/validators";
import { ObjectConsumptions } from "../../src/types";

describe("validators", () => {
    describe("validateALObjectType", () => {
        describe("valid standard AL object types", () => {
            it("should return undefined for codeunit type", () => {
                const result = validateALObjectType("codeunit");
                expect(result).toBeUndefined();
            });

            it("should return undefined for enum type", () => {
                const result = validateALObjectType("enum");
                expect(result).toBeUndefined();
            });

            it("should return undefined for enumextension type", () => {
                const result = validateALObjectType("enumextension");
                expect(result).toBeUndefined();
            });

            it("should return undefined for page type", () => {
                const result = validateALObjectType("page");
                expect(result).toBeUndefined();
            });

            it("should return undefined for pageextension type", () => {
                const result = validateALObjectType("pageextension");
                expect(result).toBeUndefined();
            });

            it("should return undefined for permissionset type", () => {
                const result = validateALObjectType("permissionset");
                expect(result).toBeUndefined();
            });

            it("should return undefined for permissionsetextension type", () => {
                const result = validateALObjectType("permissionsetextension");
                expect(result).toBeUndefined();
            });

            it("should return undefined for query type", () => {
                const result = validateALObjectType("query");
                expect(result).toBeUndefined();
            });

            it("should return undefined for report type", () => {
                const result = validateALObjectType("report");
                expect(result).toBeUndefined();
            });

            it("should return undefined for reportextension type", () => {
                const result = validateALObjectType("reportextension");
                expect(result).toBeUndefined();
            });

            it("should return undefined for table type", () => {
                const result = validateALObjectType("table");
                expect(result).toBeUndefined();
            });

            it("should return undefined for tableextension type", () => {
                const result = validateALObjectType("tableextension");
                expect(result).toBeUndefined();
            });

            it("should return undefined for xmlport type", () => {
                const result = validateALObjectType("xmlport");
                expect(result).toBeUndefined();
            });
        });

        describe("valid extended ID types (type_id format)", () => {
            it("should return undefined for table_123", () => {
                const result = validateALObjectType("table_123");
                expect(result).toBeUndefined();
            });

            it("should return undefined for tableextension_456", () => {
                const result = validateALObjectType("tableextension_456");
                expect(result).toBeUndefined();
            });

            it("should return undefined for enum_789", () => {
                const result = validateALObjectType("enum_789");
                expect(result).toBeUndefined();
            });

            it("should return undefined for enumextension_101", () => {
                const result = validateALObjectType("enumextension_101");
                expect(result).toBeUndefined();
            });
        });

        describe("invalid extended ID types", () => {
            it("should return error for non-extended type with id (page_123)", () => {
                const result = validateALObjectType("page_123");
                expect(result).toBe("page_123 has nothing of interest (fields, or ids) to keep track of");
            });

            it("should return error for codeunit with id", () => {
                const result = validateALObjectType("codeunit_123");
                expect(result).toBe("codeunit_123 has nothing of interest (fields, or ids) to keep track of");
            });

            it("should return error for report with id", () => {
                const result = validateALObjectType("report_123");
                expect(result).toBe("report_123 has nothing of interest (fields, or ids) to keep track of");
            });

            it("should return error for query with id", () => {
                const result = validateALObjectType("query_123");
                expect(result).toBe("query_123 has nothing of interest (fields, or ids) to keep track of");
            });
        });

        describe("invalid id in extended format", () => {
            it("should return error when id is zero", () => {
                const result = validateALObjectType("table_0");
                expect(result).toBe("table id must be a non-zero number");
            });

            it("should return error when id is not a number", () => {
                const result = validateALObjectType("table_abc");
                expect(result).toBe("table id must be a non-zero number");
            });

            it("should return error when id is empty string", () => {
                const result = validateALObjectType("table_");
                expect(result).toBe("table id must be a non-zero number");
            });
        });

        describe("completely invalid types", () => {
            it("should return error for unknown type", () => {
                const result = validateALObjectType("unknowntype");
                expect(result).toBe('invalid AL object type "unknowntype"');
            });

            it("should return error for empty string", () => {
                const result = validateALObjectType("");
                expect(result).toBe('invalid AL object type ""');
            });

            it("should return error for type with multiple underscores", () => {
                const result = validateALObjectType("table_123_456");
                expect(result).toBe('invalid AL object type "table_123_456"');
            });

            it("should return error for numeric-only value", () => {
                const result = validateALObjectType("12345");
                expect(result).toBe('invalid AL object type "12345"');
            });
        });
    });

    describe("validateObjectConsumptions", () => {
        describe("valid inputs", () => {
            it("should return undefined for empty object", () => {
                const result = validateObjectConsumptions({});
                expect(result).toBeUndefined();
            });

            it("should return undefined for valid single type with array", () => {
                const consumptions: ObjectConsumptions = {
                    codeunit: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for multiple valid types", () => {
                const consumptions: ObjectConsumptions = {
                    codeunit: [1, 2, 3],
                    page: [10, 20],
                    table: [100],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for empty arrays", () => {
                const consumptions: ObjectConsumptions = {
                    codeunit: [],
                    page: [],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for extended type format", () => {
                const consumptions: ObjectConsumptions = {
                    table_123: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for tableextension with id", () => {
                const consumptions: ObjectConsumptions = {
                    tableextension_456: [5, 6, 7],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for enum with id", () => {
                const consumptions: ObjectConsumptions = {
                    enum_789: [10, 20, 30],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });

            it("should return undefined for enumextension with id", () => {
                const consumptions: ObjectConsumptions = {
                    enumextension_101: [1],
                };
                const result = validateObjectConsumptions(consumptions);
                expect(result).toBeUndefined();
            });
        });

        describe("invalid input types", () => {
            it("should return error for null", () => {
                const result = validateObjectConsumptions(null as any);
                expect(result).toBe('object expected, received "object"');
            });

            it("should return error for undefined", () => {
                const result = validateObjectConsumptions(undefined as any);
                expect(result).toBe('object expected, received "undefined"');
            });

            it("should return error for string", () => {
                const result = validateObjectConsumptions("not an object" as any);
                expect(result).toBe('object expected, received "string"');
            });

            it("should return error for number", () => {
                const result = validateObjectConsumptions(123 as any);
                expect(result).toBe('object expected, received "number"');
            });

            it("should return error for array", () => {
                const result = validateObjectConsumptions([] as any);
                expect(result).toBeUndefined();
            });
        });

        describe("invalid extended type keys", () => {
            it("should return error for non-extended type with id", () => {
                const consumptions = {
                    page_123: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe("page_123 has nothing of interest (fields, or ids) to keep track of");
            });

            it("should return error for codeunit with id", () => {
                const consumptions = {
                    codeunit_123: [1, 2],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe("codeunit_123 has nothing of interest (fields, or ids) to keep track of");
            });

            it("should return error when extended type id is zero", () => {
                const consumptions = {
                    table_0: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe("table id must be a non-zero number");
            });

            it("should return error when extended type id is not a number", () => {
                const consumptions = {
                    table_abc: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe("table id must be a non-zero number");
            });
        });

        describe("invalid AL object type keys", () => {
            it("should return error for unknown type", () => {
                const consumptions = {
                    unknowntype: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('invalid AL object type "unknowntype"');
            });

            it("should return error for misspelled type", () => {
                const consumptions = {
                    codunit: [1, 2, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('invalid AL object type "codunit"');
            });
        });

        describe("invalid value types", () => {
            it("should return error when value is not an array", () => {
                const consumptions = {
                    codeunit: "not an array",
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('array expected for key "codeunit"');
            });

            it("should return error when value is an object", () => {
                const consumptions = {
                    codeunit: { id: 1 },
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('array expected for key "codeunit"');
            });

            it("should return error when value is null", () => {
                const consumptions = {
                    codeunit: null,
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('array expected for key "codeunit"');
            });

            it("should return error when value is a number", () => {
                const consumptions = {
                    codeunit: 123,
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('array expected for key "codeunit"');
            });
        });

        describe("invalid array element types", () => {
            it("should return error when array contains string", () => {
                const consumptions = {
                    codeunit: [1, "two", 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('"codeunit" must be an array of "number", but "string" was found');
            });

            it("should return error when array contains object", () => {
                const consumptions = {
                    codeunit: [1, { id: 2 }, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('"codeunit" must be an array of "number", but "object" was found');
            });

            it("should return error when array contains null", () => {
                const consumptions = {
                    codeunit: [1, null, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('"codeunit" must be an array of "number", but "object" was found');
            });

            it("should return error when array contains undefined", () => {
                const consumptions = {
                    codeunit: [1, undefined, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('"codeunit" must be an array of "number", but "undefined" was found');
            });

            it("should return error when array contains boolean", () => {
                const consumptions = {
                    codeunit: [1, true, 3],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('"codeunit" must be an array of "number", but "boolean" was found');
            });
        });

        describe("validation order", () => {
            it("should check type validity before array validity", () => {
                const consumptions = {
                    unknowntype: "not an array",
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('invalid AL object type "unknowntype"');
            });

            it("should check array before checking elements", () => {
                const consumptions = {
                    codeunit: "string with numbers 123",
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('array expected for key "codeunit"');
            });
        });

        describe("mixed valid and invalid entries", () => {
            it("should return error on first invalid entry found", () => {
                const consumptions = {
                    codeunit: [1, 2, 3],
                    invalidtype: [4, 5, 6],
                    page: [7, 8, 9],
                };
                const result = validateObjectConsumptions(consumptions as any);
                expect(result).toBe('invalid AL object type "invalidtype"');
            });
        });
    });
});
