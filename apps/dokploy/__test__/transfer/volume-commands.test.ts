import {
	parseVolumeMetadata,
	volumeCreateCommand,
	volumeImportCommand,
} from "@dokploy/server/services/transfer";
import { describe, expect, it } from "vitest";

const inspected = JSON.stringify({
	Driver: "local",
	Labels: {
		"com.docker.compose.project": "app-abc123",
		"com.docker.compose.volume": "storage_test",
	},
	Name: "app-abc123_storage_test",
	Options: { type: "none", o: "bind", device: "/etc/dokploy/a b" },
});

describe("transfer volume commands", () => {
	it("parses driver, labels and options from docker volume inspect", () => {
		expect(parseVolumeMetadata(`${inspected}\n`)).toEqual({
			driver: "local",
			labels: {
				"com.docker.compose.project": "app-abc123",
				"com.docker.compose.volume": "storage_test",
			},
			options: { type: "none", o: "bind", device: "/etc/dokploy/a b" },
		});
	});

	it("handles null labels/options and invalid output", () => {
		expect(
			parseVolumeMetadata('{"Driver":"local","Labels":null,"Options":null}'),
		).toEqual({ driver: "local", labels: null, options: null });
		expect(parseVolumeMetadata("not json")).toEqual({});
	});

	it("recreates the volume with the same driver, options and labels", () => {
		const command = volumeCreateCommand(
			"app-abc123_storage_test",
			parseVolumeMetadata(inspected),
		).replaceAll(String.fromCharCode(92), "");
		expect(command).toContain("docker volume create");
		expect(command).toContain("--driver local");
		expect(command).toContain("--opt type=none");
		expect(command).toContain("--opt o=bind");
		expect(command).toContain("--opt 'device=/etc/dokploy/a b'");
		expect(command).toContain("--label com.docker.compose.project=app-abc123");
		expect(command).toContain("--label com.docker.compose.volume=storage_test");
		expect(
			command.trimEnd().endsWith("app-abc123_storage_test >/dev/null"),
		).toBe(true);
	});

	it("creates a plain volume when there is no metadata", () => {
		expect(volumeCreateCommand("vol")).toBe(
			"docker volume create vol >/dev/null",
		);
	});

	it("import creates the volume only if missing, then extracts into it", () => {
		const command = volumeImportCommand("vol", parseVolumeMetadata(inspected));
		expect(command).toMatch(
			/^\(docker volume inspect vol >\/dev\/null 2>&1 \|\| docker volume create .* vol >\/dev\/null\) && docker run --rm -i -v vol:\/data alpine tar -xzf -/,
		);
	});
});
