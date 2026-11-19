import { formatDistanceToNow } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import { ArrowRight, Rocket, Server } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/utils/api";

type DeploymentStatus = "idle" | "running" | "done" | "error";

const statusDotClass: Record<string, string> = {
	done: "bg-emerald-500",
	running: "bg-amber-500",
	error: "bg-red-500",
	idle: "bg-muted-foreground/40",
};

function getServiceInfo(d: any) {
	const app = d.application;
	const comp = d.compose;
	const serverName: string =
		d.server?.name ?? app?.server?.name ?? comp?.server?.name ?? "Dokploy";
	if (app?.environment?.project && app.environment) {
		return {
			name: app.name as string,
			environment: app.environment.name as string,
			projectName: app.environment.project.name as string,
			serverName,
			href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
		};
	}
	if (comp?.environment?.project && comp.environment) {
		return {
			name: comp.name as string,
			environment: comp.environment.name as string,
			projectName: comp.environment.project.name as string,
			serverName,
			href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
		};
	}
	return null;
}

function StatCard({
	label,
	value,
	delta,
	href,
}: {
	label: string;
	value: string;
	delta?: string;
	href?: string;
}) {
	const content = (
		<div
			className={`rounded-xl border bg-background p-5 min-h-[140px] flex flex-col justify-between h-full ${
				href ? "transition-colors hover:bg-muted/40 cursor-pointer" : ""
			}`}
		>
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

	if (href) {
		return (
			<Link href={href} className="block h-full">
				{content}
			</Link>
		);
	}

	return content;
}

function StatusListCard({
	label,
	items,
}: {
	label: string;
	items: { dotClass: string; label: string; count: number }[];
}) {
	return (
		<div className="rounded-xl border bg-background p-5 min-h-[140px] flex flex-col gap-3">
			<span className="text-xs uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			<ul className="flex flex-col gap-1.5">
				{items.map((item) => (
					<li key={item.label} className="flex items-center gap-2.5 text-sm">
						<span
							className={`size-2 rounded-full shrink-0 ${item.dotClass}`}
							aria-hidden
						/>
						<span className="font-semibold tabular-nums w-8">{item.count}</span>
						<span className="text-muted-foreground">{item.label}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export const ShowHome = () => {
	const { t, i18n } = useTranslation();
	const { data: auth } = api.user.get.useQuery();
	const { data: homeStats } = api.project.homeStats.useQuery();
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

	const totals = homeStats ?? {
		projects: 0,
		environments: 0,
		applications: 0,
		compose: 0,
		databases: 0,
		services: 0,
	};
	const statusBreakdown = homeStats?.status ?? {
		running: 0,
		error: 0,
		idle: 0,
	};

	const recentDeployments = useMemo(() => {
		if (!deployments) return [];
		return [...deployments]
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
			.slice(0, 10);
	}, [deployments]);

	const deployStats = useMemo(() => {
		const now = Date.now();
		const weekMs = 7 * 24 * 60 * 60 * 1000;
		const lastStart = now - weekMs;
		const prevStart = now - 2 * weekMs;

		const last: NonNullable<typeof deployments> = [];
		const prev: NonNullable<typeof deployments> = [];
		for (const d of deployments ?? []) {
			const ts = new Date(d.createdAt).getTime();
			if (ts >= lastStart) last.push(d);
			else if (ts >= prevStart) prev.push(d);
		}

		const lastCount = last.length;
		const prevCount = prev.length;
		let delta: string | undefined;
		if (prevCount > 0) {
			const pct = Math.round(((lastCount - prevCount) / prevCount) * 100);
			delta = t("dashboard.home.deploysDeltaVsPrev", {
				pct: `${pct >= 0 ? "+" : ""}${pct}`,
			});
		} else if (lastCount > 0) {
			delta = t("dashboard.home.deploysNoPriorData");
		} else {
			delta = t("dashboard.home.deploysNoActivityYet");
		}

		return { value: String(lastCount), delta };
	}, [deployments, t]);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl min-h-[85vh]">
				<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-6 h-full">
					<div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
						<h1 className="text-3xl font-semibold tracking-tight">
							{firstName
								? t("dashboard.home.welcomeBack", { name: firstName })
								: t("dashboard.home.welcomeBackPlain")}
						</h1>
						<Button asChild variant="secondary" className="w-fit">
							<Link href="/dashboard/projects">
								{t("dashboard.home.goToProjects")}
								<ArrowRight className="size-4" />
							</Link>
						</Button>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<StatCard
							label={t("dashboard.home.statProjects")}
							value={String(totals.projects)}
							delta={t("dashboard.home.environments", {
								count: totals.environments,
							})}
							href="/dashboard/projects"
						/>
						<StatCard
							label={t("dashboard.home.statServices")}
							value={String(totals.services)}
							delta={t("dashboard.home.servicesSummary", {
								applications: totals.applications,
								compose: totals.compose,
								databases: totals.databases,
							})}
						/>
						<StatCard
							label={t("dashboard.home.statDeploys")}
							value={deployStats.value}
							delta={deployStats.delta}
						/>
						<StatusListCard
							label={t("dashboard.home.status")}
							items={[
								{
									dotClass: "bg-emerald-500",
									label: t("dashboard.home.running"),
									count: statusBreakdown.running,
								},
								{
									dotClass: "bg-red-500",
									label: t("dashboard.home.errored"),
									count: statusBreakdown.error,
								},
								{
									dotClass: "bg-muted-foreground/40",
									label: t("dashboard.home.idle"),
									count: statusBreakdown.idle,
								},
							]}
						/>
					</div>

					<div className="rounded-xl border bg-background">
						<div className="flex items-center justify-between px-5 py-4 border-b">
							<div className="flex items-center gap-2">
								<Rocket className="size-4 text-muted-foreground" />
								<h2 className="text-sm font-semibold">
									{t("dashboard.home.recentDeployments")}
								</h2>
							</div>
							{canReadDeployments && (
								<Link
									href="/dashboard/overview?tab=deployments"
									className="text-xs text-muted-foreground hover:text-foreground transition-colors"
								>
									{t("dashboard.home.viewAll")}
								</Link>
							)}
						</div>
						{!canReadDeployments ? (
							<div className="min-h-[400px] flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground p-10">
								<Rocket className="size-8 opacity-40" />
								<span>{t("dashboard.home.noDeploymentsPermission")}</span>
							</div>
						) : recentDeployments.length === 0 ? (
							<div className="min-h-[400px] flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground p-10">
								<Rocket className="size-8 opacity-40" />
								<span>{t("dashboard.home.noDeploymentsYet")}</span>
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
												<span className="text-xs text-muted-foreground w-36 hidden lg:flex items-center justify-end gap-1.5 truncate">
													<Server className="size-3 shrink-0" />
													<span className="truncate">{info.serverName}</span>
												</span>
												<span className="text-xs text-muted-foreground w-20 text-right hidden sm:inline">
													{status}
												</span>
												<span className="text-xs text-muted-foreground w-24 text-right hidden md:inline">
													{formatDistanceToNow(new Date(d.createdAt), {
														addSuffix: true,
														locale: i18n.language?.startsWith("ru") ? ru : enUS,
													})}
												</span>
												<span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
													{t("dashboard.home.logs")}
												</span>
											</Link>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>
			</Card>
		</div>
	);
};
