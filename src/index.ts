import { Project } from "ts-morph";
import { findComponentsInSourceFile } from "./Scraper";

const project = new Project({
  tsConfigFilePath: "./tsconfig.json"
});

const sourceFile = project.addExistingSourceFile("node_modules/antd/lib/button/button.d.ts");
const components = findComponentsInSourceFile(sourceFile);
console.log(JSON.stringify(components, null, 2));
