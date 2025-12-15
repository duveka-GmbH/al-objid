/**
 * Checks if the back-end is running in private mode.
 * Returns true if the `PRIVATE_BACKEND` environment variable is set to "true" (case-insensitive).
 * 
 * @returns {boolean} True if running in private back-end mode, false otherwise
 */
export function isPrivateBackend(): boolean {
    const value = process.env.PRIVATE_BACKEND;
    if (!value) {
        return false;
    }
    return value.toLowerCase() === "true";
}
