import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import type { IActorTest } from '@comunica/core';
import { Path } from '@comunica/path-factory';
import type { BindingsStream, IActionContext, IJoinEntry, IQueryOperationResult, IQueryOperationResultBindings, IQueryOperationResultPaths, PathStream } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator, EmptyIterator, MultiTransformIterator, SimpleTransformIterator, wrap } from 'asynciterator';
import type { Variable } from 'rdf-data-factory';
import { DataFactory } from 'rdf-data-factory';
import { Factory, type Algebra } from 'sparqlalgebrajs';
import type { Operation } from 'sparqlalgebrajs/lib/algebra';
import { Utils } from './Utils';
import { IActionRdfJoin, MediatorRdfJoin } from '@comunica/bus-rdf-join';
import { MetadataValidationState } from '@comunica/metadata';

/**
 * A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles SPARQL paths operations.
 */
export class ActorQueryOperationPaths extends ActorQueryOperationTypedMediated<Algebra.Paths> {
  private readonly mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation;
  private readonly mediatorRdfJoin: MediatorRdfJoin;
  private readonly DF = new DataFactory();
  private readonly AF = new Factory(this.DF);
  private readonly BF = new BindingsFactory(this.DF);
  public readonly cacheSize: number;
  public constructor(args: IActorQueryOperationTypedMediatedPathsArgs) {
    super(args, 'paths');
    this.mediatorOptimizeQueryOperation = args.mediatorOptimizeQueryOperation;
  }

  public async testOperation(_operation: Algebra.Paths, _context: IActionContext): Promise<IActorTest> {
    return _operation.type === 'paths';
  }

  public async runOperation(operation: Algebra.Paths, context: IActionContext):
  Promise<IQueryOperationResultPaths> {
    let startBindings: Operation = this.AF.createNop();
    // eslint-disable-next-line prefer-const
    let startPattern: Operation = this.AF.createNop();
    if (operation.start.input) {
      if ('termType' in operation.start.input) {
        const iri = operation.start.input;
        startBindings = this.AF.createValues([ operation.start.variable ], [{ [`?${operation.start.variable.value}`]: iri }]);
      } else {
        //startPattern = this.AF.createBgp(operation.start.input);
        throw new Error('unimplemented');
      }
    }
    let endBindings: Operation = this.AF.createNop();
    //this.AF.createJoin
    // eslint-disable-next-line prefer-const
    let endPattern: Operation = this.AF.createNop();
    if (operation.end.input) {
      if ('termType' in operation.end.input) {
        const iri = operation.end.input;
        endBindings = this.AF.createValues([ operation.end.variable ], [{ [`?${operation.end.variable.value}`]: iri }]);
      } else {
        //endPattern = this.AF.createBgp(operation.end.input);
        throw new Error('unimplemented');
      }
    }
    const viaOperation = this.expandVia(operation.via, operation.start.variable, operation.end.variable);
    const optimizedStart = await this.mediatorOptimizeQueryOperation.mediate({ operation: startBindings, context });
    //const start = await this.mediatorQueryOperation.mediate({ operation: startBindings, context });
    const start = await this.mediatorQueryOperation.mediate(
      { operation: optimizedStart.operation, context: optimizedStart.context },
    );
    let startResult: IQueryOperationResultBindings;
    if (start.type === 'bindings') {
      startResult = start;
    } else {
      throw new Error('unexpected query result');
    }
    const end = await this.mediatorQueryOperation.mediate({ operation: endBindings, context });
    let endResult: IQueryOperationResultBindings;
    if (end.type === 'bindings') {
      endResult = end;
    } else {
      throw new Error('unexpected query result');
    }
    const startJoinEntry = { output: startResult, operation: optimizedStart.operation };
    const endJoinEntry = { output: endResult, operation: endBindings };
    const fakeMaxLength = 3;
    const output = await this.queryHop(
      operation,
      startJoinEntry,
      viaOperation,
      endJoinEntry,
      1,
      fakeMaxLength,
      new Map(),
      context,
    );
    return { type: 'paths', pathStream: output };
  }

  private async queryHopOld(start: Operation, via: Operation, context: IActionContext):
  Promise<BindingsStream> {
    const join = this.AF.createJoin([ start, via ], true);
    // Make sure pattern gets sources assigned
    const optimized = await this.mediatorOptimizeQueryOperation.mediate({ operation: join, context });
    // Execute query
    const results = await this.mediatorQueryOperation
      .mediate({ operation: optimized.operation, context: optimized.context });
    if (results.type === 'bindings') {
      return results.bindingsStream;
    }
    throw new Error('Unexpected query execution');
  }

  private async queryHop(
    operation: Algebra.Paths,
    start: IJoinEntry,
    via: Operation,
    _end: IJoinEntry,
    depth: number,
    maxLength: number | undefined,
    openPaths: Map<GraphNode, PathBuilder[]>,
    context: IActionContext,
  ): Promise<PathStream> {
    let endBindings: Operation = this.AF.createNop();
    // eslint-disable-next-line prefer-const
    let endPattern: Operation = this.AF.createNop();
    if (operation.end.input) {
      if ('termType' in operation.end.input) {
        const iri = operation.end.input;
        endBindings = this.AF.createValues([ operation.end.variable ], [{ [`?${operation.end.variable.value}`]: iri }]);
      } else {
        //endPattern = this.AF.createBgp(operation.end.input);
        throw new Error('unimplemented');
      }
    }
    const end = await this.mediatorQueryOperation.mediate({ operation: endBindings, context });
    let endResult: IQueryOperationResultBindings;
    if (end.type === 'bindings') {
      endResult = end;
    } else {
      throw new Error('unexpected query result');
    }
    const endJoinEntry: IJoinEntry = { output: endResult, operation: endBindings };


    console.log(`MAX LENGTH: ${maxLength}`);
    console.log(`DEPTH: ${depth}`);
    if (maxLength && depth > maxLength) {
      return new EmptyIterator();
    }
    const optimizedVia = await this.mediatorOptimizeQueryOperation.mediate({ operation: via, context });
    const viaResults = await this.mediatorQueryOperation
      .mediate({ operation: optimizedVia.operation, context: optimizedVia.context });
    if (viaResults.type !== 'bindings') {
      throw new Error('Unexpected query execution');
    }
    const joinForVia: IJoinEntry = {
      output: {
        type: 'bindings',
        bindingsStream: viaResults.bindingsStream,
        metadata: viaResults.metadata,
      },
      operation: optimizedVia.operation,
    };
    const results = await this.mediatorRdfJoin.mediate(
      { type: 'inner', entries: [ start, joinForVia ], context },
    );
    //const join = this.AF.createJoin([ start, via ], true);
    // Make sure pattern gets sources assigned
    //const optimized = await this.mediatorOptimizeQueryOperation.mediate({ operation: join, context });
    // Execute query
    // const results = await this.mediatorQueryOperation
    //   .mediate({ operation: optimized.operation, context: optimized.context });
    if (results.type === 'bindings') {
      // OLD return { output: results, operation: optimized.operation };
      const allBindings = await results.bindingsStream.toArray();
      console.log(`allBindings length: ${allBindings.length}`);
      if (allBindings.length === 0) {
        return new EmptyIterator();
      }
      const newOpenPaths: PathBuilder[] = [];
      for (const bindings of allBindings) {
        const start = bindings.get(operation.start.variable);
        const end = bindings.get(operation.end.variable);
        if (start && end &&
          (start.termType === 'NamedNode' || start.termType === 'BlankNode') &&
          (end.termType === 'NamedNode' || end.termType === 'BlankNode')) {
          if (depth === 1) {
            newOpenPaths.push(new PathBuilder(
              operation.start.variable,
              operation.end.variable,
              end,
              [ bindings ],
              new Set([ start, end ]),
            ));
          } else {
            const linkablePaths = openPaths.get(start) ?? [];
            for (const linkablePath of linkablePaths) {
              const extended = linkablePath.extend(bindings);
              if (extended) {
                newOpenPaths.push(extended);
              }
            }
          }
        }
      }
      const newOpenPathsMap = new Map<GraphNode, PathBuilder[]>();
      for (const openPath of newOpenPaths) {
        if (newOpenPathsMap.has(openPath.endpoint)) {
          newOpenPathsMap.get(openPath.endpoint)?.push(openPath);
        } else {
          newOpenPathsMap.set(openPath.endpoint, [ openPath ]);
        }
      }
      const joinForEnd: IJoinEntry = {
        output: {
          type: 'bindings',
          bindingsStream: new ArrayIterator(allBindings),
          metadata: results.metadata,
        },
        operation: this.AF.createNop(),
        operationModified: true,
      };
      const matchingEndResult = await this.mediatorRdfJoin.mediate(
        { type: 'inner', entries: [ joinForEnd, endJoinEntry ], context },
      );
      const currentOutput: AsyncIterator<RDF.Path> =
        new MultiTransformIterator(matchingEndResult.bindingsStream, { multiTransform: (bindings) => {
          // FIXME duplication with above
          const start = bindings.get(operation.start.variable);
          const end = bindings.get(operation.end.variable);
          if (start && end &&
            (start.termType === 'NamedNode' || start.termType === 'BlankNode') &&
            (end.termType === 'NamedNode' || end.termType === 'BlankNode')) {
            const returnablePaths: RDF.Path[] = [];
            if (depth === 1) {
              returnablePaths.push(new Path([ bindings ]));
            } else {
              const linkablePaths = openPaths.get(start) ?? [];
              for (const linkablePath of linkablePaths) {
                const extended = linkablePath.extend(bindings);
                if (extended) {
                  returnablePaths.push(extended.toPath());
                }
              }
            }
            return new ArrayIterator(returnablePaths);
          }
          return new EmptyIterator();
        },
        });
      const newStartNodesBindings: RDF.Bindings[] = [];
      for (const endNode of newOpenPathsMap.keys()) {
        newStartNodesBindings.push(this.BF.bindings([[ operation.start.variable, endNode ]]));
      }
      let newStartPattern: Operation = this.AF.createNop();
      const newStartNodesJoinEntry: IJoinEntry = {
        output: {
          type: 'bindings',
          bindingsStream: new ArrayIterator(newStartNodesBindings),
          metadata: () => Promise.resolve({
            canContainUndefs: false,
            variables: [ operation.start.variable ],
            cardinality: { type: 'exact', value: newStartNodesBindings.length },
            state: new MetadataValidationState(),
          }),
        },
        // FIXME this is wrong operation
        operation: this.AF.createNop(),
        operationModified: true,
      };
      const nextOutput = new SimpleTransformIterator(
        // FIXME make new start operation!
        () => this.queryHop(
          operation,
          newStartNodesJoinEntry,
          via,
          _end,
          depth + 1,
          maxLength,
          newOpenPathsMap,
          context,
        ),
      );
      return currentOutput.append(nextOutput);
    }
    throw new Error('Unexpected query execution');
  }

  private expandVia(via: Algebra.PathVia, start: Variable, end: Variable): Operation {
    if (via.type === 'Variable') {
      return this.AF.createPattern(start, via.value, end);
    }
    if (via.type === 'Path') {
      return this.AF.createPath(start, via.value, end);
    }
    throw new Error('unimplemented');
  }

  private bindingsToValues(bindings: RDF.Bindings): Algebra.Values {
    const values: { [key: string]: RDF.Literal | RDF.NamedNode}[] = [];
    // eslint-disable-next-line unicorn/no-array-for-each
    bindings.forEach((value, variable) => {
      //values.push({ [`?${variable.value}`]: value });
    });
    return this.AF.createValues([ ...bindings.keys() ], values);
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
    const queue: [RDF.Term, RDF.Bindings[]][] = [[ start, []]];
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

  private isGraphNode(node: RDF.Term | undefined): boolean {
    if (node) {
      return node.termType === 'NamedNode' || node.termType === 'BlankNode';
    }
    return false;
  }
}
type GraphNode = RDF.NamedNode | RDF.BlankNode;

class PathBuilder {
  private readonly startVar: Variable;
  private readonly endVar: Variable;
  private readonly seenNodes: Set<GraphNode> = new Set();
  private readonly steps: RDF.Bindings[] = [];
  public readonly endpoint: GraphNode;
  public constructor(
    start: Variable,
    end: Variable,
    endpoint: GraphNode,
    steps: RDF.Bindings[],
    seen: Set<RDF.NamedNode | RDF.BlankNode>,
  ) {
    this.startVar = start;
    this.endVar = end;
    this.endpoint = endpoint;
    this.steps = steps;
    this.seenNodes = seen;
  }

  public extend(bindings: RDF.Bindings): PathBuilder | undefined {
    const maybeStart = this.steps[0]?.get(this.startVar);
    const maybeEnd = bindings.get(this.endVar);
    if (maybeStart && maybeEnd && (maybeEnd.termType === 'NamedNode' || maybeEnd.termType === 'BlankNode')) {
      if (this.seenNodes.has(maybeEnd) && maybeStart !== maybeEnd) {
        return undefined;
      }
      const newSeen: Set<GraphNode> = new Set();
      newSeen.add(maybeEnd);
      for (const node of this.seenNodes.keys()) {
        newSeen.add(node);
      }
      const newSteps: RDF.Bindings[] = [ ...this.steps, bindings ];
      return new PathBuilder(this.startVar, this.endVar, maybeEnd, newSteps, newSeen);
    }
  }

  public toPath(): RDF.Path {
    return new Path(this.steps);
  }
}

export interface IActorQueryOperationTypedMediatedPathsArgs extends IActorQueryOperationTypedMediatedArgs {
  mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation;
  mediatorRdfJoin: MediatorRdfJoin;
}
