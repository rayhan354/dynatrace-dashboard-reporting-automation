var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateWrapper = (obj, member, setter, getter) => {
  return {
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  };
};
var esm_exports = {};
__export(esm_exports, {
  default: () => Queue
});
module.exports = __toCommonJS(esm_exports);
var _head, _tail, _size;
class Node {
  value;
  next;
  constructor(value) {
    this.value = value;
  }
}
class Queue {
  constructor() {
    __privateAdd(this, _head, void 0);
    __privateAdd(this, _tail, void 0);
    __privateAdd(this, _size, void 0);
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (__privateGet(this, _head)) {
      __privateGet(this, _tail).next = node;
      __privateSet(this, _tail, node);
    } else {
      __privateSet(this, _head, node);
      __privateSet(this, _tail, node);
    }
    __privateWrapper(this, _size)._++;
  }
  dequeue() {
    const current = __privateGet(this, _head);
    if (!current) {
      return;
    }
    __privateSet(this, _head, __privateGet(this, _head).next);
    __privateWrapper(this, _size)._--;
    return current.value;
  }
  clear() {
    __privateSet(this, _head, void 0);
    __privateSet(this, _tail, void 0);
    __privateSet(this, _size, 0);
  }
  get size() {
    return __privateGet(this, _size);
  }
  *[Symbol.iterator]() {
    let current = __privateGet(this, _head);
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
}
_head = new WeakMap();
_tail = new WeakMap();
_size = new WeakMap();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
//# sourceMappingURL=index.js.map
