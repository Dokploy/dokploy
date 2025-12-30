"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Palette } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

const userInterfaceSchema = z.object({
	loginPageImage: z.string().url().optional().or(z.literal("")),
});

type UserInterfaceForm = z.infer<typeof userInterfaceSchema>;

export const UserInterfaceForm = () => {
	const { data, refetch, isLoading } = api.settings.getUserInterfaceSettings.useQuery();
	const { mutateAsync, isLoading: isUpdating } = api.settings.updateUserInterfaceSettings.useMutation();

	const form = useForm<UserInterfaceForm>({
		defaultValues: {
			loginPageImage: "",
		},
		resolver: zodResolver(userInterfaceSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				loginPageImage: data.loginPageImage || "",
			});
		}
	}, [data, form]);

	const onSubmit = async (values: UserInterfaceForm) => {
		try {
			await mutateAsync({
				loginPageImage: values.loginPageImage || null,
			});
			
			toast.success("User interface settings updated successfully");
			await refetch();
		} catch (error) {
			toast.error("Failed to update user interface settings");
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Palette className="size-6 text-muted-foreground self-center" />
							User interface settings
						</CardTitle>
						<CardDescription>
							Customize your dashboard experience and interface preferences.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6 py-8 border-t">
						<Form {...form}>
							<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
								<FormField
									control={form.control}
									name="loginPageImage"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Login page background image</FormLabel>
											<FormControl>
												<Input
													placeholder="https://example.com/image.jpg"
													{...field}
													value={field.value || ""}
												/>
											</FormControl>
											<FormDescription>
												URL of the background image to display on login page. Leave empty to use default.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								
								{form.watch("loginPageImage") && (
									<div className="rounded-md border p-4">
										<p className="text-sm text-muted-foreground mb-2">Preview:</p>
										<div className="relative w-20 rounded-sm overflow-hidden bg-muted">
											<img
												src={form.watch("loginPageImage")}
												alt="Login page background preview"
												className="h-full w-full object-cover"
												onError={(e) => {
													e.currentTarget.style.display = 'none';
													(e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
												}}
											/>
											<div 
												className="hidden h-full w-full items-center justify-center text-sm text-muted-foreground"
											>
												Failed to load image
											</div>
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button 
										type="submit" 
										isLoading={isUpdating}
										disabled={isLoading}
									>
										Save settings
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};