import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowInvitations } from "@/components/dashboard/settings/users/show-invitations";
import { ShowUsers } from "@/components/dashboard/settings/users/show-users";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { ManageCustomRoles } from "@/components/proprietary/roles/manage-custom-roles";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Page = () => {
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const isOwnerOrAdmin = auth?.role === "owner" || auth?.role === "admin";
	const canCreateMembers = permissions?.member.create ?? false;

	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowUsers />
			{canCreateMembers && <ShowInvitations />}
			{isOwnerOrAdmin && <ManageCustomRoles />}
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Users">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

	if (!user) {
		return {
			redirect: {
				permanent: true,
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

	try {
		await helpers.user.get.prefetch();
		await helpers.settings.isCloud.prefetch();

		const userPermissions = await helpers.user.getPermissions.fetch();

		if (!userPermissions?.member.read) {
			return {
				redirect: {
					permanent: true,
					destination: "/",
				},
			};
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
