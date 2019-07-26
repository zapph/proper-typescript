import { ClassDeclaration, Node, SourceFile, Symbol, Type, TypeGuards } from "ts-morph";
import ts from "typescript";

// PropTypes

export type RefIndex = number

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
  | RefPropType
  | PartialPropType
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

export type RefPropType = { kind: "ref", refIndex: RefIndex }

export function refPropType(refIndex: RefIndex): PropType {
  return { kind: "ref", refIndex };
}

export type PartialPropType = { kind: "partial", refIndex: RefIndex }

export function partialPropType(refIndex: RefIndex): PropType {
  return { kind: "partial", refIndex };
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

// ObjectSpec, PropSpec, ComponentSpec

export type ObjectSpec = { name: string | null, members: ObjectMember[] }
export type ObjectMember = { name: string, isNullable: boolean, propType: PropType }

export function objectSpec(name: string | null, members: ObjectMember[]): ObjectSpec {
  return { name, members };
}


export interface PropSpec {
  propType: PropType,
  isNullable: boolean
}

export interface ComponentSpec {
  name: string,
  propsRefIndex: number
}

// Finder class

export type FinderResult = {
  components: ComponentSpec[],
  refs: ObjectSpec[]
};

let knownSymbolPropTypes: { [name: string]: PropType } = {
  "React.SyntheticEvent": eventPropType,
  "React.MouseEvent": eventPropType, // TODO make this generic
  "React.ReactElement": reactElementPropType,
  "React.ReactNode": reactNodePropType
};

let placeholderRef = objectSpec("__placeholder", []);

export function findComponentsInSourceFile(
  sourceFile: SourceFile
): FinderResult {
  let components: ComponentSpec[] = [];
  let refs: ObjectSpec[] = [];
  let refNdxMap: Map<Type, number> = new Map();

  function findComponentsInClass(
    classDec: ClassDeclaration
  ): void {
    let baseType = classDec.getBaseTypes().find(isTypeReactComponent);

    if (baseType) {
      let propTypeArg = baseType.getTypeArguments()[0];

      if (typeof propTypeArg !== "undefined") {
        let propsRefIndex = storeRef(propTypeArg);

        let component: ComponentSpec = {
          name: classDec.getSymbolOrThrow().getName(),
          propsRefIndex
        };

        components.push(component);
      }
    }
  }

  function storeRef(typ: Type): number {
    let existingIndex = refNdxMap.get(typ);
    if (typeof existingIndex !== "undefined") {
      return existingIndex;
    }

    // We add a temporary placeholder to reserve
    // a spot in the refs array.
    let ndx = refs.length;
    refs.push(placeholderRef);
    refNdxMap.set(typ, ndx);

    let sym = typ.getSymbolOrThrow();
    let reference = sym.getDeclarations()[0];

    let members: ObjectMember[] = typ
      .getProperties()
      .map((s) => propertyToObjectMember(s, reference));

    let name = typ.isAnonymous() ? null : sym.getName();

    let ref: ObjectSpec = objectSpec(name, members);

    // Remove placeholder and replace with actual entry.
    refs[ndx] = ref;

    return ndx;
  }

  function isTypeReactComponent(t: Type): boolean {
    let sym = t.getSymbol();

    if (sym) {
      return sym.getFullyQualifiedName() === "React.Component";
    } else {
      return t.getBaseTypes().findIndex(isTypeReactComponent) >= 0;
    }
  }

  function propertyToObjectMember(s: Symbol, reference: Node): ObjectMember {
    let name = s.getName();
    let typ = s.getTypeAtLocation(reference);
    let propSpec = typeToPropSpec(typ, reference);

    return {
      name,
      isNullable: propSpec.isNullable,
      propType: propSpec.propType
    };
  }

  function typeToPropSpec(typ: Type, reference: Node): PropSpec {
    let sym = typ.getSymbol() || typ.getAliasSymbol();

    let isNullable = typ.isNullable();

    if (isNullable) {
      typ = typ.getNonNullableType();
    }
    let knownPropType: PropType | undefined;
    if (typeof sym !== "undefined") {
      knownPropType = knownSymbolPropTypes[sym.getFullyQualifiedName()];
    }

    let fnPropType: PropType | undefined;
    if (typeof sym !== "undefined") {
      fnPropType = symbolToFunctionPropType(sym, reference);
    }

    let propType: PropType;

    if (typeof knownPropType !== "undefined") {
      propType = knownPropType;
    } else if (typeof fnPropType !== "undefined") {
      propType = fnPropType;
    } else if (isTypeVoid(typ)) {
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
      let pspec = typeToPropSpec(typ.getArrayElementTypeOrThrow(), reference);
      propType = arrayPropType(pspec.propType);
    } else if (typ.isUnion()) {
      let options: PropType[] = typ.getUnionTypes().map((t) => typeToPropSpec(t, reference).propType);
      propType = unionPropType(options);
    } else if (typ.isObject()) {
      let refIndex = storeRef(typ);
      propType = refPropType(refIndex);
    } else {
      propType = anyPropType;
    }

    return {
      propType,
      isNullable
    };
  }

  function symbolToFunctionPropType(sym: Symbol, reference: Node): PropType | undefined {
    if (typeof sym !== "undefined") {
      let decl = sym.getDeclarations()[0];

      if (typeof decl !== "undefined" && TypeGuards.isSignaturedDeclaration(decl)) {
        let paramPropSpec = decl.getParameters().map((p) => {
          let typ = p.getType();
          let baseType = getConstraintTypeFromTypeParam(typ);

          if (typeof baseType !== "undefined") {
            typ = baseType;
          }

          return typeToPropSpec(typ, reference);
        });
        let returnPropSpec = typeToPropSpec(decl.getReturnType(), reference);

        return fnPropType(paramPropSpec, returnPropSpec);
      }
    }
  }

  // Run

  sourceFile.getExportSymbols()
    .map((sym) => sym.getAliasedSymbol() || sym)
    .flatMap((sym) => sym.getDeclarations())
    .filter(TypeGuards.isClassDeclaration)
    .forEach((classDec) => findComponentsInClass(classDec));

  return {
    components,
    refs,
  };
}

// Helpers

function getConstraintTypeFromTypeParam(typ: Type): Type | undefined {
  return withTypeDecl(typ, (decl: Node) => {
    if (TypeGuards.isTypeParameterDeclaration(decl)) {
      let constraint = decl.getConstraint();

      if (constraint) {
        return constraint.getType();
      }
    }
  });
}

function isTypeVoid(typ: Type<ts.Type>): boolean {
  return (typ.getFlags() & ts.TypeFlags.VoidLike) !== 0;
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
