import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowDestinations } from "@/components/dashboard/settings/ssh-keys/show-ssh-keys";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowDestinations />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="SSH Keys">{page}</DashboardLayout>;
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

	try {
		await helpers.project.all.prefetch();
		await helpers.settings.isCloud.prefetch();

		if (user.role === "member") {
			const userR = await helpers.user.one.fetch({
				userId: user.id,
			});

			if (!userR?.canAccessToSSHKeys) {
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
