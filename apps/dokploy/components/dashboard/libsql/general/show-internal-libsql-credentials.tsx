import { SelectGroup } from "@radix-ui/react-select";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	libsqlId: string;
}
export const ShowInternalLibsqlCredentials = ({ libsqlId }: Props) => {
	const { data } = api.libsql.one.useQuery({ libsqlId });
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Internal Credentials</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>User</Label>
								<Input disabled value={data?.databaseUser} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Sqld Node</Label>
								<Select value={data?.sqldNode} disabled>
									<SelectTrigger>
										<SelectValue placeholder="Select Node type" />
									</SelectTrigger>
									<SelectContent>
										{["primary", "replica"].map((node) => (
											<SelectItem key={node} value={node}>
												{node.charAt(0).toUpperCase() + node.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Password</Label>
								<div className="flex flex-row gap-4">
									<ToggleVisibilityInput
										disabled
										value={data?.databasePassword}
									/>
								</div>
							</div>

							<div className="flex flex-row gap-2">
								<div className="w-full flex flex-col gap-2">
									<Label>Internal Port (Container)</Label>
									<Input disabled value="8080" />
								</div>
								<div className="w-full flex flex-col gap-2">
									<Label>Internal GRPC Port (Container)</Label>
									<Input disabled value="5001" />
								</div>
								<div className="w-full flex flex-col gap-2">
									<Label>Internal Admin Port (Container)</Label>
									<Input disabled value="5000" />
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Internal Host</Label>
								<Input disabled value={data?.appName} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Enable Namespaces</Label>
								<Select
									disabled
									defaultValue={
										data?.enableNamespaces
											? String(data?.enableNamespaces)
											: "false"
									}
								>
									<SelectTrigger>
										<SelectValue placeholder={"false"} />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{["false", "true"].map((node) => (
												<SelectItem key={node} value={node}>
													{node.charAt(0).toUpperCase() + node.slice(1)}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-2 md:col-span-2">
								<Label>Internal Connection URL </Label>
								<ToggleVisibilityInput
									disabled
									value={`http://${data?.databaseUser}:${data?.databasePassword}@${data?.appName}:8080`}
								/>
							</div>
							<div className="flex flex-col gap-2 md:col-span-2">
								<Label>Internal Replication Connection URL </Label>
								<ToggleVisibilityInput
									disabled
									value={`http://${data?.databaseUser}:${data?.databasePassword}@${data?.appName}:5001`}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
