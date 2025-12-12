import { HttpRequest } from "@azure/functions";

export async function getBody(request: HttpRequest): Promise<any> {
    const contentType = request.headers.get("content-type")?.toLowerCase()?.split(';')[0].trim();

    if (!request.body) {
        return null;
    }

    switch (contentType) {
        case "application/json":
            return await request.json();
        
        case "application/x-www-form-urlencoded":
            const formData = await request.formData();
            const result: Record<string, string> = {};
            for (const [key, value] of formData.entries()) {
                result[key] = value.toString();
            }
            return result;
        
        case "text/plain":
            return await request.text();
        
        case "application/octet-stream":
            // Return raw binary data as-is (Buffer or ArrayBuffer)
            return request.blob();
        
        default:
            // For unknown content types, return body as-is
            return request.body;
    }
}
