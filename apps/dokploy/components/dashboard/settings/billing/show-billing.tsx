import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { loadStripe } from "@stripe/stripe-js";
import clsx from "clsx";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
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

export const ShowBilling = () => {
	const { data: admin } = api.admin.one.useQuery();
	const { data, refetch } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();

	const [serverQuantity, setServerQuantity] = useState(3);

	const { mutateAsync: upgradeSubscription } =
		api.stripe.upgradeSubscription.useMutation();
	const [isAnnual, setIsAnnual] = useState(false);

	const handleCheckout = async (productId: string) => {
		const stripe = await stripePromise;

		if (data && admin?.stripeSubscriptionId && data.subscriptions.length > 0) {
			upgradeSubscription({
				subscriptionId: admin?.stripeSubscriptionId,
				serverQuantity,
				isAnnual,
			})
				.then(async (subscription) => {
					toast.success("Subscription upgraded successfully");
					await refetch();
				})
				.catch((error) => {
					toast.error("Error to upgrade the subscription");
					console.error(error);
				});
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

	return (
		<div className="flex flex-col gap-4 w-full justify-center">
			<Tabs
				defaultValue="monthly"
				className="w-full"
				onValueChange={(e) => {
					console.log(e);
					setIsAnnual(e === "annual");
				}}
			>
				<TabsList>
					<TabsTrigger value="monthly">Monthly</TabsTrigger>
					<TabsTrigger value="annual">Annual</TabsTrigger>
				</TabsList>
			</Tabs>
			{data?.products?.map((product) => {
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
							<p className="order-first text-3xl font-semibold tracking-tight text-primary">
								$ {calculatePrice(serverQuantity, isAnnual).toFixed(2)} USD
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
									"Free",
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
										data.subscriptions.length > 0
											? "justify-between"
											: "justify-end",
										"flex flex-row  items-center gap-2 mt-4",
									)}
								>
									{data.subscriptions.length > 0 && (
										<ReviewPayment
											isAnnual={isAnnual}
											serverQuantity={serverQuantity}
										/>
									)}

									<div className="justify-end">
										<Button
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

			{/* <Button
            variant="destructive"
            onClick={async () => {
                // Crear una sesión del portal del cliente
                const session = await createCustomerPortalSession();

                // Redirigir al portal del cliente en Stripe
                window.location.href = session.url;
            }}
        >
            Manage Subscription
        </Button> */}
		</div>
	);
};
