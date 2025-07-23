import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import {
	Loader2,
	Server,
	Cpu,
	HardDrive,
	MemoryStick,
	Globe,
	DollarSign,
	Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
							?.sort((a, b) => {
								// Sort by monthly promotional price (first_period_price)
								const monthlyPriceA =
									a.prices.find(
										(p) => p.period === 1 && p.period_unit === "month",
									)?.first_period_price || 0;
								const monthlyPriceB =
									b.prices.find(
										(p) => p.period === 1 && p.period_unit === "month",
									)?.first_period_price || 0;
								return monthlyPriceA - monthlyPriceB;
							})
							?.map((plan) => {
								return (
									<Card
										key={plan.id}
										className="border-2 hover:border-purple-300 transition-colors relative"
									>
										{plan.name === "KVM 2" && (
											<div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
												MOST POPULAR
											</div>
										)}

										<CardHeader className="pb-3">
											<div className="flex justify-between items-start">
												<CardTitle className="text-lg">{plan.name}</CardTitle>
												<Badge variant="secondary">VPS</Badge>
											</div>
											{/* <CardDescription className="text-sm">
												{description}
											</CardDescription> */}
										</CardHeader>

										<CardContent className="pt-0">
											<div className="space-y-4">
												{/* Specs */}
												<div className="grid grid-cols-2 gap-2 text-sm">
													<div className="flex items-center gap-1">
														<Cpu className="h-4 w-4 text-blue-500" />
														<span>{plan.metadata.cpus} vCPU</span>
													</div>
													<div className="flex items-center gap-1">
														<MemoryStick className="h-4 w-4 text-green-500" />
														<span>{plan.metadata.memory}GB RAM</span>
													</div>
													<div className="flex items-center gap-1">
														<HardDrive className="h-4 w-4 text-orange-500" />
														<span>{plan.metadata.disk_space}GB NVMe</span>
													</div>
													<div className="flex items-center gap-1">
														<Globe className="h-4 w-4 text-indigo-500" />
														<span>{plan.metadata.bandwidth}TB</span>
													</div>
												</div>

												{/* Pricing Options */}
												<div className="border-t pt-3">
													<div className="flex items-center gap-2 mb-3">
														<DollarSign className="h-4 w-4 text-green-600" />
														<h4 className="font-medium text-sm">
															Billing options:
														</h4>
													</div>

													<Tabs defaultValue="monthly" className="w-full">
														<TabsList className="grid w-full grid-cols-3">
															<TabsTrigger value="monthly" className="text-xs">
																Monthly
															</TabsTrigger>
															<TabsTrigger value="yearly" className="text-xs">
																Yearly
															</TabsTrigger>
															<TabsTrigger value="biennial" className="text-xs">
																2 Years
															</TabsTrigger>
														</TabsList>

														{/* Monthly prices */}
														<TabsContent value="monthly" className="mt-2">
															{plan.prices
																.filter(
																	(p) =>
																		p.period === 1 && p.period_unit === "month",
																)
																.map((price) => (
																	<div
																		key={price.id}
																		className="p-2 bg-gray-50 rounded-lg"
																	>
																		<div className="flex justify-between items-center">
																			<div className="flex items-center gap-1">
																				<Calendar className="h-3 w-3 text-gray-500" />
																				<span className="text-sm text-gray-600">
																					{formatBillingPeriod(
																						price.period,
																						price.period_unit,
																					)}
																				</span>
																			</div>
																			<div className="text-right">
																				<div className="font-bold text-green-600">
																					$
																					{(
																						price.first_period_price / 100
																					).toFixed(2)}
																					/mo
																				</div>
																				<div className="text-xs line-through text-gray-500">
																					${(price.price / 100).toFixed(2)}/mo
																				</div>
																			</div>
																		</div>
																	</div>
																))}
														</TabsContent>

														{/* Yearly prices */}
														<TabsContent value="yearly" className="mt-2">
															{plan.prices
																.filter(
																	(p) =>
																		p.period === 1 && p.period_unit === "year",
																)
																.map((price) => {
																	const monthlyEquivalent = plan.prices.find(
																		(p) =>
																			p.period === 1 &&
																			p.period_unit === "month",
																	);
																	const savings = monthlyEquivalent
																		? calculateSavings(
																				monthlyEquivalent.price / 100,
																				price.first_period_price / 100,
																			)
																		: 0;

																	return (
																		<div
																			key={price.id}
																			className="p-2 bg-blue-50 rounded-lg"
																		>
																			<div className="flex justify-between items-center">
																				<div className="flex items-center gap-1">
																					<Calendar className="h-3 w-3 text-blue-500" />
																					<span className="text-sm text-blue-600">
																						{formatBillingPeriod(
																							price.period,
																							price.period_unit,
																						)}
																					</span>
																				</div>
																				<div className="text-right">
																					<div className="font-bold text-blue-600">
																						$
																						{(
																							price.first_period_price / 100
																						).toFixed(2)}
																						/year
																					</div>
																					<div className="text-xs line-through text-gray-500">
																						${(price.price / 100).toFixed(2)}
																						/year
																					</div>
																				</div>
																			</div>
																			{savings > 0 && (
																				<div className="text-xs text-green-600 mt-1">
																					💰 Savings: ${savings.toFixed(2)} vs
																					monthly
																				</div>
																			)}
																		</div>
																	);
																})}
														</TabsContent>

														{/* Biennial prices */}
														<TabsContent value="biennial" className="mt-2">
															{plan.prices
																.filter(
																	(p) =>
																		p.period === 2 && p.period_unit === "year",
																)
																.map((price) => {
																	const monthlyEquivalent = plan.prices.find(
																		(p) =>
																			p.period === 1 &&
																			p.period_unit === "month",
																	);
																	const savings = monthlyEquivalent
																		? calculateSavings(
																				(monthlyEquivalent.price / 100) * 24,
																				price.first_period_price / 100,
																			)
																		: 0;

																	return (
																		<div
																			key={price.id}
																			className="p-2 bg-purple-50 rounded-lg"
																		>
																			<div className="flex justify-between items-center">
																				<div className="flex items-center gap-1">
																					<Calendar className="h-3 w-3 text-purple-500" />
																					<span className="text-sm text-purple-600">
																						{formatBillingPeriod(
																							price.period,
																							price.period_unit,
																						)}
																					</span>
																				</div>
																				<div className="text-right">
																					<div className="font-bold text-purple-600">
																						$
																						{(
																							price.first_period_price / 100
																						).toFixed(2)}
																						/2 years
																					</div>
																					<div className="text-xs line-through text-gray-500">
																						${(price.price / 100).toFixed(2)}/2
																						years
																					</div>
																				</div>
																			</div>
																			{savings > 0 && (
																				<div className="text-xs text-green-600 mt-1">
																					💰 Savings: ${savings.toFixed(2)} vs
																					monthly
																				</div>
																			)}
																		</div>
																	);
																})}
														</TabsContent>
													</Tabs>
												</div>

												{/* Features */}
												<div className="border-t pt-3">
													<h4 className="font-medium text-sm mb-2">
														Included features:
													</h4>
													<div className="grid grid-cols-1 gap-1">
														{[
															"NVMe SSD storage",
															"AMD EPYC processors",
															"1000 Mb/s network",
															"Free weekly backups",
															"DDoS protection",
															"Kodee AI assistant",
														].map((feature, index) => (
															<div
																key={index}
																className="flex items-center gap-1 text-xs"
															>
																<div className="w-1 h-1 bg-green-500 rounded-full" />
																<span className="text-muted-foreground">
																	{feature}
																</span>
															</div>
														))}
													</div>
												</div>

												{/* Locations */}
												<div className="border-t pt-3">
													<h4 className="font-medium text-sm mb-2">
														Available locations:
													</h4>
													<div className="flex flex-wrap gap-1">
														{["US", "UK", "NL", "LT", "SG", "BR", "IN"].map(
															(location, index) => (
																<Badge
																	key={index}
																	variant="outline"
																	className="text-xs"
																>
																	{location}
																</Badge>
															),
														)}
													</div>
												</div>
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
