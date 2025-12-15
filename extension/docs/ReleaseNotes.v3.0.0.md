# Release Notes for AL Object ID Ninja version 3.0.0

Welcome to AL Object ID Ninja version 3.0.0!

## ⚠️ Important: Ninja Has Moved to a Commercial SaaS Platform

**There is no more free public Ninja backend.** AL Object ID Ninja has transitioned from a free public service to a commercial Software-as-a-Service (SaaS) platform. All users need to make a choice about how they want to use Ninja going forward.

### Migration Period

**Until January 1, 2026, the SaaS service is not billed and is free of charge.** This grace period allows organizations to migrate either to self-hosted deployment or to set up their subscription for the SaaS platform without any immediate cost. Use this time to evaluate your options and make the transition that works best for your team.

### Your Options

You have two paths forward:

#### Option 1: "Free" (Self-Hosted)

You can continue using Ninja at no subscription cost by deploying and maintaining your own backend infrastructure:

-   **Deploy your own backend**: You need to set up and deploy the Ninja backend Azure Functions to your own Azure subscription
-   **Pay for your own Azure infrastructure**: All Azure costs (storage, compute, etc.) are your responsibility
-   **Maintain it yourself**: You are responsible for:
    -   Upgrading to new versions of the backend
    -   Configuring all clients to point to your backend
    -   Ensuring all team members are synchronized and using the correct configuration
    -   Managing security, backups, and all operational aspects

This option gives you full control but requires significant technical expertise and ongoing maintenance effort.

#### Option 2: Hassle-Free (Public Endpoints)

Stay on the public endpoints and let us handle all the infrastructure, maintenance, and upgrades:

-   **Free Personal Subscription**: Available for individual developers (even for commercial projects)
-   **Paid Subscription**: For teams and organizations who want the convenience of managed infrastructure

With this option, you simply use Ninja—we handle everything else. No deployment, no maintenance, no infrastructure management, no configuration, and most importantly - no change in your end-user experience.

To learn more about subscription options and pricing, visit the [Ninja pricing page](https://alid.ninja/#pricing).

---

## What's new?

This is a major version release that introduces significant improvements to the back-end API, activity logging capabilities, and AL code parsing. These are the new features and changes in AL Object ID Ninja v3.0.0:

-   Migration to v3 API endpoints
-   Activity logging and usage tracking
-   Improved AL parser performance and reliability
-   Improved back-end performance and reliability

## Migration to v3 API Endpoints

AL Object ID Ninja has been upgraded to use the new v3 API endpoints. The v3 endpoints are simplified and follow a more natural REST design, making them more accurate in terms of what they do. The new endpoints collect a bit more information about apps and users, which helps drive detailed usage statistics in the web management portal.

All existing functionality remains the same from a user perspective. However, this migration lays the groundwork for future significant improvements in user experience, both for administrators using the web portal and for end users using Visual Studio Code.

## Activity Logging and Usage Tracking

Version 3.0.0 introduces a new activity logging system that tracks feature usage for organization accounts. This system is designed to help organizations and administrators make better informed decisions about the size of their subscription and to give them statistics and insights into how their organization and team uses Ninja and handles object ID assignment.

-   **Usage statistics and insights**: The web management portal provides detailed statistics about how your team uses Ninja, helping you understand usage patterns and make data-driven decisions about your subscription needs.
-   **Privacy-focused**: Activity logging only applies to organization accounts. Personal apps, sponsored apps, and apps in grace periods are not tracked. No sensitive code or object data is ever logged—only feature identifiers and timestamps.
-   **Non-intrusive**: Activity logging happens in the background and does not impact performance or your development workflow. All logging is done asynchronously and will not block any operations.
-   **Your data, your control**: The activity logs are stored securely and are only accessible to your organization's administrators. This information is never used for AI training or any other purposes—it exists solely to help you manage and optimize your team's use of Ninja.

## Improved AL Parser Performance and Reliability

Version 3.0.0 includes a new, much faster and more reliable AL parser that is more resilient to edge cases with AL syntax. The parser now handles unusual or "funky" AL syntax more gracefully, reducing parsing errors and improving the overall reliability of object ID detection and synchronization.

## Improved Back-End Performance and Reliability

The v3 API endpoints have been rebuilt with deeper test coverage, making it easier to catch bugs and ensure reliability across all operations.

## Compatibility

-   **Backward compatibility**: The v2 API endpoints remain available for an additional three months for older extension versions. New installations will use v3 endpoints.
-   **No configuration changes required**: Existing configurations and authorization keys continue to work without any changes.
-   **Workspace compatibility**: All existing workspaces and `.objidconfig` files remain fully compatible.
-   **Subscription required for public endpoints**: To continue using the public Ninja endpoints, you'll need to choose a subscription plan (free personal or paid). If you prefer to self-host, you can configure your extension to point to your own backend deployment.

## Upgrade Notes

When upgrading from version 2.x to 3.0.0:

-   No action is required on your part—the upgrade is automatic
-   Your existing authorization keys and configurations will continue to work
-   All your object ID assignments and consumption data remain intact
-   The extension will automatically start using the v3 API endpoints

If you encounter any issues after upgrading, please report them on the [GitHub issues page](https://github.com/vjekob/al-objid/issues).
