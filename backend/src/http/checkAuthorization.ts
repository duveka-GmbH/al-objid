import { AppInfo } from "../types";
import { ErrorResponse } from "./ErrorResponse";
import { HttpStatusCode } from "./HttpStatusCode";

export function checkAuthorization(app: AppInfo | undefined, authKey: string | null): void {
    if (!app?._authorization?.key) {
        return;
    }
    
    if (authKey === app._authorization.key) {
        return;
    }
    
    throw new ErrorResponse("Invalid authorization key", HttpStatusCode.ClientError_401_Unauthorized);
}

