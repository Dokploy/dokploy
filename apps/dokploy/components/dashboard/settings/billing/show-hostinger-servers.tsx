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
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

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

// Calculate yearly savings
function calculateSavings(monthlyPrice: number, yearlyPrice: number): number {
	return monthlyPrice * 12 - yearlyPrice;
}

export const ShowHostingerServers = () => {
	const { data: vpsPlans, isLoading } = api.hostinger.vpsPlans.useQuery();

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
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{vpsPlans
							?.sort((a: any, b: any) => {
								// Sort by monthly promotional price (first_period_price)
								const monthlyPriceA =
									a.prices?.find(
										(p: any) => p.period === 1 && p.period_unit === "month",
									)?.first_period_price || 0;
								const monthlyPriceB =
									b.prices?.find(
										(p: any) => p.period === 1 && p.period_unit === "month",
									)?.first_period_price || 0;
								return monthlyPriceA - monthlyPriceB;
							})
							?.map((plan: any) => {
								const monthlyPrice =
									plan.prices?.find(
										(p: any) => p.period === 1 && p.period_unit === "month",
									)?.first_period_price || 0;
								return (
									<Card
										key={plan.id}
										className="border-2 hover:border-purple-300 transition-all duration-200 hover:shadow-lg relative"
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
															{plan.metadata?.cpu || 1} vCPU
														</span>
														<span className="text-xs text-muted-foreground">
															Cores
														</span>
													</div>
													<div className="flex flex-col items-center p-2 bg-muted rounded-lg">
														<MemoryStick className="h-4 w-4 mb-1 text-muted-foreground" />
														<span className="text-sm font-medium">
															{plan.metadata?.ram || 2} GB
														</span>
														<span className="text-xs text-muted-foreground">
															RAM
														</span>
													</div>
													<div className="flex flex-col items-center p-2 bg-muted rounded-lg">
														<HardDrive className="h-4 w-4 mb-1 text-muted-foreground" />
														<span className="text-sm font-medium">
															{plan.metadata?.disk || 20} GB
														</span>
														<span className="text-xs text-muted-foreground">
															SSD
														</span>
													</div>
												</div>

												{plan.prices?.map((price: any) => (
													<div
														key={`${price.period}-${price.period_unit}`}
														className="mt-2"
													>
														<div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
															<div className="flex items-center">
																<Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
																<span className="text-sm">
																	{formatBillingPeriod(
																		price.period || 1,
																		price.period_unit || "month",
																	)}
																</span>
															</div>
															<div className="flex items-center">
																<DollarSign className="h-4 w-4 mr-1 text-primary" />
																<span className="text-lg font-semibold">
																	${(price.first_period_price || 0).toFixed(2)}
																</span>
																{price.period_unit === "year" && (
																	<Badge
																		variant="outline"
																		className="ml-2 text-xs"
																	>
																		Save $
																		{calculateSavings(
																			monthlyPrice,
																			price.first_period_price || 0,
																		).toFixed(2)}
																		/yr
																	</Badge>
																)}
															</div>
														</div>
													</div>
												))}
											</div>
										</CardContent>
									</Card>
								);
							})}
					</div>

					{(!vpsPlans || vpsPlans.length === 0) && (
						<div className="text-center py-8 text-muted-foreground">
							Could not load VPS plans. Please retry later.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
