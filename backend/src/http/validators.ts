import { AzureHttpRequest } from "./AzureHttpRequest";
import {
    ArraySymbol,
    ArrayValidator,
    ArrayOrEntitySymbol,
    ArrayOrEntityValidator,
    OptionalSymbol,
    OptionalValidator,
    PropertyValidator,
    RequestValidator,
} from "./validationTypes";

export function params(...keys: string[]): RequestValidator {
    return (request: AzureHttpRequest) => {
        for (const key of keys) {
            if (typeof request.params[key] !== "string") {
                return `Missing required parameter "${key}"`;
            }
        }
        return undefined;
    };
}

export function array(validator: PropertyValidator): ArrayValidator {
    return { [ArraySymbol]: true, validator };
}

export function optional(validator: PropertyValidator): OptionalValidator {
    return { [OptionalSymbol]: true, validator };
}

export function arrayOrEntity(validator: PropertyValidator): ArrayOrEntityValidator {
    return { [ArrayOrEntitySymbol]: true, validator };
}
