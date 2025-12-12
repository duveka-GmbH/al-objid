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

    if (!response.ok) {
        const errorBody = await response.text();
        throw {
            error: errorBody,
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
        };
    }

    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
}

