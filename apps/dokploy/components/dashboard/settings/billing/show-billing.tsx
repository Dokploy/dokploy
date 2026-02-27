import { loadStripe } from "@stripe/stripe-js";
import clsx from "clsx";
import {
	AlertTriangle,
	CheckIcon,
	CreditCard,
	FileText,
	Loader2,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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
import { NumberInput } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const stripePromise = loadStripe(
	process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

/** Precio legacy / Hobby: $4.50/mo primer servidor, $3.50 siguientes; anual $45.90 primero, $35.70 siguientes. */
export const calculatePrice = (count: number, isAnnual = false) => {
	if (isAnnual) {
		if (count <= 1) return 45.9;
		return 35.7 * count;
	}
	if (count <= 1) return 4.5;
	return count * 3.5;
};

/** Hobby: $4.50/mo per server; annual 20% off = $43.20/yr per server (4.5 * 12 * 0.8). */
export const calculatePriceHobby = (count: number, isAnnual = false) => {
	const perServerMonthly = 4.5;
	const perServerAnnual = 43.2; // 4.5 * 12 * 0.8
	return isAnnual ? count * perServerAnnual : count * perServerMonthly;
};

/** Startup: 3 servers included ($15/mo); extra servers $4.50/mo each. Annual 20% off. */
export const STARTUP_SERVERS_INCLUDED = 3;
export const calculatePriceStartup = (count: number, isAnnual = false) => {
	const baseMonthly = 15;
	const extraMonthly = 4.5;
	const baseAnnual = 144; // 15 * 12 * 0.8
	const extraAnnual = 43.2; // 4.5 * 12 * 0.8, consistent with Hobby annual
	if (count <= STARTUP_SERVERS_INCLUDED)
		return isAnnual ? baseAnnual : baseMonthly;
	return isAnnual
		? baseAnnual + (count - STARTUP_SERVERS_INCLUDED) * extraAnnual
		: baseMonthly + (count - STARTUP_SERVERS_INCLUDED) * extraMonthly;
};

const navigationItems = [
	{
		name: "Subscription",
		href: "/dashboard/settings/billing",
		icon: CreditCard,
	},
	{
		name: "Invoices",
		href: "/dashboard/settings/invoices",
		icon: FileText,
	},
];

export const ShowBilling = () => {
	const router = useRouter();
	const { data: servers } = api.server.count.useQuery();
	const { data: admin } = api.user.get.useQuery();
	const { data, isPending } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();

	const { mutateAsync: createCustomerPortalSession } =
		api.stripe.createCustomerPortalSession.useMutation();
	const { mutateAsync: upgradeSubscription, isPending: isUpgrading } =
		api.stripe.upgradeSubscription.useMutation();
	const utils = api.useUtils();

	const [serverQuantity, setServerQuantity] = useState(3);
	const [isAnnual, setIsAnnual] = useState(false);
	const [upgradeTier, setUpgradeTier] = useState<"hobby" | "startup" | null>(
		null,
	);
	const [upgradeServerQty, setUpgradeServerQty] = useState(3);
	/** Billing interval in the upgrade/update form; synced to current when data loads. */
	const [updateFormAnnual, setUpdateFormAnnual] = useState(false);

	useEffect(() => {
		if (data?.isAnnualCurrent !== undefined) {
			setUpdateFormAnnual(data.isAnnualCurrent);
		}
	}, [data?.isAnnualCurrent]);

	const handleCheckout = async (
		tier: "legacy" | "hobby" | "startup",
		productId: string,
	) => {
		const stripe = await stripePromise;
		if (data && data.subscriptions.length === 0) {
			createCheckoutSession({
				tier,
				productId,
				serverQuantity,
				isAnnual,
			}).then(async (session) => {
				await stripe?.redirectToCheckout({
					sessionId: session.sessionId,
				});
			});
		}
	};

	const useNewPricing = data?.hobbyProductId && data?.startupProductId;
	const products = data?.products.filter((product) => {
		// @ts-ignore
		const interval = product?.default_price?.recurring?.interval;
		return isAnnual ? interval === "year" : interval === "month";
	});

	const maxServers = admin?.user.serversQuantity ?? 1;
	const percentage = ((servers ?? 0) / maxServers) * 100;
	const safePercentage = Math.min(percentage, 100);

	return (
		<div className="w-full">
			<Card className="bg-sidebar p-2.5 rounded-xl max-w-6xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<CreditCard className="size-6 text-muted-foreground self-center" />
							Billing
						</CardTitle>
						<CardDescription>
							Manage your subscription and invoices
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

						<div className="flex flex-col gap-4 w-full mt-6">
							{admin?.user.stripeSubscriptionId && (
								<div className="space-y-2 flex flex-col">
									<h3 className="text-lg font-medium">Servers Plan</h3>
									<p className="text-sm text-muted-foreground">
										You have {servers} server on your plan of{" "}
										{admin?.user.serversQuantity} servers
									</p>
									<div>
										<Progress value={safePercentage} className="max-w-lg" />
									</div>
									{admin && admin.user.serversQuantity! <= (servers ?? 0) && (
										<div className="flex flex-row gap-4 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg items-center">
											<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
											<span className="text-sm text-yellow-600 dark:text-yellow-400">
												You have reached the maximum number of servers you can
												create, please upgrade your plan to add more servers.
											</span>
										</div>
									)}
								</div>
							)}
							{/* Upgrade: solo para usuarios en plan legacy con nuevos planes disponibles */}
							{useNewPricing &&
								data?.currentPlan === "legacy" &&
								data?.subscriptions?.length > 0 && (
									<div className="rounded-xl border border-border bg-primary/5 p-4 space-y-4 max-w-2xl">
										<h3 className="text-lg font-medium">Upgrade your plan</h3>
										<p className="text-sm text-muted-foreground">
											You’re on the legacy plan. Switch to Hobby or Startup
											(same benefits). You can also choose annual billing (20%
											off). Stripe will prorate the change.
										</p>

										<span className="text-sm font-medium block">
											Billing interval
										</span>
										<div className="flex gap-2 flex-wrap">
											<Button
												variant={!updateFormAnnual ? "default" : "outline"}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpdateFormAnnual(false)}
											>
												Monthly
											</Button>
											<Button
												variant={updateFormAnnual ? "default" : "outline"}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpdateFormAnnual(true)}
											>
												Annual (20% off)
											</Button>
										</div>

										<span className="text-sm font-medium block">New plan</span>
										<div className="flex gap-2 flex-wrap">
											<Button
												variant={
													upgradeTier === "hobby" ? "default" : "outline"
												}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpgradeTier("hobby")}
											>
												Hobby
											</Button>
											<Button
												variant={
													upgradeTier === "startup" ? "default" : "outline"
												}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpgradeTier("startup")}
											>
												Startup
											</Button>
										</div>

										{upgradeTier && (
											<div className="flex flex-col gap-3 pt-1">
												<span className="text-sm font-medium">
													Servers
													{upgradeTier === "startup" &&
														` (min. ${STARTUP_SERVERS_INCLUDED})`}
												</span>
												<div className="flex items-center gap-2 w-fit">
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8"
														disabled={
															upgradeTier === "startup"
																? upgradeServerQty <= STARTUP_SERVERS_INCLUDED
																: upgradeServerQty <= 1
														}
														onClick={() =>
															setUpgradeServerQty((q) =>
																Math.max(
																	upgradeTier === "startup"
																		? STARTUP_SERVERS_INCLUDED
																		: 1,
																	q - 1,
																),
															)
														}
													>
														<MinusIcon className="h-4 w-4" />
													</Button>
													<NumberInput
														value={upgradeServerQty}
														onChange={(e) => {
															const v =
																Number((e.target as HTMLInputElement).value) ||
																0;
															setUpgradeServerQty(
																Math.max(
																	upgradeTier === "startup"
																		? STARTUP_SERVERS_INCLUDED
																		: 1,
																	v,
																),
															);
														}}
														className="w-20 h-8"
													/>
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8"
														onClick={() => setUpgradeServerQty((q) => q + 1)}
													>
														<PlusIcon className="h-4 w-4" />
													</Button>
												</div>
												<p className="text-sm text-muted-foreground">
													{upgradeTier === "hobby"
														? `$${calculatePriceHobby(upgradeServerQty, updateFormAnnual).toFixed(2)} per ${updateFormAnnual ? "year" : "month"}`
														: `$${calculatePriceStartup(upgradeServerQty, updateFormAnnual).toFixed(2)} per ${updateFormAnnual ? "year" : "month"}`}
												</p>
												<DialogAction
													title="Confirm upgrade"
													description={
														<div className="space-y-2">
															<p className="font-medium text-foreground">
																Current plan: Legacy
															</p>
															<p className="font-medium text-foreground">
																New plan:{" "}
																{upgradeTier === "startup"
																	? "Startup"
																	: "Hobby"}{" "}
																· {upgradeServerQty} server
																{upgradeServerQty !== 1 ? "s" : ""} · $
																{upgradeTier === "hobby"
																	? calculatePriceHobby(
																			upgradeServerQty,
																			updateFormAnnual,
																		).toFixed(2)
																	: calculatePriceStartup(
																			upgradeServerQty,
																			updateFormAnnual,
																		).toFixed(2)}
																/{updateFormAnnual ? "yr" : "mo"} (
																{updateFormAnnual ? "annual" : "monthly"})
															</p>
															<p className="text-sm text-muted-foreground">
																Stripe will prorate the change.
															</p>
														</div>
													}
													type="default"
													onClick={async () => {
														if (!upgradeTier) return;
														try {
															await upgradeSubscription({
																tier: upgradeTier,
																serverQuantity: upgradeServerQty,
																isAnnual: updateFormAnnual,
															});
															await utils.stripe.getProducts.invalidate();
															await utils.user.get.invalidate();
															setUpgradeTier(null);
															toast.success("Plan upgraded successfully");
														} catch {
															toast.error("Error upgrading plan");
														}
													}}
												>
													<Button
														className="w-full sm:w-auto"
														disabled={
															isUpgrading ||
															(upgradeTier === "startup" &&
																upgradeServerQty < STARTUP_SERVERS_INCLUDED)
														}
													>
														{isUpgrading ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																Upgrading…
															</>
														) : (
															"Upgrade plan"
														)}
													</Button>
												</DialogAction>
											</div>
										)}
									</div>
								)}
							{/* Cambiar plan o cantidad de servidores (usuarios en Hobby o Startup; el portal no permite esto) */}
							{useNewPricing &&
								(data?.currentPlan === "hobby" ||
									data?.currentPlan === "startup") &&
								data?.subscriptions?.length > 0 && (
									<div className="rounded-xl border border-border bg-primary/5 p-4 space-y-4 max-w-2xl">
										<h3 className="text-lg font-medium">
											Change plan or number of servers
										</h3>
										<p className="text-sm text-muted-foreground">
											Your current plan:{" "}
											<span className="font-medium text-foreground">
												{data?.currentPlan === "startup" ? "Startup" : "Hobby"}
											</span>
											{" · "}
											<span className="font-medium text-foreground">
												{admin?.user.serversQuantity ?? 0} server
												{(admin?.user.serversQuantity ?? 0) !== 1 ? "s" : ""}
											</span>
											{data?.currentPriceAmount != null && (
												<>
													{" · "}
													<span className="font-medium text-foreground">
														${data.currentPriceAmount.toFixed(2)}/
														{data?.isAnnualCurrent ? "yr" : "mo"}
													</span>
												</>
											)}{" "}
											({data?.isAnnualCurrent ? "annual" : "monthly"} billing).
										</p>
										<p className="text-sm text-muted-foreground">
											Add more servers, switch between Hobby and Startup, or
											change to annual billing (20% off). Stripe will prorate
											the change.
										</p>

										<span className="text-sm font-medium block">
											Billing interval
										</span>
										<div className="flex gap-2 flex-wrap">
											<Button
												variant={!updateFormAnnual ? "default" : "outline"}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpdateFormAnnual(false)}
											>
												Monthly
											</Button>
											<Button
												variant={updateFormAnnual ? "default" : "outline"}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpdateFormAnnual(true)}
											>
												Annual (20% off)
											</Button>
										</div>

										<span className="text-sm font-medium block">Plan</span>
										<div className="flex gap-2 flex-wrap">
											<Button
												variant={
													upgradeTier === "hobby" ? "default" : "outline"
												}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpgradeTier("hobby")}
											>
												Hobby
											</Button>
											<Button
												variant={
													upgradeTier === "startup" ? "default" : "outline"
												}
												size="sm"
												className="min-w-[6rem]"
												onClick={() => setUpgradeTier("startup")}
											>
												Startup
											</Button>
										</div>

										{upgradeTier && (
											<div className="flex flex-col gap-3 pt-1">
												<span className="text-sm font-medium">
													Servers
													{upgradeTier === "startup" &&
														` (min. ${STARTUP_SERVERS_INCLUDED})`}
												</span>
												<div className="flex items-center gap-2 w-fit">
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8"
														disabled={
															upgradeTier === "startup"
																? upgradeServerQty <= STARTUP_SERVERS_INCLUDED
																: upgradeServerQty <= 1
														}
														onClick={() =>
															setUpgradeServerQty((q) =>
																Math.max(
																	upgradeTier === "startup"
																		? STARTUP_SERVERS_INCLUDED
																		: 1,
																	q - 1,
																),
															)
														}
													>
														<MinusIcon className="h-4 w-4" />
													</Button>
													<NumberInput
														value={upgradeServerQty}
														onChange={(e) => {
															const v =
																Number((e.target as HTMLInputElement).value) ||
																0;
															setUpgradeServerQty(
																Math.max(
																	upgradeTier === "startup"
																		? STARTUP_SERVERS_INCLUDED
																		: 1,
																	v,
																),
															);
														}}
														className="w-20 h-8"
													/>
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8"
														onClick={() => setUpgradeServerQty((q) => q + 1)}
													>
														<PlusIcon className="h-4 w-4" />
													</Button>
												</div>
												<p className="text-sm text-muted-foreground">
													{upgradeTier === "hobby"
														? `$${calculatePriceHobby(upgradeServerQty, updateFormAnnual).toFixed(2)} per ${updateFormAnnual ? "year" : "month"}`
														: `$${calculatePriceStartup(upgradeServerQty, updateFormAnnual).toFixed(2)} per ${updateFormAnnual ? "year" : "month"}`}
												</p>
												<DialogAction
													title="Confirm plan change"
													description={
														<div className="space-y-2">
															<p className="font-medium text-foreground">
																Current plan:{" "}
																{data?.currentPlan === "startup"
																	? "Startup"
																	: "Hobby"}{" "}
																· {admin?.user.serversQuantity ?? 0} server
																{(admin?.user.serversQuantity ?? 0) !== 1
																	? "s"
																	: ""}{" "}
																·{" "}
																{data?.currentPriceAmount != null
																	? `$${data.currentPriceAmount.toFixed(2)}/${data?.isAnnualCurrent ? "yr" : "mo"}`
																	: ""}{" "}
																({data?.isAnnualCurrent ? "annual" : "monthly"})
															</p>
															<p className="font-medium text-foreground">
																New plan:{" "}
																{upgradeTier === "startup"
																	? "Startup"
																	: "Hobby"}{" "}
																· {upgradeServerQty} server
																{upgradeServerQty !== 1 ? "s" : ""} · $
																{upgradeTier === "hobby"
																	? calculatePriceHobby(
																			upgradeServerQty,
																			updateFormAnnual,
																		).toFixed(2)
																	: calculatePriceStartup(
																			upgradeServerQty,
																			updateFormAnnual,
																		).toFixed(2)}
																/{updateFormAnnual ? "yr" : "mo"} (
																{updateFormAnnual ? "annual" : "monthly"})
															</p>
															<p className="text-sm text-muted-foreground">
																Stripe will prorate the change.
															</p>
														</div>
													}
													type="default"
													onClick={async () => {
														if (!upgradeTier) return;
														try {
															await upgradeSubscription({
																tier: upgradeTier,
																serverQuantity: upgradeServerQty,
																isAnnual: updateFormAnnual,
															});
															await utils.stripe.getProducts.invalidate();

															// add delay of 3 seconds
															await new Promise((resolve) =>
																setTimeout(resolve, 3000),
															);
															await utils.user.get.invalidate();
															setUpgradeTier(null);
															toast.success(
																"Subscription updated successfully",
															);
														} catch {
															toast.error("Error updating subscription");
														}
													}}
												>
													<Button
														className="w-auto"
														disabled={
															isUpgrading ||
															(upgradeTier === "startup" &&
																upgradeServerQty < STARTUP_SERVERS_INCLUDED)
														}
													>
														{isUpgrading ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																Updating…
															</>
														) : (
															"Update subscription"
														)}
													</Button>
												</DialogAction>
											</div>
										)}
									</div>
								)}
							<div className="flex flex-col gap-1.5 mt-4">
								<span className="text-base text-primary">
									Need Help? We are here to help you.
								</span>
								<span className="text-sm text-muted-foreground">
									Join to our Discord server and we will help you.
								</span>
								<Button className="rounded-full bg-[#5965F2] hover:bg-[#4A55E0] w-fit">
									<Link
										href="https://discord.gg/2tBnJ3jDJc"
										aria-label="Dokploy on GitHub"
										target="_blank"
										className="flex flex-row items-center gap-2 text-white"
									>
										<svg
											role="img"
											className="h-6 w-6 fill-white"
											viewBox="0 0 24 24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
										</svg>
										Join Discord
									</Link>
								</Button>
							</div>
							{isPending ? (
								<span className="text-base text-muted-foreground flex flex-row gap-3 items-center justify-center min-h-[10vh]">
									Loading...
									<Loader2 className="animate-spin" />
								</span>
							) : useNewPricing ? (
								<>
									<Tabs
										defaultValue="monthly"
										value={isAnnual ? "annual" : "monthly"}
										className="w-full"
										onValueChange={(e) => setIsAnnual(e === "annual")}
									>
										<TabsList className="">
											<TabsTrigger value="monthly">Monthly</TabsTrigger>
											<TabsTrigger value="annual">Annual (20% off)</TabsTrigger>
										</TabsList>
									</Tabs>
									<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
										{/* Hobby */}
										<section className="flex flex-col rounded-2xl border border-border px-5 py-6 shadow-sm">
											{isAnnual && (
												<Badge className="mb-3 w-fit" variant="secondary">
													20% off
												</Badge>
											)}
											<h3 className="text-xl font-bold tracking-tight text-foreground">
												Hobby
											</h3>
											<p className="mt-1 text-sm text-muted-foreground">
												Everything an individual developer needs
											</p>
											<div className="mt-4">
												<p className="text-2xl font-semibold text-foreground">
													$
													{calculatePriceHobby(
														serverQuantity,
														isAnnual,
													).toFixed(2)}
													/{isAnnual ? "yr" : "mo"}
												</p>
												<p className="text-xs text-muted-foreground mt-0.5">
													Add more servers as you&apos;d like for{" "}
													{isAnnual ? "$43.20/yr" : "$4.50/mo"}
												</p>
												{isAnnual && (
													<p className="text-xs text-muted-foreground mt-2">
														$
														{(
															calculatePriceHobby(serverQuantity, true) / 12
														).toFixed(2)}
														/mo
													</p>
												)}
											</div>
											<ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
												{[
													"Unlimited Deployments",
													"Unlimited Databases",
													"Unlimited Applications",
													"1 Server Included",
													"1 Organization",
													"1 User",
													"2 Environments",
													"1 Volume Backup per Application",
													"1 Backup per Database",
													"1 Scheduled Job per Application",
													"Community Support (Discord)",
												].map((f) => (
													<li key={f} className="flex items-start gap-2">
														<CheckIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500 mt-0.5" />
														<span>{f}</span>
													</li>
												))}
											</ul>
											<div className="mt-6 flex flex-col gap-3">
												<div className="flex items-center gap-2">
													<span className="text-sm text-muted-foreground">
														Servers:
													</span>
													<Button
														disabled={serverQuantity <= 1}
														variant="outline"
														size="icon"
														onClick={() =>
															setServerQuantity((q) => Math.max(1, q - 1))
														}
													>
														<MinusIcon className="h-4 w-4" />
													</Button>
													<NumberInput
														value={serverQuantity}
														onChange={(e) =>
															setServerQuantity(
																Math.max(
																	1,
																	Number(
																		(e.target as HTMLInputElement).value,
																	) || 1,
																),
															)
														}
														className="text-center"
													/>
													<Button
														variant="outline"
														size="icon"
														onClick={() => setServerQuantity((q) => q + 1)}
													>
														<PlusIcon className="h-4 w-4" />
													</Button>
												</div>
												<div className="flex flex-col gap-2 w-full">
													{admin?.user.stripeCustomerId && (
														<Button
															variant="secondary"
															className="w-full"
															onClick={async () => {
																const session =
																	await createCustomerPortalSession();
																window.open(session.url);
															}}
														>
															Manage Subscription
														</Button>
													)}
													{(data?.subscriptions?.length ?? 0) === 0 && (
														<Button
															className="w-full"
															onClick={() =>
																handleCheckout("hobby", data!.hobbyProductId!)
															}
															disabled={serverQuantity < 1}
														>
															Get Started
														</Button>
													)}
												</div>
											</div>
										</section>

										{/* Startup - Recommended */}
										<section className="flex flex-col rounded-2xl border-2 border-primary px-5 py-6 shadow-sm">
											<div className="mb-3 flex flex-wrap gap-2">
												<Badge className="w-fit" variant="default">
													Recommended
												</Badge>
												{isAnnual && (
													<Badge className="w-fit" variant="secondary">
														20% off
													</Badge>
												)}
											</div>
											<h3 className="text-xl font-bold tracking-tight text-foreground">
												Startup
											</h3>
											<p className="mt-1 text-sm text-muted-foreground">
												Perfect for small to mid-size teams
											</p>
											<div className="mt-4">
												<p className="text-2xl font-semibold text-foreground">
													$
													{calculatePriceStartup(
														serverQuantity,
														isAnnual,
													).toFixed(2)}
													/{isAnnual ? "yr" : "mo"}
												</p>
												<p className="text-xs text-muted-foreground mt-0.5">
													Add more servers as you&apos;d like for{" "}
													{isAnnual ? "$43.20/yr" : "$4.50/mo"}
												</p>
												{isAnnual && (
													<p className="text-xs text-muted-foreground mt-2">
														$
														{(
															calculatePriceStartup(serverQuantity, true) / 12
														).toFixed(2)}
														/mo
													</p>
												)}
											</div>
											<ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
												<li className="flex items-start gap-2 font-medium text-foreground">
													<CheckIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500 mt-0.5" />
													All the features of Hobby, plus…
												</li>
												{[
													"3 Servers Included",
													"3 Organizations",
													"Unlimited Users",
													"Unlimited Environments",
													"Unlimited Volume Backups",
													"Unlimited Database Backups",
													"Unlimited Scheduled Jobs",
													"Basic RBAC (Admin, Developer)",
													"2FA",
													"Email and Chat Support",
												].map((f) => (
													<li key={f} className="flex items-start gap-2">
														<CheckIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500 mt-0.5" />
														<span>{f}</span>
													</li>
												))}
											</ul>
											<div className="mt-6 flex flex-col gap-3">
												<div className="flex flex-col gap-2">
													<span className="text-sm font-medium text-foreground">
														Servers (min. {STARTUP_SERVERS_INCLUDED} included)
													</span>
													<div className="flex items-center gap-2">
														<Button
															disabled={
																serverQuantity <= STARTUP_SERVERS_INCLUDED
															}
															variant="outline"
															size="icon"
															className="h-8 w-8"
															onClick={() =>
																setServerQuantity((q) =>
																	Math.max(STARTUP_SERVERS_INCLUDED, q - 1),
																)
															}
														>
															<MinusIcon className="h-4 w-4" />
														</Button>
														<NumberInput
															value={serverQuantity}
															onChange={(e) =>
																setServerQuantity(
																	Math.max(
																		STARTUP_SERVERS_INCLUDED,
																		Number(
																			(e.target as HTMLInputElement).value,
																		) || STARTUP_SERVERS_INCLUDED,
																	),
																)
															}
															className="h-8 text-center"
														/>
														<Button
															variant="outline"
															size="icon"
															className="h-8 w-8"
															onClick={() => setServerQuantity((q) => q + 1)}
														>
															<PlusIcon className="h-4 w-4" />
														</Button>
													</div>
												</div>
												<div className="flex flex-col gap-2 w-full">
													{admin?.user.stripeCustomerId && (
														<Button
															variant="secondary"
															className="w-full"
															onClick={async () => {
																const session =
																	await createCustomerPortalSession();
																window.open(session.url);
															}}
														>
															Manage Subscription
														</Button>
													)}
													{(data?.subscriptions?.length ?? 0) === 0 && (
														<Button
															className="w-full"
															onClick={() =>
																handleCheckout(
																	"startup",
																	data!.startupProductId!,
																)
															}
															disabled={
																serverQuantity < STARTUP_SERVERS_INCLUDED
															}
														>
															Get Started
														</Button>
													)}
												</div>
											</div>
										</section>

										{/* Enterprise */}
										<section className="flex flex-col rounded-2xl border border-border px-5 py-6 shadow-sm">
											<h3 className="text-xl font-bold tracking-tight text-foreground">
												Enterprise
											</h3>
											<p className="mt-1 text-sm text-muted-foreground">
												For large organizations who want more control
											</p>
											<div className="mt-4">
												<p className="text-2xl font-semibold text-foreground">
													Contact Sales
												</p>
											</div>
											<ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
												<li className="flex items-start gap-2 font-medium text-foreground">
													<CheckIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500 mt-0.5" />
													All the features of Startup, plus…
												</li>
												{[
													"Up to Unlimited Servers",
													"Up to Unlimited Organizations",
													"Fine-grained RBAC",
													"Complete Hosting Flexibility",
													"SSO / SAML (Azure, OKTA, etc)",
													"Audit Logs",
													"MSA/SLA",
													"White Labeling",
													"Priority Support and Services",
												].map((f) => (
													<li key={f} className="flex items-start gap-2">
														<CheckIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500 mt-0.5" />
														<span>{f}</span>
													</li>
												))}
											</ul>
											<Button variant="outline" className="mt-6 w-full" asChild>
												<Link
													href="https://dokploy.com/contact"
													target="_blank"
													rel="noopener noreferrer"
												>
													Contact Sales
												</Link>
											</Button>
										</section>
									</div>
								</>
							) : (
								<>
									<Tabs
										defaultValue="monthly"
										value={isAnnual ? "annual" : "monthly"}
										className="w-full"
										onValueChange={(e) => setIsAnnual(e === "annual")}
									>
										<TabsList className="grid w-full max-w-[14rem] grid-cols-2">
											<TabsTrigger value="monthly">Monthly</TabsTrigger>
											<TabsTrigger value="annual">Annual (20% off)</TabsTrigger>
										</TabsList>
									</Tabs>
									{products?.map((product) => {
										const featured = true;
										return (
											<div key={product.id}>
												<section
													className={clsx(
														"flex flex-col rounded-3xl  border-dashed border-2 px-4 max-w-sm",
														featured
															? "order-first  border py-8 lg:order-none"
															: "lg:py-8",
													)}
												>
													{isAnnual && (
														<div className="mb-4 flex flex-row items-center gap-2">
															<Badge>Recommended 🚀</Badge>
														</div>
													)}
													{isAnnual ? (
														<div className="flex flex-row gap-2 items-center">
															<p className="text-2xl font-semibold tracking-tight text-primary ">
																${" "}
																{calculatePrice(
																	serverQuantity,
																	isAnnual,
																).toFixed(2)}{" "}
																USD
															</p>
															|
															<p className="text-base font-semibold tracking-tight text-muted-foreground">
																${" "}
																{(
																	calculatePrice(serverQuantity, isAnnual) / 12
																).toFixed(2)}{" "}
																/ Month USD
															</p>
														</div>
													) : (
														<p className="text-2xl font-semibold tracking-tight text-primary ">
															${" "}
															{calculatePrice(serverQuantity, isAnnual).toFixed(
																2,
															)}{" "}
															USD
														</p>
													)}
													<h3 className="mt-5 font-medium text-lg text-primary">
														{product.name}
													</h3>
													<p
														className={clsx(
															"text-sm",
															featured ? "text-white" : "text-slate-400",
														)}
													>
														{product.description}
													</p>

													<ul
														className={clsx(
															" mt-4 flex flex-col gap-y-2 text-sm",
															featured ? "text-white" : "text-slate-200",
														)}
													>
														{[
															"All the features of Dokploy",
															"Unlimited deployments",
															"Self-hosted on your own infrastructure",
															"Full access to all deployment features",
															"Dokploy integration",
															"Backups",
															"All Incoming features",
														].map((feature) => (
															<li
																key={feature}
																className="flex text-muted-foreground"
															>
																<CheckIcon />
																<span className="ml-4">{feature}</span>
															</li>
														))}
													</ul>
													<div className="flex flex-col gap-2 mt-4">
														<div className="flex items-center gap-2 justify-center">
															<span className="text-sm text-muted-foreground">
																{serverQuantity} Servers
															</span>
														</div>

														<div className="flex items-center space-x-2">
															<Button
																disabled={serverQuantity <= 1}
																variant="outline"
																onClick={() => {
																	if (serverQuantity <= 1) return;

																	setServerQuantity(serverQuantity - 1);
																}}
															>
																<MinusIcon className="h-4 w-4" />
															</Button>
															<NumberInput
																value={serverQuantity}
																onChange={(e) => {
																	setServerQuantity(
																		e.target.value as unknown as number,
																	);
																}}
															/>

															<Button
																variant="outline"
																onClick={() => {
																	setServerQuantity(serverQuantity + 1);
																}}
															>
																<PlusIcon className="h-4 w-4" />
															</Button>
														</div>
														<div className="flex flex-col gap-2 mt-4 w-full">
															{admin?.user.stripeCustomerId && (
																<Button
																	variant="secondary"
																	className="w-full"
																	onClick={async () => {
																		const session =
																			await createCustomerPortalSession();
																		window.open(session.url);
																	}}
																>
																	Manage Subscription
																</Button>
															)}
															{(data?.subscriptions?.length ?? 0) === 0 && (
																<Button
																	className="w-full"
																	onClick={async () => {
																		handleCheckout("legacy", product.id);
																	}}
																	disabled={serverQuantity < 1}
																>
																	Subscribe
																</Button>
															)}
														</div>
													</div>
												</section>
											</div>
										);
									})}
								</>
							)}
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
