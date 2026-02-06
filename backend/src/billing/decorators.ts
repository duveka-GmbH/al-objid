/**
 * Billing Decorators
 *
 * These decorators mark handlers for billing-related processing.
 * Each decorator sets a symbol on the handler that is checked during
 * request processing in handleRequest.
 */

import { AzureHttpHandler } from "../http/AzureHttpHandler";

/**
 * Symbol to store the handler's moniker (endpoint name).
 * Used for feature logging - the moniker identifies which feature was used.
 */
export const MonikerSymbol = Symbol("Moniker");

/**
 * Symbol to mark handlers that require security checking.
 * When set, the handler will go through full permission checks.
 */
export const SecuritySymbol = Symbol("Security");

/**
 * Symbol to mark handlers that should log usage.
 * When set, successful requests are logged for billing purposes.
 */
export const UsageLoggingSymbol = Symbol("UsageLogging");

/**
 * Symbol to mark handlers that should log invocations.
 * When set, all invocations are logged to info logs.
 */
export const LoggingSymbol = Symbol("Logging");

/**
 * Symbol to mark handlers that need billing data bound.
 * When set, billing info is bound but not enforced.
 */
export const BillingSymbol = Symbol("Billing");

/**
 * Mark a handler as requiring security checks.
 *
 * When this decorator is applied, handleRequest will:
 * 1. Invalidate all caches to ensure fresh data
 * 2. Bind billing information (app, user, organization)
 * 3. Process claiming for orphaned apps
 * 4. Check blocking status
 * 5. Check dunning status
 * 6. Perform permission check
 * 7. Enforce permission (throw 403 if denied)
 *
 * Also applies withLogging and withBilling.
 */
export function withSecurity(handler: AzureHttpHandler): void {
    (handler as any)[SecuritySymbol] = true;
    (handler as any)[LoggingSymbol] = true;
    (handler as any)[BillingSymbol] = true;
}

/**
 * Mark a handler as requiring usage logging.
 *
 * When this decorator is applied, handleRequest will:
 * 1. Bind billing information
 * 2. Log usage for billing purposes in the finally block
 *
 * Also applies withBilling.
 */
export function withUsageLogging(handler: AzureHttpHandler): void {
    (handler as any)[UsageLoggingSymbol] = true;
    (handler as any)[BillingSymbol] = true;
}

/**
 * Mark a handler as requiring invocation logging.
 *
 * When this decorator is applied, handleRequest will:
 * 1. Bind billing information
 * 2. Log invocation to info logs in the finally block
 *
 * Also applies withBilling.
 */
export function withLogging(handler: AzureHttpHandler): void {
    (handler as any)[LoggingSymbol] = true;
    (handler as any)[BillingSymbol] = true;
}

/**
 * Mark a handler as needing billing data bound.
 *
 * When this decorator is applied, handleRequest will:
 * 1. Bind billing information (app, user, organization)
 *
 * No permission enforcement or logging occurs with just this decorator.
 */
export function withBilling(handler: AzureHttpHandler): void {
    (handler as any)[BillingSymbol] = true;
}
