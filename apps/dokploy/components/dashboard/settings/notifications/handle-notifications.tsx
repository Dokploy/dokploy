import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertTriangle,
	Mail,
	MessageCircleMore,
	PenBoxIcon,
	PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const notificationBaseSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	appDeploy: z.boolean().default(false),
	appBuildError: z.boolean().default(false),
	databaseBackup: z.boolean().default(false),
	dokployRestart: z.boolean().default(false),
	dockerCleanup: z.boolean().default(false),
	serverThreshold: z.boolean().default(false),
});

export const notificationSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("slack"),
			webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
			channel: z.string(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("telegram"),
			botToken: z.string().min(1, { message: "Bot Token is required" }),
			chatId: z.string().min(1, { message: "Chat ID is required" }),
			messageThreadId: z.string().optional(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("discord"),
			webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
			decoration: z.boolean().default(true),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("email"),
			smtpServer: z.string().min(1, { message: "SMTP Server is required" }),
			smtpPort: z.number().min(1, { message: "SMTP Port is required" }),
			username: z.string().min(1, { message: "Username is required" }),
			password: z.string().min(1, { message: "Password is required" }),
			fromAddress: z.string().min(1, { message: "From Address is required" }),
			toAddresses: z
				.array(
					z.string().min(1, { message: "Email is required" }).email({
						message: "Email is invalid",
					}),
				)
				.min(1, { message: "At least one email is required" }),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("gotify"),
			serverUrl: z.string().min(1, { message: "Server URL is required" }),
			appToken: z.string().min(1, { message: "App Token is required" }),
			priority: z.number().min(1).max(10).default(5),
			decoration: z.boolean().default(true),
		})
		.merge(notificationBaseSchema),
]);

export const notificationsMap = {
	slack: {
		icon: <SlackIcon />,
		label: "Slack",
	},
	telegram: {
		icon: <TelegramIcon />,
		label: "Telegram",
	},
	discord: {
		icon: <DiscordIcon />,
		label: "Discord",
	},
	email: {
		icon: <Mail size={29} className="text-muted-foreground" />,
		label: "Email",
	},
	gotify: {
		icon: <MessageCircleMore size={29} className="text-muted-foreground" />,
		label: "Gotify",
	},
};

export type NotificationSchema = z.infer<typeof notificationSchema>;

interface Props {
	notificationId?: string;
}

export const HandleNotifications = ({ notificationId }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { data: notification } = api.notification.one.useQuery(
		{
			notificationId: notificationId || "",
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
	const { mutateAsync: testGotifyConnection, isLoading: isLoadingGotify } =
		api.notification.testGotifyConnection.useMutation();
	const slackMutation = notificationId
		? api.notification.updateSlack.useMutation()
		: api.notification.createSlack.useMutation();
	const telegramMutation = notificationId
		? api.notification.updateTelegram.useMutation()
		: api.notification.createTelegram.useMutation();
	const discordMutation = notificationId
		? api.notification.updateDiscord.useMutation()
		: api.notification.createDiscord.useMutation();
	const emailMutation = notificationId
		? api.notification.updateEmail.useMutation()
		: api.notification.createEmail.useMutation();
	const gotifyMutation = notificationId
		? api.notification.updateGotify.useMutation()
		: api.notification.createGotify.useMutation();

	const form = useForm<NotificationSchema>({
		defaultValues: {
			type: "slack",
			webhookUrl: "",
			channel: "",
			name: "",
		},
		resolver: zodResolver(notificationSchema),
	});
	const type = form.watch("type");

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "toAddresses" as never,
	});

	useEffect(() => {
		if (type === "email") {
			append("");
		}
	}, [type, append]);

	useEffect(() => {
		if (notification) {
			if (notification.notificationType === "slack") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dockerCleanup: notification.dockerCleanup,
					webhookUrl: notification.slack?.webhookUrl,
					channel: notification.slack?.channel || "",
					name: notification.name,
					type: notification.notificationType,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "telegram") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					botToken: notification.telegram?.botToken,
					messageThreadId: notification.telegram?.messageThreadId || "",
					chatId: notification.telegram?.chatId,
					type: notification.notificationType,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "discord") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					type: notification.notificationType,
					webhookUrl: notification.discord?.webhookUrl,
					decoration: notification.discord?.decoration || undefined,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "email") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					type: notification.notificationType,
					smtpServer: notification.email?.smtpServer,
					smtpPort: notification.email?.smtpPort,
					username: notification.email?.username,
					password: notification.email?.password,
					toAddresses: notification.email?.toAddresses,
					fromAddress: notification.email?.fromAddress,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "gotify") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					type: notification.notificationType,
					appToken: notification.gotify?.appToken,
					decoration: notification.gotify?.decoration || undefined,
					priority: notification.gotify?.priority,
					serverUrl: notification.gotify?.serverUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
				});
			}
		} else {
			form.reset();
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, notification]);

	const activeMutation = {
		slack: slackMutation,
		telegram: telegramMutation,
		discord: discordMutation,
		email: emailMutation,
		gotify: gotifyMutation,
	};

	const onSubmit = async (data: NotificationSchema) => {
		const {
			appBuildError,
			appDeploy,
			dokployRestart,
			databaseBackup,
			dockerCleanup,
			serverThreshold,
		} = data;
		let promise: Promise<unknown> | null = null;
		if (data.type === "slack") {
			promise = slackMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				webhookUrl: data.webhookUrl,
				channel: data.channel,
				name: data.name,
				dockerCleanup: dockerCleanup,
				slackId: notification?.slackId || "",
				notificationId: notificationId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "telegram") {
			promise = telegramMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				botToken: data.botToken,
				messageThreadId: data.messageThreadId || "",
				chatId: data.chatId,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				telegramId: notification?.telegramId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "discord") {
			promise = discordMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				webhookUrl: data.webhookUrl,
				decoration: data.decoration,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				discordId: notification?.discordId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "email") {
			promise = emailMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				smtpServer: data.smtpServer,
				smtpPort: data.smtpPort,
				username: data.username,
				password: data.password,
				fromAddress: data.fromAddress,
				toAddresses: data.toAddresses,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				emailId: notification?.emailId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "gotify") {
			promise = gotifyMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				serverUrl: data.serverUrl,
				appToken: data.appToken,
				priority: data.priority,
				name: data.name,
				dockerCleanup: dockerCleanup,
				decoration: data.decoration,
				notificationId: notificationId || "",
				gotifyId: notification?.gotifyId || "",
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success(
						notificationId ? "Notification Updated" : "Notification Created",
					);
					form.reset({
						type: "slack",
						webhookUrl: "",
					});
					setVisible(false);
					await utils.notification.all.invalidate();
				})
				.catch(() => {
					toast.error(
						notificationId
							? "Error updating a notification"
							: "Error creating a notification",
					);
				});
		}
	};
	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="" asChild>
				{notificationId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Notification
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{notificationId ? "Update" : "Add"} Notification
					</DialogTitle>
					<DialogDescription>
						{notificationId
							? "Update your notification providers for multiple channels."
							: "Create new notification providers for multiple channels."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.type}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										Select a provider
									</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
										>
											{Object.entries(notificationsMap).map(([key, value]) => (
												<FormItem
													key={key}
													className="flex w-full items-center space-x-3 space-y-0"
												>
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value={key}
																id={key}
																className="peer sr-only"
															/>
															<Label
																htmlFor={key}
																className="flex flex-col gap-2 items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																{value.icon}
																{value.label}
															</Label>
														</div>
													</FormControl>
												</FormItem>
											))}
										</RadioGroup>
									</FormControl>
									<FormMessage />
									{activeMutation[field.value].isError && (
										<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
											<AlertTriangle className="text-red-600 dark:text-red-400" />
											<span className="text-sm text-red-600 dark:text-red-400">
												{activeMutation[field.value].error?.message}
											</span>
										</div>
									)}
								</FormItem>
							)}
						/>

						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Fill the next fields.
							</FormLabel>
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

										<FormField
											control={form.control}
											name="messageThreadId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Message Thread ID</FormLabel>
													<FormControl>
														<Input placeholder="11" {...field} />
													</FormControl>

													<FormMessage />
													<FormDescription>
														Optional. Use it when you want to send notifications
														to a specific topic in a group.
													</FormDescription>
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
											defaultValue={true}
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
																	if (value === "") {
																		field.onChange(undefined);
																	} else {
																		const port = Number.parseInt(value);
																		if (port > 0 && port < 65536) {
																			field.onChange(port);
																		}
																	}
																}}
																value={field.value || ""}
																type="number"
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

								{type === "gotify" && (
									<>
										<FormField
											control={form.control}
											name="serverUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Server URL</FormLabel>
													<FormControl>
														<Input
															placeholder="https://gotify.example.com"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="appToken"
											render={({ field }) => (
												<FormItem>
													<FormLabel>App Token</FormLabel>
													<FormControl>
														<Input
															placeholder="AzxcvbnmKjhgfdsa..."
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="priority"
											defaultValue={5}
											render={({ field }) => (
												<FormItem className="w-full">
													<FormLabel>Priority</FormLabel>
													<FormControl>
														<Input
															placeholder="5"
															{...field}
															onChange={(e) => {
																const value = e.target.value;
																if (value) {
																	const port = Number.parseInt(value);
																	if (port > 0 && port < 10) {
																		field.onChange(port);
																	}
																}
															}}
															type="number"
														/>
													</FormControl>
													<FormDescription>
														Message priority (1-10, default: 5)
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="decoration"
											defaultValue={true}
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
							</div>
						</div>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Select the actions.
							</FormLabel>

							<div className="grid md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="appDeploy"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="">
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
									name="appBuildError"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="space-y-0.5">
												<FormLabel>App Build Error</FormLabel>
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
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
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
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
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
										name="dokployRestart"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
												<div className="space-y-0.5">
													<FormLabel>Dokploy Restart</FormLabel>
													<FormDescription>
														Trigger the action when dokploy is restarted.
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

								{isCloud && (
									<FormField
										control={form.control}
										name="serverThreshold"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
												<div className="space-y-0.5">
													<FormLabel>Server Threshold</FormLabel>
													<FormDescription>
														Trigger the action when the server threshold is
														reached.
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
								isLoadingEmail ||
								isLoadingGotify
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
											messageThreadId: form.getValues("messageThreadId") || "",
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
									} else if (type === "gotify") {
										await testGotifyConnection({
											serverUrl: form.getValues("serverUrl"),
											appToken: form.getValues("appToken"),
											priority: form.getValues("priority"),
											decoration: form.getValues("decoration"),
										});
									}
									toast.success("Connection Success");
								} catch {
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
							{notificationId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
