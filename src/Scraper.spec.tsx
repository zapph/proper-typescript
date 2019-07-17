import { Project } from "ts-morph";
import { ComponentSpec, PropType, findComponentsInSourceFile } from './Scraper';

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
      propType: PropType.String,
    }, {
      name: "bar",
      propType: PropType.Number,
    }, {
      name: "baz",
      propType: PropType.Boolean,
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
      isNullable: false,
    }, {
      name: "bar",
      isNullable: true,
    }, {
      name: "baz",
      isNullable: true,
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
      isNullable: true,
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
