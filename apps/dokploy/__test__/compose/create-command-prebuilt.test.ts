import { createCommand } from "@dokploy/server/utils/builders/compose";
import { describe, expect, it } from "vitest";

const base = {
	composeType: "docker-compose" as const,
	appName: "my-app",
	sourceType: "raw" as const,
	command: "",
	composePath: "docker-compose.yml",
	buildServerId: null,
} as unknown as Parameters<typeof createCommand>[0];

describe("createCommand prebuilt remote build", () => {
	it("uses --build when not prebuilt", () => {
		const command = createCommand(base, { prebuilt: false });
		expect(command).toContain("up -d --build --remove-orphans");
		expect(command).not.toContain("--no-build");
	});

	it("uses pull and --no-build when prebuilt", () => {
		const command = createCommand(base, { prebuilt: true });
		// First segment is prefixed with `docker ` at exec time; chained segment
		// must already include `docker compose` or it runs as bare `compose`.
		expect(command).toMatch(
			/^compose -p .+ pull && docker compose -p .+ up -d --no-build --remove-orphans$/,
		);
		expect(command).not.toContain("--build");
	});

	it("keeps stack deploy with registry auth when prebuilt", () => {
		const command = createCommand(
			{ ...base, composeType: "stack" },
			{ prebuilt: true },
		);
		expect(command).toContain("stack deploy");
		expect(command).toContain("--with-registry-auth");
	});
});
