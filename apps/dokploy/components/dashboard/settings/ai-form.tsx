"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const aiSettingsSchema = z.object({
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string().min(1, { message: "API Key is required" }),
	model: z.string().optional(),
	isEnabled: z.boolean(),
});

type AISettings = z.infer<typeof aiSettingsSchema>;

interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

export const AiForm = () => {
	const [models, setModels] = useState<Model[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { data, refetch } = api.ai.get.useQuery();
	const { mutateAsync, isLoading } = api.ai.save.useMutation();

	const form = useForm<AISettings>({
		resolver: zodResolver(aiSettingsSchema),
		defaultValues: {
			apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
			apiKey: data?.apiKey ?? "",
			model: data?.model ?? "",
		},
	});

	const fetchModels = async (apiUrl: string, apiKey: string) => {
		setIsLoadingModels(true);
		setError(null);
		try {
			const response = await fetch(`${apiUrl}/models`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			});
			if (!response.ok) {
				throw new Error("Failed to fetch models");
			}
			const res = await response.json();
			setModels(res.data);

			// Set default model to o1-mini if present
			const defaultModel = res.data.find(
				(model: Model) => model.id === "gpt-4o",
			);
			if (defaultModel) {
				form.setValue("model", defaultModel.id);
			}
		} catch (error) {
			setError("Failed to fetch models. Please check your API URL and Key.");
			setModels([]);
		} finally {
			setIsLoadingModels(false);
		}
	};

	useEffect(() => {
		if (data) {
			form.reset({
				apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
				apiKey: data?.apiKey ?? "",
				model: data?.model ?? "",
				isEnabled: !!data.isEnabled,
			});
		}
		form.reset();
	}, [form, form.reset, data]);

	useEffect(() => {
		const apiUrl = form.watch("apiUrl");
		const apiKey = form.watch("apiKey");
		if (apiUrl && apiKey) {
			form.setValue("model", undefined); // Reset model when API URL or Key changes
			fetchModels(apiUrl, apiKey);
		}
	}, [form.watch("apiUrl"), form.watch("apiKey")]);

	const onSubmit = async (values: AISettings) => {
		await mutateAsync({
			apiUrl: values.apiUrl,
			apiKey: values.apiKey,
			model: values.model || "",
			isEnabled: !!values.isEnabled,
		})
			.then(async () => {
				await refetch();
				toast.success("AI Settings Updated");
			})
			.catch(() => {
				toast.error("Error updating AI settings");
			});
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
				<CardTitle className="text-xl">AI Settings</CardTitle>
				<CardDescription>
					Configure your AI model settings here.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="isEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">Enable AI</FormLabel>
										<FormDescription>
											Turn on or off AI functionality
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
						{!!form.watch("isEnabled") && (
							<>
								<FormField
									control={form.control}
									name="apiUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://api.openai.com/v1"
													{...field}
												/>
											</FormControl>
											<FormMessage />
											<p className="text-sm text-muted-foreground mt-1">
												By default, the OpenAI API URL is used. Only change this
												if you're using a different API.
											</p>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="apiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Key</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Enter your API key"
													{...field}
												/>
											</FormControl>
											<FormMessage />
											{form.watch("apiUrl") === "https://api.openai.com/v1" && (
												<p className="text-sm text-muted-foreground mt-1">
													You can find your API key on the{" "}
													<a
														href="https://platform.openai.com/settings/organization/api-keys"
														target="_blank"
														rel="noopener noreferrer"
														className="underline hover:text-primary"
													>
														OpenAI account page
													</a>
													.
												</p>
											)}
										</FormItem>
									)}
								/>
								{!isLoadingModels && models.length > 0 && (
									<FormField
										control={form.control}
										name="model"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Model</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a model" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{models.map((model) => (
															<SelectItem key={model.id} value={model.id}>
																{model.id}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								{isLoadingModels && (
									<div className="text-sm text-muted-foreground">
										Loading models...
									</div>
								)}
								{error && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
							</>
						)}
						<Button
							type="submit"
							isLoading={isLoading}
							disabled={!!error || isLoadingModels || !form.watch("model")}
						>
							Save
						</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
