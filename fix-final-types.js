const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// The error is: Type '"NOW" | "SOON" | "LATER" | undefined' is not assignable to type '"NOW" | "NEXT" | "MONITOR" | undefined'.

const wrongTypeRegex = /triageUrgencyFilter as "NOW" \| "SOON" \| "LATER" \| ""/g;
content = content.replace(wrongTypeRegex, `triageUrgencyFilter as "NOW" | "NEXT" | "MONITOR" | ""`);

fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);

console.log("Fixed typings!");
