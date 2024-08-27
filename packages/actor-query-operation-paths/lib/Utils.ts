import type { QuerySourceSkolemized } from '@comunica/actor-context-preprocess-query-source-skolemize';
import { ActorQueryOperation } from '@comunica/bus-query-operation';
import type { IActionContext, IActionContextKey } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { Algebra } from 'sparqlalgebrajs';
import { Factory, translate } from 'sparqlalgebrajs';

export class Utils {
  private readonly Factory: Factory;
  private readonly mediatorQueryOperation: any;
  private readonly context: IActionContext;
  private readonly sources: { context: unknown; source: QuerySourceSkolemized }[];

  public constructor(mediatorQueryOperation: any, context: IActionContext, F?: Factory) {
    this.Factory = F ?? new Factory();
    this.mediatorQueryOperation = mediatorQueryOperation;
    this.context = context;

    // Parse all sources:
    const key: IActionContextKey<unknown> = {
      name: '@comunica/bus-query-operation:querySources',
    };
    try {
      this.sources = context.get(key) as { context: unknown; source: QuerySourceSkolemized }[];
    } catch {
      // Cannot run queries without sources.
      throw new Error('Error parsing sources in Query Operation Paths Actor.');
    }
  }

  public async query(sub: RDF.Term, pred: RDF.Term): Promise<RDF.Bindings[]> {
    let q: string;
    if (pred.termType === 'Variable' || pred.value === '?p') {
      q = `SELECT ?s ?p ?o WHERE {VALUES ?s { <${sub.value}> } ?s ?p ?o .}`;
    } else {
      q = `SELECT ?s ?p ?o WHERE {VALUES ?s { <${sub.value}> } VALUES ?p { <${pred.value}> } ?s ?p ?o .}`;
    }
    const unions: Algebra.Operation[] = [];
    for (const source of this.sources) {
      const project = translate(q);
      project.input.input.at(-1).patterns[0].metadata = { scopedSource: source };
      unions.push(project);
    }
    const query = this.Factory.createUnion(unions);
    const outgoingEdges = ActorQueryOperation.getSafeBindings(
      await this.mediatorQueryOperation.mediate({ operation: query, context: this.context }),
    ) || [];
    return outgoingEdges.bindingsStream.toArray();
  }
}
