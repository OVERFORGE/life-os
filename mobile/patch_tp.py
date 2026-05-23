import os

file_path = os.path.join("node_modules", "react-native-track-player", "android", "src", "main", "java", "com", "doublesymmetry", "trackplayer", "module", "MusicModule.kt")

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

chunks = content.split("\n    @ReactMethod\n")

new_chunks = []
for i, chunk in enumerate(chunks):
    # Fix the `= scope.launch {`
    if ") = scope.launch {" in chunk:
        chunk = chunk.replace(") = scope.launch {", ") { scope.launch {")
        if i == len(chunks) - 1:
            # Last chunk has the class closing brace `\n}` at the end
            chunk = chunk.rstrip()
            if chunk.endswith("}"):
                chunk = chunk[:-1] + "    }\n}"
        else:
            # Append the closing brace for the method
            chunk = chunk.rstrip() + "\n    }\n"
    elif ") =\n        scope.launch {" in chunk:
        chunk = chunk.replace(") =\n        scope.launch {", ") {\n        scope.launch {")
        if i == len(chunks) - 1:
            chunk = chunk.rstrip()
            if chunk.endswith("}"):
                chunk = chunk[:-1] + "    }\n}"
        else:
            chunk = chunk.rstrip() + "\n    }\n"
    
    new_chunks.append(chunk)

new_content = "\n    @ReactMethod\n".join(new_chunks)

# Fix the originalItem nullability issue for Arguments.fromBundle
new_content = new_content.replace("musicService.tracks[index].originalItem)", "musicService.tracks[index].originalItem ?: Bundle())")
new_content = new_content.replace("musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )", "musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle()\n            )")
new_content = new_content.replace("musicService.tracks.map { it.originalItem }", "musicService.tracks.map { it.originalItem ?: Bundle() }")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Successfully patched MusicModule.kt")
