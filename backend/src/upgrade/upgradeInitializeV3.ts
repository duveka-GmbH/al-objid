import { AppInfo } from "../types";
import { UpgradeProcedure } from "./UpgradeRegistry";

/**
 * Upgrade procedure: V3.INIT
 * 
 * Removes the legacy _log property from app info as part of the v3 initialization.
 * This upgrade is idempotent - safe to run multiple times.
 */
export const upgradeInitializeV3: UpgradeProcedure = async (appId: string, app: AppInfo): Promise<AppInfo> => {
    const { _log, ...upgraded } = app;
    return upgraded;
};

