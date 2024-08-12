import { ActionContext, Bus } from '@comunica/core';
import { ActorQueryOperationPaths } from '../lib/ActorQueryOperationPaths';
import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { Algebra } from 'sparqlalgebrajs-nrt';
import { DataFactory } from 'rdf-data-factory';
import { Path } from '@comunica/path-factory';
import '@comunica/jest';

const DF = new DataFactory();

describe('ActorQueryOperationPaths', () => {
  let bus: any;
  let mediatorQueryOperation: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorQueryOperation = {
      mediate: (arg: any) => Promise.resolve({
        operated: arg,
        type: 'paths',
      }),
    };
  });

  describe('The ActorQueryOperationPaths module', () => {
    it('should be a function', () => {
      expect(ActorQueryOperationPaths).toBeInstanceOf(Function);
    });

    it('should be a ActorQueryOperationPaths constructor', () => {
      expect(new (<any> ActorQueryOperationPaths)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperationPaths);
      expect(new (<any> ActorQueryOperationPaths)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperation);
    });

    it('should not be able to create new ActorQueryOperationPaths objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryOperationPaths)();
      }).toThrow(`Class constructor ActorQueryOperationPaths cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQueryOperationPaths instance', () => {
    let actor: ActorQueryOperationPaths;

    beforeEach(() => {
      actor = new ActorQueryOperationPaths({ name: 'actor', bus, mediatorQueryOperation });
    });

    it('should test on paths', () => {
      const op: any = {
        operation: { 
          type: Algebra.types.PATHS, 
          start: DF.variable("s"),
          end: DF.variable("o"),
        },
        context: new ActionContext(),
      };
      return expect(actor.test(op)).resolves.toBeTruthy();

    });

    it('should not test on non-paths', () => {
      const op: any = {
        operation: { 
          type: Algebra.types.CONSTRUCT, 
          start: DF.variable("s"),
          end: DF.variable("o"),
        },
        context: new ActionContext(),
      };
      return expect(actor.test(op)).rejects.toBeTruthy();
    });

    it('should run', async () => {
      const op: any = {
        operation: { 
          type: Algebra.types.PATHS, 
          start: DF.variable("s"),
          via: DF.namedNode("p"),
          end: DF.variable("o"),
        },
        context: new ActionContext(),
      };
      const output = ActorQueryOperation.getSafePaths(await actor.run(op));
      // expect(output.pathStream);

    });
  });
});
