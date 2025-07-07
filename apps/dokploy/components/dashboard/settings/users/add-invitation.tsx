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
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createAddInvitationSchema = (t: TFunction) =>
	z.object({
		email: z
			.string()
			.min(1, t("settings.invitations.emailRequired"))
			.email({ message: t("settings.invitations.invalidEmail") }),
		role: z.enum(["member", "admin"]),
		notificationId: z.string().optional(),
	});

type AddInvitation = z.infer<ReturnType<typeof createAddInvitationSchema>>;

export const AddInvitation = () => {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const [isLoading, setIsLoading] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: emailProviders } =
		api.notification.getEmailProviders.useQuery();
	const { mutateAsync: sendInvitation } = api.user.sendInvitation.useMutation();
	const [error, setError] = useState<string | null>(null);
	const { data: activeOrganization } = authClient.useActiveOrganization();

	const form = useForm<AddInvitation>({
		defaultValues: {
			email: "",
			role: "member",
			notificationId: "",
		},
		resolver: zodResolver(createAddInvitationSchema(t)),
	});
	useEffect(() => {
		form.reset();
	}, [form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (data: AddInvitation) => {
		setIsLoading(true);
		const result = await authClient.organization.inviteMember({
			email: data.email.toLowerCase(),
			role: data.role,
			organizationId: activeOrganization?.id,
		});

		if (result.error) {
			setError(result.error.message || "");
		} else {
			if (!isCloud && data.notificationId) {
				await sendInvitation({
					invitationId: result.data.id,
					notificationId: data.notificationId || "",
				})
					.then(() => {
						toast.success(
							t("settings.invitations.invitationCreatedAndEmailSent"),
						);
					})
					.catch((error: any) => {
						toast.error(error.message);
					});
			} else {
				toast.success(t("settings.invitations.invitationCreated"));
			}
			setError(null);
			setOpen(false);
		}

		utils.organization.allInvitations.invalidate();
		setIsLoading(false);
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				<Button>
					<PlusIcon className="h-4 w-4" />{" "}
					{t("settings.invitations.addInvitation")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{t("settings.invitations.addInvitationTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.invitations.addInvitationDescription")}
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-invitation"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>{t("settings.invitations.email")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("settings.invitations.emailPlaceholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.invitations.emailDescription")}
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
										<FormLabel>{t("settings.invitations.role")}</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"settings.invitations.rolePlaceholder",
														)}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="member">
													{t("settings.invitations.member")}
												</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>
											{t("settings.invitations.roleDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						{!isCloud && (
							<FormField
								control={form.control}
								name="notificationId"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>
												{t("settings.invitations.emailProvider")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"settings.invitations.emailProviderPlaceholder",
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
														{t("settings.invitations.none")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												{t("settings.invitations.emailProviderDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}
						<DialogFooter className="flex w-full flex-row">
							<Button
								isLoading={isLoading}
								form="hook-form-add-invitation"
								type="submit"
							>
								{t("settings.invitations.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
