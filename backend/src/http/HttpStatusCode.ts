/**
 * HTTP Status Codes
 */
export enum HttpStatusCode {
    /**
     * The request has succeeded.
     */
    Success_200_OK = 200,

    /**
     * The request has been fulfilled and has resulted in one or more new resources being created.
     */
    Success_201_Created = 201,

    /**
     * The request has been accepted for processing, but the processing has not been completed.
     */
    Success_202_Accepted = 202,

    /**
     * The request was successful but the enclosed payload has been modified from that of the origin server's 200 (OK) response by a transforming proxy.
     */
    Success_203_NonAuthoritativeInformation = 203,

    /**
     * The server has successfully fulfilled the request and there is no additional content to send in the response payload body.
     */
    Success_204_NoContent = 204,

    /**
     * The server has fulfilled the request and desires that the user agent reset the "document view" which caused the request to be sent.
     */
    Success_205_ResetContent = 205,

    /**
     * The server is delivering only part of the resource due to a range header sent by the client.
     */
    Success_206_PartialContent = 206,

    /**
     * The message body that follows is an XML message and can contain a number of separate response codes, depending on how many sub-requests were made.
     */
    Success_207_MultiStatus = 207,

    /**
     * The members of a DAV binding have already been enumerated in a previous reply to this request, and are not being included again.
     */
    Success_208_AlreadyReported = 208,

    /**
     * The server has fulfilled a GET request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance.
     */
    Success_226_IMUsed = 226,

    /**
     * Indicates multiple options for the resource from which the client may choose.
     */
    Redirection_300_MultipleChoices = 300,

    /**
     * This and all future requests should be directed to the given URI.
     */
    Redirection_301_MovedPermanently = 301,

    /**
     * Tells the client to look at (browse to) another URL.
     */
    Redirection_302_Found = 302,

    /**
     * The response to the request can be found under another URI using a GET method.
     */
    Redirection_303_SeeOther = 303,

    /**
     * Indicates that the resource has not been modified since the version specified by the request headers.
     */
    Redirection_304_NotModified = 304,

    /**
     * The requested resource is available only through a proxy, the address for which is provided in the response.
     */
    Redirection_305_UseProxy = 305,

    /**
     * In this case, the request should be repeated with another URI; however, future requests should still use the original URI.
     */
    Redirection_307_TemporaryRedirect = 307,

    /**
     * The request and all future requests should be repeated using another URI.
     */
    Redirection_308_PermanentRedirect = 308,

    /**
     * The server cannot or will not process the request due to an apparent client error.
     */
    ClientError_400_BadRequest = 400,

    /**
     * Similar to 403 Forbidden, but specifically for use when authentication is required and has failed or has not yet been provided.
     */
    ClientError_401_Unauthorized = 401,

    /**
     * Reserved for future use.
     */
    ClientError_402_PaymentRequired = 402,

    /**
     * The request was valid, but the server is refusing action.
     */
    ClientError_403_Forbidden = 403,

    /**
     * The requested resource could not be found but may be available in the future.
     */
    ClientError_404_NotFound = 404,

    /**
     * A request method is not supported for the requested resource.
     */
    ClientError_405_MethodNotAllowed = 405,

    /**
     * The requested resource is capable of generating only content not acceptable according to the Accept headers sent in the request.
     */
    ClientError_406_NotAcceptable = 406,

    /**
     * The client must first authenticate itself with the proxy.
     */
    ClientError_407_ProxyAuthenticationRequired = 407,

    /**
     * The server timed out waiting for the request.
     */
    ClientError_408_RequestTimeout = 408,

    /**
     * Indicates that the request could not be processed because of conflict in the request, such as an edit conflict between multiple simultaneous updates.
     */
    ClientError_409_Conflict = 409,

    /**
     * Indicates that the resource requested is no longer available and will not be available again.
     */
    ClientError_410_Gone = 410,

    /**
     * The request did not specify the length of its content, which is required by the requested resource.
     */
    ClientError_411_LengthRequired = 411,

    /**
     * The server does not meet one of the preconditions that the requester put on the request.
     */
    ClientError_412_PreconditionFailed = 412,

    /**
     * The request is larger than the server is willing or able to process.
     */
    ClientError_413_PayloadTooLarge = 413,

    /**
     * The URI provided was too long for the server to process.
     */
    ClientError_414_URI_TooLong = 414,

    /**
     * The request entity has a media type which the server or resource does not support.
     */
    ClientError_415_UnsupportedMediaType = 415,

    /**
     * The client has asked for a portion of the file (byte serving), but the server cannot supply that portion.
     */
    ClientError_416_RangeNotSatisfiable = 416,

    /**
     * The server cannot meet the requirements of the Expect request-header field.
     */
    ClientError_417_ExpectationFailed = 417,

    /**
     * This code was defined in 1998 as one of the traditional IETF April Fools' jokes, in RFC 2324, Hyper Text Coffee Pot Control Protocol.
     */
    ClientError_418_ImATeapot = 418,

    /**
     * The request was directed at a server that is not able to produce a response.
     */
    ClientError_421_MisdirectedRequest = 421,

    /**
     * The request was well-formed but was unable to be followed due to semantic errors.
     */
    ClientError_422_UnprocessableEntity = 422,

    /**
     * The resource that is being accessed is locked.
     */
    ClientError_423_Locked = 423,

    /**
     * The request failed due to failure of a previous request.
     */
    ClientError_424_FailedDependency = 424,

    /**
     * Indicates that the server is unwilling to risk processing a request that might be replayed.
     */
    ClientError_425_TooEarly = 425,

    /**
     * The client should switch to a different protocol such as TLS/1.0, given in the Upgrade header field.
     */
    ClientError_426_UpgradeRequired = 426,

    /**
     * The origin server requires the request to be conditional.
     */
    ClientError_428_PreconditionRequired = 428,

    /**
     * The user has sent too many requests in a given amount of time ("rate limiting").
     */
    ClientError_429_TooManyRequests = 429,

    /**
     * The server is unwilling to process the request because its header fields are too large.
     */
    ClientError_431_RequestHeaderFieldsTooLarge = 431,

    /**
     * The user-agent requested a resource that cannot legally be provided, such as a web page censored by a government.
     */
    ClientError_451_UnavailableForLegalReasons = 451,

    /**
     * A generic error message, given when an unexpected condition was encountered and no more specific message is suitable.
     */
    ServerError_500_InternalServerError = 500,

    /**
     * The server either does not recognize the request method, or it lacks the ability to fulfill the request.
     */
    ServerError_501_NotImplemented = 501,

    /**
     * The server was acting as a gateway or proxy and received an invalid response from the upstream server.
     */
    ServerError_502_BadGateway = 502,

    /**
     * The server is currently unavailable (because it is overloaded or down for maintenance).
     */
    ServerError_503_ServiceUnavailable = 503,

    /**
     * The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.
     */
    ServerError_504_GatewayTimeout = 504,

    /**
     * The server does not support the HTTP protocol version used in the request.
     */
    ServerError_505_HTTPVersionNotSupported = 505,

    /**
     * Transparent content negotiation for the request results in a circular reference.
     */
    ServerError_506_VariantAlsoNegotiates = 506,

    /**
     * The server is unable to store the representation needed to complete the request.
     */
    ServerError_507_InsufficientStorage = 507,

    /**
     * The server detected an infinite loop while processing a request.
     */
    ServerError_508_LoopDetected = 508,

    /**
     * Further extensions to the request are required for the server to fulfill it.
     */
    ServerError_510_NotExtended = 510,

    /**
     * The client needs to authenticate to gain network access.
     */
    ServerError_511_NetworkAuthenticationRequired = 511,
}
