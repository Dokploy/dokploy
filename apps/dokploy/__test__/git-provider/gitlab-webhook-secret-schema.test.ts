import { redactGitlabProvider } from "@dokploy/server";
import { gitlab } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("GitLab provider webhook secret storage", () => {
	it("exposes a real database column for deploy webhook authentication", () => {
		expect(Object.keys(gitlab)).toContain("webhookSecret");
		expect(gitlab.webhookSecret.name).toBe("webhook_secret");
	});

	it("redacts the deploy webhook secret from provider responses", () => {
		const redacted = redactGitlabProvider({
			accessToken: "access-token",
			groupName: "platform",
			refreshToken: "refresh-token",
			secret: "oauth-secret",
			webhookSecret: "deploy-webhook-secret",
		});

		expect(redacted).toEqual({
			groupName: "platform",
		});
	});
});
