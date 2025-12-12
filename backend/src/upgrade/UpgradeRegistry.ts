import { AppInfo } from "../types";
import { upgradeInitializeV3 } from "./upgradeInitializeV3";

export type UpgradeProcedure = (appId: string, app: AppInfo) => Promise<AppInfo>;

/**
 * Upgrade procedures registry.
 * 
 * All upgrade procedures are stored in separate files (one file per procedure)
 * and imported here for registration. This keeps the registry clean and makes each upgrade
 * procedure independently testable and maintainable.
 * 
 * To add a new upgrade procedure:
 * 1. Create a new file: upgrade<ProcedureName>.ts
 * 2. Export the procedure function
 * 3. Import it above and register it in the upgradeProcedures map below
 */
const upgradeProcedures: Record<string, UpgradeProcedure> = {
    "V3.INIT": upgradeInitializeV3,
};

export const UpgradeRegistry = {
    getAllTags(): string[] {
        return Object.keys(upgradeProcedures);
    },

    getProcedure(tag: string): UpgradeProcedure | undefined {
        return upgradeProcedures[tag];
    },
};

export function __test_only__registerUpgradeProcedure(tag: string, procedure: UpgradeProcedure) {
    upgradeProcedures[tag] = procedure;
}
