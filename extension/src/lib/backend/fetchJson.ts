import { responseFilter } from "./responseFilter";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function fetchJson<T>(
    url: string,
    method: HttpMethod,
    body?: unknown,
    headers?: Record<string, string>
): Promise<T | undefined> {
    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsedBody: any = undefined;

    // Try to parse body as JSON if it exists
    if (text) {
        try {
            parsedBody = JSON.parse(text);
        } catch {
            // Not JSON, keep as undefined
        }
    }

    // Call responseFilter for both success and error responses
    // This ensures errors (like 403) are displayed even when response is not OK
    if (parsedBody !== undefined) {
        const shouldContinue = responseFilter(parsedBody, (headers ?? ({} as Record<string, string>))["Ninja-Git-Email"] ?? "");

        // For success responses, if responseFilter indicates we should stop, throw an error to stop execution
        if (response.ok && !shouldContinue) {
            throw {
                error: "Permission error detected",
                statusCode: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                permissionError: true,
            };
        }
    }

    if (!response.ok) {
        throw {
            error: text,
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
        };
    }

    return parsedBody as T | undefined;
}
