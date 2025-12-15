import { Blob } from "@vjeko.com/azure-blob";
import { AppInfo } from "../types";
import { UpgradeRegistry, UpgradeProcedure } from "./UpgradeRegistry";

async function upgradeTag(
    appId: string,
    tag: string,
    blob: Blob<AppInfo>,
    procedure: UpgradeProcedure
): Promise<AppInfo> {
    const app = await blob.optimisticUpdate(async (currentApp: AppInfo | null): Promise<AppInfo> => {
        currentApp = currentApp || ({} as AppInfo);
        
        // Double-check for concurrency: if tag is already present, another process upgraded
        const currentUpgradeTags = currentApp._upgrade || [];
        if (currentUpgradeTags.includes(tag)) {
            return currentApp;
        }

        // Execute the upgrade procedure
        const upgraded = await procedure(appId, currentApp);
        
        // Add tag to _upgrade array
        const upgradedTags = upgraded._upgrade || [];
        upgraded._upgrade = [...upgradedTags, tag];
        
        return upgraded;
    }, {} as AppInfo);

    return app;
}

export async function upgrade(
    appId: string,
    app: AppInfo,
    blob: Blob<AppInfo>
): Promise<AppInfo> {
    // Get all registered upgrade tags
    const allTags = UpgradeRegistry.getAllTags();
    
    // Get current upgrade tags from app
    const currentUpgradeTags = app._upgrade || [];
    
    // Identify missing tags
    const missingTags = allTags.filter(tag => !currentUpgradeTags.includes(tag));
    
    // If no missing tags, return original app
    if (missingTags.length === 0) {
        return app;
    }
    
    // For each missing tag, re-read blob and apply upgrade
    let finalApp = app;
    for (const tag of missingTags) {
        // Re-read blob to get latest state (in case another process performed upgrades)
        const currentApp = await blob.read();
        if (!currentApp) {
            throw new Error(`App ${appId} not found during upgrade`);
        }
        
        const procedure = UpgradeRegistry.getProcedure(tag);
        if (!procedure) {
            throw new Error(`Upgrade procedure not found for tag: ${tag}`);
        }
        
        // Apply upgrade and store result for final return
        finalApp = await upgradeTag(appId, tag, blob, procedure);
    }
    
    return finalApp;
}

