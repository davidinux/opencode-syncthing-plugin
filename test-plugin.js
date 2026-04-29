// Test if OpenCode can call our plugin
import('./dist/index.js').then(module => {
  const pluginFn = module.default || module.OpenCodeSyncthingPlugin;
  console.log('Plugin function type:', typeof pluginFn);
  
  try {
    const result = pluginFn({
      client: {
        app: {
          log: (...args) => console.log('LOG:', ...args)
        }
      }
    });
    console.log('Plugin returned:', typeof result);
    if (result && typeof result.then === 'function') {
      result.then(r => console.log('Plugin resolved:', typeof r?.event));
    }
  } catch(e) {
    console.error('Error calling plugin:', e.message);
  }
});
