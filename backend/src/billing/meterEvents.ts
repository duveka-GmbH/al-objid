/**
 * Stripe Meter Events
 *
 * Sends meter events to Stripe for PAYG billing.
 * Uses direct HTTP calls to avoid adding the Stripe SDK dependency.
 */

const STRIPE_METER_EVENTS_URL = "https://api.stripe.com/v1/billing/meter_events";

/**
 * Meter event types for PAYG billing.
 */
export type MeterEventType = "pay_as_you_go_app" | "pay_as_you_go_user";

/**
 * Send a meter event to Stripe.
 *
 * Fire-and-forget: logs errors but does not throw or block.
 *
 * @param type - The meter event type
 * @param stripeCustomerId - The Stripe customer ID
 * @param identifier - Idempotency key identifier (e.g., orgId_month_app_appKey)
 */
export async function sendMeterEvent(
    type: MeterEventType,
    stripeCustomerId: string,
    identifier: string,
    valueOverride: string = "value"
): Promise<void> {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        console.error("STRIPE_SECRET_KEY not configured, skipping meter event");
        return;
    }

    try {
        const timestamp = Math.floor(Date.now() / 1000);

        const body = new URLSearchParams({
            event_name: type,
            "payload[stripe_customer_id]": stripeCustomerId,
            [`payload[${valueOverride}]`]: "1",
            timestamp: timestamp.toString(),
            identifier: identifier,
        });

        const response = await fetch(STRIPE_METER_EVENTS_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${stripeSecretKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Stripe meter event failed: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.error("Error sending Stripe meter event:", error);
    }
}

/**
 * Send an app meter event for a new app seen in the billing period.
 */
export async function sendAppMeterEvent(
    stripeCustomerId: string,
    orgId: string,
    monthKey: string,
    appKey: string
): Promise<void> {
    const identifier = `${orgId}_${monthKey}_app_${appKey}`;
    await sendMeterEvent("pay_as_you_go_app", stripeCustomerId, identifier);
}

/**
 * Send a user meter event for a new user seen in the billing period.
 */
export async function sendUserMeterEvent(
    stripeCustomerId: string,
    orgId: string,
    monthKey: string,
    email: string
): Promise<void> {
    const identifier = `${orgId}_${monthKey}_user_${email}`;
    await sendMeterEvent("pay_as_you_go_user", stripeCustomerId, identifier, "users");
}
