import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
			.min(1, "Email is required")
			.email({ message: "Invalid email" }),
		role: z.string().min(1, "Role is required"),
		notificationId: z.string().optional(),
		password: z.string().optional(),
		confirmPassword: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.mode === "credentials") {
			if (!data.password || data.password.length < 8) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Password must be at least 8 characters",
					path: ["password"],
				});
			}
			if (data.password !== data.confirmPassword) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Passwords do not match",
					path: ["confirmPassword"],
				});
			}
		}
	});

type AddInvitation = z.infer<typeof addInvitation>;

export const AddInvitation = () => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: emailProviders } =
		api.notification.getEmailProviders.useQuery();
	const { mutateAsync: inviteMember, isPending: isInviting } =
		api.organization.inviteMember.useMutation();
	const { mutateAsync: sendInvitation } = api.user.sendInvitation.useMutation();
	const {
		mutateAsync: createUserWithCredentials,
		isPending: isCreatingWithCredentials,
	} = api.user.createUserWithCredentials.useMutation();
	const { data: customRoles } = api.customRole.all.useQuery();
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
		form.reset();
	}, [form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (data: AddInvitation) => {
		try {
			if (data.mode === "credentials") {
				await createUserWithCredentials({
					email: data.email.toLowerCase(),
					password: data.password!,
					role: data.role,
				});
				toast.success("User created successfully");
				utils.user.all.invalidate();
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
							toast.success("Invitation created and email sent");
						})
						.catch((error: any) => {
							toast.error(error.message);
						});
				} else {
					toast.success("Invitation created");
				}
				utils.organization.allInvitations.invalidate();
			}
			setError(null);
			setOpen(false);
		} catch (error: any) {
			setError(error.message || "Failed to create user");
		}
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				<Button>
					<PlusIcon className="h-4 w-4" /> Add User
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add User</DialogTitle>
					<DialogDescription>
						{mode === "credentials"
							? "Create a new user with email and password"
							: "Invite a new user via email"}
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
								render={({ field }) => (
									<FormItem>
										<FormLabel>Method</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select method" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="invitation">
													Invitation (send email)
												</SelectItem>
												<SelectItem value="credentials">
													Credentials (set password directly)
												</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="email"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input placeholder={"email@dokploy.com"} {...field} />
										</FormControl>
										<FormDescription>
											This will be the email of the new user
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
										<FormLabel>Role</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a role" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="member">Member</SelectItem>
												<SelectItem value="admin">Admin</SelectItem>
												{customRoles?.map((role) => (
													<SelectItem key={role.role} value={role.role}>
														{role.role}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription>
											Select the role for the new user
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						{mode === "credentials" && (
							<>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Password"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Minimum 8 characters
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="confirmPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Confirm Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Confirm Password"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{!isCloud && mode === "invitation" && (
							<FormField
								control={form.control}
								name="notificationId"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Email Provider</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select an email provider" />
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
														None
													</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												Select the email provider to send the invitation
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}
						<DialogFooter className="flex w-full flex-row">
							<Button
								isLoading={isInviting || isCreatingWithCredentials}
								form="hook-form-add-invitation"
								type="submit"
							>
								{mode === "credentials" ? "Create User" : "Send Invitation"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
