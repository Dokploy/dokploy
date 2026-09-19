import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Compose } from "@dokploy/server/services/compose";
import { loadDockerCompose } from "@dokploy/server/utils/docker/domain";
import { afterEach, describe, expect, it } from "vitest";

// loadDockerCompose merges the primary compose file with every additional
// file (composePathAdditional) using the real `docker compose ... config`
// engine (see utils/docker/domain.ts), instead of a hand-rolled JS
// approximation that cannot replicate Compose's deep-merge/root-declaration
// semantics. These tests exercise it against real files on disk so a
// regression in that merge shows up here instead of only in production.
const composeRoot = join(process.cwd(), ".docker", "compose");
const createdAppNames: string[] = [];

afterEach(() => {
	for (const appName of createdAppNames.splice(0)) {
		rmSync(join(composeRoot, appName), { recursive: true, force: true });
	}
});

const writeComposeFixture = (files: Record<string, string>) => {
	const appName = `test-merge-${randomUUID()}`;
	createdAppNames.push(appName);
	const codeDir = join(composeRoot, appName, "code");
	mkdirSync(codeDir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(join(codeDir, name), content, "utf8");
	}
	return appName;
};

const composeFixture = (
	appName: string,
	composePathAdditional: string[] = [],
): Compose =>
	({
		appName,
		composeType: "docker-compose",
		composePath: "docker-compose.yml",
		composePathAdditional,
		sourceType: "git",
		serverId: null,
	}) as unknown as Compose;

describe("loadDockerCompose additional file merge", () => {
	it("adds a service that only exists in an additional file", async () => {
		const appName = writeComposeFixture({
			"docker-compose.yml": "services:\n  web:\n    image: nginx\n",
			"override.yml": "services:\n  worker:\n    image: redis\n",
		});

		const merged = await loadDockerCompose(
			composeFixture(appName, ["override.yml"]),
		);

		expect(Object.keys(merged?.services ?? {}).sort()).toEqual([
			"web",
			"worker",
		]);
	});

	it("deep-merges nested keys instead of replacing them", async () => {
		const appName = writeComposeFixture({
			"docker-compose.yml":
				"services:\n  web:\n    image: nginx\n    environment:\n      DATABASE_URL: postgres://base\n      LOG_LEVEL: info\n",
			"override.yml":
				"services:\n  web:\n    environment:\n      LOG_LEVEL: debug\n",
		});

		const merged = await loadDockerCompose(
			composeFixture(appName, ["override.yml"]),
		);

		const env = (merged?.services?.web?.environment ?? []) as string[];
		expect([...env].sort()).toEqual(
			["DATABASE_URL=postgres://base", "LOG_LEVEL=debug"].sort(),
		);
	});

	it("keeps root-level declarations that only exist in an additional file", async () => {
		const appName = writeComposeFixture({
			"docker-compose.yml": "services:\n  web:\n    image: nginx\n",
			"override.yml":
				"services:\n  worker:\n    image: redis\n    volumes:\n      - data:/var/lib/data\nvolumes:\n  data: {}\n",
		});

		const merged = await loadDockerCompose(
			composeFixture(appName, ["override.yml"]),
		);

		expect(merged?.volumes).toHaveProperty("data");
	});

	it("skips an additional file that has not been pushed yet", async () => {
		const appName = writeComposeFixture({
			"docker-compose.yml": "services:\n  web:\n    image: nginx\n",
		});

		const merged = await loadDockerCompose(
			composeFixture(appName, ["not-there-yet.yml"]),
		);

		expect(Object.keys(merged?.services ?? {})).toEqual(["web"]);
	});

	it("returns null when the primary compose file does not exist", async () => {
		const appName = writeComposeFixture({});

		const merged = await loadDockerCompose(composeFixture(appName));

		expect(merged).toBeNull();
	});

	it("returns the primary spec untouched when there are no additional files", async () => {
		const appName = writeComposeFixture({
			"docker-compose.yml": "services:\n  web:\n    image: nginx\n",
		});

		const merged = await loadDockerCompose(composeFixture(appName));

		expect(Object.keys(merged?.services ?? {})).toEqual(["web"]);
	});
});
