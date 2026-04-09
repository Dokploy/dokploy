import { readFile } from "node:fs/promises";
import { dynamicTool } from "ai";
import { z } from "zod";
import { findDeploymentById } from "../../services/deployment";

export interface ChatContext {
	type: "application" | "compose" | "project" | "server" | "general";
	id: string;
}

interface ToolConfig {
	baseUrl: string;
	cookie: string;
}

async function callApi(
	config: ToolConfig,
	method: "GET" | "POST",
	path: string,
	params?: Record<string, unknown>,
) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Cookie: config.cookie,
	};

	let url = `${config.baseUrl}${path}`;

	if (method === "GET" && params) {
		const searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				searchParams.append(key, String(value));
			}
		}
		const qs = searchParams.toString();
		if (qs) url += `?${qs}`;
	}

	const response = await fetch(url, {
		method,
		headers,
		...(method === "POST" && params ? { body: JSON.stringify(params) } : {}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API error (${response.status}): ${errorText.slice(0, 500)}`);
	}

	return response.json();
}

function makeTool(
	description: string,
	inputSchema: z.ZodObject<z.ZodRawShape>,
	executeFn: (input: Record<string, unknown>) => Promise<unknown>,
) {
	return dynamicTool({
		description,
		inputSchema,
		execute: async (rawInput: unknown) => {
			try {
				const input = (rawInput ?? {}) as Record<string, unknown>;
				const result = await executeFn(input);
				const json = JSON.stringify(result, null, 2);
				// Truncate very large responses
				if (json.length > 15000) {
					return `${json.slice(0, 15000)}\n\n... [Truncated — ${json.length} chars total]`;
				}
				return json;
			} catch (error) {
				return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
			}
		},
	});
}

// ─── READ TOOLS ──────────────────────────────────────────────

function readTools(context: ChatContext, config: ToolConfig) {
	const tools: Record<string, ReturnType<typeof dynamicTool>> = {};

	if (context.type === "application") {
		tools["get-application-info"] = makeTool(
			"Get the full configuration of the current application: name, status, build type, source, env vars, resource limits, and more. Call this first to understand the app state.",
			z.object({}),
			() => callApi(config, "GET", "/application.one", { applicationId: context.id }),
		);

		tools["list-deployments"] = makeTool(
			"List the 10 most recent deployments for this application. Each deployment has a status (done/error/running), title, error message, and timestamps. Use this to find failed builds.",
			z.object({}),
			() => callApi(config, "GET", "/deployment.allByType", { id: context.id, type: "application" }),
		);

		tools["list-domains"] = makeTool(
			"List all domains configured for this application.",
			z.object({}),
			() => callApi(config, "GET", "/domain.byApplicationId", { applicationId: context.id }),
		);

		tools["get-containers"] = makeTool(
			"List running Docker containers for this application. Shows container state, status, and names.",
			z.object({}),
			async () => {
				const app = await callApi(config, "GET", "/application.one", { applicationId: context.id });
				return callApi(config, "GET", "/docker.getContainersByAppNameMatch", {
					appName: (app as { appName: string }).appName,
				});
			},
		);
	}

	if (context.type === "compose") {
		tools["get-compose-info"] = makeTool(
			"Get the full configuration of the current compose service: name, status, compose file content, env vars, and more.",
			z.object({}),
			() => callApi(config, "GET", "/compose.one", { composeId: context.id }),
		);

		tools["list-deployments"] = makeTool(
			"List the 10 most recent deployments for this compose service.",
			z.object({}),
			() => callApi(config, "GET", "/deployment.allByType", { id: context.id, type: "compose" }),
		);

		tools["list-domains"] = makeTool(
			"List all domains configured for this compose service.",
			z.object({}),
			() => callApi(config, "GET", "/domain.byComposeId", { composeId: context.id }),
		);
	}

	if (context.type === "project") {
		tools["get-project-info"] = makeTool(
			"Get the full project details including ALL environments and ALL services (applications, compose, databases). Use this to count services, see what's deployed, and find failing services.",
			z.object({}),
			() => callApi(config, "GET", "/project.one", { projectId: context.id }),
		);
	}

	if (context.type === "general") {
		tools["list-projects"] = makeTool(
			"List all projects in the organization.",
			z.object({}),
			() => callApi(config, "GET", "/project.all"),
		);
	}

	// Available in both application and compose contexts
	if (context.type === "application" || context.type === "compose") {
		tools["read-deployment-logs"] = dynamicTool({
			description:
				"Read the build/deployment logs for a specific deployment. ALWAYS call list-deployments first to find the deploymentId. This reads the actual log file content to diagnose build failures.",
			inputSchema: z.object({
				deploymentId: z.string().describe("The deployment ID from list-deployments"),
			}),
			execute: async (rawInput: unknown) => {
				const { deploymentId } = rawInput as { deploymentId: string };
				try {
					const deployment = await findDeploymentById(deploymentId);
					const content = await readFile(deployment.logPath, "utf-8");
					const lines = content.split("\n");
					const last200 = lines.slice(-200).join("\n");
					return `Deployment status: ${deployment.status}\nError message: ${deployment.errorMessage || "none"}\n\nLast 200 lines of build log:\n${last200}`;
				} catch {
					return "Could not read deployment logs — the log file may not exist.";
				}
			},
		});

		tools["read-runtime-logs"] = makeTool(
			"Read the runtime/container logs (stdout/stderr) of this application. Shows the last N lines of the running application output. Use this to diagnose runtime errors, crashes, or check if the app is working.",
			z.object({
				tail: z.number().optional().describe("Number of lines to read (default 200, max 500)"),
			}),
			(input) => {
				const tail = Math.min((input.tail as number) || 200, 500);
				const endpoint = context.type === "compose" ? "/compose.readLogs" : "/application.readLogs";
				const idKey = context.type === "compose" ? "composeId" : "applicationId";
				return callApi(config, "GET", endpoint, {
					[idKey]: context.id,
					tail,
					since: "all",
				});
			},
		);
	}

	return tools;
}

// ─── WRITE TOOLS ─────────────────────────────────────────────

function writeTools(context: ChatContext, config: ToolConfig) {
	const tools: Record<string, ReturnType<typeof dynamicTool>> = {};

	if (context.type === "application") {
		tools["update-env-vars"] = makeTool(
			"Update the environment variables for this application. Pass the FULL env string (KEY=VALUE format, one per line). This REPLACES all existing env vars, so include the ones you want to keep.",
			z.object({
				env: z.string().describe("Full environment variables, one KEY=VALUE per line"),
			}),
			(input) =>
				callApi(config, "POST", "/application.saveEnvironment", {
					applicationId: context.id,
					env: input.env,
				}),
		);

		tools["deploy-application"] = makeTool(
			"Trigger a new deployment/build for this application. The build will run in the background.",
			z.object({}),
			() =>
				callApi(config, "POST", "/application.deploy", {
					applicationId: context.id,
					title: "AI-triggered deployment",
					description: "Deployed via AI Assistant",
				}),
		);

		tools["redeploy-application"] = makeTool(
			"Redeploy the application using the existing build (no new build). Faster than deploy.",
			z.object({}),
			() =>
				callApi(config, "POST", "/application.redeploy", {
					applicationId: context.id,
					title: "AI-triggered redeployment",
					description: "Redeployed via AI Assistant",
				}),
		);

		tools["stop-application"] = makeTool(
			"Stop the application. This will stop all containers.",
			z.object({}),
			() => callApi(config, "POST", "/application.stop", { applicationId: context.id }),
		);

		tools["start-application"] = makeTool(
			"Start a stopped application.",
			z.object({}),
			() => callApi(config, "POST", "/application.start", { applicationId: context.id }),
		);

		tools["restart-container"] = makeTool(
			"Restart a specific Docker container. Use get-containers first to find the container ID.",
			z.object({
				containerId: z.string().describe("The container ID from get-containers"),
			}),
			(input) => callApi(config, "POST", "/docker.restartContainer", { containerId: input.containerId }),
		);
	}

	if (context.type === "compose") {
		tools["update-compose-env"] = makeTool(
			"Update the environment variables for this compose service. Pass the FULL env string.",
			z.object({
				env: z.string().describe("Full environment variables, one KEY=VALUE per line"),
			}),
			(input) =>
				callApi(config, "POST", "/compose.update", {
					composeId: context.id,
					env: input.env,
				}),
		);

		tools["deploy-compose"] = makeTool(
			"Trigger a new deployment for this compose service.",
			z.object({}),
			() =>
				callApi(config, "POST", "/compose.deploy", {
					composeId: context.id,
					title: "AI-triggered deployment",
					description: "Deployed via AI Assistant",
				}),
		);

		tools["stop-compose"] = makeTool(
			"Stop the compose service.",
			z.object({}),
			() => callApi(config, "POST", "/compose.stop", { composeId: context.id }),
		);

		tools["start-compose"] = makeTool(
			"Start a stopped compose service.",
			z.object({}),
			() => callApi(config, "POST", "/compose.start", { composeId: context.id }),
		);
	}

	return tools;
}

// ─── PUBLIC API ──────────────────────────────────────────────

export function getReadTools(context: ChatContext, config: ToolConfig) {
	return readTools(context, config);
}

export function getAllTools(context: ChatContext, config: ToolConfig) {
	return {
		...readTools(context, config),
		...writeTools(context, config),
	};
}
