import { AppInfo } from "../../../types";

export interface AuthorizeUpdateParams {
    key: string;
    userName?: string;
    userEmail?: string;
}

export function createAuthorizeUpdateCallback(params: AuthorizeUpdateParams) {
    return (app: AppInfo | null): AppInfo => {
        app = { ...(app || ({} as AppInfo)) };
        app._authorization = {
            key: params.key,
            user: {
                timestamp: Date.now(),
            } as any,
        };
        if (params.userName) {
            app._authorization.user!.name = params.userName;
        }
        if (params.userEmail) {
            app._authorization.user!.email = params.userEmail;
        }

        //TODO: Event logging - old: request.log(app, "authorize")

        return app;
    };
}

export function createDeauthorizeUpdateCallback() {
    return (app: AppInfo): AppInfo => {
        delete app._authorization;

        //TODO: Event logging - old: request.log(app, "deauthorize")

        return { ...app };
    };
}
