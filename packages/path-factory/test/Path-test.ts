import { BindingsFactory } from '@comunica/bindings-factory';
import { DataFactory } from 'rdf-data-factory';
import { Path } from '../lib';

describe('Path', () => {
  describe('holds a sequence of bindings', () => {
    it('returns expected bindings', () => {
      const DF = new DataFactory();
      const BF = new BindingsFactory();
      const bindings1 = BF.bindings([[ DF.variable('x'), DF.namedNode('http://example.org/x') ]]);
      const path = new Path([ bindings1 ]);
      expect(path.nodes()).toHaveLength(1);
      expect(path.size()).toBe(1);
      const bindings2 = BF.bindings([[ DF.variable('x'), DF.namedNode('http://example.org/x2') ]]);
      const result = path.push(bindings2);
      expect(result).toBeTruthy();
      expect(path.size()).toBe(2);
      for (const bindings of path) {
        expect(bindings.has('x')).toBeTruthy();
      }
      let count = 0;
      // eslint-disable-next-line unicorn/no-array-for-each
      path.forEach(bindings => count++);
      expect(count).toBe(2);
    });
  });
});
