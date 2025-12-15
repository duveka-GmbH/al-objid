import { HttpStatusCode } from "../../src/http/HttpStatusCode";

describe("HttpStatusCode", () => {
    describe("Success codes (2xx)", () => {
        it.each([
            ["Success_200_OK", 200],
            ["Success_201_Created", 201],
            ["Success_202_Accepted", 202],
            ["Success_203_NonAuthoritativeInformation", 203],
            ["Success_204_NoContent", 204],
            ["Success_205_ResetContent", 205],
            ["Success_206_PartialContent", 206],
            ["Success_207_MultiStatus", 207],
            ["Success_208_AlreadyReported", 208],
            ["Success_226_IMUsed", 226],
        ] as const)("should have %s equal to %i", (name, code) => {
            expect(HttpStatusCode[name]).toBe(code);
        });
    });

    describe("Redirection codes (3xx)", () => {
        it.each([
            ["Redirection_300_MultipleChoices", 300],
            ["Redirection_301_MovedPermanently", 301],
            ["Redirection_302_Found", 302],
            ["Redirection_303_SeeOther", 303],
            ["Redirection_304_NotModified", 304],
            ["Redirection_305_UseProxy", 305],
            ["Redirection_307_TemporaryRedirect", 307],
            ["Redirection_308_PermanentRedirect", 308],
        ] as const)("should have %s equal to %i", (name, code) => {
            expect(HttpStatusCode[name]).toBe(code);
        });
    });

    describe("Client error codes (4xx)", () => {
        it.each([
            ["ClientError_400_BadRequest", 400],
            ["ClientError_401_Unauthorized", 401],
            ["ClientError_402_PaymentRequired", 402],
            ["ClientError_403_Forbidden", 403],
            ["ClientError_404_NotFound", 404],
            ["ClientError_405_MethodNotAllowed", 405],
            ["ClientError_406_NotAcceptable", 406],
            ["ClientError_407_ProxyAuthenticationRequired", 407],
            ["ClientError_408_RequestTimeout", 408],
            ["ClientError_409_Conflict", 409],
            ["ClientError_410_Gone", 410],
            ["ClientError_411_LengthRequired", 411],
            ["ClientError_412_PreconditionFailed", 412],
            ["ClientError_413_PayloadTooLarge", 413],
            ["ClientError_414_URI_TooLong", 414],
            ["ClientError_415_UnsupportedMediaType", 415],
            ["ClientError_416_RangeNotSatisfiable", 416],
            ["ClientError_417_ExpectationFailed", 417],
            ["ClientError_418_ImATeapot", 418],
            ["ClientError_421_MisdirectedRequest", 421],
            ["ClientError_422_UnprocessableEntity", 422],
            ["ClientError_423_Locked", 423],
            ["ClientError_424_FailedDependency", 424],
            ["ClientError_425_TooEarly", 425],
            ["ClientError_426_UpgradeRequired", 426],
            ["ClientError_428_PreconditionRequired", 428],
            ["ClientError_429_TooManyRequests", 429],
            ["ClientError_431_RequestHeaderFieldsTooLarge", 431],
            ["ClientError_451_UnavailableForLegalReasons", 451],
        ] as const)("should have %s equal to %i", (name, code) => {
            expect(HttpStatusCode[name]).toBe(code);
        });
    });

    describe("Server error codes (5xx)", () => {
        it.each([
            ["ServerError_500_InternalServerError", 500],
            ["ServerError_501_NotImplemented", 501],
            ["ServerError_502_BadGateway", 502],
            ["ServerError_503_ServiceUnavailable", 503],
            ["ServerError_504_GatewayTimeout", 504],
            ["ServerError_505_HTTPVersionNotSupported", 505],
            ["ServerError_506_VariantAlsoNegotiates", 506],
            ["ServerError_507_InsufficientStorage", 507],
            ["ServerError_508_LoopDetected", 508],
            ["ServerError_510_NotExtended", 510],
            ["ServerError_511_NetworkAuthenticationRequired", 511],
        ] as const)("should have %s equal to %i", (name, code) => {
            expect(HttpStatusCode[name]).toBe(code);
        });
    });

    describe("enum reverse mapping", () => {
        it.each([
            [200, "Success_200_OK"],
            [404, "ClientError_404_NotFound"],
            [500, "ServerError_500_InternalServerError"],
        ])("should allow reverse lookup from %i to %s", (code, name) => {
            expect(HttpStatusCode[code]).toBe(name);
        });
    });
});
