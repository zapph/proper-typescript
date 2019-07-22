import { Project } from "ts-morph";
import { Finder } from "./Scraper";

const project = new Project({
  tsConfigFilePath: "./tsconfig.json"
});

const sourceFile = project.addExistingSourceFile("node_modules/antd/lib/button/button.d.ts");

const finder = new Finder();
const components = finder.findComponentsInSourceFile(sourceFile);
console.log(JSON.stringify(components, null, 2));
