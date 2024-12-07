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
import { useTranslation } from "next-i18next";

export const ShowDestinations = () => {
	const { t } = useTranslation("settings");
	const { data } = api.destination.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">
						{t("settings.s3destinations.title")}
					</CardTitle>
					<CardDescription>
						{t("settings.s3destinations.description")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<FolderUp className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								{t("settings.s3destinations.required")}
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
