import { CodeEditor } from "@/components/shared/code-editor";
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
	FormMessage,
} from "@/components/ui/form";
import { Toggle } from "@/components/ui/toggle";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addEnvironmentSchema = z.object({
	environment: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	composeId: string;
}

export const ShowEnvironmentCompose = ({ composeId }: Props) => {
	const [isEnvVisible, setIsEnvVisible] = useState(true);
	const { mutateAsync, isLoading } = api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{
			enabled: !!composeId,
		},
	);
	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			environment: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				environment: data.env || "",
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (data: EnvironmentSchema) => {
		mutateAsync({
			env: data.environment,
			composeId,
		})
			.then(async () => {
				toast.success("Environments Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error adding environment");
			});
	};

	useEffect(() => {
		if (isEnvVisible) {
			if (data?.env) {
				const maskedLines = data.env
					.split("\n")
					.map((line) => "*".repeat(line.length))
					.join("\n");
				form.reset({
					environment: maskedLines,
				});
			} else {
				form.reset({
					environment: "",
				});
			}
		} else {
			form.reset({
				environment: data?.env || "",
			});
		}
	}, [form.reset, data, form, isEnvVisible]);

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row w-full items-center justify-between">
					<div>
						<CardTitle className="text-xl">Environment Settings</CardTitle>
						<CardDescription>
							You can add environment variables to your resource.
						</CardDescription>
					</div>

					<Toggle
						aria-label="Toggle bold"
						pressed={isEnvVisible}
						onPressedChange={setIsEnvVisible}
					>
						{isEnvVisible ? (
							<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
						) : (
							<EyeIcon className="h-4 w-4 text-muted-foreground" />
						)}
					</Toggle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form
							id="hook-form"
							onSubmit={form.handleSubmit(onSubmit)}
							className="w-full space-y-4"
						>
							<FormField
								control={form.control}
								name="environment"
								render={({ field }) => (
									<FormItem className="w-full">
										<FormControl>
											<CodeEditor
												language="properties"
												disabled={isEnvVisible}
												placeholder={`NODE_ENV=production
PORT=3000
`}
												className="h-96 font-mono"
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex flex-row justify-end">
								<Button
									disabled={isEnvVisible}
									isLoading={isLoading}
									className="w-fit"
									type="submit"
								>
									Save
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
