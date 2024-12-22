import {
	DiscordIcon,
	SlackIcon,
	TelegramIcon,
} from "@/components/icons/notification-icons";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { BellRing, Mail } from "lucide-react";
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
								To send notifications it is required to set at least 1 provider.
							</span>
							<AddNotification />
						</div>
					) : (
						<div className="flex flex-col gap-4">
							<div className="grid lg:grid-cols-1 xl:grid-cols-2 gap-4">
								{data?.map((notification, index) => (
									<div
										key={notification.notificationId}
										className="flex items-center justify-between rounded-xl p-4 transition-colors dark:bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/50"
									>
										<div className="flex items-center gap-4">
											{notification.notificationType === "slack" && (
												<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10">
													<SlackIcon className="h-6 w-6 text-indigo-400" />
												</div>
											)}
											{notification.notificationType === "telegram" && (
												<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10">
													<TelegramIcon className="h-6 w-6 text-indigo-400" />
												</div>
											)}
											{notification.notificationType === "discord" && (
												<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10">
													<DiscordIcon className="h-6 w-6 text-indigo-400" />
												</div>
											)}
											{notification.notificationType === "email" && (
												<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-500/10">
													<Mail className="h-6 w-6 text-indigo-400" />
												</div>
											)}
											<div className="flex flex-col">
												<span className="text-sm font-medium text-zinc-300">
													{notification.name}
												</span>
												<span className="text-xs font-medium text-muted-foreground">
													{notification.notificationType?.[0]?.toUpperCase() +
														notification.notificationType?.slice(1)}{" "}
													notification
												</span>
											</div>
										</div>
										<div className="flex items-center gap-2">
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
