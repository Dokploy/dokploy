import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { teamSchema } from "@dokploy/server/db/schema/team-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

type FormData = z.infer<typeof teamSchema>;

export const CreateTeam = () => {
	const utils = api.useContext();
	const { mutateAsync, isLoading } = api.team.create.useMutation({
		onSuccess: () => {
			utils.team.all.invalidate();
		},
	});

	const form = useForm<FormData>({
		resolver: zodResolver(teamSchema),
		defaultValues: {
			name: "",
			description: "",
		},
	});

	const onSubmit = async (data: FormData) => {
		try {
			await mutateAsync(data);
			toast.success("Team created successfully");
			form.reset();
		} catch (error) {
			console.error("Create team error:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to create team",
			);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>Create Team</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create New Team</DialogTitle>
					<DialogDescription>
						Create a new team and add members to it
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
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isLoading}>
							Create Team
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
