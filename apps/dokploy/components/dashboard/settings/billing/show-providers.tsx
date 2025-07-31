import { DollarSign } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShowHetznerProviders } from "./show-hetzner-providers";
import { ShowHostingerServers } from "./show-hostinger-servers";

export const ShowProviders = () => {
	return (
		<Card className="w-full bg-transparent border-none">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<DollarSign className="h-6 w-6 text-green-600" />
					Servers
				</CardTitle>
				<CardDescription>
					Manage and view available server types from Hetzner and Hostinger for
					your business. Here you can see updated pricing and specifications for
					each plan.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="hetzner" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="hetzner" className="flex items-center gap-2">
							🇩🇪 Hetzner Cloud
						</TabsTrigger>
						<TabsTrigger value="hostinger" className="flex items-center gap-2">
							🌍 Hostinger VPS
						</TabsTrigger>
					</TabsList>
					<TabsContent value="hetzner" className="mt-4">
						<ShowHetznerProviders />
					</TabsContent>
					<TabsContent value="hostinger" className="mt-4">
						<ShowHostingerServers />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
};
