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
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddWorkerSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type AddWorker = z.infer<typeof AddWorkerSchema>;

export const AddWorker = () => {
	const utils = api.useUtils();

	const { data, isLoading } = api.cluster.addWorker.useQuery();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="h-4 w-4" />
					Add Worker
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-screen overflow-y-auto ">
				<DialogHeader>
					<DialogTitle>Add a new worker</DialogTitle>
					<DialogDescription>Add a new worker</DialogDescription>
				</DialogHeader>
				{/* {isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)} */}
				<div className="flex flex-col gap-4 text-sm">
					<span>1. Go to your new server and run the following command</span>
					<span className="bg-muted rounded-lg p-2">
						curl https://get.docker.com | sh -s -- --version 24.0
					</span>
				</div>

				<div className="flex flex-col gap-4 text-sm">
					<span>
						2. Run the following command to add the node(server) to your cluster
					</span>
					<span className="bg-muted rounded-lg p-2 ">{data}</span>
				</div>
			</DialogContent>
		</Dialog>
	);
};
