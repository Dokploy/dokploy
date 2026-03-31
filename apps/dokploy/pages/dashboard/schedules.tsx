import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { Clock } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { HandleSchedules } from "@/components/dashboard/application/schedules/handle-schedules";
import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { api } from "@/utils/api";

function SchedulesPage() {
	const { data: user } = api.user.get.useQuery();
	return (
		<>
			<BreadcrumbSidebar
				list={[{ name: "Schedules", href: "/dashboard/schedules" }]}
			/>
			<div className="w-full">
				<div className="flex justify-between gap-4 w-full items-center flex-wrap">
					<div className="flex flex-col gap-1.5">
						<h2 className="text-2xl font-semibold tracking-tight flex flex-row gap-2">
							<Clock className="size-6 text-muted-foreground self-center" />
							Scheduled Tasks
						</h2>
						<p className="text-sm text-muted-foreground">
							Schedule tasks to run automatically at specified intervals.
						</p>
					</div>
					<HandleSchedules
						id={user?.user.id || ""}
						scheduleType="dokploy-server"
					/>
				</div>
				<div className="pt-6">
					<ShowSchedules
						scheduleType="dokploy-server"
						id={user?.user.id || ""}
					/>
				</div>
			</div>
		</>
	);
}
export default SchedulesPage;

SchedulesPage.getLayout = (page: ReactElement) => {
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
	if (!user || (user.role !== "owner" && user.role !== "admin")) {
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
