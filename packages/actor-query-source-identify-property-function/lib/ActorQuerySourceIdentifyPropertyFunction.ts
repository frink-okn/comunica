import { ActorOptimizeQueryOperationPropertyFunction } 
  from '@comunica/actor-optimize-query-operation-property-function';
import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type { MediatorQueryOperation } from '@comunica/bus-query-operation';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
  MediatorQuerySourceIdentify }
  from '@comunica/bus-query-source-identify';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { IActorTest } from '@comunica/core';
import { MetadataValidationState } from '@comunica/metadata';
import type {
  IActionContext,
  BindingsStream,
  Bindings,
  QuerySourceReference,
  IQueryBindingsOptions,
  IQuerySource,
  FragmentSelectorShape,
  QueryResultCardinality,
  IQueryOperationResult,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator, EmptyIterator, SingletonIterator, wrap } from 'asynciterator';
import type { Literal, NamedNode, Variable } from 'rdf-data-factory';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import type { Operation, Ask, Update, Alt } from 'sparqlalgebrajs/lib/algebra';
import { MediatorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';

const AF = new Factory();
const DF = new DataFactory<RDF.BaseQuad>();

/**
 * A comunica Property Function Query Source Identify Actor.
 */
export class ActorQuerySourceIdentifyPropertyFunction extends ActorQuerySourceIdentify {
  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  public readonly mediatorQueryOperation: MediatorQueryOperation;
  public readonly mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation;
  public readonly mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
  public constructor(args: IActorQuerySourceIdentifyPropertyFunctionArgs) {
    super(args);
  }

  public async test(action: IActionQuerySourceIdentify): Promise<IActorTest> {
    const source = action.querySourceUnidentified;
    if (source.type !== undefined && source.type !== 'property') {
      throw new Error(`${this.name} requires a single query source with property type to be present in the context.`);
    }
    // Why throw error above instead of returning false here?
    return true;
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    return { querySource: {
      source: new QuerySourcePropertyFunction(
        await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context),
        this.mediatorQueryOperation,
        this.mediatorOptimizeQueryOperation,
        this.mediatorQuerySourceIdentify,
      ),
      context: action.context,
    }};
  }
}

export interface IActorQuerySourceIdentifyPropertyFunctionArgs extends IActorQuerySourceIdentifyArgs {
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  mediatorQueryOperation: MediatorQueryOperation;
  mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation;
  mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
}

export class QuerySourcePropertyFunction implements IQuerySource {
  private readonly bindingsFactory: BindingsFactory;
  private readonly mediatorQueryOperation: MediatorQueryOperation;
  public readonly mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation;
  private readonly mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
  private readonly DF = new DataFactory();
  private readonly AF = new Factory(this.DF);
  private readonly label = DF.namedNode('http://www.w3.org/2000/01/rdf-schema#label');
  private readonly foafName = DF.namedNode('http://xmlns.com/foaf/0.1/name');
  private readonly sdoName = DF.namedNode('http://schema.org/name');
  private readonly dcTermsTitle = DF.namedNode('http://purl.org/dc/terms/title');
  private readonly dcTitle = DF.namedNode('http://purl.org/dc/elements/1.1/title');
  private readonly defaultProperties = [ this.label, this.foafName, this.sdoName, this.dcTermsTitle, this.dcTitle ];
  private readonly defaultPropertyPath = AF.createAlt(this.defaultProperties.map(p => AF.createLink(p)));

  protected static readonly SELECTOR_SHAPE: FragmentSelectorShape = {
    type: 'operation',
    operation: {
      operationType: 'pattern',
      pattern: AF.createPattern(
        DF.variable('s'),
        ActorOptimizeQueryOperationPropertyFunction.propertyFunctionPredicate,
        DF.variable('o'),
      ),
    },
    variablesRequired: [],
    variablesOptional: [],
  };

  public readonly referenceValue: QuerySourceReference = 'https://frink.renci.org/vocab/label';

  public constructor(
    bindingsFactory: BindingsFactory,
    mediatorQueryOperation: MediatorQueryOperation,
    mediatorOptimizeQueryOperation: MediatorOptimizeQueryOperation,
    mediatorQuerySourceIdentify: MediatorQuerySourceIdentify,
  ) {
    this.bindingsFactory = bindingsFactory;
    this.mediatorQueryOperation = mediatorQueryOperation;
    this.mediatorQuerySourceIdentify = mediatorQuerySourceIdentify;
    this.mediatorOptimizeQueryOperation = mediatorOptimizeQueryOperation;
  }

  public async getSelectorShape(_context: IActionContext): Promise<FragmentSelectorShape> {
    return QuerySourcePropertyFunction.SELECTOR_SHAPE;
  }

  public queryBindings(
    operation: Operation,
    context: IActionContext,
    _options?: IQueryBindingsOptions,
  ): BindingsStream {
    if (operation.type !== 'pattern') {
      throw new Error(`Attempted to pass non-pattern operation '${operation.type}' to QuerySourcePropertyFunction`);
    }
    let it: AsyncIterator<Bindings> = new ArrayIterator<Bindings>();
    let cardinality: QueryResultCardinality = { type: 'exact', value: 0 };
    let variables: RDF.Variable[] = [];
    const canContainUndefs = false;
    if (operation.predicate === ActorOptimizeQueryOperationPropertyFunction.propertyFunctionPredicate &&
      operation.object.termType === 'Literal') {
      const parsedArgs = JSON.parse(operation.object.value);
      const outVariable = Array.isArray(parsedArgs) ? parsedArgs[0] : parsedArgs;
      if (this.isVar(outVariable)) {
        if (operation.subject.termType === 'Variable') {
          // Number.POSITIVE_INFINITY or Infinity don't seem to work to force the subject to be bound
          cardinality = { type: 'estimate', value: Number.MAX_SAFE_INTEGER };
          it = new EmptyIterator<Bindings>();
          variables = [ operation.subject, outVariable ];
        } else {
          const pattern = AF.createPath(operation.subject, this.defaultPropertyPath, outVariable);
          const results =
            // Make sure pattern gets sources assigned
            this.mediatorOptimizeQueryOperation.mediate({ operation: pattern, context })
              // Execute query
              .then(optimizedOutput => this.mediatorQueryOperation.mediate(
                { operation: optimizedOutput.operation, context: optimizedOutput.context },
              )
                // Return bindings stream
                .then((result: IQueryOperationResult) => {
                  if (result.type === 'bindings') {
                    return result.bindingsStream;
                  }
                  return new EmptyIterator<Bindings>();
                }));
          const bindings = wrap(results);
          return bindings;
        }
      }
    } else {
      it = new EmptyIterator<Bindings>();
      if (operation.subject.termType === 'Variable') {
        variables.push(operation.subject);
      }
      if (operation.predicate.termType === 'Variable') {
        variables.push(operation.predicate);
      }
      if (operation.object.termType === 'Variable') {
        variables.push(operation.object);
      }
    }
    it.setProperty('metadata', {
      state: new MetadataValidationState(),
      cardinality,
      canContainUndefs,
      variables,
    });
    return it;
  }

  public queryQuads(_operation: Operation, _context: IActionContext): AsyncIterator<RDF.Quad> {
    throw new Error('queryQuads is not implemented in QuerySourcePropertyFunction');
  }

  public queryBoolean(_operation: Ask, _context: IActionContext): Promise<boolean> {
    throw new Error('queryBoolean is not implemented in QuerySourcePropertyFunction');
  }

  public queryVoid(_operation: Update, _context: IActionContext): Promise<void> {
    throw new Error('queryVoid is not implemented in QuerySourcePropertyFunction');
  }

  public toString(): string {
    return 'property function source';
  }

  private isVar(term: any): term is Variable {
    const variable = term as Variable;
    return variable.termType !== undefined && variable.termType === 'Variable' && variable.value !== undefined;
  }
}

class AutoLabel {
  private readonly DF = new DataFactory();
  private readonly AF = new Factory(this.DF);
  private readonly label = DF.namedNode('http://www.w3.org/2000/01/rdf-schema#label');
  private readonly foafName = DF.namedNode('http://xmlns.com/foaf/0.1/name');
  private readonly sdoName = DF.namedNode('http://schema.org/name');
  private readonly dcTermsTitle = DF.namedNode('http://purl.org/dc/terms/title');
  private readonly dcTitle = DF.namedNode('http://purl.org/dc/elements/1.1/title');
  private readonly defaultProperties: NamedNode[] = [
    this.label,
    this.foafName,
    this.sdoName,
    this.dcTermsTitle,
    this.dcTitle,
  ];

  private readonly defaultPropertyPath = AF.createAlt(this.defaultProperties.map(p => AF.createLink(p)));
  private readonly labelVar: Variable;
  private readonly properties: NamedNode[];
  private readonly propertiesPath: Alt;
  private readonly languages: string[];
  public constructor(args: string) {
    const parsedArgs = JSON.parse(args);
    let variableObj = {};
    if (Array.isArray(parsedArgs)) {
      variableObj = parsedArgs[0];
      const requestedLanguages = parsedArgs.filter(arg => this.isLiteral(arg));
      if (requestedLanguages.length === 0) {
        const locale = navigator ? navigator.language : 'en';
        this.languages = [ locale ];
      } else {
        this.languages = requestedLanguages.map(lang => lang.value);
      }
      const requestedProperties = parsedArgs.filter(arg => this.isNamedNode(arg));
      if (requestedProperties.length === 0) {
        this.properties = this.defaultProperties;
        this.propertiesPath = this.defaultPropertyPath;
      } else {
        this.properties = requestedProperties;
        this.propertiesPath = AF.createAlt(requestedProperties.map(p => AF.createLink(p)));
      }
    } else {
      variableObj = parsedArgs;
      this.properties = this.defaultProperties;
      this.propertiesPath = this.defaultPropertyPath;
    }
    if (this.isVar(variableObj)) {
      this.labelVar = variableObj;
    } else {
      throw new Error('First argument to the autolabel property must be a variable.');
    }
  }

  private isVar(term: any): term is Variable {
    const variable = term as Variable;
    return variable.termType !== undefined && variable.termType === 'Variable' && variable.value !== undefined;
  }

  private isLiteral(term: any): term is Literal {
    const literal = term as Literal;
    return literal.termType !== undefined && literal.termType === 'Literal' && literal.value !== undefined;
  }

  private isNamedNode(term: any): term is NamedNode {
    const node = term as NamedNode;
    return node.termType !== undefined && node.termType === 'NamedNode' && node.value !== undefined;
  }
}
