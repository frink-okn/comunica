import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';

/**
 * An immutable solution mapping object.
 * This maps variables to a terms.
 */
export type Paths = RDF.Paths;

/**
 * A stream of bindings.
 * @see Bindings
 */
export type PathsStream = AsyncIterator<RDF.Paths> & RDF.ResultStream<Paths>;