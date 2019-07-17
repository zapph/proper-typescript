import { ClassDeclaration, Project, SourceFile, Symbol, Type, SymbolFlags } from "ts-morph";

export enum PropType {
  Any = "any",
  String = "string",
  Number = "number",
  Boolean = "boolean",
}

export interface PropSpec {
  name: string,
  propType: PropType,
  isNullable: boolean
}

export interface ComponentSpec {
  name: string,
  props: PropSpec[]
}

export function findComponentsInProject(project: Project): ComponentSpec[] {
  return findComponentsInSourceFiles(project.getSourceFiles());
}

export function findComponentsInSourceFiles(
  sourceFiles: SourceFile[]
): ComponentSpec[] {
  return sourceFiles
    .flatMap((s) => s.getClasses())
    .flatMap(findComponentsInClass);
}

export function findComponentsInSourceFile(
  sourceFile: SourceFile
): ComponentSpec[] {
  return findComponentsInSourceFiles([sourceFile]);
}

function findComponentsInClass(
  classDec: ClassDeclaration
): ComponentSpec[] {
  let baseType = classDec.getBaseTypes().find(isTypeReactComponent);

  if (baseType) {
    let propTypeArg = baseType.getTypeArguments()[0];
    let props: PropSpec[] = [];

    if (propTypeArg) {
      props = propTypeArg.getProperties().map(
        (p) =>
          propertyToPropSpec(p, propTypeArg.getSymbol())
      );
    }

    return [{
      name: classDec.getSymbolOrThrow().getEscapedName(),
      props: props
    }];
  } else {
    return [];
  }
}

function isTypeReactComponent(t: Type): boolean {
  let sym = t.getSymbol();

  if (sym) {
    return sym.getFullyQualifiedName() === "React.Component";
  } else {
    return false;
  }
}

function propertyToPropSpec(p: Symbol, reference?: Symbol): PropSpec {
  let name = p.getEscapedName();

  let vdec = p.getValueDeclaration();
  let typ;
  if (vdec) {
    typ = vdec.getType();
  } else {
    if (reference && reference.getDeclarations()[0]) {
      typ = p.getTypeAtLocation(reference.getDeclarations()[0]);
    } else {
      throw new Error(`Unable to find type for: ${name}`)
    }
  }

  let isNullable = typ.isNullable();
  if (isNullable) {
    typ = typ.getNonNullableType();
  }

  let propType = PropType.Any;

  if (typ.isString()) {
    propType = PropType.String;
  } else if (typ.isNumber()) {
    propType = PropType.Number;
  } else if (typ.isBoolean()) {
    propType = PropType.Boolean;
  } else {
    throw `Unsupported propType for ${name}: ${typ.getText()}`
  }

  return {
    name,
    propType,
    isNullable
  };
}
