import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { Rocket } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { ShowDeploymentsTable } from "@/components/dashboard/deployments/show-deployments-table";
import { ShowQueueTable } from "@/components/dashboard/deployments/show-queue-table";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = ["deployments", "queue"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isValidTab(t: string): t is TabValue {
	return TAB_VALUES.includes(t as TabValue);
}

function DeploymentsPage() {
	const t = useTranslations();
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
		<div className="flex flex-1 flex-col w-full">
			<Card className="flex flex-1 flex-col bg-sidebar p-2.5 rounded-xl">
				<div className="flex flex-1 flex-col rounded-xl bg-background shadow-md">
				<CardHeader className="flex flex-1 flex-col">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="text-xl font-bold flex items-center gap-2">
									<Rocket className="size-5" />
									{t("deployments.title")}
								</CardTitle>
								<CardDescription>
									{t("deployments.description")}
								</CardDescription>
							</div>
						</div>
						<Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col w-full">
							<TabsList className="mt-2">
								<TabsTrigger value="deployments">
									{t("deployments.tabs.deployments")}
								</TabsTrigger>
								<TabsTrigger value="queue">
									{t("deployments.tabs.queue")}
								</TabsTrigger>
							</TabsList>
						<TabsContent value="deployments" className="flex flex-1 flex-col mt-0 pt-4">
							<ShowDeploymentsTable />
						</TabsContent>
						<TabsContent value="queue" className="flex flex-1 flex-col mt-0 pt-4">
							<ShowQueueTable />
							</TabsContent>
						</Tabs>
					</CardHeader>
				</div>
			</Card>
		</div>
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
