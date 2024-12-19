import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const deleteComposeSchema = z.object({
	projectName: z.string().min(1, {
		message: "Compose name is required",
	}),
	deleteVolumes: z.boolean(),
});

type DeleteCompose = z.infer<typeof deleteComposeSchema>;

interface Props {
	composeId: string;
}

export const DeleteCompose = ({ composeId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, isLoading } = api.compose.delete.useMutation();
	const { data } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);
	const { push } = useRouter();
	const form = useForm<DeleteCompose>({
		defaultValues: {
			projectName: "",
			deleteVolumes: false,
		},
		resolver: zodResolver(deleteComposeSchema),
	});

	const onSubmit = async (formData: DeleteCompose) => {
		const expectedName = `${data?.name}/${data?.appName}`;
		if (formData.projectName === expectedName) {
			const { deleteVolumes } = formData;
			await mutateAsync({ composeId, deleteVolumes })
				.then((result) => {
					push(`/dashboard/project/${result?.projectId}`);
					toast.success("Compose deleted successfully");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error deleting the compose");
				});
		} else {
			form.setError("projectName", {
				message: `Project name must match "${expectedName}"`,
			});
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" isLoading={isLoading}>
					<TrashIcon className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Are you absolutely sure?</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete the
						compose. If you are sure please enter the compose name to delete
						this compose.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							id="hook-form-delete-compose"
							className="grid w-full gap-4"
						>
							<FormField
								control={form.control}
								name="projectName"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<span>
												To confirm, type{" "}
												<Badge
													className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer"
													variant="outline"
													onClick={() => {
														if (data?.name && data?.appName) {
															navigator.clipboard.writeText(
																`${data.name}/${data.appName}`,
															);
															toast.success("Copied to clipboard. Be careful!");
														}
													}}
												>
													{data?.name}/{data?.appName}&nbsp;
													<Copy className="h-4 w-4 ml-1 text-muted-foreground" />
												</Badge>{" "}
												in the box below:
											</span>
										</FormLabel>
										<FormControl>
											<Input
												placeholder="Enter compose name to confirm"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="deleteVolumes"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>

											<FormLabel className="ml-2">
												Delete volumes associated with this compose
											</FormLabel>
										</div>
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
						onClick={() => {
							setIsOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button
						isLoading={isLoading}
						form="hook-form-delete-compose"
						type="submit"
						variant="destructive"
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
