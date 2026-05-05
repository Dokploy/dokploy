import {
	AlertCircle,
	CheckCircle2,
	Clock,
	CreditCard,
	ExternalLink,
	FileText,
	Loader2,
	Plus,
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

function formatSpecs(cpus: number, memoryMb: number, diskMb: number, bandwidthMb: number) {
	const bandwidthTb = bandwidthMb / 1024 / 1024;
	const bandwidthLabel = bandwidthTb >= 1 ? `${bandwidthTb.toFixed(0)} TB` : `${Math.round(bandwidthMb / 1024)} GB`;
	return `${cpus} vCPU · ${Math.round(memoryMb / 1024)} GB RAM · ${Math.round(diskMb / 1024)} GB NVMe · ${bandwidthLabel} bandwidth`;
}

function centsToDisplay(cents: number) {
	return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function OrderServerDialog({ onSuccess }: { onSuccess: () => void }) {
	const [open, setOpen] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState<string>("");
	const [selectedDc, setSelectedDc] = useState<string>("");
	const [isAnnual, setIsAnnual] = useState(false);

	const { data: plans, isLoading: loadingPlans } =
		api.managedServer.getPlans.useQuery(undefined, { enabled: open });
	const { data: dataCenters, isLoading: loadingDcs } =
		api.managedServer.getDataCenters.useQuery(undefined, { enabled: open });

	const isLoadingOptions = loadingPlans || loadingDcs;

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

	const displayPrice = (p: NonNullable<typeof plan>) =>
		isAnnual
			? `$${centsToDisplay(p.dokployPriceCentsAnnual)}/yr`
			: `$${centsToDisplay(p.dokployPriceCentsMonthly)}/mo`;

	const displayPriceSmall = (p: NonNullable<typeof plan>) =>
		isAnnual
			? `$${centsToDisplay(Math.round(p.dokployPriceCentsAnnual / 12))}/mo billed annually`
			: `$${centsToDisplay(p.dokployPriceCentsAnnual)}/yr if annual`;

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
						<div className="space-y-4">
							{/* Billing period toggle */}
							<div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/40 w-fit">
								<button
									type="button"
									onClick={() => setIsAnnual(false)}
									className={cn(
										"px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
										!isAnnual
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									Monthly
								</button>
								<button
									type="button"
									onClick={() => setIsAnnual(true)}
									className={cn(
										"px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
										isAnnual
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									Annual
									<span className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-semibold">
										Save ~20%
									</span>
								</button>
							</div>

							{/* Plan selector */}
							<div className="space-y-2">
								<Label>Plan</Label>
								<div className="grid gap-2">
									{plans?.map((p) => (
										<button
											key={p.id}
											type="button"
											onClick={() => setSelectedPlan(p.id)}
											className={cn(
												"flex items-center justify-between rounded-lg border p-3 text-left transition-colors",
												selectedPlan === p.id
													? "border-primary bg-primary/5"
													: "border-border hover:border-muted-foreground",
											)}
										>
											<div>
												<p className="font-medium text-sm">{p.name}</p>
												<p className="text-xs text-muted-foreground">
													{formatSpecs(p.cpus, p.memoryMb, p.diskMb, p.bandwidthMb)}
												</p>
											</div>
											<div className="text-right">
												<p className="font-semibold text-sm">
													{displayPrice(p)}
												</p>
												<p className="text-xs text-muted-foreground">
													{displayPriceSmall(p)}
												</p>
											</div>
										</button>
									))}
								</div>
							</div>

							{/* Data center selector */}
							<div className="space-y-2">
								<Label>Data Center</Label>
								<Select value={selectedDc} onValueChange={setSelectedDc}>
									<SelectTrigger>
										<SelectValue placeholder="Select a location..." />
									</SelectTrigger>
									<SelectContent position="popper" side="bottom" sideOffset={4} className="max-h-56 overflow-y-auto">
										{dataCenters?.map((dc) => (
											<SelectItem key={dc.id} value={String(dc.id)}>
												{dc.city} — {dc.continent}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{plan && selectedDc && (
								<div className="rounded-lg bg-muted p-3 text-sm space-y-1">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Plan</span>
										<span className="font-medium">{plan.name}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Billing</span>
										<span className="font-medium">{isAnnual ? "Annual" : "Monthly"}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Total</span>
										<span className="font-semibold">{displayPrice(plan)}</span>
									</div>
								</div>
							)}

							<Button
								className="w-full"
								disabled={!selectedPlan || !selectedDc || purchase.isPending}
								onClick={() => {
									if (!selectedPlan || !selectedDc) return;
									purchase.mutate({
										plan: selectedPlan,
										dataCenterId: Number(selectedDc),
										isAnnual,
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

export const ShowManagedServers = () => {
	const router = useRouter();
	const utils = api.useUtils();

	const { data: servers, isLoading } = api.managedServer.list.useQuery();

	const syncStatus = api.managedServer.syncStatus.useMutation({
		onSuccess: () => utils.managedServer.list.invalidate(),
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
										const planLabel = s.plan
											.split("-")
											.slice(-2)
											.join(" ")
											.toUpperCase();

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
																{planLabel}
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
