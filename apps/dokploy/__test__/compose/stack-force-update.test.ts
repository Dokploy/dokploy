import {
	createCommand,
	getStackForceUpdateCommand,
} from "@dokploy/server/utils/builders/compose";
import { describe, expect, it } from "vitest";

const base = {
	composeType: "stack" as const,
	appName: "my-stack",
	sourceType: "github" as const,
	composePath: "./docker-compose.yml",
	command: "",
};

describe("stack force update", () => {
	it("forces an update of every service in the stack", () => {
		const cmd = getStackForceUpdateCommand(base);

		expect(cmd).toBe(
			"docker stack services --format '{{.Name}}' my-stack | xargs -r -n1 docker service update --force --with-registry-auth >/dev/null",
		);
	});

	it("quotes the stack name", () => {
		const cmd = getStackForceUpdateCommand({ ...base, appName: "a b;c" });

		expect(cmd).toContain("'a b;c'");
	});

	it("is empty for docker-compose deployments", () => {
		expect(
			getStackForceUpdateCommand({ ...base, composeType: "docker-compose" }),
		).toBe("");
	});

	it("is empty when a custom command is set", () => {
		expect(
			getStackForceUpdateCommand({ ...base, command: "stack deploy -c x y" }),
		).toBe("");
	});

	it("leaves the stack deploy command itself unchanged", () => {
		expect(createCommand(base as any)).toBe(
			"stack deploy -c ./docker-compose.yml my-stack --prune --with-registry-auth",
		);
	});
});
