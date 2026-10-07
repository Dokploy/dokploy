import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowDnsZones } from "@/components/dashboard/settings/dns/show-dns-zones";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";

interface Props {
	dnsProviderId: string;
}

const Page = ({ dnsProviderId }: Props) => {
	return <ShowDnsZones dnsProviderId={dnsProviderId} />;
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="DNS Providers">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ dnsProviderId: string }>,
) {
	const { req, res, params } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user || user.role === "member" || !params?.dnsProviderId) {
		return {
			redirect: {
				permanent: false,
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
	await helpers.user.get.prefetch();
	await helpers.settings.isCloud.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			dnsProviderId: params.dnsProviderId,
		},
	};
}
