import { createTRPCRouter } from "../api/trpc";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/ai";
import { applicationRouter } from "./routers/application";
import { backupRouter } from "./routers/backup";
import { bitbucketRouter } from "./routers/bitbucket";
import { certificateRouter } from "./routers/certificate";
import { clusterRouter } from "./routers/cluster";
import { composeRouter } from "./routers/compose";
import { deploymentRouter } from "./routers/deployment";
import { destinationRouter } from "./routers/destination";
import { dockerRouter } from "./routers/docker";
import { domainRouter } from "./routers/domain";
import { gitProviderRouter } from "./routers/git-provider";
import { giteaRouter } from "./routers/gitea";
import { githubRouter } from "./routers/github";
import { gitlabRouter } from "./routers/gitlab";
import { mariadbRouter } from "./routers/mariadb";
import { mongoRouter } from "./routers/mongo";
import { mountRouter } from "./routers/mount";
import { mysqlRouter } from "./routers/mysql";
import { notificationRouter } from "./routers/notification";
import { organizationRouter } from "./routers/organization";
import { portRouter } from "./routers/port";
import { postgresRouter } from "./routers/postgres";
import { previewDeploymentRouter } from "./routers/preview-deployment";
import { projectRouter } from "./routers/project";
import { redirectsRouter } from "./routers/redirects";
import { redisRouter } from "./routers/redis";
import { registryRouter } from "./routers/registry";
import { rollbackRouter } from "./routers/rollbacks";
import { scheduleRouter } from "./routers/schedule";
import { securityRouter } from "./routers/security";
import { serverRouter } from "./routers/server";
import { settingsRouter } from "./routers/settings";
import { sshRouter } from "./routers/ssh-key";
import { stripeRouter } from "./routers/stripe";
import { swarmRouter } from "./routers/swarm";
import { userRouter } from "./routers/user";
import { volumeBackupsRouter } from "./routers/volume-backups";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	docker: dockerRouter,
	project: projectRouter,
	application: applicationRouter,
	mysql: mysqlRouter,
	postgres: postgresRouter,
	redis: redisRouter,
	mongo: mongoRouter,
	mariadb: mariadbRouter,
	compose: composeRouter,
	user: userRouter,
	domain: domainRouter,
	destination: destinationRouter,
	backup: backupRouter,
	deployment: deploymentRouter,
	previewDeployment: previewDeploymentRouter,
	mounts: mountRouter,
	certificates: certificateRouter,
	settings: settingsRouter,
	security: securityRouter,
	redirects: redirectsRouter,
	port: portRouter,
	registry: registryRouter,
	cluster: clusterRouter,
	notification: notificationRouter,
	sshKey: sshRouter,
	gitProvider: gitProviderRouter,
	gitea: giteaRouter,
	bitbucket: bitbucketRouter,
	gitlab: gitlabRouter,
	github: githubRouter,
	server: serverRouter,
	stripe: stripeRouter,
	swarm: swarmRouter,
	ai: aiRouter,
	organization: organizationRouter,
	schedule: scheduleRouter,
	rollback: rollbackRouter,
	volumeBackups: volumeBackupsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
