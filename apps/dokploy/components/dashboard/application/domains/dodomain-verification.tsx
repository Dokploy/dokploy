import {
	CheckCircle2,
	Clock,
	Copy,
	Link2,
	Loader2,
	RefreshCw,
	Search,
	Send,
	XCircle,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	DoDomainMark,
	PoweredByDoDomain,
} from "@/components/dashboard/settings/integrations/dodomain/dodomain-logo";
import { INTEGRATION_LEARN_MORE_URLS } from "@/components/dashboard/settings/integrations/integration-links";
import { LearnMoreLink } from "@/components/shared/learn-more-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type RouterOutputs } from "@/utils/api";

type ConnectSession = RouterOutputs["dodomain"]["createConnectSession"];
type HostCheck = RouterOutputs["dodomain"]["checkDomain"];

/** Whether the organization has DoDomain connected (safe for any member). */
export const useDoDomainConfigured = () => {
	const { data } = api.dodomain.configured.useQuery(undefined, {
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});
	return data?.configured ?? false;
};

/**
 * Hosts an end user can connect through DoDomain: a concrete hostname the
 * customer owns (not a wildcard, not a generated sslip.io/traefik.me name).
 */
export const isDoDomainConnectableHost = (host: string) => {
	const value = host.trim().toLowerCase();
	return (
		value.includes(".") &&
		!value.includes("*") &&
		!value.endsWith(".sslip.io") &&
		!value.endsWith(".traefik.me")
	);
};

const copyToClipboard = async (text: string, what: string) => {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} copied to clipboard`);
	} catch {
		toast.error(`Could not copy the ${what.toLowerCase()}`, {
			description: text,
		});
	}
};

/** Domain-row badge for the DoDomain verification state (hidden when unset). */
export const DoDomainVerificationBadge = ({
	status,
	verifiedAt,
}: {
	status: string | null | undefined;
	verifiedAt?: Date | string | null;
}) => {
	if (!status || status === "unverified") return null;
	const config =
		status === "verified"
			? {
					icon: <CheckCircle2 className="size-3 mr-1" />,
					label: "DNS verified",
					className: "bg-green-500/10 text-green-600 dark:text-green-400",
					tip: verifiedAt
						? `DoDomain verified the DNS records on ${new Date(verifiedAt).toLocaleString()}.`
						: "DoDomain verified the DNS records.",
				}
			: status === "pending"
				? {
						icon: <Clock className="size-3 mr-1" />,
						label: "Awaiting domain owner",
						className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
						tip: "A connect link was sent. The domain is verified once its owner finishes the DoDomain flow.",
					}
				: {
						icon: <XCircle className="size-3 mr-1" />,
						label: "DNS verification failed",
						className: "bg-red-500/10 text-red-500",
						tip: "DoDomain reported the DNS records no longer match (or the connect attempt failed). Send a new connect link or re-verify.",
					};
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant="outline" className={config.className}>
						{config.icon}
						{config.label}
					</Badge>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p>{config.tip}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

/** Shows a freshly created connect link with the records it will set. */
export const DoDomainConnectLinkDialog = ({
	host,
	session,
	open,
	onOpenChange,
}: {
	host: string;
	session: ConnectSession | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => (
	<Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="sm:max-w-xl">
			<DialogHeader>
				<DialogTitle>Connect link for {host}</DialogTitle>
				<DialogDescription>
					Send this link to the owner of the domain. They sign in to their DNS
					provider (or follow the guided steps) and DoDomain sets the records
					below. Dokploy is notified and applies the domain once DNS verifies.
				</DialogDescription>
			</DialogHeader>
			{session && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-row items-center gap-2 rounded-md border p-2">
						<span className="flex-1 break-all font-mono text-xs">
							{session.connectUrl}
						</span>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label="Copy connect link"
							onClick={() =>
								copyToClipboard(session.connectUrl, "Connect link")
							}
						>
							<Copy className="size-4" />
						</Button>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-sm font-medium">Records requested</span>
						<ul className="flex flex-col gap-1 rounded-md bg-muted p-2 font-mono text-xs">
							{session.records.map((record) => (
								<li key={`${record.type}-${record.host}-${record.value}`}>
									{record.type} {record.host === "@" ? host : record.host} →{" "}
									{record.value}
								</li>
							))}
						</ul>
					</div>
					{session.warnings.length > 0 && (
						<ul className="flex flex-col gap-1 text-xs text-yellow-600 dark:text-yellow-400">
							{session.warnings.map((warning) => (
								<li key={`${warning.code}-${warning.fqdn}`}>
									{warning.message}
								</li>
							))}
						</ul>
					)}
					<span className="text-xs text-muted-foreground">
						The link expires on {new Date(session.expiresAt).toLocaleString()}.
					</span>
					<div className="flex flex-row items-center justify-between gap-2">
						<LearnMoreLink href={INTEGRATION_LEARN_MORE_URLS.dodomain} />
						<PoweredByDoDomain />
					</div>
				</div>
			)}
		</DialogContent>
	</Dialog>
);

/** Creates a connect session for a saved domain and shows the link. */
export const useDoDomainConnectLink = (onChanged?: () => void) => {
	const [session, setSession] = useState<ConnectSession | null>(null);
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, isPending } =
		api.dodomain.createConnectSession.useMutation();

	const send = async (domainId: string) => {
		await mutateAsync({ domainId })
			.then(async (created) => {
				setSession(created);
				setOpen(true);
				await utils.dodomain.connectionStatus.invalidate({ domainId });
				onChanged?.();
			})
			.catch((e) => {
				toast.error("Error creating the DoDomain connect link", {
					description: e.message,
				});
			});
	};

	return { send, isPending, session, open, setOpen };
};

/**
 * Row menu for a saved domain: send a connect link, copy the current one,
 * or ask DoDomain to recheck the DNS of an existing connection.
 */
export const DoDomainDomainActions = ({
	domainId,
	host,
	connectionId,
	onChanged,
}: {
	domainId: string;
	host: string;
	connectionId?: string | null;
	onChanged?: () => void;
}) => {
	const utils = api.useUtils();
	const connectLink = useDoDomainConnectLink(onChanged);
	const { mutateAsync: reverify, isPending: isReverifying } =
		api.dodomain.reverify.useMutation();

	const handleCopy = async () => {
		await utils.dodomain.connectionStatus
			.fetch({ domainId })
			.then(async (status) => {
				if (!status?.connectUrl) {
					toast.error("No active connect link", {
						description:
							status?.status === "verified"
								? "This domain is already verified."
								: "The last link expired or none was sent. Use Send connect link.",
					});
					return;
				}
				await copyToClipboard(status.connectUrl, "Connect link");
			})
			.catch((e) => {
				toast.error("Error loading the connect link", {
					description: e.message,
				});
			});
	};

	const handleReverify = async () => {
		await reverify({ domainId })
			.then(() => {
				toast.success("Recheck requested", {
					description:
						"DoDomain rechecks the DNS now; the badge updates when its result arrives.",
				});
			})
			.catch((e) => {
				toast.error("Error requesting a recheck", { description: e.message });
			});
	};

	const busy = connectLink.isPending || isReverifying;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-sky-500/10"
						aria-label="DoDomain actions"
						isLoading={busy}
					>
						<Link2 className="size-4 text-primary group-hover:text-sky-500" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel className="flex flex-row items-center gap-2">
						<DoDomainMark className="size-4" />
						DoDomain
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => connectLink.send(domainId)}>
						<Send className="size-4" />
						Send connect link
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={handleCopy}>
						<Copy className="size-4" />
						Copy connect link
					</DropdownMenuItem>
					<DropdownMenuItem disabled={!connectionId} onSelect={handleReverify}>
						<RefreshCw className="size-4" />
						Re-verify DNS
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DoDomainConnectLinkDialog
				host={host}
				session={connectLink.session}
				open={connectLink.open}
				onOpenChange={connectLink.setOpen}
			/>
		</>
	);
};

/** "Send connect link" button for the domain dialog (edit mode). */
export const DoDomainSendConnectLinkButton = ({
	domainId,
	host,
	onChanged,
	children,
}: {
	domainId: string;
	host: string;
	onChanged?: () => void;
	children?: ReactNode;
}) => {
	const connectLink = useDoDomainConnectLink(onChanged);
	return (
		<>
			<Button
				type="button"
				variant="outline"
				isLoading={connectLink.isPending}
				onClick={() => connectLink.send(domainId)}
			>
				{children ?? (
					<>
						<Send className="size-4" />
						Send connect link
					</>
				)}
			</Button>
			<DoDomainConnectLinkDialog
				host={host}
				session={connectLink.session}
				open={connectLink.open}
				onOpenChange={connectLink.setOpen}
			/>
		</>
	);
};

const METHOD_LABEL: Record<HostCheck["method"], string> = {
	oauth: "One-click connect (Cloudflare sign-in)",
	"domain-connect": "Domain Connect with the DNS provider",
	guided: "Guided manual DNS setup",
};

/**
 * "Check DNS" for the host field: asks DoDomain which provider hosts the
 * domain and how its owner will connect it.
 */
export const DoDomainHostCheck = ({ host }: { host: string }) => {
	const [result, setResult] = useState<HostCheck | null>(null);
	const [checkedHost, setCheckedHost] = useState<string | null>(null);
	const { mutateAsync, isPending } = api.dodomain.checkDomain.useMutation();
	const connectable = isDoDomainConnectableHost(host);

	const handleCheck = async () => {
		setResult(null);
		await mutateAsync({ host })
			.then((check) => {
				setResult(check);
				setCheckedHost(host);
			})
			.catch((e) => {
				toast.error("Error checking the domain", { description: e.message });
			});
	};

	const shown = result && checkedHost === host ? result : null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-row items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!connectable || isPending}
					onClick={handleCheck}
				>
					{isPending ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Search className="size-3.5" />
					)}
					Check DNS
				</Button>
				<span className="text-xs text-muted-foreground">
					{connectable
						? "See which DNS provider hosts this domain and how its owner connects it."
						: "Enter a full hostname (no wildcard) to check it with DoDomain."}
				</span>
			</div>
			{shown && (
				<div className="flex flex-col gap-1 rounded-md border p-3 text-xs">
					<span className="text-sm font-medium">
						{shown.label}
						{shown.confidence !== "high" && (
							<span className="font-normal text-muted-foreground">
								{" "}
								({shown.confidence} confidence)
							</span>
						)}
					</span>
					<span>
						{METHOD_LABEL[shown.method]}
						{shown.method === "domain-connect" &&
							shown.domainConnect.providerName &&
							` (${shown.domainConnect.providerName})`}
					</span>
					<span className="text-muted-foreground">
						Zone <span className="font-mono">{shown.zone}</span>
						{shown.nameServers.length > 0 && (
							<>
								{" · "}nameservers{" "}
								<span className="font-mono">
									{shown.nameServers.join(", ")}
								</span>
							</>
						)}
					</span>
					<div className="flex flex-row items-center justify-between gap-2 pt-1">
						<LearnMoreLink href={INTEGRATION_LEARN_MORE_URLS.dodomain} />
						<PoweredByDoDomain />
					</div>
				</div>
			)}
		</div>
	);
};
