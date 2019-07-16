import { Project } from "ts-morph";

const project = new Project({});

project.addExistingSourceFiles("samples/**/*.tsx");

const directClassExportFile = project.getSourceFileOrThrow("samples/DirectClassExport.tsx");

const classes = directClassExportFile.getClasses();

const clazz = classes[0];

// Component

const baseType = clazz.getBaseTypes()[0];

const baseName = baseType.getSymbolOrThrow().getFullyQualifiedName();
console.log(baseName);

const typeArgs0 = baseType.getTypeArguments()[0];

console.log(typeArgs0.getSymbolOrThrow().getEscapedName());

const propsType = typeArgs0.getSymbolOrThrow().getDeclaredType();

const propsProperty0 = propsType.getProperties()[0];
console.log(propsProperty0.getEscapedName());
console.log(propsProperty0.getValueDeclarationOrThrow().getType().isString());
