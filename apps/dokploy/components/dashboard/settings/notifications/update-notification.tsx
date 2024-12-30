import {
	DiscordIcon,
	SlackIcon,
	TelegramIcon,
} from "@/components/icons/notification-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Pen } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type NotificationSchema,
	notificationSchema,
} from "./add-notification";

interface Props {
	notificationId: string;
}

export const UpdateNotification = ({ notificationId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data, refetch } = api.notification.one.useQuery(
		{
			notificationId,
		},
		{
			enabled: !!notificationId,
		},
	);
	const { mutateAsync: testSlackConnection, isLoading: isLoadingSlack } =
		api.notification.testSlackConnection.useMutation();

	const { mutateAsync: testTelegramConnection, isLoading: isLoadingTelegram } =
		api.notification.testTelegramConnection.useMutation();
	const { mutateAsync: testDiscordConnection, isLoading: isLoadingDiscord } =
		api.notification.testDiscordConnection.useMutation();
	const { mutateAsync: testEmailConnection, isLoading: isLoadingEmail } =
		api.notification.testEmailConnection.useMutation();
	const slackMutation = api.notification.updateSlack.useMutation();
	const telegramMutation = api.notification.updateTelegram.useMutation();
	const discordMutation = api.notification.updateDiscord.useMutation();
	const emailMutation = api.notification.updateEmail.useMutation();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const form = useForm<NotificationSchema>({
		defaultValues: {
			type: "slack",
			webhookUrl: "",
			channel: "",
		},
		resolver: zodResolver(notificationSchema),
	});
	const type = form.watch("type");

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "toAddresses" as never,
	});

	useEffect(() => {
		if (data) {
			if (data.notificationType === "slack") {
				form.reset({
					appBuildError: data.appBuildError,
					appDeploy: data.appDeploy,
					dokployRestart: data.dokployRestart,
					databaseBackup: data.databaseBackup,
					dockerCleanup: data.dockerCleanup,
					webhookUrl: data.slack?.webhookUrl,
					channel: data.slack?.channel || "",
					name: data.name,
					type: data.notificationType,
				});
			} else if (data.notificationType === "telegram") {
				form.reset({
					appBuildError: data.appBuildError,
					appDeploy: data.appDeploy,
					dokployRestart: data.dokployRestart,
					databaseBackup: data.databaseBackup,
					botToken: data.telegram?.botToken,
					chatId: data.telegram?.chatId,
					type: data.notificationType,
					name: data.name,
					dockerCleanup: data.dockerCleanup,
				});
			} else if (data.notificationType === "discord") {
				form.reset({
					appBuildError: data.appBuildError,
					appDeploy: data.appDeploy,
					dokployRestart: data.dokployRestart,
					databaseBackup: data.databaseBackup,
					type: data.notificationType,
					webhookUrl: data.discord?.webhookUrl,
					decoration: data.discord?.decoration || undefined,
					name: data.name,
					dockerCleanup: data.dockerCleanup,
				});
			} else if (data.notificationType === "email") {
				form.reset({
					appBuildError: data.appBuildError,
					appDeploy: data.appDeploy,
					dokployRestart: data.dokployRestart,
					databaseBackup: data.databaseBackup,
					type: data.notificationType,
					smtpServer: data.email?.smtpServer,
					smtpPort: data.email?.smtpPort,
					username: data.email?.username,
					password: data.email?.password,
					toAddresses: data.email?.toAddresses,
					fromAddress: data.email?.fromAddress,
					name: data.name,
					dockerCleanup: data.dockerCleanup,
				});
			}
		}
	}, [form, form.reset, data]);

	const onSubmit = async (formData: NotificationSchema) => {
		const {
			appBuildError,
			appDeploy,
			dokployRestart,
			databaseBackup,
			dockerCleanup,
		} = formData;
		let promise: Promise<unknown> | null = null;
		if (formData?.type === "slack" && data?.slackId) {
			promise = slackMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				webhookUrl: formData.webhookUrl,
				channel: formData.channel,
				name: formData.name,
				notificationId: notificationId,
				slackId: data?.slackId,
				dockerCleanup: dockerCleanup,
			});
		} else if (formData.type === "telegram" && data?.telegramId) {
			promise = telegramMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				botToken: formData.botToken,
				chatId: formData.chatId,
				name: formData.name,
				notificationId: notificationId,
				telegramId: data?.telegramId,
				dockerCleanup: dockerCleanup,
			});
		} else if (formData.type === "discord" && data?.discordId) {
			promise = discordMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				webhookUrl: formData.webhookUrl,
				decoration: formData.decoration,
				name: formData.name,
				notificationId: notificationId,
				discordId: data?.discordId,
				dockerCleanup: dockerCleanup,
			});
		} else if (formData.type === "email" && data?.emailId) {
			promise = emailMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				smtpServer: formData.smtpServer,
				smtpPort: formData.smtpPort,
				username: formData.username,
				password: formData.password,
				fromAddress: formData.fromAddress,
				toAddresses: formData.toAddresses,
				name: formData.name,
				notificationId: notificationId,
				emailId: data?.emailId,
				dockerCleanup: dockerCleanup,
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success("Notification Updated");
					await utils.notification.all.invalidate();
					refetch();
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error updating a notification");
				});
		}
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9 dark:hover:bg-zinc-900/80 hover:bg-gray-200/80"
				>
					<Pen className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Update Notification</DialogTitle>
					<DialogDescription>
						Update the current notification config
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4 ">
							<div className="flex flex-row gap-2 w-full items-center">
								<div className="flex flex-row gap-2 items-center w-full ">
									<FormLabel className="text-lg font-semibold leading-none tracking-tight flex">
										{data?.notificationType === "slack"
											? "Slack"
											: data?.notificationType === "telegram"
												? "Telegram"
												: data?.notificationType === "discord"
													? "Discord"
													: "Email"}
									</FormLabel>
								</div>
								{data?.notificationType === "slack" && (
									<SlackIcon className="text-muted-foreground size-6 flex-shrink-0" />
								)}
								{data?.notificationType === "telegram" && (
									<TelegramIcon className="text-muted-foreground size-8 flex-shrink-0" />
								)}
								{data?.notificationType === "discord" && (
									<DiscordIcon className="text-muted-foreground size-7 flex-shrink-0" />
								)}
								{data?.notificationType === "email" && (
									<Mail
										size={29}
										className="text-muted-foreground size-6 flex-shrink-0"
									/>
								)}
							</div>

							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="Name" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								{type === "slack" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Webhook URL</FormLabel>
													<FormControl>
														<Input
															placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
															{...field}
														/>
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="channel"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Channel</FormLabel>
													<FormControl>
														<Input placeholder="Channel" {...field} />
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "telegram" && (
									<>
										<FormField
											control={form.control}
											name="botToken"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Bot Token</FormLabel>
													<FormControl>
														<Input
															placeholder="6660491268:AAFMGmajZOVewpMNZCgJr5H7cpXpoZPgvXw"
															{...field}
														/>
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="chatId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Chat ID</FormLabel>
													<FormControl>
														<Input placeholder="431231869" {...field} />
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "discord" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Webhook URL</FormLabel>
													<FormControl>
														<Input
															placeholder="https://discord.com/api/webhooks/123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ"
															{...field}
														/>
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="decoration"
											render={({ field }) => (
												<FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
													<div className="space-y-0.5">
														<FormLabel>Decoration</FormLabel>
														<FormDescription>
															Decorate the notification with emojis.
														</FormDescription>
													</div>
													<FormControl>
														<Switch
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
												</FormItem>
											)}
										/>
									</>
								)}
								{type === "email" && (
									<>
										<div className="flex md:flex-row flex-col gap-2 w-full">
											<FormField
												control={form.control}
												name="smtpServer"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>SMTP Server</FormLabel>
														<FormControl>
															<Input placeholder="smtp.gmail.com" {...field} />
														</FormControl>

														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="smtpPort"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>SMTP Port</FormLabel>
														<FormControl>
															<Input
																placeholder="587"
																{...field}
																onChange={(e) => {
																	const value = e.target.value;
																	if (value) {
																		const port = Number.parseInt(value);
																		if (port > 0 && port < 65536) {
																			field.onChange(port);
																		}
																	}
																}}
															/>
														</FormControl>

														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<div className="flex md:flex-row flex-col gap-2 w-full">
											<FormField
												control={form.control}
												name="username"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>Username</FormLabel>
														<FormControl>
															<Input placeholder="username" {...field} />
														</FormControl>

														<FormMessage />
													</FormItem>
												)}
											/>

											<FormField
												control={form.control}
												name="password"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>Password</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="******************"
																{...field}
															/>
														</FormControl>

														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<FormField
											control={form.control}
											name="fromAddress"
											render={({ field }) => (
												<FormItem>
													<FormLabel>From Address</FormLabel>
													<FormControl>
														<Input placeholder="from@example.com" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="flex flex-col gap-2 pt-2">
											<FormLabel>To Addresses</FormLabel>

											{fields.map((field, index) => (
												<div
													key={field.id}
													className="flex flex-row gap-2 w-full"
												>
													<FormField
														control={form.control}
														name={`toAddresses.${index}`}
														render={({ field }) => (
															<FormItem className="w-full">
																<FormControl>
																	<Input
																		placeholder="email@example.com"
																		className="w-full"
																		{...field}
																	/>
																</FormControl>

																<FormMessage />
															</FormItem>
														)}
													/>
													<Button
														variant="outline"
														type="button"
														onClick={() => {
															remove(index);
														}}
													>
														Remove
													</Button>
												</div>
											))}
											{type === "email" &&
												"toAddresses" in form.formState.errors && (
													<div className="text-sm font-medium text-destructive">
														{form.formState?.errors?.toAddresses?.root?.message}
													</div>
												)}
										</div>

										<Button
											variant="outline"
											type="button"
											onClick={() => {
												append("");
											}}
										>
											Add
										</Button>
									</>
								)}
							</div>
						</div>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Select the actions.
							</FormLabel>

							<div className="grid md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									defaultValue={form.control._defaultValues.appDeploy}
									name="appDeploy"
									render={({ field }) => (
										<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="space-y-0.5">
												<FormLabel>App Deploy</FormLabel>
												<FormDescription>
													Trigger the action when a app is deployed.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									defaultValue={form.control._defaultValues.appBuildError}
									name="appBuildError"
									render={({ field }) => (
										<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="space-y-0.5">
												<FormLabel>App Builder Error</FormLabel>
												<FormDescription>
													Trigger the action when the build fails.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="databaseBackup"
									defaultValue={form.control._defaultValues.databaseBackup}
									render={({ field }) => (
										<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="space-y-0.5">
												<FormLabel>Database Backup</FormLabel>
												<FormDescription>
													Trigger the action when a database backup is created.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dockerCleanup"
									render={({ field }) => (
										<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="space-y-0.5">
												<FormLabel>Docker Cleanup</FormLabel>
												<FormDescription>
													Trigger the action when the docker cleanup is
													performed.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								{!isCloud && (
									<FormField
										control={form.control}
										defaultValue={form.control._defaultValues.dokployRestart}
										name="dokployRestart"
										render={({ field }) => (
											<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
												<div className="space-y-0.5">
													<FormLabel>Dokploy Restart</FormLabel>
													<FormDescription>
														Trigger the action when a dokploy is restarted.
													</FormDescription>
												</div>
												<FormControl>
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
												</FormControl>
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter className="flex flex-row gap-2 !justify-between w-full">
						<Button
							isLoading={
								isLoadingSlack ||
								isLoadingTelegram ||
								isLoadingDiscord ||
								isLoadingEmail
							}
							variant="secondary"
							onClick={async () => {
								try {
									if (type === "slack") {
										await testSlackConnection({
											webhookUrl: form.getValues("webhookUrl"),
											channel: form.getValues("channel"),
										});
									} else if (type === "telegram") {
										await testTelegramConnection({
											botToken: form.getValues("botToken"),
											chatId: form.getValues("chatId"),
										});
									} else if (type === "discord") {
										await testDiscordConnection({
											webhookUrl: form.getValues("webhookUrl"),
											decoration: form.getValues("decoration"),
										});
									} else if (type === "email") {
										await testEmailConnection({
											smtpServer: form.getValues("smtpServer"),
											smtpPort: form.getValues("smtpPort"),
											username: form.getValues("username"),
											password: form.getValues("password"),
											toAddresses: form.getValues("toAddresses"),
											fromAddress: form.getValues("fromAddress"),
										});
									}
									toast.success("Connection Success");
								} catch (err) {
									toast.error("Error testing the provider");
								}
							}}
						>
							Test Notification
						</Button>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
