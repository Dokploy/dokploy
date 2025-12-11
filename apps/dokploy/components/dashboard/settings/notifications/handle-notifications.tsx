import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Mail, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslation } from "next-i18next";
import {
	DiscordIcon,
	GotifyIcon,
	LarkIcon,
	NtfyIcon,
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
	lark: {
		icon: <LarkIcon className="text-muted-foreground" />,
		label: "Lark",
	},
	email: {
		icon: <Mail size={29} className="text-muted-foreground" />,
		label: "Email",
	},
	gotify: {
		icon: <GotifyIcon />,
		label: "Gotify",
	},
	ntfy: {
		icon: <NtfyIcon />,
		label: "ntfy",
	},
};

const createNotificationSchema = (t: (key: string) => string) => {
	const notificationBaseSchemaWithI18n = z.object({
		name: z.string().min(1, {
			message: t("settings.notifications.validation.nameRequired"),
		}),
		appDeploy: z.boolean().default(false),
		appBuildError: z.boolean().default(false),
		databaseBackup: z.boolean().default(false),
		dokployRestart: z.boolean().default(false),
		dockerCleanup: z.boolean().default(false),
		serverThreshold: z.boolean().default(false),
	});

	return z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("slack"),
				webhookUrl: z.string().min(1, {
					message: t("settings.notifications.validation.slack.webhookUrlRequired"),
				}),
				channel: z.string(),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("telegram"),
				botToken: z.string().min(1, {
					message: t("settings.notifications.validation.telegram.botTokenRequired"),
				}),
				chatId: z.string().min(1, {
					message: t("settings.notifications.validation.telegram.chatIdRequired"),
				}),
				messageThreadId: z.string().optional(),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("discord"),
				webhookUrl: z.string().min(1, {
					message: t("settings.notifications.validation.discord.webhookUrlRequired"),
				}),
				decoration: z.boolean().default(true),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("email"),
				smtpServer: z.string().min(1, {
					message: t("settings.notifications.validation.email.smtpServerRequired"),
				}),
				smtpPort: z.number().min(1, {
					message: t("settings.notifications.validation.email.smtpPortRequired"),
				}),
				username: z.string().min(1, {
					message: t("settings.notifications.validation.email.usernameRequired"),
				}),
				password: z.string().min(1, {
					message: t("settings.notifications.validation.email.passwordRequired"),
				}),
				fromAddress: z.string().min(1, {
					message: t("settings.notifications.validation.email.fromAddressRequired"),
				}),
				toAddresses: z
					.array(
						z
							.string()
							.min(1, {
								message: t("settings.notifications.validation.email.emailRequired"),
							})
							.email({
								message: t("settings.notifications.validation.email.emailInvalid"),
							}),
					)
					.min(1, {
						message: t("settings.notifications.validation.email.atLeastOneEmailRequired"),
					}),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("gotify"),
				serverUrl: z.string().min(1, {
					message: t("settings.notifications.validation.gotify.serverUrlRequired"),
				}),
				appToken: z.string().min(1, {
					message: t("settings.notifications.validation.gotify.appTokenRequired"),
				}),
				priority: z.number().min(1).max(10).default(5),
				decoration: z.boolean().default(true),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("ntfy"),
				serverUrl: z.string().min(1, {
					message: t("settings.notifications.validation.ntfy.serverUrlRequired"),
				}),
				topic: z.string().min(1, {
					message: t("settings.notifications.validation.ntfy.topicRequired"),
				}),
				accessToken: z.string().optional(),
				priority: z.number().min(1).max(5).default(3),
			})
			.merge(notificationBaseSchemaWithI18n),
		z
			.object({
				type: z.literal("lark"),
				webhookUrl: z.string().min(1, {
					message: t("settings.notifications.validation.lark.webhookUrlRequired"),
				}),
			})
			.merge(notificationBaseSchemaWithI18n),
	]);
};

export type NotificationSchema = z.infer<ReturnType<typeof createNotificationSchema>>;

interface Props {
	notificationId?: string;
}

export const HandleNotifications = ({ notificationId }: Props) => {
	const { t } = useTranslation("settings");
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
	const { mutateAsync: testNtfyConnection, isLoading: isLoadingNtfy } =
		api.notification.testNtfyConnection.useMutation();
	const { mutateAsync: testLarkConnection, isLoading: isLoadingLark } =
		api.notification.testLarkConnection.useMutation();
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
	const ntfyMutation = notificationId
		? api.notification.updateNtfy.useMutation()
		: api.notification.createNtfy.useMutation();
	const larkMutation = notificationId
		? api.notification.updateLark.useMutation()
		: api.notification.createLark.useMutation();

	const schema = createNotificationSchema(t);

	const form = useForm<NotificationSchema>({
		defaultValues: {
			type: "slack",
			webhookUrl: "",
			channel: "",
			name: "",
		},
		resolver: zodResolver(schema),
	});
	const type = form.watch("type");

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "toAddresses" as never,
	});

	useEffect(() => {
		if (type === "email" && fields.length === 0) {
			append("");
		}
	}, [type, append, fields.length]);

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
			} else if (notification.notificationType === "ntfy") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					type: notification.notificationType,
					accessToken: notification.ntfy?.accessToken || "",
					topic: notification.ntfy?.topic,
					priority: notification.ntfy?.priority,
					serverUrl: notification.ntfy?.serverUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "lark") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					type: notification.notificationType,
					webhookUrl: notification.lark?.webhookUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
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
		ntfy: ntfyMutation,
		lark: larkMutation,
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
		} else if (data.type === "ntfy") {
			promise = ntfyMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				serverUrl: data.serverUrl,
				accessToken: data.accessToken || "",
				topic: data.topic,
				priority: data.priority,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				ntfyId: notification?.ntfyId || "",
			});
		} else if (data.type === "lark") {
			promise = larkMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				webhookUrl: data.webhookUrl,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				larkId: notification?.larkId || "",
				serverThreshold: serverThreshold,
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success(
						notificationId
							? t("settings.notifications.toast.updateSuccess")
							: t("settings.notifications.toast.createSuccess"),
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
							? t("settings.notifications.toast.updateError")
							: t("settings.notifications.toast.createError"),
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
						{t("settings.notifications.form.addNotification")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{notificationId
							? t("settings.notifications.form.updateTitle")
							: t("settings.notifications.form.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{notificationId
							? t("settings.notifications.form.updateDescription")
							: t("settings.notifications.form.addDescription")}
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
										{t("settings.notifications.form.providerLabel")}
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
																className="h-24 flex flex-col gap-2 items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																{value.icon}
																{t(`settings.notifications.providers.${key}`)}
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
								{t("settings.notifications.form.fillFieldsTitle")}
							</FormLabel>
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.notifications.form.name.label")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.notifications.form.name.placeholder",
													)}
													{...field}
												/>
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
													<FormLabel>
														{t("settings.notifications.slack.webhookUrl.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.slack.webhookUrl.placeholder",
															)}
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
													<FormLabel>
														{t("settings.notifications.slack.channel.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.slack.channel.placeholder",
															)}
															{...field}
														/>
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
													<FormLabel>
														{t("settings.notifications.telegram.botToken.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.telegram.botToken.placeholder",
															)}
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
													<FormLabel>
														{t("settings.notifications.telegram.chatId.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.telegram.chatId.placeholder",
															)}
															{...field}
														/>
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
													<FormLabel>
														{t(
															"settings.notifications.telegram.messageThreadId.label",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.telegram.messageThreadId.placeholder",
															)}
															{...field}
														/>
													</FormControl>

													<FormMessage />
													<FormDescription>
														{t(
															"settings.notifications.telegram.messageThreadId.description",
														)}
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
													<FormLabel>
														{t("settings.notifications.discord.webhookUrl.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.discord.webhookUrl.placeholder",
															)}
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
														<FormLabel>
															{t("settings.notifications.common.decoration.label")}
														</FormLabel>
														<FormDescription>
															{t(
																"settings.notifications.common.decoration.description",
															)}
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
														<FormLabel>
															{t("settings.notifications.email.smtpServer.label")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"settings.notifications.email.smtpServer.placeholder",
																)}
																{...field}
															/>
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
														<FormLabel>
															{t("settings.notifications.email.smtpPort.label")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"settings.notifications.email.smtpPort.placeholder",
																)}
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
														<FormLabel>
															{t("settings.notifications.email.username.label")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"settings.notifications.email.username.placeholder",
																)}
																{...field}
															/>
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
														<FormLabel>
															{t("settings.notifications.email.password.label")}
														</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder={t(
																	"settings.notifications.email.password.placeholder",
																)}
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
													<FormLabel>
														{t("settings.notifications.email.fromAddress.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.email.fromAddress.placeholder",
															)}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="flex flex-col gap-2 pt-2">
											<FormLabel>
												{t("settings.notifications.email.toAddresses.label")}
											</FormLabel>

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
																		placeholder={t(
																			"settings.notifications.email.toAddresses.placeholder",
																		)}
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
														{t("settings.notifications.email.toAddresses.remove")}
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
											{t("settings.notifications.email.toAddresses.add")}
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
													<FormLabel>
														{t("settings.notifications.gotify.serverUrl.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.gotify.serverUrl.placeholder",
															)}
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
													<FormLabel>
														{t("settings.notifications.gotify.appToken.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.gotify.appToken.placeholder",
															)}
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
													<FormLabel>
														{t("settings.notifications.gotify.priority.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.gotify.priority.placeholder",
															)}
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
														{t("settings.notifications.gotify.priority.description")}
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
														<FormLabel>
															{t("settings.notifications.common.decoration.label")}
														</FormLabel>
														<FormDescription>
															{t(
																"settings.notifications.common.decoration.description",
															)}
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

								{type === "ntfy" && (
									<>
										<FormField
											control={form.control}
											name="serverUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.notifications.ntfy.serverUrl.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.ntfy.serverUrl.placeholder",
															)}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="topic"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.notifications.ntfy.topic.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.ntfy.topic.placeholder",
															)}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="accessToken"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.notifications.ntfy.accessToken.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.ntfy.accessToken.placeholder",
															)}
															{...field}
															value={field.value ?? ""}
														/>
													</FormControl>
													<FormDescription>
														{t("settings.notifications.ntfy.accessToken.description")}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="priority"
											defaultValue={3}
											render={({ field }) => (
												<FormItem className="w-full">
													<FormLabel>
														{t("settings.notifications.ntfy.priority.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.ntfy.priority.placeholder",
															)}
															{...field}
															onChange={(e) => {
																const value = e.target.value;
																if (value) {
																	const port = Number.parseInt(value);
																	if (port > 0 && port <= 5) {
																		field.onChange(port);
																	}
																}
															}}
															type="number"
														/>
													</FormControl>
													<FormDescription>
														{t("settings.notifications.ntfy.priority.description")}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "lark" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.notifications.lark.webhookUrl.label")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.notifications.lark.webhookUrl.placeholder",
															)}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
							</div>
						</div>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								{t("settings.notifications.actions.title")}
							</FormLabel>

							<div className="grid md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="appDeploy"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm gap-2">
											<div className="">
												<FormLabel>
													{t("settings.notifications.actions.appDeploy.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.actions.appDeploy.description",
													)}
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
												<FormLabel>
													{t("settings.notifications.actions.appBuildError.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.actions.appBuildError.description",
													)}
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
												<FormLabel>
													{t("settings.notifications.actions.databaseBackup.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.actions.databaseBackup.description",
													)}
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
												<FormLabel>
													{t("settings.notifications.actions.dockerCleanup.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.actions.dockerCleanup.description",
													)}
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
													<FormLabel>
														{t(
															"settings.notifications.actions.dokployRestart.label",
														)}
													</FormLabel>
													<FormDescription>
														{t(
															"settings.notifications.actions.dokployRestart.description",
														)}
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
													<FormLabel>
														{t("settings.notifications.actions.serverThreshold.label")}
													</FormLabel>
													<FormDescription>
														{t(
															"settings.notifications.actions.serverThreshold.description",
														)}
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
								isLoadingGotify ||
								isLoadingNtfy ||
								isLoadingLark
							}
							variant="secondary"
							type="button"
							onClick={async () => {
								const isValid = await form.trigger();
								if (!isValid) return;

								const data = form.getValues();

								try {
									if (data.type === "slack") {
										await testSlackConnection({
											webhookUrl: data.webhookUrl,
											channel: data.channel,
										});
									} else if (data.type === "telegram") {
										await testTelegramConnection({
											botToken: data.botToken,
											chatId: data.chatId,
											messageThreadId: data.messageThreadId || "",
										});
									} else if (data.type === "discord") {
										await testDiscordConnection({
											webhookUrl: data.webhookUrl,
											decoration: data.decoration,
										});
									} else if (data.type === "email") {
										await testEmailConnection({
											smtpServer: data.smtpServer,
											smtpPort: data.smtpPort,
											username: data.username,
											password: data.password,
											fromAddress: data.fromAddress,
											toAddresses: data.toAddresses,
										});
									} else if (data.type === "gotify") {
										await testGotifyConnection({
											serverUrl: data.serverUrl,
											appToken: data.appToken,
											priority: data.priority,
											decoration: data.decoration,
										});
									} else if (data.type === "ntfy") {
										await testNtfyConnection({
											serverUrl: data.serverUrl,
											topic: data.topic,
											accessToken: data.accessToken || "",
											priority: data.priority,
										});
									} else if (data.type === "lark") {
										await testLarkConnection({
											webhookUrl: data.webhookUrl,
										});
									}
									toast.success(t("settings.notifications.test.success"));
								} catch (error) {
									const errorMessage =
										error instanceof Error
											? error.message
											: t("settings.notifications.test.unknownError");
									toast.error(
										t("settings.notifications.test.errorWithMessage", {
											error: errorMessage,
										}),
									);
								}
							}}
						>
							{t("settings.notifications.test.button")}
						</Button>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							{notificationId
								? t("settings.notifications.form.submitUpdate")
								: t("settings.notifications.form.submitCreate")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
