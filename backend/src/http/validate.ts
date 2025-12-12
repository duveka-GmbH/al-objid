import { AzureHttpHandler } from "./AzureHttpHandler";
import { AzureHttpRequest } from "./AzureHttpRequest";
import { ErrorResponse } from "./ErrorResponse";
import { HttpStatusCode } from "./HttpStatusCode";
import { ArrayOrEntitySymbol, ArraySymbol, OptionalSymbol, PropertyValidator, Validator, ValidatorSymbol } from "./validationTypes";

export function validate<T>(handler: AzureHttpHandler, ...validators: Validator<T>[]): void {
    handler[ValidatorSymbol] = validators;
}

function validateProperty(request: AzureHttpRequest, key: string, propertyValue: any, validator: PropertyValidator): void {
    // Check for OptionalValidator
    if (typeof validator === "object" && OptionalSymbol in validator) {
        if (propertyValue === undefined || propertyValue === null) {
            return; // Optional value is missing, skip validation
        }
        validateProperty(request, key, propertyValue, validator.validator);
        return;
    }

    // Check for ArrayValidator
    if (typeof validator === "object" && ArraySymbol in validator) {
        if (!Array.isArray(propertyValue)) {
            throw new ErrorResponse(
                `Invalid property "${key}", expected array but got ${typeof propertyValue}`,
                HttpStatusCode.ClientError_400_BadRequest
            );
        }
        for (let i = 0; i < propertyValue.length; i++) {
            validateProperty(request, `${key}[${i}]`, propertyValue[i], validator.validator);
        }
        return;
    }

    // Check for ArrayOrEntityValidator
    if (typeof validator === "object" && ArrayOrEntitySymbol in validator) {
        if (Array.isArray(propertyValue)) {
            for (let i = 0; i < propertyValue.length; i++) {
                validateProperty(request, `${key}[${i}]`, propertyValue[i], validator.validator);
            }
        } else {
            validateProperty(request, key, propertyValue, validator.validator);
        }
        return;
    }

    switch (typeof validator) {
        case "string": // JavaScript type
            if (typeof propertyValue !== validator) {
                throw new ErrorResponse(
                    `Invalid property "${key}", expected ${validator} but got ${typeof propertyValue}`,
                    HttpStatusCode.ClientError_400_BadRequest
                );
            }
            break;
        case "object": // Payload validator (nested object)
            if (typeof propertyValue !== "object" || propertyValue === null) {
                throw new ErrorResponse(
                    `Invalid property "${key}", expected object but got ${typeof propertyValue}`,
                    HttpStatusCode.ClientError_400_BadRequest
                );
            }
            performValidation(
                {
                    headers: request.headers,
                    params: request.params,
                    body: propertyValue,
                    query: request.query,
                } as AzureHttpRequest,
                validator
            );
            break;
        case "function": // Property validator function
            const result = validator(propertyValue, request.body);
            if (typeof result === "string") {
                throw new ErrorResponse(result, HttpStatusCode.ClientError_400_BadRequest);
            } else if (typeof result === "object" && result !== null) {
                // Result is a PayloadValidator - use it to validate the property value
                if (typeof propertyValue !== "object" || propertyValue === null) {
                    throw new ErrorResponse(
                        `Invalid property "${key}", expected object but got ${typeof propertyValue}`,
                        HttpStatusCode.ClientError_400_BadRequest
                    );
                }
                performValidation(
                    {
                        headers: request.headers,
                        params: request.params,
                        body: propertyValue,
                        query: request.query,
                    } as AzureHttpRequest,
                    result
                );
            }
            break;
    }
}

export function performValidation(request: AzureHttpRequest, ...validators: Validator<any>[]): void {
    for (const validator of validators) {
        switch (typeof validator) {
            case "function":
                const result = validator(request);
                if (typeof result === "string") {
                    throw new ErrorResponse(result, HttpStatusCode.ClientError_400_BadRequest);
                }
                break;
            case "object":
                if (ArraySymbol in validator || ArrayOrEntitySymbol in validator) {
                    validateProperty(request, "body", request.body, validator as PropertyValidator);
                } else {
                    for (const [key, value] of Object.entries(validator)) {
                        validateProperty(request, key, request.body[key], value as PropertyValidator);
                    }
                }
                break;
        }
    }
    return undefined;
}
