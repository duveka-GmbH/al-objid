import { encrypt, decrypt } from "../../src/utils/encrypt";

// Real crypto round-trip tests (no mocks) to verify actual encryption/decryption works
describe("encrypt (real crypto)", () => {
    // Valid 32-byte key for AES-256
    const validKey = "12345678901234567890123456789012";

    describe("encrypt/decrypt round-trip", () => {
        it("should successfully encrypt and decrypt a simple string", () => {
            const plaintext = "Hello, World!";

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();
            expect(encrypted).toContain("?"); // IV separator

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt an empty string", () => {
            const plaintext = "";

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt unicode characters", () => {
            const plaintext = "Hello World!";

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt special characters", () => {
            const plaintext = "!@#$%^&*()_+-=[]{}|;':\",./<>?";

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt multi-line text", () => {
            const plaintext = "Line 1\nLine 2\nLine 3";

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt long content", () => {
            const plaintext = "a".repeat(10000);

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
        });

        it("should successfully encrypt and decrypt JSON data", () => {
            const plaintext = JSON.stringify({ key: "value", nested: { arr: [1, 2, 3] } });

            const encrypted = encrypt(plaintext, validKey);
            expect(encrypted).toBeDefined();

            const decrypted = decrypt(encrypted!, validKey);
            expect(decrypted).toBe(plaintext);
            expect(JSON.parse(decrypted!)).toEqual({ key: "value", nested: { arr: [1, 2, 3] } });
        });
    });

    describe("encryption output format", () => {
        it("should produce output with IV?ciphertext format", () => {
            const encrypted = encrypt("test", validKey)!;
            const parts = encrypted.split("?");

            expect(parts.length).toBe(2);
            // IV should be base64 encoded 16 bytes
            const iv = Buffer.from(parts[0], "base64");
            expect(iv.length).toBe(16);
        });

        it("should produce different ciphertext for same plaintext (due to random IV)", () => {
            const plaintext = "same text";

            const encrypted1 = encrypt(plaintext, validKey)!;
            const encrypted2 = encrypt(plaintext, validKey)!;

            // The encrypted outputs should be different due to random IV
            expect(encrypted1).not.toBe(encrypted2);

            // But both should decrypt to the same plaintext
            expect(decrypt(encrypted1, validKey)).toBe(plaintext);
            expect(decrypt(encrypted2, validKey)).toBe(plaintext);
        });
    });

    describe("decryption with wrong key", () => {
        it("should return undefined when decrypting with wrong key", () => {
            const plaintext = "secret message";
            const wrongKey = "00000000000000000000000000000000";

            const encrypted = encrypt(plaintext, validKey)!;
            const decrypted = decrypt(encrypted, wrongKey);

            // Decryption with wrong key should fail (return undefined or wrong value)
            // AES-CBC with wrong key typically throws an error due to padding issues
            expect(decrypted).toBeUndefined();
        });
    });

    describe("invalid inputs", () => {
        it("should return undefined for encrypt with invalid key length", () => {
            const result = encrypt("test", "shortkey");
            expect(result).toBeUndefined();
        });

        it("should return undefined for decrypt with malformed input", () => {
            const result = decrypt("not-valid-base64?data", validKey);
            expect(result).toBeUndefined();
        });

        it("should return undefined for decrypt with tampered ciphertext", () => {
            const encrypted = encrypt("test", validKey)!;
            const parts = encrypted.split("?");
            const tamperedEncrypted = `${parts[0]}?tamperedData`;

            const result = decrypt(tamperedEncrypted, validKey);
            expect(result).toBeUndefined();
        });
    });
});
