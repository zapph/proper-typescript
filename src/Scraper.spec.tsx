import { Project } from "ts-morph";
import { ComponentSpec, Finder, voidPropType, fnPropType, eventPropType, numberPropType, booleanPropType, stringPropType, literalPropType, unionPropType, objectPropType, reactElementPropType, arrayPropType } from './Scraper';

test('ignore files without react components', () => {
  expectComponentsInContent("").toStrictEqual([])
});

test('ignore non react component classes', () => {
  expectComponentsInContent("class Foo; class Bar extends Foo")
    .toStrictEqual([]);
});

test('find react component with direct props', () => {
  expectSingleComponentInContent(
    `import * as React from 'react';
     export class TestC extends React.Component<{foo: string}, {}> {}`
  );
});

test('find react component with aliased props', () => {
  expectSingleComponentInContent(
    `import * as React from 'react';
     type Props = { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  );
});

test('find react component with interfaced props', () => {
  expectSingleComponentInContent(
    `import * as React from 'react';
     interface Props { foo: string };
     export class TestC extends React.Component<Props, {}> {}`
  );
});

test('find react component with differently imported react', () => {
  expectSingleComponentInContent(
    `import * as Rrreact from 'react';
     export class TestC extends Rrreact.Component<{}, {}> {}`
  );
});

test('find react component name', () => {
  expectSingleComponentInContent(
    `import * as React from 'react';
     export class TestC extends React.Component<{}, {}> {}`
  ).toMatchObject({ name: "TestC" });
});

test('support basic prop types', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      foo: string,
      bar: number,
      baz: boolean,
      reactElement: React.ReactElement
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
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
    }]
  });
});

test('note whether a prop is nullable', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      foo: string,
      bar: string | undefined,
      baz?: string
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
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
    }]
  });
});

test('support partial props', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface MyProps {
      foo: string
    };

    type Props = Partial<MyProps>;

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
      name: "foo",
      propSpec: {
        isNullable: true,
      }
    }]
  });
});

test

test('support event handlers', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      onClick: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void,
      onClick2: React.MouseEventHandler<HTMLElement>
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
      name: "onClick",
      propSpec: {
        propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
      }
    }, {
      name: "onClick2",
      propSpec: {
        propType: fnPropType([{ propType: eventPropType, isNullable: false }], { propType: voidPropType, isNullable: false })
      }
    }]
  });
});

test('support literal types', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      lit1: 1,
      litFoo: "foo",
      litTrue: true,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
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
    }]
  });
});

test('support union', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      stringOrBoolean: string | false | true,
      fooOrOne: "foo" | 1,
      fooOrBarOrNumber: "foo" | "bar" | number,
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
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
    }]
  });
});

test('support object types', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      foo: { bar: number, baz?: string, qux: { quux: number } },
      empty: {}
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
      name: "foo",
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
    }]
  });
});

test('support object types', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      foo: { bar: number, baz?: string, qux: { quux: number } },
      empty: {}
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
      name: "foo",
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
    }]
  });
});

test('support array types', () => {
  expectSingleComponentInContent(
    `
    import * as React from 'react';

    interface Props {
      foo: string[],
    };

    export class TestC extends React.Component<Props, {}> {}`
  ).toMatchObject({
    name: "TestC",
    props: [{
      name: "foo",
      propSpec: {
        propType: arrayPropType(stringPropType),
      }
    }]
  });
});

function findComponentsInContent(content: string): ComponentSpec[] {
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
  return expect(findComponentsInContent(content));
}

function expectSingleComponentInContent(content: string): jest.Matchers<ComponentSpec> {
  let components = findComponentsInContent(content);
  expect(components.length).toBe(1);
  return expect(components[0]);
}
