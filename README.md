# index-html-loader

Load `index.html` from some source and compile it arbitrary data using handlebars.
Subsequent requests will use the cache. Cache will be reset and prewarmed
when the subscription is triggered in GCP PubSub.

This library works great with [ember-cli-deploy] and specifically the following plugins:

- https://github.com/knownasilya/ember-cli-deploy-gcloud-pubsub
- https://github.com/knownasilya/ember-cli-deploy-gcloud-storage
- https://github.com/mwpastore/ember-cli-deploy-sql

## Example

```js
import setupLoader from 'index-html-loader';
import pkg from './package.json';

const pubsubOptions = { /* ... */ };
const indexHtml = setupLoader({
  project: pkg.name,
  version: pkg.version,
  env: process.env.NODE_ENV,
  // Make sure each pod is invalidated in kubernetes
  subscriptionPostfix: process.env.GCP_POD_ID,
  pubsubOptions,
  findRevision: async (project, revisionId) => {
    return await loadHtml(project, revisionId);
  }
});

router.get('/*', async function (req, res) {
  let data = await loadSomeData();
  let html = await indexHtml.load(data, req.query.revisionKey);

  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  res.send(html);
});
```

## Debug

You can log details from this library by adding the following
environment variable to your start/watch script.

```sh
DEBUG=index-html-loader npm start
```

[ember-cli-deploy]: http://ember-cli-deploy.com/