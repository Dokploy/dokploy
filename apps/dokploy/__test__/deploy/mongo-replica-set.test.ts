import { describe, expect, it } from "vitest";
import { generateMongoStartupScript } from "../../../../packages/server/src/utils/databases/mongo-script";

describe("generateMongoStartupScript", () => {
	const baseOptions = {
		appName: "test-mongo-app",
		databaseUser: "admin",
		databasePassword: "secretPassword123",
	};

	it("returns empty string when replicaSets is false or undefined", () => {
		expect(
			generateMongoStartupScript({
				...baseOptions,
				replicaSets: false,
			}),
		).toBe("");

		expect(
			generateMongoStartupScript({
				...baseOptions,
				replicaSets: undefined,
			}),
		).toBe("");
	});

	it("preserves 'wait $MONGOD_PID' and signal trap when command is empty string", () => {
		const script = generateMongoStartupScript({
			...baseOptions,
			replicaSets: true,
			command: "",
		});

		expect(script).toContain(
			"mongod --port 27017 --replSet rs0 --bind_ip_all &",
		);
		expect(script).toContain("MONGOD_PID=$!");
		expect(script).toContain(
			"trap 'kill -TERM $MONGOD_PID 2>/dev/null; wait $MONGOD_PID' TERM INT",
		);
		expect(script.trimEnd().endsWith("wait $MONGOD_PID")).toBe(true);
	});

	it("preserves 'wait $MONGOD_PID' when command is null or undefined", () => {
		const scriptNull = generateMongoStartupScript({
			...baseOptions,
			replicaSets: true,
			command: null,
		});
		expect(scriptNull.trimEnd().endsWith("wait $MONGOD_PID")).toBe(true);

		const scriptUndefined = generateMongoStartupScript({
			...baseOptions,
			replicaSets: true,
			command: undefined,
		});
		expect(scriptUndefined.trimEnd().endsWith("wait $MONGOD_PID")).toBe(true);
	});

	it("preserves 'wait $MONGOD_PID' when command is only whitespace", () => {
		const script = generateMongoStartupScript({
			...baseOptions,
			replicaSets: true,
			command: "   ",
		});
		expect(script.trimEnd().endsWith("wait $MONGOD_PID")).toBe(true);
	});

	it("uses custom command when non-empty command is provided", () => {
		const customCommand = "mongod --config /etc/mongod.conf";
		const script = generateMongoStartupScript({
			...baseOptions,
			replicaSets: true,
			command: customCommand,
		});

		expect(script.trimEnd().endsWith(customCommand)).toBe(true);
	});

	it("interpolates appName, user, and password correctly", () => {
		const script = generateMongoStartupScript({
			appName: "my-mongo-cluster",
			databaseUser: "customUser",
			databasePassword: "myComplexPassword!",
			replicaSets: true,
		});

		expect(script).toContain('host: "my-mongo-cluster:27017"');
		expect(script).toContain('user: "customUser"');
		expect(script).toContain('pwd: "myComplexPassword!"');
	});
});
