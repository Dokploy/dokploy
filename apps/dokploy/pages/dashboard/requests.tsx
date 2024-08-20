import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { validateRequest } from "@/server/auth/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import * as React from "react";
import { ShowRequests } from "@/components/dashboard/requests/show-requests";

export default function Requests() {
	return (
		<>
			{/* <Card className="bg-transparent mt-10">
				<CardHeader>
					<CardTitle>Request Distribution</CardTitle>
					<CardDescription>
						Showing web and API requests over time
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer width="100%" height={200}>
						<ChartContainer config={chartConfig}>
							<AreaChart
								accessibilityLayer
								data={data?.hourlyData || []}
								margin={{
									left: 12,
									right: 12,
								}}
							>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="hour"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									tickFormatter={(value) =>
										new Date(value).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})
									}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} />
								<ChartTooltip
									cursor={false}
									content={<ChartTooltipContent indicator="line" />}
									labelFormatter={(value) =>
										new Date(value).toLocaleString([], {
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})
									}
								/>
								<Area
									dataKey="count"
									type="natural"
									fill="hsl(var(--chart-1))"
									fillOpacity={0.4}
									stroke="hsl(var(--chart-1))"
								/>
							</AreaChart>
						</ChartContainer>
					</ResponsiveContainer>
				</CardContent>
			</Card> */}

			{/* <div className="flex flex-col gap-6">
				<Table>
					<TableCaption>See all users</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[100px]">Level</TableHead>
							<TableHead className="text-center">Message</TableHead>
							<TableHead className="text-center">Created</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data?.data?.map((log, index) => {
							return (
								<TableRow
									key={`${log.time}-${index}`}
									onClick={() => console.log(log)}
								>
									<TableCell className="text-center">
										<Badge variant={"secondary"}>{log.level}</Badge>
									</TableCell>
									<TableCell className=" flex flex-col gap-2">
										<div>
											{log.RequestMethod} {log.RequestPath}
										</div>
										<div className="flex flex-row gap-3 w-full">
											<Badge variant={"secondary"}>
												Status: {log.OriginStatus}
											</Badge>
											<Badge variant={"secondary"}>
												Exec Time: {log.Duration} ms
											</Badge>
											<Badge variant={"secondary"}>{log.ClientAddr}</Badge>
										</div>
									</TableCell>
									<TableCell className="text-center">
										{new Date(log.time).toLocaleString([], {
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</TableCell>
									<TableCell className="text-right flex justify-end">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" className="h-8 w-8 p-0">
													<span className="sr-only">Open menu</span>
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuLabel>Actions</DropdownMenuLabel>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div> */}
			<ShowRequests />
		</>
	);
}
Requests.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"requests"}>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { user } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
