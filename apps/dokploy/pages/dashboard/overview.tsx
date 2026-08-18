import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowOverviewBackups } from "@/components/dashboard/overview/show-overview-backups";
import { ShowOverviewDeployments } from "@/components/dashboard/overview/show-overview-deployments";
import { ShowOverviewDomains } from "@/components/dashboard/overview/show-overview-domains";
import { ShowOverviewServices } from "@/components/dashboard/overview/show-overview-services";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const DEFAULT_TAB = "services";

const Overview = () => {
	const router = useRouter();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canSeeBackups =
		!!permissions?.backup.read && !!permissions?.volumeBackup.read;
	const canSeeDomains = !!permissions?.domain.read;
	const canSeeDeployments = !!permissions?.deployment.read;

	const queryTab =
		typeof router.query.tab === "string" ? router.query.tab : DEFAULT_TAB;
	const activeTab =
		(queryTab === "backups" && !canSeeBackups) ||
		(queryTab === "domains" && !canSeeDomains) ||
		(queryTab === "deployments" && !canSeeDeployments)
			? DEFAULT_TAB
			: queryTab;

	const setTab = (value: string) => {
		const { tab: _current, subtab: _subtab, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query: value === DEFAULT_TAB ? query : { ...query, tab: value },
			},
			undefined,
			{ shallow: true },
		);
	};

	return (
		<Tabs value={activeTab} onValueChange={setTab}>
			<TabsList>
				<TabsTrigger value="services">Services</TabsTrigger>
				{canSeeBackups && <TabsTrigger value="backups">Backups</TabsTrigger>}
				{canSeeDomains && <TabsTrigger value="domains">Domains</TabsTrigger>}
				{canSeeDeployments && (
					<TabsTrigger value="deployments">Deployments</TabsTrigger>
				)}
			</TabsList>
			<TabsContent value="services">
				<ShowOverviewServices />
			</TabsContent>
			{canSeeBackups && (
				<TabsContent value="backups">
					<ShowOverviewBackups />
				</TabsContent>
			)}
			{canSeeDomains && (
				<TabsContent value="domains">
					<ShowOverviewDomains />
				</TabsContent>
			)}
			{canSeeDeployments && (
				<TabsContent value="deployments">
					<ShowOverviewDeployments />
				</TabsContent>
			)}
		</Tabs>
	);
};

export default Overview;

Overview.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
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
		const userPermissions = await helpers.user.getPermissions.fetch();

		if (!userPermissions?.service.read) {
			return {
				redirect: {
					permanent: false,
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
