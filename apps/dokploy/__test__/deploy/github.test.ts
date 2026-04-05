import { describe, expect, it } from "vitest";
import {
	extractCommitMessage,
	extractImageName,
	extractImageTag,
	extractImageTagFromRequest,
} from "@/pages/api/deploy/[refreshToken]";

describe("GitHub Webhook Skip CI", () => {
	const mockGithubHeaders = {
		"x-github-event": "push",
	};

	const createMockBody = (message: string) => ({
		head_commit: {
			message,
		},
	});

	const skipKeywords = [
		"[skip ci]",
		"[ci skip]",
		"[no ci]",
		"[skip actions]",
		"[actions skip]",
	];

	it("should detect skip keywords in commit message", () => {
		for (const keyword of skipKeywords) {
			const message = `feat: add new feature ${keyword}`;
			const commitMessage = extractCommitMessage(
				mockGithubHeaders,
				createMockBody(message),
			);
			expect(commitMessage.includes(keyword)).toBe(true);
		}
	});

	it("should not detect skip keywords in normal commit message", () => {
		const message = "feat: add new feature";
		const commitMessage = extractCommitMessage(
			mockGithubHeaders,
			createMockBody(message),
		);
		for (const keyword of skipKeywords) {
			expect(commitMessage.includes(keyword)).toBe(false);
		}
	});

	it("should handle different webhook sources", () => {
		// GitHub
		expect(
			extractCommitMessage(
				{ "x-github-event": "push" },
				{ head_commit: { message: "[skip ci] test" } },
			),
		).toBe("[skip ci] test");

		// GitLab
		expect(
			extractCommitMessage(
				{ "x-gitlab-event": "push" },
				{ commits: [{ message: "[skip ci] test" }] },
			),
		).toBe("[skip ci] test");

		// Bitbucket
		expect(
			extractCommitMessage(
				{ "x-event-key": "repo:push" },
				{
					push: {
						changes: [{ new: { target: { message: "[skip ci] test" } } }],
					},
				},
			),
		).toBe("[skip ci] test");

		// Gitea
		expect(
			extractCommitMessage(
				{ "x-gitea-event": "push" },
				{ commits: [{ message: "[skip ci] test" }] },
			),
		).toBe("[skip ci] test");

		// Soft Serve
		expect(
			extractCommitMessage(
				{ "x-softserve-event": "push" },
				{ commits: [{ message: "[skip ci] test" }] },
			),
		).toBe("[skip ci] test");
	});

	it("should handle missing commit message", () => {
		expect(extractCommitMessage(mockGithubHeaders, {})).toBe("NEW COMMIT");
		expect(extractCommitMessage({ "x-gitlab-event": "push" }, {})).toBe(
			"NEW COMMIT",
		);
		expect(
			extractCommitMessage(
				{ "x-event-key": "repo:push" },
				{ push: { changes: [] } },
			),
		).toBe("NEW COMMIT");
		expect(extractCommitMessage({ "x-gitea-event": "push" }, {})).toBe(
			"NEW COMMIT",
		);
		expect(extractCommitMessage({ "x-softserve-event": "push" }, {})).toBe(
			"NEW COMMIT",
		);
	});
});

describe("GitHub Packages Docker Image Tag Extraction", () => {
	it("should extract tag from container_metadata", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					container_metadata: {
						tag: {
							name: "v1.0.0",
							digest: "sha256:abc123...",
						},
					},
					package_url: "ghcr.io/owner/repo:v1.0.0",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBe("v1.0.0");
	});

	it("should extract tag from package_url when container_metadata tag matches version", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					container_metadata: {
						tag: {
							name: "sha256:abc123...",
							digest: "sha256:abc123...",
						},
					},
					package_url: "ghcr.io/owner/repo:latest",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBe("latest");
	});

	it("should extract tag from package_url when container_metadata is missing", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					package_url: "ghcr.io/owner/repo:1.2.3",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBe("1.2.3");
	});

	it("should handle different tag formats in package_url", () => {
		const headers = { "x-github-event": "registry_package" };
		const testCases = [
			{ url: "ghcr.io/owner/repo:latest", expected: "latest" },
			{ url: "ghcr.io/owner/repo:v1.0.0", expected: "v1.0.0" },
			{ url: "ghcr.io/owner/repo:1.2.3", expected: "1.2.3" },
			{ url: "ghcr.io/owner/repo:dev", expected: "dev" },
		];

		for (const testCase of testCases) {
			const body = {
				registry_package: {
					package_version: {
						version: "sha256:abc123...",
						package_url: testCase.url,
					},
				},
			};

			const tag = extractImageTagFromRequest(headers, body);
			expect(tag).toBe(testCase.expected);
		}
	});

	it("should return null for non-registry_package events", () => {
		const headers = { "x-github-event": "push" };
		const body = {
			registry_package: {
				package_version: {
					package_url: "ghcr.io/owner/repo:latest",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBeNull();
	});

	it("should return null when package_version is missing", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBeNull();
	});

	it("should return null when package_url has no tag", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					package_url: "ghcr.io/owner/repo",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBeNull();
	});

	it("should return null when package_url ends with colon (no tag)", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					package_url: "ghcr.io/owner/repo:",
					container_metadata: {
						tag: {
							name: "",
							digest: "sha256:abc123...",
						},
					},
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBeNull();
	});

	it("should return null when tag name is empty string", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					container_metadata: {
						tag: {
							name: "",
							digest: "sha256:abc123...",
						},
					},
					package_url: "ghcr.io/owner/repo:",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBeNull();
	});

	it("should ignore tag if it matches the version (digest)", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
					container_metadata: {
						tag: {
							name: "sha256:abc123...",
							digest: "sha256:abc123...",
						},
					},
					package_url: "ghcr.io/owner/repo:latest",
				},
			},
		};

		const tag = extractImageTagFromRequest(headers, body);
		expect(tag).toBe("latest");
	});

	it("should handle registry_package commit message with package_url", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					package_url: "ghcr.io/owner/repo:latest",
				},
			},
		};

		const message = extractCommitMessage(headers, body);
		expect(message).toBe("Docker GHCR image pushed: ghcr.io/owner/repo:latest");
	});

	it("should handle registry_package commit message when package_url is missing", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {
				package_version: {
					version: "sha256:abc123...",
				},
			},
		};

		const message = extractCommitMessage(headers, body);
		expect(message).toBe("Docker GHCR image pushed");
	});

	it("should handle registry_package commit message when package_version is missing", () => {
		const headers = { "x-github-event": "registry_package" };
		const body = {
			registry_package: {},
		};

		const message = extractCommitMessage(headers, body);
		expect(message).toBe("NEW COMMIT");
	});
});

describe("Docker Image Name and Tag Extraction", () => {
	describe("extractImageName", () => {
		it("should return image name without tag", () => {
			expect(extractImageName("my-image:latest")).toBe("my-image");
			expect(extractImageName("my-image:1.0.0")).toBe("my-image");
			expect(extractImageName("ghcr.io/owner/repo:latest")).toBe(
				"ghcr.io/owner/repo",
			);
		});

		it("should return full image name when no tag is present", () => {
			expect(extractImageName("my-image")).toBe("my-image");
			expect(extractImageName("ghcr.io/owner/repo")).toBe("ghcr.io/owner/repo");
		});

		it("should handle images with port numbers correctly", () => {
			expect(extractImageName("registry:5000/image:tag")).toBe(
				"registry:5000/image",
			);
			expect(extractImageName("localhost:5000/my-app:latest")).toBe(
				"localhost:5000/my-app",
			);
		});

		it("should handle complex image paths", () => {
			expect(
				extractImageName("myregistryhost:5000/fedora/httpd:version1.0"),
			).toBe("myregistryhost:5000/fedora/httpd");
			expect(extractImageName("registry.example.com:8080/ns/app:v1.2.3")).toBe(
				"registry.example.com:8080/ns/app",
			);
		});

		it("should return null for invalid inputs", () => {
			expect(extractImageName(null)).toBeNull();
			expect(extractImageName("")).toBeNull();
		});

		it("should handle edge cases with multiple colons", () => {
			expect(extractImageName("image:tag:extra")).toBe("image:tag");
			expect(extractImageName("registry:5000:invalid")).toBe("registry:5000");
		});
	});

	describe("extractImageTag", () => {
		it("should extract tag from image with tag", () => {
			expect(extractImageTag("my-image:latest")).toBe("latest");
			expect(extractImageTag("my-image:1.0.0")).toBe("1.0.0");
			expect(extractImageTag("ghcr.io/owner/repo:v1.2.3")).toBe("v1.2.3");
		});

		it("should return 'latest' when no tag is present", () => {
			expect(extractImageTag("my-image")).toBe("latest");
			expect(extractImageTag("ghcr.io/owner/repo")).toBe("latest");
		});

		it("should handle complex image paths with tags", () => {
			expect(
				extractImageTag("myregistryhost:5000/fedora/httpd:version1.0"),
			).toBe("version1.0");
			expect(extractImageTag("registry.example.com:8080/ns/app:v1.2.3")).toBe(
				"v1.2.3",
			);
		});

		it("should return null for invalid inputs", () => {
			expect(extractImageTag(null)).toBeNull();
			expect(extractImageTag("")).toBeNull();
		});

		it("should handle edge cases with multiple colons", () => {
			expect(extractImageTag("image:tag:extra")).toBe("extra");
			expect(extractImageTag("registry:5000/image:tag")).toBe("tag");
		});

		it("should handle numeric tags", () => {
			expect(extractImageTag("my-image:123")).toBe("123");
			expect(extractImageTag("my-image:1")).toBe("1");
		});
	});
});
