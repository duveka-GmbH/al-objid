module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/test"],
    testMatch: ["**/*.test.ts"],
    testPathIgnorePatterns: ["/node_modules/"],
    moduleFileExtensions: ["ts", "js", "json", "node"],
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
    coverageDirectory: "coverage",
    verbose: true,
    moduleNameMapper: {
        "^@vjeko\\.com/azure-blob$": "<rootDir>/test/__mocks__/@vjeko.com/azure-blob.ts",
    },
};
