import { workspace, WorkspaceConfiguration } from "vscode";
import { DisposableHolder } from "../features/DisposableHolder";

const CONFIG_SECTION = "objectIdNinja";

const DEFAULT_HOST_NAME = "backend.alid.ninja";

export class Config extends DisposableHolder {
    private _config: WorkspaceConfiguration;
    private static _instance: Config;

    private constructor() {
        super();
        this._config = workspace.getConfiguration(CONFIG_SECTION);
        this.registerDisposable(
            workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration(CONFIG_SECTION)) {
                    this._config = workspace.getConfiguration(CONFIG_SECTION);
                }
            })
        );
    }

    public static get instance(): Config {
        return this._instance || (this._instance = new Config());
    }

    private getWithDefault<T>(setting: string, defaultValue: T) {
        let config = this._config.get<T>(setting);
        if (typeof config === "undefined") config = defaultValue;
        return config;
    }

    public get backEndUrl(): string {
        return this._config.get<string>("backEndUrl") || DEFAULT_HOST_NAME;
    }

    public get backEndAPIKey(): string {
        return this._config.get<string>("backEndAPIKey") || "";
    }

    public get isDefaultBackEndConfiguration(): boolean {
        return this.backEndUrl === DEFAULT_HOST_NAME;
    }

    public get showEventLogNotifications(): boolean {
        return this.getWithDefault<boolean>("showEventLogNotifications", true);
    }

    public get useVerboseOutputLogging(): boolean {
        return this.getWithDefault<boolean>("useVerboseOutputLogging", true);
    }

    public get showReleaseNotes(): boolean {
        return this.getWithDefault<boolean>("showReleaseNotes", true);
    }

    public get showRangeWarnings(): boolean {
        return this.getWithDefault<boolean>("showRangeWarnings", true);
    }

    public get requestPerRange(): boolean {
        return this.getWithDefault<boolean>("requestPerRange", false);
    }
}
