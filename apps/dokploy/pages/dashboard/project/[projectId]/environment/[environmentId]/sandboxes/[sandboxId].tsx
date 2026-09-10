import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { ArrowLeft, Box, Skull, Trash2 } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { ExtendSandboxTimeout } from "@/components/dashboard/sandbox/extend-sandbox-timeout";
import { SandboxConsole } from "@/components/dashboard/sandbox/sandbox-console";
import { SandboxStatusBadge } from "@/components/dashboard/sandbox/sandbox-status-badge";
import { formatExpiresIn } from "@/components/dashboard/sandbox/show-sandboxes";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AdvanceBreadcrumb } from "@/components/shared/advance-breadcrumb";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
	<div className="flex flex-col gap-1">
		<span className="text-xs uppercase tracking-wide text-muted-foreground">
			{label}
		</span>
		<span className="text-sm font-medium break-all">{value}</span>
	</div>
);

const SandboxPage = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { sandboxId } = props;
	const router = useRouter();
	const utils = api.useUtils();
	const { projectId, environmentId } = router.query as {
		projectId: string;
		environmentId: string;
	};
	const { data, refetch } = api.sandbox.one.useQuery(
		{ sandboxId },
		{ refetchInterval: 10_000 },
	);
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { mutateAsync: kill, isPending: isKilling } =
		api.sandbox.kill.useMutation();
	const { mutateAsync: remove } = api.sandbox.remove.useMutation();
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";
	const listHref = `/dashboard/project/${projectId}/environment/${environmentId}/sandboxes`;
	const isRunning = data?.status === "running";

	return (
		<div className="pb-10">
			<AdvanceBreadcrumb />
			<Head>
				<title>
					Sandbox: {data?.name} - {data?.environment?.project?.name} | {appName}
				</title>
			</Head>
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row flex-wrap justify-between items-start gap-4">
						<div className="flex flex-col gap-2">
							<CardTitle className="text-xl flex items-center gap-2">
								<Box className="size-6 text-muted-foreground" />
								{data?.name}
								{data && <SandboxStatusBadge status={data.status} />}
							</CardTitle>
							<span className="text-sm text-muted-foreground font-mono">
								{data?.sandboxId}
							</span>
						</div>
						<div className="flex flex-col items-end gap-2">
							<Badge>{data?.server?.name || "Dokploy Server"}</Badge>
							<div className="flex flex-wrap gap-2 justify-end">
								<Link href={listHref}>
									<Button variant="outline">
										<ArrowLeft className="size-4" />
										Sandboxes
									</Button>
								</Link>
								{isRunning && permissions?.deployment.create && (
									<ExtendSandboxTimeout
										sandboxId={sandboxId}
										currentTimeoutMs={data?.timeoutMs ?? 300_000}
									/>
								)}
								{isRunning && permissions?.deployment.create && (
									<DialogAction
										title="Kill sandbox"
										description="The container will be stopped and removed. Files inside it are lost."
										onClick={async () => {
											await kill({ sandboxId })
												.then(async () => {
													toast.success("Sandbox killed");
													await refetch();
												})
												.catch(() => toast.error("Error killing the sandbox"));
										}}
									>
										<Button variant="destructive" isLoading={isKilling}>
											<Skull className="size-4" />
											Kill
										</Button>
									</DialogAction>
								)}
								{permissions?.service.delete && (
									<DialogAction
										title="Delete sandbox"
										description="Removes the sandbox record (and its container if still running)."
										onClick={async () => {
											await remove({ sandboxId })
												.then(async () => {
													toast.success("Sandbox deleted");
													await utils.sandbox.list.invalidate({
														environmentId,
													});
													router.push(listHref);
												})
												.catch(() => toast.error("Error deleting the sandbox"));
										}}
									>
										<Button variant="ghost" size="icon">
											<Trash2 className="size-4 text-destructive" />
										</Button>
									</DialogAction>
								)}
							</div>
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-6 py-8 border-t">
						<Card className="bg-background">
							<CardHeader>
								<CardTitle className="text-xl">Details</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
								<Field label="Image" value={data?.image} />
								<Field label="Template" value={data?.template ?? "custom"} />
								<Field label="CPU" value={`${data?.cpu} vCPU`} />
								<Field label="Memory" value={`${data?.memoryMb} MB`} />
								<Field label="PIDs limit" value={data?.pidsLimit} />
								<Field label="Network" value={data?.networkMode} />
								<Field label="Workdir" value={data?.workdir} />
								<Field label="User" value={data?.user ?? "image default"} />
								<Field
									label="Timeout"
									value={`${Math.round((data?.timeoutMs ?? 0) / 60_000)} min`}
								/>
								<Field
									label="Expires"
									value={
										data ? formatExpiresIn(data.expiresAt, data.status) : "—"
									}
								/>
								<Field
									label="Created"
									value={data ? <DateTooltip date={data.createdAt} /> : "—"}
								/>
								<Field
									label="Container"
									value={
										<span className="font-mono text-xs">
											{data?.containerId?.slice(0, 12) ?? "—"}
										</span>
									}
								/>
							</CardContent>
						</Card>
						{permissions?.deployment.create && (
							<SandboxConsole
								sandboxId={sandboxId}
								enabled={isRunning}
								workdir={data?.workdir ?? "/"}
							/>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

export default SandboxPage;
SandboxPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ sandboxId: string }>,
) {
	const { params, req, res } = ctx;
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
	if (typeof params?.sandboxId === "string") {
		try {
			await helpers.sandbox.one.fetch({ sandboxId: params.sandboxId });
			return {
				props: {
					trpcState: helpers.dehydrate(),
					sandboxId: params.sandboxId,
				},
			};
		} catch {
			return { redirect: { permanent: false, destination: "/" } };
		}
	}
	return { redirect: { permanent: false, destination: "/" } };
}
