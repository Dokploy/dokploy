import copy from "copy-to-clipboard";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { AU, CA, DE, GB, IN, NL, SG, US } from "country-flag-icons/react/3x2";
import { addDays, format, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	CircleArrowUp,
	Clock,
	Copy,
	Cpu,
	CreditCard,
	FileText,
	HardDrive,
	Loader2,
	Lock,
	MemoryStick,
	Play,
	Plus,
	Power,
	RefreshCw,
	RotateCw,
	Server,
	Shield,
	SquareTerminal,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	ServerServicesList,
	useServerServices,
} from "@/components/dashboard/settings/servers/server-services-list";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";

const navigationItems = [
	{
		name: "Subscription",
		href: "/dashboard/settings/billing",
		icon: CreditCard,
	},
	{
		name: "Cloud Servers",
		href: "/dashboard/settings/cloud-servers",
		icon: Server,
	},
	{
		name: "Invoices",
		href: "/dashboard/settings/invoices",
		icon: FileText,
	},
];

const STATUS_MAP: Record<
	string,
	{
		label: string;
		icon: React.ReactNode;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	pending: {
		label: "Awaiting payment",
		icon: <Clock className="size-3" />,
		variant: "secondary",
	},
	provisioning: {
		label: "Provisioning",
		icon: <Loader2 className="size-3 animate-spin" />,
		variant: "secondary",
	},
	configuring: {
		label: "Installing Dokploy",
		icon: <Loader2 className="size-3 animate-spin" />,
		variant: "secondary",
	},
	ready: {
		label: "Ready",
		icon: <CheckCircle2 className="size-3" />,
		variant: "default",
	},
	upgrading: {
		label: "Upgrading",
		icon: <Loader2 className="size-3 animate-spin" />,
		variant: "secondary",
	},
	error: {
		label: "Error",
		icon: <XCircle className="size-3" />,
		variant: "destructive",
	},
	suspended: {
		label: "Suspended",
		icon: <AlertCircle className="size-3" />,
		variant: "destructive",
	},
	terminating: {
		label: "Terminating",
		icon: <Loader2 className="size-3 animate-spin" />,
		variant: "secondary",
	},
};

const REGION_FLAGS: Record<string, FlagComponent> = {
	AU,
	CA,
	DE,
	GB,
	IN,
	NL,
	SG,
	US,
};

function RegionLabel({
	countryCode,
	name,
}: {
	countryCode?: string | null;
	name: string;
}) {
	const Flag = countryCode ? REGION_FLAGS[countryCode] : undefined;
	return (
		<span className="inline-flex items-center gap-1.5">
			{Flag && (
				<Flag title={name} className="h-3 w-[18px] shrink-0 rounded-[2px]" />
			)}
			{name}
		</span>
	);
}

function PlanSpecs({
	cpus,
	memoryGb,
	storageGb,
}: {
	cpus: number;
	memoryGb: number;
	storageGb: number;
}) {
	const specs = [
		{ icon: Cpu, label: `${cpus} vCPU` },
		{ icon: MemoryStick, label: `${memoryGb} GB RAM` },
		{ icon: HardDrive, label: `${storageGb} GB NVMe` },
	];
	return (
		<ul className="space-y-1 text-xs text-muted-foreground">
			{specs.map(({ icon: Icon, label }) => (
				<li key={label} className="flex items-center gap-1.5">
					<Icon className="size-3.5 shrink-0" />
					{label}
				</li>
			))}
		</ul>
	);
}

function formatPrice(priceCents: number) {
	return `$${(priceCents / 100).toFixed(2)}/mo`;
}

const CONTINENT_ORDER = ["Europe", "Americas", "Asia-Pacific"];

function OrderServerDialog() {
	const [open, setOpen] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState<string>("");
	const [selectedZone, setSelectedZone] = useState<string>("");

	const { data: plans, isLoading: loadingPlans } =
		api.cloudServer.getPlans.useQuery(undefined, { enabled: open });
	const { data: zones, isLoading: loadingZones } =
		api.cloudServer.getDataCenters.useQuery(undefined, { enabled: open });

	const isLoadingOptions = loadingPlans || loadingZones;

	const purchase = api.cloudServer.purchase.useMutation({
		onSuccess: ({ url }) => {
			window.location.href = url;
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const plan = plans?.find((p) => p.id === selectedPlan);
	const selectedZoneInfo = zones?.find((z) => z.id === selectedZone);

	const availableZones = selectedPlan
		? zones?.filter((z) => z.plans.includes(selectedPlan))
		: zones;

	const groupedZones = availableZones?.reduce<Record<string, typeof zones>>(
		(acc, z) => {
			if (!acc[z.continent]) acc[z.continent] = [];
			acc[z.continent]!.push(z);
			return acc;
		},
		{},
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="size-4 mr-2" />
					New Cloud Server
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New Cloud Server</DialogTitle>
					<DialogDescription>
						We'll provision and configure a server for you automatically. Ready
						in ~5 minutes.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-2">
					{isLoadingOptions ? (
						<div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
							<Loader2 className="size-6 animate-spin" />
							<p className="text-sm">Loading available plans...</p>
						</div>
					) : (
						<div className="space-y-5">
							{/* Plan cards */}
							<div className="space-y-2">
								<Label>Plan</Label>
								<div className="grid grid-cols-2 gap-2">
									{plans?.map((p) => (
										<button
											key={p.id}
											type="button"
											onClick={() => {
												setSelectedPlan(p.id);
												const zone = zones?.find((z) => z.id === selectedZone);
												if (zone && !zone.plans.includes(p.id)) {
													setSelectedZone("");
												}
											}}
											className={cn(
												"flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
												selectedPlan === p.id
													? "border-primary bg-primary/5"
													: "border-border hover:border-muted-foreground",
											)}
										>
											<div className="flex items-center justify-between">
												<p className="font-semibold text-sm">{p.name}</p>
												<p className="text-sm font-medium text-primary">
													{formatPrice(p.priceCents)}
												</p>
											</div>
											<PlanSpecs
												cpus={p.cpus}
												memoryGb={p.memoryGb}
												storageGb={p.storageGb}
											/>
										</button>
									))}
								</div>
							</div>

							{/* Zone selector grouped by continent */}
							<div className="space-y-2">
								<Label>Location</Label>
								<Select value={selectedZone} onValueChange={setSelectedZone}>
									<SelectTrigger>
										<SelectValue placeholder="Select a location..." />
									</SelectTrigger>
									<SelectContent
										position="popper"
										side="bottom"
										sideOffset={4}
										className="max-h-64 overflow-y-auto"
									>
										{CONTINENT_ORDER.filter((c) => groupedZones?.[c]).map(
											(continent) => (
												<div key={continent}>
													<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
														{continent}
													</div>
													{groupedZones?.[continent]?.map((z) => (
														<SelectItem key={z.id} value={z.id}>
															<RegionLabel
																countryCode={z.countryCode}
																name={z.description}
															/>
														</SelectItem>
													))}
												</div>
											),
										)}
									</SelectContent>
								</Select>
							</div>

							{plan && selectedZone && (
								<div className="rounded-lg bg-muted p-3 text-sm space-y-1">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Plan</span>
										<span className="font-medium">{plan.name}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">CPU</span>
										<span className="font-medium">{plan.cpus} vCPU</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">RAM</span>
										<span className="font-medium">{plan.memoryGb} GB</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Storage</span>
										<span className="font-medium">
											{plan.storageGb} GB NVMe
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Price</span>
										<span className="font-medium">
											{formatPrice(plan.priceCents)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Zone</span>
										<span className="font-medium">
											<RegionLabel
												countryCode={selectedZoneInfo?.countryCode}
												name={selectedZoneInfo?.description ?? selectedZone}
											/>
										</span>
									</div>
								</div>
							)}

							<Button
								className="w-full"
								disabled={!selectedPlan || !selectedZone || purchase.isPending}
								onClick={() => {
									if (!selectedPlan || !selectedZone) return;
									purchase.mutate({
										plan: selectedPlan,
										zone: selectedZone,
									});
								}}
							>
								{purchase.isPending ? (
									<>
										<Loader2 className="size-4 mr-2 animate-spin" />
										Redirecting to checkout...
									</>
								) : (
									"Continue to payment"
								)}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

const POWER_ACTION_LABELS = {
	reboot: "Restarting",
	shutdown: "Stopping",
	power_on: "Starting",
} as const;

type PowerAction = keyof typeof POWER_ACTION_LABELS;

function PowerControls({
	cloudServerId,
	powerState,
}: {
	cloudServerId: string;
	powerState?: string;
}) {
	const utils = api.useUtils();
	const [pending, setPending] = useState<{
		id: number;
		action: PowerAction;
	} | null>(null);

	const { data: actionStatus } = api.cloudServer.powerActionStatus.useQuery(
		{ cloudServerId, actionId: pending?.id ?? 0 },
		{ enabled: !!pending, refetchInterval: 3000 },
	);

	useEffect(() => {
		if (!pending || !actionStatus || actionStatus.status === "in-progress") {
			return;
		}
		if (actionStatus.status === "errored") {
			toast.error(`${POWER_ACTION_LABELS[pending.action]} the server failed`);
		}
		setPending(null);
		utils.cloudServer.vmInfo.invalidate({ cloudServerId });
	}, [actionStatus, pending, cloudServerId, utils]);

	const powerAction = api.cloudServer.powerAction.useMutation({
		onSuccess: (action, { action: type }) =>
			setPending({ id: action.id, action: type }),
		onError: (err) => toast.error(err.message),
	});

	const run = (action: PowerAction) =>
		powerAction.mutate({ cloudServerId, action });

	if (pending || powerAction.isPending) {
		return (
			<Badge
				variant="secondary"
				className="flex items-center gap-1 text-xs h-5"
			>
				<Loader2 className="size-3 animate-spin" />
				{pending ? POWER_ACTION_LABELS[pending.action] : "Sending"}...
			</Badge>
		);
	}

	if (powerState === "off") {
		return (
			<>
				<Badge variant="outline" className="text-xs h-5">
					Stopped
				</Badge>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm" onClick={() => run("power_on")}>
							<Play className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Start server</TooltipContent>
				</Tooltip>
			</>
		);
	}

	if (powerState !== "active") return null;

	return (
		<>
			<Tooltip>
				<DialogAction
					title="Restart Server"
					description="The server will reboot. Your applications will be unavailable for a minute or two."
					onClick={() => run("reboot")}
				>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm">
							<RotateCw className="size-4" />
						</Button>
					</TooltipTrigger>
				</DialogAction>
				<TooltipContent>Restart server</TooltipContent>
			</Tooltip>
			<Tooltip>
				<DialogAction
					title="Stop Server"
					description="The server will shut down and your applications will be offline until you start it again. Stopped servers are still billed."
					type="destructive"
					onClick={() => run("shutdown")}
				>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm">
							<Power className="size-4" />
						</Button>
					</TooltipTrigger>
				</DialogAction>
				<TooltipContent>Stop server</TooltipContent>
			</Tooltip>
		</>
	);
}

const SUSPENSION_GRACE_DAYS = 7;

const IN_PROGRESS_STATUSES = [
	"pending",
	"provisioning",
	"configuring",
	"upgrading",
	"terminating",
];

type CloudServerItem = RouterOutputs["cloudServer"]["list"][number];
type Plan = RouterOutputs["cloudServer"]["getPlans"][number];

function DetailItem({
	label,
	value,
	copyValue,
}: {
	label: string;
	value: React.ReactNode;
	copyValue?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 min-w-0">
			<span className="text-muted-foreground shrink-0">{label}</span>
			<span className="flex items-center gap-1 font-medium min-w-0">
				<span className="truncate">{value}</span>
				{copyValue && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 shrink-0"
								onClick={() => {
									copy(copyValue);
									toast.success(`${label} copied`);
								}}
							>
								<Copy className="size-3" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Copy {label}</TooltipContent>
					</Tooltip>
				)}
			</span>
		</div>
	);
}

function formatMoney(amount: number, currency: string) {
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	});
	const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
	return formatter.format(amount / 10 ** digits);
}

type FirewallRule = RouterOutputs["cloudServer"]["firewall"]["rules"][number];

const ANYWHERE = ["0.0.0.0/0", "::/0"];

const FIREWALL_PRESETS = [
	{ label: "PostgreSQL", port: "5432" },
	{ label: "MySQL", port: "3306" },
	{ label: "Redis", port: "6379" },
	{ label: "MongoDB", port: "27017" },
];

function formatSources(sources: string[]) {
	return ANYWHERE.every((a) => sources.includes(a)) && sources.length === 2
		? "Anywhere"
		: sources.join(", ");
}

function FirewallRuleRow({
	rule,
	locked,
	onRemove,
}: {
	rule: FirewallRule;
	locked?: boolean;
	onRemove?: () => void;
}) {
	return (
		<div className="grid grid-cols-[80px_120px_1fr_40px] items-center gap-2 px-3 py-2 text-sm">
			<span className="font-medium uppercase">{rule.protocol}</span>
			<span>{rule.protocol === "icmp" ? "—" : rule.ports}</span>
			<span className="truncate text-muted-foreground">
				{formatSources(rule.sources)}
			</span>
			{locked ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Lock className="size-4 text-muted-foreground justify-self-center" />
					</TooltipTrigger>
					<TooltipContent>
						Required by Dokploy to manage this server
					</TooltipContent>
				</Tooltip>
			) : (
				<Button
					variant="ghost"
					size="icon"
					className="size-8 text-destructive hover:text-destructive"
					onClick={onRemove}
				>
					<Trash2 className="size-4" />
				</Button>
			)}
		</div>
	);
}

function FirewallDialog({ cloudServerId }: { cloudServerId: string }) {
	const [open, setOpen] = useState(false);
	const [rules, setRules] = useState<FirewallRule[] | null>(null);
	const [protocol, setProtocol] = useState<"tcp" | "udp" | "icmp">("tcp");
	const [ports, setPorts] = useState("");
	const [sources, setSources] = useState("");

	const { data, isLoading, error } = api.cloudServer.firewall.useQuery(
		{ cloudServerId },
		{ enabled: open, refetchOnWindowFocus: false },
	);

	useEffect(() => {
		if (data && rules === null) setRules(data.rules);
	}, [data, rules]);

	const utils = api.useUtils();
	const onFirewallChanged = (
		result: RouterOutputs["cloudServer"]["firewall"],
		message: string,
	) => {
		setRules(result.rules);
		utils.cloudServer.firewall.setData({ cloudServerId }, result);
		toast.success(message);
	};

	const update = api.cloudServer.updateFirewall.useMutation({
		onSuccess: (result) =>
			onFirewallChanged(
				result,
				data?.enabled ? "Firewall updated" : "Firewall enabled",
			),
		onError: (err) => toast.error(err.message),
	});

	const disable = api.cloudServer.disableFirewall.useMutation({
		onSuccess: (result) => onFirewallChanged(result, "Firewall disabled"),
		onError: (err) => toast.error(err.message),
	});

	const isDirty =
		!!data && !!rules && JSON.stringify(rules) !== JSON.stringify(data.rules);
	const canSave = !!data && (!data.enabled || isDirty);

	const addRule = () => {
		const parsedSources = sources
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const ruleSources = parsedSources.length ? parsedSources : ANYWHERE;
		if (protocol !== "icmp" && !ports.trim()) {
			toast.error("Enter a port or a range, like 8080 or 8000-9000");
			return;
		}
		const rule: FirewallRule =
			protocol === "icmp"
				? { protocol, sources: ruleSources }
				: { protocol, ports: ports.trim(), sources: ruleSources };
		setRules((current) => [...(current ?? []), rule]);
		setPorts("");
		setSources("");
	};

	return (
		<Tooltip>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					setOpen(value);
					if (!value) setRules(null);
				}}
			>
				<DialogTrigger asChild>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm">
							<Shield className="size-4" />
						</Button>
					</TooltipTrigger>
				</DialogTrigger>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Firewall</DialogTitle>
						<DialogDescription>
							Incoming traffic is blocked unless a rule allows it. Outgoing
							traffic is always allowed.
						</DialogDescription>
					</DialogHeader>

					{isLoading || (!rules && !error) ? (
						<div className="flex justify-center py-6">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<p className="text-sm text-destructive">{error.message}</p>
					) : (
						<div className="space-y-4">
							{!data?.enabled && (
								<p className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
									<AlertCircle className="size-4 shrink-0 mt-0.5" />
									No firewall: every port on this server is open. Enable it to
									only allow the ports below.
								</p>
							)}
							<div className="rounded-lg border divide-y">
								<div className="grid grid-cols-[80px_120px_1fr_40px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
									<span>Protocol</span>
									<span>Ports</span>
									<span>Sources</span>
									<span />
								</div>
								{data?.systemRules.map((rule) => (
									<FirewallRuleRow
										key={`system-${rule.protocol}-${"ports" in rule ? rule.ports : ""}`}
										rule={rule}
										locked
									/>
								))}
								{rules?.map((rule, index) => (
									<FirewallRuleRow
										key={`${rule.protocol}-${"ports" in rule ? rule.ports : ""}-${index}`}
										rule={rule}
										onRemove={() =>
											setRules((current) =>
												(current ?? []).filter((_, i) => i !== index),
											)
										}
									/>
								))}
							</div>

							<div className="space-y-2">
								<Label>Add a rule</Label>
								<div className="grid grid-cols-[110px_1fr_1fr_auto] gap-2">
									<Select
										value={protocol}
										onValueChange={(value) =>
											setProtocol(value as "tcp" | "udp" | "icmp")
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="tcp">TCP</SelectItem>
											<SelectItem value="udp">UDP</SelectItem>
											<SelectItem value="icmp">ICMP</SelectItem>
										</SelectContent>
									</Select>
									<Input
										placeholder="5432 or 8000-9000"
										value={ports}
										onChange={(e) => setPorts(e.target.value)}
										disabled={protocol === "icmp"}
									/>
									<Input
										placeholder="Anywhere, or 1.2.3.4, 10.0.0.0/8"
										value={sources}
										onChange={(e) => setSources(e.target.value)}
									/>
									<Button variant="outline" onClick={addRule}>
										<Plus className="size-4" />
									</Button>
								</div>
								<div className="flex flex-wrap gap-1.5">
									{FIREWALL_PRESETS.map((preset) => (
										<Badge
											key={preset.label}
											variant="outline"
											className="cursor-pointer hover:border-primary"
											onClick={() => {
												setProtocol("tcp");
												setPorts(preset.port);
											}}
										>
											{preset.label} {preset.port}
										</Badge>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
									Leave sources empty to allow any IP. Only open database ports
									to the IPs that need them.
								</p>
							</div>
						</div>
					)}

					<DialogFooter className="sm:justify-between">
						<div>
							{data?.enabled && (
								<DialogAction
									title="Disable Firewall"
									description="The firewall will be removed and every port on this server will be open to the internet."
									type="destructive"
									onClick={() => disable.mutate({ cloudServerId })}
								>
									<Button
										variant="ghost"
										className="text-destructive hover:text-destructive"
										disabled={disable.isPending}
									>
										Disable firewall
									</Button>
								</DialogAction>
							)}
						</div>
						<div className="flex gap-2">
							<Button variant="secondary" onClick={() => setOpen(false)}>
								Close
							</Button>
							<Button
								disabled={!canSave || update.isPending}
								onClick={() => {
									if (rules) update.mutate({ cloudServerId, rules });
								}}
							>
								{update.isPending && (
									<Loader2 className="size-4 mr-2 animate-spin" />
								)}
								{data?.enabled ? "Save changes" : "Enable firewall"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<TooltipContent>Firewall</TooltipContent>
		</Tooltip>
	);
}

function UpgradeServerDialog({ cloudServerId }: { cloudServerId: string }) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState("");

	const { data: options, isLoading } = api.cloudServer.upgradeOptions.useQuery(
		{ cloudServerId },
		{ enabled: open },
	);
	const { data: preview, isFetching: isLoadingPreview } =
		api.cloudServer.upgradePreview.useQuery(
			{ cloudServerId, plan: selectedPlan },
			{ enabled: open && !!selectedPlan, refetchOnWindowFocus: false },
		);

	const upgrade = api.cloudServer.upgrade.useMutation({
		onSuccess: () => {
			toast.success(
				"Upgrade started. Your server will be back online in a few minutes.",
			);
			setOpen(false);
			utils.cloudServer.list.invalidate();
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<Tooltip>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					setOpen(value);
					if (!value) setSelectedPlan("");
				}}
			>
				<DialogTrigger asChild>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm">
							<CircleArrowUp className="size-4" />
						</Button>
					</TooltipTrigger>
				</DialogTrigger>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Upgrade Server</DialogTitle>
						<DialogDescription>
							Move this server to a bigger plan. Your IP address, apps and data
							stay the same.
						</DialogDescription>
					</DialogHeader>

					{isLoading ? (
						<div className="flex justify-center py-6">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : !options?.length ? (
						<p className="text-sm text-muted-foreground py-4">
							This server is already on the largest plan available in its
							location.
						</p>
					) : (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-2">
								{options.map((p) => (
									<button
										key={p.id}
										type="button"
										onClick={() => setSelectedPlan(p.id)}
										className={cn(
											"flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
											selectedPlan === p.id
												? "border-primary bg-primary/5"
												: "border-border hover:border-muted-foreground",
										)}
									>
										<div className="flex items-center justify-between">
											<p className="font-semibold text-sm">{p.name}</p>
											<p className="text-sm font-medium text-primary">
												{formatPrice(p.priceCents)}
											</p>
										</div>
										<PlanSpecs
											cpus={p.cpus}
											memoryGb={p.memoryGb}
											storageGb={p.storageGb}
										/>
									</button>
								))}
							</div>

							{selectedPlan && (
								<div className="rounded-lg bg-muted p-3 text-sm space-y-1">
									{isLoadingPreview || !preview ? (
										<div className="flex items-center gap-2 text-muted-foreground">
											<Loader2 className="size-4 animate-spin" />
											Calculating price...
										</div>
									) : (
										<>
											<div className="flex justify-between">
												<span className="text-muted-foreground">
													Due today (prorated)
												</span>
												<span className="font-medium">
													{formatMoney(preview.amountDue, preview.currency)}
												</span>
											</div>
											<div className="flex justify-between">
												<span className="text-muted-foreground">
													Then, per month
												</span>
												<span className="font-medium">
													{formatMoney(
														preview.newMonthlyAmount,
														preview.currency,
													)}
												</span>
											</div>
										</>
									)}
								</div>
							)}

							<p className="flex gap-2 text-xs text-muted-foreground">
								<AlertCircle className="size-4 shrink-0" />
								The server will be offline for a few minutes while it is
								resized. The disk grows with the new plan, so this can't be
								undone.
							</p>
						</div>
					)}

					<DialogFooter>
						<Button variant="secondary" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={!preview || isLoadingPreview || upgrade.isPending}
							onClick={() => {
								if (!preview) return;
								upgrade.mutate({
									cloudServerId,
									plan: selectedPlan,
									prorationDate: preview.prorationDate,
								});
							}}
						>
							{upgrade.isPending && (
								<Loader2 className="size-4 mr-2 animate-spin" />
							)}
							{preview && !isLoadingPreview
								? `Upgrade and pay ${formatMoney(preview.amountDue, preview.currency)}`
								: "Upgrade"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<TooltipContent>Upgrade server</TooltipContent>
		</Tooltip>
	);
}

function TerminateServerDialog({
	serverId,
	serverName,
	onConfirm,
}: {
	serverId: string | null;
	serverName: string;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const { services, isLoading, deletingId, deleteService } = useServerServices(
		serverId ?? "",
		open && !!serverId,
	);
	const hasServices = (services?.length ?? 0) > 0;

	return (
		<Tooltip>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					setOpen(value);
					if (!value) setConfirmation("");
				}}
			>
				<DialogTrigger asChild>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="size-4" />
						</Button>
					</TooltipTrigger>
				</DialogTrigger>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Terminate Server</DialogTitle>
						<DialogDescription>
							This will permanently destroy the server and all data on it. This
							action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					{isLoading ? (
						<div className="flex justify-center py-6">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : hasServices ? (
						<div className="flex flex-col gap-3">
							<AlertBlock type="warning">
								This server has {services?.length} service
								{services?.length === 1 ? "" : "s"}. Delete them or move them to
								another server before terminating it.
							</AlertBlock>
							<ServerServicesList
								services={services ?? []}
								deletingId={deletingId}
								onDelete={deleteService}
							/>
						</div>
					) : (
						<div className="space-y-2">
							<Label className="flex flex-wrap items-center gap-1 leading-relaxed">
								To confirm, type
								<Badge
									variant="outline"
									className="p-2 rounded-md cursor-pointer hover:border-primary"
									onClick={() => {
										copy(serverName);
										toast.success("Copied to clipboard. Be careful!");
									}}
								>
									{serverName}
									<Copy className="size-3.5 ml-1 text-muted-foreground" />
								</Badge>
								in the box below:
							</Label>
							<Input
								value={confirmation}
								onChange={(e) => setConfirmation(e.target.value)}
								placeholder="Enter the server name to confirm"
								autoComplete="off"
							/>
						</div>
					)}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={hasServices || confirmation !== serverName}
							onClick={() => {
								onConfirm();
								setOpen(false);
							}}
						>
							Terminate
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<TooltipContent>Terminate server</TooltipContent>
		</Tooltip>
	);
}

function CloudServerRow({
	server: s,
	plan,
	onReconnect,
	isReconnecting,
	onDelete,
	onUpdatePayment,
	isOpeningPortal,
}: {
	server: CloudServerItem;
	plan?: Plan;
	onReconnect: () => void;
	isReconnecting: boolean;
	onDelete: () => void;
	onUpdatePayment: () => void;
	isOpeningPortal: boolean;
}) {
	const [open, setOpen] = useState(false);
	const status = STATUS_MAP[s.status] ?? STATUS_MAP.error!;
	const hasVm = s.status === "ready" && !!s.providerVmId;

	const { data: vm } = api.cloudServer.vmInfo.useQuery(
		{ cloudServerId: s.cloudServerId },
		{ enabled: hasVm },
	);

	const regionName = vm?.regionName ?? s.regionName;

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border"
		>
			<div className="flex items-center justify-between gap-3 p-4">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-3 text-left flex-1 min-w-0"
					>
						<ChevronRight
							className={cn(
								"size-4 text-muted-foreground shrink-0 transition-transform",
								open && "rotate-90",
							)}
						/>
						<Server className="size-5 text-muted-foreground shrink-0" />
						<div className="space-y-0.5 min-w-0">
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm">
									{plan?.name ?? s.plan}
								</span>
								<Badge
									variant={status?.variant}
									className="flex items-center gap-1 text-xs h-5"
								>
									{status?.icon}
									{status?.label}
								</Badge>
							</div>
							<p className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
								<span className="truncate">
									{[s.hostname, s.ipAddress].filter(Boolean).join(" · ")}
								</span>
								<span>·</span>
								<RegionLabel countryCode={s.countryCode} name={regionName} />
							</p>
							{(s.status === "error" || s.status === "ready") &&
								s.errorMessage && (
									<p className="text-xs text-destructive break-all">
										{s.errorMessage}
									</p>
								)}
							{s.status === "suspended" && s.suspendedAt && (
								<p className="text-xs text-destructive">
									Payment failed. The server is powered off and will be deleted
									on{" "}
									{format(
										addDays(new Date(s.suspendedAt), SUSPENSION_GRACE_DAYS),
										"MMM d, yyyy",
									)}{" "}
									unless the payment is completed.
								</p>
							)}
						</div>
					</button>
				</CollapsibleTrigger>

				<div className="flex items-center gap-2 shrink-0">
					{hasVm && (
						<PowerControls
							cloudServerId={s.cloudServerId}
							powerState={vm?.status}
						/>
					)}
					{hasVm && <FirewallDialog cloudServerId={s.cloudServerId} />}
					{s.status === "ready" && s.stripeSubscriptionId && (
						<UpgradeServerDialog cloudServerId={s.cloudServerId} />
					)}
					{s.status === "suspended" && (
						<Button
							variant="outline"
							size="sm"
							onClick={onUpdatePayment}
							disabled={isOpeningPortal}
						>
							<CreditCard className="size-3.5 mr-1.5" />
							Update payment
						</Button>
					)}
					{s.status === "ready" && !s.serverId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									onClick={onReconnect}
									disabled={isReconnecting}
								>
									{isReconnecting ? (
										<Loader2 className="size-3.5 mr-1.5 animate-spin" />
									) : (
										<RefreshCw className="size-3.5 mr-1.5" />
									)}
									Reconnect
								</Button>
							</TooltipTrigger>
							<TooltipContent>Link this server to Dokploy again</TooltipContent>
						</Tooltip>
					)}
					{s.status === "ready" && s.server && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="outline" size="sm" asChild>
									<Link
										href={`/dashboard/settings/servers?terminal=${s.serverId}`}
									>
										<SquareTerminal className="size-3.5 mr-1.5" />
										Terminal
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Open the server terminal</TooltipContent>
						</Tooltip>
					)}
					{s.status === "pending" ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="text-destructive hover:text-destructive"
									onClick={onDelete}
								>
									<Trash2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Cancel order</TooltipContent>
						</Tooltip>
					) : (
						<TerminateServerDialog
							serverId={s.serverId}
							serverName={s.hostname ?? s.cloudServerId}
							onConfirm={onDelete}
						/>
					)}
				</div>
			</div>

			<CollapsibleContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2 border-t px-4 py-3 text-sm">
					{plan && (
						<>
							<DetailItem label="CPU" value={`${plan.cpus} vCPU`} />
							<DetailItem label="RAM" value={`${plan.memoryGb} GB`} />
							<DetailItem label="Storage" value={`${plan.storageGb} GB NVMe`} />
							<DetailItem label="Price" value={formatPrice(plan.priceCents)} />
						</>
					)}
					<DetailItem
						label="Location"
						value={
							<RegionLabel countryCode={s.countryCode} name={regionName} />
						}
					/>
					{vm && <DetailItem label="OS" value={vm.os} />}
					{s.ipAddress && (
						<>
							<DetailItem
								label="Public IP"
								value={s.ipAddress}
								copyValue={s.ipAddress}
							/>
							<DetailItem
								label="SSH"
								value={
									<code className="text-xs">{`ssh root@${s.ipAddress}`}</code>
								}
								copyValue={`ssh root@${s.ipAddress}`}
							/>
						</>
					)}
					{vm?.privateIp && (
						<DetailItem
							label="Private IP"
							value={vm.privateIp}
							copyValue={vm.privateIp}
						/>
					)}
					<DetailItem
						label="Created"
						value={`${format(new Date(s.createdAt), "MMM d, yyyy")} (${formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })})`}
					/>
					{s.server && (
						<DetailItem
							label="Dokploy server"
							value={
								<Link
									href="/dashboard/settings/servers"
									className="hover:underline"
								>
									{s.server.name}
								</Link>
							}
						/>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export const ShowCloudServers = () => {
	const router = useRouter();
	const utils = api.useUtils();

	const { data: servers, isLoading } = api.cloudServer.list.useQuery(
		undefined,
		{
			refetchInterval: (query) =>
				query.state.data?.some((s) => IN_PROGRESS_STATUSES.includes(s.status))
					? 5000
					: false,
		},
	);

	const { data: plans } = api.cloudServer.getPlans.useQuery(undefined, {
		enabled: !!servers?.length,
	});

	useEffect(() => {
		const { checkout, ...query } = router.query;
		if (!checkout) return;
		if (checkout === "success") {
			toast.success(
				"Payment received! Your server is being provisioned, this takes ~5 minutes.",
			);
		} else if (checkout === "cancelled") {
			toast.info("Checkout cancelled. No charge was made.");
		}
		router.replace({ pathname: router.pathname, query }, undefined, {
			shallow: true,
		});
	}, [router]);

	const customerPortal = api.stripe.createCustomerPortalSession.useMutation({
		onSuccess: ({ url }) => {
			if (url) window.location.href = url;
		},
		onError: (err) => toast.error(err.message),
	});

	const reconnect = api.cloudServer.reconnect.useMutation({
		onSuccess: () => {
			toast.success("Server reconnected successfully.");
			utils.cloudServer.list.invalidate();
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteServer = api.cloudServer.delete.useMutation({
		onSuccess: ({ cancelledOrder }) => {
			toast.success(
				cancelledOrder ? "Order cancelled." : "Server is being terminated.",
			);
			utils.cloudServer.list.invalidate();
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<div className="w-full">
			<Card className="bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Server className="size-6 text-muted-foreground self-center" />
							Billing
						</CardTitle>
						<CardDescription>
							Manage your subscription and servers
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-4 border-t">
						<nav className="flex space-x-2 border-b">
							{navigationItems.map((item) => {
								const Icon = item.icon;
								const isActive = router.pathname === item.href;
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
											isActive
												? "border-primary text-primary"
												: "border-transparent text-muted-foreground hover:text-primary hover:border-muted",
										)}
									>
										<Icon className="h-4 w-4" />
										{item.name}
									</Link>
								);
							})}
						</nav>

						<div className="mt-6 space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="font-semibold text-base">Cloud Servers</h3>
									<p className="text-sm text-muted-foreground">
										Servers provided by Dokploy Cloud, billed separately from
										your plan
									</p>
								</div>
								<OrderServerDialog />
							</div>

							{isLoading ? (
								<div className="flex justify-center py-8">
									<Loader2 className="size-6 animate-spin text-muted-foreground" />
								</div>
							) : servers?.length === 0 ? (
								<div className="text-center py-12 border rounded-lg border-dashed">
									<Server className="size-10 mx-auto text-muted-foreground mb-3" />
									<p className="text-sm font-medium">No cloud servers yet</p>
									<p className="text-xs text-muted-foreground mt-1">
										Order a server and we'll provision and configure it for you
										automatically.
									</p>
								</div>
							) : (
								<div className="space-y-3">
									{servers?.map((s) => (
										<CloudServerRow
											key={s.cloudServerId}
											server={s}
											plan={plans?.find((p) => p.id === s.plan)}
											onReconnect={() =>
												reconnect.mutate({ cloudServerId: s.cloudServerId })
											}
											isReconnecting={reconnect.isPending}
											onDelete={() =>
												deleteServer.mutate({
													cloudServerId: s.cloudServerId,
												})
											}
											onUpdatePayment={() => customerPortal.mutate()}
											isOpeningPortal={customerPortal.isPending}
										/>
									))}
								</div>
							)}
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
