import { db } from '@dokploy/server/db'
import {
	invitation,
	member,
	organization,
	subscription,
	user, projects,
} from '@dokploy/server/db/schema'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { IS_CLOUD } from '../constants'
import { getWebServerSettings } from './web-server-settings'

type UserRecord = typeof user.$inferSelect
type SubscriptionRecord = typeof subscription.$inferSelect
type ProjectRecord = typeof projects.$inferSelect

type Feature = { availableServer: number }
type ModFieldSub = {
	active: boolean
}

type Subscription = SubscriptionRecord & ModFieldSub & {
	access: Feature
}

type Project = {
	isCreateProjects: boolean,
	countProjects: number,
	projects: Array<ProjectRecord>,
}

type Plan = 'free' | 'pro' | 'agency'

const accessPlan: Record<Plan, Feature> = {
	'free': {
		availableServer: 1,
	},
	'pro': {
		availableServer: 10,
	},
	'agency': {
		availableServer: 50,
	},
}

const getSubscription = async (userId: string): Promise<Subscription> => {
	const subscriptionData = await db.query.subscription.findFirst({
		where: eq(subscription.userId, userId),
	})

	if (!subscriptionData) {
		throw new TRPCError({
			code: 'NOT_FOUND',
			message: 'Subscription not found',
		})
	}

	const access = accessPlan[subscriptionData.plan as Plan]

	return {
		...subscriptionData,
		active: subscriptionData.status === 'active',
		access,
	}
}

const getAvailableCrateProject = async (userId: string, sub: Subscription): Promise<Project> => {
	const projectsData = await db.query.projects.findMany({
		where: eq(projects.organizationId, userId),
	})

	const isCreateProjects = sub.access.availableServer > projectsData.length

	return {
		isCreateProjects,
		countProjects: projectsData.length,
		projects: projectsData,
	}
}

const getUser = async (userId: string): Promise<UserRecord> => {
	const userData = await db.query.user.findFirst({
		where: eq(user.id, userId),
	})

	if (!userData) {
		throw new TRPCError({
			code: 'NOT_FOUND',
			message: 'User not found',
		})
	}

	return userData
}

export const findUserWithSubById = async (
	userId: string,
): Promise<{ user: UserRecord, subscription: Subscription, project: Project }> => {
	const [user, subscription] = await Promise.all([
		getUser(userId),
		getSubscription(userId),
	])

	const project = await getAvailableCrateProject(userId, subscription)

	return {
		user, subscription, project,
	}
}

export const findUserById = async (
	userId: string,
): Promise<UserRecord> => {

	return await getUser(userId)
}

export const findOrganizationById = async (organizationId: string) => {
	const organizationResult = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		with: {
			owner: true,
		},
	})
	return organizationResult
}

export const isAdminPresent = async () => {
	const admin = await db.query.member.findFirst({
		where: eq(member.role, 'owner'),
	})

	if (!admin) {
		return false
	}
	return true
}

export const findOwner = async () => {
	const admin = await db.query.member.findFirst({
		where: eq(member.role, 'owner'),
		with: {
			user: true,
		},
	})

	if (!admin) {
		throw new TRPCError({
			code: 'NOT_FOUND',
			message: 'Admin not found',
		})
	}
	return admin
}

export const getUserByToken = async (token: string) => {
	const userResult = await db.query.invitation.findFirst({
		where: eq(invitation.id, token),
		columns: {
			id: true,
			email: true,
			status: true,
			expiresAt: true,
			role: true,
			inviterId: true,
		},
	})

	if (!userResult) {
		throw new TRPCError({
			code: 'NOT_FOUND',
			message: 'Invitation not found',
		})
	}

	const userAlreadyExists = await db.query.user.findFirst({
		where: eq(user.email, userResult?.email || ''),
	})

	const {expiresAt, ...rest} = userResult
	return {
		...rest,
		isExpired: userResult.expiresAt < new Date(),
		userAlreadyExists: !!userAlreadyExists,
	}
}

export const removeUserById = async (userId: string) => {
	await db
		.delete(user)
		.where(eq(user.id, userId))
		.returning()
		.then((res) => res[0])
}

export const getDokployUrl = async () => {
	if (IS_CLOUD) {
		return 'https://app.dokploy.com'
	}
	const settings = await getWebServerSettings()

	if (settings?.host) {
		const protocol = settings?.https ? 'https' : 'http'
		return `${protocol}://${settings?.host}`
	}
	return `http://${settings?.serverIp}:${process.env.PORT}`
}

const TRUSTED_ORIGINS_CACHE_TTL_MS = 30 * 60_000
let trustedOriginsCache: { data: string[]; expiresAt: number } | null = null

export const getTrustedOrigins = async () => {
	const runQuery = async () => {
		const rows = await db
			.select({trustedOrigins: user.trustedOrigins})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.role, 'owner'))
		return Array.from(new Set(rows.flatMap((r) => r.trustedOrigins ?? [])))
	}

	if (IS_CLOUD) {
		const now = Date.now()
		if (trustedOriginsCache && now < trustedOriginsCache.expiresAt) {
			return trustedOriginsCache.data
		}
		try {
			const trustedOrigins = await runQuery()
			trustedOriginsCache = {
				data: trustedOrigins,
				expiresAt: now + TRUSTED_ORIGINS_CACHE_TTL_MS,
			}
			return trustedOrigins
		} catch (error) {
			console.error('Failed to fetch trusted origins:', error)
			return trustedOriginsCache?.data ?? []
		}
	}

	try {
		return await runQuery()
	} catch (error) {
		console.error('Failed to fetch trusted origins:', error)
		return []
	}
}

export const getTrustedProviders = async () => {
	try {
		const providers = await db.query.ssoProvider.findMany()
		return providers.map((provider) => provider.providerId)
	} catch (error) {
		return []
	}
}
