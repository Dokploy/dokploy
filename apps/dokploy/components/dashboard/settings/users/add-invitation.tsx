import {
	STRONG_PASSWORD_MESSAGE,
	STRONG_PASSWORD_REGEX,
} from "@dokploy/server/utils/password-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const addInvitation = z
	.object({
		mode: z.enum(["invitation", "credentials"]),
		email: z
			.string()
			.trim()
			.min(1, "settings.users.emailRequired")
			.email({ message: "settings.users.emailInvalid" }),
		role: z.string().min(1, "settings.users.roleRequired"),
		notificationId: z.string().optional(),
		password: z.string().optional(),
		confirmPassword: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.mode !== "credentials") {
			return;
		}

		if (!value.password) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "settings.users.passwordRequired",
				path: ["password"],
			});
		} else if (!STRONG_PASSWORD_REGEX.test(value.password)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "settings.users.passwordStrong",
				path: ["password"],
			});
		}

		if (!value.confirmPassword) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "settings.users.confirmPasswordRequired",
				path: ["confirmPassword"],
			});
		} else if (value.confirmPassword.length < 8) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "settings.users.passwordMinLength",
				path: ["confirmPassword"],
			});
		}

		if (
			value.password &&
			value.confirmPassword &&
			value.password !== value.confirmPassword
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "settings.users.passwordsMismatch",
				path: ["confirmPassword"],
			});
		}
	});

type AddInvitation = z.infer<typeof addInvitation>;

export const AddInvitation = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: emailProviders } =
		api.notification.getEmailProviders.useQuery();
	const { mutateAsync: inviteMember, isPending: isInviting } =
		api.organization.inviteMember.useMutation();
	const { mutateAsync: sendInvitation } = api.user.sendInvitation.useMutation();
	const { mutateAsync: createUserWithCredentials, isPending: isCreating } =
		api.user.createUserWithCredentials.useMutation();
	const { data: customRoles } = api.customRole.all.useQuery();
	const { data: activeOrganization } = api.organization.active.useQuery();
	const [error, setError] = useState<string | null>(null);

	const form = useForm<AddInvitation>({
		defaultValues: {
			mode: "invitation",
			email: "",
			role: "member",
			notificationId: "",
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(addInvitation),
	});

	const mode = form.watch("mode");

	useEffect(() => {
		if (!open) {
			form.reset();
			setError(null);
		}
	}, [open, form, form.reset]);

	useEffect(() => {
		if (isCloud && form.getValues("mode") === "credentials") {
			form.setValue("mode", "invitation");
		}
	}, [form, isCloud]);

	useEffect(() => {
		if (
			activeOrganization?.defaultRole &&
			activeOrganization.defaultRole !== "owner" &&
			!form.formState.dirtyFields.role
		) {
			form.setValue("role", activeOrganization.defaultRole);
		}
	}, [form, activeOrganization?.defaultRole]);

	const onSubmit = async (data: AddInvitation) => {
		setError(null);

		try {
			if (data.mode === "credentials") {
				await createUserWithCredentials({
					email: data.email.toLowerCase(),
					password: data.password!,
					role: data.role,
				});
				toast.success(t("settings.users.userCreatedWithCredentials"));
				setOpen(false);
			} else {
				const result = await inviteMember({
					email: data.email.toLowerCase(),
					role: data.role,
				});

				if (!isCloud && data.notificationId) {
					await sendInvitation({
						invitationId: result!.id,
						notificationId: data.notificationId || "",
					})
						.then(() => {
							toast.success(t("settings.users.invitationCreatedAndSent"));
						})
						.catch((error: any) => {
							toast.error(error.message);
						});
				} else {
					toast.success(t("settings.users.invitationCreated"));
				}

				setOpen(false);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: t("settings.users.createUserFailed");
			setError(message);
			toast.error(message);
		} finally {
			await Promise.all([
				utils.organization.allInvitations.invalidate(),
				utils.user.all.invalidate(),
			]);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				<Button>
					<PlusIcon className="h-4 w-4" /> {t("settings.users.addInvitation")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.users.addInvitation")}</DialogTitle>
					<DialogDescription>
						{mode === "credentials"
							? t("settings.users.createCredentialsDescription")
							: t("settings.users.inviteDescription")}
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-invitation"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						{!isCloud && (
							<FormField
								control={form.control}
								name="mode"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{t("settings.users.inviteMethod")}</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"settings.users.inviteMethodPlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="invitation">
														{t("settings.users.invitationLink")}
													</SelectItem>
													<SelectItem value="credentials">
														{t("settings.users.initialCredentials")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												{t("settings.users.inviteMethodDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}

						<FormField
							control={form.control}
							name="email"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>{t("settings.users.email")}</FormLabel>
										<FormControl>
											<Input placeholder={"email@dokploy.com"} {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.users.emailDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						<FormField
							control={form.control}
							name="role"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>{t("settings.users.role")}</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t("settings.users.rolePlaceholder")}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="member">
													{t("settings.users.member")}
												</SelectItem>
												<SelectItem value="admin">
													{t("settings.users.admin")}
												</SelectItem>
												{customRoles?.map((role) => (
													<SelectItem key={role.role} value={role.role}>
														{role.role}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription>
											{t("settings.users.roleDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						{!isCloud && mode === "invitation" && (
							<FormField
								control={form.control}
								name="notificationId"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{t("settings.users.emailProvider")}</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"settings.users.emailProviderPlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{emailProviders?.map((provider) => (
														<SelectItem
															key={provider.notificationId}
															value={provider.notificationId}
														>
															{provider.name}
														</SelectItem>
													))}
													<SelectItem value="none" disabled>
														{t("settings.users.none")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												{t("settings.users.emailProviderDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}

						{!isCloud && mode === "credentials" && (
							<>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{t("settings.users.password")}</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.users.passwordPlaceholder",
														)}
														{...field}
													/>
												</FormControl>
												<FormDescription>
													{t("settings.users.passwordDescription")}
												</FormDescription>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="confirmPassword"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.users.confirmPassword")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.users.confirmPasswordPlaceholder",
														)}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
							</>
						)}

						<DialogFooter className="flex w-full flex-row">
							<Button
								isLoading={isInviting || isCreating}
								form="hook-form-add-invitation"
								type="submit"
							>
								{t("settings.users.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
