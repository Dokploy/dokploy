import { authRouter } from "@/server/api/routers/auth";
import { createTRPCRouter } from "../api/trpc";
import { adminRouter } from "./routers/admin";
import { applicationRouter } from "./routers/application";
import { backupRouter } from "./routers/backup";
import { certificateRouter } from "./routers/certificate";
import { clusterRouter } from "./routers/cluster";
import { composeRouter } from "./routers/compose";
import { deploymentRouter } from "./routers/deployment";
import { destinationRouter } from "./routers/destination";
import { dockerRouter } from "./routers/docker";
import { domainRouter } from "./routers/domain";
import { mariadbRouter } from "./routers/mariadb";
import { mongoRouter } from "./routers/mongo";
import { mountRouter } from "./routers/mount";
import { mysqlRouter } from "./routers/mysql";
import { notificationRouter } from "./routers/notification";
import { portRouter } from "./routers/port";
import { postgresRouter } from "./routers/postgres";
import { projectRouter } from "./routers/project";
import { redirectsRouter } from "./routers/redirects";
import { redisRouter } from "./routers/redis";
import { registryRouter } from "./routers/registry";
import { securityRouter } from "./routers/security";
import { settingsRouter } from "./routers/settings";
import { sshRouter } from "./routers/ssh-key";
import { userRouter } from "./routers/user";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	admin: adminRouter,
	docker: dockerRouter,
	auth: authRouter,
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
});

// export type definition of API
export type AppRouter = typeof appRouter;
