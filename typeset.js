/**
 * typeset.js — global typography normalization
 * 
 * Enforces the new type scale across all TSX components:
 * 
 * Font roles:
 *   font-display = Fraunces (headings only — h1/h2/h3, metric heroes)
 *   font-sans    = DM Sans  (all body, UI text, labels)
 *   font-mono    = JetBrains Mono (kickers, codes, data, status badges)
 * 
 * Size normalization (Tailwind → type-scale):
 *   arbitrary px sizes → nearest rem scale step
 *   text-xs → fine (10px)
 *   text-sm → 0.8rem (13px)
 *   text-base → 1rem (16px) 
 *   text-lg → 1.125rem (subheads)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/**/*.tsx', { cwd: __dirname });

const skipPatterns = ['components/ui/', 'components/providers.tsx'];

// Typography rules
const rules = [
  // ── Kickers / mono labels: normalize to consistent [10px] + mono ──
  // Any "[10px]" or "[11px]" labels that are already mono-text, keep them, just ensure consistency
  // Replace any non-mono kicker patterns (font-semibold uppercase tracking) with quoin-kicker
  
  // ── Weight normalization: clarify roles ──
  // "font-display" applied to text that's not a heading — strip it, these should be font-sans
  { from: /\bfont-display\b(?=[^"]*text-\[10px\])/g, to: 'font-mono' },
  { from: /\bfont-display\b(?=[^"]*text-\[11px\])/g, to: 'font-mono' },
  { from: /\bfont-display\b(?=[^"]*text-xs\b)/g, to: 'font-mono' },
  { from: /\bfont-display\b(?=[^"]*text-sm\b)/g, to: 'font-sans' },

  // ── Fix metric values to use font-display (these are the hero numbers) ──
  // quoin-metric-value already uses font-display via CSS — skip those
  
  // ── Arbitrary size cleanup: collapse tiny pixel tweaks to scale ──
  // These are spray-painted sizes that don't conform to any scale
  { from: /text-\[13px\]/g, to: 'text-sm' },       // 13px → 12.8px (close enough)
  { from: /text-\[14px\]/g, to: 'text-sm' },        // 14px → text-sm
  { from: /text-\[15px\]/g, to: 'text-base' },      // 15px → 16px
  { from: /text-\[17px\]/g, to: 'text-base' },      // 17px → 16px
  { from: /text-\[18px\]/g, to: 'text-lg' },        // 18px → 18px ✓
  { from: /text-\[20px\]/g, to: 'text-xl' },        // 20px → 20px ✓
  { from: /text-\[22px\]/g, to: 'text-2xl' },       // 22px → text-2xl
  { from: /text-\[24px\]/g, to: 'text-2xl' },       // 24px → text-2xl
  { from: /text-\[28px\]/g, to: 'text-3xl' },       // 28px → text-3xl
  { from: /text-\[30px\]/g, to: 'text-3xl' },       // 30px → text-3xl
  { from: /text-\[32px\]/g, to: 'text-4xl' },       // 32px → text-4xl

  // ── Page heading sizes from Tailwind names to scale ──
  { from: /\btext-5xl\b/g, to: 'text-4xl' },        // Too large for institutional; tone down
  { from: /\btext-6xl\b/g, to: 'text-4xl' },
  { from: /\btext-7xl\b/g, to: 'text-4xl' },

  // ── Heading sizes via Tailwind ──
  { from: /\btext-4xl\b(?=[^"]*font-display)/g, to: 'text-3xl' },  // h1-level → 2.441rem
  { from: /\btext-3xl\b(?=[^"]*font-display)/g, to: 'text-2xl' },  // h2-level → 1.953rem
  { from: /\btext-2xl\b(?=[^"]*font-display)/g, to: 'text-xl' },   // h3-level → 1.563rem

  // ── Inline style font fixes: replace old IBM Plex references ──
  { from: /IBM Plex Sans/g, to: 'DM Sans' },
  { from: /IBM Plex Serif/g, to: 'Fraunces' },
  { from: /IBM Plex Mono/g, to: 'JetBrains Mono' },
];

let totalChanged = 0;
const changedFiles = [];

for (const file of files) {
  if (skipPatterns.some(p => file.includes(p))) continue;
  
  const fullPath = path.join(__dirname, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  for (const rule of rules) {
    content = content.replace(rule.from, rule.to);
  }

  // Normalize whitespace in className strings
  content = content.replace(/className="([^"]*)"/g, (match, inner) => {
    const clean = inner.replace(/\s{2,}/g, ' ').trim();
    return `className="${clean}"`;
  });

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    changedFiles.push(file);
    totalChanged++;
  }
}

console.log(`\n✓ Typeset complete — ${totalChanged} files updated\n`);
changedFiles.forEach(f => console.log(`  - ${f}`));
