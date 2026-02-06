import { HeadersLike } from "./AzureHttpRequest";

/**
 * Parsed Ninja headers structure.
 * Contains all header values needed by bindUser and bindPermission.
 */
export interface ParsedNinjaHeaders {
    gitUserName?: string;
    gitUserEmail?: string;
    appPublisher?: string;
    appName?: string;
    appVersion?: string;
    ninjaVersion?: string;
    // Always from individual headers (non-negotiable)
    appId?: string;
    gitBranch?: string;
}

/**
 * Parses Ninja headers from a request.
 *
 * First attempts to decode the Ninja-Header-Payload (Base64-encoded JSON).
 * If not present, falls back to reading individual headers.
 *
 * Note: appId and gitBranch are always read from individual headers.
 *
 * @param headers - The request headers
 * @returns Parsed header values
 */
export function parseNinjaHeaders(headers: HeadersLike): ParsedNinjaHeaders {
    // Always read these from individual headers
    const appId = headers.get("Ninja-App-Id")?.trim() || undefined;
    const gitBranch = headers.get("Ninja-Git-Branch")?.trim() || undefined;

    // Try Ninja-Header-Payload first
    const payloadBase64 = headers.get("Ninja-Header-Payload");
    if (payloadBase64) {
        const json = Buffer.from(payloadBase64, "base64").toString("utf8");
        const payload = JSON.parse(json);
        return {
            gitUserName: payload.gitUserName?.trim() || undefined,
            gitUserEmail: payload.gitUserEmail?.trim()?.toLowerCase() || undefined,
            appPublisher: payload.appPublisher?.trim() || undefined,
            appName: payload.appName?.trim() || undefined,
            appVersion: payload.appVersion?.trim() || undefined,
            ninjaVersion: payload.ninjaVersion?.trim() || undefined,
            appId,
            gitBranch,
        };
    }

    // Fallback to individual headers
    return {
        gitUserName: headers.get("Ninja-Git-Name")?.trim() || undefined,
        gitUserEmail: headers.get("Ninja-Git-Email")?.trim()?.toLowerCase() || undefined,
        appPublisher: headers.get("Ninja-App-Publisher")?.trim() || undefined,
        appName: headers.get("Ninja-App-Name")?.trim() || undefined,
        appVersion: headers.get("Ninja-App-Version")?.trim() || undefined,
        ninjaVersion: headers.get("Ninja-Version")?.trim() || undefined,
        appId,
        gitBranch,
    };
}
