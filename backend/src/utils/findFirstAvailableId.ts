import { Range } from "../types";

/**
 * Finds the first available object ID from the array of ranges and array of consumed IDs.
 *
 * @param ranges Array of ranges to search for the first available number
 * @param ids Array of already consumed object IDs
 * @returns Next available object ID, or 0 if all numbers are consumed
 */

export function findFirstAvailableId(ranges: Range[], ids: number[]): number {
    // No numbers consumed, return the first number from the first range
    if (!ids.length) return ranges[0].from;

    // Find the first unused number while minding performance
    let i = 0;
    for (const range of ranges) {
        for (let j = range.from; j <= range.to; j++) {
            if (i >= ids.length) return j;

            while (ids[i] < j) {
                if (++i >= ids.length) return j;
            }

            if (ids[i++] > j) return j;
        }
    }

    // All numbers from all ranges are consumed
    return 0;
}
