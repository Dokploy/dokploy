import { getRootAdminIds } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { session, user } from "@/server/db/schema";

const INACTIVE_MONTHS = 6;

export const deactivateInactiveAccounts = async (now = new Date()) => {
	const cutoff = sql`${now.toISOString()}::timestamp - make_interval(months => ${INACTIVE_MONTHS})`;
	const rootAdminIds = getRootAdminIds();

	return db.transaction(async (tx) => {
		const deactivated = await tx
			.update(user)
			.set({ deactivatedAt: now })
			.where(
				and(
					isNull(user.deactivatedAt),
					sql`coalesce(${user.lastSessionAt}, ${user.createdAt}) <= ${cutoff}`,
					// Fallback in case recording lastSessionAt failed on a refresh.
					sql`not exists (select 1 from "session" s where s."user_id" = ${user.id} and s."impersonated_by" is null and s."updated_at" > ${cutoff})`,
					sql`not exists (select 1 from "apikey" k where k."reference_id" = ${user.id} and k."last_request" > ${cutoff})`,
					isNull(user.stripeSubscriptionId),
					eq(user.isEnterpriseCloud, false),
					...(rootAdminIds.length ? [notInArray(user.id, rootAdminIds)] : []),
					sql`not exists (select 1 from "server" s inner join "organization" o on o."id" = s."organizationId" where o."owner_id" = ${user.id} and s."serverStatus" = 'active')`,
					// Members invited into a paying organization have no plan of their own.
					sql`not exists (
						select 1 from "member" m
						inner join "organization" o on o."id" = m."organization_id"
						inner join "user" owner on owner."id" = o."owner_id"
						where m."user_id" = ${user.id}
							and (owner."stripeSubscriptionId" is not null or owner."isEnterpriseCloud")
					)`,
				),
			)
			.returning({ id: user.id });

		const ids = deactivated.map(({ id }) => id);
		if (ids.length) {
			await tx.delete(session).where(inArray(session.userId, ids));
		}
		return ids.length;
	});
};

export const initInactiveAccountsJob = () => {
	scheduleJob("deactivate-inactive-accounts", "30 3 * * *", async () => {
		try {
			const count = await deactivateInactiveAccounts();
			if (count) console.log(`Deactivated ${count} inactive accounts`);
		} catch (error) {
			console.error("Deactivating inactive accounts failed:", error);
		}
	});
};
