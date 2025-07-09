/* eslint-disable capitalized-comments */

import type { IActionOptimizeQueryOperation, IActorOptimizeQueryOperationOutput, IActorOptimizeQueryOperationArgs }
  from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { passTestVoid, type IActorTest, type TestResult } from '@comunica/core';
import type { Term } from '@rdfjs/types';
import type { Variable } from 'rdf-data-factory';
import { DataFactory } from 'rdf-data-factory';
import type { Algebra, Factory } from 'sparqlalgebrajs';
import { Util } from 'sparqlalgebrajs';
import type { Operation, Pattern } from 'sparqlalgebrajs/lib/algebra';

/**
 * A comunica Property Function Optimize Query Operation Actor.
 */
export class ActorOptimizeQueryOperationPropertyFunction extends ActorOptimizeQueryOperation {
  private static readonly DF = new DataFactory();
  private static readonly rdfFirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
  private static readonly rdfRest = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
  private static readonly rdfNil = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';
  public static propertyFunctionPredicate = this.DF.namedNode('https://frink.renci.org/vocab/internal/propertyFunction');

  public constructor(args: IActorOptimizeQueryOperationArgs) {
    super(args);
  }

  public async test(_action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    const operation = Util.mapOperation(action.operation, {
      bgp(op: Algebra.Bgp, factory: Factory) {
        return {
          recurse: false,
          result: ActorOptimizeQueryOperationPropertyFunction.extractPropertyFunctions(op, factory),
        };
      },
    });
    return { operation, context: action.context };
  }

  private static extractPropertyFunctions(bgp: Algebra.Bgp, factory: Factory): Operation {
    const labelPattern = bgp.patterns.find(p => p.predicate.value === 'https://frink.renci.org/vocab/label');
    if (labelPattern) {
      const remove = [ labelPattern ];
      const argListNode = labelPattern.object;
      if (argListNode.termType === 'Variable') {
        const extracted = this.extractArgList(argListNode, bgp, { args: [], remove });
        // FIXME check existence
        // const variableArg = extracted.args[0];
        const encodedArgs = this.DF.literal(JSON.stringify(extracted.args));
        const keepPatterns = bgp.patterns.filter(e => !extracted.remove.includes(e));
        const pattern = factory.createPattern(
          labelPattern.subject,
          this.propertyFunctionPredicate,
          labelPattern.object,
        );
        if (pattern.metadata) {
          pattern.metadata.propfunc = encodedArgs;
        } else {
          pattern.metadata = { propfunc: encodedArgs };
        }
        keepPatterns.push(pattern);
        // keepPatterns.push(factory.createPattern(labelPattern.subject, this.propertyFunctionPredicate, encodedArgs));
        return factory.createBgp(keepPatterns);
      }
    }
    return bgp;
  }

  private static extractArgList(start: Variable, bgp: Algebra.Bgp, current: { args: Term[]; remove: Pattern[] }):
  { args: Term[]; remove: Pattern[] } {
    const itemPattern = bgp.patterns.find(p => p.subject === start && p.predicate.value === this.rdfFirst);
    if (itemPattern) {
      const item = itemPattern.object;
      const restPattern = bgp.patterns.find(p => p.subject === start && p.predicate.value === this.rdfRest);
      if (restPattern) {
        current.args.push(item);
        current.remove.push(itemPattern);
        current.remove.push(restPattern);
        const rest = restPattern.object;
        if (rest.value === this.rdfNil) {
          return current;
        }
        if (rest.termType === 'Variable') {
          return this.extractArgList(rest, bgp, current);
        }
      }
    }
    return current;
  }
}
