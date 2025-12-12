import { Range } from "../types";
import { findFirstAvailableId } from "./findFirstAvailableId";


export function findAvailablePerRange(ranges: Range[], ids: number[]): number[] {
    const results = [];
    for (const range of ranges) {
        const result = findFirstAvailableId([range], ids);
        if (result >= range.from && result <= range.to) {
            results.push(result);
        }
    }
    return results;
}
