import {
	mergeContainerEnv,
	readEnvVar,
	setEnvVar,
} from "@dokploy/server/utils/libredb-studio/env";
import { describe, expect, it } from "vitest";

describe("readEnvVar", () => {
	it("reads a value from a multi-line env", () => {
		const env = "ADMIN_EMAIL=owner@example.com\nSTORAGE_PROVIDER=sqlite";
		expect(readEnvVar(env, "ADMIN_EMAIL")).toBe("owner@example.com");
		expect(readEnvVar(env, "STORAGE_PROVIDER")).toBe("sqlite");
	});

	it("returns null for a missing key, a null env and an empty env", () => {
		expect(readEnvVar("A=1", "B")).toBeNull();
		expect(readEnvVar(null, "A")).toBeNull();
		expect(readEnvVar(undefined, "A")).toBeNull();
		expect(readEnvVar("", "A")).toBeNull();
	});

	it("keeps an empty value distinct from a missing key", () => {
		expect(readEnvVar("A=", "A")).toBe("");
	});

	it("reads quoted, exported and repeated keys the way the container gets them", () => {
		expect(readEnvVar('A="x y"', "A")).toBe("x y");
		expect(readEnvVar("export A=1", "A")).toBe("1");
		expect(readEnvVar("A=1\nA=2", "A")).toBe("2");
		expect(readEnvVar("A=1\r\nB=2\r\n", "B")).toBe("2");
		expect(readEnvVar("# A=1\nB=2", "A")).toBeNull();
	});

	it("refuses an invalid key", () => {
		expect(() => readEnvVar("A=1", "A-B")).toThrow(
			"Invalid environment variable name: A-B",
		);
	});
});

describe("setEnvVar", () => {
	it("replaces a value in place and keeps the order of the other lines", () => {
		expect(
			setEnvVar(
				"A=1\nAUTH_COOKIE_SECURE=true\nB=2",
				"AUTH_COOKIE_SECURE",
				"false",
			),
		).toBe("A=1\nAUTH_COOKIE_SECURE=false\nB=2");
	});

	it("appends a missing key", () => {
		expect(setEnvVar("A=1", "B", "2")).toBe("A=1\nB=2");
	});

	it("appends before a trailing newline", () => {
		expect(setEnvVar("A=1\n", "B", "2")).toBe("A=1\nB=2\n");
	});

	it("creates an env from null, undefined and an empty string", () => {
		expect(setEnvVar(null, "A", "1")).toBe("A=1");
		expect(setEnvVar(undefined, "A", "1")).toBe("A=1");
		expect(setEnvVar("", "A", "1")).toBe("A=1");
	});

	it("removes the key when the value is null", () => {
		expect(
			setEnvVar(
				"A=1\nAUTH_COOKIE_SECURE=false\nB=2",
				"AUTH_COOKIE_SECURE",
				null,
			),
		).toBe("A=1\nB=2");
		expect(setEnvVar("A=1", "B", null)).toBe("A=1");
		expect(setEnvVar(null, "B", null)).toBe("");
	});

	it("collapses repeated and alternative definitions into one line", () => {
		expect(setEnvVar("A=1\nexport A=2\nB=3\nA: 4\n A = 5", "A", "9")).toBe(
			"A=9\nB=3",
		);
		expect(setEnvVar("A=1\nexport A=2\nB=3\nA: 4", "A", null)).toBe("B=3");
	});

	it("leaves keys that only share a prefix and commented lines alone", () => {
		expect(setEnvVar("AB=1\n# A=2\nA_B=3", "A", "4")).toBe(
			"AB=1\n# A=2\nA_B=3\nA=4",
		);
	});

	it("round-trips through readEnvVar", () => {
		const env = setEnvVar("A=1", "ADMIN_EMAIL", "owner@example.com");
		expect(readEnvVar(env, "ADMIN_EMAIL")).toBe("owner@example.com");
	});

	it.each([
		["x\nC=injected"],
		["x\rC=injected"],
		["x\r\nC=injected"],
		["ends-with-a-line-feed\n"],
	])(
		"refuses the line break in %j, which would add another variable",
		(value) => {
			expect(() => setEnvVar("A=1\nB=2", "B", value)).toThrow(
				"The value of B contains a line break",
			);
			expect(() => setEnvVar(null, "B", value)).toThrow(
				"The value of B contains a line break",
			);
		},
	);

	it("refuses a value Dokploy would resolve as a variable reference", () => {
		expect(() => setEnvVar("A=1", "B", "${{project.SECRET}}")).toThrow(
			"The value of B contains ${{, which Dokploy would resolve when it deploys",
		);
		expect(() => setEnvVar("A=1", "B", "x${{A}}")).toThrow(
			"The value of B contains ${{, which Dokploy would resolve when it deploys",
		);
		expect(setEnvVar("A=1", "B", "${B}")).toBe("A=1\nB=${B}");
	});

	it("refuses a value the container would receive changed", () => {
		expect(() => setEnvVar("A=1", "B", "p@ss#word")).toThrow(
			"The value of B cannot be stored as an unquoted environment line",
		);
		expect(() => setEnvVar("A=1", "B", " padded ")).toThrow(
			"The value of B cannot be stored as an unquoted environment line",
		);
	});

	it("refuses an invalid key", () => {
		expect(() => setEnvVar("A=1", "1A", "x")).toThrow(
			"Invalid environment variable name: 1A",
		);
	});
});

describe("mergeContainerEnv", () => {
	it("drops base entries whose key is overridden and appends the overrides", () => {
		expect(
			mergeContainerEnv(
				[
					"A=1",
					"SEED_CONFIG_PATH=/tmp/user.json",
					"B=2",
					"ALLOW_CUSTOM_CONNECTIONS=true",
				],
				[
					"SEED_CONFIG_PATH=/app/config/seed-connections.json",
					"ALLOW_CUSTOM_CONNECTIONS=false",
				],
			),
		).toEqual([
			"A=1",
			"B=2",
			"SEED_CONFIG_PATH=/app/config/seed-connections.json",
			"ALLOW_CUSTOM_CONNECTIONS=false",
		]);
	});

	it("matches on the whole key, not on a prefix", () => {
		expect(mergeContainerEnv(["AB=1", "A=2"], ["A=3"])).toEqual([
			"AB=1",
			"A=3",
		]);
	});

	it("keeps values that contain an equals sign", () => {
		expect(mergeContainerEnv(["A=x=y"], ["B=p=q"])).toEqual(["A=x=y", "B=p=q"]);
	});

	it("returns the base unchanged without overrides", () => {
		expect(mergeContainerEnv(["A=1", "A=2"], [])).toEqual(["A=1", "A=2"]);
	});

	it("refuses an override without a valid key", () => {
		expect(() => mergeContainerEnv([], ["NO_SEPARATOR"])).toThrow(
			"Invalid container environment override: NO_SEPARATOR",
		);
		expect(() => mergeContainerEnv([], ["=value"])).toThrow(
			"Invalid container environment override: ",
		);
	});

	it("refuses a key that is overridden twice", () => {
		expect(() => mergeContainerEnv([], ["A=1", "A=2"])).toThrow(
			"Duplicate container environment override: A",
		);
	});
});
