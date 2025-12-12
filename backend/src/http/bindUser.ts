import { AzureHttpRequest, UserInfo } from "./AzureHttpRequest";

/**
 * Extracts user information from request headers and binds to the request object.
 * Reads X-User-Name and X-User-Email headers.
 * Only binds if at least one header is present; leaves user undefined if neither.
 * @param azureRequest - The request object to bind user info to
 */
export function bindUser(azureRequest: AzureHttpRequest): void {
    const name = azureRequest.headers.get("X-User-Name")?.trim() || undefined;
    const email = azureRequest.headers.get("X-User-Email")?.trim().toLowerCase() || undefined;

    if (!name && !email) {
        return;
    }

    const user: UserInfo = {};
    if (name) {
        user.name = name;
    }
    if (email) {
        user.email = email;
    }

    azureRequest.user = user;
}

