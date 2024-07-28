import { HeartIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";

export const ShowSupport = () => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" className="rounded-full">
					<span className="text-sm font-semibold">Support </span>
					<HeartIcon className="size-4 text-red-500 fill-red-600 animate-heartbeat " />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl ">
				<DialogHeader className="text-center flex justify-center items-center">
					<DialogTitle>Dokploy Support</DialogTitle>
					<DialogDescription>Consider supporting Dokploy</DialogDescription>
				</DialogHeader>
				<div className="grid w-full gap-4">
					<div className="flex flex-col gap-4">
						<span className="text-sm font-semibold">Name</span>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
