import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { ShowManagedServers } from "@/components/dashboard/settings/billing/show-managed-servers";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

const Page = () => {
	return <ShowManagedServers />;
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Managed Servers">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext,
) {
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/home",
			},
		};
	}
	const { user } = await validateRequest(ctx.req);
	if (!user || user.role !== "owner") {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}
	return { props: {} };
}
