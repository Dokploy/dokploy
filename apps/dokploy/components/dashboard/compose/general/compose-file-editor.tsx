import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { validateAndFormatYAML } from "../../application/advanced/traefik/update-traefik-config";
import { RandomizeCompose } from "./randomize-compose";

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
				await utils.compose.getConvertedCompose.invalidate({
					composeId,
				});
			})
			.catch((e) => {
				toast.error("Error updating the Compose config");
			});
	};
	return (
		<>
			<div className="w-full flex flex-col gap-4 ">
				<Form {...form}>
					<form
						id="hook-form-save-compose-file"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full relative space-y-4"
					>
						<FormField
							control={form.control}
							name="composeFile"
							render={({ field }) => (
								<FormItem className="overflow-auto">
									<FormControl className="">
										<div className="flex flex-col gap-4 w-full outline-none focus:outline-none overflow-auto">
											<CodeEditor
												// disabled
												value={field.value}
												className="font-mono"
												wrapperClassName="compose-file-editor"
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
					</form>
				</Form>
				<div className="flex justify-between flex-col lg:flex-row gap-2">
					<div className="w-full flex flex-col lg:flex-row gap-4 items-end">
						<RandomizeCompose composeId={composeId} />
					</div>
					<Button
						type="submit"
						form="hook-form-save-compose-file"
						isLoading={isLoading}
						className="lg:w-fit w-full"
					>
						Save
					</Button>
				</div>
			</div>
		</>
	);
};
