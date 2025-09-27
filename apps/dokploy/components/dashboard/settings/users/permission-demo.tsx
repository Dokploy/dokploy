import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
	Shield, 
	Users, 
	Settings, 
	Eye, 
	Lock, 
	AlertTriangle,
	CheckCircle,
	XCircle,
	Info
} from "lucide-react";
import { EnhancedReadOnlyWrapper, EnhancedReadOnlyIndicator, useEnhancedReadOnly } from "@/components/shared/enhanced-readonly-wrapper";

export const PermissionSystemDemo = () => {
	const [selectedDemo, setSelectedDemo] = useState("readonly");
	const [demoServiceId] = useState("demo-service-123");

	// Mock user data for demo
	const mockUser = {
		role: "member",
		canReadOnlyServices: true,
		accessedServices: ["demo-service-123", "demo-service-456"],
	};

	const DemoButton = ({ children, variant = "default", ...props }: any) => (
		<Button variant={variant} {...props}>
			{children}
		</Button>
	);

	const DemoForm = () => (
		<div className="space-y-4 p-4 border rounded-lg">
			<div className="space-y-2">
				<label className="text-sm font-medium">Service Name</label>
				<input 
					type="text" 
					placeholder="Enter service name" 
					className="w-full px-3 py-2 border rounded-md"
				/>
			</div>
			<div className="space-y-2">
				<label className="text-sm font-medium">Description</label>
				<textarea 
					placeholder="Enter service description" 
					className="w-full px-3 py-2 border rounded-md"
					rows={3}
				/>
			</div>
			<div className="flex gap-2">
				<DemoButton type="submit">Save Changes</DemoButton>
				<DemoButton variant="outline">Cancel</DemoButton>
			</div>
		</div>
	);

	const ReadOnlyDemo = () => {
		const { isReadOnly, permissionDetails } = useEnhancedReadOnly(demoServiceId);

		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Eye className="h-5 w-5" />
							Read-Only Service Access
						</CardTitle>
						<CardDescription>
							Demonstrates how read-only permissions work in the enhanced system
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Permission Status */}
						<Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
							<Info className="h-4 w-4 text-blue-600" />
							<AlertDescription>
								<div className="space-y-2">
									<div className="font-medium">Current Permission Status:</div>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div className="flex justify-between">
											<span>Read-Only Access:</span>
											<Badge variant={isReadOnly ? "destructive" : "secondary"}>
												{isReadOnly ? "Enabled" : "Disabled"}
											</Badge>
										</div>
										<div className="flex justify-between">
											<span>User Role:</span>
											<Badge variant="outline">member</Badge>
										</div>
										<div className="flex justify-between">
											<span>Service Access:</span>
											<Badge variant={permissionDetails.hasServiceAccess ? "default" : "secondary"}>
												{permissionDetails.hasServiceAccess ? "Yes" : "No"}
											</Badge>
										</div>
										<div className="flex justify-between">
											<span>Read-Only Permission:</span>
											<Badge variant={permissionDetails.hasReadOnlyPermission ? "default" : "secondary"}>
												{permissionDetails.hasReadOnlyPermission ? "Yes" : "No"}
											</Badge>
										</div>
									</div>
								</div>
							</AlertDescription>
						</Alert>

						{/* Enhanced Read-Only Wrapper Demo */}
						<div className="space-y-4">
							<h4 className="font-medium">Enhanced Read-Only Wrapper</h4>
							<EnhancedReadOnlyWrapper 
								serviceId={demoServiceId}
								showDetailedInfo={true}
								permissionContext={{
									resourceType: "application",
									action: "modify",
									showPermissionDetails: true
								}}
							>
								<DemoForm />
							</EnhancedReadOnlyWrapper>
						</div>

						{/* Enhanced Read-Only Indicator Demo */}
						<div className="space-y-4">
							<h4 className="font-medium">Enhanced Read-Only Indicator</h4>
							<div className="flex gap-2">
								<EnhancedReadOnlyIndicator serviceId={demoServiceId}>
									<DemoButton>Deploy Service</DemoButton>
								</EnhancedReadOnlyIndicator>
								<EnhancedReadOnlyIndicator serviceId={demoServiceId}>
									<DemoButton variant="destructive">Delete Service</DemoButton>
								</EnhancedReadOnlyIndicator>
								<EnhancedReadOnlyIndicator serviceId={demoServiceId}>
									<DemoButton variant="outline">View Logs</DemoButton>
								</EnhancedReadOnlyIndicator>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	};

	const PermissionManagementDemo = () => (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Enhanced Permission Management
					</CardTitle>
					<CardDescription>
						New permission management system with Better Auth integration
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Permission Categories */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
							<CardHeader className="pb-3">
								<CardTitle className="text-sm flex items-center gap-2">
									<Settings className="h-4 w-4 text-green-600" />
									Project Management
								</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span>Create Projects</span>
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
									<div className="flex justify-between">
										<span>Delete Projects</span>
										<XCircle className="h-4 w-4 text-red-600" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
							<CardHeader className="pb-3">
								<CardTitle className="text-sm flex items-center gap-2">
									<Shield className="h-4 w-4 text-blue-600" />
									Service Management
								</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span>Create Services</span>
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
									<div className="flex justify-between">
										<span>Read-Only Services</span>
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
									<div className="flex justify-between">
										<span>Delete Services</span>
										<XCircle className="h-4 w-4 text-red-600" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card className="border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950">
							<CardHeader className="pb-3">
								<CardTitle className="text-sm flex items-center gap-2">
									<Settings className="h-4 w-4 text-purple-600" />
									System Access
								</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span>Docker Access</span>
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
									<div className="flex justify-between">
										<span>API Access</span>
										<XCircle className="h-4 w-4 text-red-600" />
									</div>
									<div className="flex justify-between">
										<span>SSH Keys</span>
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Better Auth Integration Info */}
					<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
						<AlertTriangle className="h-4 w-4 text-amber-600" />
						<AlertDescription>
							<div className="space-y-2">
								<div className="font-medium">Better Auth Integration</div>
								<div className="text-sm">
									This enhanced permission system integrates with Better Auth's organization plugin
									while maintaining backward compatibility with the existing custom permission system.
								</div>
							</div>
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		</div>
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Users className="h-5 w-5" />
						Enhanced Permission System Demo
					</CardTitle>
					<CardDescription>
						Demonstrates the new hybrid permission system with Better Auth integration
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs value={selectedDemo} onValueChange={setSelectedDemo}>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="readonly">Read-Only Features</TabsTrigger>
							<TabsTrigger value="management">Permission Management</TabsTrigger>
						</TabsList>
						
						<TabsContent value="readonly">
							<ReadOnlyDemo />
						</TabsContent>
						
						<TabsContent value="management">
							<PermissionManagementDemo />
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
};
