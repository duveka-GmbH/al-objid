import { commands, env, ExtensionContext } from "vscode";
import { EXTENSION_ID, EXTENSION_VERSION } from "../lib/constants";
import { UI } from "../lib/UI";
import { isNewerVersion } from "../lib/utils/semver";
import { LogLevel, Output } from "./Output";
import { Config } from "../lib/Config";

const MARKETPLACE_API_URL = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1";

interface MarketplaceResponse {
    results: Array<{
        extensions: Array<{
            versions: Array<{
                version: string;
            }>;
        }>;
    }>;
}

export class MarketplaceVersionHandler {
    private static _instance: MarketplaceVersionHandler;
    private _context?: ExtensionContext;

    private constructor() {}

    public static get instance() {
        return this._instance || (this._instance = new MarketplaceVersionHandler());
    }

    public async check(context: ExtensionContext): Promise<void> {
        this._context = context;

        // Only check marketplace version when running in VS Code (not Cursor or other forks)
        if (env.uriScheme !== "vscode") {
            return;
        }

        if (!EXTENSION_VERSION) {
            return;
        }

        try {
            const marketplaceVersion = await this.getMarketplaceVersion();
            if (!marketplaceVersion) {
                return;
            }

            if (isNewerVersion(EXTENSION_VERSION, marketplaceVersion)) {
                await this.showUpgradeNotification(marketplaceVersion);
            }
        } catch (error) {
            if (Config.instance.useVerboseOutputLogging) {
                Output.instance.log(`[MarketplaceVersionHandler] Error checking marketplace version: ${error}`, LogLevel.Info);
            }
        }
    }

    private stateKey(marketplaceVersion: string): string {
        return `dismissed/marketplace/${marketplaceVersion}`;
    }

    private async getMarketplaceVersion(): Promise<string | undefined> {
        const response = await fetch(MARKETPLACE_API_URL, {
            method: "POST",
            headers: {
                "Accept": "application/json;api-version=3.0-preview.1",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filters: [{
                    criteria: [{ filterType: 7, value: EXTENSION_ID }],
                    pageSize: 1,
                    pageNumber: 1
                }],
                flags: 0x1 // IncludeVersions
            })
        });

        if (!response.ok) {
            return undefined;
        }

        const data = await response.json() as MarketplaceResponse;
        return data.results?.[0]?.extensions?.[0]?.versions?.[0]?.version;
    }

    private async showUpgradeNotification(marketplaceVersion: string): Promise<void> {
        if (this._context?.globalState.get(this.stateKey(marketplaceVersion))) {
            return;
        }

        const response = await UI.general.showMarketplaceUpgradeAvailable(marketplaceVersion);

        if (response === "Update Now") {
            commands.executeCommand("workbench.extensions.installExtension", EXTENSION_ID);
        }
        if (response === "View Details") {
            commands.executeCommand("workbench.extensions.action.showExtensionsWithIds", [EXTENSION_ID]);
        }
        if (response === "Dismiss") {
            this._context?.globalState.update(this.stateKey(marketplaceVersion), true);
        }
    }
}
