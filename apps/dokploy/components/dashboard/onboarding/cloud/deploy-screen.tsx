import { format } from "date-fns";
import {
	ArrowUpRightIcon,
	BoxIcon,
	CheckCircle2,
	GitBranchIcon,
	Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { ScreenHeading } from "./screen-heading";
import { trackOnboarding } from "./track";

const TEMPLATES = [
	{
		id: "wordpress",
		name: "WordPress",
		descKey: "onboarding.cloud.template.wordpress",
		logo: "wordpress.png",
	},
	{
		id: "n8n",
		name: "n8n",
		descKey: "onboarding.cloud.template.n8n",
		logo: "n8n.png",
	},
	{
		id: "uptime-kuma",
		name: "Uptime Kuma",
		descKey: "onboarding.cloud.template.uptimeKuma",
		logo: "uptime-kuma.png",
	},
	{
		id: "ghost",
		name: "Ghost",
		descKey: "onboarding.cloud.template.ghost",
		logo: "ghost.jpeg",
	},
];

const OWN_OPTIONS = [
	{
		id: "git",
		icon: GitBranchIcon,
		titleKey: "onboarding.cloud.own.git.title",
		descKey: "onboarding.cloud.own.git.desc",
	},
	{
		id: "image",
		icon: BoxIcon,
		titleKey: "onboarding.cloud.own.image.title",
		descKey: "onboarding.cloud.own.image.desc",
	},
];

export interface OnboardingProject {
	projectId: string;
	environmentId: string;
}

interface Props {
	onFinish: (project?: OnboardingProject) => Promise<void>;
	onDeployed: () => void;
}

interface StoredDeploy {
	templateId: string;
	project: OnboardingProject;
	deployment: { composeId: string; url: string };
}

const STORAGE_KEY = "dokploy-onboarding-deploy";

// A reload in the middle of the deploy would otherwise drop the result and
// offer to deploy a second template.
const readStoredDeploy = (): StoredDeploy | null => {
	try {
		return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
	} catch {
		return null;
	}
};

const storeDeploy = (value: StoredDeploy | null) => {
	try {
		if (value) {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} else {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	} catch {}
};

export const DeployScreen = ({ onFinish, onDeployed }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { data: billing } = api.stripe.getBillingStatus.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const serverId = servers?.[0]?.serverId;

	const { mutateAsync: createProject } = api.project.create.useMutation();
	const { mutateAsync: deployTemplate } =
		api.compose.deployTemplate.useMutation();
	const { mutateAsync: deployCompose } = api.compose.deploy.useMutation();

	const [stored] = useState(readStoredDeploy);
	const [templateId, setTemplateId] = useState(stored?.templateId ?? "");
	const [isStarting, setIsStarting] = useState(false);
	const [isLeaving, setIsLeaving] = useState<string | null>(null);
	const [project, setProject] = useState<OnboardingProject | null>(
		stored?.project ?? null,
	);
	const [deployment, setDeployment] = useState<{
		composeId: string;
		url: string;
	} | null>(stored?.deployment ?? null);

	const { data: compose, error: composeError } = api.compose.one.useQuery(
		{ composeId: deployment?.composeId ?? "" },
		{
			enabled: !!deployment,
			refetchInterval: (query) => {
				const status = query.state.data?.composeStatus;
				return status === "done" || status === "error" ? false : 2500;
			},
		},
	);
	const composeCode = composeError?.data?.code;
	const composeDenied =
		composeCode === "UNAUTHORIZED" || composeCode === "FORBIDDEN";
	const composeGone = composeCode === "NOT_FOUND" || composeDenied;
	useEffect(() => {
		if (!composeGone) return;
		storeDeploy(null);
		setDeployment(null);
		if (composeDenied) {
			setProject(null);
			setTemplateId("");
		}
	}, [composeGone, composeDenied]);

	const deployStatus = deployment ? compose?.composeStatus : undefined;

	useEffect(() => {
		if (deployStatus !== "done") return;
		storeDeploy(null);
		trackOnboarding("template_deploy_succeeded", { template: templateId });
		onDeployed();
	}, [deployStatus]);

	const isDeploying =
		!!deployment && deployStatus !== "done" && deployStatus !== "error";
	const template = TEMPLATES.find((item) => item.id === templateId);

	const trialEnd =
		billing?.isOnTrial && billing.trialEndsAt
			? format(billing.trialEndsAt, "MMMM d")
			: null;

	const ensureProject = async () => {
		if (project) return project;
		const existing = await utils.project.all.fetch();
		const first = existing?.[0];
		const firstEnvironment = first?.environments?.[0];
		if (first && firstEnvironment) {
			const found = {
				projectId: first.projectId,
				environmentId: firstEnvironment.environmentId,
			};
			setProject(found);
			return found;
		}
		const result = await createProject({
			name: "My first project",
			description: "",
		});
		await utils.project.all.invalidate();
		const created = {
			projectId: result.project.projectId,
			environmentId: result.environment?.environmentId ?? "",
		};
		setProject(created);
		return created;
	};

	const handleDeploy = async () => {
		if (!template || !serverId) return;
		trackOnboarding("first_deploy_option_chosen", {
			option: "template",
			template: template.id,
		});
		setIsStarting(true);
		try {
			const target = await ensureProject();
			const created = await deployTemplate({
				environmentId: target.environmentId,
				serverId,
				id: template.id,
			});
			await deployCompose({ composeId: created.composeId });
			const domains = await utils.domain.byComposeId.fetch({
				composeId: created.composeId,
			});
			const host = domains?.[0]?.host;
			const started = {
				composeId: created.composeId,
				url: host ? `http://${host}` : "",
			};
			storeDeploy({
				templateId: template.id,
				project: target,
				deployment: started,
			});
			setDeployment(started);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("onboarding.deploy.errorDeployingTemplate"),
			);
		} finally {
			setIsStarting(false);
		}
	};

	const handleOwnCode = async (id: string) => {
		trackOnboarding("first_deploy_option_chosen", { option: id });
		setIsLeaving(id);
		try {
			const target = await ensureProject();
			storeDeploy(null);
			await onFinish(target);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("onboarding.project.errorCreating"),
			);
			setIsLeaving(null);
		}
	};

	const ownOptions = (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
			{OWN_OPTIONS.map((option) => (
				<button
					key={option.id}
					type="button"
					disabled={isLeaving !== null || isStarting || isDeploying}
					onClick={() => handleOwnCode(option.id)}
					className="group flex flex-col items-start justify-between gap-6 bg-background p-6 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
				>
					<div className="flex flex-col gap-3">
						<span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
							<option.icon className="size-5" aria-hidden />
						</span>
						<div>
							<p className="font-medium">{t(option.titleKey)}</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{t(option.descKey)}
							</p>
						</div>
					</div>
					<span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
						{isLeaving === option.id ? (
							<>
								<Loader2 className="size-3.5 animate-spin" />
								{t("onboarding.cloud.opening")}
							</>
						) : (
							t("onboarding.cloud.openMyProject")
						)}
					</span>
				</button>
			))}
		</div>
	);

	if (deployment && deployStatus === "done") {
		return (
			<section className="flex flex-col gap-10">
				<div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none">
					<ConfettiExplosion
						duration={3000}
						force={0.35}
						particleCount={200}
						width={1200}
						zIndex={60}
					/>
				</div>
				<ScreenHeading
					eyebrow={
						<>
							<CheckCircle2 className="size-3.5" />
							{t("onboarding.deploy.statusLive")}
						</>
					}
					title={t("onboarding.cloud.appIsRunning", {
						name: template?.name ?? t("onboarding.cloud.yourApp"),
					})}
				>
					{t("onboarding.cloud.firstDeployWorked")}
				</ScreenHeading>

				{deployment.url && (
					<div className="flex flex-col overflow-hidden rounded-2xl border">
						<div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
							<span className="size-2 shrink-0 rounded-full bg-green-500" />
							<span className="font-mono text-xs text-muted-foreground">
								{t("onboarding.deploy.reachableNow")}
							</span>
						</div>
						<a
							href={deployment.url}
							target="_blank"
							rel="noreferrer"
							className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/40"
						>
							<span className="truncate font-mono text-sm">
								{deployment.url}
							</span>
							<ArrowUpRightIcon className="size-4 shrink-0" />
						</a>
					</div>
				)}

				<div className="flex flex-col gap-4">
					<span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
						{t("onboarding.cloud.nextYourOwnCode")}
					</span>
					{ownOptions}
				</div>

				{trialEnd && (
					<p className="text-sm text-muted-foreground">
						{t("onboarding.cloud.trialRunsUntil", { date: trialEnd })}
					</p>
				)}

				<Button
					size="lg"
					className="w-fit px-8"
					isLoading={isLeaving === "dashboard"}
					onClick={async () => {
						setIsLeaving("dashboard");
						storeDeploy(null);
						await onFinish(project ?? undefined);
					}}
				>
					{t("onboarding.complete.goToProject")}
				</Button>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-10">
			<ScreenHeading
				eyebrow={
					<>
						<CheckCircle2 className="size-3.5" />
						{t("onboarding.cloud.serverConnected")}
					</>
				}
				title={t("onboarding.deploy.shipTitle")}
			>
				{trialEnd
					? t("onboarding.cloud.serverReadyTrial", { date: trialEnd })
					: t("onboarding.cloud.serverReady")}
			</ScreenHeading>

			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
						{t("onboarding.cloud.startFromTemplate")}
					</span>
					<span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-primary-foreground">
						{t("onboarding.cloud.recommended")}
					</span>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
					{TEMPLATES.map((item) => {
						const selected = templateId === item.id;
						return (
							<button
								key={item.id}
								type="button"
								aria-pressed={selected}
								disabled={isStarting || isDeploying}
								onClick={() => setTemplateId(item.id)}
								className={cn(
									"relative flex items-center gap-4 p-5 text-left transition-colors disabled:opacity-60",
									selected ? "bg-muted" : "bg-background hover:bg-muted/40",
								)}
							>
								<span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
									<img
										src={`https://templates.dokploy.com/blueprints/${item.id}/${item.logo}`}
										alt=""
										className="size-5 object-contain"
									/>
								</span>
								<span className="flex flex-col">
									<span className="font-medium">{item.name}</span>
									<span className="text-sm text-muted-foreground">
										{t(item.descKey)}
									</span>
								</span>
								<span
									aria-hidden
									className={cn(
										"ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border",
										selected ? "border-primary" : "border-muted-foreground/40",
									)}
								>
									{selected && (
										<span className="size-2 rounded-full bg-primary" />
									)}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-sm text-muted-foreground">
					{t("onboarding.cloud.oneClickTemplate")}
				</p>
				{deployStatus === "error" && (
					<AlertBlock type="error">
						{t("onboarding.cloud.deployFailedTryAnother")}
					</AlertBlock>
				)}
				{isDeploying ? (
					<div
						className="flex items-center gap-3 rounded-2xl border p-5 text-sm text-muted-foreground"
						aria-live="polite"
					>
						<Loader2 className="size-4 shrink-0 animate-spin" />
						{t("onboarding.cloud.deployingToServer", {
							name: template?.name ?? "",
						})}
					</div>
				) : (
					<Button
						size="lg"
						className="w-fit px-8"
						isLoading={isStarting}
						disabled={!serverId || !template}
						onClick={handleDeploy}
					>
						{template
							? t("onboarding.cloud.deployNamed", { name: template.name })
							: t("onboarding.cloud.pickTemplate")}
					</Button>
				)}
			</div>

			<div className="flex flex-col gap-4 border-t pt-10">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
					{t("onboarding.cloud.orOwnCode")}
				</span>
				{ownOptions}
			</div>
		</section>
	);
};
