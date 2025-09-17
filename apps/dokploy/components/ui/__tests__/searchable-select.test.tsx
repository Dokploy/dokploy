import { render, screen, fireEvent } from "@testing-library/react";
import { SearchableSelect } from "../searchable-select";

const mockOptions = [
	{ value: "gpt-4", label: "GPT-4" },
	{ value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
	{ value: "claude-3-opus", label: "Claude 3 Opus" },
	{ value: "claude-3-sonnet", label: "Claude 3 Sonnet" },
	{ value: "claude-3-haiku", label: "Claude 3 Haiku" },
	{ value: "llama-2-70b", label: "Llama 2 70B" },
	{ value: "llama-2-13b", label: "Llama 2 13B" },
	{ value: "llama-2-7b", label: "Llama 2 7B" },
];

describe("SearchableSelect", () => {
	it("renders with placeholder", () => {
		render(
			<SearchableSelect
				options={mockOptions}
				placeholder="Select a model"
			/>
		);
		expect(screen.getByText("Select a model")).toBeInTheDocument();
	});

	it("opens dropdown when clicked", () => {
		render(
			<SearchableSelect
				options={mockOptions}
				placeholder="Select a model"
			/>
		);
		
		const trigger = screen.getByRole("combobox");
		fireEvent.click(trigger);
		
		expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
	});

	it("filters options when searching", () => {
		render(
			<SearchableSelect
				options={mockOptions}
				placeholder="Select a model"
			/>
		);
		
		const trigger = screen.getByRole("combobox");
		fireEvent.click(trigger);
		
		const searchInput = screen.getByPlaceholderText("Search...");
		fireEvent.change(searchInput, { target: { value: "gpt" } });
		
		expect(screen.getByText("GPT-4")).toBeInTheDocument();
		expect(screen.getByText("GPT-3.5 Turbo")).toBeInTheDocument();
		expect(screen.queryByText("Claude 3 Opus")).not.toBeInTheDocument();
	});

	it("calls onValueChange when option is selected", () => {
		const mockOnValueChange = jest.fn();
		render(
			<SearchableSelect
				options={mockOptions}
				placeholder="Select a model"
				onValueChange={mockOnValueChange}
			/>
		);
		
		const trigger = screen.getByRole("combobox");
		fireEvent.click(trigger);
		
		const option = screen.getByText("GPT-4");
		fireEvent.click(option);
		
		expect(mockOnValueChange).toHaveBeenCalledWith("gpt-4");
	});

	it("shows selected value", () => {
		render(
			<SearchableSelect
				options={mockOptions}
				value="gpt-4"
				placeholder="Select a model"
			/>
		);
		
		expect(screen.getByText("GPT-4")).toBeInTheDocument();
	});

	it("shows empty text when no options match search", () => {
		render(
			<SearchableSelect
				options={mockOptions}
				placeholder="Select a model"
				emptyText="No models found."
			/>
		);
		
		const trigger = screen.getByRole("combobox");
		fireEvent.click(trigger);
		
		const searchInput = screen.getByPlaceholderText("Search...");
		fireEvent.change(searchInput, { target: { value: "nonexistent" } });
		
		expect(screen.getByText("No models found.")).toBeInTheDocument();
	});
});
