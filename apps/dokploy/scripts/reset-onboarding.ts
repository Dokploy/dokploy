import { findUserById, updateUser } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { member, projects, server, user } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Dev-only utility: resets a test account back to "never onboarded" so the
 * onboarding wizard shows up again (see server/api/routers/project.ts
 * `onboardingStatus` for the exact gate). Not part of the build — never
 * ships in dist, this is strictly a local testing tool.
 *
 * Usage: pnpm reset-onboarding <email>
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

type StripeSubscription = { id: string; status: string };

const cancelActiveSubscriptions = async (stripeCustomerId: string) => {
	if (!STRIPE_SECRET_KEY) {
		console.log("  (STRIPE_SECRET_KEY not set, skipping subscription cleanup)");
		return;
	}

	const listRes = await fetch(
		`https://api.stripe.com/v1/subscriptions?customer=${stripeCustomerId}&status=all`,
		{ headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
	);
	const listBody = (await listRes.json()) as { data?: StripeSubscription[] };
	const cancelable = (listBody.data ?? []).filter(
		(sub) => sub.status !== "canceled",
	);

	if (cancelable.length === 0) {
		console.log("  (no active/trialing subscriptions found)");
		return;
	}

	for (const sub of cancelable) {
		const cancelRes = await fetch(
			`https://api.stripe.com/v1/subscriptions/${sub.id}`,
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
			},
		);
		const cancelled = (await cancelRes.json()) as StripeSubscription;
		console.log(`  - ${cancelled.id} -> ${cancelled.status}`);
	}
};

(async () => {
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email) {
		console.log("Usage: pnpm reset-onboarding <email>");
		process.exit(1);
	}

	const foundUser = await db.query.user.findFirst({
		where: eq(user.email, email),
	});
	if (!foundUser) {
		console.log(`User not found for email: ${email}`);
		process.exit(1);
	}

	console.log(`Resetting onboarding for ${email} (${foundUser.id})`);

	if (foundUser.stripeCustomerId) {
		console.log(
			`Cancelling Stripe subscriptions for ${foundUser.stripeCustomerId}...`,
		);
		await cancelActiveSubscriptions(foundUser.stripeCustomerId);
	}

	const memberships = await db.query.member.findMany({
		where: eq(member.userId, foundUser.id),
	});

	for (const membership of memberships) {
		const deletedProjects = await db
			.delete(projects)
			.where(eq(projects.organizationId, membership.organizationId))
			.returning({ id: projects.projectId, name: projects.name });
		for (const project of deletedProjects) {
			console.log(`  - deleted project "${project.name}" (${project.id})`);
		}

		const deletedServers = await db
			.delete(server)
			.where(eq(server.organizationId, membership.organizationId))
			.returning({ id: server.serverId, name: server.name });
		for (const deletedServer of deletedServers) {
			console.log(
				`  - deleted server "${deletedServer.name}" (${deletedServer.id})`,
			);
		}
	}

	await updateUser(foundUser.id, {
		onboardingCompletedAt: null,
		stripeCustomerId: null,
		// startFreeTrial sets these directly on the user row (not via webhook),
		// so cancelling the subscription above doesn't clear them on its own.
		stripeSubscriptionId: null,
		serversQuantity: 0,
	});

	// Re-fetch to confirm and print the final state.
	const finalUser = await findUserById(foundUser.id);
	console.log("\nDone. Final state:");
	console.log(`  onboardingCompletedAt: ${finalUser.onboardingCompletedAt}`);
	console.log(`  stripeCustomerId: ${finalUser.stripeCustomerId}`);

	process.exit(0);
})().catch((error) => {
	console.error("Error resetting onboarding", error);
	process.exit(1);
});
