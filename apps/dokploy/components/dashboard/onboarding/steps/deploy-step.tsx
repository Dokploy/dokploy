import copy from "copy-to-clipboard";
import {
	ArrowUpRightIcon,
	CheckCircle2,
	CopyIcon,
	Loader2,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { displayFont } from "../font";

interface Props {
	environmentId?: string;
	onNext: () => void;
	/** Drops the onboarding wizard's display serif for callers (e.g. the
	 * post-checkout welcome modal) that want the app's regular typography. */
	plainTitle?: boolean;
}

const CURATED_TEMPLATES = [
	{ id: "wordpress", name: "WordPress", logo: "wordpress.png" },
	{ id: "ghost", name: "Ghost", logo: "ghost.jpeg" },
	{ id: "n8n", name: "n8n", logo: "n8n.png" },
	{ id: "uptime-kuma", name: "Uptime Kuma", logo: "uptime-kuma.png" },
];

type Deploying = { kind: "app" | "template"; id: string; url: string };

export const DeployStep = ({ environmentId, onNext, plainTitle }: Props) => {
	const titleClassName = plainTitle
		? "text-xl font-semibold tracking-tight"
		: `${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`;
	const { data: isCloud = true } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const serverId = servers?.[0]?.serverId;

	const [deploying, setDeploying] = useState<Deploying | null>(null);
	const [starting, setStarting] = useState<string | null>(null);

	const { mutateAsync: deployNginx } =
		api.application.deployNginxQuickstart.useMutation();
	const { mutateAsync: deployTemplate } =
		api.compose.deployTemplate.useMutation();
	const { mutateAsync: deployCompose } = api.compose.deploy.useMutation();
	const utils = api.useUtils();

	const { data: application } = api.application.one.useQuery(
		{ applicationId: deploying?.id ?? "" },
		{
			enabled: deploying?.kind === "app",
			refetchInterval: (query) => {
				const status = query.state.data?.applicationStatus;
				return status === "done" || status === "error" ? false : 2500;
			},
		},
	);
	const { data: compose } = api.compose.one.useQuery(
		{ composeId: deploying?.id ?? "" },
		{
			enabled: deploying?.kind === "template",
			refetchInterval: (query) => {
				const status = query.state.data?.composeStatus;
				return status === "done" || status === "error" ? false : 2500;
			},
		},
	);

	const status =
		deploying?.kind === "app"
			? application?.applicationStatus
			: compose?.composeStatus;

	if (!environmentId || (isCloud && !serverId)) {
		return (
			<div className="flex flex-col gap-8">
				<div className="flex flex-col gap-4">
					<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
						First deploy
					</span>
					<h1 className={titleClassName}>Deploy something.</h1>
				</div>
				<AlertBlock type="info" className="max-w-md">
					{isCloud
						? "You'll need a project and a connected server before deploying — you can do that anytime from the dashboard."
						: "You'll need a project before deploying — you can do that anytime from the dashboard."}
				</AlertBlock>
				<Button onClick={onNext} className="w-fit px-8">
					Continue
				</Button>
			</div>
		);
	}

	const handleNginx = async () => {
		setStarting("nginx");
		try {
			const res = await deployNginx({ environmentId, serverId });
			setDeploying({ kind: "app", id: res.applicationId, url: res.domainUrl });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error deploying the app",
			);
		} finally {
			setStarting(null);
		}
	};

	const handleTemplate = async (id: string) => {
		setStarting(id);
		try {
			const composeResult = await deployTemplate({
				environmentId,
				serverId,
				id,
			});
			await deployCompose({ composeId: composeResult.composeId });
			const domains = await utils.domain.byComposeId.fetch({
				composeId: composeResult.composeId,
			});
			const host = domains?.[0]?.host;
			setDeploying({
				kind: "template",
				id: composeResult.composeId,
				url: host ? `http://${host}` : "",
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error deploying the template",
			);
		} finally {
			setStarting(null);
		}
	};

	if (deploying) {
		const isDone = status === "done";
		const isError = status === "error";

		return (
			<div className="flex flex-col gap-8">
				<div className="flex flex-col gap-4">
					<span
						className={`font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 ${
							isError ? "text-destructive" : "text-primary"
						}`}
					>
						{isDone ? (
							<CheckCircle2 className="size-3.5" />
						) : isError ? (
							<XCircleIcon className="size-3.5" />
						) : (
							<Loader2 className="size-3.5 animate-spin" />
						)}
						{isDone ? "Live" : isError ? "Deploy failed" : "Deploying"}
					</span>
					<h1 className={titleClassName}>
						{isDone
							? "It's live."
							: isError
								? "Something went wrong."
								: "Building your app..."}
					</h1>
					<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
						{isDone
							? "Your app is up and reachable at:"
							: isError
								? "The deployment failed — you can check the logs from the dashboard later."
								: "This usually takes a minute or two the first time."}
					</p>
				</div>

				{isDone && deploying.url ? (
					<div className="flex flex-col rounded-2xl border overflow-hidden max-w-md">
						<div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
							<span className="size-2 rounded-full bg-green-500 shrink-0" />
							<span className="font-mono text-xs text-muted-foreground">
								Reachable now
							</span>
						</div>
						<div className="flex items-center justify-between gap-3 p-5">
							<span className="font-mono text-sm truncate">
								{deploying.url}
							</span>
							<div className="flex items-center gap-1 shrink-0">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => {
										copy(deploying.url);
										toast.success("Copied to clipboard");
									}}
								>
									<CopyIcon className="size-4" />
								</Button>
								<Button variant="ghost" size="icon" asChild>
									<a href={deploying.url} target="_blank" rel="noreferrer">
										<ArrowUpRightIcon className="size-4" />
									</a>
								</Button>
							</div>
						</div>
					</div>
				) : !isDone && !isError ? (
					<div className="rounded-2xl border p-5 max-w-md">
						<div className="flex items-center gap-3 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin shrink-0" />
							Waiting for the build to finish...
						</div>
					</div>
				) : null}

				<Button
					onClick={onNext}
					className="w-fit px-8"
					disabled={!isDone && !isError}
				>
					Continue
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					First deploy
				</span>
				<h1 className={titleClassName}>Ship something.</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					Pick a quickstart — we'll generate a domain and deploy it for you.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
				<button
					type="button"
					onClick={handleNginx}
					disabled={!!starting}
					className="flex flex-col items-start justify-between gap-8 bg-background p-7 text-left hover:bg-muted/40 transition-colors disabled:opacity-60"
				>
					<div>
						<p className="font-medium">Simple app</p>
						<p className="text-sm text-muted-foreground mt-1">
							A "Hello World" demo app, live in seconds.
						</p>
					</div>
					<span className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
						{starting === "nginx" ? (
							<>
								<Loader2 className="size-3.5 animate-spin" />
								Starting...
							</>
						) : (
							"Deploy now →"
						)}
					</span>
				</button>

				<div className="flex flex-col justify-between gap-8 bg-background p-7">
					<div>
						<p className="font-medium">Docker Compose template</p>
						<p className="text-sm text-muted-foreground mt-1">
							Popular open source stacks, one click away.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						{CURATED_TEMPLATES.map((template) => (
							<Button
								key={template.id}
								variant="outline"
								size="sm"
								disabled={!!starting}
								isLoading={starting === template.id}
								onClick={() => handleTemplate(template.id)}
								className="justify-start"
							>
								<img
									src={`https://templates.dokploy.com/blueprints/${template.id}/${template.logo}`}
									alt={template.name}
									className="size-4 object-contain shrink-0"
								/>
								{template.name}
							</Button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};
