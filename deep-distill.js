/**
 * deep-distill.js — Phase 1+2+3+4 across all user-facing pages
 * 
 * Patterns to eliminate:
 * - rounded-2xl / rounded-xl / rounded-lg with bg-white + shadow/border combos (nested cards)
 * - backdrop-blur / bg-white/80 / bg-zinc-50/80 (glassmorphism remnants)
 * - blue color classes (blue-*, sky-*, indigo-*) → replace with zinc equivalents
 * - px-5 py-5 on standalone divs that are card-like with border
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/**/*.tsx', { cwd: __dirname });

const rules = [
  // Phase 2 — Quieter: remove backdrop blur / glass effects
  { from: /backdrop-blur[-\w]*/g, to: '' },
  { from: /bg-white\/\d+/g, to: 'bg-white' },
  { from: /bg-zinc-50\/\d+/g, to: 'bg-zinc-50' },
  { from: /bg-zinc-100\/\d+/g, to: 'bg-zinc-100' },
  
  // Phase 1 — Distill: remove shadow-* from card-like elements
  { from: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g, to: '' },
  
  // Phase 1 — Distill: flatten rounded card combos
  // "rounded-2xl border border-zinc-200 bg-white px-5 py-5" → flat
  { from: /rounded-2xl\s+border\s+border-zinc-\d+\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  { from: /rounded-2xl\s+border\s+border-zinc-\d+\/\d+\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  { from: /rounded-xl\s+border\s+border-zinc-\d+\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  { from: /rounded-xl\s+border\s+border-zinc-\d+\/\d+\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  { from: /rounded-lg\s+border\s+border-zinc-\d+\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  { from: /rounded-lg\s+border\s+border-zinc-200\/80\s+bg-white\s+/g, to: 'border border-zinc-200 ' },
  
  // Phase 1 — Remove rounded-* from non-button, non-badge elements (cards, panels)
  // Keep rounded on badges (badge-status), buttons (btn-primary), and inputs
  // Only strip purely decorative roundeds on wrappers
  { from: /(\bclassName="[^"]*)\brounded-2xl\b/g, to: '$1' },
  { from: /(\bclassName="[^"]*)\brounded-xl\b/g, to: '$1' },
  { from: /(\bclassName="[^"]*)\brounded-lg\b/g, to: '$1' },

  // Phase 3 — Normalize: blue → zinc
  { from: /\btext-blue-\d+\b/g, to: 'text-zinc-700' },
  { from: /\bbg-blue-\d+\b/g, to: 'bg-zinc-100' },
  { from: /\bborder-blue-\d+\b/g, to: 'border-zinc-300' },
  { from: /\btext-sky-\d+\b/g, to: 'text-zinc-600' },
  { from: /\bbg-sky-\d+\b/g, to: 'bg-zinc-100' },
  { from: /\btext-indigo-\d+\b/g, to: 'text-zinc-700' },
  { from: /\bbg-indigo-\d+\b/g, to: 'bg-zinc-100' },
  
  // Phase 1 — Remove excess gaps from double-spaced class strings (cleanup)
  { from: /  +/g, to: ' ' },
  { from: /" "/g, to: '" "' },
];

// Files to skip (shadcn ui components, pure config)
const skipPatterns = [
  'components/ui/',
  'components/providers.tsx',
];

let totalChanges = 0;
const changed = [];

for (const file of files) {
  const shouldSkip = skipPatterns.some(p => file.includes(p));
  if (shouldSkip) continue;

  const fullPath = path.join(__dirname, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  for (const rule of rules) {
    content = content.replace(rule.from, rule.to);
  }

  // Normalize double spaces in className strings
  content = content.replace(/className="([^"]*)"/g, (match, inner) => {
    const clean = inner.replace(/\s{2,}/g, ' ').trim();
    return `className="${clean}"`;
  });

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    changed.push(file);
    totalChanges++;
  }
}

console.log(`\n✓ Deep distill complete`);
console.log(`  ${totalChanges} files modified:\n`);
for (const f of changed) {
  console.log(`  - ${f}`);
}
