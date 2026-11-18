import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { FileTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";

interface Props {
	serverId: string;
}

const schema = z.object({
	command: z.string().min(1, {
		message: "settings.servers.editScript.errors.commandRequired",
	}),
});

type Schema = z.infer<typeof schema>;

export const EditScript = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const { data: server } = api.server.one.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);

	const { mutateAsync, isPending } = api.server.update.useMutation();

	const { data: defaultCommand } = api.server.getDefaultCommand.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);

	const form = useForm<Schema>({
		defaultValues: {
			command: "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (server) {
			form.reset({
				command: server.command || defaultCommand,
			});
		}
	}, [server, defaultCommand]);

	const onSubmit = async (formData: Schema) => {
		if (server) {
			await mutateAsync({
				...server,
				command: formData.command || "",
				serverId,
			})
				.then((_data) => {
					toast.success(t("settings.servers.editScript.modified"));
				})
				.catch(() => {
					toast.error(t("settings.servers.editScript.modifyError"));
				});
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button variant="outline">
						{t("settings.servers.editScript.trigger")}
						<FileTerminal className="size-4 text-muted-foreground" />
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-5xl overflow-x-hidden">
					<DialogHeader>
						<DialogTitle>{t("settings.servers.editScript.title")}</DialogTitle>
						<DialogDescription>
							{t("settings.servers.editScript.description")}
						</DialogDescription>

						<AlertBlock type="warning">
							{t("settings.servers.editScript.warning")}
						</AlertBlock>
					</DialogHeader>
				<div className="grid gap-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							id="hook-form-delete-application"
							className="grid w-full gap-4"
						>
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.servers.editScript.command")}
											</FormLabel>
										<FormControl className="max-h-[75vh] max-w-240 overflow-y-scroll overflow-x-hidden">
											<CodeEditor
												language="shell"
												wrapperClassName="font-mono"
												{...field}
												placeholder={`
set -e
echo "Hello world"
`}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</form>
					</Form>
				</div>
				<DialogFooter className="flex justify-between w-full">
					<Button
						variant="secondary"
						onClick={() => {
							form.reset({
								command: defaultCommand || "",
							});
						}}
					>
						{t("settings.servers.editScript.reset")}
					</Button>
					<Button
						isLoading={isPending}
						form="hook-form-delete-application"
						type="submit"
					>
						{t("settings.servers.editScript.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
