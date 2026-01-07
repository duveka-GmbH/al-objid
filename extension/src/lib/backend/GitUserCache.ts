import { Uri, workspace } from "vscode";
import { ALAppManifest } from "../ALAppManifest";
import { Git } from "../Git";
import { Telemetry, TelemetryEventType } from "../Telemetry";
import * as crypto from "crypto";
import { Config } from "../Config";

interface GitUserInfo {
    name: string;
    email: string;
}

function getSha1(input: string): string {
    const sha1 = crypto.createHash("sha1");
    sha1.update(input);
    return sha1.digest("base64");
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
    private readonly _inFlightPromises: Map<string, Promise<GitUserInfo>> = new Map();
    private readonly _seenEmailsThisSession: Set<string> = new Set();
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

        // Check for in-flight promise
        const inFlight = this._inFlightPromises.get(cacheKey);
        if (inFlight) {
            return inFlight;
        }

        // If no URI available, return empty and cache it
        if (!uri) {
            const empty: GitUserInfo = { name: "", email: "" };
            this._cache.set(cacheKey, empty);
            return empty;
        }

        // Create new promise
        const promise = this._fetchAndCacheUserInfo(uri, cacheKey);
        this._inFlightPromises.set(cacheKey, promise);

        // Clean up on completion (success or failure)
        promise.finally(() => {
            this._inFlightPromises.delete(cacheKey);
        });

        return promise;
    }

    /**
     * Fetches git user info and caches the result.
     * 
     * @param uri The URI to fetch git info from
     * @param cacheKey The cache key to store the result under
     * @returns Promise resolving to git user info
     */
    private async _fetchAndCacheUserInfo(uri: Uri, cacheKey: string): Promise<GitUserInfo> {
        try {
            const gitInfo = await Git.instance.getUserInfo(uri);
            const result: GitUserInfo = {
                name: gitInfo.name?.trim() || "",
                email: gitInfo.email?.trim().toLowerCase() || "",
            };
            this._cache.set(cacheKey, result);
            if (result.email && !this._seenEmailsThisSession.has(result.email)) {
                this._seenEmailsThisSession.add(result.email);
                const uid = getSha1(`email:${result.email}`);
                Telemetry.instance.log(TelemetryEventType.UniqueUser, undefined, { uid: uid, ownEndpoints: !Config.instance.isDefaultBackEndConfiguration });
            }
            return result;
        } catch {
            // Git command failed, cache and return empty
            const empty: GitUserInfo = { name: "", email: "" };
            this._cache.set(cacheKey, empty);
            return empty;
        }
    }
}

