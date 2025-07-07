import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { type TFunction, useTranslation } from "next-i18next";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createPasswordSchema = (t: TFunction) =>
	z.object({
		password: z.string().min(8, {
			message: t("settings.twoFactor.passwordRequired"),
		}),
	});

type PasswordForm = z.infer<ReturnType<typeof createPasswordSchema>>;

export const Disable2FA = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const form = useForm<PasswordForm>({
		resolver: zodResolver(createPasswordSchema(t)),
		defaultValues: {
			password: "",
		},
	});

	const handleSubmit = async (formData: PasswordForm) => {
		setIsLoading(true);
		try {
			const result = await authClient.twoFactor.disable({
				password: formData.password,
			});

			if (result.error) {
				form.setError("password", {
					message: result.error.message,
				});
				toast.error(result.error.message);
				return;
			}

			toast.success(t("settings.twoFactor.disabledSuccessfully"));
			utils.user.get.invalidate();
			setIsOpen(false);
		} catch {
			form.setError("password", {
				message: t("settings.twoFactor.connectionError"),
			});
			toast.error(t("settings.twoFactor.connectionError"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">{t("settings.twoFactor.disable")}</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("settings.twoFactor.disableTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.twoFactor.disableDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.twoFactor.password")}</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t("settings.twoFactor.passwordPlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.twoFactor.passwordDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end gap-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									form.reset();
									setIsOpen(false);
								}}
							>
								{t("settings.twoFactor.cancel")}
							</Button>
							<Button type="submit" variant="destructive" isLoading={isLoading}>
								{t("settings.twoFactor.disable")}
							</Button>
						</div>
					</form>
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	);
};
