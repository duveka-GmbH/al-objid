import { ExtensionContext, window } from "vscode";
import openExternal from "../lib/functions/openExternal";

const EOL_NOTIFICATION_KEY = "eol-notification/last-shown";
const NOTIFICATION_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

export class EndOfLifeNotificationHandler {
    private static _instance: EndOfLifeNotificationHandler;

    private constructor() {}

    public static get instance() {
        return this._instance || (this._instance = new EndOfLifeNotificationHandler());
    }

    public check(context: ExtensionContext) {
        const lastShown = context.globalState.get<number>(EOL_NOTIFICATION_KEY);
        const now = Date.now();

        // If never shown, or if 48 hours have passed since last shown
        if (!lastShown || now - lastShown >= NOTIFICATION_INTERVAL) {
            this.showNotification(context);
        }
    }

    private async showNotification(context: ExtensionContext) {
        // Update the last shown timestamp immediately to prevent multiple notifications
        context.globalState.update(EOL_NOTIFICATION_KEY, Date.now());

        const message =
            "End-of-life for free AL Object ID Ninja backend. Click Learn more and take action to avoid service disruption and make sure you keep getting conflict-free object IDs.";

        const learnMore = "Learn more";
        const signUp = "Sign up";

        const response = await window.showWarningMessage(message, learnMore, signUp);

        if (response === learnMore) {
            openExternal("https://vjeko.com/2025/11/09/end-of-free-backend-for-al-object-id-ninja/");
        } else if (response === signUp) {
            openExternal("https://alid.ninja");
        }
    }
}
