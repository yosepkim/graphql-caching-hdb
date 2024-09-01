function generateHashKey(stringInput) {
  const stringData = stringInput.replace(/\s/g, "");
  let hash = 0, i, chr;
  if (stringData.length === 0) return hash;
  for (i = 0; i < stringData.length; i++) {
    chr = stringData.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

const getAll = async (server, { hdbCore, logger }) => {
  
  server.route({
    url: '/getAll',
    method: 'GET',
    handler: (request) => {
      request.body= {
        operation: 'sql',
        sql: 'SELECT * FROM bestbuy.products'
      };
      return hdbCore.requestWithoutAuthentication(request);
    }
  });


  server.route({
    url: '/graphql',
    method: 'POST',
    handler: async (request) => {
      try {
        let result = [];
        let missedCount = 0;
        for (let i = 0; i < request.body.length; i++) {
          const r = request.body[i];
          const hashKey = generateHashKey(JSON.stringify(r));
          const selectQuery = { 
            body: {
              operation: 'sql',
              sql: `SELECT * FROM bestbuy.products where id = ${hashKey}`
            }
          };
          const cachedPayload = await hdbCore.requestWithoutAuthentication(selectQuery);
          if (cachedPayload.length === 1) {
            delete cachedPayload[0]['id'];
            delete cachedPayload[0]['__createdtime__'];
            delete cachedPayload[0]['__updatedtime__'];

            result.push(cachedPayload[0]);
          } else {
            missedCount++;
          }
        }

        if (missedCount > 0) {
          result = [];

          request.headers["connection"] = "keep-alive";

          const response = await fetch('https://www.bestbuy.com/gateway/graphql', {
              method: 'POST',
              body: JSON.stringify(request.body),
              headers: {
                ...request.headers,
              }
            }
          );
          const payload = await response.json();

          if (payload.length !== request.body.length) return { msg: 'Uh oh. length of request and response are not the same' };

          for (let i = 0; i < request.body.length; i++) {
            const r = request.body[i];
            const hashKey = generateHashKey(JSON.stringify(r));

            const dbRecord = { 
              id: hashKey,
              ...payload[i]
            }
            const insertQuery = { 
              body: {
                operation: "insert",
                schema: "bestbuy",
                table: "products",
                records: [dbRecord]
              }
            };
            hdbCore.requestWithoutAuthentication(insertQuery);
            result.push(payload[i]);
          }
        }
        return result;
      } catch (exception) {
        return { msg: `chicago error occured: ${exception}`, detail: exception.message };
      }
    },
  });

}

export default getAll;
