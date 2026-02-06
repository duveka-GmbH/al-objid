import { app, HttpRequest, HttpResponseInit, InvocationContext, HttpMethod } from "@azure/functions";
import { handleRequest } from "./handleRequest";
import { AzureHttpHandler } from "./AzureHttpHandler";
import { MonikerSymbol } from "../billing/decorators";

interface EndpointSetup {
    moniker: string;
    route: string;
    authLevel?: "anonymous" | "function" | "admin";
    GET?: AzureHttpHandler;
    POST?: AzureHttpHandler;
    PUT?: AzureHttpHandler;
    PATCH?: AzureHttpHandler;
    DELETE?: AzureHttpHandler;
}

export function createEndpoint(setup: EndpointSetup): void {
    const { moniker, route, authLevel, GET, POST, PUT, PATCH, DELETE } = setup;
    const methods: HttpMethod[] = [];

    // Store moniker on each handler for feature logging
    if (typeof GET === "function") {
        (GET as any)[MonikerSymbol] = moniker;
        methods.push("GET");
    }
    if (typeof POST === "function") {
        (POST as any)[MonikerSymbol] = moniker;
        methods.push("POST");
    }
    if (typeof PUT === "function") {
        (PUT as any)[MonikerSymbol] = moniker;
        methods.push("PUT");
    }
    if (typeof PATCH === "function") {
        (PATCH as any)[MonikerSymbol] = moniker;
        methods.push("PATCH");
    }
    if (typeof DELETE === "function") {
        (DELETE as any)[MonikerSymbol] = moniker;
        methods.push("DELETE");
    }

    const handler = async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
        const httpHandler = setup[request.method as keyof EndpointSetup];
        if (typeof httpHandler !== "function") {
            return { status: 405, body: "Method not allowed" };
        }
        return await handleRequest(httpHandler, request);
    };

    // Call app.http with the configuration
    const options: any = {
        methods,
        route,
        handler,
    };

    if (authLevel) {
        options.authLevel = authLevel;
    }

    app.http(moniker, options);
}
