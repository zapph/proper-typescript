import { Project } from "ts-morph";
import { ComponentSpec, Finder, voidPropType, fnPropType, eventPropType, numberPropType, booleanPropType, stringPropType, literalPropType, unionPropType, objectPropType, reactElementPropType, arrayPropType, reactNodePropType, FinderResult, NamedPropSpec } from './Scraper';

// Finding Components

test('ignore files without react components', () => {
  expectComponentsInContent("").toStrictEqual([])
});

test('ignore non react component classes', () => {
  expectComponentsInContent("class Foo; class Bar extends Foo")
    .toStrictEqual([]);
});

test('find react component with direct props', () => {
  expectSingleComponentInContent(
    `export class TestC extends React.Component<{foo: string}, {}> {}`
  );
});

test('find react component with aliased props', () => {
  expectSingleComponentInContent(
    `type Props = { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  );
});

test('find react component with interfaced props', () => {
  expectSingleComponentInContent(
    `interface Props { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  );
});

test('find react component with differently imported react', () => {
  expectSingleComponentInContent(
    `import * as Rrreact from 'react';
     export class TestC extends Rrreact.Component<{}, {}> {}`
  );
});

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

  const finder = new Finder();

  expect(finder.findComponentsInSourceFile(indexFile).components.length).toBe(1);
});

// Name

test('find react component name', () => {
  expectSingleComponentInContent(
    `export class TestC extends React.Component<{}, {}> {}`
  ).toMatchObject({ name: "TestC" });
});

// Props

test('support basic prop types', () => {
  expectPropsOfSingleComponentInContent(
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
    propSpec: {
      propType: stringPropType,
    }
  }, {
    name: "bar",
    propSpec: {
      propType: numberPropType,
    }
  }, {
    name: "baz",
    propSpec: {
      propType: booleanPropType,
    }
  }, {
    name: "reactElement",
    propSpec: {
      propType: reactElementPropType,
    }
  }, {
    name: "reactNode",
    propSpec: {
      propType: reactNodePropType,
    }
  }, {
    name: "syntheticEvent",
    propSpec: {
      propType: eventPropType,
    }
  }, {
    name: "mouseEvent",
    propSpec: {
      propType: eventPropType,
    }
  }]);
});

test('note whether a prop is nullable', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      foo: string,
      bar: string | undefined,
      baz?: string
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    propSpec: {
      isNullable: false,
    }
  }, {
    name: "bar",
    propSpec: {
      isNullable: true,
    }
  }, {
    name: "baz",
    propSpec: {
      isNullable: true,
    }
  }]);
});

test('support partial props', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface MyProps {
      fooPartial: string
    };

    type Props = Partial<MyProps>;

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "fooPartial",
    propSpec: {
      isNullable: true,
    }
  }]);
});

test('support event handlers', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      onClick: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void,
      onClick2: React.MouseEventHandler<HTMLElement>
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "onClick",
    propSpec: {
      propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
    }
  }, {
    name: "onClick2",
    propSpec: {
      propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
    }
  }]);
});

test('support literal types', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      lit1: 1,
      litFoo: "foo",
      litTrue: true,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "lit1",
    propSpec: {
      propType: literalPropType(1)
    }
  }, {
    name: "litFoo",
    propSpec: {
      propType: literalPropType("foo")
    }
  }, {
    name: "litTrue",
    propSpec: {
      propType: literalPropType(true)
    }
  }]);
});

test('support union', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      stringOrBoolean: string | false | true,
      fooOrOne: "foo" | 1,
      fooOrBarOrNumber: "foo" | "bar" | number,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "stringOrBoolean",
    propSpec: {
      // boolean ends up as literal true or false
      propType: unionPropType([stringPropType, literalPropType(false), literalPropType(true)])
    }
  }, {
    name: "fooOrOne",
    propSpec: {
      propType: unionPropType([literalPropType("foo"), literalPropType(1)])
    }
  }, {
    name: "fooOrBarOrNumber",
    propSpec: {
      // Manually switched
      propType: unionPropType([numberPropType, literalPropType("foo"), literalPropType("bar")])
    }
  }]);
});

test('support object types', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      obj: { bar: number, baz?: string, qux: { quux: number } },
      empty: {}
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "obj",
    propSpec: {
      propType:
        objectPropType([{
          name: "bar",
          propSpec: { propType: numberPropType, isNullable: false }
        }, {
          name: "baz",
          propSpec: { propType: stringPropType, isNullable: true }
        }, {
          name: "qux",
          propSpec: {
            propType: objectPropType([{
              name: "quux",
              propSpec: { propType: numberPropType, isNullable: false }
            }]),
            isNullable: false
          }
        }])
    }
  }, {
    name: "empty",
    propSpec: {
      propType: objectPropType([])
    }
  }]);
});;

test('support array types', () => {
  expectPropsOfSingleComponentInContent(
    `
    interface Props {
      foo: string[],
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject([{
    name: "foo",
    propSpec: {
      propType: arrayPropType(stringPropType),
    }
  }]);
});

xtest('support recursive types', () => {
  expectPropsOfSingleComponentInContent(
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
  const finder = new Finder();

  return finder.findComponentsInSourceFile(sourceFile);
}

function expectComponentsInContent(content: string): jest.Matchers<ComponentSpec[]> {
  return expect(findComponentsInContent(content).components);
}

function expectSingleComponentInContent(content: string): jest.Matchers<ComponentSpec> {
  let r = findComponentsInContent(content);
  expect(r.components.length).toBe(1);
  return expect(r.components[0]);
}

function expectPropsOfSingleComponentInContent(content: string): jest.Matchers<NamedPropSpec[]> {
  let r = findComponentsInContent(content);
  expect(r.components.length).toBe(1);
  return expect(r.components[0].props);
}
