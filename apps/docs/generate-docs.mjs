import { generateFiles } from 'fumadocs-openapi';
 
try {
	void generateFiles({
		input: ["./api.json"],
		output: "./content/docs/api",
		per: "tag",
		name: (tag,name) => {
			console.log(tag,name)
			return  `reference-${name}`;
		},
	});
	
} catch (error) {
	 console.error(error);
}

// united.com/customer-care
