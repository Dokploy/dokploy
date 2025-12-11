import { zodResolver } from "@hookform/resolvers/zod";
import { FileTerminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "next-i18next";
import { useForm } from "react-hook-form";
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

const createSchema = (t: (key: string) => string) =>
	z.object({
		command: z.string().min(1, {
			message: t("settings.servers.script.validation.commandRequired"),
		}),
	});

type Schema = z.infer<ReturnType<typeof createSchema>>;

export const EditScript = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("settings");
	const schema = useMemo(() => createSchema(t), [t]);
	const { data: server } = api.server.one.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);

	const { mutateAsync, isLoading } = api.server.update.useMutation();

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
					toast.success(t("settings.servers.script.toast.updated"));
				})
				.catch(() => {
					toast.error(t("settings.servers.script.toast.updateError"));
				});
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					{t("settings.servers.script.button.open")}
					<FileTerminal className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl overflow-x-hidden">
				<DialogHeader>
					<DialogTitle>{t("settings.servers.script.dialog.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.servers.script.dialog.description")}
					</DialogDescription>

					<AlertBlock type="warning">
						{t("settings.servers.script.alert.warning")}
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
											{t("settings.servers.script.form.command.label")}
										</FormLabel>
										<FormControl className="max-h-[75vh] max-w-[60rem] overflow-y-scroll overflow-x-hidden">
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
						{t("settings.servers.script.button.reset")}
					</Button>
					<Button
						isLoading={isLoading}
						form="hook-form-delete-application"
						type="submit"
					>
						{t("settings.servers.script.button.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
