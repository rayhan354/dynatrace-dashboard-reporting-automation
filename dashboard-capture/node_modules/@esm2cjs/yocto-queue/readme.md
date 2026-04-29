# @esm2cjs/yocto-queue

This is a fork of https://github.com/sindresorhus/yocto-queue, but automatically patched to support ESM **and** CommonJS, unlike the original repository.

## Install

You can use an npm alias to install this package under the original name:

```
npm i yocto-queue@npm:@esm2cjs/yocto-queue
```

```jsonc
// package.json
"dependencies": {
    "yocto-queue": "npm:@esm2cjs/yocto-queue"
}
```

but `npm` might dedupe this incorrectly when other packages depend on the replaced package. If you can, prefer using the scoped package directly:

```
npm i @esm2cjs/yocto-queue
```

```jsonc
// package.json
"dependencies": {
    "@esm2cjs/yocto-queue": "^ver.si.on"
}
```

## Usage

```js
// Using ESM import syntax
import Queue from "@esm2cjs/yocto-queue";

// Using CommonJS require()
const Queue = require("@esm2cjs/yocto-queue").default;
```

> **Note:**
> Because the original module uses `export default`, you need to append `.default` to the `require()` call.

For more details, please see the original [repository](https://github.com/sindresorhus/yocto-queue).

## Sponsoring

To support my efforts in maintaining the ESM/CommonJS hybrid, please sponsor [here](https://github.com/sponsors/AlCalzone).

To support the original author of the module, please sponsor [here](https://github.com/sindresorhus/yocto-queue).
