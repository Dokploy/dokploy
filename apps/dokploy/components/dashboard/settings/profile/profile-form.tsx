import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Loader2, Palette, ShieldCheck, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { getAvatarType, isSolidColorAvatar } from "@/lib/avatar-utils";
import { generateSHA256Hash, getFallbackAvatarInitials } from "@/lib/utils";
import { api } from "@/utils/api";
import { Configure2FA } from "./configure-2fa";
import { Enable2FA } from "./enable-2fa";
import { ManagePasskeys } from "./manage-passkeys";

const profileSchema = z
	.object({
		email: z
			.string()
			.email("Please enter a valid email address")
			.min(1, "Email is required"),
		password: z.string().nullable(),
		currentPassword: z.string().nullable(),
		image: z.string().optional(),
		firstName: z.string().optional(),
		lastName: z.string().optional(),
		allowImpersonation: z.boolean().optional().default(false),
	})
	.superRefine((data, ctx) => {
		const wantsPasswordChange = Boolean(data.password || data.currentPassword);
		if (!wantsPasswordChange) return;

		if (!data.currentPassword) {
			ctx.addIssue({
				code: "custom",
				message: "Current password is required to change your password",
				path: ["currentPassword"],
			});
		}
		if (!data.password) {
			ctx.addIssue({
				code: "custom",
				message: "New password is required",
				path: ["password"],
			});
		} else if (data.password.length < 8) {
			ctx.addIssue({
				code: "custom",
				message: "Password must be at least 8 characters long",
				path: ["password"],
			});
		}
	});

type Profile = z.infer<typeof profileSchema>;

const randomImages = [
	"/avatars/avatar-1.png",
	"/avatars/avatar-2.png",
	"/avatars/avatar-3.png",
	"/avatars/avatar-4.png",
	"/avatars/avatar-5.png",
	"/avatars/avatar-6.png",
	"/avatars/avatar-7.png",
	"/avatars/avatar-8.png",
	"/avatars/avatar-9.png",
	"/avatars/avatar-10.png",
	"/avatars/avatar-11.png",
	"/avatars/avatar-12.png",
];

export const ProfileForm = () => {
	const { data, refetch, isPending } = api.user.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const {
		mutateAsync,
		isPending: isUpdating,
		isError,
		error,
	} = api.user.update.useMutation();
	const [gravatarHash, setGravatarHash] = useState<string | null>(null);
	const [changePassword, setChangePassword] = useState(false);
	const colorInputRef = useRef<HTMLInputElement>(null);

	const availableAvatars = useMemo(() => {
		if (gravatarHash === null) return randomImages;
		return randomImages.concat([
			`https://www.gravatar.com/avatar/${gravatarHash}`,
		]);
	}, [gravatarHash]);

	const form = useForm({
		defaultValues: {
			email: data?.user?.email || "",
			password: "",
			image: data?.user?.image || "",
			currentPassword: "",
			allowImpersonation: data?.user?.allowImpersonation || false,
			firstName: data?.user?.firstName || "",
			lastName: data?.user?.lastName || "",
		},
		resolver: zodResolver(profileSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset(
				{
					email: data?.user?.email || "",
					password: "",
					image: data?.user?.image || "",
					currentPassword: "",
					allowImpersonation: data?.user?.allowImpersonation,
					firstName: data?.user?.firstName || "",
					lastName: data?.user?.lastName || "",
				},
				{
					keepValues: false,
				},
			);
			form.setValue("allowImpersonation", data?.user?.allowImpersonation);

			if (data.user.email) {
				generateSHA256Hash(data.user.email).then((hash) => {
					setGravatarHash(hash);
				});
			}
		}
	}, [form, data]);

	const onSubmit = async (values: Profile) => {
		try {
			await mutateAsync({
				email: values.email.toLowerCase(),
				password: changePassword ? values.password || undefined : undefined,
				image: values.image,
				currentPassword: changePassword
					? values.currentPassword || undefined
					: undefined,
				allowImpersonation: values.allowImpersonation,
				firstName: values.firstName || undefined,
				lastName: values.lastName || undefined,
			});
			await refetch();
			toast.success("Profile Updated");
			form.reset({
				email: values.email,
				password: "",
				image: values.image,
				currentPassword: "",
				firstName: values.firstName || "",
				lastName: values.lastName || "",
			});
			setChangePassword(false);
		} catch (error) {
			toast.error("Error updating the profile");
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div>
							<CardTitle className="text-xl flex flex-row gap-2">
								<User className="size-6 text-muted-foreground self-center" />
								Account
							</CardTitle>
							<CardDescription>
								Manage your profile, avatar, and security settings.
							</CardDescription>
						</div>

						<div className="flex flex-row gap-2 flex-wrap">
							<ManagePasskeys />
							{!data?.user.twoFactorEnabled ? <Enable2FA /> : <Configure2FA />}
						</div>
					</CardHeader>

					<CardContent className="space-y-2 py-8 border-t">
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[35vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="grid gap-8"
								>
									{/* Profile information */}
									<section className="grid gap-4">
										<div className="flex items-center gap-2 border-b pb-2">
											<User className="size-4 text-muted-foreground" />
											<h3 className="text-base font-semibold">
												Profile Information
											</h3>
										</div>

										<FormField
											control={form.control}
											name="image"
											render={({ field }) => (
												<FormItem>
													<div className="flex items-center gap-4 mb-4">
														{isSolidColorAvatar(field.value) ? (
															<div
																className="size-16 rounded-full border shrink-0"
																style={{
																	backgroundColor:
																		field.value?.replace(/^color:/, "") ||
																		undefined,
																}}
															/>
														) : (
															<Avatar className="size-16 rounded-full border shrink-0">
																<AvatarImage
																	src={field.value}
																	alt="Avatar preview"
																/>
																<AvatarFallback className="rounded-full">
																	{getFallbackAvatarInitials(
																		`${data?.user?.firstName} ${data?.user?.lastName}`.trim(),
																	)}
																</AvatarFallback>
															</Avatar>
														)}
														<div>
															<FormLabel>Avatar</FormLabel>
															<FormDescription>
																Choose a preset, upload your own, or pick a
																solid color.
															</FormDescription>
														</div>
													</div>
													<FormControl>
														<RadioGroup
															onValueChange={(e) => {
																field.onChange(e);
															}}
															defaultValue={getAvatarType(field.value)}
															value={getAvatarType(field.value)}
															className="flex flex-row flex-wrap gap-2 max-xl:justify-center"
														>
															<FormItem key="no-avatar">
																<FormLabel className="[&:has([data-state=checked])>.default-avatar]:border-primary [&:has([data-state=checked])>.default-avatar]:border [&:has([data-state=checked])>.default-avatar]:p-px cursor-pointer">
																	<FormControl>
																		<RadioGroupItem
																			value=""
																			className="sr-only"
																		/>
																	</FormControl>

																	<Avatar className="default-avatar h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-transform">
																		<AvatarFallback className="rounded-full">
																			{getFallbackAvatarInitials(
																				`${data?.user?.firstName} ${data?.user?.lastName}`.trim(),
																			)}
																		</AvatarFallback>
																	</Avatar>
																</FormLabel>
															</FormItem>
															<FormItem key="custom-upload">
																<FormLabel className="[&:has([data-state=checked])>.upload-avatar]:border-primary [&:has([data-state=checked])>.upload-avatar]:border [&:has([data-state=checked])>.upload-avatar]:p-px cursor-pointer">
																	<FormControl>
																		<RadioGroupItem
																			value="upload"
																			className="sr-only"
																		/>
																	</FormControl>
																	<div
																		className="upload-avatar h-12 w-12 rounded-full border border-dashed border-muted-foreground hover:border-primary transition-colors flex items-center justify-center bg-muted/50 hover:bg-muted overflow-hidden"
																		onClick={() =>
																			document
																				.getElementById("avatar-upload")
																				?.click()
																		}
																	>
																		{field.value?.startsWith("data:") ? (
																			<img
																				src={field.value}
																				alt="Custom avatar"
																				className="h-full w-full object-cover rounded-full"
																			/>
																		) : (
																			<svg
																				className="h-5 w-5 text-muted-foreground"
																				fill="none"
																				stroke="currentColor"
																				viewBox="0 0 24 24"
																			>
																				<path
																					strokeLinecap="round"
																					strokeLinejoin="round"
																					strokeWidth={2}
																					d="M12 4v16m8-8H4"
																				/>
																			</svg>
																		)}
																	</div>
																	<input
																		id="avatar-upload"
																		type="file"
																		accept="image/*"
																		className="hidden"
																		onChange={async (e) => {
																			const file = e.target.files?.[0];
																			if (file) {
																				// max file size 2mb
																				if (file.size > 2 * 1024 * 1024) {
																					toast.error(
																						"Image size must be less than 2MB",
																					);
																					return;
																				}
																				const reader = new FileReader();
																				reader.onload = (event) => {
																					const result = event.target
																						?.result as string;
																					field.onChange(result);
																				};
																				reader.readAsDataURL(file);
																			}
																		}}
																	/>
																</FormLabel>
															</FormItem>
															<FormItem key="color-avatar">
																<FormLabel className="[&:has([data-state=checked])>.color-avatar]:border-primary [&:has([data-state=checked])>.color-avatar]:border [&:has([data-state=checked])>.color-avatar]:p-px cursor-pointer relative">
																	<FormControl>
																		<RadioGroupItem
																			value="color"
																			className="sr-only"
																		/>
																	</FormControl>
																	<div
																		className="color-avatar h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-colors flex items-center justify-center overflow-hidden cursor-pointer"
																		style={{
																			backgroundColor: isSolidColorAvatar(
																				field.value,
																			)
																				? field.value?.replace(/^color:/, "") ||
																					undefined
																				: undefined,
																		}}
																		onClick={() =>
																			colorInputRef.current?.click()
																		}
																	>
																		{!isSolidColorAvatar(field.value) && (
																			<Palette className="h-5 w-5 text-muted-foreground" />
																		)}
																	</div>
																	<input
																		ref={colorInputRef}
																		type="color"
																		className="absolute opacity-0 pointer-events-none w-12 h-12 top-0 left-0"
																		value={
																			isSolidColorAvatar(field.value)
																				? (field.value?.replace(
																						/^color:/,
																						"",
																					) ?? "#000000")
																				: "#000000"
																		}
																		onChange={field.onChange}
																	/>
																</FormLabel>
															</FormItem>
															{availableAvatars.map((image) => (
																<FormItem key={image}>
																	<FormLabel className="[&:has([data-state=checked])>img]:border-primary [&:has([data-state=checked])>img]:border [&:has([data-state=checked])>img]:p-px cursor-pointer">
																		<FormControl>
																			<RadioGroupItem
																				value={image}
																				className="sr-only"
																			/>
																		</FormControl>

																		<img
																			key={image}
																			src={image}
																			alt="avatar"
																			className="h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-transform"
																		/>
																	</FormLabel>
																</FormItem>
															))}
														</RadioGroup>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<div className="grid gap-4 sm:grid-cols-2">
											<FormField
												control={form.control}
												name="firstName"
												render={({ field }) => (
													<FormItem>
														<FormLabel>First Name</FormLabel>
														<FormControl>
															<Input placeholder="John" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="lastName"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Last Name</FormLabel>
														<FormControl>
															<Input placeholder="Doe" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Email</FormLabel>
													<FormControl>
														<Input placeholder="Email" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</section>

									{/* Security */}
									<section className="grid gap-4">
										<div className="flex items-center gap-2 border-b pb-2">
											<ShieldCheck className="size-4 text-muted-foreground" />
											<h3 className="text-base font-semibold">Security</h3>
										</div>

										<div className="flex items-center justify-between gap-4 rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel>Change Password</FormLabel>
												<FormDescription>
													Update your password. Your current password is
													required to confirm the change.
												</FormDescription>
											</div>
											<Switch
												checked={changePassword}
												onCheckedChange={setChangePassword}
												aria-label="Toggle password change"
											/>
										</div>

										{changePassword && (
											<div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
												<FormField
													control={form.control}
													name="currentPassword"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Current Password</FormLabel>
															<FormControl>
																<Input
																	type="password"
																	placeholder="Current Password"
																	{...field}
																	value={field.value || ""}
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
														<FormItem>
															<FormLabel>New Password</FormLabel>
															<FormControl>
																<Input
																	type="password"
																	placeholder="New Password"
																	{...field}
																	value={field.value || ""}
																/>
															</FormControl>
															<FormDescription>
																At least 8 characters. All other sessions will
																be signed out.
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										)}

										{isCloud && (
											<FormField
												control={form.control}
												name="allowImpersonation"
												render={({ field }) => (
													<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
														<div className="space-y-0.5">
															<FormLabel>Allow Impersonation</FormLabel>
															<FormDescription>
																Enable this option to allow Dokploy Cloud
																administrators to temporarily access your
																account for troubleshooting and support
																purposes. This helps them quickly identify and
																resolve any issues you may encounter.
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
									</section>

									<div className="flex items-center justify-end gap-2 border-t pt-4">
										<Button type="submit" isLoading={isUpdating}>
											Save Changes
										</Button>
									</div>
								</form>
							</Form>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
