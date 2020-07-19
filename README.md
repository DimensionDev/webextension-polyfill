# webextension-shim

## Prebuilt

This shim will run a compiler in runtime. It is slow when transforming big files. To speed up, prebuilt your JS files so it won't go through the compiler in runtime.

```bash
# web-ext-prebuilt [extension_id]/[runtime_path_for_your_js] [file_path_to_your_js]
web-ext-prebuilt eofkdgkhfoebecmamljfaepckoecjhib/js/index.js dist/js/index.js
```

## Prebuilt all

```bash
# web-ext-prebuilts [extension_id] [folder]
web-ext-prebuilts eofkdgkhfoebecmamljfaepckoecjhib dist
```
