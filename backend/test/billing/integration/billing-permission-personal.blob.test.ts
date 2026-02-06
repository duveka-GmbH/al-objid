/**
 * Billing Integration Tests - Permission Stage (Personal Apps)
 *
 * These tests verify permission checking for personal apps through handleRequest
 * using FakeAzureStorage. Personal app permission checks verify:
 * - User email matches owner's git email
 * - User email matches owner's primary email
 * - Case-insensitive email matching
 * - Proper rejection for non-matching emails
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupUsers,
    clearAllCaches,
    APP_PERSONAL,
    USER_PERSONAL,
} from "../fixtures/billing-test-fixtures";
import { UserProfileInfo } from "../../../src/billing/types";

describe("Billing - Permission Stage (Personal Apps)", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Email Matches Owner Git Email", () => {
        it("should grant permission when git email matches owner", async () => {
            // GIVEN: Personal app with user who has gitEmail
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: USER_PERSONAL.gitEmail,
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (permission granted)
            expect(response.status).toBe(200);
        });
    });

    describe("Email Matches User Primary Email", () => {
        it("should grant permission when primary email matches", async () => {
            // GIVEN: Personal app, request uses user's primary email
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: USER_PERSONAL.email, // Primary email, not git email
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (permission granted)
            expect(response.status).toBe(200);
        });
    });

    describe("Email Does Not Match", () => {
        it("should return 403 with USER_NOT_AUTHORIZED for non-matching email", async () => {
            // GIVEN: Personal app, request uses different email
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: "other@example.com", // Not owner's email
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with USER_NOT_AUTHORIZED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("USER_NOT_AUTHORIZED");
            expect(body.error.gitEmail).toBe("other@example.com");
        });
    });

    describe("No Git Email Provided", () => {
        it("should return 403 with GIT_EMAIL_REQUIRED when no email", async () => {
            // GIVEN: Personal app, no git email in request
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                // No gitEmail
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with GIT_EMAIL_REQUIRED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("GIT_EMAIL_REQUIRED");
        });
    });

    describe("Case-Insensitive Email Match", () => {
        it("should match emails case-insensitively", async () => {
            // GIVEN: Personal app, user has mixed-case email
            const userWithCasing: UserProfileInfo = {
                ...USER_PERSONAL,
                gitEmail: "Git@Example.COM",
            };
            setupApps([APP_PERSONAL]);
            setupUsers([userWithCasing]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: "git@example.com", // lowercase
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (case-insensitive match)
            expect(response.status).toBe(200);
        });
    });
});
