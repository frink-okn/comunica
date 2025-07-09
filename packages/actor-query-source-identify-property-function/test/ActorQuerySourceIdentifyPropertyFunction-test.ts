import { Bus } from '@comunica/core';
import { ActorQuerySourceIdentifyPropertyFunction } from '../lib/ActorQuerySourceIdentifyPropertyFunction';

describe('ActorQuerySourceIdentifyPropertyFunction', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorQuerySourceIdentifyPropertyFunction instance', () => {
    let actor: ActorQuerySourceIdentifyPropertyFunction;

    beforeEach(() => {
      actor = new ActorQuerySourceIdentifyPropertyFunction({ name: 'actor', bus });
    });

    it('should test', async() => {
      await expect(actor.test({ todo: true })).resolves.toEqual({ todo: true }); // TODO
    });

    it('should run', async() => {
      await expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true }); // TODO
    });
  });
});
