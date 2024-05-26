import { api } from "@/utils/api";
import "highlight.js/styles/vs2015.css"; // Estilo que prefieras
import { useEffect } from "react";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { validateAndFormatYAML } from "../../application/advanced/traefik/update-traefik-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RandomizeCompose } from "./randomize-compose";
import { CodeEditor } from "@/components/shared/code-editor";

interface Props {
	composeId: string;
}

const AddComposeFile = z.object({
	composeFile: z.string(),
});

type AddComposeFile = z.infer<typeof AddComposeFile>;

export const ComposeFileEditor = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);

	const { mutateAsync, isLoading, error, isError } =
		api.compose.update.useMutation();

	const form = useForm<AddComposeFile>({
		defaultValues: {
			composeFile: "",
		},
		resolver: zodResolver(AddComposeFile),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				composeFile: data.composeFile || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: AddComposeFile) => {
		const { valid, error } = validateAndFormatYAML(data.composeFile);
		if (!valid) {
			form.setError("composeFile", {
				type: "manual",
				message: error || "Invalid YAML",
			});
			return;
		}

		form.clearErrors("composeFile");
		await mutateAsync({
			composeId,
			composeFile: data.composeFile,
			sourceType: "raw",
		})
			.then(async () => {
				toast.success("Compose config Updated");
				refetch();
				await utils.compose.allServices.invalidate({
					composeId,
				});
			})
			.catch((e) => {
				console.log(e);
				toast.error("Error to update the compose config");
			});
	};
	return (
		<>
			<div className="w-full flex flex-col lg:flex-row gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full relative gap-4"
					>
						<FormField
							control={form.control}
							name="composeFile"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<div className="flex flex-col gap-4 w-full outline-none focus:outline-none overflow-auto">
											<CodeEditor
												// disabled
												value={field.value}
												className="font-mono min-h-[20rem] compose-file-editor"
												wrapperClassName="min-h-[20rem]"
												placeholder={`version: '3'
services:
    web:
    image: nginx
    ports:
        - "80:80"
    
    `}
												onChange={(value) => {
													field.onChange(value);
												}}
											/>
										</div>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<div className="flex justify-between">
							<div className="w-full flex flex-col lg:flex-row gap-4 items-end">
								<RandomizeCompose composeId={composeId} />
							</div>
							<Button type="submit" isLoading={isLoading} className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</>
	);
};
