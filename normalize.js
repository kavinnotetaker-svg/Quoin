const fs = require('fs');

function normalizeAlerts() {
  const file = 'src/components/building/alerts-tab.tsx';
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Replace blue colors with semantic zinc/info variants in alerts-tab
  content = content.replace(/LOW: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", label: "Low" }/g, 'LOW: { color: "text-zinc-600", bg: "bg-zinc-100", border: "border-zinc-200", label: "Low" }');
  content = content.replace(/accent="text-blue-600"/g, 'accent="text-zinc-600"');
  content = content.replace(/text-blue-800/g, 'text-zinc-700');
  content = content.replace(/text-blue-900/g, 'text-zinc-900');
  content = content.replace(/border-blue-100\/50/g, 'border-zinc-200');

  fs.writeFileSync(file, content);
}

function normalizeEnergy() {
  const file = 'src/components/building/energy-tab.tsx';
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Normalize hover states
  content = content.replace(/text-blue-600 hover:text-blue-800/g, 'text-zinc-600 hover:text-zinc-900');

  fs.writeFileSync(file, content);
}

normalizeAlerts();
normalizeEnergy();
console.log('Normalized colors in alerts and energy tabs!');
