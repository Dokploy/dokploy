import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { updateTeamSchema } from "@dokploy/server/db/schema/team-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

type FormData = z.infer<typeof updateTeamSchema>;

interface Props {
	teamId: string;
	defaultValues: FormData;
}

export const EditTeam = ({ teamId, defaultValues }: Props) => {
	const utils = api.useContext();
	const { mutateAsync, isLoading } = api.team.update.useMutation({
		onSuccess: () => {
			utils.team.all.invalidate();
			utils.team.byId.invalidate({ teamId });
		},
	});

	const form = useForm<FormData>({
		resolver: zodResolver(updateTeamSchema),
		defaultValues,
	});

	const onSubmit = async (data: FormData) => {
		try {
			await mutateAsync(data);
			toast.success("Team updated successfully");
		} catch (error) {
			console.error("Update team error:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to update team",
			);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem onSelect={(e) => e.preventDefault()}>
					Edit Team
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Team</DialogTitle>
					<DialogDescription>
						Update team name and description
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Team Name</FormLabel>
									<FormControl>
										<Input placeholder="Enter team name" {...field} />
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
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Enter team description"
											{...field}
											value={field.value || ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isLoading}>
							Update Team
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
