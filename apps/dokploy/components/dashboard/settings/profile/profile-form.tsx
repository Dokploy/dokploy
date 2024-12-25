import { AlertBlock } from "@/components/shared/alert-block";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { generateSHA256Hash } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Disable2FA } from "./disable-2fa";
import { Enable2FA } from "./enable-2fa";

const profileSchema = z.object({
	email: z.string(),
	password: z.string().nullable(),
	currentPassword: z.string().nullable(),
	image: z.string().optional(),
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
	const { data, refetch } = api.auth.get.useQuery();
	const { mutateAsync, isLoading, isError, error } =
		api.auth.update.useMutation();
	const { t } = useTranslation("settings");
	const [gravatarHash, setGravatarHash] = useState<string | null>(null);

	const availableAvatars = useMemo(() => {
		if (gravatarHash === null) return randomImages;
		return randomImages.concat([
			`https://www.gravatar.com/avatar/${gravatarHash}`,
		]);
	}, [gravatarHash]);

	const form = useForm<Profile>({
		defaultValues: {
			email: data?.email || "",
			password: "",
			image: data?.image || "",
			currentPassword: "",
		},
		resolver: zodResolver(profileSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				email: data?.email || "",
				password: "",
				image: data?.image || "",
				currentPassword: "",
			});

			if (data.email) {
				generateSHA256Hash(data.email).then((hash) => {
					setGravatarHash(hash);
				});
			}
		}
		form.reset();
	}, [form, form.reset, data]);

	const onSubmit = async (values: Profile) => {
		await mutateAsync({
			email: values.email.toLowerCase(),
			password: values.password,
			image: values.image,
			currentPassword: values.currentPassword,
		})
			.then(async () => {
				await refetch();
				toast.success("Profile Updated");
				form.reset();
			})
			.catch(() => {
				toast.error("Error to Update the profile");
			});
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
				<div>
					<CardTitle className="text-xl">
						{t("settings.profile.title")}
					</CardTitle>
					<CardDescription>{t("settings.profile.description")}</CardDescription>
				</div>
				{!data?.is2FAEnabled ? <Enable2FA /> : <Disable2FA />}
			</CardHeader>
			<CardContent className="space-y-2">
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.profile.email")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("settings.profile.email")}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="currentPassword"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Current Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.profile.password")}
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
										<FormLabel>{t("settings.profile.password")}</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.profile.password")}
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
								name="image"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.profile.avatar")}</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={(e) => {
													field.onChange(e);
												}}
												defaultValue={field.value}
												value={field.value}
												className="flex flex-row flex-wrap gap-2 max-xl:justify-center"
											>
												{availableAvatars.map((image) => (
													<FormItem key={image}>
														<FormLabel className="[&:has([data-state=checked])>img]:border-primary [&:has([data-state=checked])>img]:border-1 [&:has([data-state=checked])>img]:p-px cursor-pointer">
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
						</div>
						<div>
							<Button type="submit" isLoading={isLoading}>
								{t("settings.common.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
