const fs = require('fs');
const glob = require('glob');

const files = [
  'src/components/settings/settings-page.tsx',
  'src/components/reports/reports-page.tsx',
  'src/components/onboarding/step-org.tsx',
  'src/components/onboarding/step-building.tsx',
  'src/components/onboarding/step-data.tsx',
  'src/components/onboarding/step-connect.tsx',
  'src/components/onboarding/wizard-shell.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // 1. Major outer white cards -> subtle horizontal dividers
  content = content.replace(/className="([^"]*)rounded-lg border border-zinc-200 bg-white p-4([^"]*)"/g, 'className="$1 py-6 border-t border-zinc-200 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 bg-white p-4([^"]*)"/g, 'className="$1 py-6 border-t border-zinc-200 first:border-0 first:pt-0 $2"');

  // 2. Inner gray boxes -> simple left borders (asymmetrical ledger style)
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 p-3([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 px-3 py-2([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 p-4([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-4 py-2 $2"');

  // 3. Settings page specific borders
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 px-3 py-3([^"]*)"/g, 'className="$1 py-4 border-t border-zinc-200 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded bg-zinc-50 px-3 py-2([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');

  // 4. Onboarding specific
  content = content.replace(/className="([^"]*)rounded-2xl border border-zinc-200\/80 bg-white p-6 sm:p-10 shadow-sm([^"]*)"/g, 'className="$1 bg-white $2"'); // Strip the massive card wrapper completely
  content = content.replace(/className="([^"]*)rounded-xl border border-zinc-200\/80 bg-zinc-50\/50 p-6([^"]*)"/g, 'className="$1 border-t-2 border-zinc-900 pt-6 $2"'); // Make the connection box an institutional section

  // 5. Red error/warning nested boxes
  content = content.replace(/className="([^"]*)rounded-lg bg-red-50 p-4 border border-red-200([^"]*)"/g, 'className="$1 border-l-2 border-red-500 bg-red-50/50 pl-4 py-3 $2"');

  // 6. Generic padding/border replacements for reports page
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 px-3 py-2([^"]*)"/g, 'className="$1 py-2 border-t border-zinc-100 first:border-0 first:pt-0 $2"');

  fs.writeFileSync(file, content);
}

console.log('Flattened cards across target components!');
