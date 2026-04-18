import { formatDistanceToNow } from "date-fns";
import { Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

type DeploymentStatus = "idle" | "running" | "done" | "error";

const statusDotClass: Record<string, string> = {
	done: "bg-muted-foreground/60",
	running: "bg-amber-500",
	error: "bg-red-500",
	idle: "bg-muted-foreground/30",
};

function getServiceInfo(d: any) {
	const app = d.application;
	const comp = d.compose;
	if (app?.environment?.project && app.environment) {
		return {
			name: app.name as string,
			environment: app.environment.name as string,
			projectName: app.environment.project.name as string,
			href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
		};
	}
	if (comp?.environment?.project && comp.environment) {
		return {
			name: comp.name as string,
			environment: comp.environment.name as string,
			projectName: comp.environment.project.name as string,
			href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
		};
	}
	return null;
}

function StatCard({
	label,
	value,
	delta,
}: {
	label: string;
	value: string;
	delta?: string;
}) {
	return (
		<div className="rounded-xl border bg-background p-5 min-h-[120px] flex flex-col justify-between">
			<span className="text-xs uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			<div className="flex flex-col gap-1">
				<span className="text-3xl font-semibold tracking-tight">{value}</span>
				{delta && (
					<span className="text-xs text-muted-foreground">{delta}</span>
				)}
			</div>
		</div>
	);
}

export const ShowHome = () => {
	const { data: auth } = api.user.get.useQuery();
	const { data: projects } = api.project.all.useQuery();
	const { data: servers } = api.server.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canReadDeployments = !!permissions?.deployment.read;
	const { data: deployments } = api.deployment.allCentralized.useQuery(
		undefined,
		{
			enabled: canReadDeployments,
			refetchInterval: 10000,
		},
	);

	const firstName = auth?.user?.firstName?.trim();

	const { totals, serverCount } = useMemo(() => {
		let applications = 0;
		let compose = 0;
		let databases = 0;
		const dbKeys = [
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"redis",
			"libsql",
		] as const;
		for (const p of projects ?? []) {
			for (const env of p.environments ?? []) {
				applications += env.applications?.length ?? 0;
				compose += env.compose?.length ?? 0;
				for (const key of dbKeys) {
					databases += (env as any)[key]?.length ?? 0;
				}
			}
		}
		return {
			totals: {
				projects: projects?.length ?? 0,
				applications,
				compose,
				databases,
				services: applications + compose + databases,
			},
			serverCount: servers?.length ?? 0,
		};
	}, [projects, servers]);

	const recentDeployments = useMemo(() => {
		if (!deployments) return [];
		return [...deployments]
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
			.slice(0, 10);
	}, [deployments]);

	return (
		<div className="w-full flex flex-col gap-6">
			<div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl font-semibold tracking-tight">
						{firstName ? `Welcome back, ${firstName}` : "Welcome back"}
					</h1>
					<p className="text-sm text-muted-foreground">
						{totals.services} services across {serverCount}{" "}
						{serverCount === 1 ? "server" : "servers"} · {totals.projects}{" "}
						{totals.projects === 1 ? "project" : "projects"}
					</p>
				</div>
				<Button asChild className="w-fit">
					<Link href="/dashboard/projects">
						<Plus className="size-4" />
						New project
					</Link>
				</Button>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard
					label="Deploys / 24h"
					value={String(recentDeployments.length)}
					delta="placeholder"
				/>
				<StatCard label="Avg build" value="—" delta="placeholder" />
				<StatCard label="CPU" value="—" delta="placeholder" />
				<StatCard label="Memory" value="—" delta="placeholder" />
			</div>

			<div className="rounded-xl border bg-background">
				<div className="flex items-center justify-between px-5 py-4 border-b">
					<div className="flex items-center gap-2">
						<Rocket className="size-4 text-muted-foreground" />
						<h2 className="text-sm font-semibold">Recent deployments</h2>
					</div>
					{canReadDeployments && (
						<Link
							href="/dashboard/deployments"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							view all →
						</Link>
					)}
				</div>
				{!canReadDeployments ? (
					<div className="p-10 text-center text-sm text-muted-foreground">
						You do not have permission to view deployments.
					</div>
				) : recentDeployments.length === 0 ? (
					<div className="p-10 text-center text-sm text-muted-foreground">
						No deployments yet.
					</div>
				) : (
					<ul className="divide-y">
						{recentDeployments.map((d) => {
							const info = getServiceInfo(d);
							if (!info) return null;
							const status = (d.status ?? "idle") as DeploymentStatus;
							return (
								<li key={d.deploymentId}>
									<Link
										href={info.href}
										className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
									>
										<span
											className={`size-2 rounded-full shrink-0 ${statusDotClass[status] ?? statusDotClass.idle}`}
											aria-hidden
										/>
										<div className="flex flex-col min-w-0 flex-1">
											<span className="text-sm truncate">{info.name}</span>
											<span className="text-xs text-muted-foreground truncate">
												{info.projectName} · {info.environment}
											</span>
										</div>
										<span className="text-xs text-muted-foreground w-20 text-right hidden sm:inline">
											{status}
										</span>
										<span className="text-xs text-muted-foreground w-24 text-right hidden md:inline">
											{formatDistanceToNow(new Date(d.createdAt), {
												addSuffix: true,
											})}
										</span>
										<span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
											logs →
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
};
