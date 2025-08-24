import { Bell, Loader2, Mail, MessageCircleMore, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
	DiscordIcon,
	SlackIcon,
	TelegramIcon,
} from "@/components/icons/notification-icons";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { HandleNotifications } from "./handle-notifications";

export const ShowNotifications = () => {
	const { data, isLoading, refetch } = api.notification.all.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.notification.remove.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Bell className="size-6 text-muted-foreground self-center" />
							Notifications
						</CardTitle>
						<CardDescription>
							Add your providers to receive notifications, like Discord, Slack,
							Telegram, Email.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<Bell />
										<span className="text-base text-muted-foreground text-center">
											To send notifications it is required to set at least 1
											provider.
										</span>
										<HandleNotifications />
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((notification, _index) => (
												<div
													key={notification.notificationId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
														<span className="text-sm flex flex-row items-center gap-4">
															{notification.notificationType === "slack" && (
																<div className="flex  items-center justify-center rounded-lg">
																	<SlackIcon className="size-6" />
																</div>
															)}
															{notification.notificationType === "telegram" && (
																<div className="flex  items-center justify-center rounded-lg ">
																	<TelegramIcon className="size-7 " />
																</div>
															)}
															{notification.notificationType === "discord" && (
																<div className="flex  items-center justify-center rounded-lg">
																	<DiscordIcon className="size-7 " />
																</div>
															)}
															{notification.notificationType === "email" && (
																<div className="flex  items-center justify-center rounded-lg ">
																	<Mail className="size-6 text-muted-foreground" />
																</div>
															)}
															{notification.notificationType === "gotify" && (
																<div className="flex  items-center justify-center rounded-lg ">
																	<MessageCircleMore className="size-6 text-muted-foreground" />
																</div>
															)}

															{notification.name}
														</span>
														<div className="flex flex-row gap-1">
															<HandleNotifications
																notificationId={notification.notificationId}
															/>

															<DialogAction
																title="Delete Notification"
																description="Are you sure you want to delete this notification?"
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		notificationId: notification.notificationId,
																	})
																		.then(() => {
																			toast.success(
																				"Notification deleted successfully",
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error(
																				"Error deleting notification",
																			);
																		});
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-red-500/10 "
																	isLoading={isRemoving}
																>
																	<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																</Button>
															</DialogAction>
														</div>
													</div>
												</div>
											))}
										</div>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<HandleNotifications />
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
