import copy from "copy-to-clipboard";
import {
	CheckCircle2,
	CheckIcon,
	CircleIcon,
	CopyIcon,
	Loader2,
	XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	CONNECT_FAILURES,
	CONNECT_STEPS,
	type ConnectFailKind,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { BackLink, ScreenHeading } from "./screen-heading";
import { trackOnboarding } from "./track";

const SERVER_NAME = "My first server";
const STORAGE_KEY = "dokploy-onboarding-connect";
const SETUP_STEP = CONNECT_STEPS.length - 1;
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

type Phase = "waiting" | "resuming" | "setup" | "installing" | "failed";

type PendingCommand = { sshKeyId: string; token: string; expiresAt: number };

const isFresh = (pending: PendingCommand) =>
	pending.expiresAt * 1000 > Date.now();

// Kept across reloads so each visit doesn't create another SSH key.
const readPending = (): PendingCommand | null => {
	try {
		const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
		return stored && isFresh(stored) ? stored : null;
	} catch {
		return null;
	}
};

const storePending = (pending: PendingCommand | null) => {
	try {
		if (pending) {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
		} else {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	} catch {}
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colors
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

const isConnectFailKind = (
	value: string | null | undefined,
): value is ConnectFailKind => !!value && value in CONNECT_FAILURES;

interface Props {
	onBack: () => void;
	onConnected: () => void;
}

export const ConnectScreen = ({ onBack, onConnected }: Props) => {
	const { data: existingServers } = api.server.all.useQuery();
	const {
		mutateAsync: generateCommand,
		isError: generateFailed,
		error: generateError,
	} = api.server.generateConnectCommand.useMutation();

	const [phase, setPhase] = useState<Phase>("waiting");
	const [serverId, setServerId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingCommand | null>(null);
	const [copied, setCopied] = useState(false);
	const isGenerating = useRef(false);

	const generate = async () => {
		if (isGenerating.current) return;
		isGenerating.current = true;
		try {
			const result = await generateCommand({
				name: SERVER_NAME,
				onboarding: true,
			});
			const next = {
				sshKeyId: result.sshKeyId,
				token: result.token,
				expiresAt: result.expiresAt,
			};
			storePending(next);
			setPending(next);
		} catch {
		} finally {
			isGenerating.current = false;
		}
	};

	useEffect(() => {
		if (!existingServers || existingServers.length > 0 || pending) return;
		const stored = readPending();
		if (stored) {
			setPending(stored);
		} else {
			generate();
		}
	}, [existingServers, pending]);

	useEffect(() => {
		if (!pending || serverId) return;
		const timeout = setTimeout(
			() => {
				storePending(null);
				setPending(null);
			},
			Math.max(pending.expiresAt * 1000 - Date.now(), 0),
		);
		return () => clearTimeout(timeout);
	}, [pending, serverId]);

	const command = pending
		? `curl -fsSL "${window.location.origin}/api/connect/${pending.token}?setup=true" | sudo bash`
		: "";

	const isWaiting = phase === "waiting" && !!pending && !serverId;
	const { data: connected } = api.server.connectStatus.useQuery(
		{ sshKeyId: pending?.sshKeyId ?? "" },
		{ enabled: isWaiting, refetchInterval: 3000 },
	);
	const { data: connectFailure } = api.server.connectFailure.useQuery(
		undefined,
		{ enabled: isWaiting, refetchInterval: 3000 },
	);

	useEffect(() => {
		if (!connected || serverId) return;
		storePending(null);
		setServerId(connected.serverId);
		setPhase("setup");
	}, [connected]);

	// A server added in an earlier visit only needs its install finished.
	useEffect(() => {
		const existing = existingServers?.[0];
		if (existing && !serverId && phase === "waiting") {
			setServerId(existing.serverId);
			setPhase("resuming");
		}
	}, [existingServers]);

	const { refetch: validate } = api.server.validate.useQuery(
		{ serverId: serverId ?? "" },
		{ enabled: false, retry: false },
	);

	const isInstalling = phase === "setup" || phase === "installing";
	const { data: setup, refetch: refetchSetup } = api.server.setupLog.useQuery(
		{ serverId: serverId ?? "" },
		{
			enabled: !!serverId && (isInstalling || phase === "failed"),
			refetchInterval: isInstalling ? 2000 : false,
		},
	);
	const setupStatus = setup?.status;
	const setupLog = (setup?.log ?? "").replace(ANSI_PATTERN, "").trim();
	const logRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
	}, [setupLog]);

	useEffect(() => {
		if (phase !== "resuming" || !serverId) return;
		const resume = async () => {
			const { data: previous } = await refetchSetup();
			if (previous?.status === "done") {
				onConnected();
				return;
			}
			setPhase(previous?.status === "running" ? "setup" : "installing");
		};
		resume();
	}, [phase, serverId]);

	const failSetup = () => setPhase("failed");

	const finishSetup = async () => {
		const { data: validation } = await validate();
		if (validation?.docker?.enabled && validation.isDokployNetworkInstalled) {
			onConnected();
			return;
		}
		failSetup();
	};

	api.server.setupWithLogs.useSubscription(
		{ serverId: serverId ?? "" },
		{
			enabled: !!serverId && phase === "installing",
			onData(log) {
				if (typeof log !== "string") return;
				if (log.includes("Setup Server:")) {
					finishSetup();
				} else if (log.includes("❌")) {
					failSetup();
				}
			},
			onError: failSetup,
		},
	);

	useEffect(() => {
		if (phase !== "setup") return;
		if (setupStatus === "done") finishSetup();
		if (setupStatus === "error") failSetup();
	}, [phase, setupStatus]);

	useEffect(() => {
		if (!isInstalling) return;
		const timeout = setTimeout(failSetup, SETUP_TIMEOUT_MS);
		return () => clearTimeout(timeout);
	}, [phase]);

	useEffect(() => {
		if (!copied) return;
		const timeout = setTimeout(() => setCopied(false), 1800);
		return () => clearTimeout(timeout);
	}, [copied]);

	const failKind: ConnectFailKind | null =
		phase === "failed"
			? "setup"
			: isWaiting && isConnectFailKind(connectFailure)
				? connectFailure
				: null;
	const failure = failKind ? CONNECT_FAILURES[failKind] : null;
	const activeStep = isInstalling ? SETUP_STEP : 0;
	const isBusy = isInstalling || phase === "resuming";
	const showSteps = isBusy || !!failure;

	return (
		<section className="flex flex-col gap-10">
			<div className="flex flex-col gap-6">
				<BackLink onClick={onBack} />
				<ScreenHeading eyebrow="Connect" title="Connect your server.">
					One command: paste it on your server and Dokploy finds it by itself.
					Dokploy checks the server first and installs Docker for you.
				</ScreenHeading>
			</div>

			{!serverId && (
				<div className="flex flex-col gap-3">
					<span className="font-medium">Run this on your server as root</span>
					<div className="overflow-hidden rounded-xl border bg-zinc-950 text-zinc-100">
						<div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
							<span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
								Terminal
							</span>
							<button
								type="button"
								disabled={!command}
								onClick={() => {
									copy(command);
									setCopied(true);
									trackOnboarding("connect_command_copied");
								}}
								className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
							>
								{copied ? (
									<CheckIcon className="size-3" />
								) : (
									<CopyIcon className="size-3" />
								)}
								{copied ? "Copied" : "Copy"}
							</button>
						</div>
						<code className="block overflow-x-auto whitespace-nowrap px-4 py-3.5 font-mono text-sm">
							<span className="select-none text-zinc-500">$ </span>
							{command ||
								(generateFailed
									? "No command yet"
									: "Generating your command…")}
						</code>
					</div>
					{generateFailed && !command ? (
						<div
							role="alert"
							className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
						>
							<span className="text-destructive">
								{generateError?.message ?? "Couldn't generate the command."}
							</span>
							<Button size="sm" variant="outline" onClick={generate}>
								Try again
							</Button>
						</div>
					) : (
						<span className="text-sm text-muted-foreground">
							It adds Dokploy's public SSH key and tells Dokploy where the
							server is. Dokploy then installs Docker for you and shows the
							progress here. It works once and expires in 1 hour.
						</span>
					)}
				</div>
			)}

			{isWaiting && !failure && (
				<div
					className="flex items-center gap-3 rounded-2xl border p-5 text-sm"
					aria-live="polite"
				>
					<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
					<div className="flex flex-col">
						<span className="font-medium">Waiting for your server…</span>
						<span className="text-muted-foreground">
							This page updates by itself when the command runs.
						</span>
					</div>
				</div>
			)}

			{showSteps && (
				<div
					className="flex flex-col overflow-hidden rounded-2xl border"
					aria-live="polite"
				>
					<div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
						<span
							className={cn(
								"size-2 shrink-0 rounded-full",
								failure ? "bg-destructive" : "animate-pulse bg-amber-400",
							)}
						/>
						<span className="font-mono text-xs text-muted-foreground">
							{failure
								? "Setup stopped"
								: isInstalling
									? "Installing on your server"
									: "Checking your server"}
						</span>
					</div>
					<ul className="flex flex-col gap-3 p-5">
						{CONNECT_STEPS.map((label, index) => {
							const bad = index === failure?.step;
							const done = failure ? index < failure.step : index < activeStep;
							const active = !failure && isBusy && index === activeStep;
							return (
								<li
									key={label}
									className={cn(
										"flex items-center gap-2.5 text-sm",
										!done && !active && !bad && "text-muted-foreground",
									)}
								>
									{bad ? (
										<XCircle className="size-4 shrink-0 text-destructive" />
									) : done ? (
										<CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-500" />
									) : active ? (
										<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
									) : (
										<CircleIcon className="size-4 shrink-0 text-muted-foreground/40" />
									)}
									<span>{label}</span>
									{active && index === SETUP_STEP && (
										<span className="text-xs text-muted-foreground">
											This takes a few minutes
										</span>
									)}
								</li>
							);
						})}
					</ul>
					{serverId && setupLog && (
						<pre
							ref={logRef}
							aria-label="Setup log"
							className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t bg-zinc-950 px-5 py-4 font-mono text-xs leading-relaxed text-zinc-300"
						>
							{setupLog}
						</pre>
					)}
					{failure && (
						<div
							role="alert"
							className="flex flex-col gap-3 border-t bg-destructive/5 p-5"
						>
							<span className="font-medium">{failure.title}</span>
							<span className="text-sm text-muted-foreground">
								{failure.body}
							</span>
							<ol className="flex flex-col gap-2 text-sm">
								{failure.fix.map((step, index) => (
									<li key={step} className="flex gap-4">
										<span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
											{String(index + 1).padStart(2, "0")}
										</span>
										{step}
									</li>
								))}
							</ol>
							{failKind === "setup" ? (
								<Button
									className="mt-1 w-fit"
									onClick={() => setPhase("installing")}
								>
									I fixed it, check again
								</Button>
							) : (
								<span className="mt-1 text-xs text-muted-foreground">
									This page updates by itself when the command runs again. We've
									emailed you these steps too.
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	);
};
