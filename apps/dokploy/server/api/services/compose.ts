import { join } from "node:path";
import { COMPOSE_PATH } from "@/server/constants";
import { db } from "@/server/db";
import { type apiCreateCompose, compose } from "@/server/db/schema";
import { generateAppName } from "@/server/db/schema/utils";
import { buildCompose } from "@/server/utils/builders/compose";
import { cloneCompose, loadDockerCompose } from "@/server/utils/docker/domain";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { sendBuildErrorNotifications } from "@/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@/server/utils/notifications/build-success";
import { execAsync } from "@/server/utils/process/execAsync";
import { cloneGitRepository } from "@/server/utils/providers/git";
import { cloneGithubRepository } from "@/server/utils/providers/github";
import { createComposeFile } from "@/server/utils/providers/raw";
import { generatePassword } from "@/templates/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin, getDokployUrl } from "./admin";
import { createDeploymentCompose, updateDeploymentStatus } from "./deployment";
import { validUniqueServerAppName } from "./project";

export type Compose = typeof compose.$inferSelect;

export const createCompose = async (input: typeof apiCreateCompose._type) => {
	input.appName =
		`${input.appName}-${generatePassword(6)}` || generateAppName("compose");
	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}
	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			composeFile: "",
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	return newDestination;
};

export const createComposeByTemplate = async (
	input: typeof compose.$inferInsert,
) => {
	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}
	const newDestination = await db
		.insert(compose)
		.values({
			...input,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	return newDestination;
};

export const findComposeById = async (composeId: string) => {
	const result = await db.query.compose.findFirst({
		where: eq(compose.composeId, composeId),
		with: {
			project: true,
			deployments: true,
			mounts: true,
			domains: true,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Compose not found",
		});
	}
	return result;
};

export const loadServices = async (
	composeId: string,
	type: "fetch" | "cache" = "fetch",
) => {
	const compose = await findComposeById(composeId);

	if (type === "fetch") {
		await cloneCompose(compose);
	}

	const composeData = await loadDockerCompose(compose);
	if (!composeData?.services) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Services not found",
		});
	}

	const services = Object.keys(composeData.services);

	return [...services];
};

export const updateCompose = async (
	composeId: string,
	composeData: Partial<Compose>,
) => {
	const composeResult = await db
		.update(compose)
		.set({
			...composeData,
		})
		.where(eq(compose.composeId, composeId))
		.returning();

	return composeResult[0];
};

export const deployCompose = async ({
	composeId,
	titleLog = "Manual deployment",
	descriptionLog = "",
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const admin = await findAdmin();
	const buildLink = `${await getDokployUrl()}/dashboard/project/${compose.projectId}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (compose.sourceType === "github") {
			await cloneGithubRepository(admin, compose, deployment.logPath, true);
		} else if (compose.sourceType === "git") {
			await cloneGitRepository(compose, deployment.logPath, true);
		} else if (compose.sourceType === "raw") {
			await createComposeFile(compose, deployment.logPath);
		}
		await buildCompose(compose, deployment.logPath);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});

		await sendBuildSuccessNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			buildLink,
		});
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		await sendBuildErrorNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			// @ts-ignore
			errorMessage: error?.message || "Error to build",
			buildLink,
		});
		throw error;
	}
};

export const rebuildCompose = async ({
	composeId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		await buildCompose(compose, deployment.logPath);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};

export const removeCompose = async (compose: Compose) => {
	try {
		const projectPath = join(COMPOSE_PATH, compose.appName);

		if (compose.composeType === "stack") {
			await execAsync(`docker stack rm ${compose.appName}`, {
				cwd: projectPath,
			});
		} else {
			await execAsync(`docker compose -p ${compose.appName} down`, {
				cwd: projectPath,
			});
		}
	} catch (error) {
		throw error;
	}

	return true;
};

export const stopCompose = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	try {
		if (compose.composeType === "docker-compose") {
			await execAsync(`docker compose -p ${compose.appName} stop`, {
				cwd: join(COMPOSE_PATH, compose.appName),
			});
		}

		await updateCompose(composeId, {
			composeStatus: "idle",
		});
	} catch (error) {
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};
