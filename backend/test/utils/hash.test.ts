import { getSha256 } from "../../src/utils/hash";

// Real crypto tests to verify actual hash output matches expected values
describe("getSha256 (real crypto)", () => {
    describe("known hash values", () => {
        // These are known SHA256 hash values that can be verified externally
        it("should produce correct hex hash for empty string", () => {
            const result = getSha256("", "hex");
            // SHA256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
            expect(result).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        });

        it("should produce correct hex hash for 'hello'", () => {
            const result = getSha256("hello", "hex");
            // SHA256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
            expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
        });

        it("should produce correct hex hash for 'Hello, World!'", () => {
            const result = getSha256("Hello, World!", "hex");
            // SHA256("Hello, World!") = dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f
            expect(result).toBe("dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f");
        });

        it("should produce correct base64 hash for empty string", () => {
            const result = getSha256("", "base64");
            // Base64 encoded version of the empty string SHA256 hash
            expect(result).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
        });

        it("should produce correct base64 hash for 'hello'", () => {
            const result = getSha256("hello", "base64");
            // Base64 encoded version of the "hello" SHA256 hash
            expect(result).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
        });
    });

    describe("hash properties", () => {
        it("should produce 64-character hex output (256 bits)", () => {
            const result = getSha256("any content", "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should produce 44-character base64 output (with padding)", () => {
            const result = getSha256("any content", "base64");
            expect(result.length).toBe(44);
            expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
        });

        it("should produce deterministic output for same input", () => {
            const input = "test content";
            const result1 = getSha256(input, "hex");
            const result2 = getSha256(input, "hex");
            expect(result1).toBe(result2);
        });

        it("should produce different output for different inputs", () => {
            const result1 = getSha256("content1", "hex");
            const result2 = getSha256("content2", "hex");
            expect(result1).not.toBe(result2);
        });

        it("should be case sensitive", () => {
            const result1 = getSha256("Hello", "hex");
            const result2 = getSha256("hello", "hex");
            expect(result1).not.toBe(result2);
        });

        it("should be whitespace sensitive", () => {
            const result1 = getSha256("hello", "hex");
            const result2 = getSha256("hello ", "hex");
            const result3 = getSha256(" hello", "hex");
            expect(result1).not.toBe(result2);
            expect(result1).not.toBe(result3);
            expect(result2).not.toBe(result3);
        });
    });

    describe("various input types", () => {
        it("should hash unicode characters correctly", () => {
            const result = getSha256("Hello World", "hex");
            expect(result.length).toBe(64);
            // Ensure it's a valid hex string
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should hash special characters correctly", () => {
            const result = getSha256("!@#$%^&*()", "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should hash newlines correctly", () => {
            const result = getSha256("line1\nline2", "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should hash long content correctly", () => {
            const longContent = "a".repeat(10000);
            const result = getSha256(longContent, "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should hash JSON correctly", () => {
            const json = JSON.stringify({ key: "value", arr: [1, 2, 3] });
            const result = getSha256(json, "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should handle empty string content", () => {
            const result = getSha256("", "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should handle content with whitespace", () => {
            const result = getSha256("  spaces  and\ttabs\t", "hex");
            expect(result.length).toBe(64);
            expect(result).toMatch(/^[0-9a-f]{64}$/);
        });
    });

    describe("encoding comparison", () => {
        it("should produce equivalent hashes in different encodings", () => {
            const content = "test content";
            const hexResult = getSha256(content, "hex");
            const base64Result = getSha256(content, "base64");

            // Convert hex to base64 and compare
            const hexToBase64 = Buffer.from(hexResult, "hex").toString("base64");
            expect(hexToBase64).toBe(base64Result);
        });
    });
});
