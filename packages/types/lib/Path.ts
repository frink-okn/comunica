import type * as RDF from '@rdfjs/types';
import type { ArrayIterator } from 'asynciterator';

/**
 * An immutable solution mapping object.
 * This maps variables to a terms.
 */
export type Path = RDF.Path;

/**
 * A stream of paths.
 * @see Path
 */
export type PathStream = ArrayIterator<Path> & RDF.ResultStream<Path> | Array<Path>;