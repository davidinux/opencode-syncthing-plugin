#!/bin/bash
# Convert .ts files to .cts (CommonJS)
for file in src/*.ts; do
  cjs_file="${file%.ts}.cts"
  cp "$file" "$cjs_file"
done

# Update package.json
sed -i 's/"type": "module"/"main": "dist/index.cjs"/' package.json
sed -i '/"exports":/,/^  }/d' package.json
sed -i 's/"main": "dist\/index.js"/"main": "dist\/index.cjs"/' package.json

# Update tsconfig.json
sed -i 's/"module": "Node16"/"module": "commonjs"/' tsconfig.json
sed -i 's/"moduleResolution": "node16"/"moduleResolution": "node"/' tsconfig.json

echo "Converted to CommonJS structure"
