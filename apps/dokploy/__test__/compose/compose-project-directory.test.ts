import { createCommand } from "@dokploy/server/utils/builders/compose";
import { describe, expect, it } from "vitest";

const base = {
	composeType: "docker-compose" as const,
	appName: "compose-app",
	sourceType: "github" as const,
	command: "",
};

describe("compose createCommand --project-directory", () => {
	it("pins --project-directory to the code dir when composePath is nested", () => {
		const cmd = createCommand(
			{ ...base, composePath: "./deploy/docker-compose.yml" } as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).toContain(
			"--project-directory /etc/dokploy/compose/compose-app/code",
		);
		expect(cmd).toContain("-f ./deploy/docker-compose.yml");
	});

	it("omits --project-directory when no projectPath is passed", () => {
		const cmd = createCommand({
			...base,
			composePath: "./deploy/docker-compose.yml",
		} as any);

		expect(cmd).not.toContain("--project-directory");
	});

	it("does not add --project-directory to stack deploy (unsupported flag)", () => {
		const cmd = createCommand(
			{
				...base,
				composeType: "stack",
				composePath: "./deploy/docker-compose.yml",
			} as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).not.toContain("--project-directory");
		expect(cmd.startsWith("stack deploy")).toBe(true);
	});

	it("keeps raw sourceType resolving from the code dir (root docker-compose.yml)", () => {
		const cmd = createCommand(
			{ ...base, sourceType: "raw", composePath: "docker-compose.yml" } as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).toContain(
			"--project-directory /etc/dokploy/compose/compose-app/code",
		);
		expect(cmd).toContain("-f docker-compose.yml");
	});

	it("resolves build.context against the compose file's own directory when there are no mounts", () => {
		const cmd = createCommand({
			...base,
			composePath: "./backend/docker-compose.yml",
		} as any);

		expect(cmd).not.toContain("--project-directory");
		expect(cmd).toContain("-f ./backend/docker-compose.yml");
	});
});

describe("compose createCommand --env-file", () => {
	it("points --env-file at the generated .env next to a nested compose file", () => {
		const cmd = createCommand(
			{
				...base,
				composePath: "./deploy/docker-compose.yml",
				createEnvFile: true,
			} as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).toContain("--env-file deploy/.env");
		expect(cmd).toContain(
			"--project-directory /etc/dokploy/compose/compose-app/code",
		);
	});

	it("omits --env-file when createEnvFile is disabled", () => {
		const cmd = createCommand(
			{ ...base, composePath: "./deploy/docker-compose.yml" } as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).not.toContain("--env-file");
	});

	it("uses the code-root .env for raw sourceType", () => {
		const cmd = createCommand(
			{
				...base,
				sourceType: "raw",
				composePath: "docker-compose.yml",
				createEnvFile: true,
			} as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).toContain("--env-file .env");
	});

	it("does not add --env-file to stack deploy (unsupported flag)", () => {
		const cmd = createCommand(
			{
				...base,
				composeType: "stack",
				composePath: "./deploy/docker-compose.yml",
				createEnvFile: true,
			} as any,
			"/etc/dokploy/compose/compose-app/code",
		);

		expect(cmd).not.toContain("--env-file");
	});
});
