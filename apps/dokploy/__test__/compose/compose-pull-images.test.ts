import { createCommand } from "@dokploy/server/utils/builders/compose";
import { describe, expect, it } from "vitest";

const base = {
	composeType: "docker-compose" as const,
	appName: "compose-app",
	sourceType: "github" as const,
	composePath: "./docker-compose.yml",
	command: "",
};

describe("compose createCommand --pull always", () => {
	it("adds --pull always when pullImages is enabled", () => {
		const cmd = createCommand({ ...base, pullImages: true } as any);

		expect(cmd).toContain("up -d --build --remove-orphans --pull always");
	});

	it("omits --pull when pullImages is disabled", () => {
		const cmd = createCommand({ ...base, pullImages: false } as any);

		expect(cmd).not.toContain("--pull");
	});

	it("does not add --pull to stack deploy", () => {
		const cmd = createCommand({
			...base,
			composeType: "stack",
			pullImages: true,
		} as any);

		expect(cmd).not.toContain("--pull");
	});

	it("leaves a custom command untouched", () => {
		const cmd = createCommand({
			...base,
			command: "compose -p compose-app up -d",
			pullImages: true,
		} as any);

		expect(cmd).toBe("compose -p compose-app up -d");
	});
});
