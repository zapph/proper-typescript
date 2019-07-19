import { Project } from "ts-morph";
import { ComponentSpec, findComponentsInSourceFile, voidPropType, fnPropType, eventPropType, numberPropType, booleanPropType, stringPropType, literalPropType } from './Scraper';

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
      baz: boolean
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
})

function findComponentsInContent(content: string): ComponentSpec[] {
  const project = new Project({
    compilerOptions: {
      strictNullChecks: true
    }
  });

  const sourceFile = project.createSourceFile("test/MyClass.tsx", content);

  return findComponentsInSourceFile(sourceFile);
}

function expectComponentsInContent(content: string): jest.Matchers<ComponentSpec[]> {
  return expect(findComponentsInContent(content));
}

function expectSingleComponentInContent(content: string): jest.Matchers<ComponentSpec> {
  let components = findComponentsInContent(content);
  expect(components.length).toBe(1);
  return expect(components[0]);
}
