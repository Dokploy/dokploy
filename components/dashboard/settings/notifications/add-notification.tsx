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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Mail } from "lucide-react";
import {
	DiscordIcon,
	SlackIcon,
	TelegramIcon,
} from "@/components/icons/notification-icons";
import { Switch } from "@/components/ui/switch";

const baseDatabaseSchema = z.object({
	name: z.string().min(1, "Name required"),
	appDeploy: z.boolean().default(false),
	userJoin: z.boolean().default(false),
	appBuilderError: z.boolean().default(false),
	databaseBackup: z.boolean().default(false),
	dokployRestart: z.boolean().default(false),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("slack"),
			webhookUrl: z.string().min(1),
			channel: z.string().min(1),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("telegram"),
			botToken: z.string().min(1),
			chatId: z.string().min(1),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("discord"),
			webhookUrl: z.string().min(1),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("email"),
			smtpServer: z.string().min(1),
			smtpPort: z.string().min(1),
			username: z.string().min(1),
			password: z.string().min(1),
			fromAddress: z.string().min(1),
			toAddresses: z.array(z.string()).min(1),
		})
		.merge(baseDatabaseSchema),
]);

const notificationsMap = {
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
};

type AddNotification = z.infer<typeof mySchema>;

export const AddNotification = () => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.notification.testConnection.useMutation();
	const slackMutation = api.notification.createSlack.useMutation();
	const telegramMutation = api.notification.createTelegram.useMutation();
	const discordMutation = api.notification.createDiscord.useMutation();
	const emailMutation = api.notification.createEmail.useMutation();

	const form = useForm<AddNotification>({
		defaultValues: {
			type: "slack",
			webhookUrl: "",
			channel: "",
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "toAddresses",
	});

	useEffect(() => {
		if (type === "email") {
			append("");
		}
	}, [type, append]);

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const activeMutation = {
		slack: slackMutation,
		telegram: telegramMutation,
		discord: discordMutation,
		email: emailMutation,
	};

	const onSubmit = async (data: AddNotification) => {
		const {
			appBuilderError,
			appDeploy,
			dokployRestart,
			databaseBackup,
			userJoin,
		} = data;
		let promise: Promise<unknown> | null = null;
		if (data.type === "slack") {
			promise = slackMutation.mutateAsync({
				appBuildError: appBuilderError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				userJoin: userJoin,
				webhookUrl: data.webhookUrl,
				channel: data.channel,
				name: data.name,
			});
		} else if (data.type === "telegram") {
			promise = telegramMutation.mutateAsync({
				appBuildError: appBuilderError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				userJoin: userJoin,
				botToken: data.botToken,
				chatId: data.chatId,
				name: data.name,
			});
		} else if (data.type === "discord") {
			promise = discordMutation.mutateAsync({
				appBuildError: appBuilderError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				userJoin: userJoin,
				webhookUrl: data.webhookUrl,
				name: data.name,
			});
		} else if (data.type === "email") {
			promise = emailMutation.mutateAsync({
				appBuildError: appBuilderError,
				appDeploy: appDeploy,
				dokployRestart: dokployRestart,
				databaseBackup: databaseBackup,
				userJoin: userJoin,
				smtpServer: data.smtpServer,
				smtpPort: data.smtpPort,
				username: data.username,
				password: data.password,
				fromAddress: data.fromAddress,
				toAddresses: data.toAddresses,
				name: data.name,
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success("Notification Created");
					form.reset({
						type: "slack",
						webhookUrl: "",
					});
					setVisible(false);
					await utils.notification.all.invalidate();
				})
				.catch(() => {
					toast.error("Error to create a notification");
				});
		}
	};
	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="" asChild>
				<Button>Add Notification</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Add Notification</DialogTitle>
					<DialogDescription>
						Create new notifications providers for multiple
					</DialogDescription>
				</DialogHeader>
				{/* {isError && <AlertBlock type="error">{error?.message}</AlertBlock>} */}

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
											className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
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
									</>
								)}

								{type === "email" && (
									<>
										<FormField
											control={form.control}
											name="smtpServer"
											render={({ field }) => (
												<FormItem>
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
												<FormItem>
													<FormLabel>SMTP Port</FormLabel>
													<FormControl>
														<Input placeholder="587" {...field} />
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="username"
											render={({ field }) => (
												<FormItem>
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
												<FormItem>
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

										{/* <FormField
											control={form.control}
											name="toAddresses"
											render={({ field }) => (
												<FormItem>
													<FormLabel>To Addresses</FormLabel>
													<FormControl>
														<Input placeholder="email@example.com" {...field} />
													</FormControl>

													<FormMessage />
												</FormItem>
											)}
										/> */}
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
						<div className="flex flex-col">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Select the actions.
							</FormLabel>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="appDeploy"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
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
									name="userJoin"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>User Join</FormLabel>
												<FormDescription>
													Trigger the action when a user joins the app.
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
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
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
									name="dokployRestart"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Deploy Restart</FormLabel>
												<FormDescription>
													Trigger the action when a deploy is restarted.
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
							</div>
						</div>
					</form>

					<DialogFooter className="flex flex-row gap-2 !justify-between w-full">
						<Button
							isLoading={isLoadingConnection}
							variant="secondary"
							onClick={async () => {
								await testConnection({
									webhookUrl: form.getValues("webhookUrl"),
									channel: form.getValues("channel"),
									notificationType: type,
									botToken: form.getValues("botToken"),
									chatId: form.getValues("chatId"),
									//
									smtpPort: form.getValues("smtpPort"),
									smtpServer: form.getValues("smtpServer"),
									username: form.getValues("username"),
									password: form.getValues("password"),
									toAddresses: form.getValues("toAddresses"),
									fromAddress: form.getValues("fromAddress"),
								})
									.then(async () => {
										toast.success("Connection Success");
									})
									.catch(() => {
										toast.error("Error to connect the provider");
									});
							}}
						>
							Send Test
						</Button>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
