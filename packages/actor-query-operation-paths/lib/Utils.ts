import * as RDF from '@rdfjs/types';

export function pathPrint(s?: RDF.Term, path?: RDF.Term[]) {
  if(s && path) {
    var output = `Path: ${path[0].value}`;
    for( const node of path.slice(1)) {
      output += ` -> ${node.value}`;
    }
    console.log(output);

  } else {
    console.log('Error parsing path to print.')
  }
}

  // private pathBindings(s: RDF.Term, path: RDF.Term[]): Bindings[] {
    
  //   const bindingsArr: [RDF.Variable, RDF.Term][] = [];
  //   bindingsArr.push([this.DF.variable('start'), s])
  //   path.forEach((node, index) => {
  //     bindingsArr.push([this.DF.variable(`var${index + 1}`), node]);
  //   });
  //   return [this.BF.bindings(bindingsArr)];
  // }
