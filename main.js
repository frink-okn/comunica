const { QueryEngine } = require('@comunica/query-sparql-file');

const myEngine = new QueryEngine();


async function findPathsQuery() {

    // const bindingsStream = await myEngine.queryBindings(`
    //     SELECT ?s ?p ?o WHERE {
    //       ?s ?p ?o
    //     } LIMIT 1`, {
    //     sources: ['https://fragments.dbpedia.org/2015/en'],
    //   });
      const bindingsStream = await myEngine.queryBindings(
        `PATHS START=<http://example.org/Alice> VIA=<http://example.org/knows> END=<http://example.org/Mia>`,  {sources: ['C:/Users/psvka/Downloads/graph3.ttl', "C:/Users/psvka/Downloads/graph2.ttl"],}
      );
    bindingsStream.on('data', (binding) => {
        console.log(binding.toString()); // Quick way to print bindings for testing

    });


}

findPathsQuery();
