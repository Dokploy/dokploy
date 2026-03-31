import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { ArrowDownUp } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { ShowRequests } from "@/components/dashboard/requests/show-requests";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

export default function Requests() {
	return (
		<>
			<BreadcrumbSidebar
				list={[{ name: "Requests", href: "/dashboard/requests" }]}
			/>
			<div className="w-full">
				<div className="flex justify-between gap-4 w-full items-center flex-wrap">
					<div className="flex flex-col gap-1.5">
						<h2 className="text-2xl font-semibold tracking-tight flex flex-row gap-2">
							<ArrowDownUp className="size-6 text-muted-foreground self-center" />
							Requests
						</h2>
						<p className="text-sm text-muted-foreground">
							See all the incoming requests that pass through Traefik
						</p>
					</div>
				</div>
				<div className="pt-6">
					<ShowRequests />
				</div>
			</div>
		</>
	);
}
Requests.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
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
