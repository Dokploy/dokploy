import { describe, expect, it } from "vitest";
import { parseRepositoryPath } from "@/components/dashboard/shared/repository-path";

describe("parseRepositoryPath", () => {
	it("parses owner/repository paths", () => {
		expect(parseRepositoryPath("acme/payments")).toEqual({
			owner: "acme",
			repository: "payments",
		});
	});

	it("preserves nested GitLab namespaces", () => {
		expect(parseRepositoryPath("platform/backend/payments")).toEqual({
			owner: "platform/backend",
			repository: "payments",
		});
	});

	it("accepts provider URLs and removes the git suffix", () => {
		expect(
			parseRepositoryPath("https://git.example.com/acme/payments.git"),
		).toEqual({
			owner: "acme",
			repository: "payments",
		});
	});

	it("rejects ambiguous repository names", () => {
		expect(parseRepositoryPath("payments")).toBeNull();
		expect(parseRepositoryPath("  ")).toBeNull();
	});
});
