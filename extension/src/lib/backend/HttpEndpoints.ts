import { Config } from "../Config";
import { TELEMETRY_HOST_NAME } from "../constants";
import { HttpEndpoint } from "./HttpEndpoint";

export class HttpEndpoints {
    static get default(): HttpEndpoint {
        return {
            hostname: Config.instance.backEndUrl,
            key: Config.instance.backEndAPIKey,
        };
    }

    static get telemetry(): HttpEndpoint {
        return {
            hostname: TELEMETRY_HOST_NAME,
        };
    }
}
