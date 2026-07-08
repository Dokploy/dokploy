import { getHerokuCommand } from "@dokploy/server/utils/builders/heroku";
import { getPaketoCommand } from "@dokploy/server/utils/builders/paketo";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { describe, expect, it } from "vitest";

const baseApplication = {
	appName: "my-app",
	buildPath: "apps/site dir",
	buildServerId: null,
	cleanCache: false,
	env: "SAFE=va lue",
	environment: { project: { env: "" }, env: "" },
	herokuVersion: "24",
	railpackVersion: "0.7.0",
	serverId: null,
	sourceType: "github",
} as unknown as Parameters<typeof getHerokuCommand>[0];

describe("buildpack command boundary", () => {
	it("quotes Heroku and Paketo pack build arguments", () => {
		const herokuCommand = getHerokuCommand(baseApplication);
		const paketoCommand = getPaketoCommand(baseApplication);

		expect(herokuCommand).toMatch(
			/pack build my-app --path '[^']*apps\/site dir' --builder heroku\/builder\\:24 --env 'SAFE=va lue'/,
		);
		expect(paketoCommand).toMatch(
			/pack build my-app --path '[^']*apps\/site dir' --builder paketobuildpacks\/builder-jammy-full --env 'SAFE=va lue'/,
		);
		expect(herokuCommand).not.toContain("--path /");
		expect(paketoCommand).not.toContain("--path /");
	});

	it("quotes Railpack prepare and buildx arguments", () => {
		const command = getRailpackCommand(baseApplication);

		expect(command).toMatch(
			/railpack prepare '[^']*apps\/site dir' --plan-out '[^']*apps\/site dir\/railpack-plan\.json'/,
		);
		expect(command).toMatch(
			/docker buildx build --builder railpack-my-app-[a-zA-Z0-9_-]+/,
		);
		expect(command).toMatch(/-f '[^']*apps\/site dir\/railpack-plan\.json'/);
		expect(command).toContain("--secret id\\=SAFE\\,env\\=SAFE");
		expect(command).not.toContain("railpack prepare /");
		expect(command).not.toContain("docker buildx build --builder railpack my");
	});

	it("does not fetch a remote Railpack installer during build command generation", () => {
		const command = getRailpackCommand(baseApplication);

		expect(command).toContain("command -v railpack");
		expect(command).not.toContain("railpack.com/install.sh");
		expect(command).not.toContain("curl -fsSL");
		expect(command).not.toContain('bash -c "$(');
	});

	it("rejects unsafe build paths before buildpack command generation", () => {
		expect(() =>
			getHerokuCommand({
				...baseApplication,
				buildPath: "apps/site; touch /tmp/pwn",
			}),
		).toThrow("Invalid file path");
		expect(() =>
			getPaketoCommand({
				...baseApplication,
				buildPath: "apps/site; touch /tmp/pwn",
			}),
		).toThrow("Invalid file path");
		expect(() =>
			getRailpackCommand({
				...baseApplication,
				buildPath: "apps/site; touch /tmp/pwn",
			}),
		).toThrow("Invalid file path");
	});
});
