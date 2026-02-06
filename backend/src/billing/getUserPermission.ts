/**
 * User Permission Check
 *
 * Pure function to determine a user's permission status within an organization.
 * This is the single-source-of-truth for user permission logic.
 */

import { OrganizationInfo, UserPermissionResult } from "./types";

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
 * Check user permission against an organization.
 *
 * Returns:
 * - true: User is explicitly allowed (in users array)
 * - false: User is explicitly denied (in deniedUsers array)
 * - "ALLOWED": User is implicitly allowed via approved domain
 * - "ALLOWED_PENDING": User is implicitly allowed via pending domain
 * - "DENY": User should be denied due to denyUnknownDomains setting
 * - undefined: User is unknown (neither allowed nor denied)
 *
 * @param organization - The organization to check against
 * @param gitEmail - The git email to check
 */
export function getUserPermission(
    organization: OrganizationInfo,
    gitEmail: string
): UserPermissionResult {
    const emailNorm = normalize(gitEmail);

    if (!emailNorm) {
        return undefined;
    }

    // Check explicit allow list
    const users = organization.users ?? [];
    if (users.some(u => normalize(u) === emailNorm)) {
        return true;
    }

    // Check explicit deny list
    const deniedUsers = organization.deniedUsers ?? [];
    if (deniedUsers.some(u => normalize(u) === emailNorm)) {
        return false;
    }

    // Check approved domains
    const domain = getDomain(gitEmail);
    const domains = organization.domains ?? [];
    if (domains.some(d => normalize(d) === domain)) {
        return "ALLOWED";
    }

    // Check pending domains
    const pendingDomains = organization.pendingDomains ?? [];
    if (pendingDomains.some(d => normalize(d) === domain)) {
        return "ALLOWED_PENDING";
    }

    // Check denyUnknownDomains flag
    if (organization.denyUnknownDomains) {
        return "DENY";
    }

    // User is unknown
    return undefined;
}
