import { prepareEnvironmentVariables } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

// https://github.com/Dokploy/dokploy/issues/5095 — expectations calibrated against docker compose v2

describe("prepareEnvironmentVariables (# in values)", () => {
	it("preserves # when it is not an inline comment", () => {
		const serviceEnv = [
			"TRAILING=secret#",
			"MIDDLE=sec#ret",
			"MULTI=a#b#c",
			"LEADING=#!secret",
			"NO_SPACE=value# not a comment",
			"CONN=user=admin;password=b#c",
		].join("\n");

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"TRAILING=secret#",
			"MIDDLE=sec#ret",
			"MULTI=a#b#c",
			"LEADING=#!secret",
			"NO_SPACE=value# not a comment",
			"CONN=user=admin;password=b#c",
		]);
	});

	it("strips an inline comment only after one or more spaces", () => {
		const serviceEnv = [
			"ONE_SPACE=value # comment",
			"TWO_SPACES=value  # comment",
			"TRAILING_WS=value ",
		].join("\n");

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"ONE_SPACE=value",
			"TWO_SPACES=value",
			"TRAILING_WS=value",
		]);
	});

	it("does not treat a tab-preceded # as a comment", () => {
		const serviceEnv = "WITH_TAB=value\t# not a comment";

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"WITH_TAB=value\t# not a comment",
		]);
	});

	it("treats a bare `KEY= # ...` as an empty value", () => {
		// deliberate divergence: compose reads "# this is a comment" here
		const serviceEnv = "ONLY_HASH= # this is a comment";

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"ONLY_HASH=",
		]);
	});

	it("preserves # inside quoted values and still strips a trailing comment", () => {
		const serviceEnv = [
			'DOUBLE="val#ue"',
			"SINGLE='val#ue'",
			'DOUBLE_THEN_COMMENT="a # b" # comment',
			"SINGLE_THEN_COMMENT='c # d' # comment",
		].join("\n");

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"DOUBLE=val#ue",
			"SINGLE=val#ue",
			"DOUBLE_THEN_COMMENT=a # b",
			"SINGLE_THEN_COMMENT=c # d",
		]);
	});

	it("still skips full-line comments", () => {
		const serviceEnv = [
			"# leading comment",
			"FIRST=one",
			"  # indented comment",
			"SECOND=two",
		].join("\n");

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"FIRST=one",
			"SECOND=two",
		]);
	});

	it("preserves # through project, environment and self references", () => {
		const projectEnv = "DB_PASS=secret#end";
		const environmentEnv = "API_KEY=key#123";
		const serviceEnv = [
			"DATABASE_URL=postgres://user:${{project.DB_PASS}}@db:5432/app",
			"TOKEN=${{environment.API_KEY}}",
			"LOCAL_SECRET=self#value",
			"COPY=${{LOCAL_SECRET}}",
		].join("\n");

		expect(
			prepareEnvironmentVariables(serviceEnv, projectEnv, environmentEnv),
		).toEqual([
			"DATABASE_URL=postgres://user:secret#end@db:5432/app",
			"TOKEN=key#123",
			"LOCAL_SECRET=self#value",
			"COPY=self#value",
		]);
	});
});

describe("prepareEnvironmentVariables (dotenv parity)", () => {
	it("keeps the behaviour dotenv had for everything except #", () => {
		const serviceEnv = [
			"export EXPORTED=value",
			'ESCAPED="line1\\nline2"',
			"EMPTY=",
			'EMPTY_DOUBLE=""',
			"EMPTY_SINGLE=''",
			"DOLLARS=pa$$word",
			'SPACED_QUOTED=  "padded"  ',
		].join("\n");

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"EXPORTED=value",
			"ESCAPED=line1\nline2",
			"EMPTY=",
			"EMPTY_DOUBLE=",
			"EMPTY_SINGLE=",
			"DOLLARS=pa$$word",
			"SPACED_QUOTED=padded",
		]);
	});

	it("supports multiline double-quoted values", () => {
		const serviceEnv = 'MULTILINE="line1\nline2"';

		expect(prepareEnvironmentVariables(serviceEnv, "", "")).toEqual([
			"MULTILINE=line1\nline2",
		]);
	});
});
