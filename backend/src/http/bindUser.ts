import { AzureHttpRequest, UserInfo } from "./AzureHttpRequest";
import { ParsedNinjaHeaders } from "./parseNinjaHeaders";

/**
 * Binds user information from parsed headers to the request object.
 * Only binds if at least one value is present; leaves user undefined if neither.
 * @param azureRequest - The request object to bind user info to
 * @param headers - Parsed Ninja headers containing git user info
 */
export function bindUser(azureRequest: AzureHttpRequest, headers: ParsedNinjaHeaders): void {
    const name = headers.gitUserName;
    const email = headers.gitUserEmail;

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
