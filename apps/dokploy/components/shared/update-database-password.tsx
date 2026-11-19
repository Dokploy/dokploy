import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBox } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const DATABASE_PASSWORD_REGEX = /^[a-zA-Z0-9@#%^&*()_+\-=[\]{}|;:,.<>?~`]*$/;

const updatePasswordSchema = z
	.object({
		password: z
			.string()
			.min(1, {
				message: "shared.errors.passwordRequired",
			})
			.regex(DATABASE_PASSWORD_REGEX, {
				message: "shared.errors.passwordInvalidCharacters",
			}),
		confirmPassword: z.string().min(1, {
			message: "shared.errors.confirmPasswordRequired",
		}),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "shared.errors.passwordsDoNotMatch",
		path: ["confirmPassword"],
	});

type UpdatePassword = z.infer<typeof updatePasswordSchema>;

interface Props {
	label?: string;
	onUpdatePassword: (newPassword: string) => Promise<void>;
}

export const UpdateDatabasePassword = ({ label, onUpdatePassword }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const displayLabel = label ?? t("shared.passwordLabel");
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	const form = useForm<UpdatePassword>({
		defaultValues: { password: "", confirmPassword: "" },
		resolver: zodResolver(updatePasswordSchema),
	});

	const onSubmit = async (formData: UpdatePassword) => {
		setIsPending(true);
		setError(null);
		try {
			await onUpdatePassword(formData.password);
			form.reset();
			setIsOpen(false);
		} catch (e) {
			const raw =
				e instanceof Error ? e.message : t("shared.errorUpdatingPassword");
			if (/No running container found/i.test(raw)) {
				setError(t("shared.containerNotRunning"));
			} else {
				setError(raw);
			}
		} finally {
			setIsPending(false);
		}
	};
	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) {
					form.reset();
					setError(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon">
					<PenBox className="size-3.5 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{t("shared.updateTitle", { label: displayLabel })}
					</DialogTitle>
					<DialogDescription>
						{t("shared.updateDescription", {
							label: displayLabel.toLowerCase(),
						})}
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}
				<AlertBlock type="warning" className="my-4">
					{t("shared.updateWarning", { label: displayLabel.toLowerCase() })}
				</AlertBlock>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("shared.newLabel", { label: displayLabel })}
									</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t("shared.enterNewPlaceholder", {
												label: displayLabel.toLowerCase(),
											})}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="confirmPassword"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("shared.confirmLabel", { label: displayLabel })}
									</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t("shared.confirmNewPlaceholder", {
												label: displayLabel.toLowerCase(),
											})}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								{t("shared.update")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
