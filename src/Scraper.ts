import { ClassDeclaration, Node, Project, SourceFile, Symbol, Type, TypeGuards, PropertySignature } from "ts-morph";
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
  | ReactNodePropType
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

export type ReactNodePropType = { kind: "reactNode" }
export const reactNodePropType: PropType = { kind: "reactNode" }

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
    "React.MouseEvent": eventPropType, // TODO make this generic
    "React.ReactElement": reactElementPropType,
    "React.ReactNode": reactNodePropType
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

      let reference = propTypeArg.getSymbolOrThrow().getDeclarations()[0];
      if (propTypeArg) {
        props = propTypeArg
          .getProperties()
          .map((s) => this.propertyToNamedSpec(s, reference));
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
      return t.getBaseTypes().findIndex(this.isTypeReactComponent) >= 0;
    }
  }

  propertyToNamedSpec = (s: Symbol, reference: Node): NamedPropSpec => {
    let name = s.getName();
    let typ = s.getTypeAtLocation(reference);
    let propSpec = this.typeToPropSpec(typ, reference);

    return { name, propSpec };
  }

  typeToPropSpec = (typ: Type, reference: Node): PropSpec => {
    let sym = typ.getSymbol() || typ.getAliasSymbol();

    let isNullable = typ.isNullable();

    if (isNullable) {
      typ = typ.getNonNullableType();
    }
    let knownPropType: PropType | undefined;
    if (typeof sym !== "undefined") {
      knownPropType = this.knownSymbolPropTypes[sym.getFullyQualifiedName()];
    }

    let fnPropType: PropType | undefined;
    if (typeof sym !== "undefined") {
      fnPropType = this.symbolToFunctionPropType(sym, reference);
    }

    let propType: PropType;

    if (typeof knownPropType !== "undefined") {
      propType = knownPropType;
    } else if (typeof fnPropType !== "undefined") {
      propType = fnPropType;
    } else if (this.isTypeVoid(typ)) {
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
    } else if (typ.isArray()) {
      let pspec = this.typeToPropSpec(typ.getArrayElementTypeOrThrow(), reference);
      propType = arrayPropType(pspec.propType);
    } else if (typ.isUnion()) {
      let options: PropType[] = typ.getUnionTypes().map((t) => this.typeToPropSpec(t, reference).propType);
      propType = unionPropType(options);
    } else if (typ.isObject()) {
      propType = objectPropType(typ.getProperties().map((p) => this.propertyToNamedSpec(p, reference)));
    } else {
      propType = anyPropType;
    }

    return {
      propType,
      isNullable
    };
  }

  getConstraintTypeFromTypeParam = (typ: Type): Type | undefined => {
    return withTypeDecl(typ, (decl: Node) => {
      if (TypeGuards.isTypeParameterDeclaration(decl)) {
        let constraint = decl.getConstraint();

        if (constraint) {
          return constraint.getType();
        }
      }
    });
  }

  isTypeVoid = (typ: Type<ts.Type>): boolean => {
    return (typ.getFlags() & ts.TypeFlags.VoidLike) !== 0;
  }

  symbolToFunctionPropType = (sym: Symbol, reference: Node): PropType | undefined => {
    if (typeof sym !== "undefined") {
      let decl = sym.getDeclarations()[0];

      if (typeof decl !== "undefined" && TypeGuards.isSignaturedDeclaration(decl)) {
        let paramPropSpec = decl.getParameters().map((p) => {
          let typ = p.getType();
          let baseType = this.getConstraintTypeFromTypeParam(typ);

          if (typeof baseType !== "undefined") {
            typ = baseType;
          }

          return this.typeToPropSpec(typ, reference);
        });
        let returnPropSpec = this.typeToPropSpec(decl.getReturnType(), reference);

        return fnPropType(paramPropSpec, returnPropSpec);
      }
    }
  }
}

function withTypeDecl<A>(typ: Type, f: (node: Node) => A): A | undefined {
  let sym = typ.getSymbol() || typ.getAliasSymbol();
  if (typeof sym !== "undefined") {
    let decl = sym.getDeclarations()[0];
    if (decl) {
      return f(decl);
    }
  }
}
