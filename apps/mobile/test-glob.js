const fg = require('fast-glob');
const micromatch = require('micromatch');

const path = 'app/(dashboard)/index.tsx';

console.log("fast-glob './app/**/*.tsx':", fg.sync(['./app/**/*.tsx']));
console.log("fast-glob './app/**/*.{js,jsx,ts,tsx}':", fg.sync(['./app/**/*.{js,jsx,ts,tsx}']));

console.log("micromatch './app/**/*.tsx':", micromatch.isMatch(path, './app/**/*.tsx'));
console.log("micromatch './app/**/*.{js,jsx,ts,tsx}':", micromatch.isMatch(path, './app/**/*.{js,jsx,ts,tsx}'));
