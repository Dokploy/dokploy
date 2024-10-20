import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { format } from "date-fns";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { calculatePrice } from "./show-billing";

interface Props {
	isAnnual: boolean;
	serverQuantity: number;
}

export const ReviewPayment = ({ isAnnual, serverQuantity }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: billingSubscription } =
		api.stripe.getBillingSubscription.useQuery();

	const { data: calculateUpgradeCost } =
		api.stripe.calculateUpgradeCost.useQuery(
			{
				serverQuantity,
				isAnnual,
			},
			{
				enabled: !!serverQuantity && isOpen,
			},
		);

	// const { data: calculateNewMonthlyCost } =
	// 	api.stripe.calculateNewMonthlyCost.useQuery(
	// 		{
	// 			serverQuantity,
	// 			isAnnual,
	// 		},
	// 		{
	// 			enabled: !!serverQuantity && isOpen,
	// 		},
	// 	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Review Payment</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Upgrade Plan</DialogTitle>
					<DialogDescription>
						You are about to upgrade your plan to a{" "}
						{isAnnual ? "annual" : "monthly"} plan. This will automatically
						renew your subscription.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-row w-full gap-4 items-center">
					<div className="flex flex-col border gap-4 p-4 rounded-lg w-full">
						<Label className="text-base font-semibold border-b border-b-divider pb-2">
							Current Plan
						</Label>
						<div className="grid flex-1 gap-2">
							<Label>Amount</Label>
							<span className="text-sm text-muted-foreground">
								${billingSubscription?.monthlyAmount}
							</span>
						</div>
						<div className="grid flex-1 gap-2">
							<Label>Servers</Label>

							<span className="text-sm text-muted-foreground">
								{billingSubscription?.totalServers}
							</span>
						</div>
						<div className="grid flex-1 gap-2">
							<Label>Next Payment</Label>
							<span className="text-sm text-muted-foreground">
								{billingSubscription?.nextPaymentDate
									? format(billingSubscription?.nextPaymentDate, "MMM d, yyyy")
									: "-"}
								{/* {format(billingSubscription?.nextPaymentDate, "MMM d, yyyy")} */}
							</span>
						</div>
					</div>
					<div className="size-10">
						<ArrowRightIcon className="size-6" />
					</div>
					<div className="flex flex-col border gap-4 p-4 rounded-lg w-full">
						<Label className="text-base font-semibold border-b border-b-divider pb-2">
							New Plan
						</Label>
						<div className="grid flex-1 gap-2">
							<Label>Amount</Label>
							<span className="text-sm text-muted-foreground">
								${calculatePrice(serverQuantity).toFixed(2)}
							</span>
						</div>
						<div className="grid flex-1 gap-2">
							<Label>Servers</Label>
							<span className="text-sm text-muted-foreground">
								{serverQuantity}
							</span>
						</div>
						<div className="grid flex-1 gap-2">
							<Label>Difference</Label>
							<span className="text-sm text-muted-foreground">
								{Number(billingSubscription?.totalServers) === serverQuantity
									? "-"
									: `$${calculateUpgradeCost} USD`}{" "}
							</span>
						</div>
						{/* <div className="grid flex-1 gap-2">
							<Label>New {isAnnual ? "annual" : "monthly"} cost</Label>
							<span className="text-sm text-muted-foreground">
								{Number(billingSubscription?.totalServers) === serverQuantity
									? "-"
									: `${calculateNewMonthlyCost} USD`}{" "}
							</span>
						</div> */}
					</div>
				</div>

				<DialogFooter className="sm:justify-end">
					<DialogClose asChild>
						<Button type="button" variant="secondary">
							Pay
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
