import * as path from "path";
import { ALObject } from "./types";
import { CheckType } from "./CheckType";
import { CheckResponse } from "./CheckResponse";
import { EventEmitter } from "events";
import { getNativeModulePath, getExtensionRoot } from "./getNativeModulePath";

/**
 * Checks if an error is a Windows DLL loading error (error code 126)
 * and returns a user-friendly message if so
 */
function getWindowsDllErrorMessage(error: Error, modulePath: string): string | null {
    // Windows error 126 = ERROR_MOD_NOT_FOUND (missing DLL dependency)
    if (process.platform !== "win32") {
        return null;
    }

    const errorMessage = error.message || "";
    if (!errorMessage.includes("126")) {
        return null;
    }

    return [
        `Failed to load native parser module: ${modulePath}`,
        "",
        "This error typically occurs when the Microsoft Visual C++ Redistributable is not installed.",
        "",
        "To fix this, please install the Visual C++ Redistributable:",
        "  https://aka.ms/vs/17/release/vc_redist.x64.exe",
        "",
        "After installing, restart VS Code and try again.",
        "",
        `Technical details: ${errorMessage}`
    ].join("\n");
}

// Native module interface - this should match what the .node file exports
interface NativeParserModule {
    initialize(workers?: number): Promise<void>;
    terminate(): Promise<void>;
    parse(sources: string[]): Promise<ALObject[]>;
    check(
        checkType: CheckType,
        code: string,
        stopAt: { line: number; character: number },
        symbols: string[]
    ): Promise<CheckResponse>;
}

/**
 * Wrapper class for the native AL parser module
 * Provides the same interface as the external parser package (now replaced with native implementation)
 */
class NativeParser extends EventEmitter {
    private _initialized: boolean = false;
    private _ready: Promise<void> | null = null;
    private _resolveReady: (() => void) | null = null;
    private _nativeModule: NativeParserModule | null = null;

    constructor() {
        super();
        this._loadNativeModule();
    }

    private _loadNativeModule(): void {
        // Get the extension root and platform-specific module path
        const extensionRoot = getExtensionRoot();
        const platform = process.platform;
        const arch = process.arch;
        
        console.log(`[AL Parser] Detected platform: ${platform} (${arch})`);
        
        let modulePath: string;
        try {
            modulePath = getNativeModulePath(extensionRoot);
            console.log(`[AL Parser] Resolved native module path: ${modulePath}`);
        } catch (error) {
            const err = error as Error;
            const errorMessage = `Failed to resolve native parser module path. Platform: ${platform} (${arch}). Error: ${err.message}`;
            console.error(`[AL Parser] ${errorMessage}`);
            this.emit("error", new Error(errorMessage));
            throw new Error(errorMessage);
        }

        let loadedModule: any = null;

        try {
            loadedModule = require(modulePath);
            console.log(`[AL Parser] Successfully loaded native module from: ${modulePath}`);
        } catch (error) {
            const err = error as Error;

            // Check for Windows DLL loading error (error 126)
            const dllErrorMessage = getWindowsDllErrorMessage(err, modulePath);
            if (dllErrorMessage) {
                console.error(`[AL Parser] ${dllErrorMessage}`);
                this.emit("error", new Error(dllErrorMessage));
                throw new Error(dllErrorMessage);
            }

            const errorMessage = `Failed to load native parser module from ${modulePath}. Platform: ${platform} (${arch}). Error: ${err.message}`;
            console.error(`[AL Parser] ${errorMessage}`);
            this.emit("error", new Error(errorMessage));
            throw new Error(errorMessage);
        }

        // The native module might export in different ways:
        // 1. Direct exports: { initialize, parse, check, terminate }
        // 2. Default export: module.exports = { ... }
        // 3. Individual properties: module.exports.initialize = ...
        // 4. Constructor function that returns an object
        // Let's check what we got and adapt
        
        // Log what we got for debugging
        const moduleType = typeof loadedModule;
        const exportedKeys = loadedModule && typeof loadedModule === "object" ? Object.keys(loadedModule) : [];
        console.log(`[AL Parser] Native module type: ${moduleType}, exported keys: ${exportedKeys.join(", ")}`);
        
        if (typeof loadedModule === "object" && loadedModule !== null) {
            // Check if methods are directly on the object
            if (typeof loadedModule.initialize === "function") {
                this._nativeModule = loadedModule as NativeParserModule;
                console.log("[AL Parser] Using direct exports pattern");
            } else if (loadedModule.default && typeof loadedModule.default.initialize === "function") {
                // ES6 default export
                this._nativeModule = loadedModule.default as NativeParserModule;
                console.log("[AL Parser] Using default export pattern");
            } else if (typeof loadedModule === "function") {
                // It might be a constructor function
                try {
                    const instance = (loadedModule as any)();
                    if (instance && typeof instance.initialize === "function") {
                        this._nativeModule = instance as NativeParserModule;
                    } else {
                        throw new Error("Constructor didn't return expected object");
                    }
                } catch (err) {
                    const exportedKeys = Object.keys(loadedModule);
                    const errorMessage = `Native module is a function but doesn't return expected interface. Module keys: ${exportedKeys.join(", ")}. Expected: initialize, parse, check, terminate`;
                    this.emit("error", new Error(errorMessage));
                    throw new Error(errorMessage);
                }
            } else {
                // Pattern 3: Functions might be at top level - check if we have parse, check functions directly
                if (typeof loadedModule.parse === "function" && typeof loadedModule.check === "function") {
                    // Create a wrapper that matches our interface
                    this._nativeModule = {
                        initialize: loadedModule.initialize || (async () => {}),
                        terminate: loadedModule.terminate || (async () => {}),
                        parse: loadedModule.parse,
                        check: loadedModule.check
                    } as NativeParserModule;
                    console.log("[AL Parser] Using top-level functions pattern (parse/check found)");
                    return;
                }
                
                // Log what we actually got for debugging
                const exportedKeys = Object.keys(loadedModule);
                const errorMessage = `Native module loaded but doesn't have expected interface. Exported keys: ${exportedKeys.join(", ")}. Expected: initialize, parse, check, terminate. Module type: ${typeof loadedModule}`;
                console.error("[AL Parser] Native module structure:", loadedModule);
                console.error("[AL Parser] Available keys:", exportedKeys);
                this.emit("error", new Error(errorMessage));
                throw new Error(errorMessage);
            }
        } else if (typeof loadedModule === "function") {
            // It's a function, try calling it
            try {
                const instance = loadedModule();
                if (instance && typeof instance.initialize === "function") {
                    this._nativeModule = instance as NativeParserModule;
                } else {
                    throw new Error("Function didn't return expected object");
                }
            } catch (err) {
                const errorMessage = `Native module is a function but doesn't return expected interface. Error: ${(err as Error).message}`;
                this.emit("error", new Error(errorMessage));
                throw new Error(errorMessage);
            }
        } else {
            const errorMessage = `Native module loaded but is not an object or function. Type: ${typeof loadedModule}`;
            this.emit("error", new Error(errorMessage));
            throw new Error(errorMessage);
        }
    }

    public async initialize(workers?: number): Promise<void> {
        if (this._initialized) {
            return;
        }

        if (!this._ready) {
            this._ready = new Promise<void>((resolve) => {
                this._resolveReady = resolve;
            });
        }

        try {
            if (!this._nativeModule) {
                throw new Error("Native module not loaded");
            }

            await this._nativeModule.initialize(workers);
            this._initialized = true;
            
            if (this._resolveReady) {
                this._resolveReady();
                this._resolveReady = null;
            }
        } catch (error) {
            const err = error as Error;
            this.emit("error", err);
            throw err;
        }
    }

    public async terminate(): Promise<void> {
        if (!this._initialized || !this._nativeModule) {
            return;
        }

        try {
            await this._nativeModule.terminate();
            this._initialized = false;
            this._ready = null;
        } catch (error) {
            const err = error as Error;
            this.emit("error", err);
            throw err;
        }
    }

    public async parse(sources: string[]): Promise<ALObject[]> {
        if (!this._initialized || !this._nativeModule) {
            throw new Error("Parser not initialized. Call initialize() first.");
        }

        try {
            return await this._nativeModule.parse(sources);
        } catch (error) {
            const err = error as Error;
            this.emit("error", err);
            throw err;
        }
    }

    public async check(
        checkType: CheckType,
        code: string,
        stopAt: { line: number; character: number },
        symbols: string[]
    ): Promise<CheckResponse> {
        if (!this._initialized || !this._nativeModule) {
            throw new Error("Parser not initialized. Call initialize() first.");
        }

        try {
            return await this._nativeModule.check(checkType, code, stopAt, symbols);
        } catch (error) {
            const err = error as Error;
            this.emit("error", err);
            throw err;
        }
    }
}

// Export singleton instance to match the external package API
export const ALParserNinja = new NativeParser();

