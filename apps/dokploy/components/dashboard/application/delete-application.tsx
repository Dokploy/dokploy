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
import { zodResolver } from "@hookform/resolvers/zod";
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const deleteApplicationSchema = z.object({
	projectName: z.string().min(1, {
		message: "Application name is required",
	}),
});

type DeleteApplication = z.infer<typeof deleteApplicationSchema>;

interface Props {
	applicationId: string;
}

export const DeleteApplication = ({ applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, isLoading } = api.application.delete.useMutation();
	const { data } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const { push } = useRouter();
	const form = useForm<DeleteApplication>({
		defaultValues: {
			projectName: "",
		},
		resolver: zodResolver(deleteApplicationSchema),
	});

	const onSubmit = async (formData: DeleteApplication) => {
		const expectedName = `${data?.name}/${data?.appName}`;
		if (formData.projectName === expectedName) {
			await mutateAsync({
				applicationId,
			})
				.then((data) => {
					push(`/dashboard/project/${data?.projectId}`);
					toast.success("Application deleted successfully");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error deleting the application");
				});
		} else {
			form.setError("projectName", {
				message: "Project name does not match",
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
						application. If you are sure please enter the application name to
						delete this application.
					</DialogDescription>
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
								name="projectName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											To confirm, type "{data?.name}/{data?.appName}" in the box
											below
										</FormLabel>
										<FormControl>
											<Input
												placeholder="Enter application name to confirm"
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
						onClick={() => {
							setIsOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button
						isLoading={isLoading}
						form="hook-form-delete-application"
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
