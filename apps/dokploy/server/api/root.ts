import { createTRPCRouter } from "../api/trpc";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/ai";
import { applicationRouter } from "./routers/application";
import { auditLogRouter } from "./routers/audit-log";
import { backupRouter } from "./routers/backup";
import { bitbucketRouter } from "./routers/bitbucket";
import { certificateRouter } from "./routers/certificate";
import { cloudflareRouter } from "./routers/cloudflare";
import { clusterRouter } from "./routers/cluster";
import { composeRouter } from "./routers/compose";
import { customRoleRouter } from "./routers/custom-role";
import { deploymentRouter } from "./routers/deployment";
import { destinationRouter } from "./routers/destination";
import { dockerRouter } from "./routers/docker";
import { domainRouter } from "./routers/domain";
import { environmentRouter } from "./routers/environment";
import { forwardAuthRouter } from "./routers/forward-auth";
import { gitProviderRouter } from "./routers/git-provider";
import { giteaRouter } from "./routers/gitea";
import { githubRouter } from "./routers/github";
import { gitlabRouter } from "./routers/gitlab";
import { libsqlRouter } from "./routers/libsql";
import { mariadbRouter } from "./routers/mariadb";
import { mongoRouter } from "./routers/mongo";
import { mountRouter } from "./routers/mount";
import { mysqlRouter } from "./routers/mysql";
import { notificationRouter } from "./routers/notification";
import { organizationRouter } from "./routers/organization";
import { patchRouter } from "./routers/patch";
import { portRouter } from "./routers/port";
import { postgresRouter } from "./routers/postgres";
import { previewDeploymentRouter } from "./routers/preview-deployment";
import { projectRouter } from "./routers/project";
import { redirectsRouter } from "./routers/redirects";
import { redisRouter } from "./routers/redis";
import { registryRouter } from "./routers/registry";
import { rollbackRouter } from "./routers/rollbacks";
import { scheduleRouter } from "./routers/schedule";
import { scimRouter } from "./routers/scim";
import { securityRouter } from "./routers/security";
import { serverRouter } from "./routers/server";
import { settingsRouter } from "./routers/settings";
import { sshRouter } from "./routers/ssh-key";
import { ssoRouter } from "./routers/sso";
import { stripeRouter } from "./routers/stripe";
import { swarmRouter } from "./routers/swarm";
import { tagRouter } from "./routers/tag";
import { userRouter } from "./routers/user";
import { volumeBackupsRouter } from "./routers/volume-backups";
import { whitelabelingRouter } from "./routers/whitelabeling";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	application: applicationRouter,
	backup: backupRouter,
	bitbucket: bitbucketRouter,
	certificates: certificateRouter,
	cloudflare: cloudflareRouter,
	cluster: clusterRouter,
	compose: composeRouter,
	deployment: deploymentRouter,
	destination: destinationRouter,
	docker: dockerRouter,
	domain: domainRouter,
	gitea: giteaRouter,
	gitProvider: gitProviderRouter,
	github: githubRouter,
	gitlab: gitlabRouter,
	libsql: libsqlRouter,
	mariadb: mariadbRouter,
	mongo: mongoRouter,
	mounts: mountRouter,
	mysql: mysqlRouter,
	notification: notificationRouter,
	port: portRouter,
	postgres: postgresRouter,
	previewDeployment: previewDeploymentRouter,
	project: projectRouter,
	redirects: redirectsRouter,
	redis: redisRouter,
	registry: registryRouter,
	security: securityRouter,
	server: serverRouter,
	settings: settingsRouter,
	sshKey: sshRouter,
	stripe: stripeRouter,
	swarm: swarmRouter,
	user: userRouter,
	ai: aiRouter,
	organization: organizationRouter,
	sso: ssoRouter,
	scim: scimRouter,
	forwardAuth: forwardAuthRouter,
	whitelabeling: whitelabelingRouter,
	customRole: customRoleRouter,
	auditLog: auditLogRouter,
	schedule: scheduleRouter,
	rollback: rollbackRouter,
	volumeBackups: volumeBackupsRouter,
	environment: environmentRouter,
	tag: tagRouter,
	patch: patchRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
