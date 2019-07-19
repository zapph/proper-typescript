import { ClassDeclaration, Node, Project, SourceFile, Symbol, Type, TypeGuards } from "ts-morph";
import ts from "typescript";

export type PropType =
  AnyPropType
  | VoidPropType
  | StringPropType
  | NumberPropType
  | BooleanPropType
  | EventPropType
  | FnPropType

export type AnyPropType = { kind: "any" }
export const anyPropType: PropType = { kind: "any" };

export type VoidPropType = { kind: "void" }
export const voidPropType: PropType = { kind: "void" }

export type StringPropType = { kind: "string" }
export const stringPropType: PropType = { kind: "string" }

export type NumberPropType = { kind: "number" }
export const numberPropType: PropType = { kind: "number" }

export type BooleanPropType = { kind: "boolean" }
export const booleanPropType: PropType = { kind: "boolean" }

export type EventPropType = { kind: "event" }
export const eventPropType: PropType = { kind: "event" }

export type FnPropType = {
  kind: "fn",
  argTypes: PropSpec[],
  returnType: PropSpec
}

export function fnPropType(argTypes: PropSpec[], returnType: PropSpec): PropType {
  return { kind: "fn", argTypes, returnType };
}

export interface NamedPropSpec {
  name: string,
  propSpec: PropSpec
}

export interface PropSpec {
  propType: PropType,
  isNullable: boolean
}

export interface ComponentSpec {
  name: string,
  props: NamedPropSpec[]
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
    let props: NamedPropSpec[] = [];

    if (propTypeArg) {
      props = propTypeArg.getProperties().map(
        (p) =>
          symbolToNamedPropSpec(p, propTypeArg.getSymbol())
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

function symbolToNamedPropSpec(p: Symbol, reference?: Symbol): NamedPropSpec {
  let name = p.getEscapedName();
  let propSpec = symbolToPropSpec(p, reference);

  return {
    name,
    propSpec
  };
}

function symbolToPropSpec(s: Symbol, reference?: Symbol): PropSpec {
  let name = s.getEscapedName();
  let vdec = s.getValueDeclaration();
  let typ;
  if (vdec) {
    typ = vdec.getType();
  } else {
    if (reference && reference.getDeclarations()[0]) {
      typ = s.getTypeAtLocation(reference.getDeclarations()[0]);
    } else {
      throw new Error(`Unable to find type for: ${name}`)
    }
  }

  return typeToPropSpec(typ, reference, name);
}

function typeToPropSpec(typ: Type<ts.Type>, reference?: Symbol, name?: String): PropSpec {
  let isNullable = typ.isNullable();
  if (isNullable) {
    typ = typ.getNonNullableType();
  }

  let propType: PropType;

  if (isTypeVoid(typ)) {
    propType = voidPropType;
  } else if (typ.isString()) {
    propType = stringPropType;
  } else if (typ.isNumber()) {
    propType = numberPropType;
  } else if (typ.isBoolean()) {
    propType = booleanPropType
  } else {
    // Symbol
    let sym = typ.getSymbolOrThrow();

    // Node
    let decl = sym.getDeclarations()[0];

    if (TypeGuards.isSignaturedDeclaration(decl)) {
      let paramPropSpec = decl.getParameters().map((p) => typeToPropSpec(p.getType(), reference, p.getName()));
      let returnPropSpec = typeToPropSpec(decl.getReturnType(), reference);

      propType = fnPropType(paramPropSpec, returnPropSpec);
    } else if (isNodeSyntheticEvent(decl)) {
      propType = eventPropType;
    } else {
      let n = name || "unknown";
      throw `Unknown propType for ${n}: ${typ.getText()} ` +
      `(Kind: ${decl.getKindName()}) ` +
      `(Source: ${decl.getSourceFile().getFilePath()} ` +
      `Line: ${decl.getStartLineNumber()} ` +
      `Col: ${decl.getStartLinePos()})`
    }
  }

  return { propType, isNullable };
}

function isTypeVoid(typ: Type<ts.Type>): boolean {
  return (typ.getFlags() & ts.TypeFlags.VoidLike) != 0;
}

function isNodeSyntheticEvent(node: Node<ts.Node>): boolean {
  let sym = node.getSymbol();
  if (sym && isSymbolSyntheticEvent(sym)) {
    return true;
  } else if (TypeGuards.isTypeParameterDeclaration(node)) {
    let constraint = node.getConstraint();

    if (constraint) {
      return isTypeSyntheticEvent(constraint.getType());
    } else {
      return false;
    }
  } else if (TypeGuards.isInterfaceDeclaration(node)) {
    return node.getBaseTypes().findIndex(isTypeSyntheticEvent) >= 0;
  } else {
    return false;
  }
}

function isTypeSyntheticEvent(t: Type): boolean {
  let sym = t.getSymbol();
  return typeof sym !== 'undefined' && isSymbolSyntheticEvent(sym);
}

function isSymbolSyntheticEvent(sym: Symbol): boolean {
  return sym.getFullyQualifiedName() === "React.SyntheticEvent";
}
