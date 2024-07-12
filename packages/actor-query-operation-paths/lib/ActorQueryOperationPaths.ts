import { ActorQueryOperationTypedMediated, ActorQueryOperation,
  IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { IActorTest } from '@comunica/core';
import type { Bindings, BindingsStream, IActionContext, IActionContextKey, IQueryOperationResultBoolean, IQueryOperationResultBindings, MetadataBindings } from '@comunica/types';
import { Algebra, Factory, translate } from 'sparqlalgebrajs-nrt';
import { BindingsFactory } from '@comunica/bindings-factory';
import { DataFactory } from 'rdf-data-factory';
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
    // console.log('The paths actor is tested');
    return true; 
  }

  public async runOperation(operation: Algebra.Paths, context: IActionContext):
  Promise<IQueryOperationResultBoolean> {

    // Parse all sources:
    let key: IActionContextKey<unknown> = {
      name: '@comunica/bus-query-operation:querySources'
    }
    try {
      var sources = context.get(key) as Array<{ context: unknown; source: QuerySourceSkolemized }>;
    } catch {
      sources = []
    }

    // Retrieve operation inputs:
    var start = operation.start;
    var via = operation.via;
    var end = operation.end

    // Initialize data structures
    const traversed = new Set<RDF.Term>();
    const queue: [RDF.Term , RDF.Term[]][] = [[start, []]];
  
    // While there are neighboring nodes to traverse...
    while (queue.length > 0) {
      const [currentNode, path] = queue.shift()!;

      // Query for all neighboring nodes:
      var outgoingEdges = (await this.query(currentNode, via, context, sources)) || [];
      let neighbor: RDF.Term;
      let edge: RDF.Term;

      // Process each neighboring node:
      for (const neighborBinding of outgoingEdges) {
        const neighborTerm = neighborBinding.get('o');
        const edgeTerm = neighborBinding.get('p');
        
        // Assert that the neighbor/edge are not undefined:
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

        // Finally, print and traverse neighbor and edge:
        const newPath = [...path, edge, neighbor];
        if( neighbor.value == end.value ) {
          this.pathPrint(start, newPath);
        }

        // Add neighbor to queue if it isn't a literal:
        if ( neighbor.termType != "Literal") {
          queue.push([neighbor, newPath]);
        }
      }
    }
        
    // Operation successful! Return true.
    return {
      type: 'boolean',
      execute: async() => true,
    };
  }

  private async query(sub: RDF.Term, pred: RDF.Term , context: IActionContext, 
    sources: Array<{ context: unknown; source: QuerySourceSkolemized }> ) {
    
    if (pred.termType == 'Variable') {
      var q = `SELECT ?p ?o WHERE {VALUES ?s { <${sub.value}> } ?s ?p ?o .}`;
    } else {
      q = `SELECT ?p ?o WHERE {VALUES ?s { <${sub.value}> } VALUES ?p { <${pred.value}> } ?s ?p ?o .}`;
    }
    
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
      console.log('Error parsing path to print.')
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