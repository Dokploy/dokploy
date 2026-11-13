import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
	disabled?: boolean;
}

export const CreateSecret = ({ serverId, disabled }: Props) => {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState("");
	const formId = useId();
	const utils = api.useUtils();
	const create = api.dockerSecret.create.useMutation({
		gcTime: 0,
		onSuccess: () =>
			Promise.all([
				utils.dockerSecret.count.invalidate({ serverId }),
				utils.dockerSecret.list.invalidate({ serverId }),
			]),
	});
	const form = useForm<{ name: string; value: string }>({
		defaultValues: { name: "", value: "" },
		resolver: zodResolver(
			z.object({
				name: z
					.string()
					.min(1, "Secret name is required.")
					.max(64)
					.regex(
						/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
						"Use letters, numbers, dots, underscores, or hyphens, starting with a letter or number.",
					),
				value: z
					.string()
					.min(1, "Secret content is required.")
					.refine(
						(value) => new TextEncoder().encode(value).length < 500 * 1024,
						"Secret must be less than 500 KiB (maximum 511,999 UTF-8 bytes).",
					),
			}),
		),
	});
	const changeOpen = (next: boolean) => {
		if (create.isPending) return;
		setOpen(next);
		setError("");
		form.reset({ name: "", value: "" });
		create.reset();
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild>
				<Button disabled={disabled}>
					<Plus className="size-4" />
					Create secret
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Swarm secret</DialogTitle>
					<DialogDescription>
						The content is sent to Docker and cannot be retrieved after
						creation. Keep a copy in your password manager if needed.
					</DialogDescription>
				</DialogHeader>
				{error && (
					<AlertBlock type="error" role="alert">
						{error}
					</AlertBlock>
				)}
				<Form {...form}>
					<form
						id={formId}
						className="grid w-full gap-4"
						onSubmit={form.handleSubmit(async ({ name, value }) => {
							setError("");
							try {
								await create.mutateAsync({ serverId, name, value });
								toast.success("Secret created");
								setOpen(false);
								form.reset({ name: "", value: "" });
							} catch (cause) {
								setError(
									cause instanceof Error
										? cause.message
										: "Could not create the secret.",
								);
							} finally {
								create.reset();
							}
						})}
					>
						<FormField
							control={form.control}
							name="value"
							render={({ field }) => (
								<FormItem className="w-full min-w-0">
									<FormLabel onClick={() => form.setFocus("value")}>
										Content
									</FormLabel>
									<FormControl>
										<CodeEditor
											language="properties"
											className="h-96 font-mono w-full"
											height="384px"
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
											onCreateEditor={(view) => {
												field.ref(view.contentDOM);
												view.contentDOM.setAttribute("aria-label", "Content");
												view.contentDOM.setAttribute("autocomplete", "off");
												view.contentDOM.setAttribute("autocapitalize", "off");
												view.contentDOM.setAttribute("spellcheck", "false");
											}}
											disabled={create.isPending}
										/>
									</FormControl>
									<p className="text-xs text-muted-foreground">
										Text or a multiline key, less than 500 KiB. Whitespace is
										preserved.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											maxLength={64}
											placeholder="mysql_password_production_v1"
											{...field}
											disabled={create.isPending}
											autoComplete="off"
											spellCheck={false}
										/>
									</FormControl>
									<p className="text-xs text-muted-foreground">
										1 to 64 letters, numbers, dots, underscores, or hyphens.
										Start with a letter or number.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => changeOpen(false)}
						disabled={create.isPending}
					>
						Cancel
					</Button>
					<Button
						form={formId}
						type="submit"
						isLoading={create.isPending}
						disabled={
							create.isPending || !form.watch("name") || !form.watch("value")
						}
					>
						Create secret
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
