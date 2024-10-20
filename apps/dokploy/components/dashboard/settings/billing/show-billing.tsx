import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { loadStripe } from "@stripe/stripe-js";
import clsx from "clsx";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { toast } from "sonner";
import { ReviewPayment } from "./review-payment";

const stripePromise = loadStripe(
	"pk_test_51QAm7bF3cxQuHeOz0xg04o9teeyTbbNHQPJ5Tr98MlTEan9MzewT3gwh0jSWBNvrRWZ5vASoBgxUSF4gPWsJwATk00Ir2JZ0S1",
);

export const calculatePrice = (count: number, isAnnual = false) => {
	if (isAnnual) {
		if (count === 1) return 40.8;
		if (count <= 3) return 81.5;
		return 81.5 + (count - 3) * 35.7;
	}
	if (count === 1) return 4.0;
	if (count <= 3) return 7.99;
	return 7.99 + (count - 3) * 3.5;
};

export const calculateYearlyCost = (serverQuantity: number) => {
	const count = serverQuantity;
	if (count === 1) return 4.0 * 12;
	if (count <= 3) return 7.99 * 12;
	return (7.99 + (count - 3) * 3.5) * 12;
};

export const ShowBilling = () => {
	const router = useRouter();
	const { data: billingSubscription } =
		api.stripe.getBillingSubscription.useQuery(undefined);
	const { data: servers } = api.server.all.useQuery(undefined);
	const { data: admin } = api.admin.one.useQuery();
	const { data, refetch } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();

	const { mutateAsync: createCustomerPortalSession } =
		api.stripe.createCustomerPortalSession.useMutation();

	const [serverQuantity, setServerQuantity] = useState(3);

	const { mutateAsync: upgradeSubscriptionMonthly } =
		api.stripe.upgradeSubscriptionMonthly.useMutation();

	const { mutateAsync: upgradeSubscriptionAnnual } =
		api.stripe.upgradeSubscriptionAnnual.useMutation();
	const [isAnnual, setIsAnnual] = useState(false);

	// useEffect(() => {
	// 	if (billingSubscription) {
	// 		setIsAnnual(
	// 			(prevIsAnnual) =>
	// 				billingSubscription.billingInterval === "year" &&
	// 				prevIsAnnual !== true,
	// 		);
	// 	}
	// }, [billingSubscription]);

	const handleCheckout = async (productId: string) => {
		const stripe = await stripePromise;

		if (data && admin?.stripeSubscriptionId && data.subscriptions.length > 0) {
			if (isAnnual) {
				upgradeSubscriptionAnnual({
					subscriptionId: admin?.stripeSubscriptionId,
					serverQuantity,
				})
					.then(async (subscription) => {
						if (subscription.type === "new") {
							await stripe?.redirectToCheckout({
								sessionId: subscription.sessionId,
							});
							return;
						}
						toast.success("Subscription upgraded successfully");
						await refetch();
					})
					.catch((error) => {
						toast.error("Error to upgrade the subscription");
						console.error(error);
					});
			} else {
				upgradeSubscriptionMonthly({
					subscriptionId: admin?.stripeSubscriptionId,
					serverQuantity,
				})
					.then(async (subscription) => {
						if (subscription.type === "new") {
							await stripe?.redirectToCheckout({
								sessionId: subscription.sessionId,
							});
							return;
						}
						toast.success("Subscription upgraded successfully");
						await refetch();
					})
					.catch((error) => {
						toast.error("Error to upgrade the subscription");
						console.error(error);
					});
			}
		} else {
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

	return (
		<div className="flex flex-col gap-4 w-full justify-center">
			<Badge>{admin?.stripeSubscriptionStatus}</Badge>
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
			{products?.map((product) => {
				// const suscripcion = data?.subscriptions.find((subscription) =>
				// 	subscription.items.data.find((item) => item.pr === product.id),
				// );

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

											if (serverQuantity === 3) {
												setServerQuantity(serverQuantity - 2);
												return;
											}
											setServerQuantity(serverQuantity - 1);
										}}
									>
										<MinusIcon className="h-4 w-4" />
									</Button>
									<NumberInput
										value={serverQuantity}
										onChange={(e) => {
											if (Number(e.target.value) === 2) {
												setServerQuantity(3);
												return;
											}
											setServerQuantity(e.target.value);
										}}
									/>

									<Button
										variant="outline"
										onClick={() => {
											if (serverQuantity === 1) {
												setServerQuantity(3);
												return;
											}

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
									{data &&
										data?.subscriptions?.length > 0 &&
										billingSubscription?.billingInterval === "year" &&
										isAnnual && (
											<ReviewPayment
												isAnnual={true}
												serverQuantity={serverQuantity}
											/>
										)}
									{data &&
										data?.subscriptions?.length > 0 &&
										billingSubscription?.billingInterval === "month" &&
										!isAnnual && (
											<ReviewPayment
												isAnnual={false}
												serverQuantity={serverQuantity}
											/>
										)}

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
								</div>
							</div>
						</section>
					</div>
				);
			})}

			<Button
				variant="secondary"
				onClick={async () => {
					// Crear una sesión del portal del cliente
					const session = await createCustomerPortalSession();

					// router.push(session.url,"",{});
					window.open(session.url);

					// Redirigir al portal del cliente en Stripe
					// window.location.href = session.url;
				}}
			>
				Manage Subscription
			</Button>
		</div>
	);
};
