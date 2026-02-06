/**
 * Claiming Stage
 *
 * Attempts to auto-claim an orphaned app for an organization.
 * Uses publisher matching and user/domain verification.
 */

import { AzureHttpRequest } from "../../http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../http/parseNinjaHeaders";
import { CacheManager } from "../CacheManager";
import { BillingInfo, OrganizationInfo } from "../types";

/**
 * Normalize a string for comparison (lowercase, trimmed).
 */
function normalize(value: string | undefined): string {
    return (value ?? "").toLowerCase().trim();
}

/**
 * Get domain from email address.
 */
function getDomain(email: string): string {
    const parts = email.split("@");
    return parts.length > 1 ? normalize(parts[1]) : "";
}

/**
 * Result of claim evaluation for an organization.
 */
export interface ClaimCandidate {
    organization: OrganizationInfo;
    matchType: "user" | "domain";
}

/**
 * Result of evaluating claim candidates.
 * Distinguishes between "no publisher matches" and "publisher matches but no user/domain match".
 */
export interface ClaimEvaluationResult {
    /** Whether any organizations had a matching publisher */
    publisherMatchFound: boolean;
    /** Organizations that present valid claims (publisher + user/domain match) */
    candidates: ClaimCandidate[];
}

/**
 * Evaluate which organizations can claim an app.
 * Pure function - no side effects.
 *
 * @param publisher - The app publisher
 * @param gitEmail - The user's git email
 * @param organizations - All organizations to check
 * @returns Evaluation result with publisher match info and claim candidates
 */
export function evaluateClaimCandidates(
    publisher: string | undefined,
    gitEmail: string | undefined,
    organizations: OrganizationInfo[]
): ClaimEvaluationResult {
    const publisherNorm = normalize(publisher);
    const emailNorm = normalize(gitEmail);
    const emailDomain = gitEmail ? getDomain(gitEmail) : "";

    // Filter orgs with matching publisher
    const orgsWithPublisher = organizations.filter(org => {
        const publishers = org.publishers ?? [];
        return publishers.some(p => normalize(p) === publisherNorm);
    });

    // No publisher matches - exit without setting claimIssue
    if (orgsWithPublisher.length === 0) {
        return { publisherMatchFound: false, candidates: [] };
    }

    // Check each org for user or domain match
    const candidates: ClaimCandidate[] = [];

    for (const org of orgsWithPublisher) {
        // Check if user is in org's users list
        const users = org.users ?? [];
        if (emailNorm && users.some(u => normalize(u) === emailNorm)) {
            candidates.push({ organization: org, matchType: "user" });
            continue;
        }

        // Check if user's domain is in org's domains list
        const domains = org.domains ?? [];
        if (emailDomain && domains.some(d => normalize(d) === emailDomain)) {
            candidates.push({ organization: org, matchType: "domain" });
            continue;
        }
    }

    return { publisherMatchFound: true, candidates };
}

/**
 * Execute claiming stage.
 * Attempts to auto-claim orphaned app for an organization.
 */
export async function claimingStage(
    request: AzureHttpRequest,
    headers: ParsedNinjaHeaders
): Promise<void> {
    const billing = request.billing;
    if (!billing) {
        return;
    }

    // Guard: Only process orphaned apps (no owner yet)
    if (billing.app?.ownerId) {
        return;
    }

    // Guard: Must have non-blank publisher to attempt claiming
    if (!normalize(headers.appPublisher)) {
        return;
    }

    // Get all organizations
    const organizations = await CacheManager.getOrganizations();

    // Evaluate claim candidates
    const result = evaluateClaimCandidates(
        headers.appPublisher,
        headers.gitUserEmail,
        organizations
    );

    // Handle claim results
    handleClaimResult(billing, result);
}

/**
 * Handle claim result based on evaluation result.
 *
 * Per spec:
 * - No publisher matches → exit silently (no claimIssue)
 * - Publisher matches but no valid user/domain claim → claimIssue = true
 * - Multiple conflicting claims → claimIssue = true
 * - Single valid claim → claim the app
 */
function handleClaimResult(
    billing: BillingInfo,
    result: ClaimEvaluationResult
): void {
    const { publisherMatchFound, candidates } = result;

    // No publisher matches - exit silently without setting claimIssue
    // The app simply isn't part of any configured organization
    if (!publisherMatchFound) {
        return;
    }

    // Publisher matches exist but no valid user/domain claim
    if (candidates.length === 0) {
        billing.claimIssue = true;
        return;
    }

    // Multiple conflicting claims
    if (candidates.length > 1) {
        billing.claimIssue = true;
        return;
    }

    // Single valid claim - claim the app
    const { organization } = candidates[0];

    if (!billing.app) {
        return;
    }

    // Update app with ownership
    billing.app.ownerType = "organization";
    billing.app.ownerId = organization.id;
    billing.writeBackClaimed = true;

    // Bind organization
    billing.organization = organization;
}
