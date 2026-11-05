// Empaqueta supabase-js en un solo archivo dentro de public/vendor,
// para no depender de un CDN el día del culto.
import { build } from 'esbuild';
await build({
  stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser',
  outfile: 'public/vendor/supabase.js', legalComments: 'eof'
});
console.log('public/vendor/supabase.js listo');
