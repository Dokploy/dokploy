import { VALID_ENV_FILE_NAME_REGEX } from "@dokploy/server/utils/env-file-name-validation";
import { describe, expect, it } from "vitest";

const accepts = (v: string) => expect(VALID_ENV_FILE_NAME_REGEX.test(v)).toBe(true);
const rejects = (v: string) => expect(VALID_ENV_FILE_NAME_REGEX.test(v)).toBe(false);

describe("VALID_ENV_FILE_NAME_REGEX", () => {
	it("accepts plain env filenames", () => {
		accepts(".env");
		accepts(".env.local");
		accepts(".env.production.local");
		accepts(".env.test");
		accepts("custom-env");
		accepts("app_env");
		accepts("foo.bar");
	});

	it("accepts relative paths with slashes", () => {
		accepts("config/.env");
		accepts("config/.env.local");
		accepts("deep/nested/.env");
		accepts("a/b/c/d/e/.env");
	});

	it("rejects absolute paths", () => {
		rejects("/etc/passwd");
		rejects("/tmp/.env");
	});

	it("rejects '..' traversal", () => {
		rejects("..");
		rejects("../.env");
		rejects("../../etc/passwd");
		rejects("config/../.env");
		rejects("foo/../bar");
	});

	it("rejects '.' segments", () => {
		rejects(".");
		rejects("./foo");
		rejects("foo/.");
		rejects("foo/./bar");
	});

	it("rejects segments starting with '-'", () => {
		rejects("-flag");
		rejects("-.env");
		rejects("config/-flag");
		rejects("a/b/-c");
	});

	it("rejects shell metacharacters", () => {
		rejects('.env"');
		rejects(".env$");
		rejects(".env`");
		rejects(".env;");
		rejects(".env|");
		rejects(".env&");
		rejects(".env\\");
		rejects(".env'");
		rejects(".env>");
		rejects(".env<");
		rejects(".env(");
		rejects(".env)");
	});

	it("rejects whitespace", () => {
		rejects("");
		rejects(" ");
		rejects(".env ");
		rejects(" .env");
		rejects("foo bar");
		rejects("foo\tbar");
		rejects("foo\nbar");
		rejects("config/ .env");
	});

	it("rejects trailing or empty segments", () => {
		rejects("config/");
		rejects("/");
		rejects("config//.env");
	});
});
