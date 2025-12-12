import { AzureHttpRequest } from "./AzureHttpRequest";

export type JavaScriptType = "string" | "boolean" | "number" | "object";

export const OptionalSymbol = Symbol("__optional__");
export const ArraySymbol = Symbol("__array__");
export const ArrayOrEntitySymbol = Symbol("__arrayOrEntity__");

export interface OptionalValidator {
    [OptionalSymbol]: true;
    validator: PropertyValidator;
}

export interface ArrayValidator {
    [ArraySymbol]: true;
    validator: PropertyValidator;
}

export interface ArrayOrEntityValidator {
    [ArrayOrEntitySymbol]: true;
    validator: PropertyValidator;
}

export type PropertyValidator<T extends {} = any> = JavaScriptType | PropertyValidatorFunction | PayloadValidator<T> | OptionalValidator | ArrayValidator | ArrayOrEntityValidator;

export interface PropertyValidatorFunction<T = any> {
    (value: any, entity: T): string | PayloadValidator<any> | undefined;
}

export interface RequestValidator {
    (request: AzureHttpRequest): string | undefined;
}

export type PayloadValidator<T extends {}> = {
    [K in keyof T]: PropertyValidator;
};

export type Validator<T> = PayloadValidator<T> | RequestValidator | ArrayValidator | ArrayOrEntityValidator;

export const ValidatorSymbol = Symbol("__validator__");
