import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';

/**
 * An immutable solution mapping object.
 * This maps variables to a terms.
 */
export type Paths = RDF.Path;

/**
 * A stream of paths.
 * @see Path
 */
export type PathsStream = AsyncIterator<RDF.Path> & RDF.ResultStream<Paths>;