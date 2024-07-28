import { BellRing, Mail } from "lucide-react";
import {
	DiscordIcon,
	SlackIcon,
	TelegramIcon,
} from "~/components/icons/notification-icons";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { api } from "~/utils/api";
import { AddNotification } from "./add-notification";
import { DeleteNotification } from "./delete-notification";
import { UpdateNotification } from "./update-notification";

export const ShowNotifications = () => {
	const { data } = api.notification.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">Notifications</CardTitle>
					<CardDescription>
						Add your providers to receive notifications, like Discord, Slack,
						Telegram, Email.
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
							<div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
								{data?.map((notification, index) => (
									<div
										key={notification.notificationId}
										className="flex items-center justify-between border gap-2 p-3.5 rounded-lg"
									>
										<div className="flex flex-row gap-2 items-center w-full ">
											{notification.notificationType === "slack" && (
												<SlackIcon className="text-muted-foreground size-6 flex-shrink-0" />
											)}
											{notification.notificationType === "telegram" && (
												<TelegramIcon className="text-muted-foreground size-8 flex-shrink-0" />
											)}
											{notification.notificationType === "discord" && (
												<DiscordIcon className="text-muted-foreground size-7 flex-shrink-0" />
											)}
											{notification.notificationType === "email" && (
												<Mail
													size={29}
													className="text-muted-foreground size-6 flex-shrink-0"
												/>
											)}
											<span className="text-sm text-muted-foreground">
												{notification.name}
											</span>
										</div>

										<div className="flex flex-row gap-1 w-fit">
											<UpdateNotification
												notificationId={notification.notificationId}
											/>
											<DeleteNotification
												notificationId={notification.notificationId}
											/>
										</div>
									</div>
								))}
							</div>
							<div className="flex flex-col gap-4 justify-end w-full items-end">
								<AddNotification />
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
