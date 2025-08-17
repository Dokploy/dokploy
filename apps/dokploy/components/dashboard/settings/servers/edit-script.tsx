import { zodResolver } from "@hookform/resolvers/zod";
import { FileTerminal } from "lucide-react";
import { useEffect, useState } from "react";
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

const schema = z.object({
	command: z.string().min(1, {
		message: "Command is required",
	}),
});

type Schema = z.infer<typeof schema>;

export const EditScript = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
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
					toast.success("Script modified successfully");
				})
				.catch(() => {
					toast.error("Error modifying the script");
				});
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					Modify Script
					<FileTerminal className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl overflow-x-hidden">
				<DialogHeader>
					<DialogTitle>Modify Script</DialogTitle>
					<DialogDescription>
						Modify the script which install everything necessary to deploy
						applications on your server,
					</DialogDescription>

					<AlertBlock type="warning">
						We recommend not modifying this script unless you know what you are
						doing.
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
										<FormLabel>Command</FormLabel>
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
						Reset
					</Button>
					<Button
						isLoading={isLoading}
						form="hook-form-delete-application"
						type="submit"
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
