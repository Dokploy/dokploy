import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { Users } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import superjson from "superjson";
import { AddInvitation } from "@/components/dashboard/settings/users/add-invitation";
import { ShowInvitations } from "@/components/dashboard/settings/users/show-invitations";
import { ShowUsers } from "@/components/dashboard/settings/users/show-users";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { HandleCustomRole, ManageCustomRoles } from "@/components/proprietary/roles/manage-custom-roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const TAB_VALUES = ["users", "invitations", "roles"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isValidTab(t: string): t is TabValue {
	return TAB_VALUES.includes(t as TabValue);
}

const Page = () => {
	const router = useRouter();
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const isOwnerOrAdmin = auth?.role === "owner" || auth?.role === "admin";
	const canCreateMembers = permissions?.member.create ?? false;

	const tab =
		router.query.tab && isValidTab(router.query.tab as string)
			? (router.query.tab as TabValue)
			: "users";

	const setTab = (value: string) => {
		if (!isValidTab(value)) return;
		router.replace(
			{ pathname: "/dashboard/settings/users", query: { tab: value } },
			undefined,
			{ shallow: true },
		);
	};

	return (
		<div className="w-full">
			<div className="flex justify-between gap-4 w-full items-center flex-wrap mb-6">
				<div className="flex flex-col gap-1.5">
					<h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						<Users className="size-6 text-muted-foreground self-center" />
						Team
					</h2>
					<p className="text-sm text-muted-foreground">
						Manage users, invitations, and roles for your organization.
					</p>
				</div>
				<div>
					{tab === "invitations" && canCreateMembers && <AddInvitation />}
					{tab === "roles" && isOwnerOrAdmin && <HandleCustomRole />}
				</div>
			</div>
			<Tabs value={tab} onValueChange={setTab} className="w-full">
				<TabsList>
					<TabsTrigger value="users">Users</TabsTrigger>
					{canCreateMembers && (
						<TabsTrigger value="invitations">Invitations</TabsTrigger>
					)}
					{isOwnerOrAdmin && (
						<TabsTrigger value="roles">Roles</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="users">
					<ShowUsers />
				</TabsContent>
				{canCreateMembers && (
					<TabsContent value="invitations">
						<ShowInvitations />
					</TabsContent>
				)}
				{isOwnerOrAdmin && (
					<TabsContent value="roles">
						<ManageCustomRoles />
					</TabsContent>
				)}
			</Tabs>
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
