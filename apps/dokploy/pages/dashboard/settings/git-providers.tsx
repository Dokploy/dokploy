import { ShowGitProviders } from "@/components/dashboard/settings/git/show-git-providers";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

import { appRouter } from "@/server/api/root";
import { validateRequest } from "@dokploy/server";
import { PERMISSIONS } from "@dokploy/server/lib/permissions";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowGitProviders />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Git Providers">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const { req, res } = ctx;
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
	await helpers.user.get.prefetch();
	try {
		await helpers.project.all.prefetch();
		await helpers.settings.isCloud.prefetch();
		if (user.role?.name === "member" || !user?.role?.isSystem) {
			if (
				!user?.role?.permissions?.includes(
					PERMISSIONS.GIT_PROVIDERS.ACCESS.name,
				)
			) {
				return {
					redirect: {
						permanent: true,
						destination: "/",
					},
				};
			}
		}
		return {
			props: {
				trpcState: helpers.dehydrate(),
			},
		};
	} catch {
		return {
			props: {},
		};
	}
}
