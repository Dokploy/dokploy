"use client";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";

const Schema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string().min(1, { message: "API Key is required" }),
	model: z.string().min(1, { message: "Model is required" }),
	isEnabled: z.boolean(),
});

type Schema = z.infer<typeof Schema>;

interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

interface Props {
	aiId?: string;
}

export const HandleAi = ({ aiId }: Props) => {
	const [models, setModels] = useState<Model[]>([]);
	const utils = api.useUtils();
	const [isLoadingModels, setIsLoadingModels] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const { data, refetch } = api.ai.one.useQuery(
		{
			aiId: aiId || "",
		},
		{
			enabled: !!aiId,
		},
	);
	const { mutateAsync, isLoading } = aiId
		? api.ai.update.useMutation()
		: api.ai.create.useMutation();
	const form = useForm<Schema>({
		resolver: zodResolver(Schema),
		defaultValues: {
			name: "",
			apiUrl: "",
			apiKey: "",
			model: "gpt-3.5-turbo",
			isEnabled: true,
		},
	});

	useEffect(() => {
		form.reset({
			name: data?.name ?? "",
			apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
			apiKey: data?.apiKey ?? "",
			model: data?.model ?? "gpt-3.5-turbo",
			isEnabled: data?.isEnabled ?? true,
		});
	}, [aiId, form, data]);

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

			// Set default model to gpt-4 if present
			const defaultModel = res.data.find(
				(model: Model) => model.id === "gpt-4",
			);
			if (defaultModel) {
				form.setValue("model", defaultModel.id);
				return defaultModel.id;
			}
		} catch (error) {
			setError("Failed to fetch models. Please check your API URL and Key.");
			setModels([]);
		} finally {
			setIsLoadingModels(false);
		}
	};

	useEffect(() => {
		const apiUrl = form.watch("apiUrl");
		const apiKey = form.watch("apiKey");
		if (apiUrl && apiKey) {
			form.setValue("model", "");
			fetchModels(apiUrl, apiKey);
		}
	}, [form.watch("apiUrl"), form.watch("apiKey")]);

	const onSubmit = async (data: Schema) => {
		try {
			console.log("Form data:", data);
			console.log("Current model value:", form.getValues("model"));
			await mutateAsync({
				...data,
				aiId: aiId || "",
			});

			utils.ai.getAll.invalidate();
			toast.success("AI settings saved successfully");
			refetch();
			setOpen(false);
		} catch (error) {
			console.error("Submit error:", error);
			toast.error("Failed to save AI settings");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				{aiId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add AI
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{aiId ? "Edit AI" : "Add AI"}</DialogTitle>
					<DialogDescription>
						Configure your AI provider settings
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					{error && <AlertBlock type="error">{error}</AlertBlock>}
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="My OpenAI Config" {...field} />
									</FormControl>
									<FormDescription>
										A name to identify this configuration
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="apiUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>API URL</FormLabel>
									<FormControl>
										<Input placeholder="https://api.openai.com/v1" {...field} />
									</FormControl>
									<FormDescription>
										The base URL for your AI provider's API
									</FormDescription>
									<FormMessage />
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
										<Input type="password" placeholder="sk-..." {...field} />
									</FormControl>
									<FormDescription>
										Your API key for authentication
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{isLoadingModels && (
							<span className="text-sm text-muted-foreground">
								Loading models...
							</span>
						)}

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
										<FormDescription>Select an AI model to use</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="isEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											Enable AI Features
										</FormLabel>
										<FormDescription>
											Turn on/off AI functionality
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

						<div className="flex justify-end  gap-2 pt-4">
							<Button type="submit" isLoading={isLoading}>
								{aiId ? "Update" : "Create"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
