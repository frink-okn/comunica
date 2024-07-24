import { ActorQueryOperationTypedMediated, ActorQueryOperation,
  IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { IActorTest } from '@comunica/core';
import type { IActionContext, IActionContextKey, IQueryOperationResultBoolean } from '@comunica/types';
import { Algebra, Factory, translate } from 'sparqlalgebrajs-nrt';
import { BindingsFactory } from '@comunica/bindings-factory';
import { DataFactory } from 'rdf-data-factory';
// import { Parser as SparqlParser, Generator as SparqlGenerator } from 'sparqljs'
import * as RDF from '@rdfjs/types';
import { QuerySourceSkolemized } from '@comunica/actor-context-preprocess-query-source-skolemize';
// import { AsyncIterator } from 'asynciterator';
import {pathPrint} from "./Utils"

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
    var end = operation.end;

    if (operation.cyclic === true) {
      // this.cyclicPaths(start, via, end, sources, operation, context);
    } else {
      this.paths(start, via, end, sources, operation, context);
    }
        
    // Operation successful! Return true.
    return {
      type: 'boolean',
      execute: async() => true,
    };
  }

  private async paths(start: RDF.Term, via: RDF.Term, end: RDF.Term, sources: any, operation: Algebra.Operation, context: IActionContext) {
    // Initialize data structures and variables
    const traversed = new Set<RDF.Term>();
    const queue: [RDF.Term , RDF.Term[]][] = [[start, [start]]];
    var neighbor: RDF.Term;
    var edge: RDF.Term;
    var newPath: RDF.Term[];
    var pathFound: boolean;
    var cyclic: boolean;
      
    // While there are neighboring nodes to traverse...
    while (queue.length > 0) {
      const [currentNode, path] = queue.shift()!;

      // Query for all neighboring nodes:
      var outgoingEdges = (await this.query(currentNode, via, context, sources)) || [];

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

        // Assume we are ready to print...
        cyclic = path.includes(neighbor) ? true : false;

        // IF user wants cyclic paths, print only cyclic paths.
        if ( operation.all !== true && traversed.has(neighbor) ) {
          continue;
        } else {
          pathFound = end.termType == "NamedNode" && neighbor.value == end.value;
        }

        // Finally, print and traverse neighbor and edge if needed:
        newPath = [...path, edge, neighbor];
        if( pathFound == true) {
          pathPrint(start, newPath);
        }

        if ( operation.all !== true && pathFound ) {
          break;
        }

        // Add neighbor to queue if it isn't a literal and the path is acyclic:
        if ( neighbor.termType != "Literal" && cyclic == false) {
          queue.push([neighbor, newPath]);
        }
      }
    }
  }

  // private async cyclicPaths(start: RDF.Term, via: RDF.Term, end: RDF.Term, sources: any, operation: Algebra.Operation, context: IActionContext): Promise<boolean> {
  //   const visited: Set<RDF.Term> = new Set();
  //   const recursionStack: Set<RDF.Term> = new Set();
  //   const cyclicPaths: RDF.Term[][] = [];
  
  //   async function dfs(node: RDF.Term, path: RDF.Term[]): Promise<void> {
  //     visited.add(node);
  //     recursionStack.add(node);
  //     path.push(node);

  //     var outgoingEdges = (await this.query(node, via, context, sources)) || [];
  
  //     for (const neighbor of outgoingEdges || []) {
  //       if (!visited.has(neighbor)) {
  //         dfs(neighbor, [...path]);
  //       } else if (recursionStack.has(neighbor)) {
  //         const cycleStartIndex = path.indexOf(neighbor);
  //         const cyclePath = path.slice(cycleStartIndex);
          
  //         // Check if the cycle includes both start and end nodes (if specified)
  //         if (!start || !end || (cyclePath.includes(start) && cyclePath.includes(end))) {
  //           cyclicPaths.push(cyclePath);
  //         }
  //       }
  //     }
  
  //     recursionStack.delete(node);
  //   }
  
  //   if (start) {
  //     // If start node is specified, only search from that node
  //     dfs(start, []);
  //   } else {
  //     // Otherwise, search from all nodes
  //     for (const node in graph) {
  //       if (!visited.has(node)) {
  //         dfs(node, []);
  //       }
  //     }
  //   }
  
  // }

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

  // private pathBindings(s: RDF.Term, path: RDF.Term[]): Bindings[] {
    
  //   const bindingsArr: [RDF.Variable, RDF.Term][] = [];
  //   bindingsArr.push([this.DF.variable('start'), s])
  //   path.forEach((node, index) => {
  //     bindingsArr.push([this.DF.variable(`var${index + 1}`), node]);
  //   });
  //   return [this.BF.bindings(bindingsArr)];
  // }

}