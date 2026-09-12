import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";
import { CustomShellFields } from "./custom-shell-fields";
import { SingleCommandFields } from "./single-command-fields";

interface Props {
	applicationId: string;
}

const AddCommandSchema = z
	.object({
		commandMode: z.enum(["single", "custom"]),
		command: z.string(),
		customCommand: z.string().max(20000).optional(),
		customShell: z.enum(["sh", "bash"]).optional(),
		args: z
			.array(
				z.object({
					value: z.string().min(1, "Argument cannot be empty"),
				}),
			)
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.commandMode === "custom" && !data.customCommand?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["customCommand"],
				message: "Enter a script",
			});
		}
	});

export type AddCommandForm = z.infer<typeof AddCommandSchema>;

export const AddCommand = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isPending } = api.application.update.useMutation();

	const form = useForm<AddCommandForm>({
		defaultValues: {
			commandMode: "single",
			command: "",
			customCommand: "",
			customShell: "sh",
			args: [],
		},
		resolver: zodResolver(AddCommandSchema),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "args",
	});

	const commandMode = form.watch("commandMode");
	const customCommand = form.watch("customCommand");

	useEffect(() => {
		if (data) {
			form.reset({
				commandMode: data?.customCommand ? "custom" : "single",
				command: data?.command || "",
				customCommand: data?.customCommand || "",
				customShell: data?.customShell === "bash" ? "bash" : "sh",
				args: data?.args?.map((arg) => ({ value: arg })) || [],
			});
		}
	}, [data, form]);

	const onSubmit = async (values: AddCommandForm) => {
		await mutateAsync({
			applicationId,
			command: values?.command,
			args: values?.args?.map((arg) => arg.value).filter(Boolean),
			customCommand:
				values.commandMode === "custom"
					? values.customCommand?.trim() || null
					: null,
			customShell:
				values.commandMode === "custom" ? (values.customShell ?? "sh") : null,
		})
			.then(async () => {
				toast.success("Command Updated");
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error("Error updating the command");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Run Command</CardTitle>
					<CardDescription>
						Run a custom command in the container after the application
						initialized
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="commandMode"
								render={({ field }) => (
									<FormItem className="space-y-3">
										<FormLabel>Mode</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={field.onChange}
												value={field.value}
												className="flex flex-row gap-6"
											>
												<FormItem className="flex items-center space-x-2 space-y-0">
													<FormControl>
														<RadioGroupItem value="single" />
													</FormControl>
													<FormLabel className="font-normal">Single</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-2 space-y-0">
													<FormControl>
														<RadioGroupItem value="custom" />
													</FormControl>
													<FormLabel className="font-normal">
														Custom shell
													</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{commandMode === "custom" ? (
								<CustomShellFields control={form.control} />
							) : (
								<SingleCommandFields
									control={form.control}
									fields={fields}
									append={append}
									remove={remove}
								/>
							)}
						</div>
						<div className="flex justify-end">
							<Button
								isLoading={isPending}
								type="submit"
								className="w-fit"
								disabled={commandMode === "custom" && !customCommand?.trim()}
							>
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
