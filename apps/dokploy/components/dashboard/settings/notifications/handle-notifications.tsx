import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	AlertTriangle,
	Mail,
	PenBoxIcon,
	PlusIcon,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import {
	DiscordIcon,
	GotifyIcon,
	LarkIcon,
	MattermostIcon,
	NtfyIcon,
	PushoverIcon,
	ResendIcon,
	SlackIcon,
	TeamsIcon,
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
		message: "settings.notifications.handle.errors.nameRequired",
	}),
	appDeploy: z.boolean().default(false),
	appBuildError: z.boolean().default(false),
	databaseBackup: z.boolean().default(false),
	dokployBackup: z.boolean().default(false),
	volumeBackup: z.boolean().default(false),
	dokployRestart: z.boolean().default(false),
	dockerCleanup: z.boolean().default(false),
	serverThreshold: z.boolean().default(false),
});

export const notificationSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("slack"),
			webhookUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.webhookUrlRequired",
			}),
			channel: z.string(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("telegram"),
			botToken: z.string().min(1, {
				message: "settings.notifications.handle.errors.botTokenRequired",
			}),
			chatId: z.string().min(1, {
				message: "settings.notifications.handle.errors.chatIdRequired",
			}),
			messageThreadId: z.string().optional(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("discord"),
			webhookUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.webhookUrlRequired",
			}),
			decoration: z.boolean().default(true),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("email"),
			smtpServer: z.string().min(1, {
				message: "settings.notifications.handle.errors.smtpServerRequired",
			}),
			smtpPort: z.number().min(1, {
				message: "settings.notifications.handle.errors.smtpPortRequired",
			}),
			username: z.string().min(1, {
				message: "settings.notifications.handle.errors.usernameRequired",
			}),
			password: z.string().min(1, {
				message: "settings.notifications.handle.errors.passwordRequired",
			}),
			fromAddress: z.string().min(1, {
				message: "settings.notifications.handle.errors.fromAddressRequired",
			}),
			toAddresses: z
				.array(
					z
						.string()
						.trim()
						.min(1, {
							message: "settings.notifications.handle.errors.emailRequired",
						})
						.email({
							message: "settings.notifications.handle.errors.emailInvalid",
						}),
				)
				.min(1, {
					message:
						"settings.notifications.handle.errors.atLeastOneEmailRequired",
				}),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("resend"),
			apiKey: z.string().min(1, {
				message: "settings.notifications.handle.errors.apiKeyRequired",
			}),
			fromAddress: z
				.string()
				.trim()
				.min(1, {
					message: "settings.notifications.handle.errors.fromAddressRequired",
				})
				.email({
					message: "settings.notifications.handle.errors.emailInvalid",
				}),
			toAddresses: z
				.array(
					z
						.string()
						.trim()
						.min(1, {
							message: "settings.notifications.handle.errors.emailRequired",
						})
						.email({
							message: "settings.notifications.handle.errors.emailInvalid",
						}),
				)
				.min(1, {
					message:
						"settings.notifications.handle.errors.atLeastOneEmailRequired",
				}),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("gotify"),
			serverUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.serverUrlRequired",
			}),
			appToken: z.string().min(1, {
				message: "settings.notifications.handle.errors.appTokenRequired",
			}),
			priority: z.number().min(1).max(10).default(5),
			decoration: z.boolean().default(true),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("ntfy"),
			serverUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.serverUrlRequired",
			}),
			topic: z.string().min(1, {
				message: "settings.notifications.handle.errors.topicRequired",
			}),
			accessToken: z.string().optional(),
			priority: z.number().min(1).max(5).default(3),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("mattermost"),
			webhookUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.webhookUrlRequired",
			}),
			channel: z.string().optional(),
			username: z.string().optional(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("pushover"),
			userKey: z.string().min(1, {
				message: "settings.notifications.handle.errors.userKeyRequired",
			}),
			apiToken: z.string().min(1, {
				message: "settings.notifications.handle.errors.apiTokenRequired",
			}),
			priority: z.number().min(-2).max(2).default(0),
			retry: z.number().min(30).nullish(),
			expire: z.number().min(1).max(10800).nullish(),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("custom"),
			endpoint: z.string().min(1, {
				message: "settings.notifications.handle.errors.endpointRequired",
			}),
			headers: z
				.array(
					z.object({
						key: z.string(),
						value: z.string(),
					}),
				)
				.optional()
				.default([]),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("lark"),
			webhookUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.webhookUrlRequired",
			}),
		})
		.merge(notificationBaseSchema),
	z
		.object({
			type: z.literal("teams"),
			webhookUrl: z.string().min(1, {
				message: "settings.notifications.handle.errors.webhookUrlRequired",
			}),
		})
		.merge(notificationBaseSchema),
]);

export const notificationsMap = {
	slack: {
		icon: <SlackIcon />,
		label: "settings.notifications.providers.slack",
	},
	telegram: {
		icon: <TelegramIcon />,
		label: "settings.notifications.providers.telegram",
	},
	discord: {
		icon: <DiscordIcon />,
		label: "settings.notifications.providers.discord",
	},
	lark: {
		icon: <LarkIcon className="text-muted-foreground" />,
		label: "settings.notifications.providers.lark",
	},
	teams: {
		icon: <TeamsIcon className="text-muted-foreground" />,
		label: "settings.notifications.providers.teams",
	},
	email: {
		icon: <Mail size={29} className="text-muted-foreground" />,
		label: "settings.notifications.providers.email",
	},
	resend: {
		icon: <ResendIcon className="text-muted-foreground" />,
		label: "settings.notifications.providers.resend",
	},
	gotify: {
		icon: <GotifyIcon />,
		label: "settings.notifications.providers.gotify",
	},
	ntfy: {
		icon: <NtfyIcon />,
		label: "settings.notifications.providers.ntfy",
	},
	mattermost: {
		icon: <MattermostIcon />,
		label: "settings.notifications.providers.mattermost",
	},
	pushover: {
		icon: <PushoverIcon />,
		label: "settings.notifications.providers.pushover",
	},
	custom: {
		icon: <PenBoxIcon size={29} className="text-muted-foreground" />,
		label: "settings.notifications.providers.custom",
	},
};

export type NotificationSchema = z.infer<typeof notificationSchema>;

interface Props {
	notificationId?: string;
}

export const HandleNotifications = ({ notificationId }: Props) => {
	const { t } = useTranslation();
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
	const { mutateAsync: testSlackConnection, isPending: isLoadingSlack } =
		api.notification.testSlackConnection.useMutation();
	const { mutateAsync: testTelegramConnection, isPending: isLoadingTelegram } =
		api.notification.testTelegramConnection.useMutation();
	const { mutateAsync: testDiscordConnection, isPending: isLoadingDiscord } =
		api.notification.testDiscordConnection.useMutation();
	const { mutateAsync: testEmailConnection, isPending: isLoadingEmail } =
		api.notification.testEmailConnection.useMutation();
	const { mutateAsync: testResendConnection, isPending: isLoadingResend } =
		api.notification.testResendConnection.useMutation();
	const { mutateAsync: testGotifyConnection, isPending: isLoadingGotify } =
		api.notification.testGotifyConnection.useMutation();
	const { mutateAsync: testNtfyConnection, isPending: isLoadingNtfy } =
		api.notification.testNtfyConnection.useMutation();
	const {
		mutateAsync: testMattermostConnection,
		isPending: isLoadingMattermost,
	} = api.notification.testMattermostConnection.useMutation();
	const { mutateAsync: testLarkConnection, isPending: isLoadingLark } =
		api.notification.testLarkConnection.useMutation();
	const { mutateAsync: testTeamsConnection, isPending: isLoadingTeams } =
		api.notification.testTeamsConnection.useMutation();
	const { mutateAsync: testCustomConnection, isPending: isLoadingCustom } =
		api.notification.testCustomConnection.useMutation();
	const { mutateAsync: testPushoverConnection, isPending: isLoadingPushover } =
		api.notification.testPushoverConnection.useMutation();

	const customMutation = notificationId
		? api.notification.updateCustom.useMutation()
		: api.notification.createCustom.useMutation();
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
	const resendMutation = notificationId
		? api.notification.updateResend.useMutation()
		: api.notification.createResend.useMutation();
	const gotifyMutation = notificationId
		? api.notification.updateGotify.useMutation()
		: api.notification.createGotify.useMutation();
	const ntfyMutation = notificationId
		? api.notification.updateNtfy.useMutation()
		: api.notification.createNtfy.useMutation();
	const mattermostMutation = notificationId
		? api.notification.updateMattermost.useMutation()
		: api.notification.createMattermost.useMutation();
	const larkMutation = notificationId
		? api.notification.updateLark.useMutation()
		: api.notification.createLark.useMutation();
	const teamsMutation = notificationId
		? api.notification.updateTeams.useMutation()
		: api.notification.createTeams.useMutation();
	const pushoverMutation = notificationId
		? api.notification.updatePushover.useMutation()
		: api.notification.createPushover.useMutation();

	const form = useForm({
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

	const {
		fields: headerFields,
		append: appendHeader,
		remove: removeHeader,
	} = useFieldArray({
		control: form.control,
		name: "headers" as never,
	});

	useEffect(() => {
		if ((type === "email" || type === "resend") && fields.length === 0) {
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
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
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
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
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
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					webhookUrl: notification.discord?.webhookUrl,
					decoration: notification.discord?.decoration ?? undefined,
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
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
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
			} else if (notification.notificationType === "resend") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					apiKey: notification.resend?.apiKey,
					toAddresses: notification.resend?.toAddresses,
					fromAddress: notification.resend?.fromAddress,
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
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					appToken: notification.gotify?.appToken,
					decoration: notification.gotify?.decoration ?? undefined,
					priority: notification.gotify?.priority,
					serverUrl: notification.gotify?.serverUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "ntfy") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					accessToken: notification.ntfy?.accessToken || "",
					topic: notification.ntfy?.topic,
					priority: notification.ntfy?.priority,
					serverUrl: notification.ntfy?.serverUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "mattermost") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					webhookUrl: notification.mattermost?.webhookUrl,
					channel: notification.mattermost?.channel || "",
					username: notification.mattermost?.username || "",
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
					dokployBackup: notification.dokployBackup,
					type: notification.notificationType,
					webhookUrl: notification.lark?.webhookUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					volumeBackup: notification.volumeBackup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "teams") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					webhookUrl: notification.teams?.webhookUrl,
					name: notification.name,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "custom") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					type: notification.notificationType,
					endpoint: notification.custom?.endpoint || "",
					headers: notification.custom?.headers
						? Object.entries(notification.custom.headers).map(
								([key, value]) => ({
									key,
									value,
								}),
							)
						: [],
					name: notification.name,
					volumeBackup: notification.volumeBackup,
					dockerCleanup: notification.dockerCleanup,
					serverThreshold: notification.serverThreshold,
				});
			} else if (notification.notificationType === "pushover") {
				form.reset({
					appBuildError: notification.appBuildError,
					appDeploy: notification.appDeploy,
					dokployRestart: notification.dokployRestart,
					databaseBackup: notification.databaseBackup,
					dokployBackup: notification.dokployBackup,
					volumeBackup: notification.volumeBackup,
					type: notification.notificationType,
					userKey: notification.pushover?.userKey,
					apiToken: notification.pushover?.apiToken,
					priority: notification.pushover?.priority,
					retry: notification.pushover?.retry ?? undefined,
					expire: notification.pushover?.expire ?? undefined,
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
		resend: resendMutation,
		gotify: gotifyMutation,
		ntfy: ntfyMutation,
		mattermost: mattermostMutation,
		lark: larkMutation,
		teams: teamsMutation,
		custom: customMutation,
		pushover: pushoverMutation,
	};

	const onSubmit = async (data: NotificationSchema) => {
		const {
			appBuildError,
			appDeploy,
			dokployRestart,
			databaseBackup,
			dokployBackup,
			volumeBackup,
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
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
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
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
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
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
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
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
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
		} else if (data.type === "resend") {
			promise = resendMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				apiKey: data.apiKey,
				fromAddress: data.fromAddress,
				toAddresses: data.toAddresses,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				resendId: notification?.resendId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "gotify") {
			promise = gotifyMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				serverUrl: data.serverUrl,
				appToken: data.appToken,
				priority: data.priority,
				name: data.name,
				dockerCleanup: dockerCleanup,
				decoration: data.decoration,
				serverThreshold: serverThreshold,
				notificationId: notificationId || "",
				gotifyId: notification?.gotifyId || "",
			});
		} else if (data.type === "ntfy") {
			promise = ntfyMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				serverUrl: data.serverUrl,
				accessToken: data.accessToken || "",
				topic: data.topic,
				priority: data.priority,
				name: data.name,
				dockerCleanup: dockerCleanup,
				serverThreshold: serverThreshold,
				notificationId: notificationId || "",
				ntfyId: notification?.ntfyId || "",
			});
		} else if (data.type === "mattermost") {
			promise = mattermostMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				webhookUrl: data.webhookUrl,
				channel: data.channel || undefined,
				username: data.username || undefined,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				mattermostId: notification?.mattermostId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "lark") {
			promise = larkMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				webhookUrl: data.webhookUrl,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				larkId: notification?.larkId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "teams") {
			promise = teamsMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				webhookUrl: data.webhookUrl,
				name: data.name,
				dockerCleanup: dockerCleanup,
				notificationId: notificationId || "",
				teamsId: notification?.teamsId || "",
				serverThreshold: serverThreshold,
			});
		} else if (data.type === "custom") {
			// Convert headers array to object
			const headersRecord =
				data.headers && data.headers.length > 0
					? data.headers.reduce(
							(acc, { key, value }) => {
								if (key.trim()) acc[key] = value;
								return acc;
							},
							{} as Record<string, string>,
						)
					: undefined;

			promise = customMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				endpoint: data.endpoint,
				headers: headersRecord,
				name: data.name,
				dockerCleanup: dockerCleanup,
				serverThreshold: serverThreshold,
				notificationId: notificationId || "",
				customId: notification?.customId || "",
			});
		} else if (data.type === "pushover") {
			if (data.priority === 2 && (data.retry == null || data.expire == null)) {
				toast.error(
					t("settings.notifications.handle.errors.retryExpireRequired"),
				);
				return;
			}
			promise = pushoverMutation.mutateAsync({
				appBuildError: appBuildError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				dokployBackup: dokployBackup,
				volumeBackup: volumeBackup,
				userKey: data.userKey,
				apiToken: data.apiToken,
				priority: data.priority,
				retry: data.priority === 2 ? data.retry : undefined,
				expire: data.priority === 2 ? data.expire : undefined,
				name: data.name,
				dockerCleanup: dockerCleanup,
				serverThreshold: serverThreshold,
				notificationId: notificationId || "",
				pushoverId: notification?.pushoverId || "",
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success(
						notificationId
							? t("settings.notifications.handle.updated")
							: t("settings.notifications.handle.created"),
					);
					form.reset({
						type: "slack",
						webhookUrl: "",
					});
					setVisible(false);
					await utils.notification.all.invalidate();
					if (notificationId) {
						await utils.notification.one.invalidate({ notificationId });
					}
				})
				.catch(() => {
					toast.error(
						notificationId
							? t("settings.notifications.handle.updateError")
							: t("settings.notifications.handle.createError"),
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
						{t("settings.notifications.handle.trigger")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{notificationId
							? t("settings.notifications.handle.updateTitle")
							: t("settings.notifications.handle.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{notificationId
							? t("settings.notifications.handle.updateDescription")
							: t("settings.notifications.handle.addDescription")}
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
										{t("settings.vault.provider.selectProvider")}
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
																className="h-24 flex flex-col gap-2 items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary has-data-[state=checked]:border-primary cursor-pointer"
															>
																{value.icon}
																{t(value.label)}
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
								{t("settings.notifications.handle.fillFields")}
							</FormLabel>
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.servers.connect.name")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.servers.connect.name")}
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
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
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
													<FormLabel>
														{t("settings.notifications.handle.fields.channel")}
													</FormLabel>
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
													<FormLabel>
														{t("settings.notifications.handle.fields.botToken")}
													</FormLabel>
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
													<FormLabel>
														{t("settings.notifications.handle.fields.chatId")}
													</FormLabel>
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
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.messageThreadId",
														)}
													</FormLabel>
													<FormControl>
														<Input placeholder="11" {...field} />
													</FormControl>

													<FormMessage />
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.messageThread",
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
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
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
												<FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-xs">
													<div className="space-y-0.5">
														<FormLabel>
															{t(
																"settings.notifications.handle.fields.decoration",
															)}
														</FormLabel>
														<FormDescription>
															{t(
																"settings.notifications.handle.descriptions.decoration",
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
															{t(
																"settings.notifications.handle.fields.smtpServer",
															)}
														</FormLabel>
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
														<FormLabel>
															{t(
																"settings.notifications.handle.fields.smtpPort",
															)}
														</FormLabel>
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
														<FormLabel>
															{t("settings.servers.handle.username")}
														</FormLabel>
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
														<FormLabel>
															{t("settings.vault.provider.password")}
														</FormLabel>
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
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.fromAddress",
														)}
													</FormLabel>
													<FormControl>
														<Input placeholder="from@example.com" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="flex flex-col gap-2 pt-2">
											<FormLabel>
												{t("settings.notifications.handle.fields.toAddresses")}
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
														{t("settings.servers.security.ssh.remove")}
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
											{t("settings.notifications.handle.add")}
										</Button>
									</>
								)}

								{type === "resend" && (
									<>
										<FormField
											control={form.control}
											name="apiKey"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.dns.provider.apiKey")}
													</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="re_********"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="fromAddress"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.fromAddress",
														)}
													</FormLabel>
													<FormControl>
														<Input placeholder="from@example.com" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<div className="flex flex-col gap-2 pt-2">
											<FormLabel>
												{t("settings.notifications.handle.fields.toAddresses")}
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
														{t("settings.servers.security.ssh.remove")}
													</Button>
												</div>
											))}
											{type === "resend" &&
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
											{t("settings.notifications.handle.add")}
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
														{t(
															"settings.notifications.handle.fields.serverUrl",
														)}
													</FormLabel>
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
													<FormLabel>
														{t("settings.notifications.handle.fields.appToken")}
													</FormLabel>
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
													<FormLabel>
														{t("settings.notifications.handle.fields.priority")}
													</FormLabel>
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
														{t(
															"settings.notifications.handle.descriptions.priorityGotify",
														)}
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
												<FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-xs">
													<div className="space-y-0.5">
														<FormLabel>
															{t(
																"settings.notifications.handle.fields.decoration",
															)}
														</FormLabel>
														<FormDescription>
															{t(
																"settings.notifications.handle.descriptions.decoration",
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
														{t(
															"settings.notifications.handle.fields.serverUrl",
														)}
													</FormLabel>
													<FormControl>
														<Input placeholder="https://ntfy.sh" {...field} />
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
														{t("settings.notifications.handle.fields.topic")}
													</FormLabel>
													<FormControl>
														<Input placeholder="deployments" {...field} />
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
														{t(
															"settings.notifications.handle.fields.accessToken",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="AzxcvbnmKjhgfdsa..."
															{...field}
															value={field.value ?? ""}
														/>
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.accessToken",
														)}
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
														{t("settings.notifications.handle.fields.priority")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="3"
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
														{t(
															"settings.notifications.handle.descriptions.priorityNtfy",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "mattermost" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="https://your-mattermost.com/hooks/xxx-generatedkey-xxx"
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
														{t("settings.notifications.handle.fields.channel")}
													</FormLabel>
													<FormControl>
														<Input placeholder="deployments" {...field} />
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.channel",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="username"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.servers.handle.username")}
													</FormLabel>
													<FormControl>
														<Input placeholder="Dokploy" {...field} />
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.username",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "custom" && (
									<div className="space-y-4">
										<FormField
											control={form.control}
											name="endpoint"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="https://api.example.com/webhook"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.endpoint",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										<div className="space-y-3">
											<div>
												<FormLabel>
													{t("settings.notifications.handle.fields.headers")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.headers",
													)}
												</FormDescription>
											</div>

											<div className="space-y-2">
												{headerFields.map((field, index) => (
													<div
														key={field.id}
														className="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
													>
														<FormField
															control={form.control}
															name={`headers.${index}.key` as never}
															render={({ field }) => (
																<FormItem className="flex-1">
																	<FormControl>
																		<Input placeholder="Key" {...field} />
																	</FormControl>
																</FormItem>
															)}
														/>
														<FormField
															control={form.control}
															name={`headers.${index}.value` as never}
															render={({ field }) => (
																<FormItem className="flex-2">
																	<FormControl>
																		<Input placeholder="Value" {...field} />
																	</FormControl>
																</FormItem>
															)}
														/>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															onClick={() => removeHeader(index)}
															className="text-red-500 hover:text-red-700 hover:bg-red-50"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>

											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => appendHeader({ key: "", value: "" })}
												className="w-full"
											>
												<PlusIcon className="h-4 w-4 mr-2" />
												{t("settings.notifications.handle.addHeader")}
											</Button>
										</div>
									</div>
								)}

								{type === "lark" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/xxxxxxxxxxxxxxxxxxxxxxxx"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{type === "teams" && (
									<>
										<FormField
											control={form.control}
											name="webhookUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t(
															"settings.notifications.handle.fields.webhookUrl",
														)}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="https://xxx.webhook.office.com/webhookb2/..."
															{...field}
														/>
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.teamsWebhook",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
								{type === "pushover" && (
									<>
										<FormField
											control={form.control}
											name="userKey"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("settings.notifications.handle.fields.userKey")}
													</FormLabel>
													<FormControl>
														<Input placeholder="ub3de9kl2q..." {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="apiToken"
											render={({ field }) => (
												<FormItem>
													<FormLabel>API Token</FormLabel>
													<FormControl>
														<Input placeholder="a3d9k2q7m4..." {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="priority"
											defaultValue={0}
											render={({ field }) => (
												<FormItem className="w-full">
													<FormLabel>
														{t("settings.notifications.handle.fields.priority")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder="0"
															value={field.value ?? 0}
															onChange={(e) => {
																const value = e.target.value;
																if (value === "" || value === "-") {
																	field.onChange(0);
																} else {
																	const priority = Number.parseInt(value);
																	if (
																		!Number.isNaN(priority) &&
																		priority >= -2 &&
																		priority <= 2
																	) {
																		field.onChange(priority);
																	}
																}
															}}
															type="number"
															min={-2}
															max={2}
														/>
													</FormControl>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.priorityPushover",
														)}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										{form.watch("priority") === 2 && (
											<>
												<FormField
													control={form.control}
													name="retry"
													render={({ field }) => (
														<FormItem className="w-full">
															<FormLabel>
																{t(
																	"settings.notifications.handle.fields.retry",
																)}
															</FormLabel>
															<FormControl>
																<Input
																	placeholder="30"
																	{...field}
																	value={field.value ?? ""}
																	onChange={(e) => {
																		const value = e.target.value;
																		if (value === "") {
																			field.onChange(undefined);
																		} else {
																			const retry = Number.parseInt(value);
																			if (!Number.isNaN(retry)) {
																				field.onChange(retry);
																			}
																		}
																	}}
																	type="number"
																	min={30}
																/>
															</FormControl>
															<FormDescription>
																{t(
																	"settings.notifications.handle.descriptions.retry",
																)}
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="expire"
													render={({ field }) => (
														<FormItem className="w-full">
															<FormLabel>
																{t(
																	"settings.notifications.handle.fields.expire",
																)}
															</FormLabel>
															<FormControl>
																<Input
																	placeholder="3600"
																	{...field}
																	value={field.value ?? ""}
																	onChange={(e) => {
																		const value = e.target.value;
																		if (value === "") {
																			field.onChange(undefined);
																		} else {
																			const expire = Number.parseInt(value);
																			if (!Number.isNaN(expire)) {
																				field.onChange(expire);
																			}
																		}
																	}}
																	type="number"
																	min={1}
																	max={10800}
																/>
															</FormControl>
															<FormDescription>
																{t(
																	"settings.notifications.handle.descriptions.expire",
																)}
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
											</>
										)}
									</>
								)}
							</div>
						</div>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								{t("settings.notifications.handle.selectActions")}
							</FormLabel>

							<div className="grid md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="appDeploy"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="">
												<FormLabel>
													{t("settings.notifications.handle.actions.appDeploy")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.appDeploy",
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
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="space-y-0.5">
												<FormLabel>
													{t(
														"settings.notifications.handle.actions.appBuildError",
													)}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.appBuildError",
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
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="space-y-0.5">
												<FormLabel>
													{t(
														"settings.notifications.handle.actions.databaseBackup",
													)}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.databaseBackup",
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
									name="dokployBackup"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="space-y-0.5">
												<FormLabel>
													{t(
														"settings.notifications.handle.actions.dokployBackup",
													)}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.dokployBackup",
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
									name="volumeBackup"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="space-y-0.5">
												<FormLabel>
													{t(
														"settings.notifications.handle.actions.volumeBackup",
													)}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.volumeBackup",
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
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
											<div className="space-y-0.5">
												<FormLabel>
													{t(
														"settings.notifications.handle.actions.dockerCleanup",
													)}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.notifications.handle.descriptions.dockerCleanup",
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
											<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
												<div className="space-y-0.5">
													<FormLabel>
														{t(
															"settings.notifications.handle.actions.dokployRestart",
														)}
													</FormLabel>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.dokployRestart",
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
											<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs gap-2">
												<div className="space-y-0.5">
													<FormLabel>
														{t(
															"settings.notifications.handle.actions.serverThreshold",
														)}
													</FormLabel>
													<FormDescription>
														{t(
															"settings.notifications.handle.descriptions.serverThreshold",
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

					<DialogFooter className="flex flex-row gap-2 justify-between! w-full">
						<Button
							isLoading={
								isLoadingSlack ||
								isLoadingTelegram ||
								isLoadingDiscord ||
								isLoadingEmail ||
								isLoadingResend ||
								isLoadingGotify ||
								isLoadingNtfy ||
								isLoadingMattermost ||
								isLoadingLark ||
								isLoadingTeams ||
								isLoadingCustom ||
								isLoadingPushover
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
									} else if (data.type === "resend") {
										await testResendConnection({
											apiKey: data.apiKey,
											fromAddress: data.fromAddress,
											toAddresses: data.toAddresses,
										});
									} else if (data.type === "gotify") {
										await testGotifyConnection({
											serverUrl: data.serverUrl,
											appToken: data.appToken,
											priority: data.priority ?? 0,
											decoration: data.decoration,
										});
									} else if (data.type === "ntfy") {
										await testNtfyConnection({
											serverUrl: data.serverUrl,
											topic: data.topic,
											accessToken: data.accessToken || "",
											priority: data.priority ?? 0,
										});
									} else if (data.type === "mattermost") {
										await testMattermostConnection({
											webhookUrl: data.webhookUrl,
											channel: data.channel || undefined,
											username: data.username || undefined,
										});
									} else if (data.type === "lark") {
										await testLarkConnection({
											webhookUrl: data.webhookUrl,
										});
									} else if (data.type === "teams") {
										await testTeamsConnection({
											webhookUrl: data.webhookUrl,
										});
									} else if (data.type === "custom") {
										const headersRecord =
											data.headers && data.headers.length > 0
												? data.headers.reduce(
														(acc, { key, value }) => {
															if (key.trim()) acc[key] = value;
															return acc;
														},
														{} as Record<string, string>,
													)
												: undefined;
										await testCustomConnection({
											endpoint: data.endpoint,
											headers: headersRecord,
										});
									} else if (data.type === "pushover") {
										if (
											data.priority === 2 &&
											(data.retry == null || data.expire == null)
										) {
											throw new Error(
												t(
													"settings.notifications.handle.errors.retryExpireRequired",
												),
											);
										}
										await testPushoverConnection({
											userKey: data.userKey,
											apiToken: data.apiToken,
											priority: data.priority ?? 0,
											retry: data.priority === 2 ? data.retry : undefined,
											expire: data.priority === 2 ? data.expire : undefined,
										});
									}
									toast.success(
										t("settings.destination.handle.connectionSuccess"),
									);
								} catch (error) {
									const testErrorMessage =
										error instanceof Error
											? error.message
											: t("settings.cluster.registry.none");
									toast.error(
										`${t("settings.notifications.handle.testError")}: ${testErrorMessage}`,
									);
								}
							}}
						>
							{t("settings.notifications.handle.testNotification")}
						</Button>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							{notificationId
								? t("settings.servers.handle.update")
								: t("settings.servers.handle.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
