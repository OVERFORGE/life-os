const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'module', 'MusicModule.kt');

let content = fs.readFileSync(filePath, 'utf8');

let lines = content.split('\n');
let newLines = [];
let braceCount = 0;
let insideTarget = false;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // If it was already patched but missing the closing brace, we still need to fix it.
    // Or if it wasn't patched yet.
    if (line.includes('= scope.launch {')) {
        line = line.replace('= scope.launch {', '{ scope.launch {');
        insideTarget = true;
        braceCount = 0;
    } else if (line.includes('{ scope.launch {') && !line.includes('//')) {
        insideTarget = true;
        braceCount = 0;
    }

    newLines.push(line);

    if (insideTarget) {
        for (let j = 0; j < line.length; j++) {
            if (line[j] === '{') braceCount++;
            if (line[j] === '}') braceCount--;
        }

        // The outer function adds 1 to braceCount, and scope.launch adds another 1.
        // When we hit the end of scope.launch, braceCount will drop to 1.
        // And the line is exactly "    }"
        if (braceCount === 1 && line.trim() === '}') {
            newLines.push('    }'); // Close the outer function
            insideTarget = false;
        }
    }
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Successfully fully patched MusicModule.kt');
