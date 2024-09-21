import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TraefikActions } from "./traefik-actions";
interface Props {
	serverId: string;
}

export const ShowServer = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					View Actions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							Server Actions
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							View all the actions you can do with this server remotely
						</p>
					</div>
				</DialogHeader>

				<div className="grid grid-cols-3 w-full gap-1">
					<Card className="bg-transparent">
						<CardHeader>
							<CardTitle className="text-xl">Traefik</CardTitle>
							<CardDescription>
								Deploy your new project in one-click.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<TraefikActions serverId={serverId} />
						</CardContent>
						<CardFooter className="flex justify-between">
							<Button variant="outline">Cancel</Button>
							<Button>Deploy</Button>
						</CardFooter>
					</Card>
					{/* <ShowTraefikSystem serverId={serverId} /> */}
				</div>
			</DialogContent>
		</Dialog>
	);
};
