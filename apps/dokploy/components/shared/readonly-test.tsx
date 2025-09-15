import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReadOnlyFormWrapper } from "./readonly-wrapper";
import { useReadOnlyAction } from "@/hooks/use-readonly";

interface ReadOnlyTestProps {
	serviceId: string;
}

export const ReadOnlyTest = ({ serviceId }: ReadOnlyTestProps) => {
	const [inputValue, setInputValue] = useState("");
	const [textareaValue, setTextareaValue] = useState("");
	const [switchValue, setSwitchValue] = useState(false);
	const [checkboxValue, setCheckboxValue] = useState(false);
	const [selectValue, setSelectValue] = useState("");
	
	const { executeAction, executeAsyncAction, isReadOnly } = useReadOnlyAction(serviceId, "test-action");
	
	const handleButtonClick = () => {
		executeAction(() => {
			alert("Button clicked! This should not work in read-only mode.");
		});
	};
	
	const handleAsyncButtonClick = async () => {
		await executeAsyncAction(async () => {
			alert("Async button clicked! This should not work in read-only mode.");
		});
	};
	
	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		executeAction(() => {
			alert("Form submitted! This should not work in read-only mode.");
		});
	};
	
	return (
		<div className="p-4 border rounded-lg">
			<h3 className="text-lg font-semibold mb-4">Read-Only Test Component</h3>
			<p className="text-sm text-muted-foreground mb-4">
				Service ID: {serviceId} | Read-Only: {isReadOnly ? "Yes" : "No"}
			</p>
			
			<ReadOnlyFormWrapper serviceId={serviceId}>
				<div className="space-y-4">
					{/* Buttons */}
					<div className="space-y-2">
						<h4 className="font-medium">Buttons</h4>
						<div className="flex gap-2">
							<Button onClick={handleButtonClick}>
								Regular Button
							</Button>
							<Button onClick={handleAsyncButtonClick}>
								Async Button
							</Button>
							<Button type="submit" form="test-form">
								Submit Button
							</Button>
						</div>
					</div>
					
					{/* Form */}
					<form id="test-form" onSubmit={handleFormSubmit} className="space-y-4">
						<h4 className="font-medium">Form Elements</h4>
						
						<div className="space-y-2">
							<label className="text-sm font-medium">Text Input</label>
							<Input
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								placeholder="Type something..."
							/>
						</div>
						
						<div className="space-y-2">
							<label className="text-sm font-medium">Textarea</label>
							<Textarea
								value={textareaValue}
								onChange={(e) => setTextareaValue(e.target.value)}
								placeholder="Type something..."
							/>
						</div>
						
						<div className="space-y-2">
							<label className="text-sm font-medium">Select</label>
							<Select value={selectValue} onValueChange={setSelectValue}>
								<SelectTrigger>
									<SelectValue placeholder="Select an option" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="option1">Option 1</SelectItem>
									<SelectItem value="option2">Option 2</SelectItem>
									<SelectItem value="option3">Option 3</SelectItem>
								</SelectContent>
							</Select>
						</div>
						
						<div className="flex items-center space-x-2">
							<Switch
								checked={switchValue}
								onCheckedChange={setSwitchValue}
							/>
							<label className="text-sm font-medium">Switch</label>
						</div>
						
						<div className="flex items-center space-x-2">
							<Checkbox
								checked={checkboxValue}
								onCheckedChange={setCheckboxValue}
							/>
							<label className="text-sm font-medium">Checkbox</label>
						</div>
					</form>
					
					{/* Current Values */}
					<div className="space-y-2">
						<h4 className="font-medium">Current Values</h4>
						<div className="text-sm space-y-1">
							<p>Input: {inputValue}</p>
							<p>Textarea: {textareaValue}</p>
							<p>Select: {selectValue}</p>
							<p>Switch: {switchValue ? "On" : "Off"}</p>
							<p>Checkbox: {checkboxValue ? "Checked" : "Unchecked"}</p>
						</div>
					</div>
				</div>
			</ReadOnlyFormWrapper>
		</div>
	);
};
