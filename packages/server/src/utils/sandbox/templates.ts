import type { SandboxTemplateName } from "@dokploy/server/db/schema";

export interface SandboxTemplate {
	image: string;
	user: string | null;
	workdir: string;
	description: string;
}

// Placeholder images until the dokploy/sandbox-* images are published.
export const SANDBOX_TEMPLATES: Record<SandboxTemplateName, SandboxTemplate> = {
	base: {
		image: "ubuntu:24.04",
		user: "1000:1000",
		workdir: "/home/user",
		description: "Ubuntu 24.04 with a POSIX shell and coreutils",
	},
	python: {
		image: "python:3.12-slim",
		user: "1000:1000",
		workdir: "/home/user",
		description: "Python 3.12 (pip available)",
	},
	node: {
		image: "node:22-slim",
		user: "1000:1000",
		workdir: "/home/user",
		description: "Node.js 22 (npm available)",
	},
};
