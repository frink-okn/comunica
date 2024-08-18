import { Bus } from '@comunica/core';
import { ActorOptimizeQueryOperationPropertyFunction } from '../lib/ActorOptimizeQueryOperationPropertyFunction';

describe('ActorOptimizeQueryOperationPropertyFunction', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorOptimizeQueryOperationPropertyFunction instance', () => {
    let actor: ActorOptimizeQueryOperationPropertyFunction;

    beforeEach(() => {
      actor = new ActorOptimizeQueryOperationPropertyFunction({ name: 'actor', bus });
    });

    it('should test', async() => {
      await expect(actor.test({ todo: true })).resolves.toEqual({ todo: true }); // TODO
    });

    it('should run', async() => {
      await expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true }); // TODO
    });
  });
});
