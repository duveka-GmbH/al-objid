import { appRequestMandatory, appRequestOptional, AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { SingleAppHttpRequestSymbol, MultiAppHttpRequestSymbol, SingleAppHttpRequestOptionalSymbol, MultiAppHttpRequestOptionalSymbol } from "../../src/http/AzureHttpRequest";

describe("appRequestMandatory", () => {
    describe("single app mode (default)", () => {
        it("should set SingleAppHttpRequestSymbol to true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler);

            expect(handler[SingleAppHttpRequestSymbol]).toBe(true);
        });

        it("should not set MultiAppHttpRequestSymbol", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler);

            expect(handler[MultiAppHttpRequestSymbol]).toBeUndefined();
        });

        it("should be idempotent - calling twice with same mode does nothing", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler);
            appRequestMandatory(handler);

            expect(handler[SingleAppHttpRequestSymbol]).toBe(true);
            expect(handler[MultiAppHttpRequestSymbol]).toBeUndefined();
        });
    });

    describe("multi app mode", () => {
        it("should set MultiAppHttpRequestSymbol to true when multiApp is true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler, true);

            expect(handler[MultiAppHttpRequestSymbol]).toBe(true);
        });

        it("should not set SingleAppHttpRequestSymbol when multiApp is true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler, true);

            expect(handler[SingleAppHttpRequestSymbol]).toBeUndefined();
        });

        it("should be idempotent - calling twice with multiApp true does nothing", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestMandatory(handler, true);
            appRequestMandatory(handler, true);

            expect(handler[MultiAppHttpRequestSymbol]).toBe(true);
            expect(handler[SingleAppHttpRequestSymbol]).toBeUndefined();
        });
    });

    describe("mutual exclusivity - single vs multi app", () => {
        it("should throw when switching from single to multi app mode", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler); // single app

            expect(() => appRequestMandatory(handler, true)).toThrow(
                "appRequestMandatory can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });

        it("should throw when switching from multi to single app mode", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler, true); // multi app

            expect(() => appRequestMandatory(handler)).toThrow(
                "appRequestMandatory can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });

        it("should throw when switching from multi to single app mode with explicit false", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler, true); // multi app

            expect(() => appRequestMandatory(handler, false)).toThrow(
                "appRequestMandatory can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });
    });

    describe("mutual exclusivity - mandatory vs optional", () => {
        it("should throw when appRequestOptional (single) was already called", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler); // optional single app

            expect(() => appRequestMandatory(handler)).toThrow(
                "appRequestMandatory cannot be used together with appRequestOptional - they are mutually exclusive"
            );
        });

        it("should throw when appRequestOptional (multi) was already called", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler, true); // optional multi app

            expect(() => appRequestMandatory(handler, true)).toThrow(
                "appRequestMandatory cannot be used together with appRequestOptional - they are mutually exclusive"
            );
        });

        it("should throw when trying mandatory single after optional multi", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler, true); // optional multi app

            // Trying mandatory single - should throw because optional multi is set
            expect(() => appRequestMandatory(handler)).toThrow(
                "appRequestMandatory cannot be used together with appRequestOptional - they are mutually exclusive"
            );
        });

        it("should throw when trying mandatory multi after optional single", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler); // optional single app

            // Trying mandatory multi - should throw because optional single is set
            expect(() => appRequestMandatory(handler, true)).toThrow(
                "appRequestMandatory cannot be used together with appRequestOptional - they are mutually exclusive"
            );
        });
    });
});

describe("appRequestOptional", () => {
    describe("single app mode (default)", () => {
        it("should set SingleAppHttpRequestOptionalSymbol to true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler);

            expect(handler[SingleAppHttpRequestOptionalSymbol]).toBe(true);
        });

        it("should not set MultiAppHttpRequestOptionalSymbol", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler);

            expect(handler[MultiAppHttpRequestOptionalSymbol]).toBeUndefined();
        });

        it("should be idempotent - calling twice with same mode does nothing", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler);
            appRequestOptional(handler);

            expect(handler[SingleAppHttpRequestOptionalSymbol]).toBe(true);
            expect(handler[MultiAppHttpRequestOptionalSymbol]).toBeUndefined();
        });
    });

    describe("multi app mode", () => {
        it("should set MultiAppHttpRequestOptionalSymbol to true when multiApp is true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler, true);

            expect(handler[MultiAppHttpRequestOptionalSymbol]).toBe(true);
        });

        it("should not set SingleAppHttpRequestOptionalSymbol when multiApp is true", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler, true);

            expect(handler[SingleAppHttpRequestOptionalSymbol]).toBeUndefined();
        });

        it("should be idempotent - calling twice with multiApp true does nothing", () => {
            const handler: AzureHttpHandler = jest.fn();

            appRequestOptional(handler, true);
            appRequestOptional(handler, true);

            expect(handler[MultiAppHttpRequestOptionalSymbol]).toBe(true);
            expect(handler[SingleAppHttpRequestOptionalSymbol]).toBeUndefined();
        });
    });

    describe("mutual exclusivity - single vs multi app", () => {
        it("should throw when switching from single to multi app mode", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler); // single app

            expect(() => appRequestOptional(handler, true)).toThrow(
                "appRequestOptional can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });

        it("should throw when switching from multi to single app mode", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler, true); // multi app

            expect(() => appRequestOptional(handler)).toThrow(
                "appRequestOptional can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });

        it("should throw when switching from multi to single app mode with explicit false", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestOptional(handler, true); // multi app

            expect(() => appRequestOptional(handler, false)).toThrow(
                "appRequestOptional can only be called once per handler - SingleApp and MultiApp are mutually exclusive"
            );
        });
    });

    describe("mutual exclusivity - optional vs mandatory", () => {
        it("should throw when appRequestMandatory (single) was already called", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler); // mandatory single app

            expect(() => appRequestOptional(handler)).toThrow(
                "appRequestOptional cannot be used together with appRequestMandatory - they are mutually exclusive"
            );
        });

        it("should throw when appRequestMandatory (multi) was already called", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler, true); // mandatory multi app

            expect(() => appRequestOptional(handler, true)).toThrow(
                "appRequestOptional cannot be used together with appRequestMandatory - they are mutually exclusive"
            );
        });

        it("should throw when trying optional single after mandatory multi", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler, true); // mandatory multi app

            // Trying optional single - should throw because mandatory multi is set
            expect(() => appRequestOptional(handler)).toThrow(
                "appRequestOptional cannot be used together with appRequestMandatory - they are mutually exclusive"
            );
        });

        it("should throw when trying optional multi after mandatory single", () => {
            const handler: AzureHttpHandler = jest.fn();
            appRequestMandatory(handler); // mandatory single app

            // Trying optional multi - should throw because mandatory single is set
            expect(() => appRequestOptional(handler, true)).toThrow(
                "appRequestOptional cannot be used together with appRequestMandatory - they are mutually exclusive"
            );
        });
    });
});

