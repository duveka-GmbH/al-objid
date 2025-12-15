import { ErrorResponse } from "../../src/http/ErrorResponse";

describe("ErrorResponse", () => {
    describe("constructor", () => {
        it("should create an ErrorResponse with message and default status code 500", () => {
            const error = new ErrorResponse("Something went wrong");

            expect(error.message).toBe("Something went wrong");
            expect(error.statusCode).toBe(500);
        });

        it("should create an ErrorResponse with message and custom status code", () => {
            const error = new ErrorResponse("Not found", 404);

            expect(error.message).toBe("Not found");
            expect(error.statusCode).toBe(404);
        });

        it("should extend Error class", () => {
            const error = new ErrorResponse("Test error");

            expect(error).toBeInstanceOf(Error);
        });

        it("should have the correct name property inherited from Error", () => {
            const error = new ErrorResponse("Test error");

            expect(error.name).toBe("Error");
        });
    });

    describe("statusCode getter", () => {
        it("should return the status code passed to constructor", () => {
            const error = new ErrorResponse("Bad request", 400);

            expect(error.statusCode).toBe(400);
        });

        it("should return 500 when no status code is provided", () => {
            const error = new ErrorResponse("Internal error");

            expect(error.statusCode).toBe(500);
        });
    });
});
