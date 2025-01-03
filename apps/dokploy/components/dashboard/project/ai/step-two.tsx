import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, EyeOff, PlusCircle, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
	ssr: false,
});

interface TemplateInfo {
	id: string;
	name: string;
	shortDescription: string;
	description: string;
	dockerCompose: string;
	envVariables: { name: string; value: string }[];
}

// This is a mock function to simulate AI processing
const mockAIProcessing = (
	userInput: string,
): Promise<Partial<TemplateInfo>[]> => {
	return new Promise((resolve) => {
		setTimeout(() => {
			const lowercaseInput = userInput.toLowerCase();
			if (lowercaseInput.includes("blog")) {
				resolve([
					{
						id: "personal-blog",
						name: "Personal Blog Variant",
						shortDescription:
							"A customizable personal blog platform with modern features.",
						description: `
# Personal Blog Variant

This variant is designed for creating a personal blog with customizable themes and layouts.

## Features:
- Customizable themes
- Responsive layouts
- SEO optimization
- Comment system integration
- Social media sharing

Perfect for individuals who want to share their thoughts, experiences, or expertise with the world.
            `,
						dockerCompose: `version: '3'
services:
  blog:
    image: personal-blog:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/blog
      - SECRET_KEY=your_secret_key_here
  db:
    image: postgres:13
    environment:
      - POSTGRES_DB=blog
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - blog_data:/var/lib/postgresql/data

volumes:
  blog_data:`,
						envVariables: [
							{
								name: "DATABASE_URL",
								value: "postgresql://user:password@db:5432/blog",
							},
							{ name: "SECRET_KEY", value: "your_secret_key_here" },
						],
					},
					{
						id: "tech-blog",
						name: "Tech Blog Variant",
						shortDescription:
							"A blog platform tailored for technology content creators.",
						description:
							"A variant designed for technology-focused blogs with code snippet support.",
					},
					{
						id: "lifestyle-blog",
						name: "Lifestyle Blog Variant",
						shortDescription:
							"A visually-rich blog for lifestyle and personal branding.",
						description:
							"A variant for lifestyle bloggers with image galleries and social media integration.",
					},
				]);
			} else {
				resolve([
					{
						id: "multipurpose",
						name: "Multipurpose Variant",
						shortDescription:
							"A flexible, feature-rich platform adaptable to various use cases.",
						description: `
# Multipurpose Variant

A versatile variant that can be customized for various purposes.

## Key Features:
- Modular architecture
- Extensible plugin system
- Multi-language support
- Advanced user management
- Customizable dashboard

Ideal for businesses or individuals who need a flexible solution that can adapt to different use cases.
            `,
						dockerCompose: `version: '3'
services:
  app:
    image: multipurpose:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mongodb://db:27017/myapp
      - REDIS_URL=redis://cache:6379
  db:
    image: mongo:4
    volumes:
      - app_data:/data/db
  cache:
    image: redis:6

volumes:
  app_data:`,
						envVariables: [
							{ name: "DATABASE_URL", value: "mongodb://db:27017/myapp" },
							{ name: "REDIS_URL", value: "redis://cache:6379" },
						],
					},
					{
						id: "portfolio",
						name: "Portfolio Variant",
						shortDescription:
							"An elegant platform to showcase your work and projects.",
						description: "A variant for showcasing your work and projects.",
					},
					{
						id: "landing-page",
						name: "Landing Page Variant",
						shortDescription:
							"A high-converting template for product or service promotion.",
						description:
							"A variant for creating effective landing pages for products or services.",
					},
				]);
			}
		}, 1000);
	});
};

export function StepTwo({
	nextStep,
	prevStep,
	templateInfo,
	setTemplateInfo,
}: any) {
	const [suggestions, setSuggestions] = useState([]);
	const [loading, setLoading] = useState(true);
	const [selectedVariant, setSelectedVariant] = useState("");
	const [dockerCompose, setDockerCompose] = useState("");
	const [envVariables, setEnvVariables] = useState([]);
	const [showValues, setShowValues] = useState({});

	useEffect(() => {
		const fetchSuggestions = async () => {
			setLoading(true);
			const result = await mockAIProcessing(templateInfo.userInput);
			setSuggestions(result);
			setLoading(false);
		};

		fetchSuggestions();
	}, [templateInfo.userInput]);

	useEffect(() => {
		if (selectedVariant) {
			const selected = suggestions.find(
				(s: { id: string }) => s.id === selectedVariant,
			);
			if (selected) {
				setDockerCompose(selected.dockerCompose);
				setEnvVariables(selected.envVariables);
				setShowValues(
					selected.envVariables.reduce((acc, env) => {
						acc[env.name] = false;
						return acc;
					}, {}),
				);
			}
		}
	}, [selectedVariant, suggestions]);

	const handleNext = () => {
		const selected = suggestions.find(
			(s: { id: string }) => s.id === selectedVariant,
		);
		if (selected) {
			setTemplateInfo({
				...templateInfo,
				type: selectedVariant,
				details: {
					...selected,
					dockerCompose,
					envVariables,
				},
			});
		}
		nextStep();
	};

	const handleEnvVariableChange = (index, field, value) => {
		const updatedEnvVariables = [...envVariables];
		updatedEnvVariables[index] = {
			...updatedEnvVariables[index],
			[field]: value,
		};
		setEnvVariables(updatedEnvVariables);
	};

	const addEnvVariable = () => {
		setEnvVariables([...envVariables, { name: "", value: "" }]);
		setShowValues((prev) => ({ ...prev, "": false }));
	};

	const removeEnvVariable = (index) => {
		const updatedEnvVariables = envVariables.filter((_, i) => i !== index);
		setEnvVariables(updatedEnvVariables);
	};

	const toggleShowValue = (name: string) => {
		setShowValues((prev) => ({ ...prev, [name]: !prev[name] }));
	};

	if (loading) {
		return <div>Processing your request...</div>;
	}

	const selectedTemplate = suggestions.find(
		(s: { id: string }) => s.id === selectedVariant,
	);

	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow overflow-auto">
				<div className="space-y-6 pb-20">
					<h2 className="text-lg font-semibold">Step 2: Choose a Variant</h2>
					{!selectedVariant && (
						<div className="space-y-4">
							<div>Based on your input, we suggest the following variants:</div>
							<RadioGroup
								value={selectedVariant}
								onValueChange={setSelectedVariant}
								className="space-y-4"
							>
								{suggestions.map((suggestion) => (
									<div
										key={suggestion.id}
										className="flex items-start space-x-3"
									>
										<RadioGroupItem
											value={suggestion.id}
											id={suggestion.id}
											className="mt-1"
										/>
										<div>
											<Label htmlFor={suggestion.id} className="font-medium">
												{suggestion.name}
											</Label>
											<p className="text-sm text-muted-foreground">
												{suggestion.shortDescription}
											</p>
										</div>
									</div>
								))}
							</RadioGroup>
						</div>
					)}
					{selectedVariant && (
						<>
							<div className="mb-6">
								<h3 className="text-xl font-bold">{selectedTemplate?.name}</h3>
								<p className="text-muted-foreground mt-2">
									{selectedTemplate?.shortDescription}
								</p>
							</div>
							<ScrollArea className="h-[400px] p-5">
								<Accordion type="single" collapsible className="w-full">
									<AccordionItem value="description">
										<AccordionTrigger>Description</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="h-[300px] w-full rounded-md border">
												<div className="p-4">
													<ReactMarkdown className="prose dark:prose-invert">
														{selectedTemplate?.description}
													</ReactMarkdown>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="docker-compose">
										<AccordionTrigger>Docker Compose</AccordionTrigger>
										<AccordionContent>
											<div className="h-[400px] w-full rounded-md border overflow-hidden">
												<MonacoEditor
													height="100%"
													language="yaml"
													theme="vs-dark"
													value={dockerCompose}
													onChange={(value) => setDockerCompose(value)}
													options={{
														minimap: { enabled: false },
														scrollBeyondLastLine: false,
														fontSize: 14,
														lineNumbers: "on",
														readOnly: false,
														wordWrap: "on",
														automaticLayout: true,
													}}
												/>
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="env-variables">
										<AccordionTrigger>Environment Variables</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="h-[300px] w-full rounded-md border">
												<div className="p-4 space-y-4">
													{envVariables.map((env, index) => (
														<div
															key={index}
															className="flex items-center space-x-2"
														>
															<Input
																value={env.name}
																onChange={(e) =>
																	handleEnvVariableChange(
																		index,
																		"name",
																		e.target.value,
																	)
																}
																placeholder="Variable Name"
																className="flex-1"
															/>
															<div className="flex-1 relative">
																<Input
																	type={
																		showValues[env.name] ? "text" : "password"
																	}
																	value={env.value}
																	onChange={(e) =>
																		handleEnvVariableChange(
																			index,
																			"value",
																			e.target.value,
																		)
																	}
																	placeholder="Variable Value"
																/>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	className="absolute right-2 top-1/2 transform -translate-y-1/2"
																	onClick={() => toggleShowValue(env.name)}
																>
																	{showValues[env.name] ? (
																		<EyeOff className="h-4 w-4" />
																	) : (
																		<Eye className="h-4 w-4" />
																	)}
																</Button>
															</div>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																onClick={() => removeEnvVariable(index)}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													))}
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="mt-2"
														onClick={addEnvVariable}
													>
														<PlusCircle className="h-4 w-4 mr-2" />
														Add Variable
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</ScrollArea>
						</>
					)}
				</div>
			</div>
			<div className="sticky bottom-0 bg-background pt-2 border-t">
				<div className="flex justify-between">
					<Button
						onClick={() =>
							selectedVariant ? setSelectedVariant("") : prevStep()
						}
						variant="outline"
					>
						{selectedVariant ? "Change Variant" : "Back"}
					</Button>
					<Button onClick={handleNext} disabled={!selectedVariant}>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
