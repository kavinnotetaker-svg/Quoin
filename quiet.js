const fs = require('fs');
const files = [
  'src/app/page.tsx',
  'src/app/(onboarding)/layout.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/layout/sidebar.tsx',
  'src/components/building/energy-tab.tsx',
  'src/components/building/alerts-tab.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Strip backdrop blurs
  content = content.replace(/backdrop-blur-[a-z0-9]+|supports-backdrop-filter:backdrop-blur-[a-z0-9]+/g, '');
  
  // Strip standard blurs
  content = content.replace(/blur-\b\w+\b/g, '');

  // Make translucent backgrounds opaque for headers
  content = content.replace(/bg-white\/(70|80|50|60)/g, 'bg-white');

  // Darken modal backdrops now that blur is gone
  content = content.replace(/bg-black\/10/g, 'bg-black/40');
  content = content.replace(/bg-zinc-900\/20/g, 'bg-zinc-900/40');

  // Remove the decorative glowing orb in page.tsx entirely
  content = content.replace(/<div className="w-\[1000px\] h-\[500px\] bg-gradient-to-b from-zinc-200\/50 to-transparent opacity-50 rounded-full -tranzinc-y-1\/2" \/>/g, '');

  // Cleanup extra spaces
  content = content.replace(/  +/g, ' ');

  fs.writeFileSync(file, content);
}

console.log('Removed glassmorphism and quieted the platform!');
