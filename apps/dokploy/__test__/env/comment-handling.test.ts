import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForShell,
} from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

describe("prepareEnvironmentVariables (# in values)", () => {
	it("preserves a trailing # in an unquoted value", () => {
		const serviceEnv = `
PASSWORD=secret#
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["PASSWORD=secret#"]);
	});

	it("preserves # in the middle of an unquoted value", () => {
		const serviceEnv = `
PASSWORD=sec#ret
MULTI=a#b#c
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["PASSWORD=sec#ret", "MULTI=a#b#c"]);
	});

	it("preserves a value starting with #", () => {
		const serviceEnv = `
SHEBANG=#!secret
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["SHEBANG=#!secret"]);
	});

	it("still strips inline comments preceded by whitespace", () => {
		const serviceEnv = `
WITH_SPACE=value # this is a comment
WITH_TAB=value	# this is a comment
QUOTED="value" # this is a comment
ONLY_COMMENT= # this is a comment
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual([
			"WITH_SPACE=value",
			"WITH_TAB=value",
			"QUOTED=value",
			"ONLY_COMMENT=",
		]);
	});

	it("preserves # inside quoted values", () => {
		const serviceEnv = `
DOUBLE="val#ue"
SINGLE='val#ue'
TRAILING="secret#"
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual([
			"DOUBLE=val#ue",
			"SINGLE=val#ue",
			"TRAILING=secret#",
		]);
	});

	it("skips full-line comments", () => {
		const serviceEnv = `
# leading comment
FIRST=one
  # indented comment
SECOND=two
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["FIRST=one", "SECOND=two"]);
	});

	it("preserves # in values containing =", () => {
		const serviceEnv = `
CONN=user=admin;password=b#c
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["CONN=user=admin;password=b#c"]);
	});

	it("preserves # through project, environment and self references", () => {
		const projectEnv = `
DB_PASS=secret#end
`;
		const environmentEnv = `
API_KEY=key#123
`;
		const serviceEnv = `
DATABASE_URL=postgres://user:\${{project.DB_PASS}}@db:5432/app
TOKEN=\${{environment.API_KEY}}
LOCAL_SECRET=self#value
COPY=\${{LOCAL_SECRET}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceEnv,
			projectEnv,
			environmentEnv,
		);

		expect(resolved).toEqual([
			"DATABASE_URL=postgres://user:secret#end@db:5432/app",
			"TOKEN=key#123",
			"LOCAL_SECRET=self#value",
			"COPY=self#value",
		]);
	});
});

describe("getEnvironmentVariablesObject (# in values)", () => {
	it("returns untruncated values containing #", () => {
		const serviceEnv = `
PASSWORD=secret#
MID=sec#ret
`;

		const jsonObject = getEnvironmentVariablesObject(serviceEnv, "", "");

		expect(jsonObject).toEqual({
			PASSWORD: "secret#",
			MID: "sec#ret",
		});
	});
});

describe("prepareEnvironmentVariablesForShell (# in values)", () => {
	it("keeps # in shell-quoted output", () => {
		const serviceEnv = `
PASSWORD=secret#
`;

		const resolved = prepareEnvironmentVariablesForShell(serviceEnv, "", "");

		expect(resolved).toHaveLength(1);
		// shell-quote escapes special characters, so unescape before comparing
		expect(resolved[0]?.replace(/\\/g, "")).toBe("PASSWORD=secret#");
	});
});

describe("parser parity with previous dotenv behavior", () => {
	it("supports the export prefix", () => {
		const serviceEnv = `
export EXPORTED=value
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["EXPORTED=value"]);
	});

	it("supports multiline double-quoted values", () => {
		const serviceEnv = `
MULTILINE="line1
line2"
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["MULTILINE=line1\nline2"]);
	});

	it("expands \\n escape sequences inside double quotes", () => {
		const serviceEnv = `
ESCAPED="line1\\nline2"
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["ESCAPED=line1\nline2"]);
	});

	it("handles empty values", () => {
		const serviceEnv = `
EMPTY=
EMPTY_DOUBLE=""
EMPTY_SINGLE=''
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, "", "");

		expect(resolved).toEqual(["EMPTY=", "EMPTY_DOUBLE=", "EMPTY_SINGLE="]);
	});
});
