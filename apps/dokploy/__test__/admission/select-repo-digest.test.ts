import { selectRepoDigest } from "@dokploy/server/utils/admission/resolve-digest";
import { describe, expect, it } from "vitest";

describe("selectRepoDigest", () => {
	it("returns the operator's repo with the matched digest", () => {
		const repoDigests = ["nginx@sha256:aaa"];
		expect(selectRepoDigest(repoDigests, "nginx:1.27")).toBe(
			"nginx@sha256:aaa",
		);
	});

	it("picks the entry whose repository matches the deployed ref (not index 0)", () => {
		const repoDigests = [
			"alpine@sha256:hub",
			"myreg.example.com/alpine@sha256:priv",
		];
		expect(selectRepoDigest(repoDigests, "myreg.example.com/alpine:3.19")).toBe(
			"myreg.example.com/alpine@sha256:priv",
		);
	});

	it("normalizes Docker Hub shorthand when matching", () => {
		const repoDigests = ["alpine@sha256:aaa"];
		expect(selectRepoDigest(repoDigests, "docker.io/library/alpine:3.19")).toBe(
			"docker.io/library/alpine@sha256:aaa",
		);
	});

	it("throws when RepoDigests is empty (unpushed/local-only)", () => {
		expect(() => selectRepoDigest([], "nginx:1.27")).toThrow();
	});

	it("throws when no entry matches the deployed repository", () => {
		expect(() =>
			selectRepoDigest(["other/image@sha256:zzz"], "nginx:1.27"),
		).toThrow();
	});

	it("pins a bare matched ref — local-only protection lives in resolveDigest's docker pull, not in this pure function", () => {
		expect(selectRepoDigest(["nginx@sha256:aaa"], "nginx")).toBe(
			"nginx@sha256:aaa",
		);
	});
});
