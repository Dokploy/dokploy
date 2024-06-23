import { db } from "@/server/db";
import { type apiCreateCompose, compose } from "@/server/db/schema";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { load } from "js-yaml";
import { findAdmin } from "./admin";
import { createDeploymentCompose, updateDeploymentStatus } from "./deployment";
import { buildCompose } from "@/server/utils/builders/compose";
import { createComposeFile } from "@/server/utils/providers/raw";
import { execAsync } from "@/server/utils/process/execAsync";
import { join } from "node:path";
import { COMPOSE_PATH } from "@/server/constants";
import { cloneGithubRepository } from "@/server/utils/providers/github";
import { cloneGitRepository } from "@/server/utils/providers/git";
import { validUniqueServerAppName } from "./project";
import { generateAppName } from "@/server/db/schema/utils";
import { generatePassword } from "@/templates/utils";

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

export const loadServices = async (composeId: string) => {
	const compose = await findComposeById(composeId);

	// use js-yaml to parse the docker compose file and then extact the services
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	if (!composeData?.services) {
		return ["All Services"];
	}

	const services = Object.keys(composeData.services);

	return [...services, "All Services"];
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
}: {
	composeId: string;
	titleLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const admin = await findAdmin();
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
	});

	try {
		if (compose.sourceType === "github") {
			await cloneGithubRepository(admin, compose, deployment.logPath, true);
		} else if (compose.sourceType === "git") {
			await cloneGitRepository(compose, deployment.logPath, true);
		} else {
			await createComposeFile(compose, deployment.logPath);
		}
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
};

export const rebuildCompose = async ({
	composeId,
	titleLog = "Rebuild deployment",
}: {
	composeId: string;
	titleLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
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
