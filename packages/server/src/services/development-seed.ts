import { db } from "@dokploy/server/db";
import {
	applications,
	environments,
	member,
	organization,
	projects,
} from "@dokploy/server/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

const SEED_PROJECT_ID = "dev-seed-examples";
const SEED_ENVIRONMENT_ID = "dev-seed-production";
const LEGACY_SEED_APPLICATION_IDS = [
	"dev-seed-node-nixpacks",
	"dev-seed-node-railpack",
	"dev-seed-dockerfile",
] as const;

export const developmentSeedIds = {
	projectId: SEED_PROJECT_ID,
	environmentId: SEED_ENVIRONMENT_ID,
	applicationIds: ["dev-seed-nextjs", "dev-seed-laravel"],
} as const;

const developmentApplications = [
	{
		applicationId: "dev-seed-nextjs",
		name: "Next.js",
		appName: "seed-nextjs",
		description:
			"Development seed app cloned from the public Next.js repository.",
		customGitUrl: "https://github.com/vercel/next.js.git",
		customGitBranch: "canary",
		customGitBuildPath: "/",
		buildType: "nixpacks" as const,
	},
	{
		applicationId: "dev-seed-laravel",
		name: "Laravel",
		appName: "seed-laravel",
		description:
			"Development seed app cloned from the public Laravel repository.",
		customGitUrl: "https://github.com/laravel/laravel.git",
		customGitBranch: "13.x",
		customGitBuildPath: "/",
		buildType: "nixpacks" as const,
	},
];

type SeedDatabase = typeof db;
type SeedLogger = Pick<Console, "log" | "warn">;

export interface DevelopmentSeedResult {
	seeded: boolean;
	reason?: "cloud" | "production" | "missing-organization";
	organizationId?: string;
	projectId?: string;
	environmentId?: string;
	applications: string[];
}

interface SeedOptions {
	database?: SeedDatabase;
	logger?: SeedLogger;
}

export const seedDevelopmentProjectData = async ({
	database = db,
	logger = console,
}: SeedOptions = {}): Promise<DevelopmentSeedResult> => {
	if (process.env.NODE_ENV === "production") {
		logger.warn("Skipping development seed data in production.");
		return { seeded: false, reason: "production", applications: [] };
	}

	if (process.env.IS_CLOUD === "true") {
		logger.warn("Skipping development seed data in cloud mode.");
		return { seeded: false, reason: "cloud", applications: [] };
	}

	const targetOrganization = await findSeedOrganization(database);
	if (!targetOrganization) {
		logger.warn(
			"No organization found. Create a local account first, then run db:seed again.",
		);
		return {
			seeded: false,
			reason: "missing-organization",
			applications: [],
		};
	}

	await database.transaction(async (tx) => {
		await upsertProject(tx, targetOrganization.id);
		await upsertEnvironment(tx);
		await removeLegacySeedApplications(tx);

		for (const seedApplication of developmentApplications) {
			await upsertApplication(tx, seedApplication);
		}
	});

	logger.log(
		`Seeded development project data in organization ${targetOrganization.id}.`,
	);

	return {
		seeded: true,
		organizationId: targetOrganization.id,
		projectId: SEED_PROJECT_ID,
		environmentId: SEED_ENVIRONMENT_ID,
		applications: developmentApplications.map((app) => app.applicationId),
	};
};

const findSeedOrganization = async (database: SeedDatabase) => {
	const defaultMember = await database.query.member.findFirst({
		where: eq(member.isDefault, true),
		orderBy: asc(member.createdAt),
		with: {
			organization: true,
		},
	});

	if (defaultMember?.organization) {
		return defaultMember.organization;
	}

	return await database.query.organization.findFirst({
		orderBy: asc(organization.createdAt),
	});
};

const upsertProject = async (
	database: SeedDatabase,
	organizationId: string,
) => {
	const projectValues = {
		projectId: SEED_PROJECT_ID,
		name: "Example Project",
		description: "",
		organizationId,
		env: "",
	};
	const existingProject = await database.query.projects.findFirst({
		where: eq(projects.projectId, SEED_PROJECT_ID),
	});

	if (existingProject) {
		await database
			.update(projects)
			.set(projectValues)
			.where(eq(projects.projectId, SEED_PROJECT_ID))
			.returning();
		return;
	}

	await database.insert(projects).values(projectValues).returning();
};

const upsertEnvironment = async (database: SeedDatabase) => {
	const environmentValues = {
		environmentId: SEED_ENVIRONMENT_ID,
		name: "production",
		description: "Example project with example apps.",
		projectId: SEED_PROJECT_ID,
		env: "",
		isDefault: true,
	};
	const existingEnvironment = await database.query.environments.findFirst({
		where: eq(environments.environmentId, SEED_ENVIRONMENT_ID),
	});

	if (existingEnvironment) {
		await database
			.update(environments)
			.set(environmentValues)
			.where(eq(environments.environmentId, SEED_ENVIRONMENT_ID))
			.returning();
		return;
	}

	await database.insert(environments).values(environmentValues).returning();
};

const removeLegacySeedApplications = async (database: SeedDatabase) => {
	await database
		.delete(applications)
		.where(
			inArray(applications.applicationId, [...LEGACY_SEED_APPLICATION_IDS]),
		);
};

const upsertApplication = async (
	database: SeedDatabase,
	seedApplication: (typeof developmentApplications)[number],
) => {
	const applicationValues = {
		applicationId: seedApplication.applicationId,
		name: seedApplication.name,
		appName: seedApplication.appName,
		description: seedApplication.description,
		environmentId: SEED_ENVIRONMENT_ID,
		sourceType: "git" as const,
		customGitUrl: seedApplication.customGitUrl,
		customGitBranch: seedApplication.customGitBranch,
		customGitBuildPath: seedApplication.customGitBuildPath,
		customGitSSHKeyId: null,
		githubId: null,
		serverId: null,
		buildType: seedApplication.buildType,
		dockerfile: null,
		applicationStatus: "idle" as const,
		enableSubmodules: false,
	};
	const existingApplication = await database.query.applications.findFirst({
		where: eq(applications.applicationId, seedApplication.applicationId),
	});

	if (existingApplication) {
		await database
			.update(applications)
			.set(applicationValues)
			.where(eq(applications.applicationId, seedApplication.applicationId))
			.returning();
		return;
	}

	await database.insert(applications).values(applicationValues).returning();
};
