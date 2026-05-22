import {
	AlertCircle,
	CheckCircle2,
	Clock,
	CreditCard,
	ExternalLink,
	FileText,
	Loader2,
	Plus,
	RefreshCw,
	Server,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const navigationItems = [
	{
		name: "Subscription",
		href: "/dashboard/settings/billing",
		icon: CreditCard,
	},
	{
		name: "Managed Servers",
		href: "/dashboard/settings/managed-servers",
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
		label: "Pending",
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
	error: {
		label: "Error",
		icon: <XCircle className="size-3" />,
		variant: "destructive",
	},
	terminating: {
		label: "Terminating",
		icon: <Loader2 className="size-3 animate-spin" />,
		variant: "secondary",
	},
	terminated: {
		label: "Terminated",
		icon: <AlertCircle className="size-3" />,
		variant: "outline",
	},
};

function formatSpecs(cpus: number, memoryGb: number, storageGb: number) {
	return `${cpus} vCPU · ${memoryGb} GB RAM · ${storageGb} GB NVMe`;
}

function formatPrice(priceCents: number) {
	return `$${(priceCents / 100).toFixed(2)}/mo`;
}

const CONTINENT_ORDER = ["Europe", "Americas", "Asia-Pacific"];

function OrderServerDialog({ onSuccess }: { onSuccess: () => void }) {
	const [open, setOpen] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState<string>("");
	const [selectedZone, setSelectedZone] = useState<string>("");

	const { data: plans, isLoading: loadingPlans } =
		api.managedServer.getPlans.useQuery(undefined, { enabled: open });
	const { data: zones, isLoading: loadingZones } =
		api.managedServer.getDataCenters.useQuery(undefined, { enabled: open });

	const isLoadingOptions = loadingPlans || loadingZones;

	const purchase = api.managedServer.purchase.useMutation({
		onSuccess: () => {
			toast.success("Server order placed! Provisioning will take ~5 minutes.");
			setOpen(false);
			onSuccess();
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const plan = plans?.find((p) => p.id === selectedPlan);

	const groupedZones = zones?.reduce<Record<string, typeof zones>>((acc, z) => {
		if (!acc[z.continent]) acc[z.continent] = [];
		acc[z.continent]!.push(z);
		return acc;
	}, {});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="size-4 mr-2" />
					Order Server
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Order a Managed Server</DialogTitle>
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
											<p className="text-xs text-muted-foreground">
												{formatSpecs(p.cpus, p.memoryGb, p.storageGb)}
											</p>
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
										{CONTINENT_ORDER.filter((c) => groupedZones?.[c]).map((continent) => (
											<div key={continent}>
												<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
													{continent}
												</div>
												{groupedZones?.[continent]?.map((z) => (
													<SelectItem key={z.id} value={z.id}>
														{z.description}
													</SelectItem>
												))}
											</div>
										))}
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
										<span className="text-muted-foreground">Specs</span>
										<span className="font-medium">
											{formatSpecs(plan.cpus, plan.memoryGb, plan.storageGb)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Price</span>
										<span className="font-medium">{formatPrice(plan.priceCents)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Zone</span>
										<span className="font-medium">
											{zones?.find((z) => z.id === selectedZone)?.description ?? selectedZone}
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
										Placing order...
									</>
								) : (
									"Order Server"
								)}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

const PLAN_LABELS: Record<string, string> = {
	hobby: "Hobby",
	starter: "Starter",
	pro: "Pro",
	business: "Business",
};

export const ShowManagedServers = () => {
	const router = useRouter();
	const utils = api.useUtils();

	const { data: servers, isLoading } = api.managedServer.list.useQuery();

	const syncStatus = api.managedServer.syncStatus.useMutation({
		onSuccess: () => utils.managedServer.list.invalidate(),
	});

	const reconnect = api.managedServer.reconnect.useMutation({
		onSuccess: () => {
			toast.success("Server reconnected successfully.");
			utils.managedServer.list.invalidate();
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteServer = api.managedServer.delete.useMutation({
		onSuccess: () => {
			toast.success("Server terminated.");
			utils.managedServer.list.invalidate();
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
									<h3 className="font-semibold text-base">Managed Servers</h3>
									<p className="text-sm text-muted-foreground">
										Servers provisioned and managed by Dokploy Cloud
									</p>
								</div>
								<OrderServerDialog
									onSuccess={() => utils.managedServer.list.invalidate()}
								/>
							</div>

							{isLoading ? (
								<div className="flex justify-center py-8">
									<Loader2 className="size-6 animate-spin text-muted-foreground" />
								</div>
							) : servers?.length === 0 ? (
								<div className="text-center py-12 border rounded-lg border-dashed">
									<Server className="size-10 mx-auto text-muted-foreground mb-3" />
									<p className="text-sm font-medium">No managed servers yet</p>
									<p className="text-xs text-muted-foreground mt-1">
										Order a server and we'll provision and configure it for you
										automatically.
									</p>
								</div>
							) : (
								<div className="space-y-3">
									{servers?.map((s) => {
										const status =
											STATUS_MAP[s.status] ?? STATUS_MAP.error!;
										const isProvisioning = [
											"pending",
											"provisioning",
											"configuring",
										].includes(s.status);

										return (
											<div
												key={s.managedServerId}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<Server className="size-5 text-muted-foreground shrink-0" />
													<div className="space-y-0.5">
														<div className="flex items-center gap-2">
															<span className="font-medium text-sm">
																{PLAN_LABELS[s.plan] ?? s.plan}
															</span>
															<Badge
																variant={status?.variant}
																className="flex items-center gap-1 text-xs h-5"
															>
																{status?.icon}
																{status?.label}
															</Badge>
														</div>
														<p className="text-xs text-muted-foreground">
															{s.hostname ?? ""}
															{s.ipAddress ? ` · ${s.ipAddress}` : ""}
															{s.zone ? ` · ${s.zone}` : ""}
														</p>
													</div>
												</div>

												<div className="flex items-center gap-2">
													{isProvisioning && (
														<Button
															variant="ghost"
															size="sm"
															onClick={() =>
																syncStatus.mutate({
																	managedServerId: s.managedServerId,
																})
															}
															disabled={syncStatus.isPending}
														>
															<Loader2
																className={cn(
																	"size-4",
																	syncStatus.isPending && "animate-spin",
																)}
															/>
														</Button>
													)}
													{s.status === "ready" && !s.serverId && (
														<Button
															variant="outline"
															size="sm"
															onClick={() =>
																reconnect.mutate({
																	managedServerId: s.managedServerId,
																})
															}
															disabled={reconnect.isPending}
														>
															{reconnect.isPending ? (
																<Loader2 className="size-3.5 mr-1.5 animate-spin" />
															) : (
																<RefreshCw className="size-3.5 mr-1.5" />
															)}
															Reconnect
														</Button>
													)}
													{s.status === "ready" && s.server && (
														<Button variant="outline" size="sm" asChild>
															<Link
																href={`/dashboard/settings/server?serverId=${s.serverId}`}
															>
																<ExternalLink className="size-3.5 mr-1.5" />
																Open
															</Link>
														</Button>
													)}
													<DialogAction
														title="Terminate Server"
														description="This will permanently destroy the server and all data on it. This action cannot be undone."
														type="destructive"
														onClick={() =>
															deleteServer.mutate({
																managedServerId: s.managedServerId,
															})
														}
													>
														<Button
															variant="ghost"
															size="sm"
															className="text-destructive hover:text-destructive"
														>
															<Trash2 className="size-4" />
														</Button>
													</DialogAction>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
