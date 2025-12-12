import { workspace } from "vscode";
import { ALAppManifest } from "../ALAppManifest";
import { Git } from "../Git";

interface GitUserInfo {
    name: string;
    email: string;
}

/**
 * Singleton cache for git user information.
 * Caches git user info (name/email) by manifest URI to avoid repeated git calls.
 */
export class GitUserCache {
    //#region Singleton
    private static _instance: GitUserCache;

    private constructor() {}

    public static get instance(): GitUserCache {
        return this._instance || (this._instance = new GitUserCache());
    }
    //#endregion

    private readonly _cache: Map<string, GitUserInfo> = new Map();
    private static readonly WORKSPACE_ROOT_KEY = "__workspace_root__";

    /**
     * Gets git user info for the given manifest, or falls back to workspace root.
     * Results are cached by URI string.
     * 
     * @param manifest Optional ALAppManifest to get git info from
     * @returns Git user info with name and email (empty strings if unavailable)
     */
    public async getUserInfo(manifest?: ALAppManifest): Promise<GitUserInfo> {
        const uri = manifest?.uri ?? workspace.workspaceFolders?.[0]?.uri;
        const cacheKey = uri?.fsPath ?? GitUserCache.WORKSPACE_ROOT_KEY;

        // Return cached value if available
        const cached = this._cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // If no URI available, return empty and cache it
        if (!uri) {
            const empty: GitUserInfo = { name: "", email: "" };
            this._cache.set(cacheKey, empty);
            return empty;
        }

        try {
            const gitInfo = await Git.instance.getUserInfo(uri);
            const result: GitUserInfo = {
                name: gitInfo.name?.trim() || "",
                email: gitInfo.email?.trim().toLowerCase() || "",
            };
            this._cache.set(cacheKey, result);
            return result;
        } catch {
            // Git command failed, cache and return empty
            const empty: GitUserInfo = { name: "", email: "" };
            this._cache.set(cacheKey, empty);
            return empty;
        }
    }
}

