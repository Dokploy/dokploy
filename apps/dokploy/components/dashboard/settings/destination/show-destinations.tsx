import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { FolderUp, Database } from "lucide-react";
import { AddDestination } from "./add-destination";
import { DeleteDestination } from "./delete-destination";
import { UpdateDestination } from "./update-destination";
import { AlertBlock } from "@/components/shared/alert-block";

export const ShowDestinations = () => {
	const { data } = api.destination.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar w-[55rem] p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Database className="size-6 text-muted-foreground self-center" />
							S3 Destinations
						</CardTitle>
						<CardDescription>
							Add your providers like AWS S3, Cloudflare R2, Wasabi,
							DigitalOcean Spaces etc.
						</CardDescription>
						{/* <AlertBlock>
							This is your backup storage for your applications
						</AlertBlock> */}
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{data?.length === 0 ? (
							<div className="flex flex-col items-center gap-3">
								<FolderUp className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									To create a backup it is required to set at least 1 provider.
								</span>
								<AddDestination />
							</div>
						) : (
							<div className="flex flex-col gap-4 ">
								<div className="flex flex-col gap-4 rounded-lg ">
									{data?.map((destination, index) => (
										<div
											key={destination.destinationId}
											className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
										>
											<div className="flex items-center justify-between  p-3.5 rounded-lg bg-background border  w-full">
												<span className="text-sm">
													{index + 1}. {destination.name}
												</span>
												<div className="flex flex-row gap-1">
													<UpdateDestination
														destinationId={destination.destinationId}
													/>
													<DeleteDestination
														destinationId={destination.destinationId}
													/>
												</div>
											</div>
										</div>
									))}
								</div>

								<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
									<AddDestination />
								</div>
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
