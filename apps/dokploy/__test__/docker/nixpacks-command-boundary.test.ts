import { getNixpacksCommand } from "@dokploy/server/utils/builders/nixpacks";
import { getStaticCommand } from "@dokploy/server/utils/builders/static";
import { describe, expect, it } from "vitest";

const baseApplication = {
	appName: "my-app",
	buildPath: "",
	buildServerId: null,
	buildType: "nixpacks",
	cleanCache: false,
	createEnvFile: false,
	env: "",
	environment: { project: { env: "" }, env: "" },
	publishDirectory: "",
	serverId: null,
} as unknown as Parameters<typeof getNixpacksCommand>[0];

describe("nixpacks and static command boundary", () => {
	it("rejects unsafe publish directories before command generation", () => {
		expect(() =>
			getNixpacksCommand({
				...baseApplication,
				publishDirectory: "dist; touch /tmp/pwn",
			}),
		).toThrow("Invalid file path");

		expect(() =>
			getStaticCommand({
				...baseApplication,
				publishDirectory: "dist\nRUN touch /tmp/pwn",
			}),
		).toThrow("Invalid file path");
	});

	it("quotes nixpacks build and artifact copy arguments", () => {
		const command = getNixpacksCommand({
			...baseApplication,
			appName: "my-app",
			publishDirectory: "dist app",
		});

		expect(command).toContain("nixpacks build");
		expect(command).toContain("--no-error-without-start");
		expect(command).toMatch(
			/docker create --name my-app-[a-zA-Z0-9_-]+ my-app/,
		);
		expect(command).toMatch(
			/docker cp 'my-app-[^']+:\/app\/dist app\/\.' '[^']*\/dist app'/,
		);
		expect(command).not.toContain("docker cp my-app");
		expect(command).not.toContain("dist app/. /");
	});
});
