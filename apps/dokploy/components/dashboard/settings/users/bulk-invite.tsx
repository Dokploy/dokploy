import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";

const bulkInviteSchema = z.object({
	invitations: z
		.array(
			z.object({
				email: z.string().min(1, "Email is required").email("Invalid email"),
				role: z.string().min(1, "Role is required"),
			}),
		)
		.min(1, "Add at least one invitation"),
});

type BulkInviteForm = z.infer<typeof bulkInviteSchema>;

type InviteResult = {
	email: string;
	status: "invited" | "skipped";
	reason?: string;
};

export const BulkInvite = () => {
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<InviteResult[] | null>(null);
	const utils = api.useUtils();
	const { data: customRoles } = api.customRole.all.useQuery();
	const { mutateAsync: bulkInvite, isPending } =
		api.organization.bulkInviteMembers.useMutation();

	const form = useForm<BulkInviteForm>({
		defaultValues: {
			invitations: [{ email: "", role: "member" }],
		},
		resolver: zodResolver(bulkInviteSchema),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "invitations",
	});

	const onSubmit = async (data: BulkInviteForm) => {
		try {
			const res = await bulkInvite({ invitations: data.invitations });
			setResults(res);
			const invited = res.filter((r) => r.status === "invited").length;
			const skipped = res.filter((r) => r.status === "skipped").length;
			if (invited > 0) {
				toast.success(
					`${invited} invitation${invited > 1 ? "s" : ""} sent${skipped > 0 ? `, ${skipped} skipped` : ""}`,
				);
			} else {
				toast.warning("All invitations were skipped");
			}
			await utils.organization.allInvitations.invalidate();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to send invitations";
			toast.error(message);
		}
	};

	const handleClose = (val: boolean) => {
		if (!val) {
			setResults(null);
			form.reset({ invitations: [{ email: "", role: "member" }] });
		}
		setOpen(val);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<UsersIcon className="h-4 w-4" /> Bulk Invite
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Bulk Invite Members</DialogTitle>
					<DialogDescription>
						Invite up to 50 members at once. Duplicates and existing members are
						skipped automatically.
					</DialogDescription>
				</DialogHeader>

				{results ? (
					<div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
						{results.map((r) => (
							<div
								key={r.email}
								className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
							>
								<span className="text-muted-foreground truncate">{r.email}</span>
								<div className="flex items-center gap-2 shrink-0">
									{r.reason && (
										<span className="text-xs text-muted-foreground">{r.reason}</span>
									)}
									<Badge variant={r.status === "invited" ? "default" : "secondary"}>
										{r.status}
									</Badge>
								</div>
							</div>
						))}
					</div>
				) : (
					<Form {...form}>
						<form
							id="bulk-invite-form"
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1"
						>
							{fields.map((field, index) => (
								<div key={field.id} className="flex gap-2 items-start">
									<FormField
										control={form.control}
										name={`invitations.${index}.email`}
										render={({ field }) => (
											<FormItem className="flex-1">
												{index === 0 && <FormLabel>Email</FormLabel>}
												<FormControl>
													<Input placeholder="user@example.com" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name={`invitations.${index}.role`}
										render={({ field }) => (
											<FormItem className="w-36">
												{index === 0 && <FormLabel>Role</FormLabel>}
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Role" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectItem value="member">Member</SelectItem>
														<SelectItem value="admin">Admin</SelectItem>
														{customRoles?.map((role) => (
															<SelectItem key={role.role} value={role.role}>
																{role.role}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className={index === 0 ? "mt-6" : ""}
										onClick={() => remove(index)}
										disabled={fields.length === 1}
									>
										<Trash2Icon className="h-4 w-4 text-muted-foreground" />
									</Button>
								</div>
							))}

							{fields.length < 50 && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="self-start"
									onClick={() => append({ email: "", role: "member" })}
								>
									<PlusIcon className="h-4 w-4" /> Add Row
								</Button>
							)}
						</form>
					</Form>
				)}

				<DialogFooter>
					{results ? (
						<Button onClick={() => handleClose(false)}>Done</Button>
					) : (
						<Button
							form="bulk-invite-form"
							type="submit"
							isLoading={isPending}
						>
							Send {fields.length} Invitation{fields.length > 1 ? "s" : ""}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
