import {
	preserveSecretPlaceholderFields,
	REDACTED_SECRET_VALUE,
	redactDatabaseServiceSecrets,
	redactDeployableServiceSecrets,
	redactSecretFields,
} from "@dokploy/server/utils/security/redaction";
import { describe, expect, it } from "vitest";

describe("env secret redaction helpers", () => {
	it("preserves stored values when an update contains redacted placeholders", () => {
		const next = preserveSecretPlaceholderFields(
			{
				env: REDACTED_SECRET_VALUE,
				buildArgs: "[REDACTED]",
				buildSecrets: "NPM_TOKEN=new",
				name: "api",
			},
			{
				env: "TOKEN=old",
				buildArgs: "ARG_TOKEN=old",
				buildSecrets: "NPM_TOKEN=old",
				name: "old-api",
			},
			["env", "buildArgs", "buildSecrets"],
		);

		expect(next).toEqual({
			env: "TOKEN=old",
			buildArgs: "ARG_TOKEN=old",
			buildSecrets: "NPM_TOKEN=new",
			name: "api",
		});
	});

	it("redacts deployable service environment fields on normal reads", () => {
		const redacted = redactDeployableServiceSecrets({
			env: "TOKEN=secret",
			previewEnv: "TOKEN=preview-secret",
			buildArgs: "NPM_TOKEN=secret",
			buildSecrets: "NPM_TOKEN=secret",
			password: "registry-password",
			name: "api",
		});

		expect(redacted).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			previewEnv: REDACTED_SECRET_VALUE,
			buildArgs: REDACTED_SECRET_VALUE,
			buildSecrets: REDACTED_SECRET_VALUE,
			password: REDACTED_SECRET_VALUE,
			name: "api",
		});
	});

	it("redacts database env and password fields on normal reads", () => {
		const redacted = redactDatabaseServiceSecrets({
			env: "PGSSLMODE=require",
			databasePassword: "database-password",
			databaseRootPassword: "root-password",
			appName: "postgres",
		});

		expect(redacted).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			databasePassword: REDACTED_SECRET_VALUE,
			databaseRootPassword: REDACTED_SECRET_VALUE,
			appName: "postgres",
		});
	});

	it("can redact compose file content with the generic field helper", () => {
		const redacted = redactSecretFields(
			{
				composeFile: "services:\n  api:\n    environment:\n      TOKEN: secret",
				env: "TOKEN=secret",
				name: "stack",
			},
			["composeFile", "env"],
		);

		expect(redacted).toEqual({
			composeFile: REDACTED_SECRET_VALUE,
			env: REDACTED_SECRET_VALUE,
			name: "stack",
		});
	});
});
