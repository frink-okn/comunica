import { BindingsFactory } from '@comunica/bindings-factory';
import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import type { IActorTest } from '@comunica/core';
import { Path } from '@comunica/path-factory';
import type { IActionContext, IQueryOperationResultPaths } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import type { Algebra } from 'sparqlalgebrajs';
import { Utils } from './Utils';

/**
 * A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles SPARQL paths operations.
 */
export class ActorQueryOperationPaths extends ActorQueryOperationTypedMediated<Algebra.Paths> {

  public readonly cacheSize: number;
  public constructor(args: IActorQueryOperationTypedMediatedArgs) {
    super(args, 'paths');
  }

  public async testOperation(_operation: Algebra.Paths, _context: IActionContext): Promise<IActorTest> {
    // No paths between two of the same nodes.
    return _operation.type === 'paths';
  }

  public async runOperation(operation: Algebra.Paths, context: IActionContext):
  Promise<IQueryOperationResultPaths> {
    const DF = new DataFactory();
    const start: RDF.Term = operation.start.value ?
      this.pathValue(operation.start) :
      DF.variable(operation.start.var.value);
    const via: RDF.Term = ('value' in operation.via) ?
      this.pathValue(operation.via) :
      DF.variable(operation.via.var.value);
    const end: RDF.Term = operation.end.value ?
      this.pathValue(operation.end) :
      DF.variable(operation.end.var.value);
    // Run paths algorithm depending on type of query (cyclic or shortest/all paths?).
    const utils = new Utils(this.mediatorQueryOperation, context);
    // FIXME if this comparison is simplified, doesn't work correctly; need to find out why
    const stream = operation.cyclic === true ?
        (await this.cyclicPaths(start, via, end, utils)) :
        (await this.paths(start, via, end, operation, utils));

    const output: AsyncIterator<RDF.Path> = new ArrayIterator<RDF.Path>(stream, {autoStart: false});
    return {
      type: 'paths',
      pathStream: output,
    };
  }

  private pathValue(pathValue: any): RDF.Term {
    if (pathValue.value && !Array.isArray(pathValue.value)) {
      return pathValue.value.value.value;
    }
    throw new Error('Pathfinder cannot process graph patterns yet.');
  }

  private async paths(start: RDF.Term, via: RDF.Term, end: RDF.Term, operation: Algebra.Operation, utils: Utils):
  Promise<RDF.Path[]> {
    const DF = new DataFactory();
    const BF = new BindingsFactory();

    // Initialize data structures
    const traversed = new Set<RDF.Term>();
    const queue: [RDF.Term, RDF.Bindings[]][] = [[start, []]];
    const pathsArr: RDF.Path[] = [];

    // Loop while there are nodes to process in the queue.
    while (queue.length > 0) {
      const [ currentNode, path ] = queue.shift()!;
      // Query for all neighboring nodes of the current node.
      const outgoingEdges = (await utils.query(currentNode, via)) || [];
      for (const neighborBinding of outgoingEdges) {
        // Get the neighbor node from the binding and skip if undefined.
        const neighbor = neighborBinding.get('o');
        if (!neighbor) {
          continue;
        }
        const order = BF.bindings([
          [ DF.variable('s'), neighborBinding.get('s') ?? DF.namedNode('s') ],
          [ DF.variable('p'), neighborBinding.get('p') ?? DF.namedNode('p') ],
          [ DF.variable('o'), neighborBinding.get('o') ?? DF.namedNode('o') ],
        ]);
        const newPath = [ ...path, order ];
        // Create a new path including the current neighborBinding.
        // const newPath = [...path, neighborBinding];
        // Check if the neighbor node is the target end node.
        if (end.termType === 'NamedNode' && neighbor.value === end.value) {
          pathsArr.push(new Path(newPath));
          // If we only want the shortest path, return immediately.
          if (operation.all !== true) {
            return pathsArr;
          }
        } else if (neighbor.termType !== 'Literal' && (!traversed.has(neighbor) || operation.all === true)) {
          // If the neighbor is not a literal and has not been traversed,
          // or if we want all paths, add the neighbor to the queue for further processing.
          queue.push([ neighbor, newPath ]);
        }
      }
      // Mark the current node as traversed.
      traversed.add(currentNode);
    }
    // Return all found paths.
    return pathsArr;
  }

  private async cyclicPaths(startNode: RDF.Term, via: RDF.Term, endNode: RDF.Term, utils: Utils): Promise<RDF.Path[]> {
    // Initialize data structures
    const traversed = new Set<string>();
    const pathArr: RDF.Bindings[] = [];
    const pathsArr: RDF.Path[] = [];

    async function dfs(node: RDF.Term, end?: RDF.Term, neighborBinding?: RDF.Bindings): Promise<void> {
      // If a neighborBinding is provided, push it to the path array.
      neighborBinding && pathArr.push(neighborBinding);
      // If the current node has already been traversed.
      if (traversed.has(node.value)) {
        // If there is an end node specified and the current node is the end node OR if end node doesnt matter,
        // push a copy of pathArr to the pathsArr.
        if ((end && node.equals(end)) ?? !end) {
          pathsArr.push(new Path([ ...pathArr ]));
        }
        // Remove the last element from pathArr since we are backtracking.
        pathArr.pop();
        return;
      }
      // Mark the current node as traversed.
      traversed.add(node.value);
      try {
        // Query for all outgoing edges from the current node.
        const outgoingEdges = await utils.query(node, via) || [];
        // Process each outgoing edge (neighbor).
        for (const neighborBinding of outgoingEdges) {
          const neighborTerm = neighborBinding.get('o');
          // If the neighboring node exists, recursively call dfs on it.
          if (neighborTerm) {
            await dfs(neighborTerm, end, neighborBinding);
          }
        }
      } catch (error) {
        console.error("Error in DFS:", error);
      } finally {
        // Remove the last element from pathArr since we are backtracking.
        pathArr.pop();
        // Remove the current node from traversed set to allow revisiting it in different paths.
        traversed.delete(node.value);
      }
    }
    if (startNode.termType === 'NamedNode' && endNode.termType === 'NamedNode') {
      // If start node is specified, only search from that node
      await dfs(startNode);
      return pathsArr;
    }
    // // Otherwise, search from all nodes
    // for (const node in graph) {
    //   if (!traversed.has(node)) {
    //     dfs(node, []);
    //   }
    // }
    return pathsArr;
  }
}
