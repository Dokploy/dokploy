import type { SandboxTemplateName } from "@dokploy/server/db/schema";

export interface SandboxTemplate {
	image: string;
	user: string | null;
	workdir: string;
	description: string;
	env?: string[];
}

const NON_ROOT = { user: "1000:1000", workdir: "/home/user" };

// Placeholder images until the dokploy/sandbox-* images are published.
export const SANDBOX_TEMPLATES: Record<SandboxTemplateName, SandboxTemplate> = {
	base: {
		image: "ubuntu:24.04",
		...NON_ROOT,
		description: "Ubuntu 24.04 with a POSIX shell and coreutils",
	},
	alpine: {
		image: "alpine:3.20",
		...NON_ROOT,
		description: "Alpine 3.20, the smallest image (busybox)",
	},
	python: {
		image: "python:3.13-slim",
		...NON_ROOT,
		description: "Python 3.13 (pip available)",
	},
	node: {
		image: "node:22-slim",
		...NON_ROOT,
		description: "Node.js 22 (npm available)",
	},
	bun: {
		image: "oven/bun:1",
		...NON_ROOT,
		description: "Bun 1.x runtime and package manager",
	},
	deno: {
		image: "denoland/deno:debian",
		...NON_ROOT,
		description: "Deno 2.x",
		env: ["DENO_DIR=/home/user/.cache/deno"],
	},
	go: {
		image: "golang:1.24",
		...NON_ROOT,
		description: "Go 1.24",
	},
	rust: {
		image: "rust:1-slim",
		...NON_ROOT,
		description: "Rust stable (cargo available)",
		// The image's CARGO_HOME is root-owned; keep the toolchain there and the
		// registry cache in the sandbox user's home.
		env: [
			"CARGO_HOME=/home/user/.cargo",
			"PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		],
	},
	ruby: {
		image: "ruby:3.3-slim",
		...NON_ROOT,
		description: "Ruby 3.3 (gem and bundler available)",
		// The image's GEM_HOME (/usr/local/bundle) is root-owned.
		env: [
			"GEM_HOME=/home/user/.gem",
			"BUNDLE_APP_CONFIG=/home/user/.bundle",
			"PATH=/home/user/.gem/bin:/usr/local/bundle/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		],
	},
	java: {
		image: "eclipse-temurin:21-jdk",
		...NON_ROOT,
		description: "Java 21 JDK (Eclipse Temurin)",
	},
	php: {
		image: "php:8.3-cli",
		...NON_ROOT,
		description: "PHP 8.3 CLI",
	},
};
