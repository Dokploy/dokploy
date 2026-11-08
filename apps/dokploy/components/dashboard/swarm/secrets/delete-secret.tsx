import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { Copy, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	secretId: string;
	name: string;
	serverId?: string;
	disabled: boolean;
	onRefresh: () => void;
}

export const DeleteSecret = ({
	secretId,
	name,
	serverId,
	disabled,
	onRefresh,
}: Props) => {
	const [open, setOpen] = useState(false);
	const formId = useId();
	const utils = api.useUtils();
	const remove = api.dockerSecret.remove.useMutation({
		gcTime: 0,
		onSuccess: () => utils.dockerSecret.count.invalidate({ serverId }),
	});
	const form = useForm<{ confirmationName: string }>({
		defaultValues: { confirmationName: "" },
		resolver: zodResolver(
			z.object({
				confirmationName: z
					.string()
					.refine(
						(value) => value === name,
						`Secret name must match "${name}"`,
					),
			}),
		),
	});
	const changeOpen = (next: boolean) => {
		if (remove.isPending) return;
		setOpen(next);
		form.reset();
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex" tabIndex={disabled ? 0 : undefined}>
							<DialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Delete ${name}`}
									disabled={disabled}
								>
									<Trash2 className="size-4 text-destructive" />
								</Button>
							</DialogTrigger>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						{disabled
							? "This secret is used by a service or its rollback settings. Remove those references before deleting it."
							: "Delete secret"}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Are you absolutely sure?</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete the
						secret. Enter the secret name to confirm.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<Form {...form}>
						<form
							id={formId}
							className="grid w-full gap-4"
							onSubmit={form.handleSubmit(async ({ confirmationName }) => {
								if (disabled || confirmationName !== name) return;
								try {
									await remove.mutateAsync({
										secretId,
										confirmationName,
										serverId,
									});
									toast.success("Secret deleted");
									setOpen(false);
									form.reset();
								} catch (error) {
									toast.error("Error deleting secret", {
										description:
											error instanceof Error ? error.message : "Unknown error",
									});
								} finally {
									remove.reset();
									onRefresh();
								}
							})}
						>
							<FormField
								control={form.control}
								name="confirmationName"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<span>
												To confirm, type{" "}
												<Badge
													asChild
													variant="outline"
													className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer"
												>
													<button
														type="button"
														aria-label="Copy secret name"
														onClick={() => {
															copy(name);
															toast.success("Copied to clipboard. Be careful!");
														}}
													>
														{name}
														<Copy className="h-4 w-4 ml-1 text-muted-foreground" />
													</button>
												</Badge>{" "}
												in the box below:
											</span>
										</FormLabel>
										<FormControl>
											<Input
												placeholder="Enter secret name to confirm"
												aria-label="Secret name to confirm"
												autoComplete="off"
												spellCheck={false}
												maxLength={64}
												disabled={remove.isPending}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</form>
					</Form>
				</div>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => changeOpen(false)}
						disabled={remove.isPending}
					>
						Cancel
					</Button>
					<Button
						form={formId}
						type="submit"
						variant="destructive"
						isLoading={remove.isPending}
						disabled={
							disabled ||
							remove.isPending ||
							form.watch("confirmationName") !== name
						}
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
