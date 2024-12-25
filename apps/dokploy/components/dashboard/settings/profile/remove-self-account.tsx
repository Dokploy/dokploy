import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const profileSchema = z.object({
	password: z.string().min(1, {
		message: "Password is required",
	}),
});

type Profile = z.infer<typeof profileSchema>;

export const RemoveSelfAccount = () => {
	const { data } = api.auth.get.useQuery();
	const { mutateAsync, isLoading, error, isError } =
		api.auth.removeSelfAccount.useMutation();
	const { t } = useTranslation("settings");
	const router = useRouter();

	const form = useForm<Profile>({
		defaultValues: {
			password: "",
		},
		resolver: zodResolver(profileSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				password: "",
			});
		}
		form.reset();
	}, [form, form.reset, data]);

	const onSubmit = async (values: Profile) => {
		await mutateAsync({
			password: values.password,
		})
			.then(async () => {
				toast.success("Profile Deleted");
				router.push("/");
			})
			.catch(() => {});
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
				<div>
					<CardTitle className="text-xl">Remove Self Account</CardTitle>
					<CardDescription>
						If you want to remove your account, you can do it here
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						onSubmit={(e) => e.preventDefault()}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
							}
						}}
						className="grid gap-4"
					>
						<div className="space-y-4">
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
						</div>
					</form>
				</Form>
				<div>
					<DialogAction
						title="Are you sure you want to remove your account?"
						description="This action cannot be undone, all your projects/servers will be deleted."
						onClick={() => form.handleSubmit(onSubmit)()}
					>
						<Button type="button" isLoading={isLoading} variant="destructive">
							Remove
						</Button>
					</DialogAction>
				</div>
			</CardContent>
		</Card>
	);
};
