import {
	buildInspectMountsCommand,
	buildListComposeContainerIdsCommand,
	parseComposeMountsOutput,
} from "@dokploy/server/utils/migration/compose-mounts";
import { describe, expect, it } from "vitest";

describe("compose mount discovery command builders", () => {
	it("filters by the compose project label for docker-compose projects", () => {
		expect(
			buildListComposeContainerIdsCommand("my-app", "docker-compose"),
		).toBe(
			"docker ps -a --filter label\\=com.docker.compose.project\\=my-app --format '{{.ID}}'",
		);
	});

	it("filters by the stack namespace label for swarm stacks", () => {
		expect(buildListComposeContainerIdsCommand("my-app", "stack")).toBe(
			"docker ps -a --filter label\\=com.docker.stack.namespace\\=my-app --format '{{.ID}}'",
		);
	});

	it("builds an inspect command listing every container id", () => {
		expect(buildInspectMountsCommand(["abc123", "def456"])).toBe(
			"docker inspect abc123 def456 --format '{{json .Mounts}}'",
		);
	});
});

describe("parseComposeMountsOutput", () => {
	it("collects unique named volumes and bind mounts across containers", () => {
		const output = [
			JSON.stringify([
				{ Type: "volume", Name: "my-app_data", Destination: "/data" },
				{
					Type: "bind",
					Source: "/etc/dokploy/compose/my-app/config.yml",
					Destination: "/config.yml",
				},
			]),
			JSON.stringify([
				// Same volume mounted by a second container - should be deduped.
				{ Type: "volume", Name: "my-app_data", Destination: "/data" },
				{ Type: "tmpfs", Destination: "/tmp" },
			]),
		].join("\n");

		const result = parseComposeMountsOutput(output);
		expect(result.volumes).toEqual([{ name: "my-app_data" }]);
		expect(result.binds).toEqual([
			{
				source: "/etc/dokploy/compose/my-app/config.yml",
				destination: "/config.yml",
			},
		]);
	});

	it("ignores blank lines and lines that aren't valid JSON arrays", () => {
		const output = [
			"",
			"not json",
			JSON.stringify({ Type: "volume" }),
			"",
		].join("\n");
		const result = parseComposeMountsOutput(output);
		expect(result.volumes).toEqual([]);
		expect(result.binds).toEqual([]);
	});

	it("returns empty arrays for empty input", () => {
		const result = parseComposeMountsOutput("");
		expect(result.volumes).toEqual([]);
		expect(result.binds).toEqual([]);
	});
});
