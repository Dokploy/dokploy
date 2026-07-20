import { redactApplicationGitSecrets } from "@dokploy/server/services/application";
import { describe, expect, it } from "vitest";

describe("redactApplicationGitSecrets (application.one secret disclosure guard)", () => {
	it("blanks github secrets while keeping non-secret fields", () => {
		const app = {
			applicationId: "app-1",
			github: {
				githubId: "gh-1",
				githubClientId: "public-client-id",
				githubClientSecret: "SECRET",
				githubPrivateKey: "-----BEGIN KEY-----",
				githubWebhookSecret: "whsec",
				githubInstallationId: "12345",
			},
		};

		const out = redactApplicationGitSecrets(app);

		expect(out.github.githubClientSecret).toBe("");
		expect(out.github.githubPrivateKey).toBe("");
		expect(out.github.githubWebhookSecret).toBe("");
		// Non-secret identifiers must survive so the UI can still show the link.
		expect(out.github.githubClientId).toBe("public-client-id");
		expect(out.github.githubInstallationId).toBe("12345");
		expect(out.applicationId).toBe("app-1");
	});

	it("blanks gitlab / gitea / bitbucket tokens and passwords", () => {
		const app = {
			gitlab: { secret: "s", accessToken: "at", refreshToken: "rt" },
			gitea: { clientSecret: "cs", accessToken: "at", refreshToken: "rt" },
			bitbucket: { appPassword: "pw", apiToken: "tok" },
		};

		const out = redactApplicationGitSecrets(app);

		expect(out.gitlab).toMatchObject({
			secret: "",
			accessToken: "",
			refreshToken: "",
		});
		expect(out.gitea).toMatchObject({
			clientSecret: "",
			accessToken: "",
			refreshToken: "",
		});
		expect(out.bitbucket).toMatchObject({ appPassword: "", apiToken: "" });
	});

	it("does not mutate the original application", () => {
		const app = { github: { githubClientSecret: "SECRET" } };
		redactApplicationGitSecrets(app);
		expect(app.github.githubClientSecret).toBe("SECRET");
	});

	it("handles applications without any git provider relation", () => {
		const app: {
			applicationId: string;
			github?: null;
			gitlab?: null;
			gitea?: null;
			bitbucket?: null;
		} = { applicationId: "app-2", github: null };
		expect(redactApplicationGitSecrets(app)).toMatchObject({
			applicationId: "app-2",
			github: null,
		});
	});
});
