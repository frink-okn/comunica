import type { Bindings } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
 * An immutable.js-based Bindings object.
 */
export class Path implements RDF.Path {
  public readonly type = 'path';
  private readonly entries: Bindings[];

  public constructor(entries: Bindings[]) {
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
    for (const bindings of this.entries) {
      fn(bindings);
    }
  }

  public [Symbol.iterator](): Iterator<Bindings> {
    let index = 0;
    const data = this.entries;
    return {
      next(): IteratorResult<Bindings> {
        if (index < data.length) {
          return { value: data[index++], done: false };
        }
        return { value: undefined, done: true };
      },
    };
  }
}
