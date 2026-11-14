import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const groupSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
});

type GroupForm = z.infer<typeof groupSchema>;

interface Props {
	groupId?: string;
}

export const HandleResourceGroup = ({ groupId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const {
		mutateAsync: createMutateAsync,
		isError,
		error,
		isPending,
	} = api.resourceProfile.createGroup.useMutation();
	const { mutateAsync: updateMutateAsync } =
		api.resourceProfile.updateGroup.useMutation();

	const { data: group } = api.resourceProfile.oneGroup.useQuery(
		{ groupId: groupId || "" },
		{
			enabled: !!groupId,
			refetchOnWindowFocus: false,
		},
	);

	const form = useForm<GroupForm>({
		defaultValues: { name: "", description: "" },
		resolver: zodResolver(groupSchema),
	});

	useEffect(() => {
		if (group) {
			form.reset({
				name: group.name,
				description: group.description || "",
			});
		}
	}, [group, form]);

	useEffect(() => {
		if (!open) {
			form.reset({ name: "", description: "" });
		}
	}, [open, form]);

	const onSubmit = async (data: GroupForm) => {
		if (groupId) {
			await updateMutateAsync({
				groupId,
				name: data.name,
				description: data.description,
			})
				.then(() => {
					toast.success("Group updated");
					utils.resourceProfile.all.invalidate();
					setOpen(false);
				})
				.catch(() => {
					toast.error("Error saving the group");
				});
		} else {
			await createMutateAsync({
				name: data.name,
				description: data.description,
			})
				.then(() => {
					toast.success("Group created");
					utils.resourceProfile.all.invalidate();
					setOpen(false);
				})
				.catch(() => {
					toast.error("Error creating the group");
				});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={groupId ? "ghost" : "default"}
					size={groupId ? "icon" : "default"}
				>
					{groupId ? (
						<PenBoxIcon className="size-4 text-primary" />
					) : (
						<>
							<PlusIcon className="size-4 mr-1" />
							Create Group
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{groupId ? "Edit" : "Create"} Resource Group
					</DialogTitle>
					<DialogDescription>
						A group represents a set of named resource profiles, like a server
						tier (for example KVM-2 or KVM-4).
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="resource-group-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="KVM-2" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description (optional)</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Sizing for small VPS instances"
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								Save
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
