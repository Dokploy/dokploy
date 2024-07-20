import { docker } from "@/server/constants";
import { db } from "@/server/db";
import {
	type apiCreateApplication,
	applications,
	domains,
} from "@/server/db/schema";
import { generateAppName } from "@/server/db/schema/utils";
import { getAdvancedStats } from "@/server/monitoring/utilts";
import { buildApplication } from "@/server/utils/builders";
import { buildDocker } from "@/server/utils/providers/docker";
import { cloneGitRepository } from "@/server/utils/providers/git";
import { cloneGithubRepository } from "@/server/utils/providers/github";
import { createTraefikConfig } from "@/server/utils/traefik/application";
import { generatePassword } from "@/templates/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin, getDokployUrl } from "./admin";
import { createDeployment, updateDeploymentStatus } from "./deployment";

import { sendBuildErrorNotifications } from "@/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@/server/utils/notifications/build-success";
import { validUniqueServerAppName } from "./project";
export type Application = typeof applications.$inferSelect;

export const createApplication = async (
	input: typeof apiCreateApplication._type,
) => {
	input.appName =
		`${input.appName}-${generatePassword(6)}` || generateAppName("app");
	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Application with this 'AppName' already exists",
			});
		}
	}

	return await db.transaction(async (tx) => {
		const newApplication = await tx
			.insert(applications)
			.values({
				...input,
			})
			.returning()
			.then((value) => value[0]);

		if (!newApplication) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the application",
			});
		}

		if (process.env.NODE_ENV === "development") {
			createTraefikConfig(newApplication.appName);
			await tx.insert(domains).values({
				applicationId: newApplication.applicationId,
				host: `${newApplication.appName}.docker.localhost`,
				port: process.env.NODE_ENV === "development" ? 3000 : 80,
				certificateType: "none",
			});
		}

		return newApplication;
	});
};

export const findApplicationById = async (applicationId: string) => {
	const application = await db.query.applications.findFirst({
		where: eq(applications.applicationId, applicationId),
		with: {
			project: true,
			domains: true,
			deployments: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
			registry: true,
		},
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Application not found",
		});
	}
	return application;
};

export const findApplicationByName = async (appName: string) => {
	const application = await db.query.applications.findFirst({
		where: eq(applications.appName, appName),
	});

	return application;
};

export const updateApplication = async (
	applicationId: string,
	applicationData: Partial<Application>,
) => {
	const application = await db
		.update(applications)
		.set({
			...applicationData,
		})
		.where(eq(applications.applicationId, applicationId))
		.returning();

	return application[0];
};

export const updateApplicationStatus = async (
	applicationId: string,
	applicationStatus: Application["applicationStatus"],
) => {
	const application = await db
		.update(applications)
		.set({
			applicationStatus: applicationStatus,
		})
		.where(eq(applications.applicationId, applicationId))
		.returning();

	return application;
};

export const deployApplication = async ({
	applicationId,
	titleLog = "Manual deployment",
	descriptionLog = "",
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const application = await findApplicationById(applicationId);
	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.projectId}/services/application/${application.applicationId}?tab=deployments`;
	const admin = await findAdmin();
	const deployment = await createDeployment({
		applicationId: applicationId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (application.sourceType === "github") {
			await cloneGithubRepository(admin, application, deployment.logPath);
			await buildApplication(application, deployment.logPath);
		} else if (application.sourceType === "docker") {
			await buildDocker(application, deployment.logPath);
		} else if (application.sourceType === "git") {
			await cloneGitRepository(application, deployment.logPath);
			await buildApplication(application, deployment.logPath);
		}
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateApplicationStatus(applicationId, "done");

		await sendBuildSuccessNotifications({
			projectName: application.project.name,
			applicationName: application.name,
			applicationType: "application",
			buildLink,
		});
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");
		await sendBuildErrorNotifications({
			projectName: application.project.name,
			applicationName: application.name,
			applicationType: "application",
			// @ts-ignore
			errorMessage: error?.message || "Error to build",
			buildLink,
		});

		console.log(
			"Error on ",
			application.buildType,
			"/",
			application.sourceType,
			error,
		);

		throw error;
	}

	return true;
};

export const rebuildApplication = async ({
	applicationId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const application = await findApplicationById(applicationId);
	const deployment = await createDeployment({
		applicationId: applicationId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (application.sourceType === "github") {
			await buildApplication(application, deployment.logPath);
		} else if (application.sourceType === "docker") {
			await buildDocker(application, deployment.logPath);
		} else if (application.sourceType === "git") {
			await buildApplication(application, deployment.logPath);
		}
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateApplicationStatus(applicationId, "done");
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");
		throw error;
	}

	return true;
};

export const getApplicationStats = async (appName: string) => {
	const filter = {
		status: ["running"],
		label: [`com.docker.swarm.service.name=${appName}`],
	};

	const containers = await docker.listContainers({
		filters: JSON.stringify(filter),
	});

	const container = containers[0];
	if (!container || container?.State !== "running") {
		return null;
	}

	const data = await getAdvancedStats(appName);

	return data;
};
