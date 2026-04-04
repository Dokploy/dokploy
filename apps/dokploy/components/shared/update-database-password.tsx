import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBox } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
			.min(1, "Password is required")
			.regex(DATABASE_PASSWORD_REGEX, {
				message:
					"Password contains invalid characters. Please avoid: $ ! ' \" \\ / and space characters",
			}),
		confirmPassword: z.string().min(1, "Please confirm the password"),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type UpdatePassword = z.infer<typeof updatePasswordSchema>;

interface Props {
	label?: string;
	onUpdatePassword: (newPassword: string) => Promise<void>;
}

export const UpdateDatabasePassword = ({
	label = "Password",
	onUpdatePassword,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
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
			const raw = e instanceof Error ? e.message : "Error updating password";
			if (/No running container found/i.test(raw)) {
				setError(
					"The database container is not running. Please start the service before changing the password.",
				);
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
					<DialogTitle>Update {label}</DialogTitle>
					<DialogDescription>
						Enter the new {label.toLowerCase()} for the database
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}
				<AlertBlock type="warning" className="my-4">
					This will change the {label.toLowerCase()} both in the running
					database container and in Dokploy. The container must be running for
					this operation to succeed.
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
									<FormLabel>New {label}</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={`Enter new ${label.toLowerCase()}`}
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
									<FormLabel>Confirm {label}</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={`Confirm new ${label.toLowerCase()}`}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
