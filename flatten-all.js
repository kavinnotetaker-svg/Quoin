const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/**/*.tsx');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. Major outer white cards -> subtle horizontal dividers
  content = content.replace(/className="([^"]*)rounded-lg border border-zinc-200 bg-white p-4([^"]*)"/g, 'className="$1 py-6 border-t border-zinc-200 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 bg-white p-4([^"]*)"/g, 'className="$1 py-6 border-t border-zinc-200 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-white p-6([^"]*)"/g, 'className="$1 py-8 border-t border-zinc-200 first:border-0 first:pt-0 $2"');

  // 2. Inner gray boxes -> simple left borders (asymmetrical ledger style)
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 p-3([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 px-3 py-2([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');
  content = content.replace(/className="([^"]*)rounded(?:-md|-lg)? border border-zinc-200 bg-zinc-50 p-4([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-4 py-2 $2"');

  // 3. Simple border boxes
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 px-3 py-3([^"]*)"/g, 'className="$1 py-4 border-t border-zinc-200 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 px-3 py-2([^"]*)"/g, 'className="$1 py-2 border-t border-zinc-100 first:border-0 first:pt-0 $2"');
  content = content.replace(/className="([^"]*)rounded border border-zinc-200 p-4([^"]*)"/g, 'className="$1 py-4 border-t border-zinc-200 first:border-0 first:pt-0 $2"');

  // Skip wizard/onboarding since we have specific ones for them, but if there's leftover basic gray boxes:
  content = content.replace(/className="([^"]*)rounded bg-zinc-50 px-3 py-2([^"]*)"/g, 'className="$1 border-l-2 border-zinc-200 pl-3 py-1 $2"');

  if (content !== original) {
    fs.writeFileSync(file, content);
  }
}

console.log('Flattened platform-wide cards!');
