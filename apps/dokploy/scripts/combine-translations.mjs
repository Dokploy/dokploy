import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "../public/locales");

// Get all language directories
const languages = fs
  .readdirSync(LOCALES_DIR)
  .filter((file) => fs.statSync(path.join(LOCALES_DIR, file)).isDirectory());

// Process each language
for (const lang of languages) {
  const langDir = path.join(LOCALES_DIR, lang);
  const jsonFiles = fs
    .readdirSync(langDir)
    .filter((file) => file.endsWith(".json"));

  // Combine all JSON files for this language
  const combinedTranslations = {};

  for (const file of jsonFiles) {
    const content = JSON.parse(
      fs.readFileSync(path.join(langDir, file), "utf8")
    );
    Object.assign(combinedTranslations, content);
  }

  // Create a backup of the original directory
  const backupDir = path.join(LOCALES_DIR, `${lang}_backup`);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    for (const file of jsonFiles) {
      fs.copyFileSync(path.join(langDir, file), path.join(backupDir, file));
    }
  }

  // Write the combined translations
  const outputFile = path.join(LOCALES_DIR, `${lang}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(combinedTranslations, null, 2));

  // Remove the original directory after backup
  fs.rmSync(langDir, { recursive: true, force: true });

  console.log(
    `✅ Processed ${lang}: Combined ${jsonFiles.length} files into ${lang}.json`
  );
}

console.log("\n🎉 All translations have been combined successfully!");
console.log(
  "📁 Backups of the original files are stored in [language]_backup directories"
);
