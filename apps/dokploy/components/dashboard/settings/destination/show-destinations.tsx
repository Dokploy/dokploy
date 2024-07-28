import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { FolderUp } from "lucide-react";
import { AddDestination } from "./add-destination";
import { DeleteDestination } from "./delete-destination";
import { UpdateDestination } from "./update-destination";

export const ShowDestinations = () => {
	const { data } = api.destination.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">S3 Destinations</CardTitle>
					<CardDescription>
						Add your providers like AWS S3, Cloudflare R2, Wasabi, DigitalOcean
						Spaces etc.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<FolderUp className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a backup is required to set at least 1 provider.
							</span>
							<AddDestination />
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{data?.map((destination, index) => (
								<div
									key={destination.destinationId}
									className="flex items-center justify-between border p-3.5 rounded-lg"
								>
									<span className="text-sm text-muted-foreground">
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
							))}
							<div>
								<AddDestination />
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
