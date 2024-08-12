import * as RDF from '@rdfjs/types';
import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { Algebra, Factory, translate } from 'sparqlalgebrajs';
import { QuerySourceSkolemized } from '@comunica/actor-context-preprocess-query-source-skolemize';
import { IActionContext, IActionContextKey } from '@comunica/types'


export class Utils {

  private Factory: Factory;
  private mediatorQueryOperation: any;
  private context: IActionContext;
  private sources: Array<{ context: unknown; source: QuerySourceSkolemized }>;

  public constructor( mediatorQueryOperation: any, context: IActionContext, F?: Factory) {
    this.Factory = F || new Factory();
    this.mediatorQueryOperation = mediatorQueryOperation;
    this.context = context;

    // Parse all sources:
    let key: IActionContextKey<unknown> = {
      name: '@comunica/bus-query-operation:querySources'
    }
    try {
      this.sources = context.get(key) as Array<{ context: unknown; source: QuerySourceSkolemized }>;
    } catch {
      // Cannot run queries without sources.
      throw new Error("Error parsing sources in Query Operation Paths Actor.");
    }
  }

  public async query(sub: RDF.Term, pred: RDF.Term): Promise<RDF.Bindings[]> {
    
    if (pred.termType == 'Variable' || pred.value == '?p') {
      var q = `SELECT * WHERE {VALUES ?s { <${sub.value}> } ?s ?p ?o .}`;
    } else {
      q = `SELECT * WHERE {VALUES ?s { <${sub.value}> } VALUES ?p { <${pred.value}> } ?s ?p ?o .}`;
    }
    
    var unions: Algebra.Operation[] = [];
    for (const source of this.sources) {
      const project = translate(q);
      project.input.input.at(-1).patterns[0].metadata = {
        scopedSource: source
      };
      unions.push(project);
    }
    const query = this.Factory.createUnion(unions);
    
    var outgoingEdges = ActorQueryOperation.getSafeBindings(
      await this.mediatorQueryOperation.mediate({ operation: query, context: this.context })) || [];
  
    return outgoingEdges.bindingsStream.toArray();
  }
}
