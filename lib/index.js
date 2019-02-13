import PubSub from '@google-cloud/pubsub';
import handlebars from 'handlebars';
import debug from 'debug';

const log = debug('index-html-loader');
const caches = {};

// Used in the template to preload data
handlebars.registerHelper('json', function (context) {
  return JSON.stringify(context);
});

/**
 * Setup the cache on first run, and make sure to use the
 * cache on subsequent requests.
 * 
 * @param {*} options 
 */
export default function setup(options = {}) {
  let project = options.project;

  if (!project) {
    throw new Error('The project is not defined for loading bootstrapped index.html');
  }

  let cache = caches[project];

  // Setup our cache and invalidation subscription on first run
  // for the specified project
  if (!cache) {
    cache = await setupCache(options);
  }

  return {
    /**
     * Fetch the active/specified index.html from some source.
     * 
     * Also handle clearing the cache
     * via a subscription to PubSub, so that all instances are
     * prewarmed with the new index.html
     * 
     * @param {Object} data The data to compile with the handlebars template
     * @param {String|undefined} revisionKey Id of a specific index revision
     * @returns {String} The compiled html from the active or specified bootstrap
     */
    load: async function loadIndexHtml(data, revisionKey) {
      let result = await findRevision(revisionKey, project, cache, options.findRevision);
      let compiled = handlebars.compile(result.value);

      // Add revision to the template for debugging
      if (data) {
        data.revisionKey = result.key;
      }

      return compiled(data);
    }
  };
};

/**
 * Setup the project cache and create a subscription and listen
 * for new events via that subscription. The event handler
 * makes sure the cache is cleared on activation of a new revision.
 * 
 * @param {Options} options The setup options
 * @returns {Map} The cache Map instance
 */
async function setupCache(options = {}) {
  const pubsubOptions = options.pubsubOptions;

  log('Using pubsub config', pubsubOptions);
  
  const client = new PubSub(pubsubOptions);
  const project = options.project;
  const env = options.env || 'development';
  const topicName = `${project}-${env}`;
  const version = options.version ? `${options.version}-` : '';
  const identifier = `${topicName}-${version}`;
  let subscriptionName = `index-html-loader-${identifier}cache-invalidation`;
  let cache = new Map();

  // Make sure each instance has it's own subscription
  // so that each one acknowledges the subscription message
  if (options.subscriptionPostfix) {
    subscriptionName += options.subscriptionPostfix;
  }

  // Save our cache for access later
  caches[project] = cache;

  // Create a new subscription
  try {
    let [subscription] = await client.topic(topicName)
      .createSubscription(subscriptionName);

    // Listen for deployment activations and clear and pre-warm our
    // index.html cache.
    subscription.on('message', setupSubscriptionHandler(project, options.findRevision));
  } catch(error) {
    log(`Pubsub topic (${topicName}) creating subscription (${subscriptionName}) error: `, error);
  }

  return cache;
}

/**
 * Create a handler for the specified project. Uses the project's cache.
 * 
 * The handler parses the message, clears the cache, and warms it
 * for the next request.
 * 
 * @param {String} project The name of the project
 * @param {Function} revisionHandler Function that returns a promise to find the data
 * @returns {Function} The function takes a `message` object from the subscription event
 */
function setupSubscriptionHandler(project, revisionHandler) {
  let cache = caches[project];

  return function (message) {
    let dataString = message.data.toString();
    let data = JSON.parse(dataString);

    cache.clear();
    message.ack();

    findRevision(data.revisionKey, project, cache, revisionHandler);
  }
}

/**
 * Query for a revision based on revision key, or for the current one if the key is falsy.
 * 
 * If the result is cached, return that instead, otherwise fetch and
 * update the cache for the next request.
 * 
 * @param {String|undefined} revisionKey The revision key to fetch, otherwise the active one is fetched
 * @param {String} project The project name used for cache keys and table names
 * @param {Map} cache `Map` instance that works as the cache
 * @param {Function} handler A function that returns a promise. Should return the data for the revision.
 */
async function findRevision(revisionKey, project, cache, handler) {
  let cacheKey = revisionKey ? revisionKey : 'active';
  let cached = cache.has(cacheKey);

  if (cached) {
    return cache.get(cacheKey);
  }

  let result = await handler(project, revisionKey);

  cache.set(cacheKey, result);

  return result;
}

