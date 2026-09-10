import {
	buildSandboxFindCommand,
	buildSandboxLsCommand,
	parseSandboxFindOutput,
	parseSandboxLsOutput,
} from "@dokploy/server/utils/sandbox/files";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";

describe("list files commands", () => {
	it("quotes the path against shell injection", () => {
		expect(buildSandboxFindCommand("/tmp/a b; rm -rf /")).toContain(
			"'/tmp/a b; rm -rf /'",
		);
		expect(parse(buildSandboxLsCommand("/tmp/$(id)"))).toEqual([
			"ls",
			"-1Ap",
			"/tmp/$(id)",
		]);
	});
});

describe("parseSandboxFindOutput", () => {
	it("parses type, size, mtime, mode and name, directories first", () => {
		const out = [
			"f\t12\t1700000000.5000\t644\tmain.py",
			"d\t4096\t1700000100.0000\t755\tsrc",
			"l\t7\t1700000200.0000\t777\tlink",
			"f\t0\t1700000300.0000\t600\tname with\tspaces",
		].join("\n");
		const entries = parseSandboxFindOutput(out);
		expect(entries.map((e) => e.name)).toEqual([
			"src",
			"link",
			"main.py",
			"name with\tspaces",
		]);
		expect(entries[0]).toEqual({
			name: "src",
			type: "directory",
			size: 4096,
			mode: "755",
			modifiedAt: new Date(1700000100 * 1000).toISOString(),
		});
		expect(entries[2]).toMatchObject({
			type: "file",
			size: 12,
			modifiedAt: new Date(1700000000500).toISOString(),
		});
		expect(entries[1]?.type).toBe("symlink");
	});

	it("returns an empty list for an empty directory", () => {
		expect(parseSandboxFindOutput("")).toEqual([]);
		expect(parseSandboxFindOutput("\n")).toEqual([]);
	});
});

describe("parseSandboxLsOutput", () => {
	it("marks trailing-slash entries as directories", () => {
		const entries = parseSandboxLsOutput("b.txt\na/\n.hidden\n");
		expect(entries).toEqual([
			{
				name: "a",
				type: "directory",
				size: null,
				mode: null,
				modifiedAt: null,
			},
			{
				name: ".hidden",
				type: "file",
				size: null,
				mode: null,
				modifiedAt: null,
			},
			{ name: "b.txt", type: "file", size: null, mode: null, modifiedAt: null },
		]);
	});
});
