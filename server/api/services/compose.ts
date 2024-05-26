import { db } from "@/server/db";
import { type apiCreateCompose, compose } from "@/server/db/schema";
import { randomizeComposeFile } from "@/server/utils/docker/compose";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { load } from "js-yaml";
import { findAdmin } from "./admin";
import { createDeploymentCompose, updateDeploymentStatus } from "./deployment";
import { buildCompose } from "@/server/utils/builders/compose";
import { cloneGithubRepositoryCompose } from "@/server/utils/providers/github";
import { cloneGitRepositoryCompose } from "@/server/utils/providers/git";
import { createComposeFile } from "@/server/utils/providers/raw";
import { execAsync } from "@/server/utils/process/execAsync";
import { join } from "node:path";
import { COMPOSE_PATH } from "@/server/constants";

export type Compose = typeof compose.$inferSelect;

export const createCompose = async (input: typeof apiCreateCompose._type) => {
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
			await cloneGithubRepositoryCompose(admin, compose, deployment.logPath);
		} else if (compose.sourceType === "git") {
			await cloneGitRepositoryCompose(compose, deployment.logPath);
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

export const removeCompose = async (appName: string) => {
	try {
		const projectPath = join(COMPOSE_PATH, appName);
		const { stderr, stdout } = await execAsync("docker compose down", {
			cwd: projectPath,
		});

		if (stderr) {
			throw new Error(stderr);
		}
	} catch (error) {
		throw error;
	}

	return true;
};
