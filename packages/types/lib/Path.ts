import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';

/**
 * An immutable solution mapping object.
 * This maps variables to a terms.
 */
export type Path = RDF.Path;

/**
 * A stream of paths.
 * @see Path
 */
export type PathStream = AsyncIterator<Path> & RDF.ResultStream<Path>;