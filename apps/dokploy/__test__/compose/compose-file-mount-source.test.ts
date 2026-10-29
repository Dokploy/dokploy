import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	getComposeFileMountExample,
	getComposeFileMountSource,
} from "@/lib/compose-file-mount";

describe("getComposeFileMountSource", () => {
	it("resolves from the code dir for docker-compose", () => {
		expect(
			getComposeFileMountSource({
				composeType: "docker-compose",
				composePath: "./docker-compose.yml",
				sourceType: "github",
				fileName: "Caddyfile",
			}),
		).toBe("../files/Caddyfile");
	});

	it("ignores nested compose paths for docker-compose (project directory is pinned)", () => {
		expect(
			getComposeFileMountSource({
				composeType: "docker-compose",
				composePath: "./deploy/prod/docker-compose.yml",
				sourceType: "github",
				fileName: "Caddyfile",
			}),
		).toBe("../files/Caddyfile");
	});

	it("resolves from the compose file folder for stack", () => {
		expect(
			getComposeFileMountSource({
				composeType: "stack",
				composePath: "./deploy/prod/docker-compose.yml",
				sourceType: "git",
				fileName: "Caddyfile",
			}),
		).toBe("../../../files/Caddyfile");
	});

	it("uses the root compose file for raw stack", () => {
		expect(
			getComposeFileMountSource({
				composeType: "stack",
				composePath: "./deploy/docker-compose.yml",
				sourceType: "raw",
				fileName: "Caddyfile",
			}),
		).toBe("../files/Caddyfile");
	});

	it("keeps nested file names and strips leading ./ or /", () => {
		expect(
			getComposeFileMountSource({
				composeType: "docker-compose",
				composePath: "./docker-compose.yml",
				sourceType: "github",
				fileName: "./config/app.conf",
			}),
		).toBe("../files/config/app.conf");
		expect(
			getComposeFileMountSource({
				composeType: "docker-compose",
				composePath: "./docker-compose.yml",
				sourceType: "github",
				fileName: "/nginx.conf",
			}),
		).toBe("../files/nginx.conf");
	});
});

describe("getComposeFileMountExample", () => {
	it.each([
		"../files/Caddyfile",
		"../files/prod:config",
		"../files/app #1.conf",
		'../files/say "hi".txt',
	])("keeps %s intact as the bind source", (source) => {
		expect(parse(getComposeFileMountExample(source))).toEqual({
			volumes: [{ type: "bind", source, target: "/path/in/container" }],
		});
	});
});
