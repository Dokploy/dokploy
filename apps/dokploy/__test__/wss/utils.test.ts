import { describe, expect, it } from "vitest";
import {
	isValidContainerId,
	isValidSearch,
	isValidSince,
	isValidTail,
} from "../../server/wss/utils";

describe("isValidTail (docker-container-logs)", () => {
	it("accepts valid numeric tail values", () => {
		expect(isValidTail("0")).toBe(true);
		expect(isValidTail("1")).toBe(true);
		expect(isValidTail("100")).toBe(true);
		expect(isValidTail("10000")).toBe(true);
	});

	it("rejects tail above 10000", () => {
		expect(isValidTail("10001")).toBe(false);
		expect(isValidTail("99999")).toBe(false);
	});

	it("rejects non-numeric tail", () => {
		expect(isValidTail("")).toBe(false);
		expect(isValidTail("abc")).toBe(false);
		expect(isValidTail("10a")).toBe(false);
		expect(isValidTail("-1")).toBe(false);
	});

	it("rejects command injection payloads in tail", () => {
		expect(isValidTail("10; whoami; #")).toBe(false);
		expect(isValidTail("100 | cat /etc/passwd")).toBe(false);
		expect(isValidTail("$(id)")).toBe(false);
		expect(isValidTail("`id`")).toBe(false);
		expect(isValidTail("100\nid")).toBe(false);
		expect(isValidTail("100 && id")).toBe(false);
		expect(isValidTail("100; env | grep DATABASE")).toBe(false);
	});
});

describe("isValidSince (docker-container-logs)", () => {
	it("accepts 'all'", () => {
		expect(isValidSince("all")).toBe(true);
	});

	it("accepts valid duration format (number + s|m|h|d)", () => {
		expect(isValidSince("5s")).toBe(true);
		expect(isValidSince("10m")).toBe(true);
		expect(isValidSince("1h")).toBe(true);
		expect(isValidSince("2d")).toBe(true);
		expect(isValidSince("0s")).toBe(true);
		expect(isValidSince("999d")).toBe(true);
	});

	it("rejects invalid duration format", () => {
		expect(isValidSince("")).toBe(false);
		expect(isValidSince("5")).toBe(false);
		expect(isValidSince("s")).toBe(false);
		expect(isValidSince("5x")).toBe(false);
		expect(isValidSince("5sec")).toBe(false);
		expect(isValidSince("5 m")).toBe(false);
	});

	it("rejects command injection payloads in since", () => {
		expect(isValidSince("5s; whoami")).toBe(false);
		expect(isValidSince("all; id")).toBe(false);
		expect(isValidSince("1m$(id)")).toBe(false);
		expect(isValidSince("1m | cat /etc/passwd")).toBe(false);
	});
});

describe("isValidSearch (docker-container-logs)", () => {
	it("accepts empty string", () => {
		expect(isValidSearch("")).toBe(true);
	});

	it("accepts only alphanumeric, space, dot, underscore, hyphen", () => {
		expect(isValidSearch("error")).toBe(true);
		expect(isValidSearch("foo bar")).toBe(true);
		expect(isValidSearch("a-zA-Z0-9_.-")).toBe(true);
		expect(isValidSearch("")).toBe(true);
	});

	it("rejects strings longer than 500 chars", () => {
		expect(isValidSearch("a".repeat(501))).toBe(false);
		expect(isValidSearch("a".repeat(500))).toBe(true);
	});

	it("rejects control characters and non-printable", () => {
		expect(isValidSearch("foo\nbar")).toBe(false);
		expect(isValidSearch("foo\rbar")).toBe(false);
		expect(isValidSearch("\x00")).toBe(false);
		expect(isValidSearch("a\x19b")).toBe(false);
	});

	it("rejects command injection vectors in search (search is concatenated into shell)", () => {
		// Double-quoted context (SSH line 99): $ and ` execute
		expect(isValidSearch("$(whoami)")).toBe(false);
		expect(isValidSearch("`id`")).toBe(false);
		expect(isValidSearch("$(id)")).toBe(false);
		// Single-quoted context (local line 153): ' breaks out
		expect(isValidSearch("'$(whoami)'")).toBe(false);
		expect(isValidSearch("error'")).toBe(false);
		expect(isValidSearch("'; whoami; #")).toBe(false);
		// Other shell-metacharacters
		expect(isValidSearch("error; id")).toBe(false);
		expect(isValidSearch("a|b")).toBe(false);
		expect(isValidSearch('error"')).toBe(false);
		expect(isValidSearch("a&b")).toBe(false);
	});
});

describe("isValidContainerId (docker-container-logs)", () => {
	it("accepts valid hex container IDs", () => {
		expect(isValidContainerId("a".repeat(12))).toBe(true);
		expect(isValidContainerId("abc123def456")).toBe(true);
		expect(isValidContainerId("a".repeat(64))).toBe(true);
	});

	it("accepts valid container names", () => {
		expect(isValidContainerId("my-container")).toBe(true);
		expect(isValidContainerId("app_1")).toBe(true);
		expect(isValidContainerId("service.name")).toBe(true);
	});

	it("rejects command injection in container ID", () => {
		expect(isValidContainerId("dummy; whoami")).toBe(false);
		expect(isValidContainerId("$(id)")).toBe(false);
		expect(isValidContainerId("`id`")).toBe(false);
		expect(isValidContainerId("container|cat /etc/passwd")).toBe(false);
		expect(isValidContainerId("x; env | grep DATABASE")).toBe(false);
	});
});
