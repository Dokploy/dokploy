"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const ssoEmailSchema = z.object({
	email: z
		.string()
		.min(1, "Enter your work email")
		.email("Enter a valid email address")
		.transform((v) => v.trim()),
});

type SSOEmailForm = z.infer<typeof ssoEmailSchema>;

interface SignInWithSSOProps {
	/** Content shown when SSO is collapsed (e.g. email/password form) */
	children: React.ReactNode;
}

export function SignInWithSSO({ children }: SignInWithSSOProps) {
	const [expanded, setExpanded] = useState(false);

	const form = useForm<SSOEmailForm>({
		resolver: zodResolver(ssoEmailSchema),
		defaultValues: { email: "" },
	});

	const onSubmit = async (values: SSOEmailForm) => {
		try {
			const { data, error } = await authClient.signIn.sso({
				email: values.email,
				callbackURL: "/dashboard/projects",
			});
			if (error) {
				toast.error(error.message ?? "Failed to sign in with SSO");
				return;
			}
			if (data?.url) {
				window.location.href = data.url;
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to sign in with SSO",
			);
		}
	};

	if (!expanded) {
		return (
			<div className="mb-4 space-y-2">
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={() => setExpanded(true)}
				>
					<LogIn className="mr-2 size-4" />
					Sign in with SSO
				</Button>
				{children}
			</div>
		);
	}

	return (
		<div className="mb-4 space-y-2">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormControl>
									<div className="flex gap-2">
										<Input
											type="email"
											placeholder="you@company.com"
											className="flex-1"
											autoComplete="email"
											disabled={form.formState.isSubmitting}
											{...field}
										/>
										<Button
											type="submit"
											variant="outline"
											disabled={form.formState.isSubmitting}
										>
											{form.formState.isSubmitting ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												"Continue"
											)}
										</Button>
									</div>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="text-xs text-muted-foreground hover:underline"
					>
						Use email and password instead
					</button>
				</form>
			</Form>
		</div>
	);
}
