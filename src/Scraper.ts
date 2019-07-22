import { ClassDeclaration, Node, Project, SourceFile, Symbol, Type, TypeGuards } from "ts-morph";
import ts from "typescript";

// PropTypes

export type PropType =
  AnyPropType
  | VoidPropType
  | StringPropType
  | NumberPropType
  | BooleanPropType
  | ReactElementPropType
  | EventPropType
  | LiteralPropType
  | UnionPropType
  | ObjectPropType
  | ArrayPropType
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

export type ReactElementPropType = { kind: "reactElement" }
export const reactElementPropType: PropType = { kind: "reactElement" }

export type EventPropType = { kind: "event" }
export const eventPropType: PropType = { kind: "event" }

export type LiteralValue = string | number | ts.PseudoBigInt | boolean

export type LiteralPropType = { kind: "literal", value: LiteralValue }

export function literalPropType(value: LiteralValue): PropType {
  return {
    kind: "literal",
    value
  };
}

export type ObjectPropType = { kind: "object", props: NamedPropSpec[] }

export function objectPropType(props: NamedPropSpec[]): PropType {
  return { kind: "object", props };
}

export type UnionPropType = { kind: "union", options: PropType[] }

export function unionPropType(options: PropType[]): PropType {
  return { kind: "union", options };
}

export type ArrayPropType = { kind: "array", elementPropType: PropType }

export function arrayPropType(elementPropType: PropType): PropType {
  return { kind: "array", elementPropType };
}

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

// Finder class

export class Finder {
  knownSymbolPropTypes: { [name: string]: PropType } = {
    "React.SyntheticEvent": eventPropType,
    "React.ReactElement": reactElementPropType
  };

  findComponentsInProject = (project: Project): ComponentSpec[] => {
    return this.findComponentsInSourceFiles(project.getSourceFiles());
  }

  findComponentsInSourceFiles = (
    sourceFiles: SourceFile[]
  ): ComponentSpec[] => {
    return sourceFiles
      .flatMap((s) => s.getClasses())
      .flatMap(this.findComponentsInClass);
  }

  findComponentsInSourceFile = (
    sourceFile: SourceFile
  ): ComponentSpec[] => {
    return this.findComponentsInSourceFiles([sourceFile]);
  }

  findComponentsInClass = (
    classDec: ClassDeclaration
  ): ComponentSpec[] => {
    let baseType = classDec.getBaseTypes().find(this.isTypeReactComponent);

    if (baseType) {
      let propTypeArg = baseType.getTypeArguments()[0];
      let props: NamedPropSpec[] = [];

      if (propTypeArg) {
        props = propTypeArg.getProperties().map(
          (p) =>
            this.symbolToNamedPropSpec(p, propTypeArg.getSymbol())
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


  isTypeReactComponent = (t: Type): boolean => {
    let sym = t.getSymbol();

    if (sym) {
      return sym.getFullyQualifiedName() === "React.Component";
    } else {
      return false;
    }
  }

  symbolToNamedPropSpec = (p: Symbol, reference?: Symbol): NamedPropSpec => {
    let name = p.getEscapedName();
    let propSpec = this.symbolToPropSpec(p, reference);

    return {
      name,
      propSpec
    };
  }

  symbolToPropSpec = (s: Symbol, reference?: Symbol): PropSpec => {
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

    let pspec = this.typeToPropSpec(typ, reference, name);
    return pspec;
  }

  typeToPropSpec = (typ: Type<ts.Type>, reference?: Symbol, name?: String): PropSpec => {
    let n = name || "unknown";
    let isNullable = typ.isNullable();
    if (isNullable) {
      typ = typ.getNonNullableType();
    }

    // Symbol
    let sym = typ.getSymbol();

    // Node
    let decl: Node | undefined;
    let knownPropType: PropType | undefined;
    if (typeof sym !== "undefined") {
      decl = sym.getDeclarations()[0];

      if (typeof decl !== "undefined") {
        knownPropType = this.getKnownPropTypeFromNode(decl);
      }
    }

    let propType: PropType;

    if (this.isTypeVoid(typ)) {
      propType = voidPropType;
    } else if (typ.isString()) {
      propType = stringPropType;
    } else if (typ.isNumber()) {
      propType = numberPropType;
    } else if (typ.isBoolean()) {
      propType = booleanPropType
    } else if (typ.compilerType.isLiteral()) {
      // Does not inclue boolean -- see https://github.com/Microsoft/TypeScript/issues/26075
      let value = typ.compilerType.value;
      propType = literalPropType(value);
    } else if (typ.isBooleanLiteral()) {
      // TODO look for a better way for this
      propType = literalPropType(typ.getText() === "true");
    } else if (typeof knownPropType !== "undefined") {
      propType = knownPropType;
    } else if (typeof decl !== "undefined" && TypeGuards.isSignaturedDeclaration(decl)) {
      let paramPropSpec = decl.getParameters().map((p) => this.typeToPropSpec(p.getType(), reference, p.getName()));
      let returnPropSpec = this.typeToPropSpec(decl.getReturnType(), reference);

      propType = fnPropType(paramPropSpec, returnPropSpec);
    } else if (typ.isArray()) {
      let elementType = typ.getArrayElementType();
      if (typeof elementType !== "undefined") {
        let elementPropType =
          this.typeToPropSpec(elementType, reference, name).propType;
        propType = arrayPropType(elementPropType);
      } else {
        throw "Unknown array prop type";
      }
    } else if (typ.isObject()) {
      // Check of object goes here since fucntions are detected as objects as well
      propType = objectPropType(typ.getProperties().map((p) => this.symbolToNamedPropSpec(p, reference)));
    } else if (typ.isUnion()) {
      try {
        let options: PropType[] = typ.getUnionTypes().map((t) => this.typeToPropSpec(t, reference).propType);

        propType = unionPropType(options);
      } catch (e) {
        throw "Unable to form union for " + n + ": " + e;
      }
    } else {
      let symText, declText;

      if (typeof sym !== 'undefined') {
        symText = `(Symbol: ${sym.getName()})`;
      } else {
        symText = "(No Symbol)";
      }

      if (typeof decl !== "undefined") {
        declText = `(Kind: ${decl.getKindName()}) ` +
          `(Source: ${decl.getSourceFile().getFilePath()} ` +
          `Line: ${decl.getStartLineNumber()} ` +
          `Col: ${decl.getStartLinePos()})`;
      } else {
        declText = "(No decl)"
      }
      throw `Unknown propType for ${n}: ${typ.getText()} ${symText} ${declText}`;
    }

    return { propType, isNullable };
  }

  isTypeVoid = (typ: Type<ts.Type>): boolean => {
    return (typ.getFlags() & ts.TypeFlags.VoidLike) != 0;
  }

  getKnownPropTypeFromNode = (node: Node<ts.Node>): PropType | undefined => {
    let sym = node.getSymbol();
    let p: PropType | undefined;
    if (sym) {
      p = this.getKnownPropTypeFromSymbol(sym);
    }

    if (typeof p !== "undefined") {
      return p;
    } else if (TypeGuards.isTypeParameterDeclaration(node)) {
      let constraint = node.getConstraint();

      if (constraint) {
        try {
          return this.getKnownPropTypeFromType(constraint.getType());
        } catch (e) {
          return undefined;
        }
      } else {
        return undefined;
      }
    } else if (TypeGuards.isInterfaceDeclaration(node)) {
      node.getBaseTypes().forEach((t) => {
        if (typeof p === "undefined") {
          p = this.getKnownPropTypeFromType(t)
        }
      });
      return p;
    }
  }

  getKnownPropTypeFromType = (t: Type): PropType | undefined => {
    let sym = t.getSymbol();
    if (typeof sym !== 'undefined') {
      return this.getKnownPropTypeFromSymbol(sym);
    }
  }

  getKnownPropTypeFromSymbol = (sym: Symbol): PropType | undefined => {
    return this.knownSymbolPropTypes[sym.getFullyQualifiedName()];
  }
}
