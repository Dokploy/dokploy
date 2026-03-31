import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { Rocket } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { ShowDeploymentsTable } from "@/components/dashboard/deployments/show-deployments-table";
import { ShowQueueTable } from "@/components/dashboard/deployments/show-queue-table";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = ["deployments", "queue"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isValidTab(t: string): t is TabValue {
	return TAB_VALUES.includes(t as TabValue);
}

function DeploymentsPage() {
	const router = useRouter();
	const tab =
		router.query.tab && isValidTab(router.query.tab as string)
			? (router.query.tab as TabValue)
			: "deployments";

	const setTab = (value: string) => {
		if (!isValidTab(value)) return;
		router.replace(
			{ pathname: "/dashboard/deployments", query: { tab: value } },
			undefined,
			{ shallow: true },
		);
	};

	return (
		<>
			<BreadcrumbSidebar
				list={[{ name: "Deployments", href: "/dashboard/deployments" }]}
			/>
			<div className="w-full">
				<div className="flex justify-between gap-4 w-full items-center flex-wrap">
					<div className="flex flex-col gap-1.5">
						<h2 className="text-2xl font-semibold tracking-tight flex flex-row gap-2">
							<Rocket className="size-6 text-muted-foreground self-center" />
							Deployments
						</h2>
						<p className="text-sm text-muted-foreground">
							All application and compose deployments in one place.
						</p>
					</div>
				</div>
				<div className="pt-6">
					<Tabs value={tab} onValueChange={setTab} className="w-full">
						<TabsList>
							<TabsTrigger value="deployments">Deployments</TabsTrigger>
							<TabsTrigger value="queue">Queue</TabsTrigger>
						</TabsList>
						<TabsContent value="deployments">
							<ShowDeploymentsTable />
						</TabsContent>
						<TabsContent value="queue">
							<ShowQueueTable />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</>
	);
}

export default DeploymentsPage;

DeploymentsPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	const canView = await hasPermission(
		{
			user: { id: user.id },
			session: { activeOrganizationId: session?.activeOrganizationId || "" },
		},
		{ deployment: ["read"] },
	);

	if (!canView) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/projects",
			},
		};
	}

	return {
		props: {},
	};
}
