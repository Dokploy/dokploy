import { api } from "@/utils/api";
import Editor from "react-simple-code-editor";
import hljs from "highlight.js";
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
import { ComposeActions } from "./actions";
import { Button } from "@/components/ui/button";

hljs.registerLanguage("yaml", require("highlight.js/lib/languages/yaml"));

interface Props {
	composeId: string;
}

const AddComposeFile = z.object({
	composeFile: z.string(),
});

type AddComposeFile = z.infer<typeof AddComposeFile>;

export const highlightCode = (code: string, language: string) => {
	if (hljs.getLanguage(language)) {
		return hljs.highlight(code, { language }).value;
	}
	return hljs.highlightAuto(code).value;
};

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

	const highlight = (code: string) => {
		return highlightCode(code, "yaml");
	};

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
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid w-full relative gap-2"
				>
					<FormField
						control={form.control}
						name="composeFile"
						render={({ field }) => (
							<FormItem>
								<FormControl>
									<div className="flex flex-col gap-4 w-full lg:max-w-5xl outline-none focus:outline-none overflow-auto">
										<Editor
											value={field.value}
											onValueChange={(code) => {
												field.onChange(code);
											}}
											highlight={highlight}
											padding={15}
											className="editor  max-h-[32rem] "
											preClassName="pre-editor h-full"
											placeholder={`version: '3'
services:
    web:
    image: nginx
    ports:
        - "80:80"
    
    `}
											style={{
												fontFamily: '"Fira code", "Fira Mono", monospace',
												fontSize: 12,
												backgroundColor: "#19191A",
												borderRadius: "6px",
												overflow: "auto",
												height: "100%",
												// minHeight: "500px",
												// maxHeight: "100%",
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

					<div className="flex justify-end">
						<Button type="submit" isLoading={isLoading} className="w-fit">
							Save
						</Button>
					</div>
				</form>
			</Form>

			<ComposeActions composeId={composeId} />
		</>
	);
};
