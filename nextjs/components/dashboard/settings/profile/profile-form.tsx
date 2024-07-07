import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useEffect } from "react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Enable2FA } from "./enable-2fa";
import { Disable2FA } from "./disable-2fa";

const profileSchema = z.object({
	email: z.string(),
	password: z.string().nullable(),
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
	const { mutateAsync, isLoading } = api.auth.update.useMutation();

	const { mutateAsync: generateToken, isLoading: isLoadingToken } =
		api.auth.generateToken.useMutation();
	const form = useForm<Profile>({
		defaultValues: {
			email: data?.email || "",
			password: "",
			image: data?.image || "",
		},
		resolver: zodResolver(profileSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				email: data?.email || "",
				password: "",
				image: data?.image || "",
			});
		}
		form.reset();
	}, [form, form.reset, data]);

	const onSubmit = async (values: Profile) => {
		await mutateAsync({
			email: values.email,
			password: values.password,
			image: values.image,
		})
			.then(async () => {
				await refetch();
				toast.success("Profile Updated");
			})
			.catch(() => {
				toast.error("Error to Update the profile");
			});
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
				<div>
					<CardTitle className="text-xl">Account</CardTitle>
					<CardDescription>
						Change your details of your profile here.
					</CardDescription>
				</div>
				{!data?.is2FAEnabled ? <Enable2FA /> : <Disable2FA />}
			</CardHeader>
			<CardContent className="space-y-2">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
						<div className="space-y-4">
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
										<FormLabel>Avatar</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={(e) => {
													console.log(e);
													field.onChange(e);
												}}
												defaultValue={field.value}
												value={field.value}
												className="flex flex-row flex-wrap gap-2 max-xl:justify-center"
											>
												{randomImages.map((image) => (
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
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
