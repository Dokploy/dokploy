import { validateRequest } from "@dokploy/server/lib/auth";
import { Layers } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { ShowServicesTable } from "@/components/dashboard/services/show-services-table";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

function ServicesPage() {
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl min-h-[45vh]">
				<div className="rounded-xl bg-background shadow-md h-full">
					<CardHeader>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="text-xl font-bold flex items-center gap-2">
									<Layers className="size-5" />
									Services
								</CardTitle>
								<CardDescription>
									All services across projects and environments in one place.
								</CardDescription>
							</div>
						</div>
						<div className="mt-4 min-w-0">
							<ShowServicesTable />
						</div>
					</CardHeader>
				</div>
			</Card>
		</div>
	);
}

export default ServicesPage;

ServicesPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { user } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
