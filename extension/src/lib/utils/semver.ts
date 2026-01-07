/**
 * Compares two semantic version strings.
 * @param a First version string (e.g., "1.2.3")
 * @param b Second version string (e.g., "1.2.4")
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA < numB) {
            return -1;
        }
        if (numA > numB) {
            return 1;
        }
    }

    return 0;
}

/**
 * Checks if a candidate version is newer than the current version.
 * @param current The current version string
 * @param candidate The candidate version string to compare
 * @returns true if candidate is newer than current
 */
export function isNewerVersion(current: string, candidate: string): boolean {
    return compareVersions(candidate, current) > 0;
}
