import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const PasswordSchema = z.object({
	password: z.string().min(8, {
		message: "Password is required",
	}),
});

type PasswordForm = z.infer<typeof PasswordSchema>;

export const Disable2FA = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const form = useForm<PasswordForm>({
		resolver: zodResolver(PasswordSchema),
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

			toast.success("2FA disabled successfully");
			utils.user.get.invalidate();
			setIsOpen(false);
		} catch {
			form.setError("password", {
				message: "Connection error. Please try again.",
			});
			toast.error("Connection error. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">Disable 2FA</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently disable
						Two-Factor Authentication for your account.
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
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder="Enter your password"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Enter your password to disable 2FA
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
								Cancel
							</Button>
							<Button type="submit" variant="destructive" isLoading={isLoading}>
								Disable 2FA
							</Button>
						</div>
					</form>
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	);
};
