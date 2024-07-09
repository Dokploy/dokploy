import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { BellRing } from "lucide-react";
import { AddNotification } from "./add-notification";

export const ShowNotifications = () => {
	const { data } = api.notification.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">Notifications</CardTitle>
					<CardDescription>
						Add your providers to receive notifications, like Discord, Slack,
						Telegram, Email, etc.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<BellRing className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To send notifications is required to set at least 1 provider.
							</span>
							<AddNotification />
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{data?.map((destination, index) => (
								<div
									key={destination.notificationId}
									className="flex items-center justify-between border p-3.5 rounded-lg"
								>
									<span className="text-sm text-muted-foreground">
										{index + 1}. {destination.name}
									</span>
									{/* <div className="flex flex-row gap-1">
										<UpdateDestination
											destinationId={destination.destinationId}
										/>
										<DeleteDestination
											destinationId={destination.destinationId}
										/>
									</div> */}
								</div>
							))}
							<div>
								<AddNotification />
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
