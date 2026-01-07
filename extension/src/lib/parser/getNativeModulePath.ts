import * as path from "path";
import * as fs from "fs";

/**
 * Gets the platform-specific identifier for the native module
 * Returns: win32-x64-msvc, linux-x64-gnu, darwin-x64, or darwin-arm64
 */
function getPlatformIdentifier(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32") {
        // Windows: use msvc for x64
        return arch === "x64" ? "win32-x64-msvc" : `win32-${arch}-msvc`;
    } else if (platform === "linux") {
        // Linux: use gnu toolchain for x64
        return arch === "x64" ? "linux-x64-gnu" : `linux-${arch}`;
    } else if (platform === "darwin") {
        // macOS: distinguish between Intel (x64) and Apple Silicon (arm64)
        return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
    } else {
        throw new Error(`Unsupported platform: ${platform} (${arch})`);
    }
}

/**
 * Gets the path to the native parser module for the current platform
 * Tries the exact platform match first, then falls back to alternatives if needed
 * @param extensionRoot The root directory of the extension (where bin/ folder is located)
 * @returns The absolute path to the platform-specific .node file
 * @throws Error if no suitable native module is found
 */
export function getNativeModulePath(extensionRoot: string): string {
    const platformId = getPlatformIdentifier();
    const binDir = path.join(extensionRoot, "bin");
    
    // Primary path: exact platform match
    const primaryPath = path.join(binDir, `al-parser-ninja.${platformId}.node`);
    
    if (fs.existsSync(primaryPath)) {
        return primaryPath;
    }
    
    // Fallback: try alternative naming (e.g., linux-x64 without -gnu)
    const fallbackPaths: string[] = [];
    
    if (platformId.startsWith("linux-")) {
        // Try linux-x64 if linux-x64-gnu doesn't exist
        const altId = platformId.replace("-gnu", "");
        fallbackPaths.push(path.join(binDir, `al-parser-ninja.${altId}.node`));
    }
    
    // Try fallback paths
    for (const fallbackPath of fallbackPaths) {
        if (fs.existsSync(fallbackPath)) {
            console.warn(`[AL Parser] Using fallback path: ${fallbackPath} (expected: ${primaryPath})`);
            return fallbackPath;
        }
    }
    
    // No suitable module found
    const errorMessage = `Native parser module not found for platform ${platformId}. Expected: ${primaryPath}`;
    throw new Error(errorMessage);
}

/**
 * Gets the extension root path from the current __dirname
 * When compiled, __dirname will be out/lib/parser, so we go up 3 levels
 */
export function getExtensionRoot(): string {
    // When compiled: out/lib/parser -> extension root
    // When in source: src/lib/parser -> extension root (for development)
    return path.resolve(__dirname, "../../../");
}

