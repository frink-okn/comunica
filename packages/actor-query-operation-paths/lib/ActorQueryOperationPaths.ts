import { ActorQueryOperationTypedMediated, ActorQueryOperation,
  IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { IActorTest } from '@comunica/core';
import type { Bindings, BindingsStream, IActionContext, IActionContextKey, MetadataBindings } from '@comunica/types';
import type { IQueryOperationResultBindings } from '@comunica/types';
import { Algebra, Factory, translate } from 'sparqlalgebrajs-nrt';
import { BindingsFactory } from '@comunica/bindings-factory';
import { DataFactory, Variable } from 'rdf-data-factory';
// import { Parser as SparqlParser, Generator as SparqlGenerator } from 'sparqljs'
import * as RDF from '@rdfjs/types';
import { QuerySourceSkolemized } from '@comunica/actor-context-preprocess-query-source-skolemize';
import { AsyncIterator } from 'asynciterator';
/**
 * A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles SPARQL paths operations.
 */
export class ActorQueryOperationPaths extends ActorQueryOperationTypedMediated<Algebra.Paths> {
  private F = new Factory();
  private BF = new BindingsFactory();
  private DF = new DataFactory();

  public readonly cacheSize: number;
  public constructor(args: IActorQueryOperationTypedMediatedArgs) {
    super(args, 'paths');
  }

  public async testOperation(_operation: Algebra.Paths, _context: IActionContext): Promise<IActorTest> {
    console.log('The paths actor is tested');
    return true; 
  }

  public async runOperation(operation: Algebra.Paths, context: IActionContext):
  Promise<IQueryOperationResultBindings> {
    // Call other query operations like this:
    console.log('The paths actor is chosen');
    let key: IActionContextKey<unknown> = {
      name: '@comunica/bus-query-operation:querySources'
    }
    try {
      var sources = context.get(key) as Array<{ context: unknown; source: QuerySourceSkolemized }>;
    } catch {
      sources = []
    }

    // Was originally pattern, lets observe how that is effected
    const input_type = operation.type;
    if (input_type == 'paths') {
      var subject = operation.start;
      var predicate = operation.via;
    } else {
      throw new Error(`Actor ${this.name} only performs paths operations`)
    }

    // Initialize data structures
    const traversed = new Set<RDF.Term>();
    const queue: [RDF.Term , RDF.Term[]][] = [[subject, []]];

    this.pathPrint()
  
    // While there are neighboring nodes to traverse...
    while (queue.length > 0) {
      const [currentNode, path] = queue.shift()!;
      var outgoingEdges = (await this.query(currentNode, predicate, context, sources)) || [];
      let neighbor: RDF.Term;
      let edge: RDF.Term;

      for (const neighborBinding of outgoingEdges) {
        const neighborTerm = neighborBinding.get('o');
        const edgeTerm = neighborBinding.get('p');
        
        if (neighborTerm && edgeTerm) {
          neighbor = neighborTerm;
          edge = edgeTerm;
        } else {
          continue;
        }

        // Check that we have not already traversed the current node
        if (traversed.has(neighbor) ) {
          continue;
        }
        traversed.add(neighbor)

        const newPath = [...path, edge, neighbor];
        this.pathPrint(subject, newPath);

        if ( neighbor.termType != "Literal") {
          queue.push([neighbor, newPath]);
        }
      }
    }

    const output = ActorQueryOperation.getSafeBindings(await this.mediatorQueryOperation.mediate({ operation: operation.input, context }));
        
    return {
      type: 'bindings',
      bindingsStream: output.bindingsStream,
      metadata: output.metadata,
    };
  }

  private async query(sub: RDF.Term, pred: RDF.Term , context: IActionContext, 
    sources: Array<{ context: unknown; source: QuerySourceSkolemized }> ) {
    
     var q = `SELECT ?p ?o WHERE {VALUES ?s { <${sub.value}> } VALUES ?p { <${pred.value}> } ?s ?p ?o .}`;

    // const scopedSource = pattern.input.input[0].metadata;
    var unions: Algebra.Operation[] = [];
    for (const source of sources) {
      const project = translate(q);
      project.input.input.at(-1).patterns[0].metadata = {
        scopedSource: source
      };
      unions.push(project);
    }
    const query = this.F.createUnion(unions);
    
    var outgoingEdges = ActorQueryOperation.getSafeBindings(
      await this.mediatorQueryOperation.mediate({ operation: query, context })) || [];
  
    return outgoingEdges.bindingsStream.toArray();
  }

  private pathPrint(s?: RDF.Term, path?: RDF.Term[]) {
    if(s && path) {
      var output = `Path: ${s.value} `;
      for( const node of path) {
        output += ` -> ${node.value}`;
      }
      console.log(output);

    } else {
      console.log('PATHS:')
    }
  }
  private pathBindings(s: RDF.Term, path: RDF.Term[]): Bindings[] {
    
    const bindingsArr: [RDF.Variable, RDF.Term][] = [];
    bindingsArr.push([this.DF.variable('start'), s])
    path.forEach((node, index) => {
      bindingsArr.push([this.DF.variable(`var${index + 1}`), node]);
    });
    return [this.BF.bindings(bindingsArr)];
  }

}