import { zodResolver } from "@hookform/resolvers/zod";
import {
	Calendar,
	Cpu,
	DollarSign,
	Globe,
	HardDrive,
	Loader2,
	MemoryStick,
	Server,
} from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";

const formSchema = z.object({
	datacenter: z.string({
		required_error: "Please select a datacenter",
	}),
	plan: z.string({
		required_error: "Please select a server plan",
	}),
	billingPeriod: z.object(
		{
			unit: z.enum(["month", "year"]),
			period: z.number(),
		},
		{
			required_error: "Please select a billing period",
		},
	),
});

// Format billing period
function formatBillingPeriod(period: number, unit: string): string {
	if (unit === "month") {
		return period === 1 ? "Monthly" : `${period} months`;
	}
	if (unit === "year") {
		return period === 1 ? "Yearly" : `${period} years`;
	}
	return `${period} ${unit}`;
}

// Convert price from cents to dollars
function formatPrice(priceInCents: number): string {
	return (priceInCents / 100).toFixed(2);
}

// Calculate yearly savings
function calculateSavings(
	monthlyPriceInCents: number,
	yearlyPriceInCents: number,
): number {
	return (monthlyPriceInCents * 12 - yearlyPriceInCents) / 100;
}

type FormData = z.infer<typeof formSchema>;

export const ShowHostingerServers = () => {
	const { data: vpsPlans, isLoading: plansLoading } =
		api.hostinger.vpsPlans.useQuery();
	const { data: dataCenters, isLoading: centersLoading } =
		api.hostinger.dataCenters.useQuery();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			datacenter: "",
			plan: "",
			billingPeriod: {
				unit: "month",
				period: 1,
			},
		},
	});

	const isLoading = plansLoading || centersLoading;

	function onSubmit(data: FormData) {
		console.log(data);
		// Handle form submission here
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-4">
				<Loader2 className="h-6 w-6 animate-spin" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<Card className="bg-transparent">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Server className="h-5 w-5" />
						Hostinger VPS Plans
						<Badge variant="outline" className="text-xs text-muted-foreground">
							Sorted by price
						</Badge>
					</CardTitle>
					<CardDescription>
						VPS plans with real pricing from Hostinger API
						<br />
						<span className="text-xs text-orange-600">
							💡 Promotional pricing applies to first billing period only
						</span>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
							{/* Data Center Selection */}
							<FormField
								control={form.control}
								name="datacenter"
								render={({ field }) => (
									<FormItem className="space-y-4">
										<FormLabel>
											<div className="flex items-center gap-2">
												<Globe className="h-5 w-5 text-muted-foreground" />
												<span className="text-lg font-medium">
													Select Data Center
												</span>
											</div>
										</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={field.onChange}
												defaultValue={field.value}
												className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
											>
												{dataCenters?.map((center) => (
													<FormItem key={center.id}>
														<FormControl>
															<RadioGroupItem
																value={center.id?.toString() || ""}
																className="peer sr-only"
															/>
														</FormControl>
														<FormLabel className="p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 peer-aria-checked:border-purple-500 peer-aria-checked:bg-purple-50 dark:peer-aria-checked:bg-purple-950 hover:border-purple-300 cursor-pointer">
															<Globe className="h-6 w-6 text-muted-foreground" />
															<span className="text-sm font-medium text-center">
																{center.city} / {center.continent}
															</span>
														</FormLabel>
													</FormItem>
												))}
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Billing Period Selection */}
							<FormField
								control={form.control}
								name="billingPeriod"
								render={({ field }) => (
									<FormItem className="space-y-4">
										<FormLabel>
											<div className="flex items-center gap-2">
												<Calendar className="h-5 w-5 text-muted-foreground" />
												<span className="text-lg font-medium">
													Billing Period
												</span>
											</div>
										</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={(value) => {
													switch (value) {
														case "monthly":
															field.onChange({ unit: "month", period: 1 });
															break;
														case "yearly":
															field.onChange({ unit: "year", period: 1 });
															break;
														case "2years":
															field.onChange({ unit: "year", period: 2 });
															break;
													}
												}}
												defaultValue="monthly"
												className="grid w-full grid-cols-3 lg:w-[600px] gap-4"
											>
												<FormItem>
													<FormControl>
														<RadioGroupItem
															value="monthly"
															className="peer sr-only"
														/>
													</FormControl>
													<FormLabel className="flex items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 peer-aria-checked:border-purple-500 peer-aria-checked:bg-purple-50 dark:peer-aria-checked:bg-purple-950 hover:border-purple-300 cursor-pointer">
														Monthly Billing
													</FormLabel>
												</FormItem>
												<FormItem>
													<FormControl>
														<RadioGroupItem
															value="yearly"
															className="peer sr-only"
														/>
													</FormControl>
													<FormLabel className="flex items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 peer-aria-checked:border-purple-500 peer-aria-checked:bg-purple-50 dark:peer-aria-checked:bg-purple-950 hover:border-purple-300 cursor-pointer">
														Annual Billing
													</FormLabel>
												</FormItem>
												<FormItem>
													<FormControl>
														<RadioGroupItem
															value="2years"
															className="peer sr-only"
														/>
													</FormControl>
													<FormLabel className="flex items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 peer-aria-checked:border-purple-500 peer-aria-checked:bg-purple-50 dark:peer-aria-checked:bg-purple-950 hover:border-purple-300 cursor-pointer">
														2 Year Billing
													</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* VPS Plans Selection */}
							<FormField
								control={form.control}
								name="plan"
								render={({ field }) => (
									<FormItem className="space-y-4">
										<FormLabel>
											<div className="flex items-center gap-2">
												<Server className="h-5 w-5 text-muted-foreground" />
												<span className="text-lg font-medium">
													Select Server Plan
												</span>
											</div>
										</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={field.onChange}
												defaultValue={field.value}
												className="grid grid-cols-1 lg:grid-cols-2 gap-6"
											>
												{vpsPlans
													?.sort((a, b) => {
														const billingPeriod = form.watch("billingPeriod");
														const priceA =
															a.prices?.find(
																(p) =>
																	p.period_unit === billingPeriod.unit &&
																	p.period === billingPeriod.period,
															)?.price || 0;
														const priceB =
															b.prices?.find(
																(p) =>
																	p.period_unit === billingPeriod.unit &&
																	p.period === billingPeriod.period,
															)?.price || 0;
														return priceA - priceB;
													})
													?.map((plan) => {
														const monthlyPrice =
															plan.prices?.find(
																(p) =>
																	p.period === 1 && p.period_unit === "month",
															)?.price || 0;

														const selectedPrice = plan.prices?.find(
															(p) =>
																p.period_unit ===
																	form.watch("billingPeriod.unit") &&
																p.period === form.watch("billingPeriod.period"),
														);

														if (!selectedPrice) return null;

														return (
															<FormItem key={plan.id}>
																<FormControl>
																	<RadioGroupItem
																		value={plan.id || ""}
																		className="peer sr-only"
																	/>
																</FormControl>
																<FormLabel className="w-full cursor-pointer">
																	<Card
																		className={`border-2 transition-all duration-200 relative bg-transparent hover:border-purple-300 hover:shadow-lg ${field.value === plan.id ? "border-purple-500 bg-purple-950/40" : ""}`}
																	>
																		{plan.name === "KVM 2" && (
																			<div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
																				MOST POPULAR
																			</div>
																		)}
																		<CardHeader>
																			<CardTitle>{plan.name}</CardTitle>
																			<CardDescription>
																				{"High-performance VPS hosting"}
																			</CardDescription>
																		</CardHeader>
																		<CardContent>
																			<div className="flex flex-col gap-4">
																				<div className="grid grid-cols-3 gap-4">
																					<div className="flex flex-col items-center p-2 bg-muted rounded-lg">
																						<Cpu className="h-4 w-4 mb-1 text-muted-foreground" />
																						<span className="text-sm font-medium">
																							{plan.metadata?.cpus || 1} vCPU
																						</span>
																						<span className="text-xs text-muted-foreground">
																							Cores
																						</span>
																					</div>
																					<div className="flex flex-col items-center p-2 bg-muted rounded-lg">
																						<MemoryStick className="h-4 w-4 mb-1 text-muted-foreground" />
																						<span className="text-sm font-medium">
																							{Number.parseInt(
																								plan.metadata?.memory || "2048",
																							) / 1024}{" "}
																							GB
																						</span>
																						<span className="text-xs text-muted-foreground">
																							RAM
																						</span>
																					</div>
																					<div className="flex flex-col items-center p-2 bg-muted rounded-lg">
																						<HardDrive className="h-4 w-4 mb-1 text-muted-foreground" />
																						<span className="text-sm font-medium">
																							{Number.parseInt(
																								plan.metadata?.disk_space ||
																									"20480",
																							) / 1024}{" "}
																							GB
																						</span>
																						<span className="text-xs text-muted-foreground">
																							SSD
																						</span>
																					</div>
																				</div>

																				<div className="mt-2">
																					<div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
																						<div className="flex items-center">
																							<Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
																							<span className="text-sm">
																								{formatBillingPeriod(
																									selectedPrice.period || 1,
																									selectedPrice.period_unit ||
																										"month",
																								)}
																							</span>
																						</div>
																						<div className="flex items-center">
																							<DollarSign className="h-4 w-4 mr-1 text-primary" />
																							<span className="text-lg font-semibold">
																								$
																								{formatPrice(
																									selectedPrice.price || 0,
																								)}
																							</span>
																							{selectedPrice.period_unit ===
																								"year" && (
																								<Badge
																									variant="outline"
																									className="ml-2 text-xs"
																								>
																									Save $
																									{calculateSavings(
																										monthlyPrice,
																										selectedPrice.price || 0,
																									).toFixed(2)}
																									/yr
																								</Badge>
																							)}
																						</div>
																					</div>
																				</div>
																			</div>
																		</CardContent>
																	</Card>
																</FormLabel>
															</FormItem>
														);
													})}
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button type="submit" className="w-full">
								Create Server
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
