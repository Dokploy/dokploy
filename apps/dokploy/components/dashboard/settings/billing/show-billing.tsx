import { loadStripe } from "@stripe/stripe-js";
import clsx from "clsx";
import {
	AlertTriangle,
	CheckIcon,
	CreditCard,
	Loader2,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

export const calculatePrice = (count: number, isAnnual = false) => {
	if (isAnnual) {
		if (count <= 1) return 45.9;
		return 35.7 * count;
	}
	if (count <= 1) return 4.5;
	return count * 3.5;
};
export const ShowBilling = () => {
	const { data: servers } = api.server.count.useQuery();
	const { data: admin } = api.user.get.useQuery();
	const { data, isLoading } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();

	const { mutateAsync: createCustomerPortalSession } =
		api.stripe.createCustomerPortalSession.useMutation();

	const [serverQuantity, setServerQuantity] = useState(3);
	const [isAnnual, setIsAnnual] = useState(false);

	const handleCheckout = async (productId: string) => {
		const stripe = await stripePromise;
		if (data && data.subscriptions.length === 0) {
			createCheckoutSession({
				productId,
				serverQuantity: serverQuantity,
				isAnnual,
			}).then(async (session) => {
				await stripe?.redirectToCheckout({
					sessionId: session.sessionId,
				});
			});
		}
	};
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
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<CreditCard className="size-6 text-muted-foreground self-center" />
							Billing
						</CardTitle>
						<CardDescription>Manage your subscription</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<div className="flex flex-col gap-4 w-full">
							<Tabs
								defaultValue="monthly"
								value={isAnnual ? "annual" : "monthly"}
								className="w-full"
								onValueChange={(e) => setIsAnnual(e === "annual")}
							>
								<TabsList>
									<TabsTrigger value="monthly">Monthly</TabsTrigger>
									<TabsTrigger value="annual">Annual</TabsTrigger>
								</TabsList>
							</Tabs>
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
							{isLoading ? (
								<span className="text-base text-muted-foreground flex flex-row gap-3 items-center justify-center min-h-[10vh]">
									Loading...
									<Loader2 className="animate-spin" />
								</span>
							) : (
								<>
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
														<div
															className={cn(
																data?.subscriptions &&
																	data?.subscriptions?.length > 0
																	? "justify-between"
																	: "justify-end",
																"flex flex-row  items-center gap-2 mt-4",
															)}
														>
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

															{data?.subscriptions?.length === 0 && (
																<div className="justify-end w-full">
																	<Button
																		className="w-full"
																		onClick={async () => {
																			handleCheckout(product.id);
																		}}
																		disabled={serverQuantity < 1}
																	>
																		Subscribe
																	</Button>
																</div>
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
