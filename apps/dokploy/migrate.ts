// import { drizzle } from "drizzle-orm/postgres-js";
// import { nanoid } from "nanoid";
// import postgres from "postgres";
// import * as schema from "./server/db/schema";

// const connectionString = process.env.DATABASE_URL!;

// const sql = postgres(connectionString, { max: 1 });
// const db = drizzle(sql, {
// 	schema,
// });

// await db
// 	.transaction(async (db) => {
// 		const admins = await db.query.admins.findMany({
// 			with: {
// 				auth: true,
// 				users: {
// 					with: {
// 						auth: true,
// 					},
// 				},
// 			},
// 		});
// 		for (const admin of admins) {
// 			const user = await db
// 				.insert(schema.users_temp)
// 				.values({
// 					id: admin.adminId,
// 					email: admin.auth.email,
// 					token: admin.auth.token || "",
// 					emailVerified: true,
// 					updatedAt: new Date(),
// 					role: "admin",
// 					serverIp: admin.serverIp,
// 					image: admin.auth.image,
// 					certificateType: admin.certificateType,
// 					host: admin.host,
// 					letsEncryptEmail: admin.letsEncryptEmail,
// 					sshPrivateKey: admin.sshPrivateKey,
// 					enableDockerCleanup: admin.enableDockerCleanup,
// 					enableLogRotation: admin.enableLogRotation,
// 					enablePaidFeatures: admin.enablePaidFeatures,
// 					metricsConfig: admin.metricsConfig,
// 					cleanupCacheApplications: admin.cleanupCacheApplications,
// 					cleanupCacheOnPreviews: admin.cleanupCacheOnPreviews,
// 					cleanupCacheOnCompose: admin.cleanupCacheOnCompose,
// 					stripeCustomerId: admin.stripeCustomerId,
// 					stripeSubscriptionId: admin.stripeSubscriptionId,
// 					serversQuantity: admin.serversQuantity,
// 				})
// 				.returning()
// 				.then((user) => user[0]);

// 			await db.insert(schema.account).values({
// 				providerId: "credential",
// 				userId: user?.id || "",
// 				password: admin.auth.password,
// 				is2FAEnabled: admin.auth.is2FAEnabled || false,
// 				createdAt: new Date(admin.auth.createdAt) || new Date(),
// 				updatedAt: new Date(admin.auth.createdAt) || new Date(),
// 			});

// 			const organization = await db
// 				.insert(schema.organization)
// 				.values({
// 					name: "My Organization",
// 					slug: nanoid(),
// 					ownerId: user?.id || "",
// 					createdAt: new Date(admin.createdAt) || new Date(),
// 				})
// 				.returning()
// 				.then((organization) => organization[0]);

// 			for (const member of admin.users) {
// 				const userTemp = await db
// 					.insert(schema.users_temp)
// 					.values({
// 						id: member.userId,
// 						email: member.auth.email,
// 						token: member.token || "",
// 						emailVerified: true,
// 						updatedAt: new Date(admin.createdAt) || new Date(),
// 						role: "user",
// 						image: member.auth.image,
// 						createdAt: admin.createdAt,
// 						canAccessToAPI: member.canAccessToAPI || false,
// 						canAccessToDocker: member.canAccessToDocker || false,
// 						canAccessToGitProviders: member.canAccessToGitProviders || false,
// 						canAccessToSSHKeys: member.canAccessToSSHKeys || false,
// 						canAccessToTraefikFiles: member.canAccessToTraefikFiles || false,
// 						canCreateProjects: member.canCreateProjects || false,
// 						canCreateServices: member.canCreateServices || false,
// 						canDeleteProjects: member.canDeleteProjects || false,
// 						canDeleteServices: member.canDeleteServices || false,
// 						accessedProjects: member.accessedProjects || [],
// 						accessedServices: member.accessedServices || [],
// 					})
// 					.returning()
// 					.then((userTemp) => userTemp[0]);

// 				await db.insert(schema.account).values({
// 					providerId: "credential",
// 					userId: member?.userId || "",
// 					password: member.auth.password,
// 					is2FAEnabled: member.auth.is2FAEnabled || false,
// 					createdAt: new Date(member.auth.createdAt) || new Date(),
// 					updatedAt: new Date(member.auth.createdAt) || new Date(),
// 				});

// 				await db.insert(schema.member).values({
// 					organizationId: organization?.id || "",
// 					userId: userTemp?.id || "",
// 					role: "admin",
// 					createdAt: new Date(member.createdAt) || new Date(),
// 				});
// 			}
// 		}
// 	})
// 	.then(() => {
// 		console.log("Migration finished");
// 	})
// 	.catch((error) => {
// 		console.error(error);
// 	});

// await db
// 	.transaction(async (db) => {
// 		const projects = await db.query.projects.findMany({
// 			with: {
// 				user: {
// 					with: {
// 						organizations: true,
// 					},
// 				},
// 			},
// 		});
// 		for (const project of projects) {
// 			const _user = await db.update(schema.projects).set({
// 				organizationId: project.user.organizations[0]?.id || "",
// 			});
// 		}
// 	})
// 	.then(() => {
// 		console.log("Migration finished");
// 	})
// 	.catch((error) => {
// 		console.error(error);
// 	});
