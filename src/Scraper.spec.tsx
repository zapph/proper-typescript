import { Project } from "ts-morph";
import { ComponentSpec, voidPropType, fnPropType, eventPropType, numberPropType, booleanPropType, stringPropType, literalPropType, unionPropType, reactElementPropType, arrayPropType, reactNodePropType, FinderResult, ObjectMember, ObjectSpec, RefPropType, findComponentsInSourceFile } from './Scraper';

// Finding Components

test('ignore files without react components', () => {
  expectComponentsInContent("").toStrictEqual([])
});

test('ignore non react component classes', () => {
  expectComponentsInContent("class Foo; class Bar extends Foo")
    .toStrictEqual([]);
});

// Prop Declarations

test('find react component with direct props', () => {
  expectPropsOfSingleComponentInContent(
    `export class TestC extends React.Component<{foo: string}, {}> {}`
  ).toMatchObject({
    name: null
  });
});

test('find react component with aliased props', () => {
  expectPropsOfSingleComponentInContent(
    `type Props = { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: null // Only support names for non anonymous objects
  });
});

test('find react component with interfaced props', () => {
  expectPropsOfSingleComponentInContent(
    `interface Props { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "Props"
  });
});

// React Import

test('find react component with differently imported react', () => {
  expectSingleComponentInContent(
    `import * as Rrreact from 'react';
     export class TestC extends Rrreact.Component<{}, {}> {}`
  );
});

// Re-export

test('find re-exported components', () => {
  const project = new Project({
    compilerOptions: {
      strictNullChecks: true
    }
  });

  project.createSourceFile(
    "test/foo/FooComponent.ts",
    "export default class FooComponent extends React.Component<{foo: string}, {}> {}"
  );

  project.createSourceFile(
    "test/foo/index.ts",
    `import FooComponent from './FooComponent';

     export default FooComponent;`
  );

  const indexFile = project.createSourceFile(
    "test/index.tsx",
    "export { default as FooComponent } from './foo'"
  );

  expect(findComponentsInSourceFile(indexFile).components.length).toBe(1);
});

// Name

test('find react component name', () => {
  expectSingleComponentInContent(
    `export class TestC extends React.Component<{}, {}> {}`
  ).toMatchObject({ name: "TestC" });
});

// Props

test('support basic prop types', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      foo: string,
      bar: number,
      baz: boolean,
      reactElement: React.ReactElement,
      reactNode: React.ReactNode,
      syntheticEvent: React.SyntheticEvent,
      mouseEvent: React.MouseEvent<Element, MouseEvent>,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    propType: stringPropType,
  }, {
    name: "bar",
    propType: numberPropType,
  }, {
    name: "baz",
    propType: booleanPropType,
  }, {
    name: "reactElement",
    propType: reactElementPropType,
  }, {
    name: "reactNode",
    propType: reactNodePropType,
  }, {
    name: "syntheticEvent",
    propType: eventPropType,
  }, {
    name: "mouseEvent",
    propType: eventPropType,
  }]);
});

test('note whether a prop is nullable', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      foo: string,
      bar: string | undefined,
      baz?: string
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    isNullable: false,
  }, {
    name: "bar",
    isNullable: true,
  }, {
    name: "baz",
    isNullable: true,
  }]);
});

test('support partial props', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface MyProps {
      fooPartial: string
    };

    type Props = Partial<MyProps>;

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "fooPartial",
    isNullable: true,
  }]);
});

test('support event handlers', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      onClick: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void,
      onClick2: React.MouseEventHandler<HTMLElement>
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "onClick",
    propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
  }, {
    name: "onClick2",
    propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
  }]);
});

test('support literal types', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      lit1: 1,
      litFoo: "foo",
      litTrue: true,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "lit1",
    propType: literalPropType(1)
  }, {
    name: "litFoo",
    propType: literalPropType("foo")
  }, {
    name: "litTrue",
    propType: literalPropType(true)
  }]);
});

test('support union', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      stringOrBoolean: string | false | true,
      fooOrOne: "foo" | 1,
      fooOrBarOrNumber: "foo" | "bar" | number,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "stringOrBoolean",
    // boolean ends up as literal true or false
    propType: unionPropType([stringPropType, literalPropType(false), literalPropType(true)])
  }, {
    name: "fooOrOne",
    propType: unionPropType([literalPropType("foo"), literalPropType(1)])
  }, {
    name: "fooOrBarOrNumber",
    // Manually switched
    propType: unionPropType([numberPropType, literalPropType("foo"), literalPropType("bar")])
  }]);
});


test('support object types', () => {
  const r = findComponentsInContent(
    `
    interface Props {
      obj: { bar: number, baz?: string, qux: { quux: number } },
      empty: {}
    };

    export class TestC extends React.Component<Props, {}> {}`
  );

  expect(r.components.length).toBe(1);
  let comp = r.components[0];

  let propsRefIndex = comp.propsRefIndex;
  let propsRef = r.refs[propsRefIndex];

  expect(propsRef).toMatchObject({
    name: "Props",
    members: [{
      name: "obj",
      isNullable: false,
      propType: { kind: "ref" }
    }, {
      name: "empty",
      isNullable: false,
      propType: { kind: "ref" }
    }]
  });

  let objRefIndex = (propsRef.members[0].propType as RefPropType).refIndex;
  let objRef = r.refs[objRefIndex];

  expect(objRef).toMatchObject({
    name: null,
    members: [{
      name: "bar",
      isNullable: false,
      propType: numberPropType
    }, {
      name: "baz",
      isNullable: true,
      propType: stringPropType
    }, {
      name: "qux",
      isNullable: false,
      propType: { kind: "ref" }
    }]
  });

  let quxRefIndex = (objRef.members[2].propType as RefPropType).refIndex;
  let quxRef = r.refs[quxRefIndex];

  expect(quxRef).toMatchObject({
    name: null,
    members: [{
      name: "quux",
      isNullable: false,
      propType: numberPropType
    }]
  });

  let emptyRefIndex = (propsRef.members[1].propType as RefPropType).refIndex;
  let emptyRef = r.refs[emptyRefIndex];

  expect(emptyRef).toMatchObject({
    name: null,
    members: []
  });
});

test('support array types', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    interface Props {
      foo: string[],
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    propType: arrayPropType(stringPropType),
  }]);
});

xtest('support recursive types', () => {
  expectPropMembersOfSingleComponentInContent(
    `
    type Foo = { foo?: Foo }

    interface Props {
      foo: Foo,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    propSpec: {
      propType: arrayPropType(stringPropType),
    }
  }]);
});

function findComponentsInContent(content: string): FinderResult {
  const project = new Project({
    compilerOptions: {
      strictNullChecks: true
    }
  });

  const sourceFile = project.createSourceFile("test/MyClass.tsx", content);
  return findComponentsInSourceFile(sourceFile);
}

function expectComponentsInContent(content: string): jest.Matchers<ComponentSpec[]> {
  return expect(findComponentsInContent(content).components);
}

function expectSingleComponentInContent(content: string): jest.Matchers<ComponentSpec> {
  let r = findComponentsInContent(content);
  expect(r.components.length).toBe(1);
  return expect(r.components[0]);
}

function expectPropsOfSingleComponentInContent(content: string): jest.Matchers<ObjectSpec> {
  let r = findComponentsInContent(content);
  expect(r.components.length).toBe(1);

  let comp = r.components[0];
  let propsRefIndex = comp.propsRefIndex;

  let propsRef = r.refs[propsRefIndex];

  expect(propsRef).not.toBeUndefined();
  return expect(propsRef);
}

function expectPropMembersOfSingleComponentInContent(content: string): jest.Matchers<ObjectMember[]> {
  let r = findComponentsInContent(content);
  expect(r.components.length).toBe(1);

  let comp = r.components[0];
  let propsRefIndex = comp.propsRefIndex;

  let propsRef = r.refs[propsRefIndex];

  expect(propsRef).not.toBeUndefined();
  return expect(propsRef.members);
}
