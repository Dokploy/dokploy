import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { Box } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Head from "next/head";
import type { ReactElement } from "react";
import superjson from "superjson";
import { AddSandbox } from "@/components/dashboard/sandbox/add-sandbox";
import { ShowSandboxes } from "@/components/dashboard/sandbox/show-sandboxes";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

const SandboxesPage = () => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";

	return (
		<div className="pb-10">
			<Head>
				<title>Sandboxes | {appName}</title>
			</Head>
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row flex-wrap justify-between items-center gap-4">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl flex items-center gap-2">
								<Box className="size-6 text-muted-foreground" />
								Sandboxes
							</CardTitle>
							<CardDescription>
								Ephemeral containers for agents and automations.
							</CardDescription>
						</div>
						{permissions?.sandbox.create && <AddSandbox />}
					</CardHeader>
					<CardContent className="py-8 border-t">
						<ShowSandboxes />
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

export default SandboxesPage;
SandboxesPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/" } };
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
	try {
		await helpers.sandbox.list.fetch();
		return { props: { trpcState: helpers.dehydrate() } };
	} catch {
		return { redirect: { permanent: false, destination: "/" } };
	}
}
