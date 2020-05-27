# webextension-shim

## Prebuilt

This shim will run a compiler in runtime. It is slow when transforming big files. To speed up, prebuilt your JS files so it won't go through the compiler in runtime.

> ts-node -T src/bin/prebuilt.ts extensionID/runtime_path_for_your_js file_path_to_your_js

e.g.: `ts-node -T src/bin/prebuilt.ts eofkdgkhfoebecmamljfaepckoecjhib/js/index.js dist/js/index.js`

## Prebuilt all

> ts-node -T src/bin/prebuilts.ts extension_id ./folder
