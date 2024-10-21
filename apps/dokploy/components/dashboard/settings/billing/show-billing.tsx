import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { loadStripe } from "@stripe/stripe-js";
import clsx from "clsx";
import { AlertTriangle, CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import React, { useState } from "react";

const stripePromise = loadStripe(
	"pk_test_51QAm7bF3cxQuHeOz0xg04o9teeyTbbNHQPJ5Tr98MlTEan9MzewT3gwh0jSWBNvrRWZ5vASoBgxUSF4gPWsJwATk00Ir2JZ0S1",
);

export const calculatePrice = (count: number, isAnnual = false) => {
	if (isAnnual) {
		if (count <= 1) return 45.9;
		return 35.7 * count;
	}
	if (count <= 1) return 4.5;
	return count * 3.5;
};
// 178.156.147.118
export const ShowBilling = () => {
	const { data: servers } = api.server.all.useQuery(undefined);
	const { data: admin } = api.admin.one.useQuery();
	const { data } = api.stripe.getProducts.useQuery();
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
		const interval = product?.default_price?.recurring?.interval;
		return isAnnual ? interval === "year" : interval === "month";
	});

	const maxServers = admin?.serversQuantity ?? 1;
	const percentage = ((servers?.length ?? 0) / maxServers) * 100;
	const safePercentage = Math.min(percentage, 100);

	return (
		<div className="flex flex-col gap-4 w-full justify-center">
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
			{admin?.stripeSubscriptionId && (
				<div className="space-y-2">
					<h3 className="text-lg font-medium">Servers Plan</h3>
					<p className="text-sm text-muted-foreground">
						You have {servers?.length} server on your plan of{" "}
						{admin?.serversQuantity} servers
					</p>
					<div className="pb-5">
						<Progress value={safePercentage} className="max-w-lg" />
					</div>
					{admin && (
						<>
							{admin.serversQuantity! <= servers?.length! && (
								<div className="flex flex-row gap-4 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg items-center">
									<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
									<span className="text-sm text-yellow-600 dark:text-yellow-400">
										You have reached the maximum number of servers you can
										create, please upgrade your plan to add more servers.
									</span>
								</div>
							)}
						</>
					)}
				</div>
			)}

			{products?.map((product) => {
				const featured = true;
				return (
					<div key={product.id}>
						<section
							className={clsx(
								"flex flex-col rounded-3xl  border-dashed border-2 px-4 max-w-sm",
								featured
									? "order-first bg-black border py-8 lg:order-none"
									: "lg:py-8",
							)}
						>
							{isAnnual ? (
								<div className="flex flex-row gap-2 items-center">
									<p className=" text-2xl font-semibold tracking-tight text-primary ">
										$ {calculatePrice(serverQuantity, isAnnual).toFixed(2)} USD
									</p>
									|
									<p className=" text-base font-semibold tracking-tight text-muted-foreground">
										${" "}
										{(calculatePrice(serverQuantity, isAnnual) / 12).toFixed(2)}{" "}
										/ Month USD
									</p>
								</div>
							) : (
								<p className=" text-2xl font-semibold tracking-tight text-primary ">
									$ {calculatePrice(serverQuantity, isAnnual).toFixed(2)} USD
								</p>
							)}
							<h3 className="mt-5 font-medium text-lg text-white">
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
								role="list"
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
									<li key={feature} className="flex text-muted-foreground">
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
											setServerQuantity(e.target.value);
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
										data?.subscriptions && data?.subscriptions?.length > 0
											? "justify-between"
											: "justify-end",
										"flex flex-row  items-center gap-2 mt-4",
									)}
								>
									{admin?.stripeCustomerId && (
										<Button
											variant="secondary"
											className="w-full"
											onClick={async () => {
												const session = await createCustomerPortalSession();

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
		</div>
	);
};
