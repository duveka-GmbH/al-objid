import { ErrorResponse } from "./ErrorResponse";
import { HttpStatusCode } from "./HttpStatusCode";
import { ParsedNinjaHeaders } from "./parseNinjaHeaders";

/**
 * Minimum extension version required to use the backend.
 * Versions below this will receive HTTP 426 Upgrade Required.
 */
const MINIMUM_VERSION = "3.1.0";

/**
 * Compare two semver version strings.
 * @returns negative if a < b, zero if a === b, positive if a > b
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;

        if (partA < partB) {
            return -1;
        }
        if (partA > partB) {
            return 1;
        }
    }

    return 0;
}

/**
 * Check if the extension version meets minimum requirements.
 *
 * This is an early guard in the request pipeline that runs before
 * expensive operations like permission checks. It enforces that
 * clients send a sufficiently recent version.
 *
 * Behavior:
 * - Missing version header: REJECTED with HTTP 426
 * - Version >= minimum: ALLOWED
 * - Version < minimum: REJECTED with HTTP 426
 *
 * @param parsedHeaders - The parsed Ninja headers from the request
 * @throws ErrorResponse with 426 if version is too old or missing
 */
export function checkVersion(parsedHeaders: ParsedNinjaHeaders): void {
    const { ninjaVersion } = parsedHeaders;

    if (!ninjaVersion || compareVersions(ninjaVersion, MINIMUM_VERSION) < 0) {
        throw new ErrorResponse(
            `Extension version ${MINIMUM_VERSION} or higher required. You have ${ninjaVersion}. Please update AL Object ID Ninja.`,
            HttpStatusCode.ClientError_426_UpgradeRequired
        );
    }
}

// Export for testing
export const __testing__ = {
    compareVersions,
    MINIMUM_VERSION,
};
