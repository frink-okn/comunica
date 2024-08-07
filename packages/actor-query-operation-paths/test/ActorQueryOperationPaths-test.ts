import { Bindings, IActorQueryOperationOutputBindings } from '@comunica/bus-query-operation';
import { Bus } from '@comunica/core';
import { literal } from '@rdfjs/data-model';
import { ArrayIterator } from 'asynciterator';
import { ActorQueryOperationPaths } from '../lib/ActorQueryOperationPaths';
const arrayifyStream = require('arrayify-stream');

describe('ActorQueryOperationPaths', () => {
  let bus: any;
  let mediatorQueryOperation: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorQueryOperation = {
      mediate: (arg: any) => Promise.resolve({
        bindingsStream: new ArrayIterator([
          Bindings({ '?a': literal('1') }),
          Bindings({ '?a': literal('2') }),
          Bindings({ '?a': literal('3') }),
        ], { autoStart: false }),
        metadata: () => Promise.resolve({ totalItems: 3 }),
        operated: arg,
        type: 'bindings',
        variables: [ '?a' ],
        canContainUndefs: false,
      }),
    };
  });

  describe('An ActorQueryOperationPaths instance', () => {
    let actor: ActorQueryOperationPaths;

    beforeEach(() => {
      actor = new ActorQueryOperationPaths({ name: 'actor', bus, mediatorQueryOperation });
    });

    it('should test on paths', () => {
      const op = { operation: { type: 'paths' }};
      return expect(actor.test(op)).resolves.toBeTruthy();
    });

    it('should not test on non-paths', () => {
      const op = { operation: { type: 'some-other-type' }};
      return expect(actor.test(op)).rejects.toBeTruthy();
    });

    it('should run', () => {
      const op = { operation: { type: 'paths' }};
      return actor.run(op).then(async(output: IActorQueryOperationOutputBindings) => {
        expect(await output.metadata!()).toEqual({ totalItems: 3 });
        expect(output.variables).toEqual([ '?a' ]);
        expect(output.type).toEqual('bindings');
        expect(output.canContainUndefs).toEqual(false);
        expect(await arrayifyStream(output.bindingsStream)).toEqual([
          Bindings({ '?a': literal('1') }),
          Bindings({ '?a': literal('2') }),
          Bindings({ '?a': literal('3') }),
        ]);
      });
    });
  });
});
