import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowHome } from "@/components/dashboard/home/show-home";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";

const Home = () => {
	return <ShowHome />;
};

export default Home;

Home.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	const activeOrganizationId = session?.activeOrganizationId;

	const prefetchTasks: Promise<unknown>[] = [
		helpers.settings.isCloud.prefetch(),
		helpers.user.get.prefetch(),
		helpers.organization.active.prefetch(),
	];

	// Org-scoped queries require an active membership; skipping them avoids
	// UNAUTHORIZED during SSR when the user has no organization selected.
	if (activeOrganizationId) {
		const permissionCtx = {
			user: { id: user.id },
			session: { activeOrganizationId },
		};

		const [canReadDeployments, canReadServers] = await Promise.all([
			hasPermission(permissionCtx, { deployment: ["read"] }),
			hasPermission(permissionCtx, { server: ["read"] }),
		]);

		prefetchTasks.push(
			helpers.user.getPermissions.prefetch(),
			helpers.project.homeStats.prefetch(),
		);

		if (canReadDeployments) {
			prefetchTasks.push(helpers.deployment.homeSummary.prefetch());
		}
		if (canReadServers) {
			prefetchTasks.push(helpers.server.all.prefetch());
		}
	}

	await Promise.all(prefetchTasks);

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
