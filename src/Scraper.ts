import { ClassDeclaration, Node, SourceFile, Symbol, Type, TypeGuards } from "ts-morph";
import ts from "typescript";

// PropTypes

export type RefIndex = number;

export type PropType =
  IAnyPropType
  | IVoidPropType
  | IStringPropType
  | INumberPropType
  | IBooleanPropType
  | IReactElementPropType
  | IEventPropType
  | IReactNodePropType
  | ILiteralPropType
  | IUnionPropType
  | IRefPropType
  | IPartialPropType
  | IArrayPropType
  | ITuplePropType
  | IFnPropType;

export interface IAnyPropType { kind: "any"; }
export const anyPropType: PropType = { kind: "any" };

export interface IVoidPropType { kind: "void"; }
export const voidPropType: PropType = { kind: "void" };

export interface IStringPropType { kind: "string"; }
export const stringPropType: PropType = { kind: "string" };

export interface INumberPropType { kind: "number"; }
export const numberPropType: PropType = { kind: "number" };

export interface IBooleanPropType { kind: "boolean"; }
export const booleanPropType: PropType = { kind: "boolean" };

export interface IReactElementPropType { kind: "reactElement"; }
export const reactElementPropType: PropType = { kind: "reactElement" };

export interface IReactNodePropType { kind: "reactNode"; }
export const reactNodePropType: PropType = { kind: "reactNode" };

export interface IEventPropType { kind: "event"; }
export const eventPropType: PropType = { kind: "event" };

export type LiteralValue = string | number | ts.PseudoBigInt | boolean;

export interface ILiteralPropType { kind: "literal"; value: LiteralValue; }

export function literalPropType(value: LiteralValue): PropType {
  return {
    kind: "literal",
    value,
  };
}

export interface IRefPropType { kind: "ref"; refIndex: RefIndex; }

export function refPropType(refIndex: RefIndex): PropType {
  return { kind: "ref", refIndex };
}

export interface IPartialPropType { kind: "partial"; refIndex: RefIndex; }

export function partialPropType(refIndex: RefIndex): PropType {
  return { kind: "partial", refIndex };
}

export interface IUnionPropType { kind: "union"; options: PropType[]; }

export function unionPropType(options: PropType[]): PropType {
  return { kind: "union", options };
}

export interface IArrayPropType { kind: "array"; elementPropType: PropType; }

export function arrayPropType(elementPropType: PropType): PropType {
  return { kind: "array", elementPropType };
}
export interface ITuplePropType { kind: "tuple"; elements: PropType[]; }

export function tuplePropType(elements: PropType[]): PropType {
  return { kind: "tuple", elements };
}

export interface IFnPropType {
  kind: "fn";
  argTypes: IPropSpec[];
  returnType: IPropSpec;
}

export function fnPropType(argTypes: IPropSpec[], returnType: IPropSpec): PropType {
  return { kind: "fn", argTypes, returnType };
}

// IObjectSpec, IPropSpec, IComponentSpec

export interface IObjectSpec { name: string | null; members: IObjectMember[]; }
export interface IObjectMember { name: string; isNullable: boolean; propType: PropType; }

export function objectSpec(name: string | null, members: IObjectMember[]): IObjectSpec {
  return { name, members };
}

export interface IPropSpec {
  propType: PropType;
  isNullable: boolean;
}

export interface IComponentSpec {
  name: string;
  propsRefIndex: number;
}

// Finder class

export interface IFinderResult {
  components: IComponentSpec[];
  refs: IObjectSpec[];
}

const knownSymbolPropTypes: { [name: string]: PropType } = {
  "React.MouseEvent": eventPropType, // TODO make this generic
  "React.ReactElement": reactElementPropType,
  "React.ReactNode": reactNodePropType,
  "React.SyntheticEvent": eventPropType,
};

const placeholderRef = objectSpec("__placeholder", []);

export function findComponentsInSourceFile(
  sourceFile: SourceFile,
): IFinderResult {
  const components: IComponentSpec[] = [];
  const refs: IObjectSpec[] = [];
  const refNdxMap: Map<Type, number> = new Map();

  function findComponentsInClass(
    classDec: ClassDeclaration,
  ): void {
    const baseType = classDec.getBaseTypes().find(isTypeReactComponent);

    if (baseType) {
      const propTypeArg = baseType.getTypeArguments()[0];

      if (typeof propTypeArg !== "undefined") {
        const classDecSym = classDec.getSymbolOrThrow();
        const name = classDecSym.getName();
        debugSymbol("Found react component", classDecSym);

        const propsRefIndex = storeRef(propTypeArg);

        const component: IComponentSpec = {
          name,
          propsRefIndex,
        };

        components.push(component);
      }
    }
  }

  function storeRef(typ: Type): number {
    const existingIndex = refNdxMap.get(typ);
    if (typeof existingIndex !== "undefined") {
      return existingIndex;
    }

    // We add a temporary placeholder to reserve
    // a spot in the refs array.
    const ndx = refs.length;
    refs.push(placeholderRef);
    refNdxMap.set(typ, ndx);

    const sym = typ.getSymbolOrThrow();
    const reference = sym.getDeclarations()[0];

    const members: IObjectMember[] = typ
      .getProperties()
      .map((s) => propertyToObjectMember(s, reference));

    const name = typ.isAnonymous() ? null : sym.getName();

    const ref: IObjectSpec = objectSpec(name, members);

    // Remove placeholder and replace with actual entry.
    refs[ndx] = ref;

    return ndx;
  }

  function isTypeReactComponent(t: Type): boolean {
    const sym = t.getSymbol();

    if (sym) {
      return sym.getFullyQualifiedName() === "React.Component";
    } else {
      return t.getBaseTypes().findIndex(isTypeReactComponent) >= 0;
    }
  }

  function propertyToObjectMember(s: Symbol, reference: Node): IObjectMember {
    const name = s.getName();
    const typ = s.getTypeAtLocation(reference);

    debugType(`checking property name=${name}`, typ);
    const propSpec = ItypeToPropSpec(typ, reference);

    return {
      isNullable: propSpec.isNullable,
      name,
      propType: propSpec.propType,
    };
  }

  function ItypeToPropSpec(typ: Type, reference: Node): IPropSpec {
    const sym = typ.getSymbol() || typ.getAliasSymbol();

    const isNullable = typ.isNullable();

    if (isNullable) {
      typ = typ.getNonNullableType();
    }
    let knownPropTypeCand: PropType | undefined;
    if (typeof sym !== "undefined") {
      knownPropTypeCand = knownSymbolPropTypes[sym.getFullyQualifiedName()];
    }

    let fnPropTypeCand: PropType | undefined;
    if (typeof sym !== "undefined") {
      fnPropTypeCand = symbolToFunctionPropType(sym, reference);
    }

    let propType: PropType;

    if (typeof knownPropTypeCand !== "undefined") {
      propType = knownPropTypeCand;
    } else if (typeof fnPropTypeCand !== "undefined") {
      propType = fnPropTypeCand;
    } else if (isTypeVoid(typ)) {
      propType = voidPropType;
    } else if (typ.isString()) {
      propType = stringPropType;
    } else if (typ.isNumber()) {
      propType = numberPropType;
    } else if (typ.isBoolean()) {
      propType = booleanPropType;
    } else if (typ.compilerType.isLiteral()) {
      // Does not inclue boolean -- see https://github.com/Microsoft/TypeScript/issues/26075
      const value = typ.compilerType.value;
      propType = literalPropType(value);
    } else if (typ.isBooleanLiteral()) {
      // TODO look for a better way for this
      propType = literalPropType(typ.getText() === "true");
    } else if (typ.isTuple()) {
      const elementPropTypes = typ.getTupleElements()
        .map((t) => ItypeToPropSpec(t, reference).propType);
      propType = tuplePropType(elementPropTypes);
    } else if (typ.isArray()) {
      const pspec = ItypeToPropSpec(typ.getArrayElementTypeOrThrow(), reference);
      propType = arrayPropType(pspec.propType);
    } else if (typ.isUnion()) {
      const options: PropType[] = typ.getUnionTypes().map((t) => ItypeToPropSpec(t, reference).propType);
      propType = unionPropType(options);
    } else if (typ.isObject()) {
      const refIndex = storeRef(typ);
      propType = refPropType(refIndex);
    } else {
      propType = anyPropType;
    }

    return {
      isNullable,
      propType,
    };
  }

  function symbolToFunctionPropType(sym: Symbol, reference: Node): PropType | undefined {
    if (typeof sym !== "undefined") {
      const decl = sym.getDeclarations()[0];

      if (typeof decl !== "undefined" && TypeGuards.isSignaturedDeclaration(decl)) {
        const paramPropSpec = decl.getParameters().map((p) => {
          let typ = p.getType();
          const baseType = getConstraintTypeFromTypeParam(typ);

          if (typeof baseType !== "undefined") {
            typ = baseType;
          }

          return ItypeToPropSpec(typ, reference);
        });
        const returnPropSpec = ItypeToPropSpec(decl.getReturnType(), reference);

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

function symToDebugString(sym: Symbol): string {
  const name = sym.getName();

  const decl = sym.getDeclarations()[0];
  let declString: string;

  if (typeof decl !== "undefined") {
    const filePath = decl.getSourceFile().getFilePath();
    const lineNumber = decl.getStartLineNumber();
    const kind = decl.getKindName();
    declString = `(Decl path=${filePath}, line=${lineNumber}, kind=${kind})`;
  } else {
    declString = "(No Declarations)";
  }

  return `name=${name} decl=${declString}`;
}

function typeToDebugString(typ: Type): string {
  const symbol = typ.getSymbol();
  const aliasSymbol = typ.getAliasSymbol();

  let symbolKind: string;
  let dsymbol: Symbol | undefined;

  if (typeof symbol !== "undefined") {
    symbolKind = "S";
    dsymbol = symbol;
  } else if (typeof aliasSymbol !== "undefined") {
    symbolKind = "A";
    dsymbol = aliasSymbol;
  } else {
    symbolKind = "NOSYMBOL";
  }

  let symbolText: string = "";
  if (typeof dsymbol !== "undefined") {
    symbolText = symToDebugString(dsymbol);
  }

  return `type=${typ.getText()}, symbolKind=${symbolKind}, symbol=(${symbolText})`;
}

function isDebugEnv(): boolean {
  return process.env.DEBUG ? true : false;
}

function debugSymbol(prefix: string, sym: Symbol): void {
  if (isDebugEnv()) {
    console.debug(prefix + " " + symToDebugString(sym));
  }
}

function debugType(prefix: string, typ: Type): void {
  if (isDebugEnv()) {
    console.debug(prefix + " " + typeToDebugString(typ));
  }
}

function getConstraintTypeFromTypeParam(typ: Type): Type | undefined {
  return withTypeDecl(typ, (decl: Node) => {
    if (TypeGuards.isTypeParameterDeclaration(decl)) {
      const constraint = decl.getConstraint();

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
  const sym = typ.getSymbol() || typ.getAliasSymbol();
  if (typeof sym !== "undefined") {
    const decl = sym.getDeclarations()[0];
    if (decl) {
      return f(decl);
    }
  }
}
