type Field = "name" | "baseUrl" | "token";

interface FormState {
	name: string;
	baseUrl: string;
	token: string;
	dirtyFields: Partial<Record<Field, true>>;
}

type FormAction =
	| { type: "change"; field: Field; value: string }
	| { type: "hydrate"; name: string; baseUrl: string }
	| { type: "reset" };

export const initialAzureDevopsProviderForm: FormState = {
	name: "",
	baseUrl: "",
	token: "",
	dirtyFields: {},
};

export const azureDevopsProviderFormReducer = (
	state: FormState,
	action: FormAction,
): FormState => {
	switch (action.type) {
		case "change":
			return {
				...state,
				[action.field]: action.value,
				dirtyFields: { ...state.dirtyFields, [action.field]: true },
			};
		case "hydrate":
			return {
				...state,
				name: state.dirtyFields.name ? state.name : action.name,
				baseUrl: state.dirtyFields.baseUrl ? state.baseUrl : action.baseUrl,
			};
		case "reset":
			return initialAzureDevopsProviderForm;
	}
};
