import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { IActorTest } from '@comunica/core';
import { MetadataValidationState } from '@comunica/metadata';
import { Path } from '@comunica/path-factory';
import type {
  IActionContext,
  IJoinEntry,
  IQueryOperationResultBindings,
  IQueryOperationResultPaths,
  PathStream,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator, EmptyIterator, MultiTransformIterator, SimpleTransformIterator } from 'asynciterator';
import type { Variable } from 'rdf-data-factory';
import { DataFactory } from 'rdf-data-factory';
import { Factory, type Algebra } from 'sparqlalgebrajs';
import type { Operation } from 'sparqlalgebrajs/lib/algebra';

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
      if (operation.start.input.type === 'NamedNode') {
        const iri = operation.start.input.value;
        startBindings = this.AF.createValues([ operation.start.variable ], [{ [`?${operation.start.variable.value}`]: iri }]);
      } else {
        //const ps = operation.start.input;
        //ps.map(item => item.)
        //this.AF.createJoin(ps);
        //startPattern = this.AF.createBgp(operation.start.input);
        throw new Error('unimplemented');
      }
    }
    let endBindings: Operation = this.AF.createNop();
    //this.AF.createJoin
    // eslint-disable-next-line prefer-const
    let endPattern: Operation = this.AF.createNop();
    if (operation.end.input) {
      if (operation.end.input.type === 'NamedNode') {
        const iri = operation.end.input.value;
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
    const output = await this.queryHop(
      operation,
      startJoinEntry,
      viaOperation,
      endJoinEntry,
      1,
      operation.maxLength,
      operation.limit,
      operation.offset,
      new Map(),
      operation.shortest ? new Set() : undefined,
      context,
    );
    return { type: 'paths', pathStream: output };
  }

  private async queryHop(
    operation: Algebra.Paths,
    start: IJoinEntry,
    via: Operation,
    _end: IJoinEntry,
    depth: number,
    maxLength: number | undefined,
    limit: number | undefined,
    offset: number | undefined,
    openPaths: Map<string, PathBuilder[]>,
    knownShortest: Set<string> | undefined,
    context: IActionContext,
  ): Promise<PathStream> {
    let endBindings: Operation = this.AF.createNop();
    // eslint-disable-next-line prefer-const
    let endPattern: Operation = this.AF.createNop();
    if (operation.end.input) {
      if (operation.end.input.type === 'NamedNode') {
        const iri = operation.end.input.value;
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
      const allBindings = await results.bindingsStream.toArray();
      console.error(`allBindings length: ${allBindings.length}`);
      if (allBindings.length === 0) {
        return new EmptyIterator();
      }
      const newOpenPaths: PathBuilder[] = [];
      const newKnownShortest: Set<string> | undefined = knownShortest ? new Set(knownShortest) : undefined;
      for (const bindings of allBindings) {
        const start = bindings.get(operation.start.variable);
        const end = bindings.get(operation.end.variable);
        if (start && end &&
          (start.termType === 'NamedNode' || start.termType === 'BlankNode') &&
          (end.termType === 'NamedNode' || end.termType === 'BlankNode')) {
          if (depth === 1) {
            if (newKnownShortest) {
              const endpoints = `start: ${start.value} end: ${end.value}`;
              newKnownShortest.add(endpoints);
            }
            newOpenPaths.push(new PathBuilder(
              operation.start.variable,
              operation.end.variable,
              start,
              end,
              [ bindings ],
              new Set([ start.value, end.value ]),
            ));
          } else {
            const linkablePaths = openPaths.get(start.value) ?? [];
            for (const linkablePath of linkablePaths) {
              const extended = linkablePath.extend(bindings);
              if (extended) {
                const endpoints = `start: ${extended.startpoint.value} end: ${extended.endpoint.value}`;
                const alreadyKnownShortest = knownShortest ? knownShortest.has(endpoints) : false;
                const cyclic = extended.startpoint.value === extended.endpoint.value;
                if (!alreadyKnownShortest && !cyclic) {
                  newOpenPaths.push(extended);
                  if (newKnownShortest) {
                    newKnownShortest.add(endpoints);
                  }
                }
              }
            }
          }
        }
      }
      const newOpenPathsMap = new Map<string, PathBuilder[]>();
      for (const openPath of newOpenPaths) {
        if (newOpenPathsMap.has(openPath.endpoint.value)) {
          newOpenPathsMap.get(openPath.endpoint.value)?.push(openPath);
        } else {
          newOpenPathsMap.set(openPath.endpoint.value, [ openPath ]);
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
            if (depth === 1 && (!operation.cyclic ||
              (operation.cyclic && (start.value === end.value)))) {
              returnablePaths.push(new Path([ bindings ]));
            } else {
              const linkablePaths = openPaths.get(start.value) ?? [];
              for (const linkablePath of linkablePaths) {
                const extended = linkablePath.extend(bindings);
                if (extended) {
                  const endpoints = `start: ${extended.startpoint.value} end: ${extended.endpoint.value}`;
                  const alreadyKnownShortest = knownShortest ? knownShortest.has(endpoints) : false;
                  if (
                    !alreadyKnownShortest &&
                    (!operation.cyclic ||
                      (operation.cyclic && (extended.startpoint.value === extended.endpoint.value)))) {
                    returnablePaths.push(extended.toPath());
                  }
                }
              }
            }
            return new ArrayIterator(returnablePaths);
          }
          return new EmptyIterator();
        },
        });
      const newStartNodesBindings: RDF.Bindings[] = [];
      for (const endpointGroup of newOpenPathsMap.entries()) {
        const endpoint = endpointGroup[1][0].endpoint;
        newStartNodesBindings.push(this.BF.bindings([[ operation.start.variable, endpoint ]]));
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
          undefined,
          undefined,
          newOpenPathsMap,
          newKnownShortest,
          context,
        ),
      );
      if (limit) {
        return currentOutput.append(nextOutput).skip(offset ?? 0).take(limit);
      }
      return currentOutput.append(nextOutput).skip(offset ?? 0);
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
    return via.value;
  }
}
type GraphNode = RDF.NamedNode | RDF.BlankNode;

class PathBuilder {
  private readonly startVar: Variable;
  private readonly endVar: Variable;
  private readonly seenNodes: Set<string> = new Set();
  private readonly steps: RDF.Bindings[] = [];
  public readonly startpoint: GraphNode;
  public readonly endpoint: GraphNode;
  public constructor(
    start: Variable,
    end: Variable,
    startpoint: GraphNode,
    endpoint: GraphNode,
    steps: RDF.Bindings[],
    seen: Set<string>,
  ) {
    this.startVar = start;
    this.endVar = end;
    this.startpoint = startpoint;
    this.endpoint = endpoint;
    this.steps = steps;
    this.seenNodes = seen;
  }

  public extend(bindings: RDF.Bindings): PathBuilder | undefined {
    const maybeEnd = bindings.get(this.endVar);
    if (maybeEnd && (maybeEnd.termType === 'NamedNode' || maybeEnd.termType === 'BlankNode')) {
      if (this.seenNodes.has(maybeEnd.value) && this.startpoint.value !== maybeEnd.value) {
        return undefined;
      }
      const newSeen: Set<string> = new Set();
      newSeen.add(maybeEnd.value);
      for (const node of this.seenNodes.keys()) {
        newSeen.add(node);
      }
      const newSteps: RDF.Bindings[] = [ ...this.steps, bindings ];
      return new PathBuilder(this.startVar, this.endVar, this.startpoint, maybeEnd, newSteps, newSeen);
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
