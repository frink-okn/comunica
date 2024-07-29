import type { Bindings } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
 * An immutable.js-based Bindings object.
 */
export class Path implements RDF.Path {
  public readonly type = 'path';
  private readonly entries: Array<Bindings>;

  public constructor(entries: Array<Bindings>) {
    this.entries = entries;
  }

  public size(): number {
    return this.entries.length;
  }

  public push(node: Bindings): boolean {
    this.entries.push(node);
    return true;
  }

  public nodes(): Bindings[] {
    return this.entries;
  }

  public forEach(fn: (value: Bindings) => any): void {
    // for (const [ key, value ] of this.entries.entries()) {
    //   fn(value, this.dataFactory.variable!(value));
    // }
  }

  public [Symbol.iterator](): Iterator<Bindings> {
    let index = 0;
    let data = this.entries;

    return {
      next(): IteratorResult<Bindings> {
        if (index < data.length) {
          return { value: data[index++], done: false };
        } else {
          return { value: undefined, done: true };
        }
      }
    };
  }

}
