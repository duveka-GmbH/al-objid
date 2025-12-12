import * as crypto from "crypto";

/**
 * Calculates the SHA256 hash of specified content and returns it in specified encoding.
 *
 * @param content Content to hash
 * @param encoding Encoding to use for output
 * @returns SHA256 hash of the content encoded as specified
 */

export function getSha256(content: string, encoding: "hex" | "base64"): string {
    const sha256 = crypto.createHash("sha256");
    sha256.update(content);
    return sha256.digest(encoding);
}
