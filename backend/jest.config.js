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
    setupFiles: ["<rootDir>/test/setup.ts"],
};
