import { validateRequest } from "@dokploy/server/lib/auth";
import { Rocket } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
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

function DeploymentsPage() {
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-8xl mx-auto min-h-[45vh]">
				<div className="rounded-xl bg-background shadow-md h-full">
					<CardHeader>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="text-xl font-bold flex items-center gap-2">
									<Rocket className="size-5" />
									Deployments
								</CardTitle>
								<CardDescription>
									All application and compose deployments in one place.
								</CardDescription>
							</div>
						</div>
						<Tabs defaultValue="deployments" className="w-full">
							<TabsList className="mt-2">
								<TabsTrigger value="deployments">Deployments</TabsTrigger>
								<TabsTrigger value="queue">Queue</TabsTrigger>
							</TabsList>
							<TabsContent value="deployments" className="mt-0 pt-4">
								<ShowDeploymentsTable />
							</TabsContent>
							<TabsContent value="queue" className="mt-0 pt-4">
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
	const { user } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	return {
		props: {},
	};
}
