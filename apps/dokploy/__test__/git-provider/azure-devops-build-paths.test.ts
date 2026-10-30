import { dirname, join } from "node:path";
import { azureDevopsRepositoryPath } from "@dokploy/server/db/schema";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { getHerokuCommand } from "@dokploy/server/utils/builders/heroku";
import { getNixpacksCommand } from "@dokploy/server/utils/builders/nixpacks";
import { getPaketoCommand } from "@dokploy/server/utils/builders/paketo";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { createEnvFileCommand } from "@dokploy/server/utils/builders/utils";
import { getBuildAppDirectory } from "@dokploy/server/utils/filesystem/directory";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";

const application = (buildType: string) =>
	({
		sourceType: "azureDevops",
		appName: "azure-build",
		buildType,
		azureDevopsBuildPath: "nested spaces $(AZURE_INJECTION_SENTINEL) 'quoted'",
		env: "",
		buildArgs: "",
		buildSecrets: "",
		createEnvFile: true,
		cleanCache: false,
		dockerfile: "Dockerfile",
		herokuVersion: "24",
		railpackVersion: "0.15.1",
		environment: { env: "", project: { env: "" } },
	}) as unknown as ApplicationNested;

describe("Azure DevOps build paths", () => {
	it.each([
		["dockerfile", getDockerCommand],
		["nixpacks", getNixpacksCommand],
		["heroku_buildpacks", getHerokuCommand],
		["paketo_buildpacks", getPaketoCommand],
		["railpack", getRailpackCommand],
	] as const)(
		"keeps paths with spaces and shell characters as one argument for %s",
		(type, build) => {
			const app = application(type);
			const args = parse(
				build(app)
					.split("\n")
					.filter((line) => !line.trim().startsWith("#"))
					.join("\n"),
			);
			expect(args).toContain(getBuildAppDirectory(app));
			expect(args).not.toContain("AZURE_INJECTION_SENTINEL");
		},
	);
	it("quotes the environment file destination without expanding repository path characters", () => {
		const file = getBuildAppDirectory(application("dockerfile"));
		const args = parse(createEnvFileCommand(file, "VALUE=literal"));
		expect(args).toContain(join(dirname(file), ".env"));
		expect(args).not.toContain("AZURE_INJECTION_SENTINEL");
	});
	it.each([
		"../outside",
		"nested/../../outside",
		"nested\\..\\outside",
		"bad\npath",
	])("rejects paths escaping the repository: %s", (path) =>
		expect(azureDevopsRepositoryPath.safeParse(path).success).toBe(false),
	);
});
