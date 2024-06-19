import { ActorQueryOperationTypedMediated, ActorQueryOperation,
  IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { IActorTest } from '@comunica/core';
import type { BindingsStream, IActionContext } from '@comunica/types';
import type { IQueryOperationResultBindings } from '@comunica/types';
import { Algebra } from 'sparqlalgebrajs';

/**
 * A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles SPARQL reduced-my operations.
 */
export class ActorQueryOperationReducedMy extends ActorQueryOperationTypedMediated<Algebra.Reduced> {

  public constructor(args: IActorQueryOperationTypedMediatedArgs) {
    super(args, 'reduced');
  }

  public async testOperation(pattern: Algebra.Reduced, context: IActionContext): Promise<IActorTest> {
    return true; // TODO implement
  }

  public async runOperation(pattern: Algebra.Reduced, context: IActionContext): Promise<IQueryOperationResultBindings> {
    const input = pattern.input.input.input[0];
    const source = input.metadata.scopedSource.source.innerSource.firstUrl;
    // console.log("s: %s, p: %s, o: %s", input.subject.value, input.predicate.value, input.object.value);
    this.pathQuery(input.subject.value, input.predicate.value, source);

    const output = ActorQueryOperation.getSafeBindings(await this.mediatorQueryOperation.mediate({ operation: pattern.input, context }));
        
    return {
      type: 'bindings',
      bindingsStream: output.bindingsStream,
      metadata: output.metadata,
    };
  }

  private async pathQuery(subject: string, predicate: string, source: string): Promise<void> {
    const QueryEngine = require('@comunica/query-sparql').QueryEngine;
    const myEngine = new QueryEngine();
    const queue: [string, string[]][] = [[subject, []]];
    this.pathPrint()
  
    while (queue.length > 0) {
      const [currentNode, path] = queue.shift()!;
      var outgoingEdges = await this.query(currentNode, predicate, source, myEngine) || [];
  
      for (const neighborBinding of outgoingEdges) {
        const neighbor = neighborBinding.get('o')?.value || '';
        const edge = neighborBinding.get('p')?.value || '';
        const newPath = [...path, edge, neighbor];
        this.pathPrint(`Path: ${subject} -> ${newPath.join(' -> ')}`);

        if ( !this.isLiteral(neighbor) ) {
          queue.push([neighbor, newPath]);
        }
  
      }
    }
  }

  private async query(sub: string, pred: string, source: string, myEngine: any ) { 
    
    switch (pred) {
      case "p":
        var q = `SELECT ?p ?o WHERE 
        {
          <${sub}> ?p ?o.
        }`;
        break;
      default:
        var q = `SELECT ?p ?o WHERE 
        {
          <${sub}> ?pred ?o.
          VALUES ?pred { <${pred}> }
          BIND(?pred AS ?p)
        }`;
    }

    const bindingsStream = await myEngine.queryBindings(q, 
      {
        // sources: ['http://example.org/'], 
        // baseIRI: 'http://example.org/',
        sources: [
          {
            type: 'serialized',
            value: '@prefix : <http://example.org/> . :Alice :knows :Bob . :Bob :likes :David . :David :likes :Jane . :Eve :knows :David .  :Charlie :parentOf :Eve . :Bob :worksWith :Charlie .',
            mediaType: 'text/turtle',
            baseIRI: 'http://example.org/',
          },
        ],
        // sources: [source],
      }
    );
  
    return bindingsStream.toArray();
  }

  private pathPrint(s?: string) {
    if(!s) {
      console.log('PATHS:')
    } else {
      console.log(s)
    }
  }

  private isLiteral(sub: string): boolean {
    return !sub.startsWith("http");
  }

}
