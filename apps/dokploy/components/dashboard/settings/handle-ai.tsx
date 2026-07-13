"use client";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	Check,
	ChevronDown,
	Loader2,
	PenBoxIcon,
	Plug,
	PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const AI_PROVIDERS = [
	{ name: "OpenAI", apiUrl: "https://api.openai.com/v1" },
	{ name: "Anthropic", apiUrl: "https://api.anthropic.com/v1" },
	{
		name: "Google Gemini",
		apiUrl: "https://generativelanguage.googleapis.com/v1beta",
	},
	{ name: "Mistral", apiUrl: "https://api.mistral.ai/v1" },
	{ name: "Cohere", apiUrl: "https://api.cohere.ai/v2" },
	{ name: "Perplexity", apiUrl: "https://api.perplexity.ai" },
	{ name: "DeepInfra", apiUrl: "https://api.deepinfra.com/v1/openai" },
	{ name: "Ollama", apiUrl: "http://localhost:11434" },
	{ name: "OpenRouter", apiUrl: "https://openrouter.ai/api/v1" },
	{ name: "Z.AI", apiUrl: "https://api.z.ai/api/paas/v4" },
	{ name: "MiniMax", apiUrl: "https://api.minimax.io/v1" },
] as const;

const Schema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string(),
	model: z.string().min(1, { message: "Model is required" }),
	isEnabled: z.boolean(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	aiId?: string;
}

export const HandleAi = ({ aiId }: Props) => {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const { data, refetch } = api.ai.one.useQuery(
		{
			aiId: aiId || "",
		},
		{
			enabled: !!aiId,
		},
	);
	const { mutateAsync, isPending } = aiId
		? api.ai.update.useMutation()
		: api.ai.create.useMutation();

	const form = useForm<Schema>({
		resolver: zodResolver(Schema),
		defaultValues: {
			name: "",
			apiUrl: "",
			apiKey: "",
			model: "",
			isEnabled: true,
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				name: data?.name ?? "",
				apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
				apiKey: data?.apiKey ?? "",
				model: data?.model ?? "",
				isEnabled: data?.isEnabled ?? true,
			});
		}
		setModelSearch("");
		setModelPopoverOpen(false);
	}, [aiId, form, data]);

	const apiUrl = form.watch("apiUrl");
	const apiKey = form.watch("apiKey");

	// Any Ollama instance on the default port 11434 is treated as no-auth
	// (covers localhost and self-hosted LAN deployments). Ollama Cloud
	// (ollama.com on 443) falls through and requires an API key.
	const isLocalOllama = apiUrl.includes(":11434");
	const {
		data: models,
		isFetching: isLoadingServerModels,
		error: modelsError,
	} = api.ai.getModels.useQuery(
		{
			apiUrl: apiUrl ?? "",
			apiKey: apiKey ?? "",
		},
		{
			enabled: !!apiUrl && (isLocalOllama || !!apiKey),
		},
	);

	const onSubmit = async (data: Schema) => {
		try {
			await mutateAsync({
				...data,
				aiId: aiId || "",
			});

			utils.ai.getAll.invalidate();
			toast.success("AI settings saved successfully");
			refetch();
			setOpen(false);
		} catch (error) {
			toast.error("Failed to save AI settings", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					setModelSearch("");
					setModelPopoverOpen(false);
				}
			}}
		>
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
					{modelsError && (
						<AlertBlock type="error">{modelsError.message}</AlertBlock>
					)}
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
						<div className="space-y-1">
							<FormLabel>Provider</FormLabel>
							<Select
								onValueChange={(value) => {
									const provider = AI_PROVIDERS.find((p) => p.apiUrl === value);
									if (provider) {
										form.setValue("name", provider.name);
										form.setValue("apiUrl", provider.apiUrl);
										form.setValue("model", "");
									}
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a provider preset..." />
								</SelectTrigger>
								<SelectContent>
									{AI_PROVIDERS.map((provider) => (
										<SelectItem key={provider.apiUrl} value={provider.apiUrl}>
											{provider.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-[0.8rem] text-muted-foreground">
								Quick-fill provider name and URL, or configure manually below
							</p>
						</div>

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
										<Input
											placeholder="https://api.openai.com/v1"
											{...field}
											onChange={(e) => {
												field.onChange(e);
												// Reset model when user changes API URL
												if (form.getValues("model")) {
													form.setValue("model", "");
												}
											}}
										/>
									</FormControl>
									<FormDescription>
										The base URL for your AI provider's API
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{!isLocalOllama && (
							<FormField
								control={form.control}
								name="apiKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>API Key</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder="sk-..."
												autoComplete="one-time-code"
												{...field}
												onChange={(e) => {
													field.onChange(e);
													// Reset model when user changes API Key
													if (form.getValues("model")) {
														form.setValue("model", "");
													}
												}}
											/>
										</FormControl>
										<FormDescription>
											Your API key for authentication
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{isLoadingServerModels && (
							<span className="text-sm text-muted-foreground">
								Loading models...
							</span>
						)}

						<FormField
							control={form.control}
							name="model"
							render={({ field }) => {
								const hasModels =
									!isLoadingServerModels && models && models.length > 0;
								const selectedModel = models?.find((m) => m.id === field.value);
								const filteredModels = (models ?? []).filter((model) =>
									model.id.toLowerCase().includes(modelSearch.toLowerCase()),
								);

								const displayModels =
									field.value &&
									!filteredModels.find((m) => m.id === field.value) &&
									selectedModel
										? [selectedModel, ...filteredModels]
										: filteredModels;

								return (
									<FormItem>
										<FormLabel>Model</FormLabel>
										<div className="flex gap-2">
											<div className="flex-1">
												{hasModels ? (
													<Popover
														open={modelPopoverOpen}
														onOpenChange={setModelPopoverOpen}
													>
														<PopoverTrigger asChild>
															<FormControl>
																<Button
																	variant="outline"
																	className={cn(
																		"w-full justify-between",
																		!field.value && "text-muted-foreground",
																	)}
																>
																	{field.value
																		? (selectedModel?.id ?? field.value)
																		: "Select a model"}
																	<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
																</Button>
															</FormControl>
														</PopoverTrigger>
														<PopoverContent
															className="w-[400px] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder="Search or type a custom model..."
																	value={modelSearch}
																	onValueChange={setModelSearch}
																/>
																<CommandList>
																	<CommandEmpty>
																		{modelSearch ? (
																			<button
																				type="button"
																				className="w-full cursor-pointer px-2 py-1.5 text-left text-sm hover:bg-accent"
																				onClick={() => {
																					field.onChange(modelSearch);
																					setModelPopoverOpen(false);
																					setModelSearch("");
																				}}
																			>
																				Use custom model: "{modelSearch}"
																			</button>
																		) : (
																			"No models found."
																		)}
																	</CommandEmpty>
																	{displayModels.map((model) => {
																		const isSelected = field.value === model.id;
																		return (
																			<CommandItem
																				key={model.id}
																				value={model.id}
																				onSelect={() => {
																					field.onChange(model.id);
																					setModelPopoverOpen(false);
																					setModelSearch("");
																				}}
																			>
																				<Check
																					className={cn(
																						"mr-2 h-4 w-4",
																						isSelected
																							? "opacity-100"
																							: "opacity-0",
																					)}
																				/>
																				{model.id}
																			</CommandItem>
																		);
																	})}
																</CommandList>
															</Command>
														</PopoverContent>
													</Popover>
												) : (
													<FormControl>
														<Input
															placeholder={
																isLoadingServerModels
																	? "Loading models..."
																	: "Enter model name (e.g. gpt-4o)"
															}
															disabled={isLoadingServerModels}
															{...field}
														/>
													</FormControl>
												)}
											</div>
										</div>
										<FormDescription>
											Select a model from the list or type a custom model name
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

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

						<div className="flex justify-end gap-2 pt-4">
							<TestConnectionButton
								apiUrl={apiUrl}
								apiKey={apiKey}
								model={form.watch("model")}
							/>
							<Button type="submit" isLoading={isPending}>
								{aiId ? "Update" : "Create"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

function TestConnectionButton({
	apiUrl,
	apiKey,
	model,
}: {
	apiUrl: string;
	apiKey: string;
	model: string;
}) {
	const { mutate, isPending } = api.ai.testConnection.useMutation({
		onSuccess: () => {
			toast.success("Connection successful");
		},
		onError: (error) => {
			toast.error("Connection failed", {
				description: error.message,
			});
		},
	});

	const isDisabled = !apiUrl || !model;

	return (
		<Button
			type="button"
			variant="outline"
			disabled={isDisabled || isPending}
			onClick={() => mutate({ apiUrl, apiKey, model })}
		>
			{isPending ? (
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
			) : (
				<Plug className="mr-2 h-4 w-4" />
			)}
			Test Connection
		</Button>
	);
}
