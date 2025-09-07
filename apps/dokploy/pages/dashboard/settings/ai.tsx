import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { AiForm } from "@/components/dashboard/settings/ai-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<AiForm />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
	const locale = getLocale(req.cookies);

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

	await helpers.settings.isCloud.prefetch();

	await helpers.user.get.prefetch();

	if (!user || user.role === "member") {
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
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}
