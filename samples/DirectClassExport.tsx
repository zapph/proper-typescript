import * as React from 'react';

interface Props {
  foo: string;
  bar: number;
}

export class DirectClassExport extends React.Component<Props, {}> {
  render() {
    return <span>{this.props.foo}</span>
  }
}
