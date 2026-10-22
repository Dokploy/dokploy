"use client";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon, ServerIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const Schema = z.object({
	providers: z.array(
		z.object({
			name: z.string().min(1, { message: "Name is required" }),
			apiUrl: z.string().url({ message: "Please enter a valid URL" }),
		}),
	),
});

type Schema = z.infer<typeof Schema>;

export const HandleAiProviders = () => {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const { data: providers } = api.ai.getCustomProviders.useQuery();
	const { mutateAsync, isPending } = api.ai.saveCustomProviders.useMutation();

	const form = useForm<Schema>({
		resolver: zodResolver(Schema),
		defaultValues: {
			providers: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "providers",
	});

	useEffect(() => {
		if (open) {
			form.reset({ providers: providers ?? [] });
		}
	}, [open, providers, form]);

	const onSubmit = async (data: Schema) => {
		try {
			await mutateAsync({ providers: data.providers });
			await utils.ai.getCustomProviders.invalidate();
			toast.success("Custom providers saved successfully");
			setOpen(false);
		} catch (error) {
			toast.error("Failed to save custom providers", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer space-x-3">
					<ServerIcon className="h-4 w-4" />
					Custom Presets
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Custom AI Providers</DialogTitle>
					<DialogDescription>
						Define your own AI providers, like an internal LLM platform. When at
						least one is defined, only these providers can be used in AI
						configurations.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						{fields.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No custom providers defined. The built-in provider list will be
								used.
							</p>
						)}
						{fields.map((fieldItem, index) => (
							<div key={fieldItem.id} className="flex gap-2 items-start">
								<FormField
									control={form.control}
									name={`providers.${index}.name`}
									render={({ field }) => (
										<FormItem className="flex-1">
											<FormControl>
												<Input placeholder="Internal LLM" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name={`providers.${index}.apiUrl`}
									render={({ field }) => (
										<FormItem className="flex-[2]">
											<FormControl>
												<Input
													placeholder="https://llm.internal.company/v1"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="group hover:bg-red-500/10"
									onClick={() => remove(index)}
								>
									<Trash2 className="size-4 text-primary group-hover:text-red-500" />
								</Button>
							</div>
						))}
						<div className="flex justify-between">
							<Button
								type="button"
								variant="outline"
								onClick={() => append({ name: "", apiUrl: "" })}
							>
								<PlusIcon className="h-4 w-4" />
								Add Provider
							</Button>
							<Button type="submit" isLoading={isPending}>
								Save
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
