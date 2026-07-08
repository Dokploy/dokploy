import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	REDACTED_SECRET_VALUE,
	redactBackupScheduleSecrets,
	redactDatabaseServiceSecrets,
	redactDeployableServiceSecrets,
	redactProjectNestedSecrets,
	redactRollbackFullContextSecrets,
	redactSecretFields,
	redactSensitiveText,
	secretUpdateValue,
} from "@dokploy/server/utils/security/redaction";
import { describe, expect, it } from "vitest";

describe("shared secret redaction helpers", () => {
	it("redacts nonempty secret fields while preserving empty values", () => {
		const redacted = redactSecretFields(
			{
				name: "prod",
				privateKey: "private-key",
				emptySecret: "",
				nullSecret: null,
			},
			["privateKey", "emptySecret", "nullSecret"],
		);

		expect(redacted.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.emptySecret).toBe("");
		expect(redacted.nullSecret).toBeNull();
		expect(redacted.name).toBe("prod");
	});

	it("treats redacted and blank update values as preserve-existing", () => {
		expect(secretUpdateValue(REDACTED_SECRET_VALUE)).toBeUndefined();
		expect(secretUpdateValue("")).toBeUndefined();
		expect(secretUpdateValue("   ")).toBeUndefined();
		expect(secretUpdateValue("new-secret")).toBe("new-secret");
	});

	it("redacts deployable service read secrets", () => {
		const redacted = redactDeployableServiceSecrets({
			env: "TOKEN=secret",
			refreshToken: "refresh-token",
			buildSecrets: "NPM_TOKEN=secret",
			password: "docker-password",
			security: {
				password: "basic-auth-password",
			},
			name: "app-one",
		});

		expect(redacted).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			refreshToken: REDACTED_SECRET_VALUE,
			buildSecrets: REDACTED_SECRET_VALUE,
			password: REDACTED_SECRET_VALUE,
			security: {
				password: REDACTED_SECRET_VALUE,
			},
			name: "app-one",
		});
	});

	it("redacts nested server secrets from deployable service reads", () => {
		const redacted = redactDeployableServiceSecrets({
			name: "app-one",
			server: {
				serverId: "server-1",
				command: "curl https://example.com/setup.sh | sh",
				metricsConfig: {
					server: {
						token: "monitoring-token",
						port: 4500,
					},
					containers: {
						refreshRate: 60,
					},
				},
				sshKey: {
					privateKey: "private-key",
					publicKey: "public-key",
				},
			},
			buildServer: {
				serverId: "server-2",
				command: "docker login --password build-secret",
				metricsConfig: {
					server: {
						token: "build-monitoring-token",
						port: 4501,
					},
				},
			},
		});

		expect(redacted.server).toMatchObject({
			command: REDACTED_SECRET_VALUE,
			metricsConfig: {
				server: {
					token: REDACTED_SECRET_VALUE,
					port: 4500,
				},
				containers: {
					refreshRate: 60,
				},
			},
			sshKey: {
				privateKey: REDACTED_SECRET_VALUE,
				publicKey: "public-key",
			},
		});
		expect(redacted.buildServer).toMatchObject({
			command: REDACTED_SECRET_VALUE,
			metricsConfig: {
				server: {
					token: REDACTED_SECRET_VALUE,
					port: 4501,
				},
			},
		});
	});

	it("redacts database service read credentials", () => {
		const redacted = redactDatabaseServiceSecrets({
			env: "PGSSLMODE=require",
			databaseUser: "dokploy",
			databasePassword: "secret",
			databaseRootPassword: "root-secret",
		});

		expect(redacted).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			databaseUser: "dokploy",
			databasePassword: REDACTED_SECRET_VALUE,
			databaseRootPassword: REDACTED_SECRET_VALUE,
		});
	});

	it("redacts nested server secrets from database service reads", () => {
		const redacted = redactDatabaseServiceSecrets({
			databaseName: "postgres",
			server: {
				serverId: "server-1",
				command: "curl https://example.com/setup.sh | sh",
				metricsConfig: {
					server: {
						token: "monitoring-token",
						port: 4500,
					},
				},
			},
		});

		expect(redacted).toMatchObject({
			databaseName: "postgres",
			server: {
				command: REDACTED_SECRET_VALUE,
				metricsConfig: {
					server: {
						token: REDACTED_SECRET_VALUE,
						port: 4500,
					},
				},
			},
		});
	});

	it("redacts backup metadata and related service credentials", () => {
		const redacted = redactBackupScheduleSecrets({
			name: "backup",
			metadata: {
				mariadb: { databasePassword: "mariadb-secret" },
				mysql: { databaseRootPassword: "mysql-root-secret" },
			},
			postgres: {
				env: "PGPASSWORD=postgres-secret",
				databasePassword: "postgres-secret",
			},
		});

		expect(redacted.metadata).toMatchObject({
			mariadb: { databasePassword: REDACTED_SECRET_VALUE },
			mysql: { databaseRootPassword: REDACTED_SECRET_VALUE },
		});
		expect(redacted.postgres).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			databasePassword: REDACTED_SECRET_VALUE,
		});
	});

	it("redacts nested project environment and service secrets", () => {
		const redacted = redactProjectNestedSecrets({
			name: "project",
			env: "PROJECT_TOKEN=secret",
			environments: [
				{
					env: "ENV_TOKEN=secret",
					applications: [{ env: "APP_TOKEN=secret" }],
					compose: [{ composeFile: "services:\n  api:", env: "TOKEN=secret" }],
					postgres: [{ databasePassword: "postgres-secret" }],
				},
			],
		});

		expect(redacted.env).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.environments?.[0]?.env).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.environments?.[0]?.applications?.[0]?.env).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(redacted.environments?.[0]?.compose?.[0]).toMatchObject({
			composeFile: REDACTED_SECRET_VALUE,
			env: REDACTED_SECRET_VALUE,
		});
		expect(redacted.environments?.[0]?.postgres?.[0]).toMatchObject({
			databasePassword: REDACTED_SECRET_VALUE,
		});
	});

	it("redacts rollback registry credentials", () => {
		const redacted = redactRollbackFullContextSecrets({
			registry: { password: "registry-secret" },
			buildRegistry: { password: "build-registry-secret" },
			rollbackRegistry: { password: "rollback-registry-secret" },
		});

		expect(redacted).toMatchObject({
			registry: { password: REDACTED_SECRET_VALUE },
			buildRegistry: { password: REDACTED_SECRET_VALUE },
			rollbackRegistry: { password: REDACTED_SECRET_VALUE },
		});
	});

	it("redacts secrets embedded in command and provider error text", () => {
		const message = [
			"Command failed: git clone https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz@github.com/org/repo.git",
			"rclone rcat --s3-access-key-id AKIA123 --s3-secret-access-key rcloneSecretValue :s3:bucket/path",
			"mongodump -d appdb -u root -p mongo-secret-value --archive",
			"mongodump -d appdb -u root -p 'mongo'\\''quoted-secret' --archive",
			'{"apiKey":"json-api-key","password":"json-password"}',
			"secret: yaml-secret",
			"DATABASE_URL=postgres://dokploy:postgres-password@postgres:5432/dokploy",
			"Authorization: Bearer bearer-token-123",
		].join("\n");

		const redacted = redactSensitiveText(message);

		expect(redacted).toContain(REDACTED_SECRET_VALUE);
		expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
		expect(redacted).not.toContain("rcloneSecretValue");
		expect(redacted).not.toContain("mongo-secret-value");
		expect(redacted).not.toContain("quoted-secret");
		expect(redacted).not.toContain("json-api-key");
		expect(redacted).not.toContain("json-password");
		expect(redacted).not.toContain("yaml-secret");
		expect(redacted).not.toContain("postgres-password");
		expect(redacted).not.toContain("bearer-token-123");
	});

	it("redacts standalone mongo password arguments with adjacent quoted fragments", () => {
		const messages = [
			"mongodump -d appdb -u root -p mongo-secret-value --archive",
			"mongodump -d appdb -u root -p 'mongo'''quoted-secret' --archive",
			String.raw`mongodump -d appdb -u root -p 'mongo'\''raw-quoted-secret' --archive`,
		];

		for (const message of messages) {
			const redacted = redactSensitiveText(message);

			expect(redacted).not.toContain("mongo-secret-value");
			expect(redacted).not.toContain("quoted-secret");
			expect(redacted).not.toContain("raw-quoted-secret");
		}
	});

	it("stores only redacted command output on ExecError", () => {
		const error = new ExecError(
			"Command failed: npm run build TOKEN=build-secret",
			{
				command:
					"git clone https://oauth2:gitlab-token@example.com/group/repo.git && rclone rcat --s3-secret-access-key rcloneSecretValue :s3:bucket/path",
				stdout: "NPM_TOKEN=npm-secret",
				stderr: "postgres://dokploy:database-secret@postgres:5432/dokploy",
				exitCode: 1,
				originalError: Object.assign(
					new Error("raw original error with original-secret"),
					{
						command: "TOKEN=original-secret",
					},
				),
			},
		);

		const detailedMessage = error.getDetailedMessage();
		const enumerableError = JSON.stringify({ ...error });

		expect(error.message).not.toContain("build-secret");
		expect(error.command).not.toContain("gitlab-token");
		expect(error.command).not.toContain("rcloneSecretValue");
		expect(error.stdout).not.toContain("npm-secret");
		expect(error.stderr).not.toContain("database-secret");
		expect(detailedMessage).not.toContain("gitlab-token");
		expect(detailedMessage).not.toContain("database-secret");
		expect(detailedMessage).toContain(REDACTED_SECRET_VALUE);
		expect(enumerableError).not.toContain("original-secret");
	});
});
