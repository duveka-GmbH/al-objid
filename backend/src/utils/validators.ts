import { ALObjectType } from "../types";
import { ObjectConsumptions } from "../types";

function isExtendedIdType(type: string): boolean {
    return type === "table" || type === "tableextension" || type === "enum" || type === "enumextension";
}

/**
 * Validates an AL object type string.
 * Returns undefined if valid, or an error message string if invalid.
 */
export function validateALObjectType(value: any): string | undefined {
    if (ALObjectType[value as keyof typeof ALObjectType]) {
        return undefined;
    }

    const parts = value.split("_");
    if (parts.length === 2) {
        if (!isExtendedIdType(parts[0])) {
            return `${value} has nothing of interest (fields, or ids) to keep track of`;
        }
        if (!parseInt(parts[1])) {
            return `${parts[0]} id must be a non-zero number`;
        }
        return undefined;
    }
    return `invalid AL object type "${value}"`;
}

/**
 * Validates ObjectConsumptions (object IDs per AL object type).
 * Returns undefined if valid, or an error message string if invalid.
 */
export function validateObjectConsumptions(value: ObjectConsumptions): string | undefined {
    if (typeof value !== "object" || !value) {
        return `object expected, received "${typeof value}"`;
    }
    for (const key of Object.keys(value)) {
        let typeKey = key;
        const keyParts = key.split("_");
        if (keyParts.length === 2) {
            typeKey = keyParts[0];
            if (!isExtendedIdType(typeKey)) {
                return `${key} has nothing of interest (fields, or ids) to keep track of`;
            }
            if (!parseInt(keyParts[1])) {
                return `${typeKey} id must be a non-zero number`;
            }
        }
        if (!ALObjectType[typeKey as keyof typeof ALObjectType]) {
            return `invalid AL object type "${typeKey}"`;
        }
        if (!Array.isArray(value[key])) {
            return `array expected for key "${key}"`;
        }
        for (const num of value[key]) {
            if (typeof num !== "number") {
                return `"${key}" must be an array of "number", but "${typeof num}" was found`;
            }
        }
    }
    return undefined;
}
